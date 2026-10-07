import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth, useClerk, useUser, UserButton } from "@clerk/react";
import { Link, useLocation } from "react-router-dom";
import { getCurrentUser, getUsers } from "../api/users";
import { applyDashboardOrder } from "../utils/format";
import NotificationBell from "./NotificationBell";
import DashboardLayoutEditor from "./DashboardLayoutEditor";
import { GridIcon } from "./icons";

const DASHBOARD_PATHS = ["/", "/worker", "/manager"];

// The CRM, opened with the same user still signed in. Empty wherever the CRM
// does not run (prod, for now), which hides the link. Trimmed because Vite
// pastes the build variable in verbatim -- see api/config.js for what a stray
// newline in one once did.
const CRM_URL = import.meta.env.VITE_CRM_URL?.trim();

// Whether the "view the manager's work page" link is drawn comes from the user
// object's `is_admin`, decided server-side (backend/custom_board.py). The route
// itself is what actually enforces access; this only hides a link that would
// 403 anyway.

export default function Navbar() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const clerk = useClerk();
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

  // The href is the bare URL; the click adds the session. On Clerk's
  // development instance (test) a session cannot cross hostnames by cookie, so
  // buildUrlWithAuth appends Clerk's dev-browser token, which the CRM reads and
  // strips from the URL on arrival. On production it returns the URL
  // unchanged: the session lives with Clerk under max-cpa.co.il, not per app.
  // Built on click rather than into the href, so the token never sits in the
  // page to be copied. A modified or middle click keeps the browser's own
  // behaviour and opens the bare URL.
  function openCrm(event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    window.location.assign(clerk.buildUrlWithAuth(CRM_URL));
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
      {CRM_URL && (
        <a className="navbar-link" href={CRM_URL} onClick={openCrm}>
          CRM
        </a>
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
      {/* Switching account lands on "/" on THIS hostname, where RoleRedirect
          picks the new user's dashboard. Unset, Clerk uses the absolute URL
          saved in its dashboard, which on test points at the CRM. */}
      <UserButton afterSwitchSessionUrl="/" />

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
