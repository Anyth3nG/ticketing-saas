"""Who gets the custom layout, and that unfinished work stays visible.

Two accounts, two variables: ADMIN_EMAIL and MANAGER_EMAIL. The manager gets
the custom layout everywhere; the admin gets it only in local development, so
it can be tested without a second account and without a testing entry that
could be left switched on in production.
"""
import pytest
from conftest import make_user

from custom_board import CUSTOM_STATUSES, LANDING_STATUS, is_admin, uses_custom_board

ADMIN = "admin@example.com"
MANAGER = "manager@example.com"


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for var in ("ADMIN_EMAIL", "MANAGER_EMAIL", "ENVIRONMENT"):
        monkeypatch.delenv(var, raising=False)


def _user(db, email):
    user = make_user(db, "manager")
    user.email = email
    db.commit()
    db.refresh(user)
    return user


def test_nobody_is_special_when_unconfigured(db):
    someone = _user(db, "someone@example.com")
    assert uses_custom_board(someone) is False
    assert is_admin(someone) is False


def test_the_manager_gets_the_custom_layout(db, monkeypatch):
    monkeypatch.setenv("MANAGER_EMAIL", MANAGER)
    assert uses_custom_board(_user(db, MANAGER)) is True
    assert uses_custom_board(_user(db, "other@example.com")) is False


@pytest.mark.parametrize("environment", ["prod", "test"])
def test_the_admin_does_not_get_it_in_deployed_environments(
    db, monkeypatch, environment
):
    monkeypatch.setenv("ADMIN_EMAIL", ADMIN)
    monkeypatch.setenv("MANAGER_EMAIL", MANAGER)
    monkeypatch.setenv("ENVIRONMENT", environment)

    admin = _user(db, ADMIN)
    assert is_admin(admin) is True
    assert uses_custom_board(admin) is False


def test_the_admin_gets_it_in_development(db, monkeypatch):
    # This is the testing access: no second account, and nothing to switch off
    # again afterwards.
    monkeypatch.setenv("ADMIN_EMAIL", ADMIN)
    monkeypatch.setenv("MANAGER_EMAIL", MANAGER)
    monkeypatch.setenv("ENVIRONMENT", "development")

    assert uses_custom_board(_user(db, ADMIN)) is True


def test_the_manager_keeps_it_in_every_environment(db, monkeypatch):
    monkeypatch.setenv("MANAGER_EMAIL", MANAGER)
    manager = _user(db, MANAGER)
    for environment in ("development", "test", "prod"):
        monkeypatch.setenv("ENVIRONMENT", environment)
        assert uses_custom_board(manager) is True


def test_addresses_are_matched_case_insensitively(db, monkeypatch):
    # These are typed into deploy config by hand. A capitalisation difference
    # must not silently exclude someone -- there'd be no error, just an empty
    # board.
    monkeypatch.setenv("MANAGER_EMAIL", "Manager@Example.COM")
    assert uses_custom_board(_user(db, MANAGER)) is True


def test_every_unfinished_status_maps_onto_a_drawn_column():
    # The claim migration f1c6a4e93d78 relies on: anything not already a custom
    # column and not done is sent to the landing column, so that column had
    # better be one the board draws.
    assert LANDING_STATUS in CUSTOM_STATUSES


@pytest.mark.parametrize(
    "status", ["to_do", "personal_work", "working_on", "awaiting_approval"]
)
def test_shared_statuses_are_not_columns_on_this_board(status):
    # Which is why they have to be swept: a ticket left in one of these would
    # be returned by the API and rendered into no column at all.
    assert status not in CUSTOM_STATUSES
