import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  getRecurringTemplates,
  getTickets,
  updateTicketStatus,
} from "../api/tickets";
import { getCurrentUser } from "../api/users";
import TicketCard from "../components/TicketCard";
import TicketDetailModal from "../components/TicketDetailModal";
import RecurringTemplateCard from "../components/RecurringTemplateCard";
import RecurringTemplateModal from "../components/RecurringTemplateModal";
import StatusDot, { STATUS_COLORS, STATUS_LABELS } from "../components/StatusDot";
import {
  isDueOn,
  toISODate,
  todayISO,
  upcomingWeek,
} from "../utils/date";
import WorkDatePicker from "../components/WorkDatePicker";
import {
  cardsAcross,
  CUSTOM_COLUMN_SPANS,
  CUSTOM_COLUMNS,
  CUSTOM_TICKET_STATUSES,
  LANDING_STATUS,
  MEETINGS_COLUMN,
} from "../utils/customBoard";
import { getMeetings } from "../api/meetings";
import MeetingCard from "../components/MeetingCard";
import MeetingModal from "../components/MeetingModal";

// The custom personal board, rendered by ManagerWorkDashboard in place of the
// standard one for the accounts listed in utils/customBoard.js. Everyone else
// keeps the shared board, which is why this lives in its own file rather than
// as a pile of branches inside that one.
//
// Two things make it different. The header is a date picker rather than a
// static title, and every column shows only what falls on the selected day.
// And the columns are the board's own -- Priority, Meetings, Project-Work,
// Contact, Send -- instead of the manager/worker approval flow. Meetings is
// the odd one out: it holds Meeting objects, not tickets, so nothing can be
// dragged into it.

const URGENCY_OPTIONS = ["low", "medium", "high"];

