"""End-to-end walk of the "My Work" page's actual network calls, in order,
against the real FastAPI app (not just isolated permission checks) -- create,
list, drag through every status, delete -- plus the surrounding visibility
checks (Team Board, another manager, a worker) that the feature depends on.
"""
from conftest import make_user


def test_manager_my_work_full_flow(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    other_manager = make_user(db, "manager")
    worker = make_user(db, "worker")
    login_as(manager)

    # 1. "Create personal ticket" button.
    resp = client.post(
        "/api/tickets/personal",
        json={
            "title": "Renew domain",
            "description": None,
            "urgency": "medium",
            "is_recurring": False,
            "due_date": "2026-08-01",
            "recurrence_day": None,
        },
    )
    assert resp.status_code == 201
    ticket = resp.json()
    assert ticket["ticket_type"] == "personal"
    assert ticket["status"] == "personal_work"
    assert ticket["created_by"] == manager.id

    # 2. Page load: GET /tickets/.
    resp = client.get("/api/tickets/")
    assert resp.status_code == 200
    assert ticket["id"] in {t["id"] for t in resp.json()}

    # 3. Drag it across every column: personal_work -> working_on -> done.
    for new_status in ("working_on", "done"):
        resp = client.patch(
            f"/api/tickets/{ticket['id']}/status", json={"status": new_status}
        )
        assert resp.status_code == 200, f"transition to {new_status} was rejected"
        assert resp.json()["status"] == new_status

    # 4. Done tickets still exist for the Archive.
    resp = client.get("/api/tickets/", params={"include_archived": "true"})
    done = next(t for t in resp.json() if t["id"] == ticket["id"])
    assert done["status"] == "done"

    # 5. A second ticket, deleted on demand instead of completed.
    resp = client.post(
        "/api/tickets/personal",
        json={
            "title": "Cancel old subscription",
            "description": None,
            "urgency": "low",
            "is_recurring": False,
            "due_date": "2026-08-05",
            "recurrence_day": None,
        },
    )
    to_delete = resp.json()
    resp = client.delete(f"/api/tickets/{to_delete['id']}")
    assert resp.status_code == 204
    resp = client.get("/api/tickets/", params={"include_archived": "true"})
    assert to_delete["id"] not in {t["id"] for t in resp.json()}

    # 6. A worker never sees this manager's personal tickets at all (existing
    # backend filter for non-managers, unaffected by this feature).
    login_as(worker)
    resp = client.get("/api/tickets/", params={"include_archived": "true"})
    assert ticket["id"] not in {t["id"] for t in resp.json()}

    # 7. Another manager's raw GET /tickets/ *does* include it -- the backend
    # intentionally returns everything to managers; the Team Board's exclusion
    # of the owner's own personal tickets is a frontend-side filter, verified
    # separately against this exact response shape.
    login_as(other_manager)
    resp = client.get("/api/tickets/", params={"include_archived": "true"})
    assert ticket["id"] in {t["id"] for t in resp.json()}


def test_manager_can_create_recurring_personal_ticket(app_client):
    client, db, login_as = app_client
    manager = make_user(db, "manager")
    login_as(manager)

    resp = client.post(
        "/api/tickets/personal",
        json={
            "title": "Monthly invoicing",
            "description": None,
            "urgency": "low",
            "is_recurring": True,
            "due_date": None,
            "recurrence_day": 5,
        },
    )
    assert resp.status_code == 201
    assert "recurrence_day" in resp.json()  # RecurringTemplateResponse, not a Ticket

    # generate_due_recurring_tickets runs on every list call, so the first
    # instance is already materialized by the time the page loads.
    resp = client.get("/api/tickets/")
    assert resp.status_code == 200
    matches = [t for t in resp.json() if t["title"] == "Monthly invoicing"]
    assert len(matches) == 1
    assert matches[0]["created_by"] == manager.id
    assert matches[0]["is_recurring"] is True

    # Deleting a recurring ticket's own materialized instance directly is no
    # longer offered -- see test_recurring_template_management.py for the
    # actual removal path (DELETE /tickets/recurring-templates/{id}), which
    # deactivates the template and removes the live instance together.
    resp = client.delete(f"/api/tickets/{matches[0]['id']}")
    assert resp.status_code == 400
