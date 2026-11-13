import { useState, useEffect, useCallback } from 'react';
import { fetchUsers, toggleUserActive } from '../../api/axios';
import ConfirmModal from '../../components/ConfirmModal';
import { useToast } from '../../context/ToastContext';
import Pagination from '../../components/Pagination';

export default function Archive() {
  const [roleTab, setRoleTab] = useState('citizen');
  const [users, setUsers] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const { showToast } = useToast();

  const pageSize = 10;

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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Archive</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Deactivated administrator, employee, and citizen accounts.</p>
      </div>

      <div className="mt-6 inline-flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {['citizen', 'employee'].map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-4 py-2.5 sm:py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              roleTab === tab ? 'bg-white dark:bg-slate-700 shadow text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mt-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-x-auto">
        <table className="responsive-table w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-5 py-3">Email</th>
              <th className="text-left px-5 py-3">Role</th>
              {roleTab === 'employee' && <th className="text-left px-5 py-3">Office</th>}
              {roleTab === 'employee' && <th className="text-left px-5 py-3">Position</th>}
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-center px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan="7" className="text-center py-8 text-slate-400 dark:text-slate-500">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan="7" className="text-center py-8 text-slate-400 dark:text-slate-500">No archived accounts.</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td data-label="Name" className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200">{u.full_name}</td>
                  <td data-label="Email" className="px-5 py-3 text-slate-500 dark:text-slate-400">{u.email}</td>
                  <td data-label="Role" className="px-5 py-3">
                    <span className="bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-medium px-2 py-1 rounded-md capitalize">
                      {u.role}
                    </span>
                  </td>
                  {roleTab === 'employee' && <td data-label="Office" className="px-5 py-3 text-slate-600 dark:text-slate-400">{u.office || '—'}</td>}
                  {roleTab === 'employee' && <td data-label="Position" className="px-5 py-3 text-slate-600 dark:text-slate-400">{u.position || '—'}</td>}
                  <td data-label="Status" className="px-5 py-3">
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">● Inactive</span>
                  </td>
                  <td className="rt-actions px-5 py-3 text-center">
                    <button
                      onClick={() => handleReactivateClick(u)}
                      className="text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20 rounded-lg px-3 py-1.5 transition-colors"
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

      <Pagination page={page} pageSize={pageSize} count={count} onPageChange={setPage} />

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