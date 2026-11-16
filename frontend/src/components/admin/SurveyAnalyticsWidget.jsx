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
    <div className="h-full bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Survey results</h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">Responses to the active citizen surveys</p>
        </div>
        <Link to="/admin/surveys" className="shrink-0 text-[13px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
          Manage surveys →
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">No active surveys yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((s) => (
            <div key={s.id} className="flex items-center justify-between bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/30 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-400">{s.title}</p>
                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400/80 uppercase tracking-widest mt-0.5">
                  {s.response_count} response{s.response_count === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {s.average_rating != null ? (
                  <>
                    <StarIcon className="w-4 h-4 text-amber-500" filled />
                    <span className="text-lg font-black text-amber-700 dark:text-amber-400">{s.average_rating}</span>
                  </>
                ) : (
                  <span className="text-xs text-slate-400 dark:text-slate-500">No ratings yet</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
