"""Add codecommit to project source

Revision ID: i8j9k0l1m2n3
Revises: h7i8j9k0l1m2
Create Date: 2025-11-13 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'i8j9k0l1m2n3'
down_revision: Union[str, None] = 'h7i8j9k0l1m2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add 'CODECOMMIT' value to ProjectSource enum"""
    # For PostgreSQL, we need to alter the enum type
    # Add CODECOMMIT (uppercase to match existing enum values)
    op.execute("""
        ALTER TYPE projectsource ADD VALUE IF NOT EXISTS 'CODECOMMIT'
    """)
    print("✅ Added 'CODECOMMIT' to ProjectSource enum")


def downgrade() -> None:
    """Remove 'codecommit' value from ProjectSource enum"""
    # Note: PostgreSQL doesn't support removing values from enums directly
    # This would require recreating the enum type and updating all references
    # For now, we'll just log a warning
    print("⚠️  Warning: Removing enum values requires recreating the enum type")
    print("⚠️  Manual intervention may be required to fully downgrade")

