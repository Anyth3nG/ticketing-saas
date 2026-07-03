from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user, require_manager
from database import get_db
from models import Ticket, TicketAssignment, User
from schemas import TicketCreate, TicketResponse, TicketStatusUpdate, TicketUpdate

router = APIRouter(prefix="/tickets", tags=["tickets"])

WORKER_ALLOWED_STATUSES = {"working_on", "awaiting_approval", "done"}


def _is_assigned(ticket: Ticket, user_id: int) -> bool:
    return any(a.user_id == user_id for a in ticket.assignments)


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


@router.get("/", response_model=list[TicketResponse])
def list_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "manager":
        tickets = db.query(Ticket).all()
    else:
        tickets = (
            db.query(Ticket)
            .join(TicketAssignment)
            .filter(TicketAssignment.user_id == current_user.id)
            .all()
        )
    return [TicketResponse.from_ticket(t) for t in tickets]


@router.get("/{ticket_id}", response_model=TicketResponse)
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = _get_ticket_or_404(db, ticket_id)

    if current_user.role != "manager" and not _is_assigned(ticket, current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    return TicketResponse.from_ticket(ticket)


@router.put("/{ticket_id}", response_model=TicketResponse)
def update_ticket(
    ticket_id: int,
    payload: TicketUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    ticket = _get_ticket_or_404(db, ticket_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ticket, field, value)

    db.commit()
    db.refresh(ticket)
    return TicketResponse.from_ticket(ticket)


@router.put("/{ticket_id}/status", response_model=TicketResponse)
def update_ticket_status(
    ticket_id: int,
    payload: TicketStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = _get_ticket_or_404(db, ticket_id)

    if current_user.role != "manager":
        if not _is_assigned(ticket, current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")
        if payload.status not in WORKER_ALLOWED_STATUSES:
            raise HTTPException(
                status_code=403, detail="Workers cannot set this status"
            )

    ticket.status = payload.status
    db.commit()
    db.refresh(ticket)
    return TicketResponse.from_ticket(ticket)


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
