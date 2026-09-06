import { useState, useEffect, useCallback } from 'react';
import { fetchUsers, toggleUserActive } from '../../api/axios';
import ConfirmModal from '../../components/ConfirmModal';
import { useToast } from '../../context/ToastContext';

export default function Archive() {
  const [roleTab, setRoleTab] = useState('citizen');
  const [users, setUsers] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const { showToast } = useToast();

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const loadUsers = useCallback(() => {
    setLoading(true);
    fetchUsers(roleTab, 'inactive', page)
      .then((res) => {
        setUsers(res.data.results);
        setCount(res.data.count);
      })
      .finally(() => setLoading(false));
  }, [roleTab, page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleTabChange = (tab) => {
    setRoleTab(tab);
    setPage(1);
  };

  const handleReactivateClick = (user) => {
    setConfirmTarget(user);
  };

  const handleConfirmReactivate = async () => {
    try {
      await toggleUserActive(confirmTarget.id);
      showToast(`${confirmTarget.full_name} has been reactivated.`, 'success');
      loadUsers();
    } catch {
      showToast('Failed to reactivate user. Please try again.', 'error');
    } finally {
      setConfirmTarget(null);
    }
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Archive</h1>
        <p className="text-slate-500 mt-1">Deactivated administrator, employee, and citizen accounts.</p>
      </div>

      <div className="mt-6 inline-flex bg-slate-100 rounded-lg p-1">
        {['citizen', 'employee'].map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              roleTab === tab ? 'bg-white shadow text-blue-700' : 'text-slate-500'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mt-5 bg-white rounded-xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-5 py-3">Email</th>
              <th className="text-left px-5 py-3">Role</th>
              {roleTab === 'employee' && <th className="text-left px-5 py-3">Office</th>}
              {roleTab === 'employee' && <th className="text-left px-5 py-3">Position</th>}
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-left px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="7" className="text-center py-8 text-slate-400">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan="7" className="text-center py-8 text-slate-400">No archived accounts.</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3 font-medium text-slate-800">{u.full_name}</td>
                  <td className="px-5 py-3 text-slate-500">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-1 rounded-md capitalize">
                      {u.role}
                    </span>
                  </td>
                  {roleTab === 'employee' && <td className="px-5 py-3 text-slate-600">{u.office || '—'}</td>}
                  {roleTab === 'employee' && <td className="px-5 py-3 text-slate-600">{u.position || '—'}</td>}
                  <td className="px-5 py-3">
                    <span className="text-xs font-medium text-slate-400">● Inactive</span>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => handleReactivateClick(u)}
                      className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      Reactivate
                    </button>
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

      {confirmTarget && (
        <ConfirmModal
          title="Reactivate user?"
          message={`${confirmTarget.full_name} will be restored to Users and will be able to log in again.`}
          confirmLabel="Reactivate"
          confirmColor="bg-green-600 hover:bg-green-700"
          onCancel={() => setConfirmTarget(null)}
          onConfirm={handleConfirmReactivate}
        />
      )}
    </div>
  );
}