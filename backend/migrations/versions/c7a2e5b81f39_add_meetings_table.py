"""add meetings table and retire the meetings ticket status

The Meetings column on the custom board stops being ticket-backed: a meeting
is an appointment with a start and an end, not work that moves between
statuses, so it gets its own table (see models/meeting.py). Any ticket left
sitting in the old `meetings` status is moved back to `priority`, the column
new work lands in, since that status no longer exists.

Revision ID: c7a2e5b81f39
Revises: b3f1c9d24a70
Create Date: 2026-08-19

"""
from alembic import op
import sqlalchemy as sa

revision = "c7a2e5b81f39"
down_revision = "b3f1c9d24a70"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "meetings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=True),
        sa.Column("source", sa.String(), nullable=False, server_default="manual"),
        sa.Column("outlook_event_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("outlook_event_id"),
    )
    # The board loads one user's meetings at a time and always in start order.
    op.create_index(
        "ix_meetings_user_id_starts_at", "meetings", ["user_id", "starts_at"]
    )

    tickets = sa.table(
        "tickets", sa.column("status", sa.String), sa.column("ticket_type", sa.String)
    )
    op.execute(
        tickets.update()
        .where(
            sa.and_(
                tickets.c.ticket_type == "personal", tickets.c.status == "meetings"
            )
        )
        .values(status="priority")
    )


def downgrade():
    # Meetings created here have no ticket equivalent to fall back to, so the
    # rows go with the table. Nothing referenced them.
    op.drop_index("ix_meetings_user_id_starts_at", table_name="meetings")
    op.drop_table("meetings")
