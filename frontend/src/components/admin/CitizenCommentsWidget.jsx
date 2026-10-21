import { useState, useEffect } from 'react';
import { fetchSurveyComments } from '../../api/axios';
import { StarIcon } from '../Icons';

function StarRow({ value }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} className="w-3.5 h-3.5 text-amber-400" filled={n <= value} />
      ))}
    </span>
  );
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Dashboard card: recent citizen comments/suggestions, alongside the
 * ratings from that same survey response for context. Backed by
 * SurveyCommentsView (admin, all offices) or MySurveyCommentsView
 * (employee, own office only — pass fetchComments={fetchMyOfficeComments}),
 * neither of which ever returns the respondent, the document, or its
 * tracking number — "Anonymous Citizen" here isn't a UI label hiding a name
 * the frontend has; the frontend genuinely never receives one. Sits beside
 * (not replacing) SurveyAnalyticsWidget/the employee rating card, which
 * stay the aggregate-only count/average views.
 */
export default function CitizenCommentsWidget({
  fetchComments = fetchSurveyComments,
  subtitle = "Written feedback from citizen evaluations — anonymous, so staff can see what's being said without seeing who said it.",
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchComments()
      .then((res) => setRows(res.data.results || []))
      .finally(() => setLoading(false));
  }, [fetchComments]);

  return (
    <div className="mt-8 bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800">
      <h2 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
        <StarIcon className="w-4 h-4 text-amber-500" filled /> Citizen Comments &amp; Suggestions
      </h2>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">{subtitle}</p>

      {loading ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">No written comments yet.</p>
      ) : (
        <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-1">
          {rows.map((row) => (
            <div key={row.id} className="border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Anonymous Citizen</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {row.office_name || 'Unknown office'}
                    {row.document_type_name && <span> · {row.document_type_name}</span>}
                  </p>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">{formatDate(row.submitted_at)}</p>
              </div>

              {row.ratings.length > 0 && (
                <div className="mt-3 space-y-1">
                  {row.ratings.map((r, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-500 dark:text-slate-400 break-words">{r.question}</span>
                      <StarRow value={r.value} />
                    </div>
                  ))}
                </div>
              )}

              <p className="text-sm text-slate-700 dark:text-slate-300 mt-3 break-words">"{row.comment}"</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
