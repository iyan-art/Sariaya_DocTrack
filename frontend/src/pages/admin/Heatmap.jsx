import { slaUsage } from '../../utils/slaUsage';
import { useState, useEffect } from 'react';
import { fetchHeatmapData } from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';
import { BarChart3Icon } from '../../components/Icons';
import { formatHoursMinutes } from '../../utils/duration';
import HeatmapOfficeDocuments from '../../components/admin/HeatmapOfficeDocuments';

// Color comes from how much of its own time limit (SLA) an office uses on
// average, so an office whose work simply takes longer is not shown as slow:
// 50% of the SLA or less is green, 75% yellow, 100% (at the limit) or more red.
function slaHue(pct) {
  const t = Math.min(1, Math.max(0, (pct - 50) / 50));
  return 120 - 120 * t; // 120=green, 60=yellow, 0=red
}

// Dark mode keeps the same hue but shifts toward a deep, low-lightness tint
// so the tiles read as colored panels against the dark page instead of
// bright pastel swatches that would glare.
function heatColor(pct, dark) {
  const hue = slaHue(pct);
  if (dark) {
    return {
      bg: `hsl(${hue}, 45%, 16%)`,
      border: `hsl(${hue}, 45%, 30%)`,
      text: `hsl(${hue}, 70%, 75%)`,
    };
  }
  return {
    bg: `hsl(${hue}, 85%, 94%)`,
    border: `hsl(${hue}, 70%, 75%)`,
    text: `hsl(${hue}, 75%, 30%)`,
  };
}

const LEGEND = [
  ['50% or less', 'Well within SLA'],
  ['75%', 'Nearing SLA'],
  ['100% or more', 'At or over SLA'],
];

export default function Heatmap() {
  const { theme } = useTheme();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openOffice, setOpenOffice] = useState(null); // tile whose documents are shown

  useEffect(() => {
    fetchHeatmapData().then((res) => {
      setData(res.data);
      setLoading(false);
    });
  }, []);

  // Alphabetical, fixed layout — a heatmap should read as a spatial map of
  // offices, not a ranked list (that's what the dashboard's Top 5 is for).
  const tiles = [...data].sort((a, b) => (a.office_name || a.office).localeCompare(b.office_name || b.office));

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 dark:shadow-none">
          <BarChart3Icon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Office Performance Heatmap</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            How much of each step's time limit (SLA) an office uses on average — greener is well within it, redder is at or over it.
          </p>
        </div>
      </div>

      {/* Legend: the color scale is fixed by SLA share, not by the other offices. */}
      {!loading && data.length > 0 && (
        <div className="mt-6 max-w-md">
          <div
            className="h-3 rounded-full"
            style={{ background: 'linear-gradient(to right, hsl(120,85%,55%), hsl(60,85%,55%), hsl(0,85%,55%))' }}
          />
          <div className="mt-1.5 grid grid-cols-3 text-[11px] leading-tight">
            {LEGEND.map(([pct, label], i) => (
              <div key={pct} className={i === 0 ? 'text-left' : i === 1 ? 'text-center' : 'text-right'}>
                <p className="font-semibold text-slate-600 dark:text-slate-300">{pct}</p>
                <p className="text-slate-400 dark:text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-slate-400 dark:text-slate-500 text-center py-16">Loading…</p>
        ) : tiles.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl p-16 text-center">
            <p className="text-slate-400 dark:text-slate-500 font-bold">No processing data yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {tiles.map((o) => {
              const color = heatColor(o.avg_sla_pct, theme === 'dark');
              return (
                <button
                  type="button"
                  key={o.office}
                  onClick={() => setOpenOffice(o)}
                  title="Show the documents behind this figure"
                  className="text-left rounded-3xl p-6 border-2 transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 cursor-pointer"
                  style={{ backgroundColor: color.bg, borderColor: color.border }}
                >
                  <p className="text-xs font-black uppercase tracking-widest" style={{ color: color.text }}>
                    {o.office_name || o.office}
                  </p>
                  {o.avg_sla_pct > 100 ? (
                    <p className="text-2xl font-black mt-3" style={{ color: color.text }}>
                      Over SLA <span className="text-sm font-bold">({o.avg_sla_pct}% · {slaUsage(o.avg_sla_pct).overBy})</span>
                    </p>
                  ) : (
                    <p className="text-2xl font-black mt-3" style={{ color: color.text }}>
                      {o.avg_sla_pct}% <span className="text-sm font-bold">of SLA</span>
                    </p>
                  )}
                  <p className="text-xs font-semibold mt-1" style={{ color: color.text }}>
                    Average {formatHoursMinutes(o.avg_hours)}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-70" style={{ color: color.text }}>
                    {o.count} document{o.count === 1 ? '' : 's'} processed
                    {o.over_sla > 0 && ` · ${o.over_sla} over SLA`}
                  </p>
                  <p className="text-[10px] font-bold mt-2 underline underline-offset-2 opacity-80" style={{ color: color.text }}>
                    View documents
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {openOffice && <HeatmapOfficeDocuments office={openOffice} onClose={() => setOpenOffice(null)} />}
    </div>
  );
}
