"""Who the app knows by name, and which board they get.

Two accounts, two variables:

    ADMIN_EMAIL     the admin -- may open the read-only view of the manager's
                    board, and gets the custom layout in local development so
                    it can be tested without a second account
    MANAGER_EMAIL   the manager who asked for the custom layout -- this is
                    whose board that page shows, and who gets that layout in
                    every environment

Both default to empty, meaning nobody: an environment that hasn't been told
about these accounts behaves as though the feature isn't there, rather than
guessing. Addresses are compared case-folded, because they're typed into deploy
config by hand and a difference in capitalisation would otherwise match nothing
and produce an empty board with no error anywhere.

The frontend doesn't get its own copy of any of this. It reads `is_admin` and
`uses_custom_layout` off /users/me (see schemas.UserResponse), so there's one
source of truth and no chance of the two disagreeing.
"""
import os

# The custom board's own statuses. It also shows a Meetings column, but that
# one isn't ticket-backed -- see models/meeting.py -- so "meetings" is
# deliberately absent and a ticket can't be dragged into it.
CUSTOM_STATUSES = ("priority", "project_work", "contact", "send")

# Where newly created personal tickets land before being sorted into a kind.
LANDING_STATUS = "priority"

DEVELOPMENT = "development"


def _email(var: str) -> str:
    return os.getenv(var, "").strip().lower()


def admin_email() -> str:
    return _email("ADMIN_EMAIL")


def manager_email() -> str:
    return _email("MANAGER_EMAIL")


def is_development() -> bool:
    # Exact match, so anything unexpected -- a missing variable, a typo, an
    # environment nobody thought about -- reads as "not development".
    return os.getenv("ENVIRONMENT") == DEVELOPMENT


def is_admin(user) -> bool:
    configured = admin_email()
    return bool(configured) and _matches(user, configured)


def uses_custom_board(user) -> bool:
    """Whether this account's personal board uses the custom columns.

    The manager always. The admin only in local development -- that's the
    testing access, and it means no extra variable to set and unset, and no
    risk of a testing entry being left switched on in production.
    """
    manager = manager_email()
    if manager and _matches(user, manager):
        return True
    return is_development() and is_admin(user)


def _matches(user, email: str) -> bool:
    address = getattr(user, "email", None) or ""
    return address.lower() == email


def personal_landing_status(user) -> str:
    """The status a brand-new personal ticket starts in, for this user."""
    return LANDING_STATUS if uses_custom_board(user) else "personal_work"
