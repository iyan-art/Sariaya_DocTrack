import { slaUsage } from '../../utils/slaUsage';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';
import { fetchDashboardStats } from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';
import SurveyAnalyticsWidget from '../../components/admin/SurveyAnalyticsWidget';
import CitizenCommentsWidget from '../../components/admin/CitizenCommentsWidget';
import { formatHoursMinutes } from '../../utils/duration';
import {
  Clock3Icon, FileTextIcon, BellIcon, TrendingUpIcon, TrendingDownIcon,
  ShieldCheckIcon, StarIcon,
} from '../../components/Icons';

const EMPTY_STATS = {
  total: 0, pending: 0, completed: 0, released: 0, missing: 0, overdue: 0,
  missing_rate_pct: 0, weekly_trend_pct: null,
  by_period: { daily: 0, weekly: 0, monthly: 0, yearly: 0 },
  by_type: [], top5_fastest: [], top5_slowest: [],
  satisfaction: { avg_rating: null, rating_count: 0 },
  office_workload: [], avg_resolution_hours: null, avg_resolution_display: null,
  scan_timeline: [], access_logs_today: 0,
  bottlenecks: [],
};

const STATUS = [
  { key: 'pending', label: 'Pending', color: '#f59e0b' },
  { key: 'completed', label: 'Completed', color: '#22c55e' },
  { key: 'released', label: 'Released', color: '#6366f1' },
  { key: 'missing', label: 'Reported Missing', color: '#ef4444' },
];

// One look for every panel on the page: same surface, border, radius,
// padding and heading, so the grid reads as one designed system.
const CARD = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800';

