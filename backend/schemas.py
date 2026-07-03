from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

Urgency = Literal["low", "medium", "high"]
TicketStatus = Literal["open", "working_on", "awaiting_approval", "done"]


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clerk_id: str
    email: str
    name: str
    role: str
    created_at: datetime


class TicketCreate(BaseModel):
    title: str
    description: Optional[str] = None
    urgency: Urgency
    due_date: date
    assigned_to: int


class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    urgency: Optional[Urgency] = None
    due_date: Optional[date] = None
    status: Optional[TicketStatus] = None


class TicketStatusUpdate(BaseModel):
    status: TicketStatus


class TicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str]
    status: str
    urgency: str
    due_date: date
    created_by: int
    created_at: datetime
    updated_at: datetime
    assignees: list[UserResponse] = []

    @staticmethod
    def from_ticket(ticket) -> "TicketResponse":
        response = TicketResponse.model_validate(ticket)
        response.assignees = [
            UserResponse.model_validate(a.user) for a in ticket.assignments
        ]
        return response
