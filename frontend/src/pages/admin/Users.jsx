import { useState, useEffect, useCallback } from 'react';
import { fetchUsers, toggleUserActive } from '../../api/axios';
import AddEmployeeModal from '../../components/admin/AddEmployeeModal';
import ResetPasswordModal from '../../components/admin/ResetPasswordModal';
import ConfirmModal from '../../components/ConfirmModal';
import { useToast } from '../../context/ToastContext';


export default function Users() {
  const [roleTab, setRoleTab] = useState('citizen'); // 'citizen' | 'employee'
  const [users, setUsers] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null); // user pending deactivation
  const [resetTarget, setResetTarget] = useState(null); // user pending password reset
  const { showToast } = useToast();
  const [search, setSearch] = useState('');

  const filteredUsers = users.filter((u) => {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
});


  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const loadUsers = useCallback(() => {
    setLoading(true);
    fetchUsers(roleTab, 'active', page)
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

  const handleDeactivateClick = (user) => {
  setConfirmTarget(user);
};

const handleConfirmDeactivate = async () => {
  try {
    await toggleUserActive(confirmTarget.id);
    showToast(`${confirmTarget.full_name} has been deactivated.`, 'success');
    loadUsers();
  } catch {
    showToast('Failed to deactivate user. Please try again.', 'error');
  } finally {
    setConfirmTarget(null);
  }
};

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Users</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage administrators, employees, and citizen accounts.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm"
        >
          + Add Employee
        </button>
      </div>

      <div className="mt-6 inline-flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {['citizen', 'employee'].map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              roleTab === tab ? 'bg-white dark:bg-slate-700 shadow text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full sm:w-80 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="mt-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase">
            <tr>
              {roleTab === 'employee' && <th className="text-left px-5 py-3">Employee ID</th>}
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-5 py-3">Email</th>
              <th className="text-left px-5 py-3">Role</th>
              {roleTab === 'employee' && <th className="text-left px-5 py-3">Office</th>}
              {roleTab === 'employee' && <th className="text-left px-5 py-3">Position</th>}
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-left px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan="8" className="text-center py-8 text-slate-400 dark:text-slate-500">Loading…</td></tr>
            ) : filteredUsers.length === 0 ? (
              <tr><td colSpan="8" className="text-center py-8 text-slate-400 dark:text-slate-500">No users found.</td></tr>
            ) : (
              filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  {roleTab === 'employee' && (
                    <td className="px-5 py-3 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{u.employee_id || '—'}</td>
                  )}
                  <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200">{u.full_name}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className="bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-medium px-2 py-1 rounded-md capitalize">
                      {u.role}
                    </span>
                  </td>
                  {roleTab === 'employee' && <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{u.office || '—'}</td>}
                  {roleTab === 'employee' && <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{u.position || '—'}</td>}
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium ${u.is_active ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'}`}>
                      ● {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setResetTarget(u)}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        Reset Password
                      </button>
                      <button
                        onClick={() => handleDeactivateClick(u)}
                        className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        Deactivate
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-slate-500 dark:text-slate-400">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddEmployeeModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            // Refresh the table in the background — do NOT close the modal
            // here. It stays open on its own to show the one-time temporary
            // password/employee ID, and closes itself via onClose ("Done").
            setRoleTab('employee');
            setPage(1);
            loadUsers();
          }}
        />
      )}
      {confirmTarget && (
      <ConfirmModal
        title="Deactivate user?"
        message={`${confirmTarget.full_name} will be moved to Archive and won't be able to log in until reactivated.`}
        confirmLabel="Deactivate"
        confirmColor="bg-red-600 hover:bg-red-700"
        onCancel={() => setConfirmTarget(null)}
        onConfirm={handleConfirmDeactivate}
      />
    )}
      {resetTarget && (
        <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
      )}
    </div>
  );
}