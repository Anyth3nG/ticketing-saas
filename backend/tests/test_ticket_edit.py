from conftest import make_ticket, make_user


def test_manager_can_edit_to_do_ticket(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(db, creator=manager, assignee=worker, status="to_do")

    login_as(manager)
    resp = client.put(f"/api/tickets/{ticket.id}", json={"title": "Updated title"})

    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated title"


def test_manager_cannot_edit_non_to_do_ticket(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(db, creator=manager, assignee=worker, status="working_on")

    login_as(manager)
    resp = client.put(f"/api/tickets/{ticket.id}", json={"title": "Updated title"})

    assert resp.status_code == 403


def test_worker_can_edit_own_personal_ticket_regardless_of_status(app_client):
    client, db, login_as = app_client
    worker = make_user(db, "worker")
    ticket = make_ticket(
        db, creator=worker, ticket_type="personal", status="personal_work"
    )

    login_as(worker)
    resp = client.put(f"/api/tickets/{ticket.id}", json={"title": "Updated title"})

    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated title"


def test_worker_cannot_edit_assigned_ticket(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(db, creator=manager, assignee=worker, status="to_do")

    login_as(worker)
    resp = client.put(f"/api/tickets/{ticket.id}", json={"title": "Updated title"})

    assert resp.status_code == 403


def test_status_field_via_put_is_ignored_not_applied(app_client):
    # A manager editing a to_do ticket could otherwise sneak a status change
    # through PUT and bypass the approve-only rule enforced by the dedicated
    # PATCH /status endpoint -- TicketUpdate has no status field, so Pydantic
    # silently drops it rather than rejecting the request; the edit itself
    # still succeeds, just without touching status.
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(db, creator=manager, assignee=worker, status="to_do")

    login_as(manager)
    resp = client.put(
        f"/api/tickets/{ticket.id}",
        json={"title": "Updated title", "status": "done"},
    )

    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated title"
    assert resp.json()["status"] == "to_do"
