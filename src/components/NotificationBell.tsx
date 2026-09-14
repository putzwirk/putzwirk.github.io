import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchNotifications, fetchUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } from "../lib/data";
import type { Notification } from "../lib/data";
import { supabase } from "../lib/supabase";
import { formatDateTime } from "../lib/formatDate";

export function describeNotification(notification: Notification): { label: string; detail: string } {
  const preview = typeof notification.payload.preview === "string" ? notification.payload.preview : "";
  if (notification.kind === "moderation") {
    const status = typeof notification.payload.status === "string" ? notification.payload.status : "updated";
    return { label: "Status update", detail: preview || `Your issue was marked ${status}.` };
  }
  if (notification.kind === "reply") {
    return { label: "Reply", detail: preview || "Someone replied to your comment." };
  }
  return { label: "Comment", detail: preview || "New comment on your issue." };
}

export default function NotificationBell() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);

  useEffect(() => { openRef.current = open; }, [open]);

  const refreshCount = useCallback(() => {
    if (!session) { setUnread(0); return; }
    fetchUnreadNotificationCount().then(setUnread).catch(() => undefined);
  }, [session]);

  const refreshItems = useCallback(() => {
    if (!session) { setItems([]); return; }
    setLoading(true);
    fetchNotifications(12)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [session]);

  const refresh = useCallback(() => {
    refreshCount();
    if (openRef.current) refreshItems();
  }, [refreshCount, refreshItems]);

  useEffect(() => {
    refresh();
    if (!session) return;
    const onFocus = () => refresh();
    const onVisibility = () => { if (!document.hidden) refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session, refresh]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`notifications-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${session.user.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, refresh]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!session) return null;

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      refreshCount();
      refreshItems();
    }
  };

  const openNotification = async (notification: Notification) => {
    if (!notification.read_at) {
      await markNotificationRead(notification.id).catch(() => undefined);
      setItems((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item));
      setUnread((count) => Math.max(0, count - 1));
    }
    setOpen(false);
    if (notification.issue_id) navigate(`/lucidblocks/issues/${notification.issue_id}`);
  };

  const markAll = async () => {
    await markAllNotificationsRead().catch(() => undefined);
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    setUnread(0);
  };

  return (
    <div ref={menuRef} className={`notification-menu${open ? " open" : ""}`}>
      <button
        className="notification-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={toggleOpen}
      >
        <span aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg></span>
        {unread > 0 && <span className="notification-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      <div className="notification-popover" aria-hidden={!open}>
        <div className="notification-popover-head">
          <span>Notifications</span>
          {unread > 0 && <button className="btn btn-sm btn-ghost" type="button" onClick={markAll}>Mark all read</button>}
        </div>
        {loading ? (
          <p className="notification-empty">Loading</p>
        ) : items.length === 0 ? (
          <p className="notification-empty">Nothing yet.</p>
        ) : (
          <ul className="notification-popover-list">
            {items.map((notification) => {
              const { label, detail } = describeNotification(notification);
              return (
                <li key={notification.id}>
                  <button className={`notification-popover-item${notification.read_at ? "" : " unread"}`} type="button" onClick={() => openNotification(notification)}>
                    <span className="notification-popover-label">{label}</span>
                    <span className="notification-popover-detail">{detail}</span>
                    <span className="notification-popover-time">{formatDateTime(notification.created_at)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="notification-popover-foot">
          <Link to="/lucidblocks/notifications" onClick={() => setOpen(false)}>View all</Link>
          <Link to="/lucidblocks/my" onClick={() => setOpen(false)}>My reports</Link>
        </div>
      </div>
    </div>
  );
}
