from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user, require_manager
from database import get_db
from models import User
from schemas import UserResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db), user: User = Depends(require_manager)):
    return db.query(User).all()


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    return user
