const API_URL = import.meta.env.VITE_API_URL;

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function getTickets(token) {
  const res = await fetch(`${API_URL}/tickets/`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load tickets");
  return res.json();
}

export async function getTicket(token, id) {
  const res = await fetch(`${API_URL}/tickets/${id}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load ticket");
  return res.json();
}

export async function createTicket(token, data) {
  const res = await fetch(`${API_URL}/tickets/`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create ticket");
  return res.json();
}

export async function updateTicket(token, id, data) {
  const res = await fetch(`${API_URL}/tickets/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update ticket");
  return res.json();
}

export async function updateTicketStatus(token, id, status) {
  const res = await fetch(`${API_URL}/tickets/${id}/status`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update ticket status");
  return res.json();
}