// Mirrors _can_update_status in backend/routes/tickets.py. The backend is the
// real gate; this only stops a drag that would be rejected from looking like
// it worked before the request comes back.
//
// Personal tickets only, and only between this board's own ticket columns --
// Meetings is excluded, since it holds a different object entirely.
function isValidStatusTransition(ticket, newStatus) {
  return (
    ticket.ticket_type === "personal" &&
    CUSTOM_TICKET_STATUSES.includes(newStatus)
  );
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
  const showOver =
    isOver && (!activeTicket || isValidStatusTransition(activeTicket, status));
  return (
    <div
      ref={setNodeRef}
      className={`kanban-column-body${showOver ? " kanban-column-body-over" : ""}`}
      style={{ "--cards-across": cardsAcross(status) }}
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
  // Only offered on the custom board, which has columns worth choosing
  // between. Elsewhere the backend's landing status stands.
  const [status, setStatus] = useState(LANDING_STATUS);
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
        // Recurring work is generated later from a template, which has no
        // status of its own, so a choice here would be dropped.
        ...(!isRecurring && { status }),
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
          {/* Hidden for a recurring ticket: those are generated later by
              generate_due_recurring_tickets, which has no per-template status
              to read, so a choice made here wouldn't be honored. */}
          {!isRecurring && (
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {CUSTOM_TICKET_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
          )}
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
                lang="en-GB"
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

export default function CustomWorkBoard() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [status, setStatus] = useState("loading");
  const [openTicketId, setOpenTicketId] = useState(null);
  const [openTemplateId, setOpenTemplateId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTicket, setActiveTicket] = useState(null);
  const [meetings, setMeetings] = useState([]);
  // Null when closed. `{ isNew: true }` opens a blank form on the selected
  // day; a meeting object opens that one for editing.
  const [openMeeting, setOpenMeeting] = useState(null);

  // Recomputed once per mount rather than per render: the seven Date objects
  // are only recalculated when the page is reloaded, which is fine -- a
  // session left open across midnight is refreshed by the 30s poll anyway.
  const weekDays = useMemo(() => upcomingWeek(), []);
  const todayISODate = toISODate(weekDays[0]);
  const [selectedDate, setSelectedDate] = useState(todayISODate);

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
      const [currentUser, ticketList, templateList] = await Promise.all([
        getCurrentUser(token),
        getTickets(token),
        getRecurringTemplates(token),
      ]);
      if (currentUser.role !== "manager") {
        navigate("/worker", { replace: true });
        return;
      }
      setUser(currentUser);
      // GET /tickets/ returns every ticket in the system to a manager
      // (needed for the Team Board), so this page -- which only ever shows
      // the manager's own personal work -- has to filter it down itself.
      // getRecurringTemplates is already scoped server-side to this user's
      // own templates, so it needs no equivalent filtering here.
      setTickets(
        ticketList.filter(
          (t) => t.ticket_type === "personal" && t.created_by === currentUser.id
        )
      );
      setTemplates(templateList);

      // Meetings are their own object rather than tickets, and the endpoint
      // only answers for accounts on the custom board -- so it's fetched
      // separately, and only when there's a Meetings column to fill.
      setMeetings(await getMeetings(token));
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

  const columns = CUSTOM_COLUMNS;

  const isTodaySelected = selectedDate === todayISODate;
  const dueOnSelectedDay = tickets.filter((t) =>
    isDueOn(t, selectedDate, isTodaySelected)
  );

  const columnTickets = Object.fromEntries(
    columns.map((columnStatus) => [
      columnStatus,
      dueOnSelectedDay.filter((t) => t.status === columnStatus),
    ])
  );

  // Per-day totals for the dropdown, so a day's workload is visible before
  // committing to opening it. Today's figure counts overdue work too, matching
  // what selecting it actually shows.
  const countsByDate = {};
  for (const day of weekDays) {
    const iso = toISODate(day);
    countsByDate[iso] = tickets.filter(
      (t) => isDueOn(t, iso, iso === todayISODate)
    ).length;
  }

  // A recurring series belongs to the day of the month it fires on, so its
  // template card surfaces on that date rather than sitting on the board
  // permanently. The generated ticket for that month appears alongside it via
  // its own due date, same as any other ticket.
  // Meetings carry a real start time rather than a due date, so "today"
  // doesn't absorb earlier ones the way overdue tickets are absorbed -- a
  // meeting that already happened isn't still owed.
  const meetingsForDay = meetings.filter((m) => m.date === selectedDate);

  // Recurring template cards sit in whichever column new work lands in.
  const templateColumn = LANDING_STATUS;
  const selectedDayOfMonth = Number(selectedDate.slice(8, 10));
  const templatesForDay = templates.filter(
    (t) => t.recurrence_day === selectedDayOfMonth
  );

  return (
    <div>
      <div className="page-header">
        <WorkDatePicker
          days={weekDays}
          selectedISO={selectedDate}
          counts={countsByDate}
          onSelect={setSelectedDate}
        />
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
        <div className="kanban-board kanban-board-custom">
          {columns.map((columnStatus) => (
            <div
              key={columnStatus}
              className="kanban-column"
              style={{
                "--column-accent": STATUS_COLORS[columnStatus],
                gridColumn: `span ${CUSTOM_COLUMN_SPANS[columnStatus]}`,
              }}
            >
              <div className="kanban-column-header">
                <StatusDot status={columnStatus} />
                <span>{STATUS_LABELS[columnStatus]}</span>
                {columnStatus === MEETINGS_COLUMN && (
                  <button
                    type="button"
                    className="column-add-btn"
                    onClick={() => setOpenMeeting({ isNew: true })}
                    aria-label="Set a meeting"
                    title="Set a meeting"
                  >
                    +
                  </button>
                )}
                <span className="kanban-column-count">
                  {columnStatus === MEETINGS_COLUMN
                    ? meetingsForDay.length
                    : columnTickets[columnStatus].length}
                </span>
              </div>

              {columnStatus === MEETINGS_COLUMN ? (
                // Not a DroppableColumn: meetings aren't tickets, so there's
                // no status for a dragged card to take on here.
                <div
                  className="kanban-column-body"
                  style={{ "--cards-across": cardsAcross(columnStatus) }}
                >
                  {meetingsForDay.map((meeting) => (
                    <MeetingCard
                      key={meeting.id}
                      meeting={meeting}
                      onClick={setOpenMeeting}
                    />
                  ))}
                  {meetingsForDay.length === 0 && (
                    <p className="kanban-column-empty">Nothing scheduled</p>
                  )}
                </div>
              ) : (
                <DroppableColumn
                  status={columnStatus}
                  activeTicket={activeTicket}
                >
                  {columnTickets[columnStatus].map((ticket) => (
                    <DraggableCard key={ticket.id} ticket={ticket} onOpen={setOpenTicketId} />
                  ))}
                  {columnStatus === templateColumn &&
                    templatesForDay.map((template) => (
                      <RecurringTemplateCard
                        key={`template-${template.id}`}
                        template={template}
                        onClick={() => setOpenTemplateId(template.id)}
                      />
                    ))}
                  {columnTickets[columnStatus].length === 0 &&
                    (columnStatus !== templateColumn || templatesForDay.length === 0) && (
                      <p className="kanban-column-empty">Nothing due</p>
                    )}
                </DroppableColumn>
              )}
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

      {openTemplateId &&
        templates.find((t) => t.id === openTemplateId) && (
          <RecurringTemplateModal
            template={templates.find((t) => t.id === openTemplateId)}
            onClose={() => setOpenTemplateId(null)}
            onChanged={load}
          />
        )}

      {showCreateForm && (
        <CreatePersonalTicketForm
          onClose={() => setShowCreateForm(false)}
          onCreated={load}
        />
      )}

      {openMeeting && (
        <MeetingModal
          meeting={openMeeting.isNew ? null : openMeeting}
          dateISO={selectedDate}
          onClose={() => setOpenMeeting(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
