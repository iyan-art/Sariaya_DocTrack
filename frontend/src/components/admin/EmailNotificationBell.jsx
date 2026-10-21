import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchEmailNotifications, runSlaScanNow } from '../../api/axios';
import { BellIcon } from '../Icons';

// Renamed from NotificationBell.jsx to make room for the general in-app
// Notification system's own bell (components/NotificationBell.jsx) — this
// one is specifically an SLA EMAIL activity log, distinct from that.
//
// How many recent notifications the dropdown shows — a quick activity feed,
// not a substitute for a full audit page (there isn't one anymore; this
// icon IS the admin's only access point for email notification activity).
const VISIBLE_COUNT = 8;

const TYPE_STYLES = {
  overdue_warning: 'bg-red-50 text-red-700 border-red-200',
  due_soon: 'bg-amber-50 text-amber-700 border-amber-200',
  ready_for_release: 'bg-blue-50 text-blue-700 border-blue-200',
};

// Per-browser "have I seen this yet" marker, purely a client-side badge
// convenience — not an audit concept, so it doesn't need a backend model.
const LAST_SEEN_KEY = 'admin_email_notifications_last_seen';

function getLastSeen() {
  try {
    return localStorage.getItem(LAST_SEEN_KEY) || '';
  } catch {
    return '';
  }
}

function setLastSeen(iso) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, iso);
  } catch {
    // Private browsing / storage disabled — badge just won't persist across reloads.
  }
}

export default function EmailNotificationBell() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const boxRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchEmailNotifications(1)
      .then((res) => {
        const results = res.data.results || [];
        setLogs(results.slice(0, VISIBLE_COUNT));
        const lastSeen = getLastSeen();
        setUnseenCount(lastSeen ? results.filter((r) => r.sent_at > lastSeen).length : results.length);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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
    if (next) {
      // Opening it is what "reads" the activity — clear the badge from
      // this point forward, next load() will only count anything newer.
      if (logs.length > 0) setLastSeen(logs[0].sent_at);
      setUnseenCount(0);
    }
  };

  const handleRunScan = () => {
    setScanning(true);
    runSlaScanNow()
      .then(() => load())
      .catch(() => {/* surfaced inline via the list simply not changing; scan failures are rare/admin-only */})
      .finally(() => setScanning(false));
  };

  return (
    <div ref={boxRef} className="relative">
      <button onClick={handleToggle} className="relative text-slate-500 hover:text-slate-700">
        <BellIcon className="w-5 h-5" />
        {unseenCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unseenCount > 9 ? '9+' : unseenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[92vw] bg-white rounded-xl shadow-lg border border-slate-100 z-20 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">Email Notifications</p>
            <button
              onClick={handleRunScan}
              disabled={scanning}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              {scanning ? 'Scanning…' : 'Run Scan Now'}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {loading ? (
              <p className="text-center text-sm text-slate-400 py-6">Loading…</p>
            ) : logs.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-6">No email notifications yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full border ${TYPE_STYLES[log.notification_type] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {log.notification_type_label}
                    </span>
                    {log.status === 'sent' ? (
                      <span className="text-[10px] font-bold text-green-700">Sent</span>
                    ) : (
                      <span className="text-[10px] font-bold text-red-700" title={log.error_message}>Failed</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 mt-1.5 truncate" title={log.subject}>{log.subject}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-400 font-mono">
                      {log.document_tracking_number || '—'} → {log.recipient_email}
                    </p>
                    <p className="text-[11px] text-slate-400 whitespace-nowrap ml-2">
                      {new Date(log.sent_at).toLocaleString()}
                    </p>
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
