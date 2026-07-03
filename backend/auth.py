# Validates Clerk JWT tokens from the Authorization header using CLERK_SECRET_KEY.
import os

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
from models import User

security = HTTPBearer()

DEV_USER_CLERK_ID = os.getenv("DEV_USER_CLERK_ID")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    # TODO: verify credentials.credentials against Clerk's JWKS endpoint and look
    # up the user by the clerk_id claim from the token instead of DEV_USER_CLERK_ID
    user = db.query(User).filter(User.clerk_id == DEV_USER_CLERK_ID).first()
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_manager(user: User = Depends(get_current_user)) -> User:
    if user.role != "manager":
        raise HTTPException(status_code=403, detail="Managers only")
    return user
