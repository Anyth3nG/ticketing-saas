from conftest import make_ticket, make_user


def test_comment_notifies_the_other_party_but_not_the_author(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket = make_ticket(db, creator=manager, assignee=worker)

    login_as(manager)
    resp = client.post(
        f"/api/tickets/{ticket.id}/comments", json={"content": "manager note"}
    )
    assert resp.status_code == 201

    login_as(worker)
    resp = client.get("/api/notifications/")
    assert resp.status_code == 200
    notifications = resp.json()
    assert len(notifications) == 1
    assert notifications[0]["ticket_id"] == ticket.id
    assert notifications[0]["ticket_title"] == ticket.title
    assert notifications[0]["is_read"] is False
    assert notifications[0]["comment"]["content"] == "manager note"
    assert notifications[0]["comment"]["user"]["id"] == manager.id

    login_as(manager)
    resp = client.get("/api/notifications/")
    assert resp.status_code == 200
    assert resp.json() == []


def test_mark_notification_read(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    other_worker = make_user(db, "worker")
    ticket = make_ticket(db, creator=manager, assignee=worker)

    login_as(manager)
    client.post(f"/api/tickets/{ticket.id}/comments", json={"content": "hi"})

    login_as(worker)
    notification_id = client.get("/api/notifications/").json()[0]["id"]

    login_as(other_worker)
    resp = client.post(f"/api/notifications/{notification_id}/read")
    assert resp.status_code == 404

    login_as(worker)
    resp = client.post(f"/api/notifications/{notification_id}/read")
    assert resp.status_code == 200
    assert resp.json()["is_read"] is True


def test_mark_all_notifications_read(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    ticket_a = make_ticket(db, creator=manager, assignee=worker)
    ticket_b = make_ticket(db, creator=manager, assignee=worker)

    login_as(manager)
    client.post(f"/api/tickets/{ticket_a.id}/comments", json={"content": "a"})
    client.post(f"/api/tickets/{ticket_b.id}/comments", json={"content": "b"})

    login_as(worker)
    resp = client.post("/api/notifications/read-all")
    assert resp.status_code == 204

    assert client.get("/api/notifications/").json() == []
