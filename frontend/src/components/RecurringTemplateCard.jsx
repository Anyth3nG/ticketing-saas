import { RepeatIcon } from "./icons";

const URGENCY_COLORS = {
  low: "#30a46c",
  medium: "#f5a623",
  high: "#e5484d",
};

// The "All" tab's standing representation of a recurring series -- reuses
// TicketCard's classes for visual consistency, but shows the schedule
// (repeats monthly on day N) instead of a due date/comment count, since a
// template has neither: it's never "due" and can't be commented on itself.
export default function RecurringTemplateCard({ template, onClick }) {
  return (
    <div className="ticket-card" onClick={onClick}>
      <div className="ticket-card-header">
        <h3>{template.title}</h3>
      </div>
      <div className="ticket-card-meta">
        <span
          className="urgency-badge"
          style={{ color: URGENCY_COLORS[template.urgency] }}
        >
          {template.urgency}
        </span>
        <span className="recurring-badge" title="Recurring ticket">
          <RepeatIcon /> Repeats monthly on day {template.recurrence_day}
        </span>
      </div>
    </div>
  );
}
