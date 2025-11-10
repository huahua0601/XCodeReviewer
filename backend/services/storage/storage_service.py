"""Storage Service
Service for storing and retrieving files from MinIO/S3/Local filesystem.

Supports three storage types:
- MinIO: Self-hosted S3-compatible object storage
- AWS S3: Amazon Web Services S3
- Local: Local filesystem storage

Configuration via environment variables or app config.
"""
from typing import Optional
from datetime import timedelta
import os
from loguru import logger
from enum import Enum

try:
    from minio import Minio
    from minio.error import S3Error
    MINIO_AVAILABLE = True
except ImportError:
    MINIO_AVAILABLE = False
    logger.warning("MinIO client not available. Install with: pip install minio")

try:
    import boto3
    from botocore.exceptions import ClientError
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False
    logger.warning("boto3 not available. Install with: pip install boto3")


class StorageType(str, Enum):
    """Storage type enumeration"""
    MINIO = "minio"
    S3 = "s3"
    LOCAL = "local"


class StorageService:
    """Service for file storage operations"""
    
    def __init__(self):
        """Initialize storage service based on configuration"""
        from app.config import settings
        
        self.storage_type = StorageType(settings.STORAGE_TYPE.lower())
        logger.info(f"Initializing storage service with type: {self.storage_type}")
        
        if self.storage_type == StorageType.MINIO:
            self._init_minio(settings)
        elif self.storage_type == StorageType.S3:
            self._init_s3(settings)
        else:  # LOCAL
            self._init_local(settings)
    
    def _init_minio(self, settings):
        """Initialize MinIO storage"""
        if not MINIO_AVAILABLE:
            logger.error("MinIO client not available but STORAGE_TYPE is 'minio'")
            raise ImportError("MinIO client required. Install with: pip install minio")
        
        try:
            self.client = Minio(
                endpoint=settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE
            )
            self.bucket_name = settings.MINIO_BUCKET
            self._ensure_minio_bucket_exists()
            logger.info(f"MinIO storage initialized: {settings.MINIO_ENDPOINT}/{self.bucket_name}")
        except Exception as e:
            logger.error(f"Failed to initialize MinIO: {e}")
            raise
    
    def _init_s3(self, settings):
        """Initialize AWS S3 storage"""
        if not BOTO3_AVAILABLE:
            logger.warning("boto3 not available, trying MinIO client for S3...")
            # Fallback to MinIO client (S3 compatible)
            if not MINIO_AVAILABLE:
                logger.error("Neither boto3 nor MinIO client available for S3 storage")
                raise ImportError("boto3 or MinIO client required. Install with: pip install boto3")
            
            # Use MinIO client for S3 (S3 compatible)
            endpoint = settings.S3_ENDPOINT_URL or f"s3.{settings.S3_REGION}.amazonaws.com"
            self.client = Minio(
                endpoint=endpoint,
                access_key=settings.S3_ACCESS_KEY,
                secret_key=settings.S3_SECRET_KEY,
                secure=True,
                region=settings.S3_REGION
            )
            self.bucket_name = settings.S3_BUCKET
            self.using_boto3 = False
            logger.info(f"S3 storage initialized with MinIO client: {endpoint}/{self.bucket_name}")
        else:
            # Use boto3 for better S3 integration
            session_config = {
                'aws_access_key_id': settings.S3_ACCESS_KEY,
                'aws_secret_access_key': settings.S3_SECRET_KEY,
                'region_name': settings.S3_REGION
            }
            
            if settings.S3_ENDPOINT_URL:
                session_config['endpoint_url'] = settings.S3_ENDPOINT_URL
            
            self.s3_client = boto3.client('s3', **session_config)
            self.bucket_name = settings.S3_BUCKET
            self.using_boto3 = True
            self._ensure_s3_bucket_exists()
            logger.info(f"S3 storage initialized with boto3: {settings.S3_REGION}/{self.bucket_name}")
    
    def _init_local(self, settings):
        """Initialize local filesystem storage"""
        self.local_storage_path = settings.LOCAL_STORAGE_PATH
        os.makedirs(self.local_storage_path, exist_ok=True)
        logger.info(f"Local storage initialized: {self.local_storage_path}")
    
    def _ensure_minio_bucket_exists(self):
        """Ensure MinIO bucket exists"""
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                logger.info(f"Created MinIO bucket: {self.bucket_name}")
        except S3Error as e:
            logger.error(f"Error ensuring MinIO bucket exists: {e}")
            raise
    
    def _ensure_s3_bucket_exists(self):
        """Ensure S3 bucket exists"""
        if not self.using_boto3:
            return
        
        try:
            self.s3_client.head_bucket(Bucket=self.bucket_name)
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == '404':
                try:
                    self.s3_client.create_bucket(
                        Bucket=self.bucket_name,
                        CreateBucketConfiguration={'LocationConstraint': self.s3_client.meta.region_name}
                    )
                    logger.info(f"Created S3 bucket: {self.bucket_name}")
                except ClientError as create_error:
                    logger.error(f"Error creating S3 bucket: {create_error}")
                    raise
            else:
                logger.error(f"Error checking S3 bucket: {e}")
                raise
    
    def upload_file(
        self,
        file_path: str,
        file_data: bytes,
        content_type: str = 'application/octet-stream'
    ) -> str:
        """
        Upload file to storage.
        
        Args:
            file_path: Path/key for the file in storage
            file_data: File content as bytes
            content_type: MIME type of the file
            
        Returns:
            Storage path/URL of uploaded file
        """
        if self.storage_type == StorageType.MINIO:
            return self._upload_to_minio(file_path, file_data, content_type)
        elif self.storage_type == StorageType.S3:
            return self._upload_to_s3(file_path, file_data, content_type)
        else:  # LOCAL
            return self._upload_to_local(file_path, file_data)
    
    def _upload_to_minio(
        self,
        file_path: str,
        file_data: bytes,
        content_type: str
    ) -> str:
        """Upload file to MinIO"""
        try:
            from io import BytesIO
            
            data_stream = BytesIO(file_data)
            
            self.client.put_object(
                bucket_name=self.bucket_name,
                object_name=file_path,
                data=data_stream,
                length=len(file_data),
                content_type=content_type
            )
            
            logger.info(f"Uploaded file to MinIO: {file_path}")
            return f"s3://{self.bucket_name}/{file_path}"
            
        except S3Error as e:
            logger.error(f"Error uploading to MinIO: {e}")
            raise
    
    def _upload_to_s3(
        self,
        file_path: str,
        file_data: bytes,
        content_type: str
    ) -> str:
        """Upload file to AWS S3"""
        if self.using_boto3:
            try:
                from io import BytesIO
                
                self.s3_client.upload_fileobj(
                    BytesIO(file_data),
                    self.bucket_name,
                    file_path,
                    ExtraArgs={'ContentType': content_type}
                )
                
                logger.info(f"Uploaded file to S3: {file_path}")
                return f"s3://{self.bucket_name}/{file_path}"
                
            except ClientError as e:
                logger.error(f"Error uploading to S3: {e}")
                raise
        else:
            # Use MinIO client for S3
            return self._upload_to_minio(file_path, file_data, content_type)
    
    def _upload_to_local(self, file_path: str, file_data: bytes) -> str:
        """Upload file to local filesystem"""
        full_path = os.path.join(self.local_storage_path, file_path)
        
        # Create directory if needed
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        with open(full_path, 'wb') as f:
            f.write(file_data)
        
        logger.info(f"Saved file locally: {full_path}")
        return full_path
    
    def download_file(self, file_path: str) -> bytes:
        """
        Download file from storage.
        
        Args:
            file_path: Path/key of the file in storage
            
        Returns:
            File content as bytes
        """
        if self.storage_type == StorageType.MINIO:
            return self._download_from_minio(file_path)
        elif self.storage_type == StorageType.S3:
            return self._download_from_s3(file_path)
        else:  # LOCAL
            return self._download_from_local(file_path)
    
    def _download_from_minio(self, file_path: str) -> bytes:
        """Download file from MinIO"""
        try:
            response = self.client.get_object(
                bucket_name=self.bucket_name,
                object_name=file_path
            )
            
            data = response.read()
            response.close()
            response.release_conn()
            
            return data
            
        except S3Error as e:
            logger.error(f"Error downloading from MinIO: {e}")
            raise
    
    def _download_from_s3(self, file_path: str) -> bytes:
        """Download file from AWS S3"""
        if self.using_boto3:
            try:
                from io import BytesIO
                
                buffer = BytesIO()
                self.s3_client.download_fileobj(
                    self.bucket_name,
                    file_path,
                    buffer
                )
                
                return buffer.getvalue()
                
            except ClientError as e:
                logger.error(f"Error downloading from S3: {e}")
                raise
        else:
            # Use MinIO client for S3
            return self._download_from_minio(file_path)
    
    def _download_from_local(self, file_path: str) -> bytes:
        """Download file from local filesystem"""
        # Handle both absolute and relative paths
        if file_path.startswith(self.local_storage_path):
            full_path = file_path
        else:
            full_path = os.path.join(self.local_storage_path, file_path)
        
        with open(full_path, 'rb') as f:
            return f.read()
    
    def delete_file(self, file_path: str) -> bool:
        """
        Delete file from storage.
        
        Args:
            file_path: Path/key of the file in storage
            
        Returns:
            True if deleted successfully
        """
        if self.storage_type == StorageType.MINIO:
            return self._delete_from_minio(file_path)
        elif self.storage_type == StorageType.S3:
            return self._delete_from_s3(file_path)
        else:  # LOCAL
            return self._delete_from_local(file_path)
    
    def _delete_from_minio(self, file_path: str) -> bool:
        """Delete file from MinIO"""
        try:
            self.client.remove_object(
                bucket_name=self.bucket_name,
                object_name=file_path
            )
            logger.info(f"Deleted file from MinIO: {file_path}")
            return True
            
        except S3Error as e:
            logger.error(f"Error deleting from MinIO: {e}")
            return False
    
    def _delete_from_s3(self, file_path: str) -> bool:
        """Delete file from AWS S3"""
        if self.using_boto3:
            try:
                self.s3_client.delete_object(
                    Bucket=self.bucket_name,
                    Key=file_path
                )
                logger.info(f"Deleted file from S3: {file_path}")
                return True
                
            except ClientError as e:
                logger.error(f"Error deleting from S3: {e}")
                return False
        else:
            # Use MinIO client for S3
            return self._delete_from_minio(file_path)
    
    def _delete_from_local(self, file_path: str) -> bool:
        """Delete file from local filesystem"""
        try:
            # Handle both absolute and relative paths
            if file_path.startswith(self.local_storage_path):
                full_path = file_path
            else:
                full_path = os.path.join(self.local_storage_path, file_path)
            
            if os.path.exists(full_path):
                os.remove(full_path)
                logger.info(f"Deleted local file: {full_path}")
                return True
            return False
            
        except Exception as e:
            logger.error(f"Error deleting local file: {e}")
            return False
    
    def get_presigned_url(
        self,
        file_path: str,
        expires: timedelta = timedelta(hours=1)
    ) -> Optional[str]:
        """
        Get presigned URL for file download.
        
        Args:
            file_path: Path/key of the file in storage
            expires: URL expiration time
            
        Returns:
            Presigned URL or None if not available
        """
        if self.storage_type == StorageType.MINIO:
            return self._get_presigned_url_minio(file_path, expires)
        elif self.storage_type == StorageType.S3:
            return self._get_presigned_url_s3(file_path, expires)
        else:  # LOCAL
            # For local storage, return the file path
            return file_path
    
    def _get_presigned_url_minio(
        self,
        file_path: str,
        expires: timedelta
    ) -> Optional[str]:
        """Get presigned URL from MinIO"""
        try:
            url = self.client.presigned_get_object(
                bucket_name=self.bucket_name,
                object_name=file_path,
                expires=expires
            )
            return url
            
        except S3Error as e:
            logger.error(f"Error generating presigned URL from MinIO: {e}")
            return None
    
    def _get_presigned_url_s3(
        self,
        file_path: str,
        expires: timedelta
    ) -> Optional[str]:
        """Get presigned URL from S3"""
        if self.using_boto3:
            try:
                url = self.s3_client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': self.bucket_name,
                        'Key': file_path
                    },
                    ExpiresIn=int(expires.total_seconds())
                )
                return url
                
            except ClientError as e:
                logger.error(f"Error generating presigned URL from S3: {e}")
                return None
        else:
            # Use MinIO client for S3
            return self._get_presigned_url_minio(file_path, expires)
    
    def file_exists(self, file_path: str) -> bool:
        """
        Check if file exists in storage.
        
        Args:
            file_path: Path/key of the file in storage
            
        Returns:
            True if file exists
        """
        if self.storage_type == StorageType.MINIO:
            return self._file_exists_in_minio(file_path)
        elif self.storage_type == StorageType.S3:
            return self._file_exists_in_s3(file_path)
        else:  # LOCAL
            return self._file_exists_locally(file_path)
    
    def _file_exists_in_minio(self, file_path: str) -> bool:
        """Check if file exists in MinIO"""
        try:
            self.client.stat_object(
                bucket_name=self.bucket_name,
                object_name=file_path
            )
            return True
        except S3Error:
            return False
    
    def _file_exists_in_s3(self, file_path: str) -> bool:
        """Check if file exists in S3"""
        if self.using_boto3:
            try:
                self.s3_client.head_object(
                    Bucket=self.bucket_name,
                    Key=file_path
                )
                return True
            except ClientError:
                return False
        else:
            # Use MinIO client for S3
            return self._file_exists_in_minio(file_path)
    
    def _file_exists_locally(self, file_path: str) -> bool:
        """Check if file exists locally"""
        if file_path.startswith(self.local_storage_path):
            full_path = file_path
        else:
            full_path = os.path.join(self.local_storage_path, file_path)
        
        return os.path.exists(full_path)
    
    def get_file_size(self, file_path: str) -> Optional[int]:
        """
        Get file size in bytes.
        
        Args:
            file_path: Path/key of the file in storage
            
        Returns:
            File size in bytes or None if not found
        """
        if self.storage_type == StorageType.MINIO:
            return self._get_file_size_from_minio(file_path)
        elif self.storage_type == StorageType.S3:
            return self._get_file_size_from_s3(file_path)
        else:  # LOCAL
            return self._get_file_size_locally(file_path)
    
    def _get_file_size_from_minio(self, file_path: str) -> Optional[int]:
        """Get file size from MinIO"""
        try:
            stat = self.client.stat_object(
                bucket_name=self.bucket_name,
                object_name=file_path
            )
            return stat.size
        except S3Error:
            return None
    
    def _get_file_size_from_s3(self, file_path: str) -> Optional[int]:
        """Get file size from S3"""
        if self.using_boto3:
            try:
                response = self.s3_client.head_object(
                    Bucket=self.bucket_name,
                    Key=file_path
                )
                return response['ContentLength']
            except ClientError:
                return None
        else:
            # Use MinIO client for S3
            return self._get_file_size_from_minio(file_path)
    
    def _get_file_size_locally(self, file_path: str) -> Optional[int]:
        """Get file size locally"""
        try:
            if file_path.startswith(self.local_storage_path):
                full_path = file_path
            else:
                full_path = os.path.join(self.local_storage_path, file_path)
            
            if os.path.exists(full_path):
                return os.path.getsize(full_path)
            return None
        except Exception:
            return None


# Export singleton instance
storage_service = StorageService()
