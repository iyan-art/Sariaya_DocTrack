import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  AreaChart, Area, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { fetchDashboardStats } from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';
import SurveyAnalyticsWidget from '../../components/admin/SurveyAnalyticsWidget';
import CitizenCommentsWidget from '../../components/admin/CitizenCommentsWidget';
import {
  Clock3Icon, FileTextIcon, BellIcon, TrendingUpIcon, TrendingDownIcon,
  BarChart3Icon, ShieldCheckIcon, StarIcon,
} from '../../components/Icons';

const EMPTY_STATS = {
  total: 0, pending: 0, completed: 0, released: 0, missing: 0,
  missing_rate_pct: 0, weekly_trend_pct: null,
  by_period: { daily: 0, weekly: 0, monthly: 0, yearly: 0 },
  by_type: [], top5_fastest: [], top5_slowest: [],
  top5_highest_rated: [], top5_lowest_rated: [],
  office_workload: [], avg_resolution_hours: null, avg_resolution_display: null,
  scan_timeline: [], access_logs_today: 0,
  bottlenecks: [], bottleneck_hours: 48,
};

const STATUS_COLORS = { pending: '#f59e0b', completed: '#22c55e', released: '#6366f1', missing: '#ef4444' };

function TrendBadge({ pct }) {
  if (pct === null || pct === undefined) {
    return <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">No prior data</span>;
  }
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-black ${up ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
      {up ? <TrendingUpIcon className="w-3.5 h-3.5" /> : <TrendingDownIcon className="w-3.5 h-3.5" />}
      {up ? '+' : ''}{pct}% this week
    </span>
  );
}

