"""Pull Request API Endpoints"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from loguru import logger
from datetime import datetime

from db.session import get_db
from models.user import User
from models.pull_request import PullRequest, PRStatus
from models.project import Project
from api.dependencies import get_current_user
from pydantic import BaseModel


router = APIRouter()


# ==================== Response Models ====================

class PRResponse(BaseModel):
    """Pull request response model"""
    id: int
    project_id: int
    pr_number: int
    pr_url: Optional[str]
    title: str
    description: Optional[str]
    author: Optional[str]
    author_avatar: Optional[str]
    source_branch: str
    target_branch: str
    status: str
    changed_files_count: int
    additions: int
    deletions: int
    commits_count: int
    created_at: str
    updated_at: str
    merged_at: Optional[str]
    closed_at: Optional[str]
    
    class Config:
        from_attributes = True


class PRListResponse(BaseModel):
    """PR list response"""
    items: List[PRResponse]
    total: int
    page: int
    page_size: int


# ==================== PR Endpoints ====================

@router.get(
    "",
    response_model=PRListResponse,
    summary="List pull requests",
    description="Get a paginated list of pull requests for a project"
)
async def list_pull_requests(
    project_id: int = Query(..., description="Project ID"),
    status: Optional[str] = Query(None, description="Filter by status (open, closed, merged)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List pull requests for a project"""
    # Check project access
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No permission")
    
    # Build query
    query = select(PullRequest).where(PullRequest.project_id == project_id)
    
    # Apply status filter
    if status:
        status_enum = PRStatus(status.upper())
        query = query.where(PullRequest.status == status_enum)
    
    # Get total count
    count_query = select(func.count()).select_from(PullRequest).where(PullRequest.project_id == project_id)
    if status:
        count_query = count_query.where(PullRequest.status == status_enum)
    
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Apply pagination
    query = query.order_by(PullRequest.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    # Execute query
    result = await db.execute(query)
    prs = result.scalars().all()
    
    return PRListResponse(
        items=prs,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get(
    "/{pr_id}",
    response_model=PRResponse,
    summary="Get pull request",
    description="Get details of a specific pull request"
)
async def get_pull_request(
    pr_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get pull request details"""
    result = await db.execute(
        select(PullRequest).where(PullRequest.id == pr_id)
    )
    pr = result.scalar_one_or_none()
    
    if not pr:
        raise HTTPException(status_code=404, detail="Pull request not found")
    
    # Check project access
    result = await db.execute(
        select(Project).where(Project.id == pr.project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No permission")
    
    return pr


@router.post(
    "/import",
    response_model=PRResponse,
    summary="Import pull request",
    description="Manually import a pull request from repository"
)
async def import_pull_request(
    project_id: int = Query(..., description="Project ID"),
    pr_number: int = Query(..., description="PR number"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Manually import a pull request"""
    # Check project access
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found or no permission")
    
    # Fetch PR info from repository
    from services.repository.pr_diff_service import pr_diff_service
    
    try:
        pr_info = await pr_diff_service.fetch_pr_info(
            project.source_type,
            project.source_url,
            pr_number
        )
    except Exception as e:
        logger.error(f"Error fetching PR info: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to fetch PR: {str(e)}")
    
    # Check if PR already exists
    result = await db.execute(
        select(PullRequest).where(
            PullRequest.project_id == project_id,
            PullRequest.pr_number == pr_number
        )
    )
    existing_pr = result.scalar_one_or_none()
    
    if existing_pr:
        # Update existing PR
        for key, value in pr_info.items():
            if hasattr(existing_pr, key):
                setattr(existing_pr, key, value)
        existing_pr.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(existing_pr)
        return existing_pr
    
    # Create new PR
    pr = PullRequest(
        project_id=project_id,
        **pr_info
    )
    db.add(pr)
    await db.commit()
    await db.refresh(pr)
    
    return pr


@router.post(
    "/{pr_id}/scan",
    summary="Trigger PR scan",
    description="Trigger a code scan for a pull request"
)
async def trigger_pr_scan(
    pr_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Trigger PR scan"""
    # Get PR
    result = await db.execute(
        select(PullRequest).where(PullRequest.id == pr_id)
    )
    pr = result.scalar_one_or_none()
    
    if not pr:
        raise HTTPException(status_code=404, detail="Pull request not found")
    
    # Check project access
    result = await db.execute(
        select(Project).where(Project.id == pr.project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No permission")
    
    # Trigger scan task
    from tasks.pr_scan_tasks import scan_pull_request_task
    
    task = scan_pull_request_task.delay(
        project_id=project.id,
        pr_number=pr.pr_number
    )
    
    return {
        "status": "scan_started",
        "task_id": task.id,
        "pr_id": pr.id,
        "pr_number": pr.pr_number
    }

