"""The bot role: reads everything, writes nothing.

Every test here logs in through conftest's login_as, which replaces
get_current_user wholesale. That is why the read-only rule lives in its own
dependency (auth.reject_bot_writes) rather than inside get_current_user: a rule
inside the overridden function would never run under test, and this file could
not prove it.
"""
import pytest
from fastapi.routing import APIRoute
from conftest import make_ticket, make_user

from models import Ticket, TicketComment


def _bot_and_world(db):
    """A bot, plus tickets of every visibility the bot does not own."""
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    bot = make_user(db, "bot")
    assigned = make_ticket(db, creator=manager, assignee=worker)
    personal = make_ticket(
        db, creator=worker, ticket_type="personal", status="personal_work"
    )
    return manager, worker, bot, assigned, personal


# --- reads -----------------------------------------------------------------


def test_bot_lists_every_ticket_including_other_peoples_personal_tickets(app_client):
    client, db, login_as = app_client
    _, _, bot, assigned, personal = _bot_and_world(db)

    login_as(bot)
    resp = client.get("/api/tickets/")

    assert resp.status_code == 200
    assert {t["id"] for t in resp.json()} == {assigned.id, personal.id}


def test_each_ticket_names_its_creator_so_personal_work_has_an_owner(app_client):
    # A personal ticket has no assignee, only a creator. Without the creator's
    # name a bot (which has no user list) cannot say whose ticket it is.
    client, db, login_as = app_client
    _, worker, bot, assigned, personal = _bot_and_world(db)

    login_as(bot)
    by_id = {t["id"]: t for t in client.get("/api/tickets/").json()}

    assert by_id[personal.id]["creator"]["name"] == worker.name
    assert by_id[personal.id]["assignee"] is None


def test_bot_reads_a_single_ticket_it_does_not_own(app_client):
    client, db, login_as = app_client
    _, _, bot, _, personal = _bot_and_world(db)

    login_as(bot)

    assert client.get(f"/api/tickets/{personal.id}").status_code == 200


def test_bot_reads_comments_on_any_ticket(app_client):
    client, db, login_as = app_client
    manager, worker, bot, assigned, _ = _bot_and_world(db)
    db.add(TicketComment(ticket_id=assigned.id, user_id=worker.id, content="hi"))
    db.commit()

    login_as(bot)
    resp = client.get(f"/api/tickets/{assigned.id}/comments")

    assert resp.status_code == 200
    assert [c["content"] for c in resp.json()] == ["hi"]


def test_bot_reads_its_own_profile_with_the_bot_role(app_client):
    client, db, login_as = app_client
    bot = make_user(db, "bot")

    login_as(bot)
    resp = client.get("/api/users/me")

    assert resp.status_code == 200
    assert resp.json()["role"] == "bot"


def test_bot_listing_tickets_does_not_run_recurring_generation(
    app_client, monkeypatch
):
    # GET /tickets/ writes for everyone else (it materialises this month's
    # recurring tickets). A bot's GET has to stay a GET.
    client, db, login_as = app_client
    bot = make_user(db, "bot")
    calls = []
    monkeypatch.setattr(
        "routes.tickets.generate_due_recurring_tickets",
        lambda *args, **kwargs: calls.append(args),
    )

    login_as(bot)
    client.get("/api/tickets/")

    assert calls == []


# --- reads the bot still may not make ---------------------------------------


def test_bot_cannot_list_users(app_client):
    client, db, login_as = app_client
    bot = make_user(db, "bot")

    login_as(bot)

    assert client.get("/api/users/").status_code == 403


def test_bot_cannot_open_the_admin_view(app_client):
    client, db, login_as = app_client
    bot = make_user(db, "bot")

    login_as(bot)

    assert client.get("/api/admin/yulia-work").status_code == 403


# --- writes ------------------------------------------------------------------


