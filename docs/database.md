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
| `avatar_url` | String | Nullable — Clerk's `image_url` for this user |
| `role` | String | Not null — `manager` or `worker` |
| `created_at` | DateTime | Not null, defaults to `utcnow` |
| `synced_at` | DateTime | Nullable — last time `name`/`email`/`avatar_url` were refreshed from Clerk; null for rows created before this column existed, until their next sync |
| `dashboard_layout` | JSON | Nullable — a manager's saved display order for worker boards on the Team Board, as a list of worker `id`s; null until they've customized it once. Only ever meaningful for managers. |

`name`, `email`, and `avatar_url` are refreshed from Clerk in `get_current_user`
(`backend/auth.py`), throttled to once per hour per user (`PROFILE_SYNC_INTERVAL`) rather than
on every request — that dependency runs on every API call, including the frontend's own
polling, so an unthrottled live fetch would hammer Clerk's API. A Clerk API failure during a
refresh is swallowed and the request proceeds with the last-known profile.

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
| `assigned_to` | Integer | Foreign key to `users.id`, nullable — null for personal tickets |
| `is_recurring` | Boolean | Not null, defaults to `false` |
| `recurrence_day` | Integer | Nullable — day of month (1-31) |
| `template_id` | Integer | Foreign key to `recurring_ticket_templates.id`, nullable |
| `created_at` | DateTime | Not null, defaults to `utcnow` |
| `updated_at` | DateTime | Not null, defaults to `utcnow`, updates on every save |
| `completed_at` | DateTime | Nullable — set only by `PATCH /tickets/{id}/status` when `status` transitions to `done`, cleared if it's ever moved off `done`. Unlike `updated_at`, an unrelated field edit can't bump it, so it's the reliable "when was this actually completed" value (used by Archive) |

Relationships:
- `creator` — the `User` who created the ticket (via `created_by`)
- `assignee` — the `User` the ticket is assigned to (via `assigned_to`), if any
- `comments` — related `TicketComment` rows
- `template` — the `RecurringTicketTemplate` this ticket was generated from (via `template_id`)

> Note: tickets marked `done` before `completed_at` existed were backfilled from their
> `updated_at` value (the closest available approximation, and what Archive already displayed
> as the completion time before this column was added).

> Note: tickets previously created with `status = open` were migrated to `status = to_do`.

> Note: assignment used to go through a separate `ticket_assignments` join table. It was
> removed in favor of `assigned_to` directly on `tickets` — the app only ever kept one
> assignee alive per ticket (reassignment deleted the old row and inserted a new one), so the
> join table's many-to-many capability was never actually used.

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

In-app notifications. Two kinds, distinguished by `type`: a comment reply on a ticket, or a
ticket being (re)assigned to you.

| Column | Type | Notes |
|---|---|---|
| `id` | Integer | Primary key |
| `user_id` | Integer | Foreign key to `users.id`, not null — the recipient |
| `ticket_id` | Integer | Foreign key to `tickets.id`, not null |
| `comment_id` | Integer | Foreign key to `ticket_comments.id`, nullable — the comment that triggered it; null for a `ticket_assigned` notification, which isn't tied to any comment |
| `type` | String | Not null, defaults to `comment` — `comment` or `ticket_assigned` |
| `is_read` | Boolean | Not null, defaults to `false` |
| `created_at` | DateTime | Not null, defaults to `utcnow` |

Relationships:
- `user` — the recipient `User`
- `ticket` — the `Ticket` the notification is about
- `comment` — the `TicketComment` that triggered it, for `type = "comment"` only

`type = "comment"` is created for the ticket's creator and assignee, excluding whoever posted
the comment (`_comment_recipients` in `routes/tickets.py`). Personal tickets have no assignee,
so for those every manager is a recipient instead — this applies equally whether the personal
ticket belongs to a worker or to a manager's own "My Work" board.

`type = "ticket_assigned"` is created for the assignee whenever a ticket is created
(`POST /api/tickets`) or reassigned (`POST /api/tickets/{id}/assignments`) — not for the
manager who did the assigning, and not for personal tickets (which have no assignee).

`GET /api/notifications` only returns unread rows — once read, a notification no longer
appears there. See [api.md](api.md).

> Note: every notification created before `type` existed was a comment reply, so the migration
> that added the column backfilled all of them to `type = "comment"`.

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

"Deleting" a recurring ticket (`DELETE /api/tickets/recurring-templates/{id}`, see
[api.md](api.md)) sets `active = false` rather than removing the row — `active.is_(True)` is
already part of `generate_due_recurring_tickets`' filter, so an inactive template simply never
generates again, while past **completed** `Ticket` rows keep a valid `template_id` foreign key
for Archive history. The same call also deletes that template's current not-yet-`done`
instance, if any.

See [architecture.md](architecture.md) for the system overview.
