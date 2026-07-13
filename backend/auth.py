# Validates Clerk JWT tokens from the Authorization header using Clerk's JWKS.
import os

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import get_db
from models import User

security = HTTPBearer()

CLERK_FRONTEND_API = os.getenv("CLERK_FRONTEND_API", "")
CLERK_ISSUER = (
    CLERK_FRONTEND_API
    if CLERK_FRONTEND_API.startswith("http")
    else f"https://{CLERK_FRONTEND_API}"
)
CLERK_JWKS_URL = f"{CLERK_ISSUER}/.well-known/jwks.json"

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY")
CLERK_BACKEND_API_URL = "https://api.clerk.com/v1"

_jwks_cache: dict | None = None


def _fetch_jwks() -> dict:
    global _jwks_cache
    response = httpx.get(CLERK_JWKS_URL, timeout=5)
    response.raise_for_status()
    _jwks_cache = response.json()
    return _jwks_cache


def _get_signing_key(token: str) -> dict:
    kid = jwt.get_unverified_header(token).get("kid")

    jwks = _jwks_cache or _fetch_jwks()
    key = next((k for k in jwks["keys"] if k["kid"] == kid), None)

    if key is None:
        # Key may have rotated on Clerk's side — refetch once and retry.
        jwks = _fetch_jwks()
        key = next((k for k in jwks["keys"] if k["kid"] == kid), None)

    if key is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    return key


def _fetch_clerk_profile(clerk_id: str) -> tuple[str | None, str | None]:
    response = httpx.get(
        f"{CLERK_BACKEND_API_URL}/users/{clerk_id}",
        headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"},
        timeout=5,
    )
    response.raise_for_status()
    data = response.json()

    email = next(
        (
            e["email_address"]
            for e in data.get("email_addresses", [])
            if e["id"] == data.get("primary_email_address_id")
        ),
        None,
    )
    name = " ".join(filter(None, [data.get("first_name"), data.get("last_name")])) or None

    # Accounts created via username/password sign-up (no email collected)
    # have no email_addresses entry. users.email is NOT NULL + unique, so
    # derive a placeholder from the username rather than failing closed.
    username = data.get("username")
    if username:
        email = email or f"{username}@no-email.local"
        name = name or username

    return email, name


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials

    try:
        signing_key = _get_signing_key(token)
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER,
            options={"verify_aud": False},
        )
    except HTTPException:
        raise
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    clerk_id = payload.get("sub")
    if not clerk_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.clerk_id == clerk_id).first()
    if user is not None:
        return user

    email, name = _fetch_clerk_profile(clerk_id)
    if not email or not name:
        raise HTTPException(status_code=401, detail="Clerk profile missing required fields")

    user = User(clerk_id=clerk_id, email=email, name=name, role="worker")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def require_manager(user: User = Depends(get_current_user)) -> User:
    if user.role != "manager":
        raise HTTPException(status_code=403, detail="Managers only")
    return user
