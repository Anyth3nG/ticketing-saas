import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useNavigate, useParams } from "react-router-dom";
import { getTicket, updateTicket, updateTicketStatus } from "../api/tickets";
import { getCurrentUser } from "../api/users";

const ALL_STATUSES = ["open", "working_on", "awaiting_approval", "done"];
const WORKER_STATUSES = ["working_on", "awaiting_approval", "done"];
const URGENCY_OPTIONS = ["low", "medium", "high"];

export default function TicketDetailPage() {
  const { id } = useParams();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [status, setStatus] = useState("loading");
  const [form, setForm] = useState(null);
  const [statusChoice, setStatusChoice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const token = await getToken();
      const [currentUser, ticketData] = await Promise.all([
        getCurrentUser(token),
        getTicket(token, id),
      ]);
      setUser(currentUser);
      setTicket(ticketData);
      setForm({
        title: ticketData.title,
        description: ticketData.description || "",
        urgency: ticketData.urgency,
        due_date: ticketData.due_date,
        status: ticketData.status,
      });
      setStatusChoice(ticketData.status);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [getToken, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleManagerSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const token = await getToken();
      const updated = await updateTicket(token, id, form);
      setTicket(updated);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleWorkerStatusSave() {
    setSaving(true);
    try {
      const token = await getToken();
      const updated = await updateTicketStatus(token, id, statusChoice);
      setTicket(updated);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") return <p>Loading ticket...</p>;
  if (status === "error" || !ticket) return <p>Failed to load ticket.</p>;

  const isManager = user?.role === "manager";
  const isAssignedWorker =
    !isManager && ticket.assignees.some((a) => a.id === user?.id);

  return (
    <div>
      <button onClick={() => navigate("/tickets")}>Back</button>
      <h1>{ticket.title}</h1>
      <p>Description: {ticket.description || "—"}</p>
      <p>Status: {ticket.status}</p>
      <p>Urgency: {ticket.urgency}</p>
      <p>Due date: {ticket.due_date}</p>
      <p>
        Assigned to:{" "}
        {ticket.assignees.map((a) => a.name).join(", ") || "Unassigned"}
      </p>
      <p>Created by: User #{ticket.created_by}</p>
      <p>Created at: {new Date(ticket.created_at).toLocaleString()}</p>

      {isManager && (
        <form onSubmit={handleManagerSave}>
          <h2>Edit Ticket</h2>
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
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              required
            />
          </label>
          <label>
            Status
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {ALL_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={saving}>
            Save
          </button>
        </form>
      )}

      {isAssignedWorker && (
        <div>
          <h2>Update Status</h2>
          <select
            value={statusChoice}
            onChange={(e) => setStatusChoice(e.target.value)}
          >
            {WORKER_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button onClick={handleWorkerStatusSave} disabled={saving}>
            Update Status
          </button>
        </div>
      )}
    </div>
  );
}
