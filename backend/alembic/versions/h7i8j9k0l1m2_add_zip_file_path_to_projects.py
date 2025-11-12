"""Add zip_file_path to projects

Revision ID: h7i8j9k0l1m2
Revises: g6h7i8j9k0l1
Create Date: 2025-11-12 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h7i8j9k0l1m2'
down_revision: Union[str, None] = 'g6h7i8j9k0l1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add zip_file_path column to projects table"""
    # Add zip_file_path column
    op.add_column('projects', 
        sa.Column('zip_file_path', sa.String(length=500), nullable=True, 
                  comment='Path to uploaded ZIP file in storage')
    )
    print("✅ Added zip_file_path column to projects table")


def downgrade() -> None:
    """Remove zip_file_path column from projects table"""
    # Remove zip_file_path column
    op.drop_column('projects', 'zip_file_path')
    print("✅ Removed zip_file_path column from projects table")

