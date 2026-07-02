from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="open")
    urgency = Column(String, nullable=False)
    due_date = Column(Date, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    creator = relationship("User", backref="tickets_created")
    assignments = relationship("TicketAssignment", back_populates="ticket")
