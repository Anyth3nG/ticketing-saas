import { useNavigate } from "react-router-dom";

export default function TicketCard({ ticket }) {
  const navigate = useNavigate();
  const assignedNames = ticket.assignees.map((a) => a.name).join(", ") || "Unassigned";

  return (
    <div className="ticket-card" onClick={() => navigate(`/tickets/${ticket.id}`)}>
      <h3>{ticket.title}</h3>
      <p>Status: {ticket.status}</p>
      <p>Urgency: {ticket.urgency}</p>
      <p>Due: {ticket.due_date}</p>
      <p>Assigned to: {assignedNames}</p>
    </div>
  );
}
