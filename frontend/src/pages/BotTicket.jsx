import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { getComments, getTicket } from "../api/tickets";
import { StatusBadge, UrgencyBadge } from "../components/TicketBadges";
import { formatDate, formatDateTime } from "../utils/date";
import { KIND_LABELS, isOverdue } from "../utils/botTickets";

// One ticket, in full, for a bot account: its details, description and whole
// comment thread. Read-only, like the list it is reached from. The back link
// returns to that list with its filters intact (they travel in the link's
// state), so working through a filtered list ticket by ticket doesn't lose
// your place.

function Fact({ label, children }) {
  return (
    <div className="bot-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function BotTicket() {
  const { id } = useParams();
  const { getToken } = useAuth();
  const location = useLocation();
  const [state, setState] = useState({ status: "loading", ticket: null, comments: [] });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: "loading", ticket: null, comments: [] });
      try {
        const token = await getToken();
        const [ticket, comments] = await Promise.all([
          getTicket(token, id),
          getComments(token, id),
        ]);
        if (!cancelled) setState({ status: "ready", ticket, comments });
      } catch {
        if (!cancelled) setState({ status: "error", ticket: null, comments: [] });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [getToken, id]);

  const { ticket, comments } = state;
  const back = (
    <Link className="bot-back" to={{ pathname: "/bot", search: location.state?.from ?? "" }}>
      ← All tickets
    </Link>
  );

  if (state.status === "loading") return <p className="state-message">Loading…</p>;
  if (state.status === "error")
    return (
      <div>
        {back}
        <p className="state-message error">Could not load this ticket.</p>
      </div>
    );

  return (
    <div className="bot-detail">
      {back}
      <h1>
        <span className="ticket-number">#{ticket.id}</span> {ticket.title}
      </h1>

      <div className="bot-badges">
        <StatusBadge status={ticket.status} />
        <UrgencyBadge urgency={ticket.urgency} />
        {ticket.is_recurring && <span className="recurring-badge">Recurring</span>}
        {isOverdue(ticket) && <span className="bot-overdue">Overdue</span>}
      </div>

      <dl className="bot-facts">
        <Fact label="Kind">{KIND_LABELS[ticket.ticket_type] ?? ticket.ticket_type}</Fact>
        <Fact label="Due">{formatDate(ticket.due_date)}</Fact>
        <Fact label="Assigned to">{ticket.assignee?.name ?? "—"}</Fact>
        <Fact label="Created by">{ticket.creator?.name ?? "—"}</Fact>
        <Fact label="Created">{formatDateTime(ticket.created_at)}</Fact>
        <Fact label="Last updated">{formatDateTime(ticket.updated_at)}</Fact>
        {ticket.completed_at && (
          <Fact label="Completed">{formatDateTime(ticket.completed_at)}</Fact>
        )}
      </dl>

      <section>
        <h2>Description</h2>
        <p className="bot-prose">{ticket.description || "No description."}</p>
      </section>

      <section className="comment-thread">
        <h2>Comments ({comments.length})</h2>
        {comments.length === 0 && <p>No comments.</p>}
        {comments.map((comment) => (
          <div key={comment.id} className="comment">
            <div className="comment-meta">
              <strong>{comment.user.name}</strong>
              <span className="comment-time">{formatDateTime(comment.created_at)}</span>
            </div>
            <p className="bot-prose">{comment.content}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
