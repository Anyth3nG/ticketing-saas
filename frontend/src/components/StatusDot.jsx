export const STATUS_COLORS = {
  to_do: "#e5484d",
  personal_work: "#0091ff",
  working_on: "#8e4ec6",
  awaiting_approval: "#30a46c",
  done: "#8b8d98",
};

export const STATUS_LABELS = {
  to_do: "Managers work",
  personal_work: "Personal Work",
  working_on: "Working On",
  awaiting_approval: "Awaiting Approval",
  done: "Done",
};

export default function StatusDot({ status, color, title }) {
  return (
    <span
      className="status-dot"
      style={{ backgroundColor: color || STATUS_COLORS[status] || STATUS_COLORS.done }}
      title={title || STATUS_LABELS[status] || status}
    />
  );
}
