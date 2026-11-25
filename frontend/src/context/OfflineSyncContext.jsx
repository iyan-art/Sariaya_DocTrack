import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { syncOfflineActions } from '../api/axios';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { listActions, markRejected, queueAction, removeAction } from '../utils/offlineStore';

const OfflineSyncContext = createContext(null);
const STAFF_ROLES = ['admin', 'employee'];
const RETRY_MS = 30000;
const BATCH = 50;

/**
 * Connection status and the offline scan queue for staff accounts.
 *
 * Uploads the queue (POST /documents/offline-sync/) whenever it can: when
 * the device comes back online, when the app opens or regains focus, when
 * the service worker's background sync fires, and every 30 seconds while
 * anything is waiting. Applied scans leave the queue; scans the server
 * rejects stay, with the reason, until the staff member dismisses them.
 */
export function OfflineSyncProvider({ children }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const isStaff = Boolean(user && STAFF_ROLES.includes(user.role));
  const userId = user?.id;

  const refresh = useCallback(async () => {
    if (!isStaff) {
      setQueue([]);
      return [];
    }
    try {
      const items = await listActions(userId);
      setQueue(items);
      return items;
    } catch {
      return [];
    }
  }, [isStaff, userId]);

  const syncNow = useCallback(async () => {
    if (!isStaff || syncingRef.current || !navigator.onLine) return;
    const pending = (await refresh()).filter((item) => item.status === 'pending');
    if (!pending.length) return;
    syncingRef.current = true;
    setSyncing(true);
    let applied = 0;
    let rejected = 0;
    try {
      for (let i = 0; i < pending.length; i += BATCH) {
        const batch = pending.slice(i, i + BATCH);
        const res = await syncOfflineActions(batch.map(({ client_id, qr_payload, action, notes, scanned_at }) => (
          { client_id, qr_payload, action, notes, scanned_at }
        )));
        for (const result of res.data.results || []) {
          if (result.outcome === 'applied') {
            await removeAction(result.client_id);
            applied += 1;
          } else {
            await markRejected(result.client_id, result.detail || 'The server did not accept this scan.');
            rejected += 1;
          }
        }
      }
    } catch {
      // Still no connection, or the server is unreachable: keep the queue
      // as it is and try again later.
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refresh();
    }
    if (applied) showToast(`${applied} offline scan${applied > 1 ? 's' : ''} synced.`, 'success');
    if (rejected) showToast(`${rejected} offline scan${rejected > 1 ? 's were' : ' was'} not accepted. Open the status badge to see why.`, 'error');
  }, [isStaff, refresh, showToast]);

  const addToQueue = useCallback(async (scan) => {
    const entry = await queueAction({ ...scan, userId });
    await refresh();
    // Lets the browser sync even if this page is in the background.
    navigator.serviceWorker?.ready
      .then((registration) => registration.sync?.register('sync-offline-queue'))
      .catch(() => {});
    return entry;
  }, [refresh, userId]);

  const dismiss = useCallback(async (clientId) => {
    await removeAction(clientId);
    await refresh();
  }, [refresh]);

  const retry = useCallback(async (clientId) => {
    const item = (await listActions(userId)).find((entry) => entry.client_id === clientId);
    if (!item) return;
    // A retry is a new attempt (the server remembers the old client_id's
    // answer), still dated when the scan was really made.
    await removeAction(clientId);
    await queueAction({
      userId, qrPayload: item.qr_payload, trackingNumber: item.tracking_number,
      action: item.action, notes: item.notes, scannedAt: item.scanned_at,
    });
    await syncNow();
  }, [syncNow, userId]);

  useEffect(() => {
    const goOnline = () => { setOnline(true); syncNow(); };
    const goOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === 'visible') syncNow(); };
    const onWorkerMessage = (event) => { if (event.data?.type === 'sync-offline-queue') syncNow(); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    const startup = setTimeout(syncNow, 0); // anything left from an earlier session
    return () => {
      clearTimeout(startup);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
    };
  }, [syncNow]);

  const pendingCount = queue.filter((item) => item.status === 'pending').length;

  useEffect(() => {
    if (!pendingCount) return undefined;
    const timer = setInterval(syncNow, RETRY_MS);
    return () => clearInterval(timer);
  }, [pendingCount, syncNow]);

  return (
    <OfflineSyncContext.Provider value={{
      isStaff, online, syncing, queue, pendingCount,
      rejectedCount: queue.length - pendingCount,
      addToQueue, syncNow, dismiss, retry,
    }}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  return useContext(OfflineSyncContext);
}