export default function AdminDashboard() {
  const { theme } = useTheme();
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  // Recharts renders raw SVG — these can't be themed via Tailwind's `dark:`
  // classes, so the grid/tick colors are picked in JS instead.
  const gridColor = theme === 'dark' ? '#1e293b' : '#f1f5f9';
  const tickColor = theme === 'dark' ? '#64748b' : '#94a3b8';

  useEffect(() => {
    fetchDashboardStats()
      .then((res) => setStats({ ...EMPTY_STATS, ...res.data }))
      .finally(() => setLoading(false));
  }, []);

  const maxTypeCount = Math.max(1, ...stats.by_type.map((t) => t.count));

  const statusPieData = [
    { name: 'Pending', key: 'pending', value: stats.pending },
    { name: 'Completed', key: 'completed', value: stats.completed },
    { name: 'Released', key: 'released', value: stats.released },
    { name: 'Missing', key: 'missing', value: stats.missing },
  ].filter((d) => d.value > 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Analytics &amp; KPI Dashboard</h1>
      <p className="text-slate-500 dark:text-slate-400 text-sm">Real-time statistics of all municipal documents.</p>

      {/* Top row — headline KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <div className="bg-blue-500 w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg dark:shadow-none">
              <FileTextIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total Documents Tracked</p>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{loading ? '—' : stats.total}</p>
            </div>
          </div>
          <div className="mt-3"><TrendBadge pct={stats.weekly_trend_pct} /></div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800 flex items-center gap-4">
          <div className="bg-indigo-500 w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg dark:shadow-none">
            <Clock3Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Avg. Processing Time</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {loading ? '—' : stats.avg_resolution_display || 'N/A'}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800 flex items-center gap-4">
          <div className="bg-red-500 w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg dark:shadow-none">
            <BellIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Missing / Flagged Rate</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{loading ? '—' : `${stats.missing_rate_pct}%`}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800 flex items-center gap-4">
          <div className="bg-slate-800 w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg dark:shadow-none">
            <ShieldCheckIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Security Logs Today</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{loading ? '—' : stats.access_logs_today}</p>
          </div>
        </div>
      </div>

      {/* Status breakdown strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-700 dark:text-slate-300' },
          { label: 'Pending', value: stats.pending, color: 'text-amber-600 dark:text-amber-400' },
          { label: 'Completed', value: stats.completed, color: 'text-green-600 dark:text-green-400' },
          { label: 'Released', value: stats.released, color: 'text-indigo-600 dark:text-indigo-400' },
          { label: 'Missing', value: stats.missing, color: 'text-red-600 dark:text-red-400' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 text-center">
            <p className={`text-2xl font-black ${s.color}`}>{loading ? '—' : s.value}</p>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Request Volume by Period */}
      <div className="mt-8 bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800">
        <h2 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-5">
          Request Volume by Period
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Today', value: stats.by_period.daily },
            { label: 'Last 7 Days', value: stats.by_period.weekly },
            { label: 'Last 30 Days', value: stats.by_period.monthly },
            { label: 'This Year', value: stats.by_period.yearly },
          ].map((card) => (
            <div key={card.label} className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/30 rounded-2xl p-5 text-center">
              <p className="text-3xl font-black text-blue-700 dark:text-blue-400">{loading ? '—' : card.value}</p>
              <p className="text-[10px] font-bold text-blue-500 dark:text-blue-400/70 uppercase tracking-widest mt-1">{card.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Charts row 1 — office workload bar + scan timeline area */}
      <div className="grid lg:grid-cols-2 gap-8 mt-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
            <BarChart3Icon className="w-4 h-4" /> Document Volume by Office
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Active documents currently sitting at each office.</p>
          {stats.office_workload.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-16">No active documents right now.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.office_workload}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="office" tick={{ fontSize: 11, fill: tickColor }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Active documents" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
            Processing Trend &amp; QR Scans
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">QR-verified movements per day, last {stats.scan_timeline.length || 14} days.</p>
          {stats.scan_timeline.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-16">No scan activity recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={stats.scan_timeline}>
                <defs>
                  <linearGradient id="scanFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: tickColor }} tickFormatter={(d) => d.slice(5)} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#scanFill)" name="QR scans" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts row 2 — status donut + demand by document type */}
      <div className="grid lg:grid-cols-2 gap-8 mt-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Document Status Breakdown</h2>
          {statusPieData.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-16">No documents yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusPieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                  {statusPieData.map((d) => <Cell key={d.key} fill={STATUS_COLORS[d.key]} />)}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: tickColor }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-5 flex items-center gap-2">
            <BarChart3Icon className="w-4 h-4" /> Demand by Document Type
          </h2>
          {!loading && stats.by_type.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">No requests yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.by_type.map((t) => (
                <div key={t.name}>
                  <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    <span>{t.name}</span>
                    <span>{t.count}</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full"
                      style={{ width: `${Math.max(4, (t.count / maxTypeCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottleneck / high-priority alert widget */}
      <div className="mt-8 bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800">
        <h2 className="text-sm font-black text-red-600 dark:text-red-400 uppercase tracking-widest mb-1 flex items-center gap-2">
          <BellIcon className="w-4 h-4" /> Bottleneck Alerts
        </h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          Active documents that have sat at their current office for more than {stats.bottleneck_hours}h.
        </p>
        {stats.bottlenecks.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">No overdue documents right now — nice.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400 dark:text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left py-2 pr-4">Tracking #</th>
                  <th className="text-left py-2 pr-4">Type</th>
                  <th className="text-left py-2 pr-4">Office</th>
                  <th className="text-left py-2 pr-4">Handler</th>
                  <th className="text-left py-2">Dwell Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {stats.bottlenecks.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2.5 pr-4 font-mono text-blue-600 dark:text-blue-400 text-xs">{b.tracking_number}</td>
                    <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300 font-medium">{b.document_type_name}</td>
                    <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-400">{b.current_office}</td>
                    <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-400">{b.handler || '—'}</td>
                    <td className="py-2.5">
                      <span className="inline-flex text-xs font-black text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-2.5 py-1 rounded-full">
                        {b.dwell_hours}h
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mt-8">
        <SurveyAnalyticsWidget />

        {/* Top 5 fastest / slowest offices */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Office Performance</h2>
            <Link to="/admin/heatmap" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
              View full heatmap →
            </Link>
          </div>

          <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-widest flex items-center gap-1.5 mb-3">
            <TrendingUpIcon className="w-3.5 h-3.5" /> Top 5 Fastest
          </p>
          <div className="space-y-2 mb-6">
            {stats.top5_fastest.length === 0 && !loading && (
              <p className="text-xs text-slate-400 dark:text-slate-500">Not enough data yet.</p>
            )}
            {stats.top5_fastest.map((o) => (
              <div key={o.office} className="flex justify-between items-center bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/30 rounded-xl px-4 py-2.5">
                <span className="text-sm font-semibold text-green-900 dark:text-green-400">{o.office_name || o.office}</span>
                <span className="text-sm font-black text-green-700 dark:text-green-400">{o.avg_hours}h</span>
              </div>
            ))}
          </div>

          <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest flex items-center gap-1.5 mb-3">
            <TrendingDownIcon className="w-3.5 h-3.5" /> Top 5 Slowest
          </p>
          <div className="space-y-2">
            {stats.top5_slowest.length === 0 && !loading && (
              <p className="text-xs text-slate-400 dark:text-slate-500">Not enough data yet.</p>
            )}
            {stats.top5_slowest.map((o) => (
              <div key={o.office} className="flex justify-between items-center bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/30 rounded-xl px-4 py-2.5">
                <span className="text-sm font-semibold text-red-900 dark:text-red-400">{o.office_name || o.office}</span>
                <span className="text-sm font-black text-red-700 dark:text-red-400">{o.avg_hours}h</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Citizen satisfaction — per-office KPI from post-release evaluations */}
      <div className="mt-8 bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm dark:shadow-none border border-slate-100 dark:border-slate-800">
        <h2 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
          <StarIcon className="w-4 h-4 text-amber-500" filled /> Citizen Satisfaction by Office
        </h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
          Average star rating citizens give each office when evaluating a released document — every office involved is rated separately.
        </p>

        <div className="grid sm:grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-widest flex items-center gap-1.5 mb-3">
              <TrendingUpIcon className="w-3.5 h-3.5" /> Top 5 Highest Rated
            </p>
            <div className="space-y-2">
              {stats.top5_highest_rated.length === 0 && !loading && (
                <p className="text-xs text-slate-400 dark:text-slate-500">No citizen evaluations yet.</p>
              )}
              {stats.top5_highest_rated.map((o) => (
                <div key={o.office} className="flex justify-between items-center bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/30 rounded-xl px-4 py-2.5">
                  <span className="text-sm font-semibold text-green-900 dark:text-green-400">{o.office_name || o.office}</span>
                  <span className="text-sm font-black text-green-700 dark:text-green-400 flex items-center gap-1">
                    <StarIcon className="w-3.5 h-3.5" filled /> {o.avg_rating}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest flex items-center gap-1.5 mb-3">
              <TrendingDownIcon className="w-3.5 h-3.5" /> Top 5 Lowest Rated
            </p>
            <div className="space-y-2">
              {stats.top5_lowest_rated.length === 0 && !loading && (
                <p className="text-xs text-slate-400 dark:text-slate-500">No citizen evaluations yet.</p>
              )}
              {stats.top5_lowest_rated.map((o) => (
                <div key={o.office} className="flex justify-between items-center bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/30 rounded-xl px-4 py-2.5">
                  <span className="text-sm font-semibold text-red-900 dark:text-red-400">{o.office_name || o.office}</span>
                  <span className="text-sm font-black text-red-700 dark:text-red-400 flex items-center gap-1">
                    <StarIcon className="w-3.5 h-3.5" filled /> {o.avg_rating}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <CitizenCommentsWidget />
    </div>
  );
}
