import { useState, useEffect, useCallback } from 'react';
import { fetchAccessLogs } from '../../api/axios';
import { ShieldCheckIcon } from '../../components/Icons';
import Pagination from '../../components/Pagination';

const ACTION_STYLES = {
  login: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/30',
  logout: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  login_failed: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30',
  view_document: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30',
  scan_qr: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30',
  delete_document: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30',
  record_deleted: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30',
  delete_blocked: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30',
  other: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
};

const ACTION_FILTERS = [
  { value: '', label: 'All Actions' },
  { value: 'login', label: 'Login' },
  { value: 'login_failed', label: 'Login Failed' },
  { value: 'logout', label: 'Logout' },
  { value: 'view_document', label: 'Viewed Document' },
  { value: 'scan_qr', label: 'Scanned QR' },
  { value: 'delete_document', label: 'Deleted Document' },
  { value: 'record_deleted', label: 'Deleted Record' },
  { value: 'delete_blocked', label: 'Deletion Blocked' },
  { value: 'profile_updated', label: 'Profile Updated' },
  { value: 'password_changed', label: 'Password Changed' },
];

export default function AdminAccessLogs() {
  const [logs, setLogs] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const pageSize = 20;

  const loadLogs = useCallback(() => {
    setLoading(true);
    fetchAccessLogs(page, actionFilter)
      .then((res) => {
        setLogs(res.data.results);
        setCount(res.data.count);
      })
      .finally(() => setLoading(false));
  }, [page, actionFilter]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleFilterChange = (value) => {
    setActionFilter(value);
    setPage(1);
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 dark:shadow-none">
          <ShieldCheckIcon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Access Logs</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">System-wide audit trail of logins and account activity.</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
        {ACTION_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleFilterChange(value)}
            className={`px-4 py-2.5 sm:py-1.5 rounded-md text-sm font-medium transition-colors ${
              actionFilter === value ? 'bg-white dark:bg-slate-700 shadow text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-x-auto">
        <table className="responsive-table w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3">Timestamp</th>
              <th className="text-left px-5 py-3">User</th>
              <th className="text-left px-5 py-3">Action</th>
              <th className="text-left px-5 py-3">Detail</th>
              <th className="text-left px-5 py-3">IP Address</th>
              <th className="text-left px-5 py-3">User Agent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan="6" className="text-center py-8 text-slate-400 dark:text-slate-500">Loading…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-8 text-slate-400 dark:text-slate-500">No access log entries found.</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td data-label="Timestamp" className="px-5 py-3 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td data-label="User" className="px-5 py-3">
                    {log.user_email ? (
                      <>
                        <p className="font-medium text-slate-800 dark:text-slate-200">{log.user_name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{log.user_email}</p>
                      </>
                    ) : log.attempted_email ? (
                      <>
                        <p className="font-medium text-slate-500 dark:text-slate-400 italic">No matching account</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 break-all">{log.attempted_email}</p>
                      </>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500 italic">Unknown</span>
                    )}
                  </td>
                  <td data-label="Action" className="px-5 py-3">
                    <span className={`inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full border ${ACTION_STYLES[log.action] || ACTION_STYLES.other}`}>
                      {log.action_label}
                    </span>
                  </td>
                  <td data-label="Detail" className="px-5 py-3 text-xs text-slate-600 dark:text-slate-400">{log.detail || '—'}</td>
                  <td data-label="IP Address" className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{log.ip_address}</td>
                  <td data-label="User Agent" className="px-5 py-3 text-xs text-slate-400 dark:text-slate-500 max-w-xs truncate" title={log.user_agent}>
                    {log.user_agent || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={pageSize} count={count} onPageChange={setPage} />
    </div>
  );
}
