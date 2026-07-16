import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createTicket, getTickets } from "../api/tickets";
import { getCurrentUser, getUsers } from "../api/users";
import TicketDetailModal from "../components/TicketDetailModal";
import StatusDot, { STATUS_COLORS, STATUS_LABELS } from "../components/StatusDot";
import { AlertIcon, RefreshIcon } from "../components/icons";
import { formatDate, todayISO } from "../utils/date";

const LEGEND_STATUSES = ["to_do", "personal_work", "working_on", "awaiting_approval"];
const URGENCY_OPTIONS = ["low", "medium", "high"];

const ALL_STATUSES_VISIBLE = LEGEND_STATUSES.reduce(
  (acc, s) => ({ ...acc, [s]: true }),
  {}
);

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function CreateTicketForm({ workers, onClose, onCreated }) {
  const { getToken } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState("low");
  const [dueDate, setDueDate] = useState(todayISO());
  const [assignedTo, setAssignedTo] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      await createTicket(token, {
        title,
        description: description || null,
        urgency,
        due_date: dueDate,
        assigned_to: Number(assignedTo),
      });
      onCreated();
      onClose();
    } catch {
      setError("Failed to create ticket.");
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>Create Ticket</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Urgency
            <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
              {URGENCY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Due date
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </label>
          <label>
            Assign to
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              required
            >
              <option value="" disabled>
                Select a user
              </option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn" disabled={submitting}>
            Create Ticket
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ManagerDashboard() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [status, setStatus] = useState("loading");
  const [openTicketId, setOpenTicketId] = useState(null);
  const [statusFilters, setStatusFilters] = useState({});
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    const ticketParam = searchParams.get("ticket");
    if (!ticketParam) return;
    setOpenTicketId(Number(ticketParam));
    searchParams.delete("ticket");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

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
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  if (!user && status === "loading") return <p className="state-message">Loading dashboard…</p>;
  if (!user && status === "error") return <p className="state-message">Failed to load dashboard.</p>;

  const today = todayISO();
  const awaitingApprovalCount = tickets.filter((t) => t.status === "awaiting_approval").length;
  const overdueCount = tickets.filter((t) => t.due_date < today).length;

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
            <RefreshIcon />
          </button>
          <button type="button" className="btn" onClick={() => setShowCreateForm(true)}>
            Create Ticket
          </button>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <span className="stat-label">Open tickets</span>
          <span className="stat-value">{tickets.length}</span>
        </div>
        <div className="stat-tile stat-tile-success">
          <span className="stat-label">Awaiting approval</span>
          <span className="stat-value">{awaitingApprovalCount}</span>
        </div>
        <div className="stat-tile stat-tile-critical">
          <span className="stat-label">Overdue</span>
          <span className="stat-value">
            {overdueCount > 0 && <AlertIcon />}
            {overdueCount}
          </span>
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
                <div className="worker-identity">
                  {worker.avatar_url ? (
                    <img
                      className="worker-avatar"
                      src={worker.avatar_url}
                      alt=""
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="worker-avatar" aria-hidden="true">
                      {initials(worker.name)}
                    </span>
                  )}
                  <h2>{worker.name}</h2>
                </div>
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
                {displayedTickets.map((ticket) => {
                  const isOverdue = ticket.due_date < today;
                  return (
                    <li key={ticket.id} className="worker-ticket-row">
                      <button
                        type="button"
                        className="worker-ticket-title"
                        onClick={() => setOpenTicketId(ticket.id)}
                      >
                        <StatusDot status={ticket.status} />
                        <span className="ticket-number">#{ticket.id}</span>
                        <span className="worker-ticket-title-text">{ticket.title}</span>
                      </button>
                      <span
                        className={`worker-ticket-due${isOverdue ? " worker-ticket-due-overdue" : ""}`}
                      >
                        {formatDate(ticket.due_date)}
                      </span>
                    </li>
                  );
                })}
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

      {showCreateForm && (
        <CreateTicketForm
          workers={workers}
          onClose={() => setShowCreateForm(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