def test_bot_cannot_comment_and_no_comment_is_stored(app_client):
    client, db, login_as = app_client
    _, _, bot, assigned, _ = _bot_and_world(db)

    login_as(bot)
    resp = client.post(
        f"/api/tickets/{assigned.id}/comments", json={"content": "hello"}
    )

    assert resp.status_code == 403
    assert db.query(TicketComment).count() == 0


def test_bot_cannot_change_a_ticket_status_and_it_stays_put(app_client):
    client, db, login_as = app_client
    _, _, bot, assigned, _ = _bot_and_world(db)

    login_as(bot)
    resp = client.patch(
        f"/api/tickets/{assigned.id}/status", json={"status": "working_on"}
    )

    assert resp.status_code == 403
    db.refresh(assigned)
    assert assigned.status == "to_do"


def test_bot_cannot_delete_a_ticket_and_it_survives(app_client):
    client, db, login_as = app_client
    _, _, bot, _, personal = _bot_and_world(db)

    login_as(bot)
    resp = client.delete(f"/api/tickets/{personal.id}")

    assert resp.status_code == 403
    assert db.query(Ticket).filter(Ticket.id == personal.id).count() == 1


@pytest.mark.parametrize(
    "method, path, body",
    [
        ("POST", "/api/tickets/personal", {"title": "t", "urgency": "low"}),
        ("PUT", "/api/tickets/{ticket}", {"title": "renamed"}),
        ("POST", "/api/tickets/{ticket}/assignments", {"user_id": 1}),
        ("POST", "/api/notifications/read-all", None),
        (
            "POST",
            "/api/meetings/",
            {"title": "m", "starts_at": "2026-12-01T10:00:00"},
        ),
        ("PUT", "/api/users/me/dashboard-layout", {"worker_order": []}),
    ],
)
def test_bot_is_refused_on_every_kind_of_write(app_client, method, path, body):
    client, db, login_as = app_client
    _, _, bot, assigned, _ = _bot_and_world(db)

    login_as(bot)
    resp = client.request(method, path.format(ticket=assigned.id), json=body)

    assert resp.status_code == 403


def test_a_worker_can_still_comment(app_client):
    # The guard must not leak onto anyone else.
    client, db, login_as = app_client
    _, worker, _, assigned, _ = _bot_and_world(db)

    login_as(worker)
    resp = client.post(
        f"/api/tickets/{assigned.id}/comments", json={"content": "on it"}
    )

    assert resp.status_code == 201


# --- the rule covers routes nobody has written yet ---------------------------


def _dependency_calls(dependant):
    for dep in dependant.dependencies:
        yield dep.call
        yield from _dependency_calls(dep)


def test_every_api_route_sits_behind_the_bot_guard():
    # Fails the day someone includes a router without the guard, which is the
    # only way a new write route could slip past it.
    import main
    from auth import reject_bot_writes

    unguarded = [
        f"{sorted(route.methods)} {route.path}"
        for route in main.app.routes
        if isinstance(route, APIRoute)
        and route.path.startswith("/api")
        and reject_bot_writes not in set(_dependency_calls(route.dependant))
    ]

    assert unguarded == []


def test_health_stays_open_without_login(app_client):
    client, _, _ = app_client

    assert client.get("/health").status_code == 200


# --- belt and braces ---------------------------------------------------------


def test_a_bot_is_never_allowed_a_status_change_even_though_it_can_view(db):
    # Viewing everything must not be what lets a bot through the ordinary
    # worker rules if the guard were ever bypassed.
    from routes.tickets import _can_update_status

    _, _, bot, assigned, _ = _bot_and_world(db)

    assert _can_update_status(assigned, bot, "working_on") is False


def test_a_manager_cannot_assign_work_to_a_bot(app_client):
    client, db, login_as = app_client
    manager, _, bot, assigned, _ = _bot_and_world(db)

    login_as(manager)
    resp = client.post(
        f"/api/tickets/{assigned.id}/assignments", json={"user_id": bot.id}
    )

    assert resp.status_code == 400
