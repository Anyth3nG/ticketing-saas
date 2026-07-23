import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { getTickets } from "../api/tickets";
import { getCurrentUser, getUsers } from "../api/users";
import TicketDetailModal from "../components/TicketDetailModal";
import StatusDot, { STATUS_COLORS } from "../components/StatusDot";
import { formatDate, formatTimestampDate } from "../utils/date";

// Every archived ticket is "done", so its grey dot carries no information.
// Recolour it by type instead, so the circle itself says whether this was a
// worker's personal ticket or work a manager handed out. Colours reuse the
// board's language: personal blue, manager's-work red.
const TYPE_META = {
  personal: { label: "Personal", color: STATUS_COLORS.personal_work },
  assigned: { label: "Manager's work", color: STATUS_COLORS.to_do },
};

const SORT_OPTIONS = [
  { key: "recent", label: "Recently completed" },
  { key: "worker", label: "By worker", managerOnly: true },
  { key: "color", label: "By color" },
];

// Assigned tickets name their worker directly; personal ones only carry the
// creator's id, resolved through the users map.
function ticketWorkerId(t) {
  return t.assignees.length > 0 ? t.assignees[0].id : t.created_by;
}

export default function Archive() {
  const { getToken } = useAuth();
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState("loading");
  const [openTicketId, setOpenTicketId] = useState(null);
  const [sortBy, setSortBy] = useState("recent");
  const [selectedWorker, setSelectedWorker] = useState("all");
  const [selectedColor, setSelectedColor] = useState("all");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const token = await getToken();
      const currentUser = await getCurrentUser(token);
      // Personal tickets carry only created_by (an id), so resolving a worker
      // name for them needs the users list -- which is manager-only.
      const [ticketList, userList] = await Promise.all([
        getTickets(token, { includeArchived: true }),
        currentUser.role === "manager" ? getUsers(token) : Promise.resolve([]),
      ]);
      setUser(currentUser);
      setUsers(userList);
      setTickets(ticketList.filter((t) => t.status === "done"));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading") return <p className="state-message">Loading archive…</p>;
  if (status === "error") return <p className="state-message">Failed to load archive.</p>;

  const usersById = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const workers = users.filter((u) => u.role === "worker");
  const workerName = (t) =>
    t.assignees.length > 0
      ? t.assignees.map((a) => a.name).join(", ")
      : usersById[t.created_by] || "";

  const sortedTickets = [...tickets].sort((a, b) => {
    if (sortBy === "worker") {
      const cmp = workerName(a).localeCompare(workerName(b));
      if (cmp) return cmp;
    } else if (sortBy === "color") {
      const cmp = a.ticket_type.localeCompare(b.ticket_type);
      if (cmp) return cmp;
    }
    // Default order, and tiebreak for the others: most recently completed first.
    return b.updated_at.localeCompare(a.updated_at);
  });

  // Worker and color modes each narrow the list to a chosen value.
  let visibleTickets = sortedTickets;
  if (sortBy === "worker" && selectedWorker !== "all") {
    visibleTickets = sortedTickets.filter(
      (t) => ticketWorkerId(t) === Number(selectedWorker)
    );
  } else if (sortBy === "color" && selectedColor !== "all") {
    visibleTickets = sortedTickets.filter((t) => t.ticket_type === selectedColor);
  }

  const sortOptions = SORT_OPTIONS.filter(
    (o) => !o.managerOnly || user?.role === "manager"
  );

  return (
    <div>
      <h1>Archive</h1>
      {tickets.length === 0 && <p>No completed tickets yet.</p>}
      {tickets.length > 0 && (
        <div className="archive-toolbar">
          <span className="archive-sort-label">Sort</span>
          <div className="tab-bar archive-sort-tabs">
            {sortOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`tab${sortBy === option.key ? " tab-active" : ""}`}
                onClick={() => setSortBy(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {sortBy === "worker" && (
            <select
              className="archive-filter-select"
              value={selectedWorker}
              onChange={(e) => setSelectedWorker(e.target.value)}
            >
              <option value="all">All workers</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          {sortBy === "color" && (
            <select
              className="archive-filter-select"
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
            >
              <option value="all">All colors</option>
              {Object.entries(TYPE_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {tickets.length > 0 && visibleTickets.length === 0 && (
        <p>No completed tickets match this filter.</p>
      )}
      <ul className="archive-list">
        {visibleTickets.map((ticket) => (
          <li
            key={ticket.id}
            className="archive-row"
            onClick={() => setOpenTicketId(ticket.id)}
          >
            <StatusDot
              status="done"
              color={TYPE_META[ticket.ticket_type]?.color}
              title={TYPE_META[ticket.ticket_type]?.label}
            />
            <span className="archive-title">
              <span className="ticket-number">#{ticket.id}</span> {ticket.title}
            </span>
            {user?.role === "manager" && workerName(ticket) && (
              <span className="archive-assignee">{workerName(ticket)}</span>
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
