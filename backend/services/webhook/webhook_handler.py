"""Webhook Event Handler
Processes webhook events from GitHub, GitLab, CodeCommit
"""
from typing import Dict, Any, Optional
from loguru import logger
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.webhook import WebhookConfig, WebhookLog, WebhookPlatform
from models.pull_request import PullRequest, PRStatus
from models.project import Project, ProjectSource
from services.webhook.webhook_security import webhook_security
from services.repository.pr_diff_service import pr_diff_service
from core.exceptions import ValidationError, RepositoryError


class WebhookHandler:
    """Handles webhook events and creates PR scan tasks"""
    
    async def process_github_webhook(
        self,
        payload: Dict[str, Any],
        db: AsyncSession,
        webhook_id: int
    ) -> Optional[str]:
        """
        Process GitHub webhook event
        
        Args:
            payload: Webhook payload
            db: Database session
            webhook_id: Webhook configuration ID
            
        Returns:
            Task ID if scan was triggered, None otherwise
        """
        event_action = payload.get('action')
        
        # Only process PR events
        if 'pull_request' not in payload:
            logger.info(f"Ignoring non-PR event: {event_action}")
            return None
        
        pr_data = payload['pull_request']
        pr_number = pr_data['number']
        
        # Get webhook config to find project
        result = await db.execute(
            select(WebhookConfig).where(WebhookConfig.id == webhook_id)
        )
        webhook_config = result.scalar_one_or_none()
        
        if not webhook_config or not webhook_config.is_active:
            logger.warning(f"Webhook {webhook_id} not found or inactive")
            return None
        
        project_id = webhook_config.project_id
        
        # Get project
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            logger.error(f"Project {project_id} not found")
            return None
        
        # Handle different PR actions
        if event_action in ['opened', 'reopened', 'synchronize']:
            # Create or update PR record
            await self._upsert_github_pr(db, project, pr_data)
            
            # Trigger scan if auto-scan is enabled
            if webhook_config.auto_scan_enabled:
                task_id = await self._trigger_pr_scan(
                    db,
                    project,
                    pr_number,
                    event_action
                )
                return task_id
        
        elif event_action == 'closed':
            # Update PR status
            await self._update_pr_status(
                db,
                project_id,
                pr_number,
                PRStatus.MERGED if pr_data.get('merged') else PRStatus.CLOSED
            )
        
        return None
    
    async def process_gitlab_webhook(
        self,
        payload: Dict[str, Any],
        db: AsyncSession,
        webhook_id: int
    ) -> Optional[str]:
        """
        Process GitLab webhook event
        
        Args:
            payload: Webhook payload
            db: Database session
            webhook_id: Webhook configuration ID
            
        Returns:
            Task ID if scan was triggered, None otherwise
        """
        object_kind = payload.get('object_kind')
        
        if object_kind != 'merge_request':
            logger.info(f"Ignoring non-MR event: {object_kind}")
            return None
        
        mr_data = payload['object_attributes']
        mr_number = mr_data['iid']
        event_action = mr_data['action']
        
        # Get webhook config
        result = await db.execute(
            select(WebhookConfig).where(WebhookConfig.id == webhook_id)
        )
        webhook_config = result.scalar_one_or_none()
        
        if not webhook_config or not webhook_config.is_active:
            return None
        
        project_id = webhook_config.project_id
        
        # Get project
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            return None
        
        # Handle MR actions
        if event_action in ['open', 'reopen', 'update']:
            await self._upsert_gitlab_mr(db, project, mr_data)
            
            if webhook_config.auto_scan_enabled:
                task_id = await self._trigger_pr_scan(
                    db,
                    project,
                    mr_number,
                    event_action
                )
                return task_id
        
        elif event_action in ['close', 'merge']:
            await self._update_pr_status(
                db,
                project_id,
                mr_number,
                PRStatus.MERGED if event_action == 'merge' else PRStatus.CLOSED
            )
        
        return None
    
    # ==================== Helper Methods ====================
    
    async def _upsert_github_pr(
        self,
        db: AsyncSession,
        project: Project,
        pr_data: Dict[str, Any]
    ) -> PullRequest:
        """Create or update GitHub PR record"""
        pr_number = pr_data['number']
        
        # Check if PR exists
        result = await db.execute(
            select(PullRequest).where(
                PullRequest.project_id == project.id,
                PullRequest.pr_number == pr_number
            )
        )
        pr = result.scalar_one_or_none()
        
        # Prepare PR data
        pr_info = {
            'pr_number': pr_number,
            'title': pr_data['title'],
            'description': pr_data.get('body', ''),
            'author': pr_data['user']['login'],
            'author_avatar': pr_data['user']['avatar_url'],
            'source_branch': pr_data['head']['ref'],
            'target_branch': pr_data['base']['ref'],
            'pr_url': pr_data['html_url'],
            'changed_files_count': pr_data.get('changed_files', 0),
            'additions': pr_data.get('additions', 0),
            'deletions': pr_data.get('deletions', 0),
            'commits_count': pr_data.get('commits', 0),
            'status': PRStatus.MERGED if pr_data.get('merged') else (
                PRStatus.CLOSED if pr_data['state'] == 'closed' else PRStatus.OPEN
            ),
            'pr_metadata': {
                'state': pr_data['state'],
                'draft': pr_data.get('draft', False),
                'mergeable': pr_data.get('mergeable'),
            }
        }
        
        if pr:
            # Update existing PR
            for key, value in pr_info.items():
                setattr(pr, key, value)
            pr.updated_at = datetime.utcnow()
        else:
            # Create new PR
            pr = PullRequest(
                project_id=project.id,
                **pr_info
            )
            db.add(pr)
        
        await db.commit()
        await db.refresh(pr)
        return pr
    
    async def _upsert_gitlab_mr(
        self,
        db: AsyncSession,
        project: Project,
        mr_data: Dict[str, Any]
    ) -> PullRequest:
        """Create or update GitLab MR record"""
        mr_number = mr_data['iid']
        
        result = await db.execute(
            select(PullRequest).where(
                PullRequest.project_id == project.id,
                PullRequest.pr_number == mr_number
            )
        )
        pr = result.scalar_one_or_none()
        
        pr_info = {
            'pr_number': mr_number,
            'title': mr_data['title'],
            'description': mr_data.get('description', ''),
            'author': mr_data['author']['username'] if 'author' in mr_data else 'unknown',
            'source_branch': mr_data['source_branch'],
            'target_branch': mr_data['target_branch'],
            'pr_url': mr_data.get('url', ''),
            'status': PRStatus.OPEN if mr_data['state'] == 'opened' else (
                PRStatus.MERGED if mr_data['state'] == 'merged' else PRStatus.CLOSED
            ),
            'pr_metadata': {
                'state': mr_data['state'],
                'work_in_progress': mr_data.get('work_in_progress', False),
            }
        }
        
        if pr:
            for key, value in pr_info.items():
                setattr(pr, key, value)
            pr.updated_at = datetime.utcnow()
        else:
            pr = PullRequest(
                project_id=project.id,
                **pr_info
            )
            db.add(pr)
        
        await db.commit()
        await db.refresh(pr)
        return pr
    
    async def _update_pr_status(
        self,
        db: AsyncSession,
        project_id: int,
        pr_number: int,
        status: PRStatus
    ):
        """Update PR status"""
        result = await db.execute(
            select(PullRequest).where(
                PullRequest.project_id == project_id,
                PullRequest.pr_number == pr_number
            )
        )
        pr = result.scalar_one_or_none()
        
        if pr:
            pr.status = status
            if status == PRStatus.MERGED:
                pr.merged_at = datetime.utcnow()
            elif status == PRStatus.CLOSED:
                pr.closed_at = datetime.utcnow()
            
            await db.commit()
    
    async def _trigger_pr_scan(
        self,
        db: AsyncSession,
        project: Project,
        pr_number: int,
        event_action: str
    ) -> str:
        """Trigger PR scan task"""
        from tasks.pr_scan_tasks import scan_pull_request_task
        
        logger.info(f"Triggering PR scan for project {project.id}, PR #{pr_number}")
        
        # Trigger Celery task
        task = scan_pull_request_task.delay(
            project_id=project.id,
            pr_number=pr_number
        )
        
        logger.info(f"PR scan task created: {task.id}")
        return task.id


# Singleton instance
webhook_handler = WebhookHandler()

