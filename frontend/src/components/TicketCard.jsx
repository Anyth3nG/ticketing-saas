import { CommentIcon, RepeatIcon } from "./icons";
import { formatDate, todayISO } from "../utils/date";

const URGENCY_COLORS = {
  low: "#30a46c",
  medium: "#f5a623",
  high: "#e5484d",
};

export default function TicketCard({ ticket, onClick }) {
  // Recurring tickets have no due_date; only flag a real, past date.
  const isOverdue = ticket.due_date && ticket.due_date < todayISO();
  return (
    <div className="ticket-card" onClick={onClick}>
      <div className="ticket-card-header">
        <h3>
          <span className="ticket-number">#{ticket.id}</span> {ticket.title}
        </h3>
      </div>
      <div className="ticket-card-meta">
        <span
          className="urgency-badge"
          style={{ color: URGENCY_COLORS[ticket.urgency] }}
        >
          {ticket.urgency}
        </span>
        {ticket.is_recurring && (
          <span className="recurring-badge" title="Recurring ticket">
            <RepeatIcon /> Recurring
          </span>
        )}
        <span className={isOverdue ? "ticket-card-due-overdue" : undefined}>
          Due {formatDate(ticket.due_date)}
        </span>
        <span className="comment-count" title="Comments">
          <CommentIcon /> {ticket.comment_count}
        </span>
      </div>
    </div>
  );
}
