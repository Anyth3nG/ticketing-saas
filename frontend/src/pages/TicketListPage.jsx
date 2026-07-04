import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Link } from "react-router-dom";
import { getTickets } from "../api/tickets";
import { getCurrentUser } from "../api/users";
import TicketCard from "../components/TicketCard";

export default function TicketListPage() {
  const { getToken } = useAuth();
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      try {
        const token = await getToken();
        const [currentUser, ticketList] = await Promise.all([
          getCurrentUser(token),
          getTickets(token),
        ]);
        if (cancelled) return;
        setUser(currentUser);
        setTickets(ticketList);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  if (status === "loading") return <p>Loading tickets...</p>;
  if (status === "error") return <p>Failed to load tickets.</p>;

  return (
    <div>
      <div className="page-header">
        <h1>Tickets</h1>
        {user?.role === "manager" && (
          <Link className="btn" to="/tickets/new">
            Create Ticket
          </Link>
        )}
      </div>
      {tickets.length === 0 && <p>No tickets to show.</p>}
      <div className="ticket-list">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </div>
    </div>
  );
}
