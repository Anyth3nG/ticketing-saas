import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { getTickets } from "../api/tickets";
import { getCurrentUser } from "../api/users";
import TicketDetailModal from "../components/TicketDetailModal";
import StatusDot from "../components/StatusDot";
import { formatDate, formatTimestampDate } from "../utils/date";

export default function Archive() {
  const { getToken } = useAuth();
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [status, setStatus] = useState("loading");
  const [openTicketId, setOpenTicketId] = useState(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const token = await getToken();
      const [currentUser, ticketList] = await Promise.all([
        getCurrentUser(token),
        getTickets(token, { includeArchived: true }),
      ]);
      setUser(currentUser);
      setTickets(ticketList.filter((t) => t.status === "done"));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading") return <p>Loading archive...</p>;
  if (status === "error") return <p>Failed to load archive.</p>;

  return (
    <div>
      <h1>Archive</h1>
      {tickets.length === 0 && <p>No completed tickets yet.</p>}
      <ul className="archive-list">
        {tickets.map((ticket) => (
          <li
            key={ticket.id}
            className="archive-row"
            onClick={() => setOpenTicketId(ticket.id)}
          >
            <StatusDot status={ticket.status} />
            <span className="archive-title">
              <span className="ticket-number">#{ticket.id}</span> {ticket.title}
            </span>
            {user?.role === "manager" && ticket.assignees.length > 0 && (
              <span className="archive-assignee">
                {ticket.assignees.map((a) => a.name).join(", ")}
              </span>
            )}
            <span className="archive-meta">
              Due {formatDate(ticket.due_date)} · completed{" "}
              {formatTimestampDate(ticket.updated_at)}
            </span>
          </li>
        ))}
      </ul>

      {openTicketId && (
        <TicketDetailModal
          ticketId={openTicketId}
          currentUser={user}
          onClose={() => setOpenTicketId(null)}
          onChanged={load}
          readOnly
        />
      )}
    </div>
  );
}
