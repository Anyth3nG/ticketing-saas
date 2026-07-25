"""replace ticket_assignments with tickets.assigned_to

Revision ID: ca0726303bbc
Revises: ea4194f80f45
Create Date: 2026-07-25 16:37:40.381190

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'ca0726303bbc'
down_revision: Union[str, None] = 'ea4194f80f45'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tickets', sa.Column('assigned_to', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'tickets_assigned_to_fkey', 'tickets', 'users', ['assigned_to'], ['id'],
    )

    # Data migration: carry each ticket's assignee over from the join table
    # before it's dropped. The app only ever keeps one ticket_assignments row
    # alive per ticket (assign_ticket deletes-then-inserts on reassignment),
    # so this is unambiguous.
    op.execute(
        "UPDATE tickets SET assigned_to = ticket_assignments.user_id "
        "FROM ticket_assignments "
        "WHERE tickets.id = ticket_assignments.ticket_id"
    )

    op.drop_table('ticket_assignments')


def downgrade() -> None:
    op.create_table(
        'ticket_assignments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('ticket_id', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('user_id', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('assigned_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=False),
        sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], name='ticket_assignments_ticket_id_fkey'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='ticket_assignments_user_id_fkey'),
        sa.PrimaryKeyConstraint('id', name='ticket_assignments_pkey'),
    )

    # Reverse the data migration before assigned_to goes out of use
    op.execute(
        "INSERT INTO ticket_assignments (ticket_id, user_id, assigned_at) "
        "SELECT id, assigned_to, now() FROM tickets WHERE assigned_to IS NOT NULL"
    )

    op.drop_constraint('tickets_assigned_to_fkey', 'tickets', type_='foreignkey')
    op.drop_column('tickets', 'assigned_to')
