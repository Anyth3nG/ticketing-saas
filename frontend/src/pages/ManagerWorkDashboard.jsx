import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "../api/users";
import { defaultLayoutId, findLayout, layoutsFor } from "./workLayouts";

// /manager/work is a shell rather than a board: it works out which layouts this
// account may use, renders the switcher, and hands off to the chosen one. The
// boards themselves load their own data and know nothing about each other, so
// a new layout is a new file plus one entry in workLayouts.js.

const STORAGE_KEY = "workLayout";

function readStoredLayout() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing and some embedded webviews throw on access rather than
    // returning null. A missing preference is not worth breaking the page for.
    return null;
  }
}

function storeLayout(id) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Same: the choice just won't survive a reload.
  }
}

function LayoutSwitcher({ layouts, activeId, onSelect }) {
  return (
    <div className="layout-switcher" role="group" aria-label="Board layout">
      <span className="layout-switcher-label">Layout</span>
      {layouts.map((layout) => (
        <button
          key={layout.id}
          type="button"
          className={`tab${layout.id === activeId ? " tab-active" : ""}`}
          aria-pressed={layout.id === activeId}
          title={layout.description}
          onClick={() => onSelect(layout.id)}
        >
          {layout.label}
        </button>
      ))}
    </div>
  );
}

export default function ManagerWorkDashboard() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const [layoutId, setLayoutId] = useState(readStoredLayout);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const currentUser = await getCurrentUser(token);
      if (currentUser.role !== "manager") {
        navigate("/worker", { replace: true });
        return;
      }
      setUser(currentUser);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [getToken, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  function selectLayout(id) {
    setLayoutId(id);
    storeLayout(id);
  }

  if (status === "loading") return <p className="state-message">Loading dashboard…</p>;
  if (status === "error" || !user)
    return <p className="state-message">Failed to load dashboard.</p>;

  const layouts = layoutsFor(user);
  // Resolved rather than used directly: a stored id can name a layout that has
  // since been removed, or one this account isn't allowed, and either should
  // fall back to their default instead of rendering nothing.
  const layout = findLayout(user, layoutId ?? defaultLayoutId(user));
  const Board = layout.Component;

  return (
    <div>
      {layouts.length > 1 && (
        <LayoutSwitcher
          layouts={layouts}
          activeId={layout.id}
          onSelect={selectLayout}
        />
      )}
      {/* Keyed on the layout so switching remounts the board rather than
          handing the new one the old one's state. */}
      <Board key={layout.id} />
    </div>
  );
}
