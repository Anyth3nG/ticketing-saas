"""One account's personal board runs on its own set of statuses.

The shared statuses (`to_do` / `personal_work` / `working_on` /
`awaiting_approval`) describe how work moves between a manager and a worker.
They don't describe how this account actually organises its own day, which is
by kind of work rather than by stage of approval -- so its personal board gets
its own statuses instead.

This is scoped to specific accounts on purpose, the same way `routes/admin.py`
is: it's one person's board, not a new permission tier or a per-user
customisation feature. Everyone else keeps the shared statuses untouched.
"""

# Same person as routes/admin.py's TARGET_EMAIL, which imports from here so
# the address is written down once.
CUSTOM_BOARD_EMAIL = "yulia@max-cpa.co.il"

# To try this board on your own account, add your email here and to the
# matching list in frontend/src/utils/customBoard.js -- both are needed, since
# the backend decides which statuses you may use and the frontend decides which
# columns to draw. Remove both to go back to the standard board.
CUSTOM_BOARD_EMAILS = frozenset({CUSTOM_BOARD_EMAIL, "daniel2233x@gmail.com"})

# Where newly created personal tickets land before being sorted into a kind.
LANDING_STATUS = "priority"

# Ticket statuses on this board. The board also shows a Meetings column, but
# that one isn't ticket-backed -- see models/meeting.py -- so "meetings" is
# deliberately absent here and a ticket can't be dragged into it.
CUSTOM_STATUSES = ("priority", "project_work", "contact", "send")


def uses_custom_board(user) -> bool:
    return user.email in CUSTOM_BOARD_EMAILS


def personal_landing_status(user) -> str:
    """The status a brand-new personal ticket starts in, for this user."""
    return LANDING_STATUS if uses_custom_board(user) else "personal_work"
