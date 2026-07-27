import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { getYuliaTicketComments, getYuliaWork } from "../api/admin";
import TicketCard from "../components/TicketCard";
import RecurringTemplateCard from "../components/RecurringTemplateCard";
import StatusDot, { STATUS_COLORS, STATUS_LABELS } from "../components/StatusDot";
import { formatDate, formatDateTime } from "../utils/date";

// Read-only mirror of ManagerWorkDashboard.jsx ("My Work"), scoped server-side
// to one specific report (see backend/routes/admin.py) and gated to one
// specific viewer. No drag-and-drop, editing, or comment posting -- the
// underlying ticket permission checks are ownership-based and wouldn't allow
// most of those actions from here anyway, and the point of this page is only
// to look, not to act on someone else's board.

const COLUMNS = ["to_do", "personal_work", "working_on", "awaiting_approval"];
const PERSONAL_TABS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All" },
];

function parseISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todayLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Overdue tickets stay under "Today" rather than falling off the board once
// their due date passes -- they're still due, just later than planned.
function isToday(dateStr) {
  return parseISODate(dateStr).getTime() <= todayLocal().getTime();
}

function startOfWeek(date) {
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diff);
  return start;
}

function isThisWeek(dateStr) {
  const d = parseISODate(dateStr);
  const start = startOfWeek(todayLocal());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return d >= start && d <= end;
}

function isThisMonth(dateStr) {
  const d = parseISODate(dateStr);
  const today = todayLocal();
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
}

function ReadOnlyTicketModal({ ticket, onClose }) {
  const { getToken } = useAuth();
  const [comments, setComments] = useState([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus("loading");
      try {
        const token = await getToken();
        const data = await getYuliaTicketComments(token, ticket.id);
        if (!cancelled) {
          setComments(data);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken, ticket.id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="modal-header">
          <StatusDot status={ticket.status} />
          <h2>
            <span className="ticket-number">#{ticket.id}</span> {ticket.title}
          </h2>
        </div>

        <div className="modal-details">
          <p>{ticket.description || "No description."}</p>
          <p>Urgency: {ticket.urgency}</p>
          <p>Due: {formatDate(ticket.due_date)}</p>
          <p>Created: {formatDateTime(ticket.created_at)}</p>
        </div>

        <div className="status-changer">
          <span>Status: {STATUS_LABELS[ticket.status]}</span>
        </div>

        <div className="comment-thread">
          <h3>Comments</h3>
          {status === "loading" && <p>Loading…</p>}
          {status === "error" && <p className="error">Failed to load comments.</p>}
          {status === "ready" && comments.length === 0 && <p>No comments yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className="comment">
              <div className="comment-meta">
                <strong>{c.user.name}</strong>
                <span className="comment-time">{formatDateTime(c.created_at)}</span>
              </div>
              <p>{c.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminYuliaWork() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [targetUser, setTargetUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [openTicketId, setOpenTicketId] = useState(null);
  const [personalTab, setPersonalTab] = useState("today");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const token = await getToken();
      const data = await getYuliaWork(token);
      setTargetUser(data.user);
      setTickets(data.tickets);
      setTemplates(data.templates);
      setStatus("ready");
    } catch (err) {
      if (err.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      setErrorMessage(
        err.status === 404
          ? "That account wasn't found in this environment."
          : "Failed to load this page."
      );
      setStatus("error");
    }
  }, [getToken, navigate]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (status === "loading" && !targetUser) return <p className="state-message">Loading…</p>;
  if (status === "error") return <p className="state-message">{errorMessage}</p>;

  const filteredPersonal = tickets
    .filter((t) => t.status === "personal_work")
    .filter((t) => {
      if (personalTab === "today") return isToday(t.due_date);
      if (personalTab === "week") return isThisWeek(t.due_date);
      if (personalTab === "month") return isThisMonth(t.due_date);
      return !t.is_recurring;
    });

  const columnTickets = {
    to_do: tickets.filter((t) => t.status === "to_do"),
    personal_work: filteredPersonal,
    working_on: tickets.filter((t) => t.status === "working_on"),
    awaiting_approval: tickets.filter((t) => t.status === "awaiting_approval"),
  };

  const openTicket = tickets.find((t) => t.id === openTicketId);

  return (
    <div>
      <div className="page-header">
        <h1>{targetUser.name}&rsquo;s Work</h1>
      </div>

      <div className="kanban-board">
        {COLUMNS.map((columnStatus) => (
          <div
            key={columnStatus}
            className="kanban-column"
            style={{ "--column-accent": STATUS_COLORS[columnStatus] }}
          >
            <div className="kanban-column-header">
              <StatusDot status={columnStatus} />
              <span>{STATUS_LABELS[columnStatus]}</span>
              <span className="kanban-column-count">
                {columnTickets[columnStatus].length}
              </span>
            </div>

            {columnStatus === "personal_work" && (
              <div className="tab-bar">
                {PERSONAL_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`tab${personalTab === tab.key ? " tab-active" : ""}`}
                    onClick={() => setPersonalTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            <div className="kanban-column-body">
              {columnTickets[columnStatus].map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onClick={() => setOpenTicketId(ticket.id)}
                />
              ))}
              {columnStatus === "personal_work" &&
                personalTab === "all" &&
                templates.map((template) => (
                  <RecurringTemplateCard
                    key={`template-${template.id}`}
                    template={template}
                    onClick={() => {}}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>

      {openTicket && (
        <ReadOnlyTicketModal ticket={openTicket} onClose={() => setOpenTicketId(null)} />
      )}
    </div>
  );
}
