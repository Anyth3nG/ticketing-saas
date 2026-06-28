# Validates Clerk JWT tokens from the Authorization header using CLERK_SECRET_KEY.
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

security = HTTPBearer()


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    # TODO: verify credentials.credentials against Clerk's JWKS endpoint
    raise HTTPException(status_code=501, detail="Auth not yet implemented")
