from dotenv import load_dotenv

load_dotenv()

import itertools
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from models import Ticket, TicketAssignment, User

_user_seq = itertools.count()


def make_user(db, role: str) -> User:
    n = next(_user_seq)
    user = User(
        clerk_id=f"clerk_{n}", email=f"user{n}@example.com", name=f"User {n}", role=role
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_ticket(
    db,
    *,
    creator,
    ticket_type: str = "assigned",
    status: str = "to_do",
    assignee=None,
) -> Ticket:
    ticket = Ticket(
        title="Test ticket",
        ticket_type=ticket_type,
        status=status,
        urgency="medium",
        due_date=date(2026, 7, 15),
        created_by=creator.id,
    )
    db.add(ticket)
    db.flush()
    if assignee is not None:
        db.add(TicketAssignment(ticket_id=ticket.id, user_id=assignee.id))
    db.commit()
    db.refresh(ticket)
    return ticket


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def app_client():
    """A (client, db, login_as) tuple for HTTP-level route tests.

    Uses StaticPool so every pooled connection shares the same in-memory
    SQLite DB -- TestClient runs requests on a separate thread, and plain
    in-memory SQLite gives each new connection its own empty database
    otherwise.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()

    import main
    from auth import get_current_user

    def login_as(user):
        main.app.dependency_overrides[get_current_user] = lambda: user

    main.app.dependency_overrides[get_db] = lambda: session
    client = TestClient(main.app)

    try:
        yield client, session, login_as
    finally:
        session.close()
        engine.dispose()
        main.app.dependency_overrides.clear()
