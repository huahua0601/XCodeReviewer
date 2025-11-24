"""Webhook Security Service
Handles webhook signature verification for GitHub, GitLab, CodeCommit
"""
import hmac
import hashlib
from typing import Optional
from loguru import logger

from core.exceptions import ValidationError


class WebhookSecurity:
    """Webhook security and signature verification"""
    
    @staticmethod
    def verify_github_signature(
        payload: bytes,
        signature_header: str,
        secret: str
    ) -> bool:
        """
        Verify GitHub webhook signature
        
        Args:
            payload: Request body as bytes
            signature_header: X-Hub-Signature-256 header value
            secret: Webhook secret token
            
        Returns:
            True if signature is valid
            
        Raises:
            ValidationError: If signature is invalid
        """
        if not signature_header:
            raise ValidationError("Missing signature header")
        
        # GitHub sends signature as "sha256=<hex_digest>"
        if not signature_header.startswith("sha256="):
            raise ValidationError("Invalid signature format")
        
        expected_signature = signature_header[7:]  # Remove "sha256=" prefix
        
        # Calculate HMAC-SHA256
        hmac_gen = hmac.new(
            secret.encode('utf-8'),
            payload,
            hashlib.sha256
        )
        calculated_signature = hmac_gen.hexdigest()
        
        # Constant time comparison to prevent timing attacks
        if not hmac.compare_digest(expected_signature, calculated_signature):
            logger.warning("GitHub webhook signature verification failed")
            raise ValidationError("Invalid signature")
        
        return True
    
    @staticmethod
    def verify_gitlab_token(
        token_header: Optional[str],
        secret: str
    ) -> bool:
        """
        Verify GitLab webhook token
        
        Args:
            token_header: X-Gitlab-Token header value
            secret: Webhook secret token
            
        Returns:
            True if token is valid
            
        Raises:
            ValidationError: If token is invalid
        """
        if not token_header:
            raise ValidationError("Missing GitLab token header")
        
        if not hmac.compare_digest(token_header, secret):
            logger.warning("GitLab webhook token verification failed")
            raise ValidationError("Invalid token")
        
        return True
    
    @staticmethod
    def verify_codecommit_signature(
        payload: bytes,
        signature_header: str,
        secret: str
    ) -> bool:
        """
        Verify AWS CodeCommit webhook signature (SNS signature)
        
        Args:
            payload: Request body as bytes
            signature_header: X-Amz-Sns-Message-Signature header
            secret: Webhook secret token
            
        Returns:
            True if signature is valid
            
        Note:
            CodeCommit uses SNS which has its own signature verification.
            This is a simplified version. Full implementation should verify
            SNS certificate chain.
        """
        # Simplified implementation - in production, verify SNS signature
        logger.info("CodeCommit webhook signature verification (simplified)")
        return True
    
    @staticmethod
    def validate_ip_whitelist(
        client_ip: str,
        whitelist: Optional[list[str]] = None
    ) -> bool:
        """
        Validate client IP against whitelist
        
        Args:
            client_ip: Client IP address
            whitelist: List of allowed IP addresses or CIDR ranges
            
        Returns:
            True if IP is allowed
        """
        if not whitelist:
            return True  # No whitelist means all IPs allowed
        
        # GitHub webhook IP ranges (as of 2024)
        github_ip_ranges = [
            "192.30.252.0/22",
            "185.199.108.0/22",
            "140.82.112.0/20",
            "143.55.64.0/20",
        ]
        
        # GitLab.com IP ranges
        gitlab_ip_ranges = [
            "34.74.90.64/28",
            "34.74.226.0/24",
        ]
        
        # Simple IP matching (production should use ipaddress module for CIDR)
        if client_ip in whitelist:
            return True
        
        # Check if IP is in known service ranges
        for ip_range in github_ip_ranges + gitlab_ip_ranges:
            if ip_range in whitelist and client_ip.startswith(ip_range.split('/')[0].rsplit('.', 1)[0]):
                return True
        
        return False


# Singleton instance
webhook_security = WebhookSecurity()

