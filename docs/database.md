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
| `ticket_type` | String | Not null, defaults to `assigned` — one of `assigned`, `personal` |
| `status` | String | Not null, defaults to `to_do` — one of `to_do`, `personal_work`, `working_on`, `awaiting_approval`, `done` |
| `urgency` | String | Not null — one of `low`, `medium`, `high` |
| `due_date` | Date | Not null |
| `created_by` | Integer | Foreign key to `users.id`, not null |
| `is_recurring` | Boolean | Not null, defaults to `false` |
| `recurrence_day` | Integer | Nullable — day of month (1-31) |
| `template_id` | Integer | Foreign key to `recurring_ticket_templates.id`, nullable |
| `created_at` | DateTime | Not null, defaults to `utcnow` |
| `updated_at` | DateTime | Not null, defaults to `utcnow`, updates on every save |

Relationships:
- `creator` — the `User` who created the ticket (via `created_by`)
- `assignments` — related `TicketAssignment` rows
- `comments` — related `TicketComment` rows
- `template` — the `RecurringTicketTemplate` this ticket was generated from (via `template_id`)

> Note: tickets previously created with `status = open` were migrated to `status = to_do`.

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

### `ticket_comments`

Comments left on a ticket.

| Column | Type | Notes |
|---|---|---|
| `id` | Integer | Primary key |
| `ticket_id` | Integer | Foreign key to `tickets.id`, not null |
| `user_id` | Integer | Foreign key to `users.id`, not null |
| `content` | Text | Not null |
| `created_at` | DateTime | Not null, defaults to `utcnow` |

Relationships:
- `ticket` — the commented-on `Ticket`
- `user` — the `User` who wrote the comment

### `notifications`

In-app notifications, created when a comment is posted on a ticket.

| Column | Type | Notes |
|---|---|---|
| `id` | Integer | Primary key |
| `user_id` | Integer | Foreign key to `users.id`, not null — the recipient |
| `ticket_id` | Integer | Foreign key to `tickets.id`, not null |
| `comment_id` | Integer | Foreign key to `ticket_comments.id`, not null — the comment that triggered it |
| `is_read` | Boolean | Not null, defaults to `false` |
| `created_at` | DateTime | Not null, defaults to `utcnow` |

Relationships:
- `user` — the recipient `User`
- `ticket` — the `Ticket` the comment was posted on
- `comment` — the `TicketComment` that triggered the notification

Created for the ticket's creator and assignee(s), excluding whoever posted the comment
(`_comment_recipients` in `routes/tickets.py`). `GET /api/notifications` only returns unread
rows — once read, a notification no longer appears there. See [api.md](api.md).

### `recurring_ticket_templates`

Templates that generate new tickets on a recurring monthly schedule.

| Column | Type | Notes |
|---|---|---|
| `id` | Integer | Primary key |
| `title` | String | Not null |
| `description` | Text | Nullable |
| `urgency` | String | Not null |
| `ticket_type` | String | Not null — `assigned` or `personal` |
| `created_by` | Integer | Foreign key to `users.id`, not null |
| `assigned_to` | Integer | Foreign key to `users.id`, nullable — used only when `ticket_type` is `assigned` |
| `recurrence_day` | Integer | Not null — day of month (1-31) |
| `active` | Boolean | Not null, defaults to `true` |
| `created_at` | DateTime | Not null, defaults to `utcnow` |

Relationships:
- `creator` — the `User` who created the template (via `created_by`)
- `assignee` — the `User` tickets are assigned to (via `assigned_to`)
- `generated_tickets` — `Ticket` rows generated from this template

See [architecture.md](architecture.md) for the system overview.
