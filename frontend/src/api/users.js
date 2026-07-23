const API_URL = import.meta.env.VITE_API_URL;

export async function getCurrentUser(token) {
  const res = await fetch(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load current user");
  return res.json();
}

export async function getUsers(token) {
  const res = await fetch(`${API_URL}/users/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load users");
  return res.json();
}

export async function updateDashboardLayout(token, workerOrder) {
  const res = await fetch(`${API_URL}/users/me/dashboard-layout`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ worker_order: workerOrder }),
  });
  if (!res.ok) throw new Error("Failed to save dashboard layout");
  return res.json();
}
