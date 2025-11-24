"""Webhook API Endpoints"""

from fastapi import APIRouter, Depends, Request, Header, HTTPException, status, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional, Dict, Any
from loguru import logger
from datetime import datetime

from db.session import get_db
from models.user import User
from models.webhook import WebhookConfig, WebhookLog, WebhookPlatform
from models.project import Project
from api.dependencies import get_current_user
from services.webhook.webhook_security import webhook_security
from services.webhook.webhook_handler import webhook_handler
from core.exceptions import ValidationError
from pydantic import BaseModel


router = APIRouter()


# ==================== Request/Response Models ====================

class WebhookConfigCreate(BaseModel):
    """Webhook configuration creation model"""
    project_id: int
    platform: str  # github, gitlab, codecommit
    events: List[str] = ["pull_request"]
    auto_scan_enabled: bool = True
    auto_comment_enabled: bool = True


class WebhookConfigResponse(BaseModel):
    """Webhook configuration response model"""
    id: int
    project_id: int
    platform: str
    webhook_url: str
    secret_token: str
    events: List[str]
    is_active: bool
    auto_scan_enabled: bool
    auto_comment_enabled: bool
    created_at: str
    last_triggered_at: Optional[str]
    
    class Config:
        from_attributes = True


class WebhookLogResponse(BaseModel):
    """Webhook log response model"""
    id: int
    event_type: str
    event_action: Optional[str]
    response_status: Optional[int]
    error_message: Optional[str]
    task_id: Optional[str]
    processed: bool
    created_at: str
    
    class Config:
        from_attributes = True


# ==================== Webhook Receiver Endpoints ====================

