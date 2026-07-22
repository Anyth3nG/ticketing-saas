from datetime import datetime, timedelta

import httpx
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.exc import SQLAlchemyError

import auth
from models import User


def _creds() -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials="fake-token")


def _stub_jwt(monkeypatch, clerk_id: str):
    monkeypatch.setattr(auth, "_get_signing_key", lambda token: {})
    monkeypatch.setattr(auth.jwt, "decode", lambda *a, **k: {"sub": clerk_id})


def test_new_user_is_created_from_clerk_profile(db, monkeypatch):
    _stub_jwt(monkeypatch, "clerk_new")
    monkeypatch.setattr(
        auth,
        "_fetch_clerk_profile",
        lambda clerk_id: ("new@example.com", "New Person", "https://img/new.png"),
    )

    user = auth.get_current_user(credentials=_creds(), db=db)

    assert user.email == "new@example.com"
    assert user.name == "New Person"
    assert user.avatar_url == "https://img/new.png"
    assert user.synced_at is not None


def test_existing_user_is_not_refetched_when_recently_synced(db, monkeypatch):
    user = User(
        clerk_id="clerk_fresh",
        email="old@example.com",
        name="Old Name",
        role="worker",
        synced_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()

    _stub_jwt(monkeypatch, "clerk_fresh")

    def _fail_if_called(clerk_id):
        raise AssertionError("should not re-fetch a recently synced user")

    monkeypatch.setattr(auth, "_fetch_clerk_profile", _fail_if_called)

    result = auth.get_current_user(credentials=_creds(), db=db)
    assert result.name == "Old Name"


def test_existing_user_is_refreshed_when_stale(db, monkeypatch):
    user = User(
        clerk_id="clerk_stale",
        email="old@example.com",
        name="Old Name",
        role="worker",
        synced_at=datetime.utcnow() - timedelta(hours=2),
    )
    db.add(user)
    db.commit()

    _stub_jwt(monkeypatch, "clerk_stale")
    monkeypatch.setattr(
        auth,
        "_fetch_clerk_profile",
        lambda clerk_id: ("old@example.com", "New Name", "https://img/updated.png"),
    )

    result = auth.get_current_user(credentials=_creds(), db=db)
    assert result.name == "New Name"
    assert result.avatar_url == "https://img/updated.png"


def test_clerk_failure_on_refresh_keeps_serving_stale_profile(db, monkeypatch):
    user = User(
        clerk_id="clerk_down",
        email="old@example.com",
        name="Old Name",
        role="worker",
        synced_at=datetime.utcnow() - timedelta(hours=2),
    )
    db.add(user)
    db.commit()

    _stub_jwt(monkeypatch, "clerk_down")

    def _raise(clerk_id):
        raise httpx.ConnectError("clerk is down")

    monkeypatch.setattr(auth, "_fetch_clerk_profile", _raise)

    result = auth.get_current_user(credentials=_creds(), db=db)
    assert result.name == "Old Name"


def test_db_error_on_lookup_returns_503_not_500(db, monkeypatch):
    # Reproduces the prod incident: the users SELECT fails (e.g. DB behind on
    # migrations, missing avatar_url/synced_at columns). Must surface a clean
    # 503, not a raw 500 that strips CORS headers and looks like a CORS bug.
    _stub_jwt(monkeypatch, "clerk_dberr")

    def _boom(model):
        raise SQLAlchemyError("simulated DB failure")

    monkeypatch.setattr(db, "query", _boom)

    with pytest.raises(HTTPException) as exc_info:
        auth.get_current_user(credentials=_creds(), db=db)
    assert exc_info.value.status_code == 503


def test_concurrent_create_returns_existing_user(db, monkeypatch):
    # The frontend fires several API calls in parallel on load; for a brand-new
    # user they all miss the initial lookup and race to INSERT the same
    # clerk_id. The losers hit the unique constraint -- they must fall back to
    # the row the winner created rather than 500ing.
    _stub_jwt(monkeypatch, "clerk_race")

    def _fetch_and_simulate_race(clerk_id):
        # Stand in for a parallel request that committed the row between our
        # initial lookup (a miss) and our own commit.
        db.add(
            User(
                clerk_id=clerk_id,
                email="race@example.com",
                name="Race Winner",
                role="worker",
                synced_at=datetime.utcnow(),
            )
        )
        db.commit()
        return ("race@example.com", "Race Winner", None)

    monkeypatch.setattr(auth, "_fetch_clerk_profile", _fetch_and_simulate_race)

    result = auth.get_current_user(credentials=_creds(), db=db)
    assert result.clerk_id == "clerk_race"
    assert result.name == "Race Winner"


def test_reissued_clerk_id_relinks_existing_user_by_email(db, monkeypatch):
    # Switching Clerk instances (test -> prod) reissues a new clerk_id for the
    # same person, so their existing row still carries the old one: the lookup
    # misses and the INSERT collides on users.email. That used to 503 every
    # request they made, permanently. The row must be re-linked to the new
    # clerk_id instead, keeping its id and role.
    existing = User(
        clerk_id="clerk_old_instance",
        email="daniel@example.com",
        name="Daniel",
        role="manager",
        synced_at=datetime.utcnow(),
    )
    db.add(existing)
    db.commit()
    original_id = existing.id

    _stub_jwt(monkeypatch, "clerk_new_instance")
    monkeypatch.setattr(
        auth,
        "_fetch_clerk_profile",
        lambda clerk_id: ("daniel@example.com", "Daniel", "https://img/avatar.png"),
    )

    result = auth.get_current_user(credentials=_creds(), db=db)

    assert result.id == original_id
    assert result.clerk_id == "clerk_new_instance"
    assert result.role == "manager"  # privileges must survive the re-link


def test_placeholder_email_does_not_relink_existing_user(db, monkeypatch):
    # Placeholder emails are built from the Clerk username, which users can
    # edit. Re-linking on one would let a worker rename themselves onto a
    # manager's row and inherit the role, so these must never match.
    existing = User(
        clerk_id="clerk_manager",
        email="boss@no-email.local",
        name="Boss",
        role="manager",
        synced_at=datetime.utcnow(),
    )
    db.add(existing)
    db.commit()

    _stub_jwt(monkeypatch, "clerk_attacker")
    monkeypatch.setattr(
        auth,
        "_fetch_clerk_profile",
        lambda clerk_id: ("boss@no-email.local", "Boss", None),
    )

    with pytest.raises(HTTPException) as exc_info:
        auth.get_current_user(credentials=_creds(), db=db)

    assert exc_info.value.status_code == 503
    assert db.query(User).filter(User.clerk_id == "clerk_manager").first().role == "manager"
