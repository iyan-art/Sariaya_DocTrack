// The offline transaction queue: scans a staff member makes with no internet
// connection, kept in this browser's IndexedDB until they reach the server
// (see context/OfflineSyncContext.jsx, which uploads them).
//
// Only what the server needs to repeat the scan is stored (the scanned QR
// text or typed tracking number, the action, notes, and the scan time), and
// each entry is tied to the account that made it. No document details or
// citizen data are kept on the device.

const DB_NAME = 'sariaya-doctrack-offline';
const STORE = 'queue';

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'client_id' });
        store.createIndex('user_id', 'user_id');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
}

async function run(mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function newClientId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Queues one scan. action: 'receive' | 'release' | 'return_to_office'.
 * Returns the stored entry.
 */
export async function queueAction({ userId, qrPayload, trackingNumber, action, notes = '', scannedAt }) {
  const entry = {
    client_id: newClientId(),
    user_id: userId,
    qr_payload: qrPayload,
    tracking_number: trackingNumber,
    action,
    notes,
    scanned_at: scannedAt || new Date().toISOString(),
    status: 'pending', // 'pending' | 'rejected'
    detail: '',
  };
  await run('readwrite', (store) => store.put(entry));
  return entry;
}

/** This account's queued scans, oldest first. */
export async function listActions(userId) {
  const all = await run('readonly', (store) => store.index('user_id').getAll(userId));
  return (all || []).sort((a, b) => a.scanned_at.localeCompare(b.scanned_at));
}

export async function markRejected(clientId, detail) {
  await run('readwrite', (store) => {
    const request = store.get(clientId);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, status: 'rejected', detail });
    };
  });
}

export async function removeAction(clientId) {
  await run('readwrite', (store) => store.delete(clientId));
}

/** Reads the tracking number out of a scanned QR link, or a typed one. */
export function trackingNumberFromPayload(raw) {
  const text = (raw || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    return decodeURIComponent(url.pathname.replace(/\/+$/, '').split('/').pop() || '').toUpperCase();
  } catch {
    return text.toUpperCase();
  }
}
