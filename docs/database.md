# Database Schema

> This document will be expanded once the data model is finalised.

## Overview

PostgreSQL is used as the database. One database exists per environment:

| Environment | Database Name |
|---|---|
| Dev | `ticketing_saas` |
| Test | `ticketing_saas` |
| Prod | `ticketing_saas` |

Schema changes are managed with **Alembic** migrations. Never edit the database schema manually — always create a migration.

## Running Migrations

```bash
# Apply all pending migrations
alembic upgrade head

# Roll back one migration
alembic downgrade -1

# Create a new migration after changing a model
alembic revision --autogenerate -m "description of change"
```

## Tables

### `users`

Team members. Synced from Clerk on login.

| Column | Type | Notes |
|---|---|---|
| `id` | Integer | Primary key |
| `clerk_id` | String | Unique, not null — Clerk's user ID |
| `email` | String | Unique, not null |
| `name` | String | Not null |
| `role` | String | Not null — `manager` or `worker` |
| `created_at` | DateTime | Not null, defaults to `utcnow` |

### `tickets`

Tasks and work items.

| Column | Type | Notes |
|---|---|---|
| `id` | Integer | Primary key |
| `title` | String | Not null |
| `description` | Text | Nullable |
| `status` | String | Not null, defaults to `open` — one of `open`, `working_on`, `awaiting_approval`, `done` |
| `urgency` | String | Not null — one of `low`, `medium`, `high` |
| `due_date` | Date | Not null |
| `created_by` | Integer | Foreign key to `users.id`, not null |
| `created_at` | DateTime | Not null, defaults to `utcnow` |
| `updated_at` | DateTime | Not null, defaults to `utcnow`, updates on every save |

Relationships:
- `creator` — the `User` who created the ticket (via `created_by`)
- `assignments` — related `TicketAssignment` rows

### `ticket_assignments`

Join table linking tickets to the users assigned to them.

| Column | Type | Notes |
|---|---|---|
| `id` | Integer | Primary key |
| `ticket_id` | Integer | Foreign key to `tickets.id`, not null |
| `user_id` | Integer | Foreign key to `users.id`, not null |
| `assigned_at` | DateTime | Not null, defaults to `utcnow` |

Relationships:
- `ticket` — the assigned `Ticket`
- `user` — the assigned `User`

See [architecture.md](architecture.md) for the system overview.
