from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from auth import get_current_user, require_manager
from database import get_db
from models import RecurringTicketTemplate, Ticket, TicketAssignment, TicketComment, User
from schemas import (
    AssignmentCreate,
    PersonalTicketCreate,
    RecurringTemplateResponse,
    TicketCommentCreate,
    TicketCommentResponse,
    TicketCreate,
    TicketResponse,
    TicketStatusUpdate,
    TicketUpdate,
)
from services.recurring_tickets import generate_due_recurring_tickets

router = APIRouter(prefix="/tickets", tags=["tickets"])


def _is_assigned(ticket: Ticket, user_id: int) -> bool:
    return any(a.user_id == user_id for a in ticket.assignments)


def _can_view_ticket(ticket: Ticket, user: User) -> bool:
    if user.role == "manager":
        return True
    if _is_assigned(ticket, user.id):
        return True
    return ticket.ticket_type == "personal" and ticket.created_by == user.id


def _can_edit_ticket_fields(ticket: Ticket, user: User) -> bool:
    if ticket.ticket_type == "personal" and ticket.created_by == user.id:
        return True
    # Managers can only edit while a ticket is still in to_do -- once work has
    # started, field edits go through the assigned worker instead.
    return user.role == "manager" and ticket.status == "to_do"


def _can_update_status(ticket: Ticket, user: User, new_status: str) -> bool:
    if user.role == "manager":
        # Managers' only status action is approving finished work.
        return ticket.status == "awaiting_approval" and new_status == "done"
    return _can_view_ticket(ticket, user)


def _get_ticket_or_404(db: Session, ticket_id: int) -> Ticket:
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@router.post("/", response_model=TicketResponse, status_code=201)
def create_ticket(
    payload: TicketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    assignee = db.query(User).filter(User.id == payload.assigned_to).first()
    if assignee is None:
        raise HTTPException(status_code=400, detail="assigned_to user not found")

    ticket = Ticket(
        title=payload.title,
        description=payload.description,
        urgency=payload.urgency,
        due_date=payload.due_date,
        created_by=current_user.id,
    )
    db.add(ticket)
    db.flush()

    db.add(TicketAssignment(ticket_id=ticket.id, user_id=assignee.id))
    db.commit()
    db.refresh(ticket)

    return TicketResponse.from_ticket(ticket)


@router.post("/personal", status_code=201)
def create_personal_ticket(
    payload: PersonalTicketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a personal ticket for the current user.

    Returns a `TicketResponse` when `is_recurring` is False — a one-off ticket is
    created immediately with the given `due_date`. Returns a
    `RecurringTemplateResponse` when `is_recurring` is True — no `Ticket` row is
    created here; the first (and every subsequent month's) ticket is materialized
    lazily by `generate_due_recurring_tickets` the next time this user's ticket
    list is fetched, the same mechanism already used for assigned recurring
    tickets.
    """
    if payload.is_recurring:
        if payload.recurrence_day is None:
            raise HTTPException(
                status_code=400,
                detail="recurrence_day is required when is_recurring is true",
            )
        if payload.due_date is not None:
            raise HTTPException(
                status_code=400,
                detail="due_date is not allowed when is_recurring is true",
            )

        template = RecurringTicketTemplate(
            title=payload.title,
            description=payload.description,
            urgency=payload.urgency,
            ticket_type="personal",
            created_by=current_user.id,
            assigned_to=None,
            recurrence_day=payload.recurrence_day,
            active=True,
        )
        db.add(template)
        db.commit()
        db.refresh(template)
        return RecurringTemplateResponse.model_validate(template)

    if payload.due_date is None:
        raise HTTPException(
            status_code=400, detail="due_date is required when is_recurring is false"
        )

    ticket = Ticket(
        title=payload.title,
        description=payload.description,
        urgency=payload.urgency,
        ticket_type="personal",
        status="personal_work",
        due_date=payload.due_date,
        created_by=current_user.id,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return TicketResponse.from_ticket(ticket)


@router.get("/", response_model=list[TicketResponse])
def list_tickets(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    generate_due_recurring_tickets(db, current_user)

    query = db.query(Ticket)
    if current_user.role != "manager":
        query = (
            query.outerjoin(TicketAssignment)
            .filter(
                or_(
                    TicketAssignment.user_id == current_user.id,
                    and_(
                        Ticket.ticket_type == "personal",
                        Ticket.created_by == current_user.id,
                    ),
                )
            )
            .distinct()
        )

    if not include_archived:
        query = query.filter(Ticket.status != "done")

    tickets = query.all()
    return [TicketResponse.from_ticket(t) for t in tickets]


@router.get("/{ticket_id}", response_model=TicketResponse)
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = _get_ticket_or_404(db, ticket_id)

    if not _can_view_ticket(ticket, current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    return TicketResponse.from_ticket(ticket)


@router.put("/{ticket_id}", response_model=TicketResponse)
def update_ticket(
    ticket_id: int,
    payload: TicketUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = _get_ticket_or_404(db, ticket_id)

    if not _can_edit_ticket_fields(ticket, current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ticket, field, value)

    db.commit()
    db.refresh(ticket)
    return TicketResponse.from_ticket(ticket)


@router.patch("/{ticket_id}/status", response_model=TicketResponse)
def update_ticket_status(
    ticket_id: int,
    payload: TicketStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = _get_ticket_or_404(db, ticket_id)

    if not _can_update_status(ticket, current_user, payload.status):
        raise HTTPException(status_code=403, detail="Not authorized")

    ticket.status = payload.status
    db.commit()
    db.refresh(ticket)
    return TicketResponse.from_ticket(ticket)


@router.post("/{ticket_id}/assignments", response_model=TicketResponse)
def assign_ticket(
    ticket_id: int,
    payload: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    ticket = _get_ticket_or_404(db, ticket_id)

    assignee = db.query(User).filter(User.id == payload.user_id).first()
    if assignee is None:
        raise HTTPException(status_code=400, detail="user_id not found")

    db.query(TicketAssignment).filter(TicketAssignment.ticket_id == ticket_id).delete()
    db.add(TicketAssignment(ticket_id=ticket.id, user_id=assignee.id))
    db.commit()
    db.refresh(ticket)
    return TicketResponse.from_ticket(ticket)


@router.post(
    "/{ticket_id}/comments", response_model=TicketCommentResponse, status_code=201
)
def create_comment(
    ticket_id: int,
    payload: TicketCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = _get_ticket_or_404(db, ticket_id)

    if not _can_view_ticket(ticket, current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    comment = TicketComment(
        ticket_id=ticket.id, user_id=current_user.id, content=payload.content
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.get("/{ticket_id}/comments", response_model=list[TicketCommentResponse])
def list_comments(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = _get_ticket_or_404(db, ticket_id)

    if not _can_view_ticket(ticket, current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    return (
        db.query(TicketComment)
        .filter(TicketComment.ticket_id == ticket_id)
        .order_by(TicketComment.created_at.asc())
        .all()
    )


@router.delete("/{ticket_id}", status_code=204)
def delete_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    ticket = _get_ticket_or_404(db, ticket_id)

    db.query(TicketAssignment).filter(TicketAssignment.ticket_id == ticket_id).delete()
    db.delete(ticket)
    db.commit()
