"""Webhook Models"""

from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, Boolean, JSON, BigInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, Optional, Dict, Any
import enum

from db.base import Base


class WebhookPlatform(str, enum.Enum):
    """Webhook platform type"""
    GITHUB = "github"
    GITLAB = "gitlab"
    CODECOMMIT = "codecommit"


class WebhookConfig(Base):
    """Webhook configuration model"""
    
    __tablename__ = "webhook_configs"
    
    # Primary key
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    
    # Platform info
    platform: Mapped[WebhookPlatform] = mapped_column(
        String(50),
        nullable=False,
        index=True
    )
    
    # Webhook URL and security
    webhook_url: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    secret_token: Mapped[str] = mapped_column(String(255), nullable=False)  # 用于验证请求
    
    # Events to listen
    events: Mapped[List[str]] = mapped_column(JSON, nullable=False)  # ['pull_request', 'push']
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Auto scan configuration
    auto_scan_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    auto_comment_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )
    last_triggered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Foreign keys
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        unique=True  # 一个项目只能有一个 webhook 配置
    )
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="webhook_config")
    logs: Mapped[List["WebhookLog"]] = relationship(
        "WebhookLog",
        back_populates="webhook",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<WebhookConfig(id={self.id}, platform={self.platform}, project_id={self.project_id})>"


class WebhookLog(Base):
    """Webhook event log model"""
    
    __tablename__ = "webhook_logs"
    
    # Primary key
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    
    # Event info
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    event_action: Mapped[str] = mapped_column(String(100), nullable=True)  # opened, closed, synchronized
    
    # Payload (store full webhook payload for debugging)
    payload: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    
    # Response status
    response_status: Mapped[int] = mapped_column(Integer, nullable=True)  # HTTP status code
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    
    # Processing info
    task_id: Mapped[str] = mapped_column(String(255), nullable=True)  # Celery task ID
    processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        index=True
    )
    
    # Foreign keys
    webhook_id: Mapped[int] = mapped_column(
        ForeignKey("webhook_configs.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Relationships
    webhook: Mapped["WebhookConfig"] = relationship("WebhookConfig", back_populates="logs")
    
    def __repr__(self) -> str:
        return f"<WebhookLog(id={self.id}, event_type={self.event_type}, webhook_id={self.webhook_id})>"


class PRComment(Base):
    """PR comment tracking model (to avoid duplicate comments)"""
    
    __tablename__ = "pr_comments"
    
    # Primary key
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    
    # Comment info
    comment_id: Mapped[int] = mapped_column(BigInteger, nullable=False)  # GitHub/GitLab comment ID
    comment_type: Mapped[str] = mapped_column(String(50), nullable=False)  # inline, general, review
    comment_url: Mapped[str] = mapped_column(String(500), nullable=True)
    
    # Content
    body: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Status
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )
    
    # Foreign keys
    pull_request_id: Mapped[int] = mapped_column(
        ForeignKey("pull_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    audit_issue_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("audit_issues.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    
    # Relationships
    pull_request: Mapped["PullRequest"] = relationship("PullRequest", back_populates="comments")
    audit_issue: Mapped[Optional["AuditIssue"]] = relationship("AuditIssue")
    
    def __repr__(self) -> str:
        return f"<PRComment(id={self.id}, pr_id={self.pull_request_id}, type={self.comment_type})>"

