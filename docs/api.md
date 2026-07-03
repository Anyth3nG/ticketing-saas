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

All endpoints below require `Authorization: Bearer <clerk_jwt_token>` except `/health`.

> Dev note: Clerk JWT verification is not yet wired in. `get_current_user` (in
> `backend/auth.py`) currently resolves to whichever DB user has
> `clerk_id == DEV_USER_CLERK_ID` (an env var), regardless of the token's
> contents. A valid-looking Bearer token is still required on every request.

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

`status` is always set to `open` on creation.

Response: `201 Created`, `TicketResponse`. `400` if `assigned_to` does not reference an existing user.

#### `GET /api/tickets`

List tickets.

- Managers: all tickets.
- Workers: only tickets they're assigned to (via `ticket_assignments`).

Response: `200 OK`, `list[TicketResponse]`

#### `GET /api/tickets/{id}`

Get a single ticket with its assignees.

- Managers: any ticket.
- Workers: only if assigned to the ticket — otherwise `403`.

Response: `200 OK`, `TicketResponse`. `404` if the ticket doesn't exist.

#### `PUT /api/tickets/{id}`

Update a ticket's fields. **Managers only**.

Request body (`TicketUpdate`, all fields optional — only provided fields are changed):

| Field | Type |
|---|---|
| `title` | string |
| `description` | string |
| `urgency` | `low` \| `medium` \| `high` |
| `due_date` | date |
| `status` | `open` \| `working_on` \| `awaiting_approval` \| `done` |

Response: `200 OK`, `TicketResponse`. `404` if the ticket doesn't exist.

#### `PUT /api/tickets/{id}/status`

Update just a ticket's status.

Request body (`TicketStatusUpdate`): `{ "status": "..." }`, one of `open`, `working_on`, `awaiting_approval`, `done`.

- Managers: can set any status.
- Workers: only on tickets assigned to them, and only to `working_on`, `awaiting_approval`, or `done` (cannot reopen a ticket).

Response: `200 OK`, `TicketResponse`. `403` if not assigned / not an allowed status. `404` if the ticket doesn't exist.

#### `DELETE /api/tickets/{id}`

Delete a ticket and its assignments. **Managers only**.

Response: `204 No Content`. `404` if the ticket doesn't exist.

### Health

#### `GET /health`

No auth required. Used by the ALB.

Response: `200 OK`, `{ "status": "ok" }`
