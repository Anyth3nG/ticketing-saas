"""map custom board personal tickets onto their new statuses

The custom personal board (see backend/custom_board.py) replaces the shared
worker statuses with its own. Existing personal tickets for the accounts it
covers still hold the old values, and those columns no longer exist on that
board -- without this they'd load fine and simply render nowhere.

No schema change: `tickets.status` is a plain String column, so this is data
only.

Revision ID: b3f1c9d24a70
Revises: 1bb1a85d6e16
Create Date: 2026-08-19

"""
from alembic import op
import sqlalchemy as sa

revision = "b3f1c9d24a70"
down_revision = "1bb1a85d6e16"
branch_labels = None
depends_on = None

# Kept as a literal rather than imported from custom_board: a migration has to
# keep describing what it did at the time it ran, even if that module's
# contents change later.
CUSTOM_BOARD_EMAILS = ("yulia@max-cpa.co.il", "daniel2233x@gmail.com")

# Ongoing work lands in the new default column; work already in progress maps
# to project-work, the closest equivalent. Done tickets are left alone -- they
# are Archive history and share the same `done` status on both boards.
FORWARD = {"personal_work": "priority", "working_on": "project_work"}
BACKWARD = {"priority": "personal_work", "project_work": "working_on"}


def _remap(mapping):
    tickets = sa.table(
        "tickets",
        sa.column("status", sa.String),
        sa.column("ticket_type", sa.String),
        sa.column("created_by", sa.Integer),
    )
    users = sa.table(
        "users", sa.column("id", sa.Integer), sa.column("email", sa.String)
    )
    owner_ids = sa.select(users.c.id).where(users.c.email.in_(CUSTOM_BOARD_EMAILS))

    for old_status, new_status in mapping.items():
        op.execute(
            tickets.update()
            .where(
                sa.and_(
                    tickets.c.ticket_type == "personal",
                    tickets.c.status == old_status,
                    tickets.c.created_by.in_(owner_ids),
                )
            )
            .values(status=new_status)
        )


def upgrade():
    _remap(FORWARD)


def downgrade():
    # Contact / send / meetings have no pre-existing equivalent, so tickets
    # sorted into them since the upgrade collapse back into personal_work --
    # the column they would have been in had this board never existed.
    _remap(BACKWARD)
    tickets = sa.table(
        "tickets",
        sa.column("status", sa.String),
        sa.column("ticket_type", sa.String),
    )
    op.execute(
        tickets.update()
        .where(
            sa.and_(
                tickets.c.ticket_type == "personal",
                tickets.c.status.in_(("contact", "send", "meetings")),
            )
        )
        .values(status="personal_work")
    )
