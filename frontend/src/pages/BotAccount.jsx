import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { getTickets } from "../api/tickets";
import { STATUS_LABELS } from "../components/StatusDot";
import { StatusBadge, UrgencyBadge } from "../components/TicketBadges";
import { formatDate } from "../utils/date";
import {
  KIND_LABELS,
  countByStatus,
  filterTickets,
  isOverdue,
  sortByDueDate,
  statusesPresent,
} from "../utils/botTickets";

// The page a bot account lands on: every ticket, read-only.
//
// Two kinds of reader use it. A person checking what the bot can see, and the
// Orion bot itself, which signs in and reads the screen like a person would. So
// it is built to be navigated, not just looked at:
//
//   - Every filter lives in the URL (?q=&status=&kind=&done=1), so a view can be
//     opened directly and the back button means what it says.
//   - Every ticket is a plain link to its own page (/bot/tickets/:id).
//   - Everything is written out as text. Colour is decoration only.
//   - Nothing here writes. The backend is what keeps a bot read-only
//     (auth.reject_bot_writes); this page just never offers a write.

export default function BotAccount() {
  const { getToken } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";
  const kind = searchParams.get("kind") ?? "";
  // Asking for the Done filter implies completed tickets, or it would be empty.
  const includeDone = searchParams.get("done") === "1" || status === "done";

  const [state, setState] = useState({ status: "loading", tickets: [] });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Keep what is already on screen while a refetch runs, so toggling
      // "completed" doesn't blank the page and drop focus from the search box.
      setState((previous) => ({ ...previous, status: "loading" }));
      try {
        const token = await getToken();
        const tickets = await getTickets(token, { includeArchived: includeDone });
        if (!cancelled) setState({ status: "ready", tickets });
      } catch {
        if (!cancelled) setState({ status: "error", tickets: [] });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [getToken, includeDone]);

  // Replace rather than push: typing in the search box shouldn't make a
  // history entry per keystroke.
  function setParam(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  const everything = state.tickets;
  const counts = countByStatus(everything);
  const overdueCount = everything.filter((ticket) => isOverdue(ticket)).length;
  const shown = sortByDueDate(filterTickets(everything, { query, status, kind }));
  const filtered = Boolean(query || status || kind);

  return (
    <div>
      <h1>All tickets</h1>
      <p className="bot-subtitle">
        A read-only view of every ticket and its comments. Nothing on this page
        changes anything.
      </p>

      <div className="stat-row">
        <div className="stat-tile">
          <span className="stat-label">Tickets</span>
          <span className="stat-value">{everything.length}</span>
        </div>
        <div className={`stat-tile${overdueCount > 0 ? " stat-tile-critical" : ""}`}>
          <span className="stat-label">Overdue</span>
          <span className="stat-value">{overdueCount}</span>
        </div>
        {["to_do", "working_on", "awaiting_approval"].map((key) => (
          <div className="stat-tile" key={key}>
            <span className="stat-label">{STATUS_LABELS[key]}</span>
            <span className="stat-value">{counts[key] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="bot-toolbar">
        <input
          type="search"
          className="bot-search"
          aria-label="Search tickets"
          placeholder="Search title, description, person, or #id"
          value={query}
          onChange={(event) => setParam("q", event.target.value)}
        />
        <select
          className="archive-filter-select"
          aria-label="Filter by kind"
          value={kind}
          onChange={(event) => setParam("kind", event.target.value)}
        >
          <option value="">All kinds</option>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeDone}
            disabled={status === "done"}
            onChange={(event) => setParam("done", event.target.checked ? "1" : "")}
          />
          Include completed
        </label>
      </div>

      <div className="bot-tabs" role="group" aria-label="Filter by status">
        <button
          type="button"
          className={`tab${status ? "" : " tab-active"}`}
          aria-pressed={!status}
          onClick={() => setParam("status", "")}
        >
          All ({everything.length})
        </button>
        {statusesPresent(everything).map((key) => (
          <button
            key={key}
            type="button"
            className={`tab${status === key ? " tab-active" : ""}`}
            aria-pressed={status === key}
            onClick={() => setParam("status", key)}
          >
            {STATUS_LABELS[key] ?? key} ({counts[key]})
          </button>
        ))}
      </div>

      {state.status === "loading" && everything.length === 0 && (
        <p className="state-message">Loading…</p>
      )}
      {state.status === "error" && (
        <p className="state-message error">Could not load tickets.</p>
      )}

      {state.status !== "error" && (state.status === "ready" || everything.length > 0) && (
        <>
          <p className="bot-count" aria-live="polite">
            Showing {shown.length} of {everything.length}{" "}
            {everything.length === 1 ? "ticket" : "tickets"}, soonest due first.
          </p>

          {shown.length === 0 ? (
            <p className="state-message">
              {filtered ? (
                <>
                  No tickets match these filters.{" "}
                  <button
                    type="button"
                    className="btn-soft"
                    onClick={() => setSearchParams({}, { replace: true })}
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                "No tickets."
              )}
            </p>
          ) : (
            <div className="bot-table-wrap">
              <table className="bot-table">
                <thead>
                  <tr>
                    <th scope="col">Ticket</th>
                    <th scope="col">Status</th>
                    <th scope="col">Urgency</th>
                    <th scope="col">Due</th>
                    <th scope="col">Assigned to</th>
                    <th scope="col">Created by</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((ticket) => (
                    <tr key={ticket.id}>
                      <td>
                        <Link
                          className="bot-ticket-link"
                          to={`/bot/tickets/${ticket.id}`}
                          state={{ from: location.search }}
                        >
                          <span className="ticket-number">#{ticket.id}</span>{" "}
                          {ticket.title}
                        </Link>
                        {ticket.description && (
                          <div className="bot-description">{ticket.description}</div>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={ticket.status} />
                      </td>
                      <td>
                        <UrgencyBadge urgency={ticket.urgency} />
                      </td>
                      <td>
                        {formatDate(ticket.due_date)}
                        {isOverdue(ticket) && (
                          <span className="bot-overdue"> Overdue</span>
                        )}
                      </td>
                      <td>{ticket.assignee?.name ?? "—"}</td>
                      <td>{ticket.creator?.name ?? "—"}</td>
                      <td>{KIND_LABELS[ticket.ticket_type] ?? ticket.ticket_type}</td>
                      <td>{ticket.comment_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
