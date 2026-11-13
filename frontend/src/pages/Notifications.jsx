import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BellIcon } from '../components/Icons';
import {
  DEFAULT_TYPE_STYLE, NOTIFICATIONS_CHANGED, TYPE_STYLES, announceNotificationsChanged, notificationTarget, timeAgo,
} from '../utils/notifications';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 20; // matches NotificationPagination on the backend
const POLL_MS = 30000;

/** Every notification the signed-in user has received, newest first. */
export default function Notifications() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ count: 0, results: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetchNotifications(page, unreadOnly)
      .then((res) => setData({ count: res.data.count, results: res.data.results }))
      .catch(() => showToast("Couldn't load your notifications.", 'error'))
      .finally(() => setLoading(false));
  }, [page, unreadOnly, showToast]);

  // Refresh while open, and as soon as the bell or another tab changes something.
  useEffect(() => {
    load();
    const interval = setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      clearInterval(interval);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, [load]);

  const hasUnread = data.results.some((n) => !n.is_read);

  const setRead = (notification, isRead) => {
    setData((d) => ({ ...d, results: d.results.map((n) => (n.id === notification.id ? { ...n, is_read: isRead } : n)) }));
    markNotificationRead(notification.id, isRead).then(announceNotificationsChanged).catch(() => {
      showToast("Couldn't update that notification.", 'error');
      load();
    });
  };

  const handleOpen = (notification) => {
    if (!notification.is_read) setRead(notification, true);
    if (notification.related_document) navigate(notificationTarget(user.role, notification));
  };

  const handleMarkAll = () => {
    markAllNotificationsRead()
      .then(() => {
        announceNotificationsChanged();
        showToast('All notifications marked as read.', 'success');
      })
      .catch(() => showToast("Couldn't mark them as read.", 'error'));
  };

  const switchFilter = (value) => {
    setUnreadOnly(value);
    setPage(1);
    setLoading(true);
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Notifications</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {user.role === 'citizen' ? 'Updates on your document requests.' : 'Alerts about documents and your office.'}
          </p>
        </div>
        <button
          onClick={handleMarkAll} disabled={!hasUnread && !unreadOnly}
          className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:opacity-40 py-2"
        >
          Mark all as read
        </button>
      </div>

      <div className="mt-5 inline-flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1" role="group" aria-label="Filter">
        {[[false, 'All'], [true, 'Unread']].map(([value, label]) => (
          <button
            key={label} onClick={() => switchFilter(value)} aria-pressed={unreadOnly === value}
            className={`px-4 py-2.5 sm:py-1.5 rounded-md text-sm font-medium transition-colors ${unreadOnly === value ? 'bg-white dark:bg-slate-700 shadow text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        {loading ? (
          <p className="text-center text-slate-400 dark:text-slate-500 py-12">Loading…</p>
        ) : data.results.length === 0 ? (
          <div className="text-center py-12 px-6">
            <BellIcon className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">{unreadOnly ? "You're all caught up." : 'No notifications yet.'}</p>
          </div>
        ) : (
          data.results.map((n) => (
            <article
              key={n.id}
              className={`flex gap-3 px-4 sm:px-5 py-4 ${n.is_read ? '' : 'bg-blue-50/50 dark:bg-blue-500/10'}`}
            >
              <span aria-hidden className={`mt-2 w-2 h-2 rounded-full shrink-0 ${n.is_read ? 'bg-transparent' : 'bg-blue-600'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full border ${TYPE_STYLES[n.notification_type] || DEFAULT_TYPE_STYLE}`}>
                    {n.notification_type_label}
                  </span>
                  <time dateTime={n.created_at} title={new Date(n.created_at).toLocaleString()} className="text-xs text-slate-400 dark:text-slate-500">
                    {timeAgo(n.created_at)}
                  </time>
                </div>
                <h2 className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{n.title}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 break-words">{n.message}</p>
                <div className="flex items-center gap-4 flex-wrap mt-2">
                  {n.document_tracking_number && (
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{n.document_tracking_number}</span>
                  )}
                  {n.related_document && (
                    <button onClick={() => handleOpen(n)} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline py-2 -my-2">
                      View document
                    </button>
                  )}
                  <button
                    onClick={() => setRead(n, !n.is_read)}
                    className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 py-2 -my-2"
                  >
                    {n.is_read ? 'Mark as unread' : 'Mark as read'}
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPageChange={setPage} />
    </div>
  );
}
