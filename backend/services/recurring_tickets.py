import calendar
from datetime import date

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from custom_board import personal_landing_status
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

    month_start = date(today.year, today.month, 1)
    next_month_start = (
        date(today.year + 1, 1, 1)
        if today.month == 12
        else date(today.year, today.month + 1, 1)
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
        #
        # Matched on due_date, not created_at. due_date is derived from
        # `today` and is always inside the current month by construction (see
        # _clamped_due_date), so it answers "does this month's instance exist
        # yet" using the same clock the window is built from. created_at is
        # the wall-clock insert time in UTC, which is a *different* clock from
        # date.today()'s local one: for the first few hours of the 1st of a
        # month in a UTC+N timezone, the window is the new month while
        # created_at is still stamped in the old one, so nothing ever matched
        # and every request generated another copy of the same ticket.
        already_generated = (
            db.query(Ticket)
            .filter(
                Ticket.template_id == template.id,
                Ticket.due_date >= month_start,
                Ticket.due_date < next_month_start,
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
            # Every personal template reaching this loop was created by
            # `user` (both query branches above filter personal templates to
            # created_by == user.id), so their landing status is theirs.
            status=(
                "to_do"
                if template.ticket_type == "assigned"
                else personal_landing_status(user)
            ),
            due_date=due_date,
            created_by=template.created_by,
            assigned_to=template.assigned_to if template.ticket_type == "assigned" else None,
            template_id=template.id,
            is_recurring=True,
        )
        db.add(ticket)

    db.commit()
