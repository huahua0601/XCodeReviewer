"""Pull Request Scan Tasks
Celery tasks for scanning pull requests
"""
from celery import shared_task
from loguru import logger
from sqlalchemy import select
from datetime import datetime
from typing import Dict, Any, List

from db.session import AsyncSessionLocal
from models.pull_request import PullRequest
from models.project import Project, ProjectSource
from models.audit_task import AuditTask, TaskStatus
from models.audit_issue import AuditIssue
from services.repository.pr_diff_service import pr_diff_service
from services.repository.scanner import RepositoryScanner
from services.llm.llm_service import llm_service


@shared_task(name="tasks.scan_pull_request")
def scan_pull_request_task(project_id: int, pr_number: int) -> Dict[str, Any]:
    """
    Scan pull request and analyze changed code
    
    Args:
        project_id: Project ID
        pr_number: Pull request number
        
    Returns:
        Scan result dictionary
    """
    import asyncio
    
    # Run async function in sync context
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        result = loop.run_until_complete(
            _scan_pull_request_async(project_id, pr_number)
        )
        return result
    finally:
        loop.close()


async def _scan_pull_request_async(project_id: int, pr_number: int) -> Dict[str, Any]:
    """Async implementation of PR scan"""
    async with AsyncSessionLocal() as db:
        try:
            # Get project
            result = await db.execute(
                select(Project).where(Project.id == project_id)
            )
            project = result.scalar_one_or_none()
            
            if not project:
                raise Exception(f"Project {project_id} not found")
            
            logger.info(f"Starting PR scan: Project {project_id}, PR #{pr_number}")
            
            # Get or create PR record
            result = await db.execute(
                select(PullRequest).where(
                    PullRequest.project_id == project_id,
                    PullRequest.pr_number == pr_number
                )
            )
            pr = result.scalar_one_or_none()
            
            if not pr:
                # Fetch PR info from repository
                pr_info = await pr_diff_service.fetch_pr_info(
                    project.source_type,
                    project.source_url,
                    pr_number
                )
                
                pr = PullRequest(
                    project_id=project_id,
                    **pr_info
                )
                db.add(pr)
                await db.commit()
                await db.refresh(pr)
            
            # Create audit task for this PR scan
            task = AuditTask(
                name=f"PR #{pr_number} - {pr.title[:50]}",
                description=f"Automated scan for Pull Request #{pr_number}",
                project_id=project_id,
                pull_request_id=pr.id,
                task_type="pull_request",
                branch_name=pr.source_branch,
                status=TaskStatus.RUNNING,
                created_by=project.owner_id,
                scan_config={
                    "pr_number": pr_number,
                    "target_branch": pr.target_branch,
                    "scan_type": "pr_diff"
                }
            )
            db.add(task)
            await db.commit()
            await db.refresh(task)
            
            task.started_at = datetime.utcnow()
            await db.commit()
            
            logger.info(f"Created audit task {task.id} for PR #{pr_number}")
            
            # Fetch PR diff (changed files)
            diff_result = await pr_diff_service.fetch_pr_diff(
                project.source_type,
                project.source_url,
                pr_number
            )
            
            changed_files = diff_result['changed_files']
            
            # Update PR with changed files info
            pr.changed_files = changed_files
            pr.changed_files_count = len(changed_files)
            pr.additions = diff_result['additions']
            pr.deletions = diff_result['deletions']
            await db.commit()
            
            logger.info(f"Found {len(changed_files)} changed files in PR #{pr_number}")
            
            # Analyze changed files (only scan files with changes)
            issues_found = []
            scanner = RepositoryScanner()
            
            for file_info in changed_files:
                filename = file_info['filename']
                status = file_info['status']
                changed_lines = file_info.get('changed_lines', [])
                
                # Skip removed files
                if status == 'removed':
                    continue
                
                # Skip non-code files
                if not _is_code_file(filename):
                    continue
                
                try:
                    # Get file content
                    content = await scanner.get_file_content(
                        source_type=project.source_type,
                        file_path=filename,
                        source_url=project.source_url,
                        branch=pr.source_branch
                    )
                    
                    # Analyze with LLM (simplified - focus on changed lines)
                    issues = await _analyze_code_with_llm(
                        filename,
                        content,
                        changed_lines,
                        file_info.get('patch', '')
                    )
                    
                    # Create audit issues
                    for issue_data in issues:
                        # Check if issue is in changed lines (with context)
                        issue_line = issue_data.get('line_number', 0)
                        is_in_diff = pr_diff_service.is_line_in_diff(
                            issue_line,
                            changed_lines,
                            context=3
                        )
                        
                        # Only add issues that are in or near changed lines
                        if is_in_diff:
                            issue = AuditIssue(
                                task_id=task.id,
                                category=issue_data.get('category', 'other'),
                                severity=issue_data.get('severity', 'info'),
                                title=issue_data.get('title', 'Issue found'),
                                description=issue_data.get('description', ''),
                                file_path=filename,
                                line_start=issue_line,
                                line_end=issue_line,
                                code_snippet=issue_data.get('code_snippet', ''),
                                suggestion=issue_data.get('suggestion', ''),
                                is_in_diff=True,
                                diff_hunk=file_info.get('patch', '')[:500]  # Store relevant diff
                            )
                            db.add(issue)
                            issues_found.append(issue)
                    
                except Exception as e:
                    logger.error(f"Error analyzing file {filename}: {e}")
                    continue
            
            await db.commit()
            
            # Update task statistics
            task.scanned_files = len(changed_files)
            task.total_files = len(changed_files)
            task.total_issues = len(issues_found)
            
            # Count by severity
            task.critical_issues = sum(1 for i in issues_found if i.severity == 'critical')
            task.high_issues = sum(1 for i in issues_found if i.severity == 'high')
            task.medium_issues = sum(1 for i in issues_found if i.severity == 'medium')
            task.low_issues = sum(1 for i in issues_found if i.severity == 'low')
            
            task.status = TaskStatus.COMPLETED
            task.completed_at = datetime.utcnow()
            task.progress = 100
            
            await db.commit()
            
            logger.info(f"PR scan completed: {len(issues_found)} issues found")
            
            # Post comment to PR if enabled
            await _post_pr_comment_if_enabled(project, pr, task, issues_found, db)
            
            return {
                'status': 'completed',
                'task_id': task.id,
                'pr_id': pr.id,
                'pr_number': pr_number,
                'issues_found': len(issues_found),
                'files_scanned': len(changed_files)
            }
            
        except Exception as e:
            logger.error(f"Error in PR scan task: {e}")
            
            # Update task status to failed
            if 'task' in locals():
                task.status = TaskStatus.FAILED
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                await db.commit()
            
            return {
                'status': 'failed',
                'error': str(e)
            }


