"""add completed_at to tickets

Revision ID: 1bb1a85d6e16
Revises: 0ad6d0eecb90
Create Date: 2026-07-27 13:37:01.035857

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '1bb1a85d6e16'
down_revision: Union[str, None] = '0ad6d0eecb90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tickets', sa.Column('completed_at', sa.DateTime(), nullable=True))
    # Backfill from updated_at -- the best approximation available for
    # tickets that were already done before this column existed, and exactly
    # what Archive already displayed as the "completed" time until now.
    op.execute("UPDATE tickets SET completed_at = updated_at WHERE status = 'done'")


def downgrade() -> None:
    op.drop_column('tickets', 'completed_at')
