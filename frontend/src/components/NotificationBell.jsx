import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/notifications";
import { BellIcon } from "./icons";
import { formatDateTime } from "../utils/date";

export default function NotificationBell({ role }) {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const list = await getNotifications(token);
      setNotifications(list);
    } catch {
      // notifications are supplementary -- fail silently rather than
      // interrupting the dashboard with an error state
    }
  }, [getToken]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const unreadCount = notifications.length;

  async function handleSelect(notification) {
    setOpen(false);
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    try {
      const token = await getToken();
      await markNotificationRead(token, notification.id);
    } catch {
      // best-effort
    }
    const base = role === "manager" ? "/manager" : "/worker";
    navigate(`${base}?ticket=${notification.ticket_id}`);
  }

  async function handleMarkAllRead() {
    setNotifications([]);
    try {
      const token = await getToken();
      await markAllNotificationsRead(token);
    } catch {
      // best-effort
    }
  }

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        title="Notifications"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 && (
            <p className="notification-empty">No notifications yet.</p>
          )}
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              className="notification-item"
              onClick={() => handleSelect(n)}
            >
              <span className="notification-item-title">
                <span className="ticket-number">#{n.ticket_id}</span> {n.ticket_title}
              </span>
              <span className="notification-item-preview">
                {n.comment.user.name}: {n.comment.content}
              </span>
              <span className="notification-item-time">{formatDateTime(n.created_at)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
