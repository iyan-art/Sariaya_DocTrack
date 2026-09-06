import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchSurveyAnalytics } from '../../api/axios';
import { StarIcon } from '../Icons';

/**
 * Admin Dashboard widget: total responses + average rating per active
 * survey. Links out to the full Survey Manager for editing.
 */
export default function SurveyAnalyticsWidget() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSurveyAnalytics()
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <StarIcon className="w-4 h-4" filled /> Citizen Survey Results
        </h2>
        <Link to="/admin/surveys" className="text-xs font-bold text-blue-600 hover:text-blue-700">
          Manage surveys →
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No active surveys yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((s) => (
            <div key={s.id} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-amber-900">{s.title}</p>
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mt-0.5">
                  {s.response_count} response{s.response_count === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {s.average_rating != null ? (
                  <>
                    <StarIcon className="w-4 h-4 text-amber-500" filled />
                    <span className="text-lg font-black text-amber-700">{s.average_rating}</span>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">No ratings yet</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
