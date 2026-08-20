// Mirrors backend/custom_board.py. One account's personal board runs on its
// own statuses -- organised by kind of work rather than by stage of approval --
// instead of the shared worker ones. Everyone else is untouched.
//
// The backend is what actually enforces this (see _can_update_status in
// routes/tickets.py); the copy here only decides which columns to draw, so the
// two lists have to be kept in step by hand.

// No account list here on purpose. Who gets this board is decided once, on the
// server (backend/custom_board.py), and arrives on the user object as
// `uses_custom_layout`. A copy in the frontend would be baked in at build time
// with nothing keeping it in step with the backend's answer -- and the two
// disagreeing means columns drawn that the API refuses to write to.

// Where new personal tickets land before being sorted into a kind.
export const LANDING_STATUS = "priority";

// Render order, which is also the visual layout order -- see
// CUSTOM_COLUMN_SPANS below and .kanban-board-custom in index.css.
export const CUSTOM_COLUMNS = [
  "priority",
  "meetings",
  "project_work",
  "contact",
  "send",
];

// The one column that isn't ticket-backed: it holds Meeting objects (see
// backend/models/meeting.py), which have a start and an end rather than a
// status, so nothing can be dragged into or out of it.
export const MEETINGS_COLUMN = "meetings";

// The columns a ticket can actually occupy -- every column except Meetings.
// Mirrors CUSTOM_STATUSES in backend/custom_board.py.
export const CUSTOM_TICKET_STATUSES = CUSTOM_COLUMNS.filter(
  (status) => status !== MEETINGS_COLUMN
);

// One ticket card is this many grid tracks wide. Every column span is a
// multiple of it, so a column's width says exactly how many cards sit side by
// side inside it.
export const TICKET_SPAN = 3;

// Widths on a 12-column grid. Priority is where everything lands and needs the
// most room, so it takes three quarters of the top row with Meetings beside
// it. Underneath, Project-Work gets double the width of Contact and Send.
//
//   +---------------------------------------+-------------+
//   |              PRIORITY (9)             | MEETINGS (3)|
//   |          3 cards across               |  1 across   |
//   +---------------------------+-----------+-------------+
//   |     PROJECT-WORK (6)      | CONTACT(3)|   SEND (3)  |
//   |       2 cards across      |  1 across |  1 across   |
//   +---------------------------+-----------+-------------+
export const CUSTOM_COLUMN_SPANS = {
  priority: 9,
  meetings: 3,
  project_work: 6,
  contact: 3,
  send: 3,
};

// How many ticket cards fit side by side in a column, derived from its width
// rather than listed separately so the two can't fall out of step.
export function cardsAcross(status) {
  return (CUSTOM_COLUMN_SPANS[status] ?? TICKET_SPAN) / TICKET_SPAN;
}

export const SHARED_COLUMNS = [
  "to_do",
  "personal_work",
  "working_on",
  "awaiting_approval",
];

export function usesCustomBoard(user) {
  return Boolean(user?.uses_custom_layout);
}

export function columnsFor(user) {
  return usesCustomBoard(user) ? CUSTOM_COLUMNS : SHARED_COLUMNS;
}
