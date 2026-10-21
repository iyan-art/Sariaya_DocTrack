import { useState, useEffect } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { fetchSurveyDetailedAnalytics } from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';
import { StarIcon } from '../Icons';

const BAR_COLOR = '#2563eb';
const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];

/**
 * Real-time analytics for one survey (AdminSurveyAnalytics). Aggregates
 * every response into Recharts visuals: a CSAT header, a rating-distribution
 * donut, a bar chart per rating / Likert / choice question, and the raw list
 * of open-ended comments. Opened as a modal from the Survey Manager.
 */
export default function AdminSurveyAnalytics({ surveyId, onClose }) {
  const { theme } = useTheme();
  const gridColor = theme === 'dark' ? '#1e293b' : '#e2e8f0';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchSurveyDetailedAnalytics(surveyId)
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, [surveyId]);

  // Donut = every rating question's 1-5 distribution, summed.
  const ratingDonut = (() => {
    if (!data) return [];
    const totals = [0, 0, 0, 0, 0];
    data.questions
      .filter((q) => q.question_type === 'rating' && q.distribution)
      .forEach((q) => q.distribution.forEach((d) => { totals[d.value - 1] += d.count; }));
    return totals.map((count, i) => ({ name: `${i + 1}★`, value: count }));
  })();
  const hasRatingData = ratingDonut.some((d) => d.value > 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl dark:shadow-none w-full max-w-3xl my-8 modal-pop-in flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Survey Analytics{data ? ` — ${data.title}` : ''}
          </h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-6 sm:p-8">
          {loading ? (
            <p className="text-slate-400 dark:text-slate-500 text-center py-16">Loading…</p>
          ) : !data ? (
            <p className="text-slate-400 dark:text-slate-500 text-center py-16">No analytics available.</p>
          ) : (
            <div className="space-y-8">
              {/* CSAT header */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Responses" value={data.response_count} />
                <Stat
                  label="Scan + landing"
                  value={(data.post_scan_response_count || 0) + (data.public_response_count || 0)}
                />
                <Stat
                  label="CSAT (avg ★)"
                  value={data.csat.average ?? '—'}
                  accent
                />
                <Stat
                  label="Satisfied (4–5★)"
                  value={data.csat.satisfied_percent != null ? `${data.csat.satisfied_percent}%` : '—'}
                  accent
                />
              </div>

              {/* Rating distribution donut */}
              {hasRatingData && (
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-2xl p-5">
                  <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                    Overall rating distribution
                  </p>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={ratingDonut} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {ratingDonut.map((entry, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Per-question breakdowns */}
              {data.questions.map((q) => (
                <div key={q.id} className="border border-slate-100 dark:border-slate-800 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">{q.text}</p>
                    <span className="shrink-0 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                      {q.answer_count} answer{q.answer_count === 1 ? '' : 's'}
                    </span>
                  </div>

                  {q.question_type === 'rating' && q.distribution && (
                    <>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                        <StarIcon className="w-4 h-4 text-amber-500" filled />
                        Average: <span className="font-bold text-slate-800 dark:text-slate-200">{q.average ?? '—'}</span>
                      </p>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={q.distribution.map((d) => ({ name: `${d.value}★`, count: d.count }))}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                          <XAxis dataKey="name" tick={{ fill: gridColor === '#e2e8f0' ? '#94a3b8' : '#64748b' }} />
                          <YAxis allowDecimals={false} tick={{ fill: gridColor === '#e2e8f0' ? '#94a3b8' : '#64748b' }} />
                          <Tooltip />
                          <Bar dataKey="count" fill={BAR_COLOR} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  )}

                  {(q.question_type === 'likert' || q.question_type === 'single' || q.question_type === 'multiple') && q.options && (
                    <>
                      {q.question_type === 'likert' && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                          Average score: <span className="font-bold text-slate-800 dark:text-slate-200">{q.average ?? '—'}</span>
                          {q.positive_percent != null && <> · Positive: <span className="font-bold text-slate-800 dark:text-slate-200">{q.positive_percent}%</span></>}
                        </p>
                      )}
                      <ResponsiveContainer width="100%" height={Math.max(160, q.options.length * 44)}>
                        <BarChart
                          layout="vertical"
                          data={q.options.map((o) => ({ name: o.label, count: o.count, percent: o.percent }))}
                          margin={{ left: 12, right: 24 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                          <XAxis type="number" allowDecimals={false} tick={{ fill: gridColor === '#e2e8f0' ? '#94a3b8' : '#64748b' }} />
                          <YAxis type="category" dataKey="name" width={120} tick={{ fill: gridColor === '#e2e8f0' ? '#94a3b8' : '#64748b' }} />
                          <Tooltip />
                          <Bar dataKey="count" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="mt-2 space-y-1">
                        {q.options.map((o) => (
                          <div key={o.label} className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>{o.label}</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{o.count} · {o.percent}%</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {q.question_type === 'text' && (
                    q.comments && q.comments.length > 0 ? (
                      <ul className="space-y-2">
                        {q.comments.map((c, i) => (
                          <li key={i} className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2">
                            "{c}"
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-400 dark:text-slate-500">No written responses yet.</p>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/30' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800'}`}>
      <p className={`text-2xl font-black ${accent ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">{label}</p>
    </div>
  );
}
