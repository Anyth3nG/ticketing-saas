from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from auth import get_current_user, require_manager
from database import get_db
from models import (
    Notification,
    RecurringTicketTemplate,
    Ticket,
    TicketAssignment,
    TicketComment,
    User,
)
from schemas import (
    AssignmentCreate,
    PersonalTicketCreate,
    RecurringTemplateResponse,
    RecurringTemplateUpdate,
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
    if ticket.ticket_type == "personal" and ticket.created_by == user.id:
        # Personal work never becomes assigned to_do work, and skips the
        # approval step entirely -- the owner marks it done directly,
        # manager or worker alike.
        return new_status not in ("to_do", "awaiting_approval")

    if user.role == "manager":
        # Managers' only status action on tickets they don't own is
        # approving finished work.
        return ticket.status == "awaiting_approval" and new_status == "done"

    if not _can_view_ticket(ticket, user):
        return False

    # Only assigned tickets reach here: a personal ticket the caller owns was
    # already handled above, and one they don't own already failed
    # _can_view_ticket. Assigned work never becomes personal work, and only a
    # manager's approval can move it to done.
    return new_status not in ("personal_work", "done")


def _get_ticket_or_404(db: Session, ticket_id: int) -> Ticket:
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


def _can_delete_ticket(ticket: Ticket, user: User) -> bool:
    # Managers remove the work they hand out; workers remove their own personal
    # tickets. Neither can delete the other's.
    if ticket.ticket_type == "personal":
        return ticket.created_by == user.id
    return user.role == "manager"


def _comment_recipients(ticket: Ticket, author_id: int, db: Session) -> set[int]:
    recipients = {ticket.created_by, *(a.user_id for a in ticket.assignments)}
    if ticket.ticket_type == "personal":
        # Personal work has no assignee, so loop every manager in so either
        # side can follow the thread and reply.
        recipients |= {
            u.id for u in db.query(User).filter(User.role == "manager").all()
        }
    recipients.discard(author_id)
    return recipients


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


# Registered before the /{ticket_id} routes below: an untyped path parameter
# matches any string at the routing level (Starlette resolves routes in
# registration order, then FastAPI coerces the segment to int), so a static
# route like this one must come first or "recurring-templates" would be
# swallowed as ticket_id and 422 on the int conversion.
@router.get("/recurring-templates", response_model=list[RecurringTemplateResponse])
def list_recurring_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(RecurringTicketTemplate)
        .filter(
            RecurringTicketTemplate.created_by == current_user.id,
            RecurringTicketTemplate.active.is_(True),
        )
        .all()
    )


def _get_own_template_or_404(db: Session, template_id: int, user: User) -> RecurringTicketTemplate:
    template = (
        db.query(RecurringTicketTemplate)
        .filter(RecurringTicketTemplate.id == template_id)
        .first()
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Recurring ticket not found")
    if template.created_by != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return template


@router.put(
    "/recurring-templates/{template_id}", response_model=RecurringTemplateResponse
)
def update_recurring_template(
    template_id: int,
    payload: RecurringTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = _get_own_template_or_404(db, template_id, current_user)

    # Applies going forward only -- tickets already generated for past/current
    # months keep the title/urgency they were created with, same as any other
    # already-created ticket. Only future months' generate_due_recurring_tickets
    # calls pick up the change.
    template.title = payload.title
    template.description = payload.description
    template.urgency = payload.urgency
    template.recurrence_day = payload.recurrence_day
    db.commit()
    db.refresh(template)
    return template


@router.delete("/recurring-templates/{template_id}", status_code=204)
def delete_recurring_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = _get_own_template_or_404(db, template_id, current_user)

    # Deactivate rather than hard-delete: past months' completed tickets keep
    # a valid template_id FK for Archive history, and generate_due_recurring_tickets
    # already skips inactive templates, so nothing new is ever created for it.
    template.active = False

    # A full stop, not just "no more after this one" -- this month's
    # not-yet-finished occurrence (if any) is removed together with the
    # schedule. Already-done occurrences are untouched; they're history.
    live_ticket = (
        db.query(Ticket)
        .filter(Ticket.template_id == template_id, Ticket.status != "done")
        .first()
    )
    if live_ticket is not None:
        db.query(Notification).filter(
            Notification.ticket_id == live_ticket.id
        ).delete()
        db.query(TicketComment).filter(
            TicketComment.ticket_id == live_ticket.id
        ).delete()
        db.delete(live_ticket)

    db.commit()


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
    db.flush()

    for recipient_id in _comment_recipients(ticket, current_user.id, db):
        db.add(
            Notification(
                user_id=recipient_id, ticket_id=ticket.id, comment_id=comment.id
            )
        )

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
    current_user: User = Depends(get_current_user),
):
    ticket = _get_ticket_or_404(db, ticket_id)

    if ticket.is_recurring:
        raise HTTPException(
            status_code=400,
            detail="Recurring tickets can only be removed by deleting the recurring "
            "ticket itself, not a single occurrence.",
        )

    if not _can_delete_ticket(ticket, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to delete this ticket")

    # notifications and comments both carry a NOT NULL ticket_id FK, so they
    # have to go before the ticket itself or the delete FK-violates. A
    # notification also references a comment, so it must be cleared first.
    db.query(Notification).filter(Notification.ticket_id == ticket_id).delete()
    db.query(TicketComment).filter(TicketComment.ticket_id == ticket_id).delete()
    db.query(TicketAssignment).filter(TicketAssignment.ticket_id == ticket_id).delete()
    db.delete(ticket)
    db.commit()
