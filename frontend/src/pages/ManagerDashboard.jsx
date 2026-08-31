import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createTicket, getTickets, updateTicketStatus } from "../api/tickets";
import { getCurrentUser, getUsers } from "../api/users";
import TicketDetailModal from "../components/TicketDetailModal";
import StatusDot, { STATUS_COLORS, STATUS_LABELS } from "../components/StatusDot";
import { AlertIcon, CheckIcon } from "../components/icons";
import { formatDate, todayISO } from "../utils/date";
import { applyDashboardOrder, initials } from "../utils/format";

const LEGEND_STATUSES = ["to_do", "personal_work", "working_on", "awaiting_approval"];

// Personal work sits apart, at the right-hand edge of the legend: it is the one
// entry that isn't work the manager handed out. Derived from LEGEND_STATUSES
// rather than listed again -- that stays the canonical list, read by the filter
// state and the per-worker dots, so this changes presentation only.
const TRAILING_LEGEND_STATUS = "personal_work";
const LEGEND_ORDER = [
  ...LEGEND_STATUSES.filter((s) => s !== TRAILING_LEGEND_STATUS),
  TRAILING_LEGEND_STATUS,
];
const URGENCY_OPTIONS = ["low", "medium", "high"];

const ALL_STATUSES_VISIBLE = LEGEND_STATUSES.reduce(
  (acc, s) => ({ ...acc, [s]: true }),
  {}
);

// Personal work is a kind of ticket, not a stage of one. A worker may move
// their own personal ticket into working_on, but this board is about the work
// the manager handed out: personal tickets stay under Personal Work whatever
// status they carry, so Working On only ever shows the manager's own work.
const isManagerWork = (ticket) => ticket.ticket_type !== "personal";