function Panel({ title, subtitle, action, className = '', children }) {
  return (
    <section className={`${CARD} p-5 sm:p-6 min-w-0 ${className}`}>
      <header className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {subtitle && <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function PanelLink({ to, children }) {
  return (
    <Link to={to} className="shrink-0 text-[13px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
      {children}
    </Link>
  );
}

function Kpi({ label, value, note, icon: Icon, tone }) {
  return (
    <div className={`${CARD} p-5 flex flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
          <Icon className="w-[18px] h-[18px]" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">{value}</p>
      <div className="mt-auto pt-3 text-xs text-slate-500 dark:text-slate-400">{note}</div>
    </div>
  );
}

function TrendNote({ pct }) {
  if (pct === null || pct === undefined) return <span>No requests in the previous week to compare</span>;
  const up = pct >= 0;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${up ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
        {up ? <TrendingUpIcon className="w-3.5 h-3.5" /> : <TrendingDownIcon className="w-3.5 h-3.5" />}
        {up ? '+' : ''}{pct}%
      </span>
      new requests vs last week
    </span>
  );
}

function OfficeRanking({ title, icon: Icon, tone, rows, loading }) {
  return (
    <div>
      <p className={`text-[13px] font-semibold flex items-center gap-1.5 mb-2 ${tone}`}>
        <Icon className="w-3.5 h-3.5" /> {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-[13px] text-slate-400 dark:text-slate-500 py-2">{loading ? 'Loading…' : 'Not enough data yet.'}</p>
      ) : (
        <ol className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((o, i) => (
            <li key={o.office} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-5 text-xs font-semibold text-slate-400 tabular-nums">{i + 1}</span>
              <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-300">{o.office_name || o.office}</span>
              <span className="shrink-0 text-right">
                <span className={`block font-medium tabular-nums ${slaUsage(o.avg_sla_pct)?.over ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
                  {slaUsage(o.avg_sla_pct)?.label}
                </span>
                {slaUsage(o.avg_sla_pct)?.over && (
                  <span className="block text-[11px] font-semibold text-red-500 dark:text-red-400">{slaUsage(o.avg_sla_pct).overBy}</span>
                )}
                <span className="block text-[11px] text-slate-400 dark:text-slate-500">avg {formatHoursMinutes(o.avg_hours)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { theme } = useTheme();
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(null);
  // Recharts renders raw SVG — these can't be themed via Tailwind's `dark:`
  // classes, so the grid/tick colors are picked in JS instead.
  const gridColor = theme === 'dark' ? '#1e293b' : '#f1f5f9';
  const tickColor = theme === 'dark' ? '#64748b' : '#94a3b8';

  useEffect(() => {
    fetchDashboardStats()
      .then((res) => { setStats({ ...EMPTY_STATS, ...res.data }); setLoadedAt(new Date()); })
      .finally(() => setLoading(false));
  }, []);

  const show = (value) => (loading ? '—' : value);
  const maxTypeCount = Math.max(1, ...stats.by_type.map((t) => t.count));
  const statusTotal = STATUS.reduce((sum, s) => sum + (stats[s.key] || 0), 0);
  const statusPieData = STATUS.map((s) => ({ name: s.label, key: s.key, value: stats[s.key] || 0 })).filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Analytics &amp; KPI Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">How documents are moving through the municipal offices.</p>
        </div>
        {loadedAt && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Updated {loadedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <Kpi label="Documents tracked" value={show(stats.total)} icon={FileTextIcon}
          tone="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
          note={<TrendNote pct={stats.weekly_trend_pct} />} />
        <Kpi label="Average processing time" value={show(stats.avg_resolution_display || 'N/A')} icon={Clock3Icon}
          tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
          note="From request to completion (ready for pickup); pickup wait not counted" />
        <Kpi label="Overdue right now" value={show(stats.overdue)} icon={BellIcon}
          tone="bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400"
          note={`${stats.missing_rate_pct}% of all documents reported missing`} />
        <Kpi label="Security events today" value={show(stats.access_logs_today)} icon={ShieldCheckIcon}
          tone="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          note={<Link to="/admin/access-logs" className="text-blue-600 dark:text-blue-400 hover:underline">Open access logs</Link>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Status overview: one donut with its counts beside it */}
        <Panel title="Status overview" subtitle="Every document by where it stands" className="lg:col-span-7">
          {statusTotal === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-10 text-center">{loading ? 'Loading…' : 'No documents yet.'}</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="w-44 h-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusPieData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="none">
                      {statusPieData.map((d) => <Cell key={d.key} fill={STATUS.find((s) => s.key === d.key).color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 w-full divide-y divide-slate-100 dark:divide-slate-800">
                {STATUS.map((s) => (
                  <li key={s.key} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="flex-1 text-slate-600 dark:text-slate-300">
                      {s.label}
                      {s.key === 'pending' && stats.overdue > 0 && (
                        <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">{stats.overdue} overdue</span>
                      )}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{stats[s.key] || 0}</span>
                    <span className="w-12 text-right text-xs text-slate-400 tabular-nums">
                      {statusTotal ? Math.round(((stats[s.key] || 0) / statusTotal) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="New requests" subtitle="Filed in each period" className="lg:col-span-5">
          <dl className="grid grid-cols-2 gap-3">
            {[
              ['Today', stats.by_period.daily],
              ['Last 7 days', stats.by_period.weekly],
              ['Last 30 days', stats.by_period.monthly],
              ['This year', stats.by_period.yearly],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3.5">
                <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{show(value)}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Workload by office" subtitle="Active documents sitting at each office now" className="lg:col-span-7">
          {stats.office_workload.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-16">{loading ? 'Loading…' : 'No active documents right now.'}</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.office_workload} margin={{ left: -18, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="office" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: theme === 'dark' ? '#1e293b' : '#f8fafc' }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} name="Active documents" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Demand by document type" subtitle="All requests received" className="lg:col-span-5">
          {stats.by_type.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">{loading ? 'Loading…' : 'No requests yet.'}</p>
          ) : (
            <ul className="space-y-3.5">
              {stats.by_type.map((t) => (
                <li key={t.name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-slate-600 dark:text-slate-300 truncate pr-3">{t.name}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">{t.count}</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.max(3, (t.count / maxTypeCount) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="QR-verified movements" subtitle={`Scans per day, last ${stats.scan_timeline.length || 14} days`} className="lg:col-span-7">
          {stats.scan_timeline.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-16">{loading ? 'Loading…' : 'No scan activity recorded yet.'}</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={stats.scan_timeline} margin={{ left: -18, right: 4 }}>
                <defs>
                  <linearGradient id="scanFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: tickColor }} tickFormatter={(d) => d.slice(5)} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fill="url(#scanFill)" name="QR scans" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Office speed" subtitle={`Average share of each step's time limit (SLA) an office uses · ranks offices with ${stats.ranking_min_documents ?? 3}+ documents`}
          action={<PanelLink to="/admin/heatmap">Heatmap →</PanelLink>} className="lg:col-span-5">
          <div className="grid gap-5">
            <OfficeRanking title="Fastest" icon={TrendingUpIcon} tone="text-green-700 dark:text-green-400" rows={stats.top5_fastest} loading={loading} />
            <OfficeRanking title="Slowest" icon={TrendingDownIcon} tone="text-red-700 dark:text-red-400" rows={stats.top5_slowest} loading={loading} />
          </div>
        </Panel>

        <Panel title="Bottlenecks" subtitle="Active documents held past their step's time limit (SLA), most overdue first" className="lg:col-span-12">
          {stats.bottlenecks.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">{loading ? 'Loading…' : 'Nothing is past its time limit right now.'}</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="responsive-table w-full text-sm">
                <thead className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="font-medium py-2 px-1">Tracking #</th>
                    <th className="font-medium py-2 px-1">Type</th>
                    <th className="font-medium py-2 px-1">Office</th>
                    <th className="font-medium py-2 px-1">Handler</th>
                    <th className="font-medium py-2 px-1 text-right">Time at office</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stats.bottlenecks.map((b) => (
                    <tr key={b.id}>
                      <td data-label="Tracking #" className="py-2.5 px-1 font-mono text-xs text-blue-600 dark:text-blue-400">{b.tracking_number}</td>
                      <td data-label="Type" className="py-2.5 px-1 text-slate-700 dark:text-slate-300">{b.document_type_name}</td>
                      <td data-label="Office" className="py-2.5 px-1 text-slate-600 dark:text-slate-400">{b.current_office}</td>
                      <td data-label="Handler" className="py-2.5 px-1 text-slate-600 dark:text-slate-400">{b.handler || '—'}</td>
                      <td data-label="Time at office" className="py-2.5 px-1 text-right">
                        <span className="font-medium text-red-600 dark:text-red-400 tabular-nums">{formatHoursMinutes(b.dwell_hours)}</span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                          limit {formatHoursMinutes(b.sla_hours)} · over by {formatHoursMinutes(b.over_by_hours)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Citizen satisfaction — the Overall Experience Rating citizens give a
            request once it is released, across every evaluation. */}
        <Panel title="Citizen satisfaction" subtitle="Overall Experience Rating after release" className="lg:col-span-4">
          {stats.satisfaction.avg_rating == null ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-6">{loading ? 'Loading…' : 'No citizen evaluations yet.'}</p>
          ) : (
            <div>
              <p className="flex items-center gap-2 text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
                {stats.satisfaction.avg_rating}
                <StarIcon className="w-7 h-7 text-amber-500" filled />
              </p>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
                out of 5 · {stats.satisfaction.rating_count} star rating{stats.satisfaction.rating_count === 1 ? '' : 's'}
              </p>
              <div className="mt-4 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-1.5 rounded-full bg-amber-400" style={{ width: `${(stats.satisfaction.avg_rating / 5) * 100}%` }} />
              </div>
            </div>
          )}
        </Panel>

        <div className="lg:col-span-8 min-w-0">
          <SurveyAnalyticsWidget />
        </div>

        <div className="lg:col-span-12 min-w-0">
          <CitizenCommentsWidget />
        </div>
      </div>
    </div>
  );
}
