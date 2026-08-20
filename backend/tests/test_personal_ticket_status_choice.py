"""Choosing a starting column when creating a personal ticket.

Offered only on the custom board (see backend/custom_board.py). The field is
typed as any TicketStatus, so the route -- not the schema -- is what keeps a
caller from placing a ticket somewhere they shouldn't.
"""
import pytest
from conftest import make_user

CUSTOM_BOARD_EMAIL = "custom-board@example.com"


@pytest.fixture(autouse=True)
def custom_board_configured(monkeypatch):
    # Who gets this board is environment configuration, so the tests name their
    # own account rather than depending on whatever the checkout is set to.
    monkeypatch.setenv("MANAGER_EMAIL", CUSTOM_BOARD_EMAIL)
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)


def _payload(**overrides):
    body = {
        "title": "Test personal ticket",
        "urgency": "medium",
        "is_recurring": False,
        "due_date": "2026-07-15",
    }
    body.update(overrides)
    return body


def _custom_board_user(db, role="worker"):
    user = make_user(db, role)
    user.email = CUSTOM_BOARD_EMAIL
    db.commit()
    db.refresh(user)
    return user


def test_custom_board_user_can_choose_starting_column(app_client):
    client, db, login_as = app_client
    login_as(_custom_board_user(db))

    resp = client.post("/api/tickets/personal", json=_payload(status="contact"))

    assert resp.status_code == 201
    assert resp.json()["status"] == "contact"


def test_custom_board_user_defaults_to_landing_status(app_client):
    client, db, login_as = app_client
    login_as(_custom_board_user(db))

    resp = client.post("/api/tickets/personal", json=_payload())

    assert resp.status_code == 201
    assert resp.json()["status"] == "priority"


def test_custom_board_user_cannot_choose_a_shared_status(app_client):
    # "awaiting_approval" is a real TicketStatus, so it passes schema
    # validation -- but it isn't one of this board's columns, and reaching it
    # directly would skip the approval flow. It must fall back to the default.
    client, db, login_as = app_client
    login_as(_custom_board_user(db))

    resp = client.post(
        "/api/tickets/personal", json=_payload(status="awaiting_approval")
    )

    assert resp.status_code == 201
    assert resp.json()["status"] == "priority"


def test_ordinary_user_cannot_choose_a_status(app_client):
    # Nobody off the custom board gets to pick, whatever they send.
    client, db, login_as = app_client
    login_as(make_user(db, "worker"))

    resp = client.post("/api/tickets/personal", json=_payload(status="contact"))

    assert resp.status_code == 201
    assert resp.json()["status"] == "personal_work"


def test_unknown_status_is_rejected_by_the_schema(app_client):
    client, db, login_as = app_client
    login_as(_custom_board_user(db))

    resp = client.post("/api/tickets/personal", json=_payload(status="nonsense"))

    assert resp.status_code == 422