def _is_code_file(filename: str) -> bool:
    """Check if file is a code file"""
    code_extensions = {
        '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c', '.h',
        '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.cs', '.scala',
        '.vue', '.sql', '.sh', '.yaml', '.yml', '.json'
    }
    
    import os
    _, ext = os.path.splitext(filename)
    return ext.lower() in code_extensions


async def _analyze_code_with_llm(
    filename: str,
    content: str,
    changed_lines: List[int],
    patch: str
) -> List[Dict[str, Any]]:
    """
    Analyze code with LLM (simplified version)
    
    In production, this should:
    1. Extract only changed code sections
    2. Send to LLM for analysis
    3. Parse LLM response
    4. Return structured issues
    """
    # Simplified implementation - return empty list for now
    # Real implementation would call LLM service
    logger.info(f"Analyzing {filename} with {len(changed_lines)} changed lines")
    
    # TODO: Implement actual LLM analysis
    # Example structure:
    # issues = await llm_service.analyze_code(
    #     code=content,
    #     language=detect_language(filename),
    #     focus_lines=changed_lines
    # )
    
    return []


async def _post_pr_comment_if_enabled(
    project: Project,
    pr: PullRequest,
    task: AuditTask,
    issues: List[AuditIssue],
    db
):
    """Post scan results as PR comment if enabled"""
    # Check if auto-comment is enabled
    from models.webhook import WebhookConfig
    from sqlalchemy import select
    
    result = await db.execute(
        select(WebhookConfig).where(WebhookConfig.project_id == project.id)
    )
    webhook_config = result.scalar_one_or_none()
    
    if not webhook_config or not webhook_config.auto_comment_enabled:
        return
    
    # Build comment body
    comment_body = _build_pr_comment(pr, task, issues)
    
    # Post comment based on platform
    try:
        if project.source_type == ProjectSource.GITHUB:
            from services.repository.github_client import GitHubClient, parse_github_url
            owner, repo, _ = await parse_github_url(project.source_url)
            client = GitHubClient()
            client.create_pr_comment(owner, repo, pr.pr_number, comment_body)
            logger.info(f"Posted comment to GitHub PR #{pr.pr_number}")
            
        elif project.source_type == ProjectSource.GITLAB:
            from services.repository.gitlab_client import GitLabClient, parse_gitlab_url
            project_path, _ = await parse_gitlab_url(project.source_url)
            client = GitLabClient()
            client.create_mr_note(project_path, pr.pr_number, comment_body)
            logger.info(f"Posted comment to GitLab MR #{pr.pr_number}")
            
    except Exception as e:
        logger.error(f"Error posting PR comment: {e}")


