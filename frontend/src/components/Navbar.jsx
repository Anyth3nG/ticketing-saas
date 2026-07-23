import { useEffect, useState } from "react";
import { useAuth, useUser, UserButton } from "@clerk/react";
import { Link, useLocation } from "react-router-dom";
import { getCurrentUser } from "../api/users";
import NotificationBell from "./NotificationBell";

const DASHBOARD_PATHS = ["/", "/worker", "/manager"];

export default function Navbar() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { pathname } = useLocation();
  const [role, setRole] = useState(null);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const isDashboard = DASHBOARD_PATHS.includes(pathname);
  const isArchive = pathname === "/archive";
  const isMyWork = pathname === "/manager/work";

  useEffect(() => {
    let cancelled = false;
    async function loadRole() {
      const token = await getToken();
      const currentUser = await getCurrentUser(token);
      if (!cancelled) setRole(currentUser.role);
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
      <span className="navbar-user">{name}</span>
      <NotificationBell role={role} />
      <UserButton />
    </nav>
  );
}
