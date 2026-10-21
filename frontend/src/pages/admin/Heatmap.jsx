import { useState, useEffect } from 'react';
import { fetchHeatmapData } from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';
import { BarChart3Icon, StarIcon } from '../../components/Icons';

// Green (fast) -> yellow -> red (slow), interpolated by where this office's
// avg_hours falls between the fastest and slowest office currently on record.
// Dark mode keeps the same hue but shifts toward a deep, low-lightness tint
// so the tiles read as colored panels against the dark page instead of
// bright pastel swatches that would glare.
function heatColor(value, min, max, dark) {
  const t = max > min ? (value - min) / (max - min) : 0;
  const hue = 120 - 120 * Math.min(1, Math.max(0, t)); // 120=green, 0=red
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

export default function Heatmap() {
  const { theme } = useTheme();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHeatmapData().then((res) => {
      setData(res.data);
      setLoading(false);
    });
  }, []);

  // Alphabetical, fixed layout — a heatmap should read as a spatial map of
  // offices, not a ranked list (that's what the dashboard's Top 5 is for).
  const tiles = [...data].sort((a, b) => (a.office_name || a.office).localeCompare(b.office_name || b.office));
  const values = data.map((d) => d.avg_hours);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 dark:shadow-none">
          <BarChart3Icon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Office Performance Heatmap</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Average processing time per office — greener is faster, redder is a bottleneck.</p>
        </div>
      </div>

      {/* Legend */}
      {!loading && data.length > 0 && (
        <div className="mt-6 flex items-center gap-3">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Fast</span>
          <div
            className="h-3 flex-1 max-w-xs rounded-full"
            style={{ background: 'linear-gradient(to right, hsl(120,85%,55%), hsl(60,85%,55%), hsl(0,85%,55%))' }}
          />
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Slow</span>
          <span className="text-xs text-slate-400 dark:text-slate-500 ml-4">{min}h – {max}h avg</span>
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
              const color = heatColor(o.avg_hours, min, max, theme === 'dark');
              return (
                <div
                  key={o.office}
                  className="rounded-3xl p-6 border-2 transition-transform hover:scale-[1.02]"
                  style={{ backgroundColor: color.bg, borderColor: color.border }}
                >
                  <p className="text-xs font-black uppercase tracking-widest" style={{ color: color.text }}>
                    {o.office_name || o.office}
                  </p>
                  <p className="text-4xl font-black mt-3" style={{ color: color.text }}>
                    {o.avg_hours}<span className="text-lg">h</span>
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-70" style={{ color: color.text }}>
                    {o.count} document{o.count === 1 ? '' : 's'} processed
                  </p>
                  {o.avg_rating != null && (
                    <p className="text-xs font-bold mt-2 flex items-center gap-1 opacity-80" style={{ color: color.text }}>
                      <StarIcon className="w-3.5 h-3.5" filled /> {o.avg_rating} citizen rating
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
