from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    ticket_type = Column(String, nullable=False, default="assigned")
    status = Column(String, nullable=False, default="to_do")
    urgency = Column(String, nullable=False)
    due_date = Column(Date, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_recurring = Column(Boolean, nullable=False, default=False)
    recurrence_day = Column(Integer, nullable=True)
    template_id = Column(
        Integer, ForeignKey("recurring_ticket_templates.id"), nullable=True
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    creator = relationship("User", backref="tickets_created")
    assignments = relationship("TicketAssignment", back_populates="ticket")
    comments = relationship("TicketComment", back_populates="ticket")
    template = relationship("RecurringTicketTemplate", back_populates="generated_tickets")