const boardStatus = (ticket) =>
  isManagerWork(ticket) ? ticket.status : "personal_work";

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
              lang="en-GB"
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

  const toggleStatusFilterForAll = (statusToToggle) => {
    const isActiveForAll = workers.every(
      (w) => (statusFilters[w.id] || ALL_STATUSES_VISIBLE)[statusToToggle]
    );
    const next = !isActiveForAll;
    setStatusFilters((prev) => {
      const updated = { ...prev };
      workers.forEach((w) => {
        const current = prev[w.id] || ALL_STATUSES_VISIBLE;
        updated[w.id] = { ...current, [statusToToggle]: next };
      });
      return updated;
    });
  };

  const isolateStatusFilterForAll = (targetStatus) => {
    const isIsolated = workers.every((w) => {
      const current = statusFilters[w.id] || ALL_STATUSES_VISIBLE;
      return LEGEND_STATUSES.every((s) => current[s] === (s === targetStatus));
    });
    const nextFilter = isIsolated
      ? ALL_STATUSES_VISIBLE
      : LEGEND_STATUSES.reduce((acc, s) => ({ ...acc, [s]: s === targetStatus }), {});
    setStatusFilters((prev) => {
      const updated = { ...prev };
      workers.forEach((w) => {
        updated[w.id] = { ...nextFilter };
      });
      return updated;
    });
  };

  const load = useCallback(
    async (isCancelled = () => false) => {
      setStatus("loading");
      try {
        const token = await getToken();
        const [currentUser, ticketList, userList] = await Promise.all([
          getCurrentUser(token),
          getTickets(token),
          getUsers(token),
        ]);
        if (isCancelled()) return;
        if (currentUser.role !== "manager") {
          navigate("/worker", { replace: true });
          return;
        }
        setUser(currentUser);
        // GET /tickets/ returns everything to a manager, including every
        // manager's own personal work (the "My Work" page) -- exclude all of
        // it here, not just the viewer's own, so it never inflates the
        // oversight stat tiles for other managers. It can never render in a
        // worker box either way (worker boxes only match a worker.id), so
        // without this a manager's personal backlog was counted for everyone
        // but visible to no one.
        const managerIds = new Set(
          userList.filter((u) => u.role === "manager").map((u) => u.id)
        );
        setTickets(
          ticketList.filter(
            (t) => !(t.ticket_type === "personal" && managerIds.has(t.created_by))
          )
        );
        setWorkers(
          applyDashboardOrder(
            userList.filter((u) => u.role === "worker"),
            currentUser.dashboard_layout
          )
        );
        setStatus("ready");
      } catch {
        if (!isCancelled()) setStatus("error");
      }
    },
    [getToken, navigate]
  );

  useEffect(() => {
    // A stale poll response (this effect instance's cleanup already ran, or a
    // later poll already landed) must not overwrite newer state -- isCancelled
    // is checked after the async fetch resolves, same pattern as RoleRedirect
    // in main.jsx.
    let cancelled = false;
    const isCancelled = () => cancelled;
    load(isCancelled);
    const interval = setInterval(() => load(isCancelled), 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [load]);

  const handleQuickApprove = async (ticketId) => {
    try {
      const token = await getToken();
      await updateTicketStatus(token, ticketId, "done");
      load();
    } catch {
      setStatus("error");
    }
  };

  if (!user && status === "loading") return <p className="state-message">Loading dashboard…</p>;
  if (!user && status === "error") return <p className="state-message">Failed to load dashboard.</p>;

  const today = todayISO();
  const managerWorkCount = tickets.filter(isManagerWork).length;
  const awaitingApprovalCount = tickets.filter((t) => t.status === "awaiting_approval").length;
  const overdueCount = tickets.filter((t) => t.due_date < today).length;

  return (
    <div>
      <div className="page-header">
        <h1>Team Board</h1>
        <div className="page-header-actions">
          <button type="button" className="btn" onClick={() => setShowCreateForm(true)}>
            Create Ticket
          </button>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <span className="stat-label">Open tickets</span>
          <span className="stat-value">{managerWorkCount}</span>
        </div>
        <div className="stat-tile stat-tile-success stat-tile-with-action">
          <div className="stat-tile-main">
            <span className="stat-label">Awaiting approval</span>
            <span className="stat-value">{awaitingApprovalCount}</span>
          </div>
          <button
            type="button"
            className="stat-tile-filter-btn"
            onClick={() => isolateStatusFilterForAll("awaiting_approval")}
          >
            Filter board
          </button>
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
        {LEGEND_ORDER.map((s) => {
          const isActiveForAll =
            workers.length > 0 &&
            workers.every((w) => (statusFilters[w.id] || ALL_STATUSES_VISIBLE)[s]);
          const trailing = s === TRAILING_LEGEND_STATUS ? " status-legend-item-trailing" : "";
          return (
            <button
              key={s}
              type="button"
              className={`status-legend-item${isActiveForAll ? "" : " status-legend-item-inactive"}${trailing}`}
              onClick={() => toggleStatusFilterForAll(s)}
              aria-pressed={isActiveForAll}
              title={`${isActiveForAll ? "Hide" : "Show"} ${STATUS_LABELS[s]} for all workers`}
            >
              <StatusDot status={s} />
              {STATUS_LABELS[s]}
            </button>
          );
        })}
      </div>

      <div className="manager-grid">
        {workers.map((worker) => {
          const workerTickets = tickets.filter(
            (t) =>
              t.assignee?.id === worker.id ||
              (t.ticket_type === "personal" && t.created_by === worker.id)
          );
          const managerWorkCountForWorker = workerTickets.filter(isManagerWork).length;
          const activeFilter = statusFilters[worker.id] || ALL_STATUSES_VISIBLE;
          const displayedTickets = workerTickets.filter((t) => activeFilter[boardStatus(t)]);

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
                  <span className="worker-ticket-count">{managerWorkCountForWorker}</span>
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
                  const rowStatus = boardStatus(ticket);
                  return (
                    <li key={ticket.id} className="worker-ticket-row">
                      {rowStatus === "awaiting_approval" ? (
                        <button
                          type="button"
                          className="worker-ticket-approve"
                          onClick={() => handleQuickApprove(ticket.id)}
                          aria-label="Approve and mark done"
                          title="Approve and mark done"
                        >
                          <CheckIcon />
                        </button>
                      ) : (
                        <StatusDot status={rowStatus} />
                      )}
                      <button
                        type="button"
                        className="worker-ticket-title"
                        onClick={() => setOpenTicketId(ticket.id)}
                      >
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
