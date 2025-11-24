"""GitHub Client
Client for fetching repository data from GitHub.
"""
import httpx
from typing import Dict, List, Optional, Any
from loguru import logger
from datetime import datetime

from core.exceptions import RepositoryError
from app.config import settings


class GitHubClient:
    """GitHub API client"""
    
    API_BASE = "https://api.github.com"
    
    def __init__(self, token: Optional[str] = None):
        """
        Initialize GitHub client.
        
        Args:
            token: GitHub personal access token (optional)
        """
        self.token = token or settings.GITHUB_TOKEN
        
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "XCodeReviewer"
        }
        
        if self.token:
            headers["Authorization"] = f"token {self.token}"
        
        self.client = httpx.AsyncClient(
            base_url=self.API_BASE,
            headers=headers,
            timeout=30.0
        )
    
    async def get_repository(self, owner: str, repo: str) -> Dict[str, Any]:
        """
        Get repository information.
        
        Args:
            owner: Repository owner
            repo: Repository name
            
        Returns:
            Repository information
        """
        try:
            response = await self.client.get(f"/repos/{owner}/{repo}")
            response.raise_for_status()
            return response.json()
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                raise RepositoryError(f"Repository {owner}/{repo} not found")
            elif e.response.status_code == 403:
                raise RepositoryError("GitHub API rate limit exceeded or access denied")
            else:
                raise RepositoryError(f"GitHub API error: {e}")
        except Exception as e:
            logger.error(f"Error fetching repository: {e}")
            raise RepositoryError(f"Error fetching repository: {e}")
    
    async def get_file_tree(
        self,
        owner: str,
        repo: str,
        branch: str = "main",
        path: str = ""
    ) -> List[Dict[str, Any]]:
        """
        Get repository file tree.
        
        Args:
            owner: Repository owner
            repo: Repository name
            branch: Branch name (default: main)
            path: Path within repository (default: root)
            
        Returns:
            List of files and directories
        """
        try:
            # Get tree SHA for branch
            ref_response = await self.client.get(
                f"/repos/{owner}/{repo}/git/ref/heads/{branch}"
            )
            ref_response.raise_for_status()
            commit_sha = ref_response.json()["object"]["sha"]
            
            # Get commit to find tree SHA
            commit_response = await self.client.get(
                f"/repos/{owner}/{repo}/git/commits/{commit_sha}"
            )
            commit_response.raise_for_status()
            tree_sha = commit_response.json()["tree"]["sha"]
            
            # Get tree recursively
            tree_response = await self.client.get(
                f"/repos/{owner}/{repo}/git/trees/{tree_sha}",
                params={"recursive": "1"}
            )
            tree_response.raise_for_status()
            tree_data = tree_response.json()
            
            return tree_data.get("tree", [])
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                raise RepositoryError(f"Branch {branch} not found in {owner}/{repo}")
            elif e.response.status_code == 403:
                raise RepositoryError("GitHub API rate limit exceeded")
            else:
                raise RepositoryError(f"GitHub API error: {e}")
        except Exception as e:
            logger.error(f"Error fetching file tree: {e}")
            raise RepositoryError(f"Error fetching file tree: {e}")
    
    async def get_file_content(
        self,
        owner: str,
        repo: str,
        path: str,
        branch: str = "main"
    ) -> str:
        """
        Get file content from repository.
        
        Args:
            owner: Repository owner
            repo: Repository name
            path: File path
            branch: Branch name (default: main)
            
        Returns:
            File content as string
        """
        try:
            response = await self.client.get(
                f"/repos/{owner}/{repo}/contents/{path}",
                params={"ref": branch}
            )
            response.raise_for_status()
            data = response.json()
            
            # Decode base64 content
            import base64
            content = base64.b64decode(data["content"]).decode("utf-8")
            
            return content
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                raise RepositoryError(f"File {path} not found")
            else:
                raise RepositoryError(f"GitHub API error: {e}")
        except UnicodeDecodeError:
            raise RepositoryError(f"File {path} is not a text file")
        except Exception as e:
            logger.error(f"Error fetching file content: {e}")
            raise RepositoryError(f"Error fetching file content: {e}")
    
    async def get_languages(self, owner: str, repo: str) -> Dict[str, int]:
        """
        Get repository languages.
        
        Args:
            owner: Repository owner
            repo: Repository name
            
        Returns:
            Dictionary of languages and their byte counts
        """
        try:
            response = await self.client.get(f"/repos/{owner}/{repo}/languages")
            response.raise_for_status()
            return response.json()
            
        except Exception as e:
            logger.error(f"Error fetching languages: {e}")
            return {}
    
    async def get_rate_limit(self) -> Dict[str, Any]:
        """
        Get current rate limit status.
        
        Returns:
            Rate limit information
        """
        try:
            response = await self.client.get("/rate_limit")
            response.raise_for_status()
            return response.json()
            
        except Exception as e:
            logger.error(f"Error fetching rate limit: {e}")
            return {}
    
    async def check_rate_limit(self) -> bool:
        """
        Check if rate limit allows more requests.
        
        Returns:
            True if requests are allowed, False otherwise
        """
        try:
            rate_limit = await self.get_rate_limit()
            core = rate_limit.get("resources", {}).get("core", {})
            remaining = core.get("remaining", 0)
            
            if remaining < 10:
                reset_time = core.get("reset", 0)
                reset_dt = datetime.fromtimestamp(reset_time)
                logger.warning(
                    f"GitHub rate limit low: {remaining} requests remaining. "
                    f"Resets at {reset_dt}"
                )
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error checking rate limit: {e}")
            return True  # Assume OK if check fails
    
    def get_pull_request(self, owner: str, repo: str, pr_number: int) -> Dict[str, Any]:
        """
        Get pull request information (sync version for non-async context)
        
        Args:
            owner: Repository owner
            repo: Repository name
            pr_number: Pull request number
            
        Returns:
            Pull request information
        """
        try:
            import requests
            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "XCodeReviewer"
            }
            if self.token:
                headers["Authorization"] = f"token {self.token}"
            
            response = requests.get(
                f"{self.API_BASE}/repos/{owner}/{repo}/pulls/{pr_number}",
                headers=headers,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching PR: {e}")
            raise RepositoryError(f"Error fetching PR {pr_number}: {e}")
    
    def get_pull_request_files(self, owner: str, repo: str, pr_number: int) -> List[Dict[str, Any]]:
        """
        Get files changed in a pull request (sync version)
        
        Args:
            owner: Repository owner
            repo: Repository name
            pr_number: Pull request number
            
        Returns:
            List of changed files with diffs
        """
        try:
            import requests
            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "XCodeReviewer"
            }
            if self.token:
                headers["Authorization"] = f"token {self.token}"
            
            response = requests.get(
                f"{self.API_BASE}/repos/{owner}/{repo}/pulls/{pr_number}/files",
                headers=headers,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching PR files: {e}")
            raise RepositoryError(f"Error fetching PR files: {e}")
    
    def create_pr_comment(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        body: str
    ) -> Dict[str, Any]:
        """
        Create a comment on a pull request (sync version)
        
        Args:
            owner: Repository owner
            repo: Repository name
            pr_number: Pull request number
            body: Comment body (markdown supported)
            
        Returns:
            Created comment information
        """
        try:
            import requests
            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "XCodeReviewer"
            }
            if self.token:
                headers["Authorization"] = f"token {self.token}"
            
            response = requests.post(
                f"{self.API_BASE}/repos/{owner}/{repo}/issues/{pr_number}/comments",
                headers=headers,
                json={"body": body},
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error creating PR comment: {e}")
            raise RepositoryError(f"Error creating PR comment: {e}")
    
    def create_commit_status(
        self,
        owner: str,
        repo: str,
        commit_sha: str,
        state: str,
        description: str,
        context: str = "XCodeReviewer",
        target_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a commit status (check)
        
        Args:
            owner: Repository owner
            repo: Repository name
            commit_sha: Commit SHA
            state: Status state (pending, success, error, failure)
            description: Short description
            context: Status context name
            target_url: URL to details page
            
        Returns:
            Created status information
        """
        try:
            import requests
            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "XCodeReviewer"
            }
            if self.token:
                headers["Authorization"] = f"token {self.token}"
            
            payload = {
                "state": state,
                "description": description,
                "context": context
            }
            if target_url:
                payload["target_url"] = target_url
            
            response = requests.post(
                f"{self.API_BASE}/repos/{owner}/{repo}/statuses/{commit_sha}",
                headers=headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error creating commit status: {e}")
            raise RepositoryError(f"Error creating commit status: {e}")
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.client.aclose()


async def parse_github_url(url: str) -> tuple[str, str, str]:
    """
    Parse GitHub URL to extract owner, repo, and branch.
    
    Args:
        url: GitHub URL
        
    Returns:
        Tuple of (owner, repo, branch)
    """
    import re
    
    # Pattern: https://github.com/owner/repo or https://github.com/owner/repo/tree/branch
    pattern = r"github\.com/([^/]+)/([^/]+)(?:/tree/([^/]+))?"
    match = re.search(pattern, url)
    
    if not match:
        raise RepositoryError(f"Invalid GitHub URL: {url}")
    
    owner = match.group(1)
    repo = match.group(2).replace(".git", "")
    branch = match.group(3) or "main"
    
    return owner, repo, branch
