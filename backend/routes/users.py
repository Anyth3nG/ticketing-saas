from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user, require_manager
from database import get_db
from models import User
from schemas import DashboardLayoutUpdate, UserResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db), user: User = Depends(require_manager)):
    return db.query(User).all()


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    return user


@router.put("/me/dashboard-layout", response_model=UserResponse)
def update_dashboard_layout(
    payload: DashboardLayoutUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    # Only keep ids that are real, current workers -- drops anything stale
    # (a removed account) or forged (a non-worker id) rather than trusting
    # the client-supplied order outright.
    valid_worker_ids = {
        u.id for u in db.query(User.id).filter(User.role == "worker").all()
    }
    current_user.dashboard_layout = [
        worker_id for worker_id in payload.worker_order if worker_id in valid_worker_ids
    ]
    db.commit()
    db.refresh(current_user)
    return current_user
