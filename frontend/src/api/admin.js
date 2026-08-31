import { API_URL } from "./config";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function getYuliaWork(token) {
  const res = await fetch(`${API_URL}/admin/yulia-work`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const error = new Error("Failed to load work page");
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function getYuliaTicketComments(token, ticketId) {
  const res = await fetch(
    `${API_URL}/admin/yulia-work/tickets/${ticketId}/comments`,
    { headers: authHeaders(token) }
  );
  if (!res.ok) {
    const error = new Error("Failed to load comments");
    error.status = res.status;
    throw error;
  }
  return res.json();
}
