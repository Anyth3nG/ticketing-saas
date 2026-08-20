from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class Meeting(Base):
    """An entry in the Meetings column of the custom personal board.

    Deliberately not a Ticket: a meeting isn't work that moves between
    statuses, it's an appointment with a start and an end. Keeping it in its
    own table means ticket queries never have to start excluding meetings, and
    leaves room for the fields a calendar entry needs and a ticket doesn't.

    Shaped for the planned one-way Outlook sync (Outlook -> board). Anything
    that arrives that way is a mirror of a record owned elsewhere, so
    `outlook_event_id` gives a later sync something stable to match on --
    letting it update or remove an entry it created before, instead of
    inserting a duplicate every run. Entries created in the app have it null.
    """

    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    location = Column(String, nullable=True)

    # Naive local wall-clock time, matching how due_date already stores a plain
    # local calendar date -- the whole team is in one timezone, and a meeting
    # is only ever read in that timezone. The Outlook sync will need to convert
    # its timezone-aware values to local before writing them here; that
    # conversion is the one place the distinction matters.
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=True)

    # "manual" for entries created in the app, "outlook" for mirrored ones.
    # Mirrored entries are read-only here: the sync is one-way, so an edit made
    # on this side would be silently overwritten on the next run.
    source = Column(String, nullable=False, default="manual")
    outlook_event_id = Column(String, nullable=True, unique=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user = relationship("User", backref="meetings")

    @property
    def is_editable(self) -> bool:
        return self.source == "manual"
