import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Link, useNavigate } from "react-router-dom";
import { getTickets } from "../api/tickets";
import { getCurrentUser, getUsers } from "../api/users";
import TicketDetailModal from "../components/TicketDetailModal";
import StatusDot, { STATUS_COLORS, STATUS_LABELS } from "../components/StatusDot";

const LEGEND_STATUSES = ["to_do", "personal_work", "working_on", "awaiting_approval"];

const ALL_STATUSES_VISIBLE = LEGEND_STATUSES.reduce(
  (acc, s) => ({ ...acc, [s]: true }),
  {}
);

export default function ManagerDashboard() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [status, setStatus] = useState("loading");
  const [openTicketId, setOpenTicketId] = useState(null);
  const [statusFilters, setStatusFilters] = useState({});

  const toggleStatusFilter = (workerId, statusToToggle) => {
    setStatusFilters((prev) => {
      const current = prev[workerId] || ALL_STATUSES_VISIBLE;
      return {
        ...prev,
        [workerId]: { ...current, [statusToToggle]: !current[statusToToggle] },
      };
    });
  };

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const token = await getToken();
      const [currentUser, ticketList, userList] = await Promise.all([
        getCurrentUser(token),
        getTickets(token),
        getUsers(token),
      ]);
      if (currentUser.role !== "manager") {
        navigate("/worker", { replace: true });
        return;
      }
      setUser(currentUser);
      setTickets(ticketList);
      setWorkers(userList.filter((u) => u.role === "worker"));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [getToken, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading" || !user) return <p>Loading dashboard...</p>;
  if (status === "error") return <p>Failed to load dashboard.</p>;

  return (
    <div>
      <div className="page-header">
        <h1>Team Board</h1>
        <div className="page-header-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={load}
            aria-label="Refresh"
            title="Refresh"
          >
            🔄
          </button>
          <Link className="btn" to="/tickets/new">
            Create Ticket
          </Link>
        </div>
      </div>

      <div className="status-legend">
        {LEGEND_STATUSES.map((s) => (
          <span key={s} className="status-legend-item">
            <StatusDot status={s} />
            {STATUS_LABELS[s]}
          </span>
        ))}
      </div>

      <div className="manager-grid">
        {workers.map((worker) => {
          const workerTickets = tickets.filter(
            (t) =>
              t.assignees.some((a) => a.id === worker.id) ||
              (t.ticket_type === "personal" && t.created_by === worker.id)
          );
          const activeFilter = statusFilters[worker.id] || ALL_STATUSES_VISIBLE;
          const displayedTickets = workerTickets.filter((t) => activeFilter[t.status]);

          return (
            <div key={worker.id} className="worker-box">
              <div className="worker-box-header">
                <h2>{worker.name}</h2>
                <div className="worker-status-filter">
                  {LEGEND_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="status-filter-dot"
                      style={{
                        backgroundColor: activeFilter[s] ? STATUS_COLORS[s] : "transparent",
                        borderColor: STATUS_COLORS[s],
                      }}
                      onClick={() => toggleStatusFilter(worker.id, s)}
                      aria-pressed={activeFilter[s]}
                      aria-label={`${STATUS_LABELS[s]} (${activeFilter[s] ? "shown" : "hidden"})`}
                      title={`${activeFilter[s] ? "Hide" : "Show"} ${STATUS_LABELS[s]}`}
                    />
                  ))}
                </div>
              </div>
              {workerTickets.length === 0 && <p>No active tickets.</p>}
              {workerTickets.length > 0 && displayedTickets.length === 0 && (
                <p>No tickets match the selected statuses.</p>
              )}
              <ul className="worker-ticket-list">
                {displayedTickets.map((ticket) => (
                  <li key={ticket.id} className="worker-ticket-row">
                    <button
                      type="button"
                      className="worker-ticket-title"
                      onClick={() => setOpenTicketId(ticket.id)}
                    >
                      <StatusDot status={ticket.status} />
                      <span className="ticket-number">#{ticket.id}</span> {ticket.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {openTicketId && (
        <TicketDetailModal
          ticketId={openTicketId}
          currentUser={user}
          workers={workers}
          onClose={() => setOpenTicketId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
