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
