# FastAPI Conventions

## Project Structure

```
backend/
├── main.py          ← app entry point, registers routers
├── database.py      ← DB session and engine setup
├── auth.py          ← Clerk JWT validation middleware
├── routes/          ← one file per resource
│   ├── tickets.py
│   └── users.py
└── models/          ← SQLAlchemy models, one file per table
    ├── ticket.py
    └── user.py
```

## Route Structure

Each resource gets its own router file in `routes/`:

```python
from fastapi import APIRouter, Depends
from database import get_db

router = APIRouter(prefix="/tickets", tags=["tickets"])

@router.get("/")
def list_tickets(db = Depends(get_db)):
    pass
```

Routers are registered in `main.py`:

```python
from routes.tickets import router as tickets_router
app.include_router(tickets_router, prefix="/api")
```

## Database Sessions

DB sessions are injected via FastAPI's dependency injection:

```python
# database.py
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

Always use `Depends(get_db)` in route functions — never instantiate a session directly in a route.

## Auth

All routes except `/health` require a valid Clerk JWT token. Auth is handled via a dependency:

```python
# Usage in a route
@router.get("/")
def list_tickets(db = Depends(get_db), user = Depends(get_current_user)):
    pass
```

`get_current_user` is defined in `auth.py` and does the following on every request:

1. Extracts the Bearer token from the `Authorization` header via `HTTPBearer` (missing header → `401`).
2. Fetches Clerk's public JWKS from `{CLERK_FRONTEND_API}/.well-known/jwks.json`, cached in-memory in
   `auth.py` and refetched once if the token's `kid` isn't found (handles Clerk key rotation).
3. Verifies the JWT signature and `iss` claim with `python-jose` (`jwt.decode(..., algorithms=["RS256"])`).
   Invalid/expired/malformed tokens → `401`.
4. Looks up the `User` row by the token's `sub` claim (`clerk_id`). If no row exists yet, creates one from
   the token's `email`/`name` claims with `role="worker"` — first login auto-provisions the user.

Required env vars: `CLERK_SECRET_KEY`, `CLERK_FRONTEND_API` (Clerk's Frontend API URL, including the
`https://` scheme — see `.env.example`).

`get_current_user` returns the SQLAlchemy `User` model, so `user.id` / `user.role` / etc. are available
directly in route handlers.

## Role Checking

Two roles exist: `manager` and `worker`. Role is stored on the user model and checked in routes:

```python
def require_manager(user = Depends(get_current_user)):
    if user.role != "manager":
        raise HTTPException(status_code=403, detail="Managers only")
    return user
```

## Error Responses

Use FastAPI's `HTTPException` for all errors:

```python
raise HTTPException(status_code=404, detail="Ticket not found")
raise HTTPException(status_code=403, detail="Not authorized")
raise HTTPException(status_code=400, detail="Invalid input")
```

## Naming Conventions

- Files: `snake_case.py`
- Routes: plural, snake_case (`/tickets`, `/users`)
- Functions: `snake_case`
- Models: `PascalCase`

## Environment Variables

Loaded via `python-dotenv` in `main.py`:

```python
from dotenv import load_dotenv
load_dotenv()
```

Access via `os.getenv("VARIABLE_NAME")`.

## Health Endpoint

Always present at `/health` — used by the ALB for health checks:

```python
@app.get("/health")
def health():
    return {"status": "ok"}
```
