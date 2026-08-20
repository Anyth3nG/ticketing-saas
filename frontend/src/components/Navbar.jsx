import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth, useUser, UserButton } from "@clerk/react";
import { Link, useLocation } from "react-router-dom";
import { getCurrentUser, getUsers } from "../api/users";
import { applyDashboardOrder } from "../utils/format";
import NotificationBell from "./NotificationBell";
import DashboardLayoutEditor from "./DashboardLayoutEditor";
import { GridIcon } from "./icons";

const DASHBOARD_PATHS = ["/", "/worker", "/manager"];

// Whether the "view the manager's work page" link is drawn comes from the user
// object's `is_admin`, decided server-side (backend/custom_board.py). The route
// itself is what actually enforces access; this only hides a link that would
// 403 anyway.

export default function Navbar() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { pathname } = useLocation();
  const [role, setRole] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dashboardLayout, setDashboardLayout] = useState(null);
  const [layoutWorkers, setLayoutWorkers] = useState([]);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const isDashboard = DASHBOARD_PATHS.includes(pathname);
  const isArchive = pathname === "/archive";
  const isMyWork = pathname === "/manager/work";
  const isYuliaWork = pathname === "/admin/yulia-work";

  useEffect(() => {
    let cancelled = false;
    async function loadRole() {
      const token = await getToken();
      const currentUser = await getCurrentUser(token);
      if (!cancelled) {
        setRole(currentUser.role);
        setIsAdmin(Boolean(currentUser.is_admin));
        setDashboardLayout(currentUser.dashboard_layout);
      }
    }
    loadRole();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  async function openLayoutEditor() {
    const token = await getToken();
    const userList = await getUsers(token);
    setLayoutWorkers(
      applyDashboardOrder(
        userList.filter((u) => u.role === "worker"),
        dashboardLayout
      )
    );
    setShowLayoutEditor(true);
  }

  function handleLayoutSaved(newOrder) {
    setDashboardLayout(newOrder);
    setShowLayoutEditor(false);
  }

  return (
    <nav className="navbar">
      <span className="navbar-brand">
        <img className="navbar-logo" src="/logo_mark.svg" alt="" aria-hidden="true" />
        <img className="navbar-wordmark" src="/wordmark_name.svg" alt="MAX-CPA" />
      </span>
      <Link
        className={"navbar-link" + (isDashboard ? " navbar-link-active" : "")}
        to="/"
      >
        Dashboard
      </Link>
      {role === "manager" && (
        <Link
          className={"navbar-link" + (isMyWork ? " navbar-link-active" : "")}
          to="/manager/work"
        >
          My Work
        </Link>
      )}
      <Link
        className={"navbar-link" + (isArchive ? " navbar-link-active" : "")}
        to="/archive"
      >
        Archive
      </Link>
      {isAdmin && (
        <Link
          className={"navbar-link" + (isYuliaWork ? " navbar-link-active" : "")}
          to="/admin/yulia-work"
        >
          Yulia&rsquo;s Work
        </Link>
      )}
      <span className="navbar-user">{name}</span>
      {role === "manager" && (
        <button
          type="button"
          className="icon-btn"
          onClick={openLayoutEditor}
          aria-label="Change dashboard layout"
          title="Change dashboard layout"
        >
          <GridIcon />
        </button>
      )}
      <NotificationBell role={role} />
      <UserButton />

      {showLayoutEditor &&
        createPortal(
          // Portalled to <body> rather than rendered in place: .navbar has
          // backdrop-filter, which (like transform) creates a new containing
          // block for position:fixed descendants -- left in place, the
          // modal's fixed overlay would center on the navbar instead of the
          // viewport.
          <DashboardLayoutEditor
            workers={layoutWorkers}
            onClose={() => setShowLayoutEditor(false)}
            onSaved={handleLayoutSaved}
          />,
          document.body
        )}
    </nav>
  );
}
