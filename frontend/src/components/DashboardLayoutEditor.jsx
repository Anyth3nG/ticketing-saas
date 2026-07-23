import { useState } from "react";
import { useAuth } from "@clerk/react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { updateDashboardLayout } from "../api/users";
import { initials } from "../utils/format";

function SortableWorkerBox({ worker }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: worker.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="layout-editor-box"
    >
      {worker.avatar_url ? (
        <img className="worker-avatar" src={worker.avatar_url} alt="" aria-hidden="true" />
      ) : (
        <span className="worker-avatar" aria-hidden="true">
          {initials(worker.name)}
        </span>
      )}
      <span className="layout-editor-box-name">{worker.name}</span>
    </div>
  );
}

export default function DashboardLayoutEditor({ workers, onClose, onSaved }) {
  const { getToken } = useAuth();
  const [order, setOrder] = useState(() => workers.map((w) => w.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const workersById = Object.fromEntries(workers.map((w) => [w.id, w]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((items) => {
      const oldIndex = items.indexOf(active.id);
      const newIndex = items.indexOf(over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      await updateDashboardLayout(token, order);
      onSaved(order);
    } catch {
      setError("Failed to save layout.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-layout-editor"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>Arrange Dashboard</h2>
        <p className="layout-editor-hint">
          Drag boxes to set the order of the worker boards on your dashboard.
        </p>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={order} strategy={rectSortingStrategy}>
            <div className="layout-editor-grid">
              {order.map((id) => (
                <SortableWorkerBox key={id} worker={workersById[id]} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {error && <p className="error">{error}</p>}

        <div className="modal-form-actions">
          <button type="button" className="btn" onClick={handleSave} disabled={saving}>
            Save Layout
          </button>
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
