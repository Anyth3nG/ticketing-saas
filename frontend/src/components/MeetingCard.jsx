// "14:30". Built from the local getters rather than toLocaleTimeString so the
// 24h form doesn't depend on the viewer's system locale -- same reasoning as
// formatDateTime in utils/date.js.
function formatTime(isoDateTime) {
  if (!isoDateTime) return "";
  const d = new Date(isoDateTime);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function timeRange(meeting) {
  const start = formatTime(meeting.starts_at);
  return meeting.ends_at ? `${start}–${formatTime(meeting.ends_at)}` : start;
}

// `onClick` opens the meeting for editing. Omitted on the read-only admin
// mirror, where the card renders as a plain block instead of a button.
export default function MeetingCard({ meeting, onClick }) {
  const content = (
    <>
      {/* Time, title and place share one line. The column is narrow, so the
          title and place truncate rather than wrap -- the full text is on the
          title attribute, and the whole card opens for the rest. */}
      <div className="meeting-card-line">
        <span className="meeting-card-time">{timeRange(meeting)}</span>
        <span className="meeting-card-title" title={meeting.title}>
          {meeting.title}
        </span>
        {meeting.location && (
          <span className="meeting-card-location" title={meeting.location}>
            {meeting.location}
          </span>
        )}
        {meeting.source === "outlook" && (
          <span className="meeting-card-source" title="Synced from Outlook">
            Outlook
          </span>
        )}
      </div>
      {meeting.notes && <p className="meeting-card-notes">{meeting.notes}</p>}
    </>
  );

  if (!onClick) {
    return <div className="meeting-card">{content}</div>;
  }

  return (
    <button
      type="button"
      className="meeting-card meeting-card-clickable"
      onClick={() => onClick(meeting)}
    >
      {content}
    </button>
  );
}
