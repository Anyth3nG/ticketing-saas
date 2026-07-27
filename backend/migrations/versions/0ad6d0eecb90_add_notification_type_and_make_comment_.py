"""add notification type and make comment_id nullable

Revision ID: 0ad6d0eecb90
Revises: ca0726303bbc
Create Date: 2026-07-27 13:07:34.131682

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0ad6d0eecb90'
down_revision: Union[str, None] = 'ca0726303bbc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable at first so existing rows can be backfilled, then tightened to
    # NOT NULL -- every notification prior to this migration was a comment
    # reply, so that's the correct value for all of them.
    op.add_column('notifications', sa.Column('type', sa.String(), nullable=True))
    op.execute("UPDATE notifications SET type = 'comment' WHERE type IS NULL")
    op.alter_column('notifications', 'type', existing_type=sa.String(), nullable=False)
    op.alter_column('notifications', 'comment_id',
               existing_type=sa.INTEGER(),
               nullable=True)


def downgrade() -> None:
    op.alter_column('notifications', 'comment_id',
               existing_type=sa.INTEGER(),
               nullable=False)
    op.drop_column('notifications', 'type')
