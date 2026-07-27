// Native <input type="date"> requires YYYY-MM-DD, so form values stay ISO --
// these are only for display text.

function toDdMmYyyy(d) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

// For plain "YYYY-MM-DD" fields (e.g. due_date). Sliced directly rather than
// parsed via `new Date()`, which would interpret it as UTC midnight and can
// shift the displayed day backward in negative-UTC-offset timezones.
export function formatDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return `${day}-${month}-${year}`;
}

// For full ISO datetimes (e.g. comment created_at) -- converts to the
// browser's local time zone, same as the toLocaleString() it replaces.
// hour12 is forced off rather than left to the browser's locale default, so
// the displayed time is always hh:mm (24h) regardless of the viewer's system
// locale.
export function formatDateTime(isoDateTime) {
  if (!isoDateTime) return "";
  const d = new Date(isoDateTime);
  const time = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${toDdMmYyyy(d)}, ${time}`;
}

// Today as "YYYY-MM-DD", for pre-filling <input type="date"> defaults.
export function todayISO() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
