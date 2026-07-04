import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { createTicket } from "../api/tickets";
import { getCurrentUser, getUsers } from "../api/users";

const URGENCY_OPTIONS = ["low", "medium", "high"];

export default function CreateTicketPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState(null);
  const [users, setUsers] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState("low");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = await getToken();
      const currentUser = await getCurrentUser(token);
      if (cancelled) return;

      if (currentUser.role !== "manager") {
        navigate("/tickets", { replace: true });
        return;
      }

      setRole(currentUser.role);
      const userList = await getUsers(token);
      if (!cancelled) setUsers(userList);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [getToken, navigate]);

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
      navigate("/tickets");
    } catch {
      setError("Failed to create ticket.");
      setSubmitting(false);
    }
  }

  if (role !== "manager") return <p>Loading...</p>;

  return (
    <div>
      <h1>Create Ticket</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
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
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          Create Ticket
        </button>
      </form>
    </div>
  );
}
