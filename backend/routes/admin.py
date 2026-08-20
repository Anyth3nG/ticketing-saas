from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import get_current_user
from custom_board import is_admin, manager_email
from database import get_db
from models import Meeting, RecurringTicketTemplate, Ticket, TicketComment, User
from schemas import AdminWorkView, TicketCommentResponse, TicketResponse
from services.recurring_tickets import generate_due_recurring_tickets

router = APIRouter(prefix="/admin", tags=["admin"])

# The admin looking at the manager's board -- not a permission tier, and not a
# generic "view any user as admin" feature. Both accounts come from
# configuration (ADMIN_EMAIL, MANAGER_EMAIL -- see custom_board.py); unset means
# this page answers for nobody. Revisit the whole route before generalizing it
# to arbitrary viewers.


def require_ceo(user: User = Depends(get_current_user)) -> User:
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Not authorized")
    return user


def _get_target_or_404(db: Session) -> User:
    target_email = manager_email()
    target = (
        db.query(User).filter(func.lower(User.email) == target_email).first()
        if target_email
        else None
    )
    if target is None:
        # Expected where the account hasn't been provisioned, or where this
        # page hasn't been configured at all.
        raise HTTPException(
            status_code=404, detail="Target account not found in this environment"
        )
    return target


@router.get("/yulia-work", response_model=AdminWorkView)
def get_yulia_work(db: Session = Depends(get_db), _: User = Depends(require_ceo)):
    target = _get_target_or_404(db)
    generate_due_recurring_tickets(db, target)

    # Same scope as target's own "My Work" board: their personal tickets only,
    # not-yet-archived.
    tickets = (
        db.query(Ticket)
        .filter(
            Ticket.ticket_type == "personal",
            Ticket.created_by == target.id,
            Ticket.status != "done",
        )
        .all()
    )
    templates = (
        db.query(RecurringTicketTemplate)
        .filter(
            RecurringTicketTemplate.created_by == target.id,
            RecurringTicketTemplate.active.is_(True),
        )
        .all()
    )

    meetings = (
        db.query(Meeting)
        .filter(Meeting.user_id == target.id)
        .order_by(Meeting.starts_at.asc())
        .all()
    )

    return AdminWorkView(
        user=target,
        tickets=[TicketResponse.from_ticket(t) for t in tickets],
        templates=templates,
        meetings=meetings,
    )


@router.get(
    "/yulia-work/tickets/{ticket_id}/comments",
    response_model=list[TicketCommentResponse],
)
def get_yulia_ticket_comments(
    ticket_id: int, db: Session = Depends(get_db), _: User = Depends(require_ceo)
):
    target = _get_target_or_404(db)
    # Re-derived from target on every call rather than trusting the client's
    # ticket_id alone -- keeps this endpoint from becoming a way to read
    # comments on tickets that aren't the target's own personal work.
    ticket = (
        db.query(Ticket)
        .filter(
            Ticket.id == ticket_id,
            Ticket.ticket_type == "personal",
            Ticket.created_by == target.id,
        )
        .first()
    )
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    return (
        db.query(TicketComment)
        .filter(TicketComment.ticket_id == ticket_id)
        .order_by(TicketComment.created_at.asc())
        .all()
    )
