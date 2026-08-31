from conftest import make_ticket, make_user

from models import Notification


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


def test_manager_updates_status_on_own_personal_ticket(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    ticket = make_ticket(
        db, creator=manager, ticket_type="personal", status="personal_work"
    )

    login_as(manager)
    resp = client.patch(
        f"/api/tickets/{ticket.id}/status", json={"status": "working_on"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "working_on"

    resp = client.patch(f"/api/tickets/{ticket.id}/status", json={"status": "done"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "done"


def test_manager_cannot_force_approve_workers_personal_ticket(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(
        db, creator=worker, ticket_type="personal", status="personal_work"
    )

    login_as(manager)
    resp = client.patch(f"/api/tickets/{ticket.id}/status", json={"status": "done"})

    assert resp.status_code == 403


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


def test_manager_can_return_awaiting_approval_ticket_for_a_redo(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(
        db, creator=manager, assignee=worker, status="awaiting_approval"
    )

    login_as(manager)
    resp = client.patch(f"/api/tickets/{ticket.id}/status", json={"status": "to_do"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "to_do"


def test_returning_a_ticket_notifies_the_assignee(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(
        db, creator=manager, assignee=worker, status="awaiting_approval"
    )

    login_as(manager)
    client.patch(f"/api/tickets/{ticket.id}/status", json={"status": "to_do"})

    notifications = db.query(Notification).all()
    assert len(notifications) == 1
    assert notifications[0].user_id == worker.id
    assert notifications[0].type == "ticket_returned"
    assert notifications[0].comment_id is None


def test_approving_a_ticket_does_not_notify(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(
        db, creator=manager, assignee=worker, status="awaiting_approval"
    )

    login_as(manager)
    client.patch(f"/api/tickets/{ticket.id}/status", json={"status": "done"})

    assert db.query(Notification).count() == 0


def test_worker_moving_own_ticket_to_to_do_does_not_notify(app_client):
    """Only a review rejection notifies -- not every arrival in to_do.

    A worker can move their own assigned ticket back to to_do themselves, and
    notifying them about their own action would be noise.
    """
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(
        db, creator=manager, assignee=worker, status="awaiting_approval"
    )

    login_as(worker)
    resp = client.patch(f"/api/tickets/{ticket.id}/status", json={"status": "to_do"})

    assert resp.status_code == 200
    assert db.query(Notification).count() == 0


def test_manager_cannot_move_awaiting_approval_to_arbitrary_status(app_client):
    """Approve and return are the only two review outcomes.

    A manager still can't drop someone else's work into working_on or
    personal_work -- see test_manager_cannot_set_arbitrary_status for the same
    rule on a ticket that isn't up for review at all.
    """
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(
        db, creator=manager, assignee=worker, status="awaiting_approval"
    )

    login_as(manager)
    for status in ("working_on", "personal_work"):
        resp = client.patch(
            f"/api/tickets/{ticket.id}/status", json={"status": status}
        )
        assert resp.status_code == 403, status


def test_personal_ticket_cannot_go_to_awaiting_approval(app_client):
    client, db, login_as = app_client
    worker = make_user(db, "worker")
    ticket = make_ticket(
        db, creator=worker, ticket_type="personal", status="personal_work"
    )

    login_as(worker)
    resp = client.patch(
        f"/api/tickets/{ticket.id}/status", json={"status": "awaiting_approval"}
    )

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
