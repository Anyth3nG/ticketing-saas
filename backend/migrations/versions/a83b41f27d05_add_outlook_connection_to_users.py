"""add outlook connection columns to users

Holds one Outlook connection per user, for the one-way Outlook -> meetings
sync. On `users` rather than in a table of its own because a person has at
most one mailbox here; a second one would be a different feature, not a
second row.

The refresh token is what keeps the connection alive -- Microsoft's access
tokens expire in about an hour -- so it is stored encrypted (Fernet) and the
column holds ciphertext, never the raw token. The subscription columns track
the Graph change-notification subscription: its id so it can be renewed or
deleted, its expiry because subscriptions lapse after roughly three days and
stop delivering silently, and the clientState secret that every incoming
notification must echo back before the webhook will act on it.

`outlook_subscription_expires_at` is naive UTC, matching created_at/synced_at
on this table. That is deliberately NOT the convention on meetings.starts_at,
which is naive LOCAL wall-clock -- this value is only ever compared against
utcnow(), never shown to anyone.

Revision ID: a83b41f27d05
Revises: f1c6a4e93d78
Create Date: 2026-08-25

"""
from alembic import op
import sqlalchemy as sa

revision = "a83b41f27d05"
down_revision = "f1c6a4e93d78"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("outlook_refresh_token", sa.Text(), nullable=True))
    op.add_column(
        "users", sa.Column("outlook_subscription_id", sa.String(), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column("outlook_subscription_expires_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "users", sa.Column("outlook_client_state", sa.String(), nullable=True)
    )


def downgrade():
    op.drop_column("users", "outlook_client_state")
    op.drop_column("users", "outlook_subscription_expires_at")
    op.drop_column("users", "outlook_subscription_id")
    op.drop_column("users", "outlook_refresh_token")
