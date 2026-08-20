from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from custom_board import uses_custom_board
from database import get_db
from models import Meeting, User
from schemas import MeetingCreate, MeetingResponse, MeetingUpdate

router = APIRouter(prefix="/meetings", tags=["meetings"])


def _require_custom_board(user: User = Depends(get_current_user)) -> User:
    # Meetings only exist as a column on the custom personal board, so there's
    # nowhere for anyone else to see or use them. Gating here rather than
    # letting the routes answer for everyone keeps this from quietly becoming
    # a feature the rest of the app half-has.
    if not uses_custom_board(user):
        raise HTTPException(status_code=403, detail="Not available on this board")
    return user


@router.get("/", response_model=list[MeetingResponse])
def list_meetings(
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_custom_board),
):
    return (
        db.query(Meeting)
        .filter(Meeting.user_id == current_user.id)
        .order_by(Meeting.starts_at.asc())
        .all()
    )


@router.post("/", response_model=MeetingResponse, status_code=201)
def create_meeting(
    payload: MeetingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_custom_board),
):
    if payload.ends_at is not None and payload.ends_at < payload.starts_at:
        raise HTTPException(status_code=400, detail="ends_at cannot precede starts_at")

    meeting = Meeting(
        user_id=current_user.id,
        title=payload.title,
        notes=payload.notes,
        location=payload.location,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        source="manual",
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


def _get_own_meeting_or_404(db: Session, meeting_id: int, user: User) -> Meeting:
    meeting = (
        db.query(Meeting)
        .filter(Meeting.id == meeting_id, Meeting.user_id == user.id)
        .first()
    )
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.patch("/{meeting_id}", response_model=MeetingResponse)
def update_meeting(
    meeting_id: int,
    payload: MeetingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_custom_board),
):
    meeting = _get_own_meeting_or_404(db, meeting_id, current_user)
    if not meeting.is_editable:
        # Same reasoning as delete: the sync only runs Outlook -> board, so an
        # edit here would be overwritten without warning on the next run.
        raise HTTPException(
            status_code=409,
            detail="This meeting comes from Outlook -- edit it there instead",
        )

    fields = payload.model_dump(exclude_unset=True)

    # Validated against the values the meeting will actually end up with, not
    # just the ones in this request -- otherwise moving only the start time
    # past an existing end time would slip through.
    starts_at = fields.get("starts_at", meeting.starts_at)
    ends_at = fields.get("ends_at", meeting.ends_at)
    if ends_at is not None and ends_at < starts_at:
        raise HTTPException(status_code=400, detail="ends_at cannot precede starts_at")

    for field, value in fields.items():
        setattr(meeting, field, value)

    db.commit()
    db.refresh(meeting)
    return meeting


@router.delete("/{meeting_id}", status_code=204)
def delete_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_custom_board),
):
    meeting = _get_own_meeting_or_404(db, meeting_id, current_user)
    if not meeting.is_editable:
        # A mirrored entry deleted here would simply reappear on the next sync,
        # since the sync only runs one way. Refusing is clearer than letting it
        # vanish and silently come back.
        raise HTTPException(
            status_code=409,
            detail="This meeting comes from Outlook -- delete it there instead",
        )
    db.delete(meeting)
    db.commit()
    return None
