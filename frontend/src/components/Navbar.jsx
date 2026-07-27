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

// Hardcoded rather than a role: gates the one-off "view Yulia's work page"
// link (see AdminYuliaWork.jsx / backend/routes/admin.py) to this one account.
const CEO_EMAIL = "daniel2233x@gmail.com";

export default function Navbar() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { pathname } = useLocation();
  const [role, setRole] = useState(null);
  const [email, setEmail] = useState(null);
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
        setEmail(currentUser.email);
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
      {email === CEO_EMAIL && (
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
