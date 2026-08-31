import { API_URL } from "./config";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function getMeetings(token) {
  const res = await fetch(`${API_URL}/meetings/`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const error = new Error("Failed to load meetings");
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function createMeeting(token, payload) {
  const res = await fetch(`${API_URL}/meetings/`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = new Error("Failed to create meeting");
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function updateMeeting(token, meetingId, payload) {
  const res = await fetch(`${API_URL}/meetings/${meetingId}`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = new Error("Failed to update meeting");
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function deleteMeeting(token, meetingId) {
  const res = await fetch(`${API_URL}/meetings/${meetingId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const error = new Error("Failed to delete meeting");
    error.status = res.status;
    throw error;
  }
}
