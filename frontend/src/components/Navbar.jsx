import { useUser, UserButton } from "@clerk/react";
import { Link, useLocation } from "react-router-dom";

const DASHBOARD_PATHS = ["/", "/worker", "/manager"];

export default function Navbar() {
  const { user } = useUser();
  const { pathname } = useLocation();
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const isDashboard = DASHBOARD_PATHS.includes(pathname);
  const isArchive = pathname === "/archive";

  return (
    <nav className="navbar">
      <span className="navbar-brand">
        <span className="navbar-logo-placeholder" aria-hidden="true" />
        <span className="navbar-title">MAX-CPA</span>
      </span>
      <Link
        className={"navbar-link" + (isDashboard ? " navbar-link-active" : "")}
        to="/"
      >
        Dashboard
      </Link>
      <Link
        className={"navbar-link" + (isArchive ? " navbar-link-active" : "")}
        to="/archive"
      >
        Archive
      </Link>
      <span className="navbar-user">{name}</span>
      <UserButton />
    </nav>
  );
}