@router.post(
    "/receive/github/{project_id}/{secret}",
    summary="Receive GitHub webhook",
    description="Endpoint for receiving GitHub webhook events",
    include_in_schema=False  # Hide from public API docs
)
async def receive_github_webhook(
    project_id: int,
    secret: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_hub_signature_256: Optional[str] = Header(None),
    x_github_event: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Receive and process GitHub webhook events
    """
    try:
        # Get request body
        body = await request.body()
        payload = await request.json()
        
        # Get webhook config
        result = await db.execute(
            select(WebhookConfig).where(
                WebhookConfig.project_id == project_id,
                WebhookConfig.secret_token == secret,
                WebhookConfig.platform == "github"
            )
        )
        webhook_config = result.scalar_one_or_none()
        
        if not webhook_config:
            logger.warning(f"Webhook config not found for project {project_id}")
            raise HTTPException(status_code=404, detail="Webhook not found")
        
        # Verify signature
        try:
            webhook_security.verify_github_signature(
                body,
                x_hub_signature_256,
                webhook_config.secret_token
            )
        except ValidationError as e:
            logger.error(f"GitHub webhook signature verification failed: {e}")
            raise HTTPException(status_code=401, detail="Invalid signature")
        
        # Log webhook event
        webhook_log = WebhookLog(
            webhook_id=webhook_config.id,
            event_type=x_github_event or "unknown",
            event_action=payload.get('action'),
            payload=payload,
            response_status=200,
            processed=False
        )
        db.add(webhook_log)
        await db.commit()
        
        # Process webhook in background
        background_tasks.add_task(
            process_webhook_event,
            webhook_config.id,
            webhook_log.id,
            payload,
            "github",
            db
        )
        
        # Update last triggered time
        webhook_config.last_triggered_at = datetime.utcnow()
        await db.commit()
        
        return JSONResponse(
            status_code=200,
            content={"status": "received", "event": x_github_event}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing GitHub webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/receive/gitlab/{project_id}/{secret}",
    summary="Receive GitLab webhook",
    description="Endpoint for receiving GitLab webhook events",
    include_in_schema=False
)
async def receive_gitlab_webhook(
    project_id: int,
    secret: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_gitlab_token: Optional[str] = Header(None),
    x_gitlab_event: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Receive and process GitLab webhook events
    """
    try:
        payload = await request.json()
        
        # Get webhook config
        result = await db.execute(
            select(WebhookConfig).where(
                WebhookConfig.project_id == project_id,
                WebhookConfig.secret_token == secret,
                WebhookConfig.platform == "gitlab"
            )
        )
        webhook_config = result.scalar_one_or_none()
        
        if not webhook_config:
            raise HTTPException(status_code=404, detail="Webhook not found")
        
        # Verify token
        try:
            webhook_security.verify_gitlab_token(
                x_gitlab_token,
                webhook_config.secret_token
            )
        except ValidationError as e:
            logger.error(f"GitLab webhook token verification failed: {e}")
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Log webhook event
        webhook_log = WebhookLog(
            webhook_id=webhook_config.id,
            event_type=x_gitlab_event or "unknown",
            event_action=payload.get('object_attributes', {}).get('action'),
            payload=payload,
            response_status=200,
            processed=False
        )
        db.add(webhook_log)
        await db.commit()
        
        # Process webhook in background
        background_tasks.add_task(
            process_webhook_event,
            webhook_config.id,
            webhook_log.id,
            payload,
            "gitlab",
            db
        )
        
        webhook_config.last_triggered_at = datetime.utcnow()
        await db.commit()
        
        return JSONResponse(
            status_code=200,
            content={"status": "received", "event": x_gitlab_event}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing GitLab webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def process_webhook_event(
    webhook_id: int,
    log_id: int,
    payload: Dict[str, Any],
    platform: str,
    db: AsyncSession
):
    """Background task to process webhook event"""
    try:
        if platform == "github":
            task_id = await webhook_handler.process_github_webhook(
                payload,
                db,
                webhook_id
            )
        elif platform == "gitlab":
            task_id = await webhook_handler.process_gitlab_webhook(
                payload,
                db,
                webhook_id
            )
        else:
            task_id = None
        
        # Update log
        result = await db.execute(
            select(WebhookLog).where(WebhookLog.id == log_id)
        )
        log = result.scalar_one_or_none()
        if log:
            log.processed = True
            log.task_id = task_id
            await db.commit()
            
    except Exception as e:
        logger.error(f"Error processing webhook event: {e}")
        # Update log with error
        result = await db.execute(
            select(WebhookLog).where(WebhookLog.id == log_id)
        )
        log = result.scalar_one_or_none()
        if log:
            log.error_message = str(e)
            log.response_status = 500
            await db.commit()


# ==================== Webhook Management Endpoints ====================

@router.post(
    "/configs",
    response_model=WebhookConfigResponse,
    summary="Create webhook configuration",
    description="Create a new webhook configuration for a project"
)
async def create_webhook_config(
    config: WebhookConfigCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create webhook configuration"""
    import secrets
    
    # Check if project exists and user has access
    result = await db.execute(
        select(Project).where(Project.id == config.project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No permission")
    
    # Check if webhook config already exists
    result = await db.execute(
        select(WebhookConfig).where(WebhookConfig.project_id == config.project_id)
    )
    existing_config = result.scalar_one_or_none()
    
    if existing_config:
        raise HTTPException(status_code=400, detail="Webhook config already exists for this project")
    
    # Generate secret token
    secret_token = secrets.token_urlsafe(32)
    
    # Generate webhook URL
    from app.config import settings
    webhook_url = f"{settings.API_BASE_URL}/api/v1/webhooks/receive/{config.platform}/{config.project_id}/{secret_token}"
    
    # Create webhook config
    webhook_config = WebhookConfig(
        project_id=config.project_id,
        platform=config.platform,
        webhook_url=webhook_url,
        secret_token=secret_token,
        events=config.events,
        auto_scan_enabled=config.auto_scan_enabled,
        auto_comment_enabled=config.auto_comment_enabled
    )
    
    db.add(webhook_config)
    await db.commit()
    await db.refresh(webhook_config)
    
    return webhook_config


@router.get(
    "/configs/project/{project_id}",
    response_model=Optional[WebhookConfigResponse],
    summary="Get webhook configuration",
    description="Get webhook configuration for a project"
)
async def get_webhook_config(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get webhook configuration"""
    # Check project access
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get webhook config
    result = await db.execute(
        select(WebhookConfig).where(WebhookConfig.project_id == project_id)
    )
    config = result.scalar_one_or_none()
    
    return config


@router.delete(
    "/configs/{config_id}",
    summary="Delete webhook configuration",
    description="Delete a webhook configuration"
)
async def delete_webhook_config(
    config_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete webhook configuration"""
    result = await db.execute(
        select(WebhookConfig).where(WebhookConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(status_code=404, detail="Webhook config not found")
    
    # Check project ownership
    result = await db.execute(
        select(Project).where(Project.id == config.project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No permission")
    
    await db.delete(config)
    await db.commit()
    
    return {"status": "deleted"}


@router.get(
    "/logs/{webhook_id}",
    response_model=List[WebhookLogResponse],
    summary="Get webhook logs",
    description="Get webhook event logs"
)
async def get_webhook_logs(
    webhook_id: int,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get webhook logs"""
    # Check webhook access
    result = await db.execute(
        select(WebhookConfig).where(WebhookConfig.id == webhook_id)
    )
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(status_code=404, detail="Webhook not found")
    
    # Check project ownership
    result = await db.execute(
        select(Project).where(Project.id == config.project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No permission")
    
    # Get logs
    result = await db.execute(
        select(WebhookLog)
        .where(WebhookLog.webhook_id == webhook_id)
        .order_by(WebhookLog.created_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()
    
    return logs

