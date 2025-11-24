"""add webhook and pr tables

Revision ID: j9k0l1m2n3o4
Revises: i8j9k0l1m2n3
Create Date: 2025-11-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'j9k0l1m2n3o4'
down_revision: Union[str, None] = 'i8j9k0l1m2n3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add webhook and pull request related tables"""
    
    # Create PRStatus enum
    prstatus_enum = postgresql.ENUM('OPEN', 'CLOSED', 'MERGED', name='prstatus', create_type=False)
    prstatus_enum.create(op.get_bind(), checkfirst=True)
    
    # Create pull_requests table
    op.create_table(
        'pull_requests',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('pr_number', sa.Integer(), nullable=False, index=True),
        sa.Column('pr_url', sa.String(500), nullable=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('author', sa.String(255), nullable=True),
        sa.Column('author_avatar', sa.String(500), nullable=True),
        sa.Column('source_branch', sa.String(100), nullable=False),
        sa.Column('target_branch', sa.String(100), nullable=False),
        sa.Column('status', prstatus_enum, nullable=False, server_default='OPEN', index=True),
        sa.Column('changed_files_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('additions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('deletions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('commits_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('changed_files', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('pr_metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('merged_at', sa.DateTime(), nullable=True),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.UniqueConstraint('project_id', 'pr_number', name='uq_project_pr_number')
    )
    
    # Create webhook_configs table
    op.create_table(
        'webhook_configs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('platform', sa.String(50), nullable=False, index=True),
        sa.Column('webhook_url', sa.String(500), nullable=False, unique=True),
        sa.Column('secret_token', sa.String(255), nullable=False),
        sa.Column('events', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('auto_scan_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('auto_comment_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('last_triggered_at', sa.DateTime(), nullable=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True, unique=True),
    )
    
    # Create webhook_logs table
    op.create_table(
        'webhook_logs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('event_type', sa.String(100), nullable=False, index=True),
        sa.Column('event_action', sa.String(100), nullable=True),
        sa.Column('payload', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('response_status', sa.Integer(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('task_id', sa.String(255), nullable=True),
        sa.Column('processed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()'), index=True),
        sa.Column('webhook_id', sa.Integer(), sa.ForeignKey('webhook_configs.id', ondelete='CASCADE'), nullable=False, index=True),
    )
    
    # Create pr_comments table
    op.create_table(
        'pr_comments',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('comment_id', sa.BigInteger(), nullable=False),
        sa.Column('comment_type', sa.String(50), nullable=False),
        sa.Column('comment_url', sa.String(500), nullable=True),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('is_resolved', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('pull_request_id', sa.Integer(), sa.ForeignKey('pull_requests.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('audit_issue_id', sa.Integer(), sa.ForeignKey('audit_issues.id', ondelete='SET NULL'), nullable=True, index=True),
    )
    
    # Add pull_request_id to audit_tasks table
    op.add_column('audit_tasks', sa.Column('pull_request_id', sa.Integer(), sa.ForeignKey('pull_requests.id', ondelete='CASCADE'), nullable=True, index=True))
    
    # Add is_in_diff and diff_hunk to audit_issues table for PR-specific issues
    op.add_column('audit_issues', sa.Column('is_in_diff', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('audit_issues', sa.Column('diff_hunk', sa.Text(), nullable=True))
    
    print("✅ Added webhook and pull request tables")
    print("✅ Added pull_request_id to audit_tasks")
    print("✅ Added is_in_diff and diff_hunk to audit_issues")


def downgrade() -> None:
    """Remove webhook and pull request related tables"""
    
    # Remove columns from existing tables
    op.drop_column('audit_issues', 'diff_hunk')
    op.drop_column('audit_issues', 'is_in_diff')
    op.drop_column('audit_tasks', 'pull_request_id')
    
    # Drop tables in reverse order
    op.drop_table('pr_comments')
    op.drop_table('webhook_logs')
    op.drop_table('webhook_configs')
    op.drop_table('pull_requests')
    
    # Drop enum
    prstatus_enum = postgresql.ENUM('OPEN', 'CLOSED', 'MERGED', name='prstatus')
    prstatus_enum.drop(op.get_bind(), checkfirst=True)
    
    print("✅ Removed webhook and pull request tables")

