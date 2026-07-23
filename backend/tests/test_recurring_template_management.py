from datetime import date

from conftest import make_user

from models import RecurringTicketTemplate, Ticket


def _create_recurring(client, title="Monthly invoicing", day=5):
    return client.post(
        "/api/tickets/personal",
        json={
            "title": title,
            "description": None,
            "urgency": "low",
            "is_recurring": True,
            "due_date": None,
            "recurrence_day": day,
        },
    )


def test_list_recurring_templates_only_own_and_active(app_client):
    client, db, login_as = app_client
    owner = make_user(db, "worker")
    other = make_user(db, "worker")

    login_as(owner)
    _create_recurring(client, title="Mine, active")
    resp = _create_recurring(client, title="Mine, but I'll deactivate it")
    inactive_id = resp.json()["id"]
    db.query(RecurringTicketTemplate).filter(
        RecurringTicketTemplate.id == inactive_id
    ).update({"active": False})
    db.commit()

    login_as(other)
    _create_recurring(client, title="Someone else's")

    login_as(owner)
    resp = client.get("/api/tickets/recurring-templates")
    assert resp.status_code == 200
    titles = {t["title"] for t in resp.json()}
    assert titles == {"Mine, active"}


def test_update_recurring_template(app_client):
    client, db, login_as = app_client
    owner = make_user(db, "worker")
    other = make_user(db, "worker")

    login_as(owner)
    template_id = _create_recurring(client, title="Old title", day=5).json()["id"]

    resp = client.put(
        f"/api/tickets/recurring-templates/{template_id}",
        json={
            "title": "New title",
            "description": "now with a description",
            "urgency": "high",
            "recurrence_day": 20,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "New title"
    assert body["urgency"] == "high"
    assert body["recurrence_day"] == 20

    login_as(other)
    resp = client.put(
        f"/api/tickets/recurring-templates/{template_id}",
        json={"title": "hijacked", "urgency": "low", "recurrence_day": 1},
    )
    assert resp.status_code == 403


def test_delete_recurring_template_deactivates_and_removes_live_instance(app_client):
    client, db, login_as = app_client
    owner = make_user(db, "worker")
    login_as(owner)

    template_id = _create_recurring(client).json()["id"]
    # Materializes this month's live instance.
    live = next(
        t for t in client.get("/api/tickets/").json() if t["title"] == "Monthly invoicing"
    )

    # A completed instance from a previous month should survive the delete --
    # it's history for the Archive, not the "live" occurrence.
    past_done = Ticket(
        title="Monthly invoicing",
        ticket_type="personal",
        status="done",
        urgency="low",
        due_date=date(2026, 6, 5),
        created_by=owner.id,
        template_id=template_id,
        is_recurring=True,
    )
    db.add(past_done)
    db.commit()
    past_done_id = past_done.id

    resp = client.delete(f"/api/tickets/recurring-templates/{template_id}")
    assert resp.status_code == 204

    # Deactivated, not gone -- the FK from past_done_id must stay valid.
    template = (
        db.query(RecurringTicketTemplate)
        .filter(RecurringTicketTemplate.id == template_id)
        .first()
    )
    assert template is not None
    assert template.active is False

    resp = client.get("/api/tickets/recurring-templates")
    assert resp.json() == []

    all_tickets = client.get("/api/tickets/", params={"include_archived": "true"}).json()
    ids = {t["id"] for t in all_tickets}
    assert live["id"] not in ids  # this month's unfinished occurrence: gone
    assert past_done_id in ids  # last month's completed occurrence: untouched


def test_delete_recurring_template_ownership_enforced(app_client):
    client, db, login_as = app_client
    owner = make_user(db, "worker")
    other = make_user(db, "worker")

    login_as(owner)
    template_id = _create_recurring(client).json()["id"]

    login_as(other)
    resp = client.delete(f"/api/tickets/recurring-templates/{template_id}")
    assert resp.status_code == 403


def test_cannot_delete_individual_recurring_ticket_instance(app_client):
    client, db, login_as = app_client
    worker = make_user(db, "worker")
    login_as(worker)

    _create_recurring(client)
    live = next(
        t for t in client.get("/api/tickets/").json() if t["title"] == "Monthly invoicing"
    )

    resp = client.delete(f"/api/tickets/{live['id']}")
    assert resp.status_code == 400
