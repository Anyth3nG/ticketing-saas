from conftest import make_ticket, make_user


def test_worker_updates_status_on_own_assigned_ticket(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(db, creator=manager, assignee=worker)

    login_as(worker)
    resp = client.patch(
        f"/api/tickets/{ticket.id}/status", json={"status": "working_on"}
    )

    assert resp.status_code == 200
    assert resp.json()["status"] == "working_on"


def test_worker_cannot_update_status_on_other_workers_ticket(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker_a = make_user(db, "worker")
    worker_b = make_user(db, "worker")
    ticket = make_ticket(db, creator=manager, assignee=worker_a)

    login_as(worker_b)
    resp = client.patch(
        f"/api/tickets/{ticket.id}/status", json={"status": "working_on"}
    )

    assert resp.status_code == 403


def test_worker_updates_status_on_own_personal_ticket(app_client):
    client, db, login_as = app_client
    worker = make_user(db, "worker")
    ticket = make_ticket(
        db, creator=worker, ticket_type="personal", status="personal_work"
    )

    login_as(worker)
    resp = client.patch(f"/api/tickets/{ticket.id}/status", json={"status": "done"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "done"


def test_manager_can_approve_awaiting_approval_ticket(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(
        db, creator=manager, assignee=worker, status="awaiting_approval"
    )

    login_as(manager)
    resp = client.patch(f"/api/tickets/{ticket.id}/status", json={"status": "done"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "done"


def test_manager_cannot_set_arbitrary_status(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(db, creator=manager, assignee=worker, status="to_do")

    login_as(manager)
    resp = client.patch(
        f"/api/tickets/{ticket.id}/status", json={"status": "working_on"}
    )

    assert resp.status_code == 403


def test_manager_cannot_move_awaiting_approval_to_non_done_status(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(
        db, creator=manager, assignee=worker, status="awaiting_approval"
    )

    login_as(manager)
    resp = client.patch(f"/api/tickets/{ticket.id}/status", json={"status": "to_do"})

    assert resp.status_code == 403


def test_status_transition_has_no_sequence_enforcement(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(db, creator=manager, assignee=worker, status="done")

    login_as(worker)
    resp = client.patch(f"/api/tickets/{ticket.id}/status", json={"status": "to_do"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "to_do"
