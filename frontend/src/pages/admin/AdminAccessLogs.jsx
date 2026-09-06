import { useState, useEffect, useCallback } from 'react';
import { fetchAccessLogs } from '../../api/axios';
import { ShieldCheckIcon } from '../../components/Icons';

const ACTION_STYLES = {
  login: 'bg-green-50 text-green-700 border-green-200',
  logout: 'bg-slate-100 text-slate-600 border-slate-200',
  login_failed: 'bg-red-50 text-red-700 border-red-200',
  view_document: 'bg-blue-50 text-blue-700 border-blue-200',
  scan_qr: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  other: 'bg-slate-100 text-slate-600 border-slate-200',
};

const ACTION_FILTERS = [
  { value: '', label: 'All Actions' },
  { value: 'login', label: 'Login' },
  { value: 'login_failed', label: 'Login Failed' },
  { value: 'logout', label: 'Logout' },
  { value: 'view_document', label: 'Viewed Document' },
  { value: 'scan_qr', label: 'Scanned QR' },
];

export default function AdminAccessLogs() {
  const [logs, setLogs] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

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
        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100">
          <ShieldCheckIcon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Access Logs</h1>
          <p className="text-slate-500 text-sm">System-wide audit trail of logins and account activity.</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {ACTION_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleFilterChange(value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              actionFilter === value ? 'bg-white shadow text-blue-700' : 'text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 bg-white rounded-xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3">Timestamp</th>
              <th className="text-left px-5 py-3">User</th>
              <th className="text-left px-5 py-3">Action</th>
              <th className="text-left px-5 py-3">IP Address</th>
              <th className="text-left px-5 py-3">User Agent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="5" className="text-center py-8 text-slate-400">Loading…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan="5" className="text-center py-8 text-slate-400">No access log entries found.</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    {log.user_email ? (
                      <>
                        <p className="font-medium text-slate-800">{log.user_name}</p>
                        <p className="text-xs text-slate-400">{log.user_email}</p>
                      </>
                    ) : (
                      <span className="text-slate-400 italic">Unknown</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full border ${ACTION_STYLES[log.action] || ACTION_STYLES.other}`}>
                      {log.action_label}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{log.ip_address}</td>
                  <td className="px-5 py-3 text-xs text-slate-400 max-w-xs truncate" title={log.user_agent}>
                    {log.user_agent || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-slate-500">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
