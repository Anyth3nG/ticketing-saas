import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import {
  assignTicket,
  createComment,
  deleteTicket,
  getComments,
  getTicket,
  updateTicket,
  updateTicketStatus,
} from "../api/tickets";
import StatusDot, { STATUS_LABELS } from "./StatusDot";
import { CheckIcon, EditIcon, TrashIcon } from "./icons";
import { formatDate, formatDateTime, formatTimestampDate } from "../utils/date";

const URGENCY_OPTIONS = ["low", "medium", "high"];

export default function TicketDetailModal({
  ticketId,
  currentUser,
  workers,
  onClose,
  onChanged,
  readOnly = false,
}) {
  const { getToken } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [comments, setComments] = useState([]);
  const [status, setStatus] = useState("loading");
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const token = await getToken();
      const [ticketData, commentList] = await Promise.all([
        getTicket(token, ticketId),
        getComments(token, ticketId),
      ]);
      setTicket(ticketData);
      setComments(commentList);
      setForm({
        title: ticketData.title,
        description: ticketData.description || "",
        urgency: ticketData.urgency,
        due_date: ticketData.due_date,
      });
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [getToken, ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMarkPersonalDone() {
    try {
      const token = await getToken();
      const updated = await updateTicketStatus(token, ticketId, "done");
      setTicket(updated);
      onChanged?.();
    } catch {
      setStatus("error");
    }
  }

  async function handleApprove() {
    try {
      const token = await getToken();
      const updated = await updateTicketStatus(token, ticketId, "done");
      setTicket(updated);
      onChanged?.();
    } catch {
      setStatus("error");
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this ticket? This can't be undone.")) return;
    setDeleting(true);
    try {
      const token = await getToken();
      await deleteTicket(token, ticketId);
      onChanged?.();
      onClose();
    } catch {
      setStatus("error");
      setDeleting(false);
    }
  }

  async function handleReassign(e) {
    const newWorkerId = Number(e.target.value);
    try {
      const token = await getToken();
      const updated = await assignTicket(token, ticketId, newWorkerId);
      setTicket(updated);
      onChanged?.();
    } catch {
      setStatus("error");
    }
  }

  async function handlePostComment(e) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const token = await getToken();
      const comment = await createComment(token, ticketId, newComment.trim());
      setComments((prev) => [...prev, comment]);
      setNewComment("");
    } catch {
      setStatus("error");
    } finally {
      setPosting(false);
    }
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const token = await getToken();
      const updated = await updateTicket(token, ticketId, form);
      setTicket(updated);
      setEditing(false);
      onChanged?.();
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  const canEdit =
    !readOnly &&
    ((ticket?.ticket_type === "personal" && ticket?.created_by === currentUser?.id) ||
      (currentUser?.role === "manager" && ticket?.status === "to_do"));

  const isManager = currentUser?.role === "manager";

  const canReassign =
    !readOnly &&
    currentUser?.role === "manager" &&
    ticket?.ticket_type === "assigned" &&
    workers?.length > 0;

  // Managers remove the work they handed out; workers remove their own
  // personal tickets. Recurring instances are never individually deletable --
  // that only happens via the recurring ticket itself, in the All tab.
  const showDelete =
    !readOnly &&
    !ticket?.is_recurring &&
    ((isManager && ticket?.ticket_type === "assigned") ||
      (ticket?.ticket_type === "personal" &&
        ticket?.created_by === currentUser?.id));

  const showApprove = !readOnly && isManager && ticket?.status === "awaiting_approval";
  // Ownership-based, not role-based -- a manager also has personal tickets of
  // their own now, and should see this on those; still correctly hidden when
  // a manager is just viewing a worker's personal ticket.
  const showPersonalDone =
    !readOnly &&
    ticket?.ticket_type === "personal" &&
    ticket?.created_by === currentUser?.id &&
    ticket?.status !== "done";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {status === "loading" && <p className="state-message">Loading…</p>}
        {status === "error" && <p className="state-message error">Something went wrong.</p>}

        {ticket && (
          <>
            <div className="modal-header">
              <StatusDot status={ticket.status} />
              <h2>
                <span className="ticket-number">#{ticket.id}</span> {ticket.title}
              </h2>
              {(showApprove || showPersonalDone) && (
                <button
                  type="button"
                  className="icon-btn btn-success modal-edit-btn"
                  onClick={showApprove ? handleApprove : handleMarkPersonalDone}
                  aria-label="Mark as done"
                  title="Mark as done"
                >
                  <CheckIcon />
                </button>
              )}
              {!editing && canEdit && (
                <button
                  type="button"
                  className="icon-btn modal-edit-btn"
                  onClick={() => setEditing(true)}
                  aria-label="Edit ticket"
                  title="Edit ticket"
                >
                  <EditIcon />
                </button>
              )}
              {!editing && showDelete && (
                <button
                  type="button"
                  className="icon-btn modal-delete-btn"
                  onClick={handleDelete}
                  disabled={deleting}
                  aria-label="Delete ticket"
                  title="Delete ticket"
                >
                  <TrashIcon />
                </button>
              )}
            </div>

            {!editing && (
              <div className="modal-details">
                <p>{ticket.description || "No description."}</p>
                <p>Urgency: {ticket.urgency}</p>
                <p>Due: {formatDate(ticket.due_date)}</p>
                <p>Created: {formatTimestampDate(ticket.created_at)}</p>
                {canReassign ? (
                  <label className="reassign-control">
                    Assigned to
                    <select
                      value={ticket.assignees[0]?.id ?? ""}
                      onChange={handleReassign}
                    >
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  ticket.assignees.length > 0 && (
                    <p>Assigned to: {ticket.assignees.map((a) => a.name).join(", ")}</p>
                  )
                )}
              </div>
            )}

            {editing && form && (
              <form onSubmit={handleSaveEdit}>
                <label>
                  Title
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Description
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </label>
                <label>
                  Urgency
                  <select
                    value={form.urgency}
                    onChange={(e) => setForm({ ...form, urgency: e.target.value })}
                  >
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
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    required
                  />
                </label>
                <div className="modal-form-actions">
                  <button type="submit" className="btn" disabled={saving}>
                    Save
                  </button>
                  <button type="button" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="status-changer">
              <span>Status: {STATUS_LABELS[ticket.status]}</span>
            </div>

            <div className="comment-thread">
              <h3>Comments</h3>
              {comments.length === 0 && <p>No comments yet.</p>}
              {comments.map((c) => (
                <div key={c.id} className="comment">
                  <div className="comment-meta">
                    <strong>{c.user.name}</strong>
                    <span className="comment-time">
                      {formatDateTime(c.created_at)}
                    </span>
                  </div>
                  <p>{c.content}</p>
                </div>
              ))}
              <form onSubmit={handlePostComment}>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                />
                <button type="submit" className="btn-soft" disabled={posting || !newComment.trim()}>
                  Post
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
