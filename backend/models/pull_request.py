"""Pull Request Model"""

from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, Enum as SQLEnum, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, Optional, Dict, Any
import enum

from db.base import Base


class PRStatus(str, enum.Enum):
    """Pull request status"""
    OPEN = "open"
    CLOSED = "closed"
    MERGED = "merged"


class PullRequest(Base):
    """Pull request model for tracking PRs from GitHub/GitLab/CodeCommit"""
    
    __tablename__ = "pull_requests"
    
    # Primary key
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    
    # PR basic info
    pr_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    pr_url: Mapped[str] = mapped_column(String(500), nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    
    # Author info
    author: Mapped[str] = mapped_column(String(255), nullable=True)
    author_avatar: Mapped[str] = mapped_column(String(500), nullable=True)
    
    # Branch info
    source_branch: Mapped[str] = mapped_column(String(100), nullable=False)
    target_branch: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # Status
    status: Mapped[PRStatus] = mapped_column(
        SQLEnum(PRStatus),
        default=PRStatus.OPEN,
        nullable=False,
        index=True
    )
    
    # Statistics
    changed_files_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    additions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deletions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    commits_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Changed files detail (JSON array)
    changed_files: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSON, nullable=True)
    
    # Metadata
    pr_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )
    merged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Foreign keys
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="pull_requests")
    audit_tasks: Mapped[List["AuditTask"]] = relationship(
        "AuditTask",
        back_populates="pull_request",
        cascade="all, delete-orphan"
    )
    comments: Mapped[List["PRComment"]] = relationship(
        "PRComment",
        back_populates="pull_request",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<PullRequest(id={self.id}, pr_number={self.pr_number}, title={self.title})>"
    
    @property
    def is_open(self) -> bool:
        """Check if PR is open"""
        return self.status == PRStatus.OPEN
    
    @property
    def is_merged(self) -> bool:
        """Check if PR is merged"""
        return self.status == PRStatus.MERGED

