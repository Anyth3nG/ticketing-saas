import itertools
from datetime import date

from models import RecurringTicketTemplate, Ticket, TicketAssignment, User
from services import recurring_tickets as svc

TODAY = date(2026, 7, 15)

_user_seq = itertools.count()


def _freeze_today(monkeypatch, fixed: date = TODAY) -> None:
    class _FixedDate(date):
        @classmethod
        def today(cls):
            return fixed

    monkeypatch.setattr(svc, "date", _FixedDate)


def _make_user(db, role: str) -> User:
    n = next(_user_seq)
    user = User(
        clerk_id=f"clerk_{n}", email=f"user{n}@example.com", name=f"User {n}", role=role
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_template(
    db,
    *,
    creator: User,
    ticket_type: str,
    recurrence_day: int,
    assignee: User | None = None,
    active: bool = True,
) -> RecurringTicketTemplate:
    template = RecurringTicketTemplate(
        title="Weekly report",
        description="Fill out the weekly status report",
        urgency="medium",
        ticket_type=ticket_type,
        created_by=creator.id,
        assigned_to=assignee.id if assignee else None,
        recurrence_day=recurrence_day,
        active=active,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def test_due_template_generates_ticket_on_first_call(db, monkeypatch):
    _freeze_today(monkeypatch)
    manager = _make_user(db, "manager")
    worker = _make_user(db, "worker")
    template = _make_template(
        db, creator=manager, ticket_type="assigned", recurrence_day=15, assignee=worker
    )

    svc.generate_due_recurring_tickets(db, manager)

    tickets = db.query(Ticket).filter(Ticket.template_id == template.id).all()
    assert len(tickets) == 1
    assert tickets[0].status == "to_do"
    assert tickets[0].is_recurring is True
    assert tickets[0].due_date == TODAY


def test_calling_twice_in_same_month_does_not_duplicate(db, monkeypatch):
    _freeze_today(monkeypatch)
    manager = _make_user(db, "manager")
    worker = _make_user(db, "worker")
    template = _make_template(
        db, creator=manager, ticket_type="assigned", recurrence_day=15, assignee=worker
    )

    svc.generate_due_recurring_tickets(db, manager)
    svc.generate_due_recurring_tickets(db, manager)

    tickets = db.query(Ticket).filter(Ticket.template_id == template.id).all()
    assert len(tickets) == 1


def test_not_yet_due_template_generates_ticket_with_future_due_date(db, monkeypatch):
    # recurrence_day hasn't arrived yet this month -- ticket should still
    # materialize (so a "this month" view shows it ahead of time), just
    # with a due_date later than today.
    _freeze_today(monkeypatch)
    manager = _make_user(db, "manager")
    worker = _make_user(db, "worker")
    template = _make_template(
        db, creator=manager, ticket_type="assigned", recurrence_day=20, assignee=worker
    )

    svc.generate_due_recurring_tickets(db, manager)

    tickets = db.query(Ticket).filter(Ticket.template_id == template.id).all()
    assert len(tickets) == 1
    assert tickets[0].due_date == date(2026, 7, 20)
    assert tickets[0].due_date > TODAY


def test_assigned_template_creates_ticket_and_assignment(db, monkeypatch):
    _freeze_today(monkeypatch)
    manager = _make_user(db, "manager")
    worker = _make_user(db, "worker")
    template = _make_template(
        db, creator=manager, ticket_type="assigned", recurrence_day=15, assignee=worker
    )

    svc.generate_due_recurring_tickets(db, manager)

    ticket = db.query(Ticket).filter(Ticket.template_id == template.id).one()
    assignments = db.query(TicketAssignment).filter(
        TicketAssignment.ticket_id == ticket.id
    ).all()
    assert len(assignments) == 1
    assert assignments[0].user_id == worker.id


def test_personal_template_creates_ticket_without_assignment(db, monkeypatch):
    _freeze_today(monkeypatch)
    worker = _make_user(db, "worker")
    template = _make_template(
        db, creator=worker, ticket_type="personal", recurrence_day=15
    )

    svc.generate_due_recurring_tickets(db, worker)

    ticket = db.query(Ticket).filter(Ticket.template_id == template.id).one()
    assert ticket.status == "personal_work"
    assert ticket.created_by == worker.id

    assignments = db.query(TicketAssignment).filter(
        TicketAssignment.ticket_id == ticket.id
    ).all()
    assert len(assignments) == 0
