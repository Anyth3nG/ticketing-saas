import { useEffect, useState } from "react";
import { useAuth, useUser, UserButton } from "@clerk/react";
import { Link, useLocation } from "react-router-dom";
import { getCurrentUser } from "../api/users";
import NotificationBell from "./NotificationBell";

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
      }
    }
    loadRole();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

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
      <NotificationBell role={role} />
      <UserButton />
    </nav>
  );
}