def _build_pr_comment(pr: PullRequest, task: AuditTask, issues: List[AuditIssue]) -> str:
    """Build PR comment body"""
    from app.config import settings
    
    task_url = f"{settings.API_BASE_URL}/tasks/{task.id}"
    
    if len(issues) == 0:
        return f"""## ✅ XCodeReviewer - 代码审查通过

🎉 恭喜！未发现任何问题。

📊 **扫描统计**:
- 扫描文件: {task.scanned_files} 个
- 变更行数: +{pr.additions} -{pr.deletions}

[查看详细报告]({task_url})
"""
    
    # Group issues by severity
    critical = [i for i in issues if i.severity == 'critical']
    high = [i for i in issues if i.severity == 'high']
    medium = [i for i in issues if i.severity == 'medium']
    low = [i for i in issues if i.severity == 'low']
    
    comment = f"""## 🔍 XCodeReviewer - 代码审查结果

发现 **{len(issues)}** 个问题需要关注:

"""
    
    if critical:
        comment += f"- 🔴 严重: {len(critical)} 个\n"
    if high:
        comment += f"- 🟠 高: {len(high)} 个\n"
    if medium:
        comment += f"- 🟡 中: {len(medium)} 个\n"
    if low:
        comment += f"- 🟢 低: {len(low)} 个\n"
    
    comment += f"\n📊 **扫描统计**:\n"
    comment += f"- 扫描文件: {task.scanned_files} 个\n"
    comment += f"- 变更行数: +{pr.additions} -{pr.deletions}\n"
    
    # List top issues
    comment += f"\n### 主要问题:\n\n"
    top_issues = (critical + high)[:5]  # Show top 5 critical/high issues
    
    for i, issue in enumerate(top_issues, 1):
        severity_icon = {
            'critical': '🔴',
            'high': '🟠',
            'medium': '🟡',
            'low': '🟢'
        }.get(issue.severity, '⚪')
        
        comment += f"{i}. {severity_icon} **{issue.title}**\n"
        comment += f"   - 文件: `{issue.file_path}:{issue.line_start}`\n"
        if issue.suggestion:
            comment += f"   - 建议: {issue.suggestion[:100]}...\n"
        comment += "\n"
    
    comment += f"\n[📄 查看完整报告]({task_url})\n"
    comment += f"\n---\n*由 XCodeReviewer 自动生成*"
    
    return comment

