"""File Upload API
Endpoints for uploading files (ZIP, etc.).
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from loguru import logger
import os
from datetime import datetime

from db.session import get_db
from models.user import User
from models.project import Project
from api.dependencies import get_current_user
from services.storage.storage_service import storage_service


router = APIRouter()


class UploadResponse(BaseModel):
    """Upload response schema"""
    file_path: str
    file_size: int
    content_type: str
    uploaded_at: str
    message: str


@router.post(
    "/zip",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload ZIP file",
    description="Upload a ZIP file to storage for project creation"
)
async def upload_zip_file(
    file: UploadFile = File(..., description="ZIP file to upload"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> UploadResponse:
    """
    Upload ZIP file to storage.
    
    Args:
        file: ZIP file to upload
        current_user: Authenticated user
        db: Database session
        
    Returns:
        Upload response with file path
    """
    try:
        # Validate file type
        if not file.filename or not file.filename.lower().endswith('.zip'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only ZIP files are allowed"
            )
        
        # Validate file size (max 100MB)
        content = await file.read()
        file_size = len(content)
        max_size = 100 * 1024 * 1024  # 100MB
        
        if file_size > max_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File size ({file_size / 1024 / 1024:.2f}MB) exceeds maximum allowed size (100MB)"
            )
        
        if file_size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File is empty"
            )
        
        # Generate unique file path
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        safe_filename = file.filename.replace(' ', '_').replace('..', '_')
        file_path = f"projects/{current_user.id}/{timestamp}_{safe_filename}"
        
        # Upload to storage
        storage_path = storage_service.upload_file(
            file_path=file_path,
            file_data=content,
            content_type=file.content_type or 'application/zip'
        )
        
        logger.info(f"Uploaded ZIP file for user {current_user.id}: {storage_path} ({file_size} bytes)")
        
        return UploadResponse(
            file_path=storage_path,
            file_size=file_size,
            content_type=file.content_type or 'application/zip',
            uploaded_at=datetime.utcnow().isoformat(),
            message=f"File '{file.filename}' uploaded successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading ZIP file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file: {str(e)}"
        )


@router.delete(
    "/zip/{file_path:path}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete uploaded ZIP file",
    description="Delete a previously uploaded ZIP file from storage"
)
async def delete_zip_file(
    file_path: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete uploaded ZIP file.
    
    Args:
        file_path: Path of the file to delete
        current_user: Authenticated user
    """
    try:
        # Verify file belongs to current user
        if not file_path.startswith(f"projects/{current_user.id}/"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to delete this file"
            )
        
        # Delete from storage
        success = storage_service.delete_file(file_path)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found"
            )
        
        logger.info(f"Deleted ZIP file for user {current_user.id}: {file_path}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting ZIP file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete file: {str(e)}"
        )

