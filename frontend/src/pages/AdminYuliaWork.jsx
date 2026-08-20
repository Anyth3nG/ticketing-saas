import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { getYuliaTicketComments, getYuliaWork } from "../api/admin";
import TicketCard from "../components/TicketCard";
import RecurringTemplateCard from "../components/RecurringTemplateCard";
import StatusDot, { STATUS_COLORS, STATUS_LABELS } from "../components/StatusDot";
import WorkDatePicker from "../components/WorkDatePicker";
import {
  formatDate,
  formatDateTime,
  isDueOn,
  toISODate,
  upcomingWeek,
} from "../utils/date";
import {
  cardsAcross,
  CUSTOM_COLUMN_SPANS,
  CUSTOM_COLUMNS,
  MEETINGS_COLUMN,
} from "../utils/customBoard";
import MeetingCard from "../components/MeetingCard";

// Read-only mirror of her board, scoped server-side to one specific report
// (see backend/routes/admin.py) and gated to one specific viewer. No
// drag-and-drop, editing, or comment posting -- the underlying ticket
// permission checks are ownership-based and wouldn't allow most of those from
// here anyway, and the point of this page is to look, not to act on someone
// else's board.
//
// To work with the board interactively instead, see the note in
// utils/customBoard.js.

// Her board's columns and date behaviour, imported rather than restated, so
// this read-only mirror can't drift away from what she actually sees.
const COLUMNS = CUSTOM_COLUMNS;

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
  const [meetings, setMeetings] = useState([]);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [openTicketId, setOpenTicketId] = useState(null);

  const weekDays = useMemo(() => upcomingWeek(), []);
  const todayISODate = toISODate(weekDays[0]);
  const [selectedDate, setSelectedDate] = useState(todayISODate);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const token = await getToken();
      const data = await getYuliaWork(token);
      setTargetUser(data.user);
      setTickets(data.tickets);
      setTemplates(data.templates);
      setMeetings(data.meetings ?? []);
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

  if (status === "loading" && !targetUser)
    return <p className="state-message">Loading…</p>;
  if (status === "error") return <p className="state-message">{errorMessage}</p>;

  const isTodaySelected = selectedDate === todayISODate;
  const dueOnSelectedDay = tickets.filter((t) =>
    isDueOn(t, selectedDate, isTodaySelected)
  );

  const columnTickets = Object.fromEntries(
    COLUMNS.map((columnStatus) => [
      columnStatus,
      dueOnSelectedDay.filter((t) => t.status === columnStatus),
    ])
  );

  const countsByDate = {};
  for (const day of weekDays) {
    const iso = toISODate(day);
    countsByDate[iso] = tickets.filter(
      (t) => isDueOn(t, iso, iso === todayISODate)
    ).length;
  }

  const selectedDayOfMonth = Number(selectedDate.slice(8, 10));
  const meetingsForDay = meetings.filter((m) => m.date === selectedDate);

  const templatesForDay = templates.filter(
    (t) => t.recurrence_day === selectedDayOfMonth
  );

  const openTicket = tickets.find((t) => t.id === openTicketId);

  return (
    <div>
      <div className="page-header">
        <WorkDatePicker
          days={weekDays}
          selectedISO={selectedDate}
          counts={countsByDate}
          onSelect={setSelectedDate}
        />
        <p className="page-header-subject">{targetUser.name}&rsquo;s Work</p>
      </div>

      <div className="kanban-board kanban-board-custom">
        {COLUMNS.map((columnStatus) => (
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
              <span className="kanban-column-count">
                {columnStatus === MEETINGS_COLUMN
                  ? meetingsForDay.length
                  : columnTickets[columnStatus].length}
              </span>
            </div>

            <div
              className="kanban-column-body"
              style={{ "--cards-across": cardsAcross(columnStatus) }}
            >
              {columnStatus === MEETINGS_COLUMN &&
                meetingsForDay.map((meeting) => (
                  <MeetingCard key={meeting.id} meeting={meeting} />
                ))}
              {columnTickets[columnStatus].map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onClick={() => setOpenTicketId(ticket.id)}
                />
              ))}
              {columnStatus === "priority" &&
                templatesForDay.map((template) => (
                  <RecurringTemplateCard
                    key={`template-${template.id}`}
                    template={template}
                    onClick={() => {}}
                  />
                ))}
              {columnStatus === MEETINGS_COLUMN && meetingsForDay.length === 0 && (
                <p className="kanban-column-empty">Nothing scheduled</p>
              )}
              {columnStatus !== MEETINGS_COLUMN &&
                columnTickets[columnStatus].length === 0 &&
                (columnStatus !== "priority" || templatesForDay.length === 0) && (
                  <p className="kanban-column-empty">Nothing due</p>
                )}
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
