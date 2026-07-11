from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class RecurringTicketTemplate(Base):
    __tablename__ = "recurring_ticket_templates"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    urgency = Column(String, nullable=False)
    ticket_type = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    recurrence_day = Column(Integer, nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    creator = relationship(
        "User", foreign_keys=[created_by], backref="templates_created"
    )
    assignee = relationship(
        "User", foreign_keys=[assigned_to], backref="templates_assigned"
    )
    generated_tickets = relationship("Ticket", back_populates="template")
