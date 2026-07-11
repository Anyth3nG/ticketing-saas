import { useUser, UserButton } from "@clerk/react";
import { Link } from "react-router-dom";

export default function Navbar() {
  const { user } = useUser();
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  return (
    <nav className="navbar">
      <span className="navbar-title">Ticketing System</span>
      <Link className="navbar-link" to="/">
        Dashboard
      </Link>
      <Link className="navbar-link" to="/archive">
        Archive
      </Link>
      <span className="navbar-user">{name}</span>
      <UserButton />
    </nav>
  );
}
