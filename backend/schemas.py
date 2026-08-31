from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field

# Aliased on import: these read as predicates about a user, and the local names
# would otherwise collide with the computed fields of the same name below.
from custom_board import is_admin as _is_admin
from custom_board import uses_custom_board as _uses_custom_board

Urgency = Literal["low", "medium", "high"]
TicketStatus = Literal[
    # Shared statuses: the manager/worker flow.
    "to_do",
    "personal_work",
    "working_on",
    "awaiting_approval",
    "done",
    # Custom personal-board statuses -- see custom_board.py. Listed here
    # because status is a single shared column: the values are only reachable
    # by the accounts that board is scoped to, enforced in
    # routes/tickets.py::_can_update_status, not by this Literal.
    "priority",
    "project_work",
    "contact",
    "send",
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
    dashboard_layout: Optional[list[int]] = None

    # Derived server-side rather than re-decided in the browser: the frontend
    # would otherwise need its own copy of ADMIN_EMAIL / MANAGER_EMAIL, baked
    # in at build time, with nothing keeping the two in step. See
    # custom_board.py.
    @computed_field
    @property
    def is_admin(self) -> bool:
        return _is_admin(self)

    @computed_field
    @property
    def uses_custom_layout(self) -> bool:
        return _uses_custom_board(self)


class DashboardLayoutUpdate(BaseModel):
    worker_order: list[int]


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
    completed_at: Optional[datetime] = None
    assignee: Optional[UserResponse] = None
    comment_count: int = 0

    @staticmethod
    def from_ticket(ticket) -> "TicketResponse":
        response = TicketResponse.model_validate(ticket)
        response.assignee = (
            UserResponse.model_validate(ticket.assignee) if ticket.assignee else None
        )
        response.comment_count = len(ticket.comments)
        return response


class PersonalTicketCreate(BaseModel):
    title: str
    description: Optional[str] = None
    urgency: Urgency
    is_recurring: bool = False
    due_date: Optional[date] = None
    recurrence_day: Optional[int] = Field(default=None, ge=1, le=31)
    # Which column the ticket starts in, for boards that let you choose.
    # Optional so every existing caller keeps the default landing status.
    #
    # Being a TicketStatus only means the value is a real status -- it says
    # nothing about whether this caller may use it. That check lives in the
    # route; see create_personal_ticket.
    status: Optional[TicketStatus] = None


class RecurringTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    ticket_type: str
    urgency: Urgency
    recurrence_day: int
    active: bool
    created_by: int


class RecurringTemplateUpdate(BaseModel):
    title: str
    description: Optional[str] = None
    urgency: Urgency
    recurrence_day: int = Field(ge=1, le=31)


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


class MeetingCreate(BaseModel):
    title: str
    notes: Optional[str] = None
    location: Optional[str] = None
    starts_at: datetime
    ends_at: Optional[datetime] = None


class MeetingUpdate(BaseModel):
    # All optional: the client sends only what changed. `ends_at` is
    # deliberately not distinguishable from "clear it" here -- sending null
    # clears it, which is the only sensible reading for an optional end time.
    title: Optional[str] = None
    notes: Optional[str] = None
    location: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class MeetingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    notes: Optional[str]
    location: Optional[str]
    starts_at: datetime
    ends_at: Optional[datetime]
    source: str
    is_editable: bool

    # The board decides which day something belongs to by comparing plain
    # "YYYY-MM-DD" strings. starts_at is naive local time, so its date part is
    # already the local calendar day -- serialized as its own field so the
    # client never has to parse a datetime just to bucket an entry by day.
    @computed_field
    @property
    def date(self) -> str:
        return self.starts_at.date().isoformat()


class AdminWorkView(BaseModel):
    user: UserResponse
    tickets: list[TicketResponse]
    templates: list[RecurringTemplateResponse]
    meetings: list[MeetingResponse] = []


NotificationType = Literal["comment", "ticket_assigned", "ticket_returned"]


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticket_id: int
    type: NotificationType
    is_read: bool
    created_at: datetime
    ticket_title: str = ""
    comment: Optional[TicketCommentResponse] = None

    @staticmethod
    def from_notification(notification) -> "NotificationResponse":
        response = NotificationResponse.model_validate(notification)
        response.ticket_title = notification.ticket.title
        return response
