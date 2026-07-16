const API_URL = import.meta.env.VITE_API_URL;

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function getNotifications(token) {
  const res = await fetch(`${API_URL}/notifications/`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load notifications");
  return res.json();
}

export async function markNotificationRead(token, id) {
  const res = await fetch(`${API_URL}/notifications/${id}/read`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to mark notification read");
  return res.json();
}

export async function markAllNotificationsRead(token) {
  const res = await fetch(`${API_URL}/notifications/read-all`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to mark notifications read");
}
