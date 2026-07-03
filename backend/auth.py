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

    email = payload.get("email")
    name = payload.get("name")
    if not email or not name:
        raise HTTPException(status_code=401, detail="Token missing required claims")

    user = User(clerk_id=clerk_id, email=email, name=name, role="worker")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def require_manager(user: User = Depends(get_current_user)) -> User:
    if user.role != "manager":
        raise HTTPException(status_code=403, detail="Managers only")
    return user
