"""return the CEO's personal tickets to the shared statuses

While the custom board was being built it was enabled for a second account so
it could be worked on interactively, and b3f1c9d24a70 moved that account's
personal tickets onto the custom statuses along with it. The board now belongs
to one person again, so those tickets have to come back -- otherwise they hold
statuses the standard board has no column for and simply stop rendering.

Reverses b3f1c9d24a70's mapping for that one account, and folds the three
statuses with no standard equivalent into personal_work. Yulia's tickets are
untouched.

No schema change: data only.

Revision ID: e4b8d0c71a52
Revises: c7a2e5b81f39
Create Date: 2026-08-19

"""
from alembic import op
import sqlalchemy as sa

revision = "e4b8d0c71a52"
down_revision = "c7a2e5b81f39"
branch_labels = None
depends_on = None

# Written out rather than imported from custom_board: a migration has to keep
# describing what it did at the time it ran, and this address is being removed
# from that module by the same change.
CEO_EMAIL = "daniel2233x@gmail.com"

# project_work maps back to working_on, which is where b3f1c9d24a70 brought it
# from. contact and send never had a standard equivalent, so they land in
# personal_work alongside priority -- the column ordinary personal work lives
# in.
BACKWARD = {
    "priority": "personal_work",
    "project_work": "working_on",
    "contact": "personal_work",
    "send": "personal_work",
}
FORWARD = {"personal_work": "priority", "working_on": "project_work"}


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
    owner_ids = sa.select(users.c.id).where(users.c.email == CEO_EMAIL)

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
    _remap(BACKWARD)


def downgrade():
    _remap(FORWARD)
