from conftest import make_ticket, make_user

from models import Notification, Ticket, TicketAssignment, TicketComment


def test_manager_can_delete_assigned_ticket(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(db, creator=manager, assignee=worker, status="to_do")

    login_as(manager)
    resp = client.delete(f"/api/tickets/{ticket.id}")

    assert resp.status_code == 204
    assert db.query(Ticket).filter(Ticket.id == ticket.id).first() is None
    assert (
        db.query(TicketAssignment)
        .filter(TicketAssignment.ticket_id == ticket.id)
        .count()
        == 0
    )


def test_delete_also_clears_comments_and_notifications(app_client):
    # comments and notifications both hold a NOT NULL ticket_id FK, so a ticket
    # that has either must not FK-violate on delete.
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(db, creator=manager, assignee=worker, status="working_on")

    comment = TicketComment(ticket_id=ticket.id, user_id=worker.id, content="hi")
    db.add(comment)
    db.flush()
    db.add(
        Notification(user_id=manager.id, ticket_id=ticket.id, comment_id=comment.id)
    )
    db.commit()

    login_as(manager)
    resp = client.delete(f"/api/tickets/{ticket.id}")

    assert resp.status_code == 204
    assert db.query(TicketComment).filter(TicketComment.ticket_id == ticket.id).count() == 0
    assert db.query(Notification).filter(Notification.ticket_id == ticket.id).count() == 0


def test_manager_cannot_delete_personal_ticket(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(
        db, creator=worker, ticket_type="personal", status="personal_work"
    )

    login_as(manager)
    resp = client.delete(f"/api/tickets/{ticket.id}")

    assert resp.status_code == 403
    assert db.query(Ticket).filter(Ticket.id == ticket.id).first() is not None


def test_worker_cannot_delete_assigned_ticket(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(db, creator=manager, assignee=worker, status="to_do")

    login_as(worker)
    resp = client.delete(f"/api/tickets/{ticket.id}")

    assert resp.status_code == 403
    assert db.query(Ticket).filter(Ticket.id == ticket.id).first() is not None


def test_worker_can_delete_own_personal_ticket(app_client):
    client, db, login_as = app_client
    worker = make_user(db, "worker")
    ticket = make_ticket(
        db, creator=worker, ticket_type="personal", status="personal_work"
    )

    login_as(worker)
    resp = client.delete(f"/api/tickets/{ticket.id}")

    assert resp.status_code == 204
    assert db.query(Ticket).filter(Ticket.id == ticket.id).first() is None


def test_worker_cannot_delete_another_workers_personal_ticket(app_client):
    client, db, login_as = app_client
    owner = make_user(db, "worker")
    other = make_user(db, "worker")
    ticket = make_ticket(
        db, creator=owner, ticket_type="personal", status="personal_work"
    )

    login_as(other)
    resp = client.delete(f"/api/tickets/{ticket.id}")

    assert resp.status_code == 403
    assert db.query(Ticket).filter(Ticket.id == ticket.id).first() is not None
