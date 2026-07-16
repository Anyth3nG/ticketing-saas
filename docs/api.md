# API Reference

> This document will be expanded as endpoints are built.

## Base URLs

| Environment | URL |
|---|---|
| Dev | `http://localhost/api` |
| Test | `https://api-test.clientdomain.com` |
| Prod | `https://api.clientdomain.com` |

## Authentication

All protected endpoints require a Clerk JWT token in the Authorization header:

```
Authorization: Bearer <clerk_jwt_token>
```

Clerk issues this token after the user signs in with Google OAuth. The frontend includes it automatically on every API request.

## Interactive Docs

FastAPI auto-generates interactive API documentation. When the backend is running, visit:

- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

These are available in dev and test environments only — disabled in prod.

## Endpoints

All endpoints below require `Authorization: Bearer <clerk_jwt_token>` except `/health`. Tokens
are fully verified against Clerk's JWKS in `get_current_user` (`backend/auth.py`) — there is no
dev bypass.

### Users

#### `GET /api/users`

List all users. **Managers only** — returns `403` for workers.

Response: `200 OK`, `list[UserResponse]`

#### `GET /api/users/me`

Get the currently authenticated user.

Response: `200 OK`, `UserResponse`

### Tickets

#### `POST /api/tickets`

Create a ticket and assign it to a user, in a single transaction. **Managers only**.

Request body (`TicketCreate`):

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required |
| `description` | string | Optional |
| `urgency` | string | One of `low`, `medium`, `high` |
| `due_date` | date (`YYYY-MM-DD`) | Required |
| `assigned_to` | int | `user_id` of the assignee; must exist |

`status` is always set to `to_do` on creation.

Response: `201 Created`, `TicketResponse`. `400` if `assigned_to` does not reference an existing user.

#### `POST /api/tickets/personal`

Create a personal ticket (`ticket_type = "personal"`) for the current user. Any authenticated
user (manager or worker).

Request body (`PersonalTicketCreate`):

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required |
| `description` | string | Optional |
| `urgency` | string | One of `low`, `medium`, `high` |
| `is_recurring` | boolean | Default `false` |
| `due_date` | date (`YYYY-MM-DD`) | Required when `is_recurring` is `false`; disallowed when `true` |
| `recurrence_day` | int (1-31) | Required when `is_recurring` is `true`; disallowed when `false` |

Two different response shapes depending on `is_recurring` (no single `response_model`, since
FastAPI/Swagger can't express a union — see the route's docstring in `routes/tickets.py`):

- `is_recurring: false` — a `Ticket` is created immediately with `status: "personal_work"`.
  Response: `201 Created`, `TicketResponse`.
- `is_recurring: true` — a `RecurringTicketTemplate` is created (`id`, `title`, `ticket_type`,
  `recurrence_day`, `active`). No `Ticket` row exists yet; it's materialized lazily by
  `generate_due_recurring_tickets` the next time `GET /api/tickets` runs, same mechanism as
  assigned recurring tickets. Response: `201 Created`, `RecurringTemplateResponse`.

`400` if `is_recurring` doesn't match which of `due_date`/`recurrence_day` was provided.

#### `GET /api/tickets`

List tickets.

Before querying, this endpoint calls `generate_due_recurring_tickets(db, current_user)`
(`backend/services/recurring_tickets.py`), which creates one ticket per active
`RecurringTicketTemplate` the current user can see, for the current calendar month — as soon
as the month is visited, not just once the template's `recurrence_day` arrives. `due_date` is
still set to the real recurrence day (clamped to the end of the month), so a template whose
day hasn't come up yet still generates a ticket, just with a future due date; this is what
lets a "this month" view show upcoming recurring work ahead of time. There is no background
job or scheduler for this — generation happens lazily, inline in the request, the first time a
relevant user loads their ticket list each month. The function is idempotent (safe to call on
every request) and commits in a single transaction.

Query params:

| Param | Type | Notes |
|---|---|---|
| `include_archived` | boolean | Default `false`. When `false`, tickets with `status = "done"` are excluded. |

