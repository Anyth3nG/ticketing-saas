from conftest import make_user


def test_manager_can_save_dashboard_layout(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    w1 = make_user(db, "worker")
    w2 = make_user(db, "worker")

    login_as(manager)
    resp = client.put(
        "/api/users/me/dashboard-layout", json={"worker_order": [w2.id, w1.id]}
    )

    assert resp.status_code == 200
    assert resp.json()["dashboard_layout"] == [w2.id, w1.id]

    # Persisted, not just echoed back.
    resp = client.get("/api/users/me")
    assert resp.json()["dashboard_layout"] == [w2.id, w1.id]


def test_dashboard_layout_drops_ids_that_are_not_current_workers(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    other_manager = make_user(db, "manager")
    worker = make_user(db, "worker")

    login_as(manager)
    resp = client.put(
        "/api/users/me/dashboard-layout",
        json={"worker_order": [worker.id, other_manager.id, 99999]},
    )

    assert resp.status_code == 200
    assert resp.json()["dashboard_layout"] == [worker.id]


def test_worker_cannot_save_dashboard_layout(app_client):
    client, db, login_as = app_client
    worker = make_user(db, "worker")

    login_as(worker)
    resp = client.put(
        "/api/users/me/dashboard-layout", json={"worker_order": [worker.id]}
    )

    assert resp.status_code == 403
