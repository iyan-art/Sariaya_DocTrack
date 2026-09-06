import { useState, useEffect, useMemo } from 'react';
import { fetchOfficials } from '../../api/axios';
import OfficialDetailsModal from '../../components/admin/OfficialDetailsModal';

export default function Officials() {
  const [officials, setOfficials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');

  const loadOfficials = () => {
    setLoading(true);
    fetchOfficials()
      .then((res) => setOfficials(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOfficials();
  }, []);

  // Distinct position values currently in use, for the Position filter dropdown
  const positionOptions = useMemo(() => {
    const set = new Set(officials.map((o) => o.position).filter(Boolean));
    return Array.from(set).sort();
  }, [officials]);

  const filtered = officials.filter((o) => {
  if (roleFilter !== 'all' && o.role !== roleFilter) return false;
  if (positionFilter !== 'all' && o.position !== positionFilter) return false;
  const q = search.trim().toLowerCase();
  if (q && !o.full_name.toLowerCase().includes(q)) return false;
  return true;
    });

  const initials = (o) => `${o.first_name?.[0] || ''}${o.last_name?.[0] || ''}`.toUpperCase();

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Municipal Officials</h1>
      <p className="text-slate-500 mt-1">Directory of officials and department heads.</p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mt-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search officials…"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm w-full sm:w-60 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All roles</option>
          <option value="admin">Admin</option>
          <option value="employee">Employee</option>
        </select>

        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All positions</option>
          {positionOptions.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {loading ? (
          <p className="text-slate-400 col-span-full text-center py-10">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-400 col-span-full text-center py-10">No officials match this filter.</p>
        ) : (
          filtered.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelected(o)}
              className="bg-white rounded-xl border border-slate-100 p-5 flex items-center gap-4 text-left shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
            >
              <div className="h-12 w-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
                {initials(o)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">{o.full_name}</p>
                <p className="text-sm text-blue-600 truncate">{o.position}</p>
                <span className="inline-block mt-1 bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-md">
                  {o.office || '—'}
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      {selected && (
        <OfficialDetailsModal
          official={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => {
            setSelected(null);
            loadOfficials();
          }}
        />
      )}
    </div>
  );
}