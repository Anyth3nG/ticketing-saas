import calendar
from datetime import date, datetime

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from models import RecurringTicketTemplate, Ticket, User


def _clamped_due_date(today: date, recurrence_day: int) -> date:
    last_day_of_month = calendar.monthrange(today.year, today.month)[1]
    return date(today.year, today.month, min(recurrence_day, last_day_of_month))


def generate_due_recurring_tickets(db: Session, user: User) -> None:
    today = date.today()

    query = db.query(RecurringTicketTemplate).filter(
        RecurringTicketTemplate.active.is_(True)
    )
    if user.role == "manager":
        query = query.filter(RecurringTicketTemplate.created_by == user.id)
    else:
        query = query.filter(
            or_(
                RecurringTicketTemplate.assigned_to == user.id,
                and_(
                    RecurringTicketTemplate.ticket_type == "personal",
                    RecurringTicketTemplate.created_by == user.id,
                ),
            )
        )

    month_start = datetime(today.year, today.month, 1)
    next_month_start = (
        datetime(today.year + 1, 1, 1)
        if today.month == 12
        else datetime(today.year, today.month + 1, 1)
    )

    # with_for_update() locks each matching template row for the rest of this
    # transaction, so a second concurrent call for the same user (e.g. two
    # overlapping GET /tickets/ requests) blocks here instead of racing past
    # the already_generated check below and creating a duplicate ticket.
    for template in query.with_for_update().all():
        due_date = _clamped_due_date(today, template.recurrence_day)

        # Materialize the ticket for the whole current month as soon as it's
        # visited, not just once the recurrence_day arrives -- lets a Month
        # view show what's coming later in the month, not just what's due
        # right now. due_date still reflects the real recurrence day, so
        # Today/Week filtering elsewhere is unaffected.
        already_generated = (
            db.query(Ticket)
            .filter(
                Ticket.template_id == template.id,
                Ticket.created_at >= month_start,
                Ticket.created_at < next_month_start,
            )
            .first()
            is not None
        )
        if already_generated:
            continue

        ticket = Ticket(
            title=template.title,
            description=template.description,
            urgency=template.urgency,
            ticket_type=template.ticket_type,
            status="to_do" if template.ticket_type == "assigned" else "personal_work",
            due_date=due_date,
            created_by=template.created_by,
            assigned_to=template.assigned_to if template.ticket_type == "assigned" else None,
            template_id=template.id,
            is_recurring=True,
        )
        db.add(ticket)

    db.commit()
