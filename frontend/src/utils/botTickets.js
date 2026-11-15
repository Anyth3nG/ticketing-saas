// Pure helpers behind the bot account's ticket pages (pages/BotAccount.jsx and
// pages/BotTicket.jsx): filtering, ordering and counting. No React, no fetching,
// so they can be checked on their own.
import { todayISO } from "./date.js";

export const KIND_LABELS = { assigned: "Assigned", personal: "Personal" };

// The order status filters are listed in: the manager's flow first, then
// personal work, then the custom board's own columns. Anything not named here
// still appears, after these, so a new status never silently disappears.
const STATUS_ORDER = [
  "to_do",
  "working_on",
  "awaiting_approval",
  "personal_work",
  "priority",
  "project_work",
  "contact",
  "send",
  "done",
];

// Same rule as the rest of the app (due before today), except a finished ticket
// is never overdue.
export function isOverdue(ticket, today = todayISO()) {
  return ticket.status !== "done" && ticket.due_date < today;
}

export function sortByDueDate(tickets) {
  return [...tickets].sort(
    (a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id
  );
}

function matchesQuery(ticket, query) {
  // "#12" finds ticket 12, the way it is written everywhere in the app.
  const needle = query.trim().replace(/^#/, "").toLowerCase();
  if (!needle) return true;
  return [
    ticket.id,
    ticket.title,
    ticket.description,
    ticket.assignee?.name,
    ticket.creator?.name,
  ]
    .filter((part) => part !== null && part !== undefined)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

// An empty status or kind means "any".
export function filterTickets(tickets, { query = "", status = "", kind = "" }) {
  return tickets.filter(
    (ticket) =>
      (!status || ticket.status === status) &&
      (!kind || ticket.ticket_type === kind) &&
      matchesQuery(ticket, query)
  );
}

export function countByStatus(tickets) {
  return tickets.reduce(
    (counts, ticket) => ({
      ...counts,
      [ticket.status]: (counts[ticket.status] ?? 0) + 1,
    }),
    {}
  );
}

// The statuses present in these tickets, in display order.
export function statusesPresent(tickets) {
  const rank = (status) => {
    const index = STATUS_ORDER.indexOf(status);
    return index === -1 ? STATUS_ORDER.length : index;
  };
  return Object.keys(countByStatus(tickets)).sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b)
  );
}
