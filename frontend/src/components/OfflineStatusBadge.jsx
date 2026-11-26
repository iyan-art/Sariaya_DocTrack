import { useEffect, useRef, useState } from 'react';
import { useOfflineSync } from '../context/OfflineSyncContext';

const ACTION_LABELS = {
  receive: 'Receive',
  release: 'Send to next office',
  return_to_office: 'Return to previous office',
};

function formatTime(iso) {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * Connection status for staff, in the top bar: Online, Offline (with how
 * many scans are queued), or Syncing. Opens the list of queued scans, where
 * a scan the server did not accept shows why and can be retried or dismissed.
 */
export default function OfflineStatusBadge() {
  const sync = useOfflineSync();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!boxRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!sync?.isStaff) return null;
  const { online, syncing, queue, pendingCount, rejectedCount, syncNow, retry, dismiss } = sync;

  let tone = 'bg-green-500';
  let label = 'Online';
  if (syncing) {
    tone = 'bg-blue-500 animate-pulse';
    label = 'Syncing…';
  } else if (!online) {
    tone = 'bg-orange-500';
    label = pendingCount ? `Offline · ${pendingCount} queued` : 'Offline';
  } else if (pendingCount) {
    tone = 'bg-blue-500';
    label = `${pendingCount} to sync`;
  }
  const title = syncing
    ? 'Syncing pending updates…'
    : !online
      ? `Offline${pendingCount ? ` (queued ${pendingCount} action${pendingCount > 1 ? 's' : ''})` : ''}`
      : `Online${pendingCount ? ` (${pendingCount} waiting to sync)` : ''}`;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={title}
        aria-label={`Connection: ${title}${rejectedCount ? `, ${rejectedCount} not accepted` : ''}`}
        aria-expanded={open}
        className="h-9 flex items-center gap-1.5 px-2.5 rounded-full border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <span className={`w-2 h-2 rounded-full ${tone}`} />
        <span className="hidden sm:inline">{label}</span>
        {(!online || pendingCount > 0) && <span className="sm:hidden">{pendingCount || ''}</span>}
        {rejectedCount > 0 && (
          <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {rejectedCount}
          </span>
        )}
      </button>

      {open && (
        // Phones: full width under the top bar (anchored to the badge it would
        // run off the left edge). Larger screens: a dropdown under the badge.
        <div className="fixed left-4 right-4 top-[4.5rem] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-100 dark:border-slate-800 z-30 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {online ? 'Scans made offline upload automatically.' : 'Scans are saved on this device and upload when you are back online.'}
              </p>
            </div>
            {online && pendingCount > 0 && !syncing && (
              <button type="button" onClick={syncNow} className="shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Sync now
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800">
            {queue.length === 0 ? (
              <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-6">No offline scans waiting.</p>
            ) : queue.map((item) => (
              <div key={item.client_id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400 truncate">{item.tracking_number}</span>
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{formatTime(item.scanned_at)}</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.action] || item.action}</p>
                {item.status === 'rejected' ? (
                  <>
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">Not accepted: {item.detail}</p>
                    <div className="mt-1.5 flex gap-3 text-xs font-medium">
                      <button type="button" onClick={() => retry(item.client_id)} disabled={!online} className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50">Retry</button>
                      <button type="button" onClick={() => dismiss(item.client_id)} className="text-slate-500 dark:text-slate-400 hover:underline">Dismiss</button>
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">Waiting to sync</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
