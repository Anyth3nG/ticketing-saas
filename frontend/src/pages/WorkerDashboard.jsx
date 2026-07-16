import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  createPersonalTicket,
  getTickets,
  updateTicketStatus,
} from "../api/tickets";
import { getCurrentUser } from "../api/users";
import TicketCard from "../components/TicketCard";
import TicketDetailModal from "../components/TicketDetailModal";
import StatusDot, { STATUS_COLORS, STATUS_LABELS } from "../components/StatusDot";
import { todayISO } from "../utils/date";

const COLUMNS = ["to_do", "personal_work", "working_on", "awaiting_approval"];
const URGENCY_OPTIONS = ["low", "medium", "high"];
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

function isToday(dateStr) {
  return parseISODate(dateStr).getTime() === todayLocal().getTime();
}

function startOfWeek(date) {
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
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

function isValidStatusTransition(ticket, newStatus) {
  if (ticket.ticket_type === "assigned" && newStatus === "personal_work") return false;
  if (ticket.ticket_type === "personal" && newStatus === "to_do") return false;
  if (ticket.ticket_type === "personal" && newStatus === "awaiting_approval") return false;
  return true;
}

function DraggableCard({ ticket, onOpen }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: ticket.id,
  });
  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px) rotate(2deg)`,
        zIndex: 10,
        boxShadow: "var(--shadow)",
        cursor: "grabbing",
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <TicketCard ticket={ticket} onClick={() => onOpen(ticket.id)} />
    </div>
  );
}

function DroppableColumn({ status, activeTicket, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const showOver = isOver && (!activeTicket || isValidStatusTransition(activeTicket, status));
  return (
    <div
      ref={setNodeRef}
      className={`kanban-column-body${showOver ? " kanban-column-body-over" : ""}`}
    >
      {children}
    </div>
  );
}

function CreatePersonalTicketForm({ onClose, onCreated }) {
  const { getToken } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState("low");
  const [isRecurring, setIsRecurring] = useState(false);
  const [dueDate, setDueDate] = useState(todayISO());
  const [recurrenceDay, setRecurrenceDay] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      await createPersonalTicket(token, {
        title,
        description: description || null,
        urgency,
        is_recurring: isRecurring,
        due_date: isRecurring ? null : dueDate,
        recurrence_day: isRecurring ? Number(recurrenceDay) : null,
      });
      onCreated();
      onClose();
    } catch {
      setError("Failed to create personal ticket.");
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>Create Personal Ticket</h2>
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
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
            />
            Recurring (monthly)
          </label>
          {isRecurring ? (
            <label>
              Day of month
              <input
                type="number"
                min="1"
                max="31"
                value={recurrenceDay}
                onChange={(e) => setRecurrenceDay(e.target.value)}
                required
              />
            </label>
          ) : (
            <label>
              Due date
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn" disabled={submitting}>
            Create
          </button>
        </form>
      </div>
    </div>
  );
}

export default function WorkerDashboard() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [status, setStatus] = useState("loading");
  const [openTicketId, setOpenTicketId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [personalTab, setPersonalTab] = useState("today");
  const [activeTicket, setActiveTicket] = useState(null);

  useEffect(() => {
    const ticketParam = searchParams.get("ticket");
    if (!ticketParam) return;
    setOpenTicketId(Number(ticketParam));
    searchParams.delete("ticket");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const token = await getToken();
      const [currentUser, ticketList] = await Promise.all([
        getCurrentUser(token),
        getTickets(token),
      ]);
      if (currentUser.role !== "worker") {
        navigate("/manager", { replace: true });
        return;
      }
      setUser(currentUser);
      setTickets(ticketList);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [getToken, navigate]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(event) {
    const ticket = tickets.find((t) => t.id === event.active.id);
    setActiveTicket(ticket ?? null);
  }

  async function handleDragEnd(event) {
    setActiveTicket(null);
    const { active, over } = event;
    if (!over) return;

    const ticketId = active.id;
    const newStatus = over.id;
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === newStatus) return;
    if (!isValidStatusTransition(ticket, newStatus)) return;

    const previousStatus = ticket.status;
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
    );

    try {
      const token = await getToken();
      await updateTicketStatus(token, ticketId, newStatus);
    } catch {
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: previousStatus } : t))
      );
    }
  }

  if (!user && status === "loading") return <p className="state-message">Loading dashboard…</p>;
  if (!user && status === "error") return <p className="state-message">Failed to load dashboard.</p>;

  const filteredPersonal = tickets
    .filter((t) => t.status === "personal_work")
    .filter((t) => {
      if (personalTab === "today") return isToday(t.due_date);
      if (personalTab === "week") return isThisWeek(t.due_date);
      if (personalTab === "month") return isThisMonth(t.due_date);
      return true;
    });

  const columnTickets = {
    to_do: tickets.filter((t) => t.status === "to_do"),
    personal_work: filteredPersonal,
    working_on: tickets.filter((t) => t.status === "working_on"),
    awaiting_approval: tickets.filter((t) => t.status === "awaiting_approval"),
  };

  return (
    <div>
      <div className="page-header">
        <h1>My Board</h1>
        <div className="page-header-actions">
          <button className="btn" onClick={() => setShowCreateForm(true)}>
            Create personal ticket
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveTicket(null)}
      >
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

              <DroppableColumn status={columnStatus} activeTicket={activeTicket}>
                {columnTickets[columnStatus].map((ticket) => (
                  <DraggableCard key={ticket.id} ticket={ticket} onOpen={setOpenTicketId} />
                ))}
              </DroppableColumn>
            </div>
          ))}
        </div>
      </DndContext>

      {openTicketId && (
        <TicketDetailModal
          ticketId={openTicketId}
          currentUser={user}
          onClose={() => setOpenTicketId(null)}
          onChanged={load}
        />
      )}

      {showCreateForm && (
        <CreatePersonalTicketForm
          onClose={() => setShowCreateForm(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
