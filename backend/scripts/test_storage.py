#!/usr/bin/env python3
"""
Storage Service Test Script

Tests the storage service with all three storage types:
- Local filesystem
- MinIO
- AWS S3

Usage:
    python scripts/test_storage.py
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.storage.storage_service import storage_service
from loguru import logger


def test_storage():
    """Test storage service operations"""
    
    logger.info("=" * 60)
    logger.info("Storage Service Test")
    logger.info("=" * 60)
    
    # Display current configuration
    logger.info(f"Storage Type: {storage_service.storage_type}")
    
    # Test data
    test_file_path = "test/hello.txt"
    test_data = b"Hello, XCodeReviewer! Storage service test."
    
    try:
        # Test 1: Upload file
        logger.info("\n[Test 1] Uploading test file...")
        result_path = storage_service.upload_file(
            file_path=test_file_path,
            file_data=test_data,
            content_type="text/plain"
        )
        logger.success(f"✅ Upload successful: {result_path}")
        
        # Test 2: Check file exists
        logger.info("\n[Test 2] Checking if file exists...")
        exists = storage_service.file_exists(test_file_path)
        if exists:
            logger.success("✅ File exists")
        else:
            logger.error("❌ File not found")
            return
        
        # Test 3: Get file size
        logger.info("\n[Test 3] Getting file size...")
        size = storage_service.get_file_size(test_file_path)
        if size:
            logger.success(f"✅ File size: {size} bytes")
        else:
            logger.warning("⚠️ Could not get file size")
        
        # Test 4: Download file
        logger.info("\n[Test 4] Downloading file...")
        downloaded_data = storage_service.download_file(test_file_path)
        if downloaded_data == test_data:
            logger.success(f"✅ Download successful: {downloaded_data.decode()}")
        else:
            logger.error("❌ Downloaded data does not match")
            return
        
        # Test 5: Get presigned URL
        logger.info("\n[Test 5] Generating presigned URL...")
        from datetime import timedelta
        url = storage_service.get_presigned_url(
            file_path=test_file_path,
            expires=timedelta(hours=1)
        )
        if url:
            logger.success(f"✅ Presigned URL: {url[:100]}...")
        else:
            logger.warning("⚠️ Could not generate presigned URL")
        
        # Test 6: Delete file
        logger.info("\n[Test 6] Deleting file...")
        success = storage_service.delete_file(test_file_path)
        if success:
            logger.success("✅ Delete successful")
        else:
            logger.error("❌ Delete failed")
            return
        
        # Test 7: Verify deletion
        logger.info("\n[Test 7] Verifying deletion...")
        exists_after = storage_service.file_exists(test_file_path)
        if not exists_after:
            logger.success("✅ File deleted successfully")
        else:
            logger.error("❌ File still exists after deletion")
            return
        
        logger.info("\n" + "=" * 60)
        logger.success("🎉 All tests passed!")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


def display_config():
    """Display current storage configuration"""
    from app.config import settings
    
    logger.info("\n" + "=" * 60)
    logger.info("Current Storage Configuration")
    logger.info("=" * 60)
    
    logger.info(f"Storage Type: {settings.STORAGE_TYPE}")
    
    if settings.STORAGE_TYPE == "local":
        logger.info(f"Local Path: {settings.LOCAL_STORAGE_PATH}")
    
    elif settings.STORAGE_TYPE == "minio":
        logger.info(f"MinIO Endpoint: {settings.MINIO_ENDPOINT}")
        logger.info(f"MinIO Bucket: {settings.MINIO_BUCKET}")
        logger.info(f"MinIO Secure: {settings.MINIO_SECURE}")
    
    elif settings.STORAGE_TYPE == "s3":
        logger.info(f"S3 Bucket: {settings.S3_BUCKET}")
        logger.info(f"S3 Region: {settings.S3_REGION}")
        if settings.S3_ENDPOINT_URL:
            logger.info(f"S3 Endpoint: {settings.S3_ENDPOINT_URL}")
    
    logger.info("=" * 60)


if __name__ == "__main__":
    logger.info("XCodeReviewer Storage Service Test")
    
    # Display configuration
    display_config()
    
    # Run tests
    test_storage()

