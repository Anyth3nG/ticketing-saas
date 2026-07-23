import { useState } from "react";
import { useAuth } from "@clerk/react";
import { deleteRecurringTemplate, updateRecurringTemplate } from "../api/tickets";
import { EditIcon, TrashIcon } from "./icons";

const URGENCY_OPTIONS = ["low", "medium", "high"];

// The template is the recurring series itself -- distinct from any one
// month's generated ticket. Editing here only affects future months (past
// and current instances already copied their title/urgency at generation
// time). Delete removes the schedule and this month's unfinished occurrence
// together -- the only way to stop a recurring ticket, per design.
export default function RecurringTemplateModal({ template, onClose, onChanged }) {
  const { getToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: template.title,
    description: template.description || "",
    urgency: template.urgency,
    recurrence_day: template.recurrence_day,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      await updateRecurringTemplate(token, template.id, {
        title: form.title,
        description: form.description || null,
        urgency: form.urgency,
        recurrence_day: Number(form.recurrence_day),
      });
      setEditing(false);
      onChanged?.();
    } catch {
      setError("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Delete this recurring ticket? This removes the schedule and this " +
          "month's unfinished occurrence. This can't be undone."
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const token = await getToken();
      await deleteRecurringTemplate(token, template.id);
      onChanged?.();
      onClose();
    } catch {
      setError("Failed to delete.");
      setDeleting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="modal-header">
          <h2>{template.title}</h2>
          {!editing && (
            <button
              type="button"
              className="icon-btn modal-edit-btn"
              onClick={() => setEditing(true)}
              aria-label="Edit recurring ticket"
              title="Edit recurring ticket"
            >
              <EditIcon />
            </button>
          )}
          <button
            type="button"
            className="icon-btn modal-delete-btn"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Delete recurring ticket"
            title="Delete recurring ticket"
          >
            <TrashIcon />
          </button>
        </div>

        {!editing && (
          <div className="modal-details">
            <p>{template.description || "No description."}</p>
            <p>Urgency: {template.urgency}</p>
            <p>Repeats monthly on day {template.recurrence_day}</p>
          </div>
        )}

        {editing && (
          <form onSubmit={handleSave}>
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
                onChange={(e) => setForm({ ...form, description: e.target.value })}
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
              Day of month
              <input
                type="number"
                min="1"
                max="31"
                value={form.recurrence_day}
                onChange={(e) => setForm({ ...form, recurrence_day: e.target.value })}
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
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

        {!editing && error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
