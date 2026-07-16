from datetime import datetime, timedelta

import httpx
from fastapi.security import HTTPAuthorizationCredentials

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
