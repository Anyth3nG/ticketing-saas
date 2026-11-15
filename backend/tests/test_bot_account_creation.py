"""Which role a brand-new account is born with.

A name ending in "_bot" makes the account a bot, in every environment, so the
service account needs no hand-run UPDATE after its first login. Everything
else is a worker, as it always was.

The rule applies at creation only. A refresh from Clerk must never change a
role: a worker who renames themselves "x_bot" in Clerk stays a worker.
"""
from datetime import datetime, timedelta

import pytest
from fastapi.security import HTTPAuthorizationCredentials

import auth
from models import User
from roles import role_for_new_account


def _creds() -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials="fake-token")


def _log_in_as_clerk_user(monkeypatch, clerk_id: str, name: str):
    monkeypatch.setattr(auth, "_get_signing_key", lambda token: {})
    monkeypatch.setattr(auth.jwt, "decode", lambda *a, **k: {"sub": clerk_id})
    monkeypatch.setattr(
        auth,
        "_fetch_clerk_profile",
        lambda clerk_id: (f"{clerk_id}@no-email.local", name, None),
    )


@pytest.mark.parametrize(
    "name", ["orion_bot", "Orion_Bot", "ORION_BOT", "  grok_bot  ", "a_bot"]
)
def test_a_name_ending_in_underscore_bot_is_a_bot(name):
    assert role_for_new_account(name) == "bot"


@pytest.mark.parametrize(
    "name", ["New Person", "robot", "bot", "Bot", "abot", "bot_lover", "orion-bot", ""]
)
def test_any_other_name_is_a_worker(name):
    assert role_for_new_account(name) == "worker"


def test_orion_bot_logging_in_for_the_first_time_is_created_as_a_bot(db, monkeypatch):
    _log_in_as_clerk_user(monkeypatch, "clerk_orion", "orion_bot")

    user = auth.get_current_user(credentials=_creds(), db=db)

    assert user.role == "bot"


def test_an_ordinary_first_login_is_still_a_worker(db, monkeypatch):
    _log_in_as_clerk_user(monkeypatch, "clerk_person", "Dana Levi")

    user = auth.get_current_user(credentials=_creds(), db=db)

    assert user.role == "worker"


def test_renaming_an_existing_worker_to_a_bot_name_does_not_change_the_role(
    db, monkeypatch
):
    worker = User(
        clerk_id="clerk_renamer",
        email="renamer@example.com",
        name="Dana Levi",
        role="worker",
        synced_at=datetime.utcnow() - timedelta(hours=2),
    )
    db.add(worker)
    db.commit()
    _log_in_as_clerk_user(monkeypatch, "clerk_renamer", "sneaky_bot")
    monkeypatch.setattr(
        auth,
        "_fetch_clerk_profile",
        lambda clerk_id: ("renamer@example.com", "sneaky_bot", None),
    )

    user = auth.get_current_user(credentials=_creds(), db=db)

    assert user.name == "sneaky_bot"
    assert user.role == "worker"
