"""put every unfinished ticket of a custom-board account into a column

b3f1c9d24a70 mapped two statuses (`personal_work`, `working_on`) onto the
custom board. Anything else that isn't `done` -- a status the earlier mapping
didn't anticipate, or one introduced since -- would still be loaded by the API
and then rendered into no column at all: present in the database, invisible on
the board, with nothing to indicate it had gone missing.

This sweeps the remainder. Rather than list the statuses to move, it moves
everything that isn't already a custom column and isn't `done`, so a status
nobody thought of still ends up somewhere the owner can see it. Unfinished work
must always be visible; where exactly it lands is a detail the owner can fix by
dragging.

`done` is deliberately excluded: it is shared by both boards and is what
Archive reads.

Whose tickets these are comes from MANAGER_EMAIL, the same variable the
application reads, so this migration moves exactly the account that will
actually get the new board in the environment it runs in. Reading configuration
from a migration is unusual -- the reason is that the answer genuinely differs
per environment, and hardcoding it would mean prod silently migrating the wrong
person's work.

Only the manager, deliberately: the admin gets this layout in local development
only, and their tickets there are fixtures. Sweeping them would mean a
migration doing something different in one environment than another.

No schema change: data only.

Revision ID: f1c6a4e93d78
Revises: e4b8d0c71a52
Create Date: 2026-08-20

"""
import os

from alembic import op
import sqlalchemy as sa

revision = "f1c6a4e93d78"
down_revision = "e4b8d0c71a52"
branch_labels = None
depends_on = None

# Mirrors custom_board.CUSTOM_STATUSES at the time of writing. Restated rather
# than imported: a migration has to keep meaning the same thing later, even
# once that tuple has moved on.
CUSTOM_STATUSES = ("priority", "project_work", "contact", "send")

# Where anything unrecognised goes -- the column new work lands in.
LANDING_STATUS = "priority"


def upgrade():
    manager = os.getenv("MANAGER_EMAIL", "").strip().lower()
    if not manager:
        # This environment hasn't been told about the custom layout, so nobody
        # here has that board and there is nothing to move. Not an error.
        return

    tickets = sa.table(
        "tickets",
        sa.column("status", sa.String),
        sa.column("ticket_type", sa.String),
        sa.column("created_by", sa.Integer),
    )
    users = sa.table(
        "users", sa.column("id", sa.Integer), sa.column("email", sa.String)
    )
    owner_ids = sa.select(users.c.id).where(sa.func.lower(users.c.email) == manager)

    op.execute(
        tickets.update()
        .where(
            sa.and_(
                tickets.c.ticket_type == "personal",
                tickets.c.created_by.in_(owner_ids),
                tickets.c.status != "done",
                tickets.c.status.notin_(CUSTOM_STATUSES),
            )
        )
        .values(status=LANDING_STATUS)
    )


def downgrade():
    # Not reversible: the statuses these rows held before are exactly what this
    # migration discarded, and they were unreachable on this board anyway.
    # e4b8d0c71a52 is the migration that maps a board back to shared statuses.
    pass
