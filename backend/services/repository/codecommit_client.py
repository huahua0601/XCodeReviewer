"""AWS CodeCommit Client
Client for interacting with AWS CodeCommit API.
"""
from typing import Dict, List, Optional, Any
import base64
from loguru import logger
import re

try:
    import boto3
    from botocore.exceptions import ClientError
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False
    logger.warning("boto3 not available. Install with: pip install boto3")

from core.exceptions import RepositoryError


class CodeCommitClient:
    """AWS CodeCommit client"""
    
    def __init__(self, region: str = "us-east-1", access_key: Optional[str] = None, secret_key: Optional[str] = None):
        """
        Initialize CodeCommit client.
        
        Args:
            region: AWS region
            access_key: AWS access key (optional, uses default credentials if not provided)
            secret_key: AWS secret key (optional)
        """
        if not BOTO3_AVAILABLE:
            raise ImportError("boto3 is required for CodeCommit support. Install with: pip install boto3")
        
        # Initialize boto3 client
        session_kwargs = {'region_name': region}
        if access_key and secret_key:
            session_kwargs['aws_access_key_id'] = access_key
            session_kwargs['aws_secret_access_key'] = secret_key
        
        self.client = boto3.client('codecommit', **session_kwargs)
        self.region = region
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass
    
    async def get_repository(self, repo_name: str) -> Dict[str, Any]:
        """
        Get repository information.
        
        Args:
            repo_name: Repository name
            
        Returns:
            Repository information
        """
        try:
            response = self.client.get_repository(repositoryName=repo_name)
            repo_metadata = response['repositoryMetadata']
            
            return {
                'name': repo_metadata['repositoryName'],
                'description': repo_metadata.get('repositoryDescription', ''),
                'clone_url': repo_metadata.get('cloneUrlHttp', ''),
                'default_branch': repo_metadata.get('defaultBranch', 'main'),
                'arn': repo_metadata.get('Arn', '')
            }
        except ClientError as e:
            logger.error(f"Error getting CodeCommit repository: {e}")
            raise RepositoryError(f"Failed to get repository {repo_name}: {e}")
    
    async def get_branch(self, repo_name: str, branch_name: str) -> Optional[str]:
        """
        Get branch information.
        
        Args:
            repo_name: Repository name
            branch_name: Branch name
            
        Returns:
            Commit ID of the branch tip
        """
        try:
            response = self.client.get_branch(
                repositoryName=repo_name,
                branchName=branch_name
            )
            return response['branch']['commitId']
        except ClientError as e:
            logger.error(f"Error getting branch: {e}")
            return None
    
    async def get_file_tree(self, repo_name: str, branch: str) -> List[Dict[str, Any]]:
        """
        Get file tree for a repository branch.
        
        Args:
            repo_name: Repository name
            branch: Branch name
            
        Returns:
            List of files with metadata
        """
        try:
            # Get commit ID for branch
            commit_id = await self.get_branch(repo_name, branch)
            if not commit_id:
                raise RepositoryError(f"Branch {branch} not found")
            
            files = []
            
            # Get folder contents recursively
            async def scan_folder(folder_path: str = ""):
                try:
                    response = self.client.get_folder(
                        repositoryName=repo_name,
                        commitSpecifier=commit_id,
                        folderPath=folder_path
                    )
                    
                    # Add files
                    for file_info in response.get('files', []):
                        file_path = file_info['absolutePath']
                        if file_path.startswith('/'):
                            file_path = file_path[1:]  # Remove leading slash
                        
                        files.append({
                            'path': file_path,
                            'type': 'blob',
                            'size': 0,  # CodeCommit get_folder API doesn't provide file size
                            'mode': file_info.get('fileMode', 'NORMAL')
                        })
                    
                    # Recursively scan subfolders
                    for subfolder in response.get('subFolders', []):
                        subfolder_path = subfolder['absolutePath']
                        if subfolder_path.startswith('/'):
                            subfolder_path = subfolder_path[1:]
                        await scan_folder(subfolder_path)
                        
                except ClientError as e:
                    # Empty folder or access error, skip
                    logger.warning(f"Error scanning folder {folder_path}: {e}")
            
            # Start scanning from root
            await scan_folder("")
            
            return files
            
        except ClientError as e:
            logger.error(f"Error getting file tree: {e}")
            raise RepositoryError(f"Failed to get file tree: {e}")
    
    async def get_file_content(
        self,
        repo_name: str,
        file_path: str,
        branch: str
    ) -> str:
        """
        Get file content.
        
        Args:
            repo_name: Repository name
            file_path: File path in repository
            branch: Branch name
            
        Returns:
            File content as string
        """
        try:
            # Get commit ID for branch
            commit_id = await self.get_branch(repo_name, branch)
            if not commit_id:
                raise RepositoryError(f"Branch {branch} not found")
            
            # Ensure file path doesn't start with /
            if file_path.startswith('/'):
                file_path = file_path[1:]
            
            response = self.client.get_file(
                repositoryName=repo_name,
                commitSpecifier=commit_id,
                filePath=file_path
            )
            
            # Decode file content (fileContent is already bytes from boto3)
            file_content = response['fileContent']
            if isinstance(file_content, bytes):
                content = file_content.decode('utf-8')
            else:
                # If it's a string, assume it's already decoded
                content = str(file_content)
            return content
            
        except ClientError as e:
            logger.error(f"Error getting file content: {e}")
            raise RepositoryError(f"Failed to get file {file_path}: {e}")
        except UnicodeDecodeError as e:
            logger.error(f"Unicode decode error for {file_path}: {e}")
            raise RepositoryError(f"File {file_path} is not a text file")


async def parse_codecommit_url(url: str) -> tuple[str, str, str]:
    """
    Parse CodeCommit URL to extract region and repository name.
    
    Args:
        url: CodeCommit URL (HTTPS or SSH format)
        
    Returns:
        Tuple of (region, repository_name, default_branch)
        
    Examples:
        - https://git-codecommit.us-east-1.amazonaws.com/v1/repos/my-repo
        - ssh://git-codecommit.us-east-1.amazonaws.com/v1/repos/my-repo
    """
    # Pattern for HTTPS URL
    https_pattern = r'https://git-codecommit\.([^.]+)\.amazonaws\.com/v1/repos/([^/]+)'
    # Pattern for SSH URL  
    ssh_pattern = r'ssh://git-codecommit\.([^.]+)\.amazonaws\.com/v1/repos/([^/]+)'
    
    match = re.match(https_pattern, url) or re.match(ssh_pattern, url)
    
    if not match:
        raise RepositoryError(
            f"Invalid CodeCommit URL: {url}. "
            "Expected format: https://git-codecommit.{region}.amazonaws.com/v1/repos/{repo-name}"
        )
    
    region = match.group(1)
    repo_name = match.group(2)
    default_branch = "main"  # CodeCommit default
    
    return region, repo_name, default_branch

