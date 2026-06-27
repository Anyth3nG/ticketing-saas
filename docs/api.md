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

> To be defined — endpoints will be documented here as they are built.

Planned endpoint groups:

- `GET/POST /api/tickets` — list and create tickets
- `GET/PUT/DELETE /api/tickets/{id}` — get, update, close a ticket
- `GET /api/users` — list team members
- `POST /api/tickets/{id}/comments` — add a comment to a ticket
- `GET /health` — health check (used by ALB)
