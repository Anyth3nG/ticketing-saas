import { useState } from "react";
import { useAuth } from "@clerk/react";
import { createMeeting, deleteMeeting, updateMeeting } from "../api/meetings";
import { TrashIcon } from "./icons";

// One form for both creating and editing. `meeting` decides which: absent
// means a new entry on `dateISO`, present means editing that one.
//
// Times are exchanged as naive local wall-clock strings with no timezone
// suffix, matching how the backend stores them -- see backend/models/meeting.py.

// "2026-08-19T14:30:00" -> "2026-08-19"
function datePart(isoDateTime) {
  return isoDateTime.slice(0, 10);
}

// "2026-08-19T14:30:00" -> "14:30".
function timePart(isoDateTime) {
  return isoDateTime.slice(11, 16);
}

// Times are typed into a plain text field rather than an <input type="time">.
// That control's 12h/24h display comes from the browser's own locale and can't
// be overridden by the page -- not by the lang attribute, not by CSS -- so on
// a 12-hour locale it shows AM/PM regardless. A text field renders exactly the
// characters we put in it, in every browser.

// Keeps the field to digits and a single colon, and inserts the colon after
// the hours so it can be typed as "1430". Anything else is dropped as typed
// rather than rejected on submit.
function maskTime(input) {
  const digits = input.replace(/\D/g, "").slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function isCompleteTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

// Own-board endpoints. The admin page passes its own set instead, which act on
// the target's board rather than the caller's -- same form, different owner.
const OWN_BOARD_API = {
  create: createMeeting,
  update: updateMeeting,
  remove: deleteMeeting,
};

export default function MeetingModal({
  meeting,
  dateISO,
  api = OWN_BOARD_API,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(meeting);
  const readOnly = isEdit && !meeting.is_editable;

  const { getToken } = useAuth();
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [location, setLocation] = useState(meeting?.location ?? "");
  const [notes, setNotes] = useState(meeting?.notes ?? "");
  const [date, setDate] = useState(
    meeting ? datePart(meeting.starts_at) : dateISO
  );
  const [startTime, setStartTime] = useState(
    meeting ? timePart(meeting.starts_at) : "09:00"
  );
  const [endTime, setEndTime] = useState(
    meeting?.ends_at ? timePart(meeting.ends_at) : isEdit ? "" : "10:00"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    // A text field can hold a half-typed value, so completeness is checked
    // here rather than left to the browser. Both are zero-padded HH:MM by
    // this point, which compares correctly as plain strings.
    if (!isCompleteTime(startTime)) {
      setError("Enter a start time as HH:MM, between 00:00 and 23:59.");
      return;
    }
    if (endTime && !isCompleteTime(endTime)) {
      setError("Enter an end time as HH:MM, between 00:00 and 23:59.");
      return;
    }
    if (endTime && endTime < startTime) {
      setError("The end time is before the start time.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const payload = {
      title,
      location: location || null,
      notes: notes || null,
      starts_at: `${date}T${startTime}:00`,
      ends_at: endTime ? `${date}T${endTime}:00` : null,
    };

    try {
      const token = await getToken();
      if (isEdit) {
        await api.update(token, meeting.id, payload);
      } else {
        await api.create(token, payload);
      }
      onSaved();
      onClose();
    } catch {
      setError(isEdit ? "Failed to save changes." : "Failed to create meeting.");
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${meeting.title}"?`)) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      await api.remove(token, meeting.id);
      onSaved();
      onClose();
    } catch {
      setError("Failed to delete meeting.");
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="modal-header">
          <h2>{isEdit ? "Meeting" : "Set a Meeting"}</h2>
          {isEdit && !readOnly && (
            <button
              type="button"
              className="icon-btn modal-delete-btn"
              onClick={handleDelete}
              disabled={submitting}
              aria-label="Delete meeting"
              title="Delete meeting"
            >
              <TrashIcon />
            </button>
          )}
        </div>

        {readOnly && (
          <p className="modal-note">
            This meeting is synced from Outlook. Edit it there — changes made
            here would be overwritten on the next sync.
          </p>
        )}

        <form className="meeting-form" onSubmit={handleSubmit}>
          <label>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={readOnly}
              required
            />
          </label>
          <label>
            Date
            <input
              type="date"
              lang="en-GB"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={readOnly}
              required
            />
          </label>
          <div className="field-row">
            <label>
              From
              <input
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                maxLength={5}
                value={startTime}
                onChange={(e) => setStartTime(maskTime(e.target.value))}
                disabled={readOnly}
                required
              />
            </label>
            <label>
              To
              <input
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                maxLength={5}
                value={endTime}
                onChange={(e) => setEndTime(maskTime(e.target.value))}
                disabled={readOnly}
              />
            </label>
          </div>
          <label>
            Location
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={readOnly}
              placeholder="Office, Teams, phone…"
            />
          </label>
          <label>
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={readOnly}
            />
          </label>

          {error && <p className="error">{error}</p>}

          {!readOnly && (
            <button type="submit" className="btn" disabled={submitting}>
              {isEdit ? "Save changes" : "Create"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
