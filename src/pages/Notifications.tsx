import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "../lib/data";
import type { Notification } from "../lib/data";
import { describeNotification } from "../components/NotificationBell";
import { formatDateTime } from "../lib/formatDate";

export default function Notifications() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) { setItems([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetchNotifications(100)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load notifications."))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => { load(); }, [load]);

  const openNotification = async (notification: Notification) => {
    if (!notification.read_at) {
      await markNotificationRead(notification.id).catch(() => undefined);
      setItems((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item));
    }
    if (notification.issue_id) navigate(`/lucidblocks/issues/${notification.issue_id}`);
  };

  const markAll = async () => {
    await markAllNotificationsRead().catch(() => undefined);
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
  };

  if (loading) return <p className="load-state">Loading notifications</p>;
  if (error) return <div className="error-state">Couldn't load notifications. {error}</div>;

  const hasUnread = items.some((item) => !item.read_at);

  return (
    <>
      <div className="notifications-head">
        <h1>Notifications</h1>
        {hasUnread && <button className="btn btn-sm" type="button" onClick={markAll}>Mark all read</button>}
      </div>
      {!session ? (
        <p className="empty-state">Sign in to see your notifications.</p>
      ) : items.length === 0 ? (
        <p className="empty-state">You have no notifications yet.</p>
      ) : (
        <ul className="issue-list">
          {items.map((notification) => {
            const { label, detail } = describeNotification(notification);
            return (
              <li key={notification.id} className={`issue-row notification-page-row${notification.read_at ? "" : " notification-unread"}`}>
                <button className="notification-page-item" type="button" onClick={() => openNotification(notification)}>
                  <div className="issue-row-head">
                    <span className="chip">{label}</span>
                    <span className="issue-row-title">{detail}</span>
                  </div>
                  <div className="issue-row-meta">
                    <span>{formatDateTime(notification.created_at)}</span>
                    {!notification.read_at && <span className="notification-new">new</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
