from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import RecurringTicketTemplate, Ticket, TicketComment, User
from schemas import AdminWorkView, TicketCommentResponse, TicketResponse
from services.recurring_tickets import generate_due_recurring_tickets

router = APIRouter(prefix="/admin", tags=["admin"])

# Deliberately hardcoded rather than a generic "view any user's work page as
# admin" feature: this is a one-off peek at one specific report's board for
# one specific person, not a permission tier. Revisit before generalizing.
CEO_EMAIL = "daniel2233x@gmail.com"
TARGET_EMAIL = "yulia@max-cpa.co.il"


def require_ceo(user: User = Depends(get_current_user)) -> User:
    if user.email != CEO_EMAIL:
        raise HTTPException(status_code=403, detail="Not authorized")
    return user


def _get_target_or_404(db: Session) -> User:
    target = db.query(User).filter(User.email == TARGET_EMAIL).first()
    if target is None:
        # Expected outside prod: this account may not have been provisioned
        # in dev/test.
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

    return AdminWorkView(
        user=target,
        tickets=[TicketResponse.from_ticket(t) for t in tickets],
        templates=templates,
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
