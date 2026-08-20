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


/* ------------------------------------------------------------------------
   Helpers for the date-driven work board (ManagerWorkDashboard /
   AdminYuliaWork). Shared so the manager's board and the read-only mirror of
   it can't drift apart.
   --------------------------------------------------------------------- */

// How many days the header dropdown offers, counting today as the first.
export const WEEK_LENGTH = 7;

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function todayLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Local-calendar "YYYY-MM-DD". Built from the local getters rather than
// toISOString(), which converts to UTC first and lands on the wrong day for
// anyone east of Greenwich for part of the day.
export function toISODate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// The dates offered by the header dropdown: today plus the following six
// days, so "the upcoming week" always starts from wherever the user is now
// rather than from an arbitrary Monday.
export function upcomingWeek() {
  const start = todayLocal();
  return Array.from({ length: WEEK_LENGTH }, (_, offset) => {
    const d = new Date(start);
    d.setDate(start.getDate() + offset);
    return d;
  });
}

// "19/08" -- day-first numeric, same order as formatDate() above.
export function formatDayMonth(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

// "19/08, Wednesday" -- the headline form.
export function formatHeadingDate(date) {
  return `${formatDayMonth(date)}, ${WEEKDAY_NAMES[date.getDay()]}`;
}

// Whether a ticket belongs to the selected day. Due dates arrive as plain
// "YYYY-MM-DD" strings, and that format sorts lexicographically in date
// order, so these compare as strings -- no Date parsing, and none of the
// timezone drift that comes with it.
//
// Today is the exception: it also absorbs anything overdue, so work that
// slipped past its due date stays in front of you instead of disappearing
// off the back of the board. Any other day matches exactly.
export function isDueOn(ticket, selectedISO, isToday) {
  const due = ticket.due_date?.slice(0, 10);
  if (!due) return false;
  return isToday ? due <= selectedISO : due === selectedISO;
}