- Managers: all tickets (including workers' personal tickets).
- Workers: tickets they're assigned to (via `ticket_assignments`), plus their own personal
  tickets (`ticket_type = "personal"` and `created_by = <them>`).

Response: `200 OK`, `list[TicketResponse]`

#### `GET /api/tickets/{id}`

Get a single ticket with its assignees.

- Managers: any ticket.
- Workers: assigned to the ticket, or the creator of a personal ticket — otherwise `403`.

Response: `200 OK`, `TicketResponse`. `404` if the ticket doesn't exist.

#### `PUT /api/tickets/{id}`

Update a ticket's fields.

- Managers: only while the ticket's `status` is `to_do` — otherwise `403`. Once a worker has
  started on it, field edits go through the assigned worker instead.
- Workers: only their own personal tickets (`ticket_type = "personal"` and `created_by =
  <them>`), any status — otherwise `403`. An assigned-but-not-personal ticket cannot be
  field-edited by a worker, only status-updated via the endpoint below.

Request body (`TicketUpdate`, all fields optional — only provided fields are changed):

| Field | Type |
|---|---|
| `title` | string |
| `description` | string |
| `urgency` | `low` \| `medium` \| `high` |
| `due_date` | date |

`status` is deliberately not a field on this endpoint — it's silently dropped if sent, not
applied. Status can only be changed via `PATCH /tickets/{id}/status` below, which has its own
authorization; allowing it here too would let a manager bypass the approve-only rule.

Response: `200 OK`, `TicketResponse`. `404` if the ticket doesn't exist.

#### `PATCH /api/tickets/{id}/status`

Update just a ticket's status.

Request body (`TicketStatusUpdate`): `{ "status": "..." }`, one of `to_do`, `personal_work`, `working_on`, `awaiting_approval`, `done`.

- Managers: can only approve — move a ticket from `awaiting_approval` to `done`. Any other
  status value, or a source status other than `awaiting_approval`, is `403`.
- Workers: free movement between any of the 5 statuses, no enforced sequence (e.g. a `done`
  ticket can go straight back to `to_do`), on tickets they're assigned to or personal tickets
  they created.

Response: `200 OK`, `TicketResponse`. `403` if not authorized on the ticket. `404` if the ticket doesn't exist.

#### `POST /api/tickets/{id}/assignments`

Assign or reassign a ticket to a worker. **Managers only**. Replaces any existing assignment
(single-assignee model) — does not add a second assignee.

Request body (`AssignmentCreate`): `{ "user_id": <int> }`.

Response: `200 OK`, `TicketResponse`. `400` if `user_id` doesn't reference an existing user. `404` if the ticket doesn't exist.

#### `POST /api/tickets/{id}/comments`

Add a comment to a ticket. Same view rule as `GET /api/tickets/{id}` (manager, assigned
worker, or the worker who created a personal ticket) — `403` otherwise.

Request body (`TicketCommentCreate`): `{ "content": "..." }`.

Response: `201 Created`, `TicketCommentResponse` (`id`, `ticket_id`, `content`, `created_at`,
nested `user`). `404` if the ticket doesn't exist.

#### `GET /api/tickets/{id}/comments`

List a ticket's comments, oldest first. Same view rule as above.

Response: `200 OK`, `list[TicketCommentResponse]`. `404` if the ticket doesn't exist.

#### `DELETE /api/tickets/{id}`

Delete a ticket and its assignments. **Managers only**.

Response: `204 No Content`. `404` if the ticket doesn't exist.

### Notifications

In-app notifications for ticket comments. A notification is created for a ticket's creator and
assignee(s) whenever someone else posts a comment on it (see `POST /api/tickets/{id}/comments`
above) — the commenter themselves is never notified of their own comment.

#### `GET /api/notifications`

List the current user's **unread** notifications, most recent first. Read notifications are not
returned — there's no separate "history" endpoint.

Response: `200 OK`, `list[NotificationResponse]` (`id`, `ticket_id`, `ticket_title`, `is_read`,
`created_at`, nested `comment` — a `TicketCommentResponse`). Capped at 50.

#### `POST /api/notifications/{id}/read`

Mark one notification read. Only the recipient can mark their own notification — `404` for any
other user, including a valid `id` belonging to someone else (so as not to leak its existence).

Response: `200 OK`, `NotificationResponse`. `404` if the notification doesn't exist for the
current user.

#### `POST /api/notifications/read-all`

Mark all of the current user's unread notifications read.

Response: `204 No Content`.

### Health

#### `GET /health`

No auth required. Used by the ALB.

Response: `200 OK`, `{ "status": "ok" }`
