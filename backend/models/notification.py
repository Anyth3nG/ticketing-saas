from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    # Null for the "ticket_assigned" and "ticket_returned" notifications --
    # those aren't tied to any comment.
    comment_id = Column(Integer, ForeignKey("ticket_comments.id"), nullable=True)
    # "comment" (someone replied on a ticket you're on), "ticket_assigned" (a
    # manager gave you a new ticket, or reassigned an existing one to you), or
    # "ticket_returned" (a manager reviewed your finished work and sent it back
    # to be redone).
    type = Column(String, nullable=False, default="comment")
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", backref="notifications")
    ticket = relationship("Ticket")
    comment = relationship("TicketComment")
