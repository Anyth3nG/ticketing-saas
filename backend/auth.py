# Validates Clerk JWT tokens from the Authorization header using Clerk's JWKS.
import os
from datetime import datetime, timedelta

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from models import User

security = HTTPBearer()

# How often an existing user's name/email/avatar gets refreshed from Clerk.
# get_current_user runs on every request (including the frontend's own
# polling), so this can't be a live fetch every time without hammering
# Clerk's API -- an hourly refresh keeps profile changes showing up within
# a normal work session without that cost.
PROFILE_SYNC_INTERVAL = timedelta(hours=1)

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
    try:
        response = httpx.get(CLERK_JWKS_URL, timeout=5)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Unable to reach Clerk to verify token") from exc
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


def _fetch_clerk_profile(clerk_id: str) -> tuple[str | None, str | None, str | None]:
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
    avatar_url = data.get("image_url")

    # Accounts created via username/password sign-up (no email collected)
    # have no email_addresses entry. users.email is NOT NULL + unique, so
    # derive a placeholder from the username rather than failing closed.
    username = data.get("username")
    if username:
        email = email or f"{username}@no-email.local"
        name = name or username

    return email, name, avatar_url


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

    try:
        user = db.query(User).filter(User.clerk_id == clerk_id).first()
    except SQLAlchemyError as exc:
        # e.g. prod DB behind on migrations (missing avatar_url/synced_at
        # columns) or unreachable -- surface a clean 503 instead of a raw
        # 500 that strips CORS headers and looks like a browser CORS bug.
        raise HTTPException(status_code=503, detail="Database error") from exc

    if user is not None:
        stale = user.synced_at is None or (
            datetime.utcnow() - user.synced_at > PROFILE_SYNC_INTERVAL
        )
        if stale:
            try:
                email, name, avatar_url = _fetch_clerk_profile(clerk_id)
                if email:
                    user.email = email
                if name:
                    user.name = name
                user.avatar_url = avatar_url
                user.synced_at = datetime.utcnow()
                db.commit()
                db.refresh(user)
            except httpx.HTTPError:
                # Clerk hiccup -- keep serving the request with the
                # last-known profile rather than failing every route.
                pass
            except SQLAlchemyError:
                # DB failure during an opportunistic best-effort sync --
                # roll back and serve the already-loaded row rather than
                # failing the request over a profile refresh.
                db.rollback()
        return user

    try:
        email, name, avatar_url = _fetch_clerk_profile(clerk_id)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Unable to reach Clerk to create user profile") from exc
    if not email or not name:
        raise HTTPException(status_code=401, detail="Clerk profile missing required fields")

    user = User(
        clerk_id=clerk_id,
        email=email,
        name=name,
        avatar_url=avatar_url,
        role="worker",
        synced_at=datetime.utcnow(),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent request for the same brand-new user (the frontend
        # fires several API calls in parallel on load) already inserted this
        # clerk_id. Roll back and use the row they created rather than
        # failing this request on the unique-constraint violation.
        db.rollback()
        user = db.query(User).filter(User.clerk_id == clerk_id).first()
        if user is None:
            # The collision was on email, not clerk_id: this person already has
            # a row holding a stale clerk_id, because their Clerk identity was
            # reissued (Clerk instance switched, or the Clerk user was deleted
            # and recreated). Re-link that row to the new clerk_id -- otherwise
            # every request they make 503s forever, since the lookup keeps
            # missing and the INSERT keeps hitting users_email_key.
            #
            # This inherits the matched row's role, so email is being trusted
            # as an identity claim. That holds only because sign-up is disabled
            # on the Clerk instance and every account is provisioned by hand,
            # so nobody can present a token for an email they weren't given.
            # Re-enabling self-serve sign-up would make this a takeover path.
            #
            # Placeholder emails are excluded: they're derived from the Clerk
            # username (see _fetch_clerk_profile), which is user-editable, so
            # matching on one would let a worker claim another row by renaming.
            user = None
            if email and not email.endswith("@no-email.local"):
                user = db.query(User).filter(User.email == email).first()
            if user is not None:
                user.clerk_id = clerk_id
                user.name = name or user.name
                user.avatar_url = avatar_url
                user.synced_at = datetime.utcnow()
                try:
                    db.commit()
                    db.refresh(user)
                except SQLAlchemyError as exc:
                    db.rollback()
                    raise HTTPException(status_code=503, detail="Database error") from exc
        if user is None:
            raise HTTPException(status_code=503, detail="Database error")
        return user
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database error") from exc
    db.refresh(user)
    return user


def require_manager(user: User = Depends(get_current_user)) -> User:
    if user.role != "manager":
        raise HTTPException(status_code=403, detail="Managers only")
    return user
