from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, Integer, String

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
