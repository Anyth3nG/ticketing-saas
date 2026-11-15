import StatusDot, { STATUS_LABELS } from "./StatusDot";

const URGENCY_COLORS = {
  low: "#30a46c",
  medium: "#f5a623",
  high: "#e5484d",
};

// Colour is decoration here: the label is always written out, so nothing
// depends on telling the dots apart.
export function StatusBadge({ status }) {
  return (
    <span className="status-badge">
      <StatusDot status={status} /> {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function UrgencyBadge({ urgency }) {
  return (
    <span className="urgency-badge" style={{ color: URGENCY_COLORS[urgency] }}>
      {urgency}
    </span>
  );
}
