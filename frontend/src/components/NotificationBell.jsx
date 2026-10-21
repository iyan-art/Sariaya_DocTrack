import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchNotifications, fetchUnreadNotificationCount, markNotificationRead, markAllNotificationsRead,
} from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { BellIcon } from './Icons';

const VISIBLE_COUNT = 10;
// How often the badge count silently refreshes while the dropdown is
// closed — a lightweight poll rather than a websocket, matching this app's
// existing "focus/visibility re-check" pattern in AuthContext rather than
// adding new real-time infrastructure for one feature.
const POLL_MS = 30000;

const TYPE_STYLES = {
  document_forwarded: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30',
  document_returned: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30',
  expedite_request: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30',
  bottleneck_alert: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30',
  system_alert: 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/30',
};

function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The general in-app notification inbox — used by both Admin and Employee
 * (DashboardLayout mounts it for both roles). Distinct from
 * EmailNotificationBell (admin-only SLA-email activity log).
 */
export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const boxRef = useRef(null);

  const loadCount = useCallback(() => {
    fetchUnreadNotificationCount().then((res) => setUnreadCount(res.data.count)).catch(() => {});
  }, []);

  const loadList = useCallback(() => {
    setLoading(true);
    fetchNotifications(1)
      .then((res) => setNotifications((res.data.results || []).slice(0, VISIBLE_COUNT)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCount();
    const interval = setInterval(loadCount, POLL_MS);
    return () => clearInterval(interval);
  }, [loadCount]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  };

  const handleMarkRead = (e, notification) => {
    e.stopPropagation();
    markNotificationRead(notification.id, true).then(() => {
      setNotifications((list) => list.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    });
  };

  const handleMarkAllRead = () => {
    markAllNotificationsRead().then(() => {
      setNotifications((list) => list.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    });
  };

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markNotificationRead(notification.id, true).catch(() => {});
      setNotifications((list) => list.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);

    if (notification.related_document) {
      const base = user?.role === 'employee' ? '/employee/documents' : '/admin/document-request';
      navigate(`${base}?doc=${notification.related_document}`);
    } else {
      navigate('/admin/dashboard');
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <button onClick={handleToggle} className="relative text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
        <BellIcon className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[92vw] bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 z-20 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Notifications</p>
            <button
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Mark all as read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-700">
            {loading ? (
              <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-6">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-6">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors ${!n.is_read ? 'bg-blue-50/40 dark:bg-blue-500/10' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />}
                      <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${TYPE_STYLES[n.notification_type] || 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'}`}>
                        {n.notification_type_label}
                      </span>
                    </div>
                    {!n.is_read && (
                      <button
                        onClick={(e) => handleMarkRead(e, n)}
                        className="text-[10px] font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 shrink-0"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-1.5">{n.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    {n.document_tracking_number && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{n.document_tracking_number}</p>
                    )}
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 ml-auto">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
