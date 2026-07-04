import { useUser, UserButton } from "@clerk/react";

export default function Navbar() {
  const { user } = useUser();
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  return (
    <nav className="navbar">
      <span className="navbar-title">Ticketing System</span>
      <span className="navbar-user">{name}</span>
      <UserButton />
    </nav>
  );
}
