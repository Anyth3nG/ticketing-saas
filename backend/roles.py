"""The account roles, named once.

`users.role` is a plain string column with no database constraint, so these
constants are the only definition of what a valid role is.

    manager   hands out work, reviews it, sees every ticket
    worker    does assigned work and keeps a personal board
    bot       a service account (the Orion integration): reads every ticket and
              comment, and may never write anything. Enforced for every route
              at once by auth.reject_bot_writes, not per route -- see there.

A new account is a worker, unless its name ends in "_bot" (role_for_new_account).
Nothing else a login can do ever raises a role.
"""

MANAGER = "manager"
WORKER = "worker"
BOT = "bot"

# HTTP methods that cannot change state. A bot may use these and nothing else.
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

BOT_NAME_SUFFIX = "_bot"


def role_for_new_account(name: str) -> str:
    """The role a brand-new account is created with, decided by its name.

    A name ending in "_bot" (orion_bot, grok_bot, any case) is a bot, in every
    environment -- so a service account needs no hand-run UPDATE after its
    first login. Anything else is a worker.

    This is called only when the row is first created, never when it is
    refreshed from Clerk. Names come from Clerk and a person can edit their
    own, so applying it on refresh would let anyone rename themselves into a
    different role. At creation it is safe: self-serve sign-up is disabled, so
    every new account is one the manager provisioned and named, and the only
    thing the name can do is make the account read-only.
    """
    if name.strip().lower().endswith(BOT_NAME_SUFFIX):
        return BOT
    return WORKER
