from conftest import make_ticket, make_user


def test_manager_and_assigned_worker_can_post_and_list_comments(app_client):
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
    resp = client.post(
        f"/api/tickets/{ticket.id}/comments", json={"content": "worker reply"}
    )
    assert resp.status_code == 201

    resp = client.get(f"/api/tickets/{ticket.id}/comments")
    assert resp.status_code == 200
    comments = resp.json()
    assert [c["content"] for c in comments] == ["manager note", "worker reply"]
    assert comments[0]["user"]["id"] == manager.id
    assert comments[1]["user"]["id"] == worker.id


def test_unrelated_worker_cannot_comment(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    worker_a = make_user(db, "worker")
    worker_b = make_user(db, "worker")
    ticket = make_ticket(db, creator=manager, assignee=worker_a)

    login_as(worker_b)
    resp = client.post(f"/api/tickets/{ticket.id}/comments", json={"content": "hi"})

    assert resp.status_code == 403
