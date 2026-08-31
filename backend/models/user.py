from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, Integer, String, Text

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    clerk_id = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    avatar_url = Column(String, nullable=True)
    role = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    # Last time name/email/avatar_url were refreshed from Clerk -- null for
    # rows created before this column existed, until their next sync.
    synced_at = Column(DateTime, nullable=True)
    # Manager's preferred order of worker boards on their dashboard: a JSON
    # array of worker user ids. Only ever set for managers; null means the
    # dashboard falls back to its default order.
    dashboard_layout = Column(JSON, nullable=True)

    # One Outlook connection per user, for the one-way Outlook -> meetings
    # sync. All null until the user connects; cleared together on disconnect.
    #
    # Fernet ciphertext, never the raw token -- Microsoft's access tokens last
    # about an hour, so this is the thing that actually keeps the connection
    # alive and it is the most sensitive value on the row.
    outlook_refresh_token = Column(Text, nullable=True)
    # The Graph change-notification subscription: its id so it can be renewed
    # or deleted, its expiry because subscriptions lapse after roughly three
    # days and simply stop delivering, and the clientState secret that every
    # incoming notification has to echo back before the webhook acts on it.
    outlook_subscription_id = Column(String, nullable=True)
    # Naive UTC, like created_at above -- only ever compared against utcnow().
    # Note this is NOT the naive-local convention meetings.starts_at uses.
    outlook_subscription_expires_at = Column(DateTime, nullable=True)
    outlook_client_state = Column(String, nullable=True)

    @property
    def outlook_connected(self) -> bool:
        return self.outlook_refresh_token is not None
