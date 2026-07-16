from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Urgency = Literal["low", "medium", "high"]
TicketStatus = Literal[
    "to_do", "personal_work", "working_on", "awaiting_approval", "done"
]


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clerk_id: str
    email: str
    name: str
    avatar_url: Optional[str] = None
    role: str
    created_at: datetime


class TicketCreate(BaseModel):
    title: str
    description: Optional[str] = None
    urgency: Urgency
    due_date: date
    assigned_to: int


class TicketUpdate(BaseModel):
    # status is deliberately excluded -- PATCH /tickets/{id}/status is the
    # only path for status changes, since it carries authorization that
    # this endpoint's field-level edit check doesn't (e.g. a manager could
    # otherwise set status directly and bypass the approve-only rule there).
    title: Optional[str] = None
    description: Optional[str] = None
    urgency: Optional[Urgency] = None
    due_date: Optional[date] = None


class TicketStatusUpdate(BaseModel):
    status: TicketStatus


class TicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str]
    ticket_type: str
    status: str
    urgency: str
    due_date: date
    is_recurring: bool
    created_by: int
    created_at: datetime
    updated_at: datetime
    assignees: list[UserResponse] = []
    comment_count: int = 0

    @staticmethod
    def from_ticket(ticket) -> "TicketResponse":
        response = TicketResponse.model_validate(ticket)
        response.assignees = [
            UserResponse.model_validate(a.user) for a in ticket.assignments
        ]
        response.comment_count = len(ticket.comments)
        return response


class PersonalTicketCreate(BaseModel):
    title: str
    description: Optional[str] = None
    urgency: Urgency
    is_recurring: bool = False
    due_date: Optional[date] = None
    recurrence_day: Optional[int] = Field(default=None, ge=1, le=31)


class RecurringTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    ticket_type: str
    recurrence_day: int
    active: bool


class AssignmentCreate(BaseModel):
    user_id: int


class TicketCommentCreate(BaseModel):
    content: str


class TicketCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticket_id: int
    content: str
    created_at: datetime
    user: UserResponse


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticket_id: int
    is_read: bool
    created_at: datetime
    ticket_title: str = ""
    comment: TicketCommentResponse

    @staticmethod
    def from_notification(notification) -> "NotificationResponse":
        response = NotificationResponse.model_validate(notification)
        response.ticket_title = notification.ticket.title
        return response
