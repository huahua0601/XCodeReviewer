"""Pull Request Diff Service
Handles fetching and parsing PR diffs from GitHub, GitLab, CodeCommit
"""
from typing import Dict, List, Optional, Any, Tuple
from loguru import logger
import re
from datetime import datetime

from services.repository.github_client import GitHubClient, parse_github_url
from services.repository.gitlab_client import GitLabClient, parse_gitlab_url
from services.repository.codecommit_client import CodeCommitClient, parse_codecommit_url
from core.exceptions import RepositoryError
from models.project import ProjectSource


class PRDiffService:
    """Service for fetching and parsing PR diffs"""
    
    def __init__(self):
        """Initialize PR diff service"""
        pass
    
    async def fetch_pr_info(
        self,
        source_type: ProjectSource,
        source_url: str,
        pr_number: int
    ) -> Dict[str, Any]:
        """
        Fetch PR basic information
        
        Args:
            source_type: Repository source type
            source_url: Repository URL
            pr_number: PR number
            
        Returns:
            Dictionary with PR information
        """
        try:
            if source_type == ProjectSource.GITHUB:
                return await self._fetch_github_pr_info(source_url, pr_number)
            elif source_type == ProjectSource.GITLAB:
                return await self._fetch_gitlab_pr_info(source_url, pr_number)
            elif source_type == ProjectSource.CODECOMMIT:
                return await self._fetch_codecommit_pr_info(source_url, pr_number)
            else:
                raise RepositoryError(f"Unsupported source type: {source_type}")
        except Exception as e:
            logger.error(f"Error fetching PR info: {e}")
            raise
    
    async def fetch_pr_diff(
        self,
        source_type: ProjectSource,
        source_url: str,
        pr_number: int
    ) -> Dict[str, Any]:
        """
        Fetch PR diff (changed files and their diffs)
        
        Args:
            source_type: Repository source type
            source_url: Repository URL
            pr_number: PR number
            
        Returns:
            Dictionary with diff information including changed files
        """
        try:
            if source_type == ProjectSource.GITHUB:
                return await self._fetch_github_pr_diff(source_url, pr_number)
            elif source_type == ProjectSource.GITLAB:
                return await self._fetch_gitlab_pr_diff(source_url, pr_number)
            elif source_type == ProjectSource.CODECOMMIT:
                return await self._fetch_codecommit_pr_diff(source_url, pr_number)
            else:
                raise RepositoryError(f"Unsupported source type: {source_type}")
        except Exception as e:
            logger.error(f"Error fetching PR diff: {e}")
            raise
    
    def parse_diff_hunks(self, patch: str) -> List[int]:
        """
        Parse diff patch to extract changed line numbers
        
        Args:
            patch: Diff patch string (unified diff format)
            
        Returns:
            List of changed line numbers
        """
        changed_lines = []
        
        # Unified diff format: @@ -start,count +start,count @@
        hunk_pattern = r'@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@'
        
        for match in re.finditer(hunk_pattern, patch):
            start_line = int(match.group(1))
            count = int(match.group(2)) if match.group(2) else 1
            
            # Extract lines from this hunk
            hunk_start = match.end()
            hunk_end = patch.find('\n@@', hunk_start)
            if hunk_end == -1:
                hunk_end = len(patch)
            
            hunk_content = patch[hunk_start:hunk_end]
            
            # Count actual changed lines (+ or -)
            current_line = start_line
            for line in hunk_content.split('\n'):
                if not line:
                    continue
                if line.startswith('+') and not line.startswith('+++'):
                    changed_lines.append(current_line)
                    current_line += 1
                elif line.startswith(' '):
                    current_line += 1
                # Lines starting with '-' don't increment the new file line counter
        
        return sorted(set(changed_lines))
    
    def is_line_in_diff(self, line_number: int, changed_lines: List[int], context: int = 3) -> bool:
        """
        Check if a line number is within the diff context
        
        Args:
            line_number: Line number to check
            changed_lines: List of changed line numbers
            context: Context lines around changed lines
            
        Returns:
            True if line is within context of changes
        """
        return any(abs(line_number - changed_line) <= context for changed_line in changed_lines)
    
    # ==================== GitHub ====================
    
    async def _fetch_github_pr_info(self, source_url: str, pr_number: int) -> Dict[str, Any]:
        """Fetch GitHub PR information"""
        owner, repo = parse_github_url(source_url)
        if not owner or not repo:
            raise RepositoryError(f"Invalid GitHub URL: {source_url}")
        
        client = GitHubClient()
        
        try:
            # Get PR info
            pr_data = client.get_pull_request(owner, repo, pr_number)
            
            return {
                'pr_number': pr_data['number'],
                'title': pr_data['title'],
                'description': pr_data.get('body', ''),
                'author': pr_data['user']['login'],
                'author_avatar': pr_data['user']['avatar_url'],
                'source_branch': pr_data['head']['ref'],
                'target_branch': pr_data['base']['ref'],
                'status': 'merged' if pr_data.get('merged') else ('closed' if pr_data['state'] == 'closed' else 'open'),
                'pr_url': pr_data['html_url'],
                'created_at': pr_data['created_at'],
                'updated_at': pr_data['updated_at'],
                'merged_at': pr_data.get('merged_at'),
                'closed_at': pr_data.get('closed_at'),
                'commits_count': pr_data.get('commits', 0),
                'changed_files_count': pr_data.get('changed_files', 0),
                'additions': pr_data.get('additions', 0),
                'deletions': pr_data.get('deletions', 0),
                'pr_metadata': {
                    'state': pr_data['state'],
                    'mergeable': pr_data.get('mergeable'),
                    'draft': pr_data.get('draft', False),
                    'labels': [label['name'] for label in pr_data.get('labels', [])]
                }
            }
        except Exception as e:
            logger.error(f"Error fetching GitHub PR info: {e}")
            raise RepositoryError(f"Failed to fetch GitHub PR {pr_number}: {e}")
    
    async def _fetch_github_pr_diff(self, source_url: str, pr_number: int) -> Dict[str, Any]:
        """Fetch GitHub PR diff"""
        owner, repo = parse_github_url(source_url)
        if not owner or not repo:
            raise RepositoryError(f"Invalid GitHub URL: {source_url}")
        
        client = GitHubClient()
        
        try:
            # Get PR files
            files = client.get_pull_request_files(owner, repo, pr_number)
            
            changed_files = []
            total_additions = 0
            total_deletions = 0
            
            for file in files:
                file_status = file['status']  # added, removed, modified, renamed
                patch = file.get('patch', '')
                
                # Parse changed lines
                changed_lines = self.parse_diff_hunks(patch) if patch else []
                
                changed_files.append({
                    'filename': file['filename'],
                    'status': file_status,
                    'additions': file['additions'],
                    'deletions': file['deletions'],
                    'changes': file['changes'],
                    'patch': patch,
                    'changed_lines': changed_lines,
                    'blob_url': file.get('blob_url', ''),
                    'raw_url': file.get('raw_url', ''),
                    'previous_filename': file.get('previous_filename')  # For renamed files
                })
                
                total_additions += file['additions']
                total_deletions += file['deletions']
            
            return {
                'changed_files': changed_files,
                'changed_files_count': len(changed_files),
                'additions': total_additions,
                'deletions': total_deletions
            }
        except Exception as e:
            logger.error(f"Error fetching GitHub PR diff: {e}")
            raise RepositoryError(f"Failed to fetch GitHub PR diff: {e}")
    
    # ==================== GitLab ====================
    
    async def _fetch_gitlab_pr_info(self, source_url: str, pr_number: int) -> Dict[str, Any]:
        """Fetch GitLab MR (Merge Request) information"""
        project_path = parse_gitlab_url(source_url)
        if not project_path:
            raise RepositoryError(f"Invalid GitLab URL: {source_url}")
        
        client = GitLabClient()
        
        try:
            # Get MR info
            mr_data = client.get_merge_request(project_path, pr_number)
            
            return {
                'pr_number': mr_data['iid'],
                'title': mr_data['title'],
                'description': mr_data.get('description', ''),
                'author': mr_data['author']['username'],
                'author_avatar': mr_data['author']['avatar_url'],
                'source_branch': mr_data['source_branch'],
                'target_branch': mr_data['target_branch'],
                'status': mr_data['state'],  # opened, closed, locked, merged
                'pr_url': mr_data['web_url'],
                'created_at': mr_data['created_at'],
                'updated_at': mr_data['updated_at'],
                'merged_at': mr_data.get('merged_at'),
                'closed_at': mr_data.get('closed_at'),
                'commits_count': mr_data.get('user_notes_count', 0),
                'changed_files_count': mr_data.get('changes_count', 0),
                'additions': 0,  # GitLab API doesn't provide this directly
                'deletions': 0,
                'pr_metadata': {
                    'state': mr_data['state'],
                    'work_in_progress': mr_data.get('work_in_progress', False),
                    'draft': mr_data.get('draft', False),
                    'labels': mr_data.get('labels', [])
                }
            }
        except Exception as e:
            logger.error(f"Error fetching GitLab MR info: {e}")
            raise RepositoryError(f"Failed to fetch GitLab MR {pr_number}: {e}")
    
    async def _fetch_gitlab_pr_diff(self, source_url: str, pr_number: int) -> Dict[str, Any]:
        """Fetch GitLab MR diff"""
        project_path = parse_gitlab_url(source_url)
        if not project_path:
            raise RepositoryError(f"Invalid GitLab URL: {source_url}")
        
        client = GitLabClient()
        
        try:
            # Get MR changes
            changes = client.get_merge_request_changes(project_path, pr_number)
            
            changed_files = []
            total_additions = 0
            total_deletions = 0
            
            for change in changes.get('changes', []):
                patch = change.get('diff', '')
                changed_lines = self.parse_diff_hunks(patch) if patch else []
                
                # Parse additions/deletions from diff
                additions = patch.count('\n+') - patch.count('\n+++')
                deletions = patch.count('\n-') - patch.count('\n---')
                
                changed_files.append({
                    'filename': change['new_path'],
                    'status': 'removed' if change['deleted_file'] else ('added' if change['new_file'] else 'modified'),
                    'additions': additions,
                    'deletions': deletions,
                    'changes': additions + deletions,
                    'patch': patch,
                    'changed_lines': changed_lines,
                    'previous_filename': change.get('old_path') if change.get('renamed_file') else None
                })
                
                total_additions += additions
                total_deletions += deletions
            
            return {
                'changed_files': changed_files,
                'changed_files_count': len(changed_files),
                'additions': total_additions,
                'deletions': total_deletions
            }
        except Exception as e:
            logger.error(f"Error fetching GitLab MR diff: {e}")
            raise RepositoryError(f"Failed to fetch GitLab MR diff: {e}")
    
    # ==================== CodeCommit ====================
    
    async def _fetch_codecommit_pr_info(self, source_url: str, pr_number: int) -> Dict[str, Any]:
        """Fetch CodeCommit PR information"""
        repo_name = parse_codecommit_url(source_url)
        if not repo_name:
            raise RepositoryError(f"Invalid CodeCommit URL: {source_url}")
        
        client = CodeCommitClient()
        
        try:
            # Get PR info
            pr_data = client.get_pull_request(pr_number)
            
            return {
                'pr_number': pr_number,
                'title': pr_data['title'],
                'description': pr_data.get('description', ''),
                'author': pr_data['authorArn'].split('/')[-1],  # Extract username from ARN
                'author_avatar': None,
                'source_branch': pr_data['sourceReference'].replace('refs/heads/', ''),
                'target_branch': pr_data['destinationReference'].replace('refs/heads/', ''),
                'status': pr_data['pullRequestStatus'].lower(),
                'pr_url': f"https://console.aws.amazon.com/codesuite/codecommit/repositories/{repo_name}/pull-requests/{pr_number}",
                'created_at': pr_data['creationDate'].isoformat() if pr_data.get('creationDate') else None,
                'updated_at': pr_data['lastActivityDate'].isoformat() if pr_data.get('lastActivityDate') else None,
                'merged_at': None,  # CodeCommit doesn't provide this
                'closed_at': None,
                'commits_count': 0,
                'changed_files_count': 0,
                'additions': 0,
                'deletions': 0,
                'pr_metadata': {
                    'state': pr_data['pullRequestStatus']
                }
            }
        except Exception as e:
            logger.error(f"Error fetching CodeCommit PR info: {e}")
            raise RepositoryError(f"Failed to fetch CodeCommit PR {pr_number}: {e}")
    
    async def _fetch_codecommit_pr_diff(self, source_url: str, pr_number: int) -> Dict[str, Any]:
        """Fetch CodeCommit PR diff"""
        # CodeCommit API is more complex for diffs - simplified implementation
        logger.warning("CodeCommit PR diff fetching is not fully implemented")
        return {
            'changed_files': [],
            'changed_files_count': 0,
            'additions': 0,
            'deletions': 0
        }


# Singleton instance
pr_diff_service = PRDiffService()

