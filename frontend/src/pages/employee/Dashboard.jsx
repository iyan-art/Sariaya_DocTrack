import { useState, useEffect } from 'react';
import { fetchMyOfficePerformance, fetchMyOfficeComments } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import CitizenCommentsWidget from '../../components/admin/CitizenCommentsWidget';
import { Clock3Icon, StarIcon } from '../../components/Icons';

/**
 * Staff/employee dashboard — the office-scoped equivalent of the Admin
 * Dashboard's "Office Performance" (avg turnaround) and "Citizen
 * Satisfaction" (avg rating) panels, so an employee can see how their own
 * office is doing without needing admin access. Backed by
 * MyOfficePerformanceView, which reuses the exact same aggregation the
 * Admin dashboard's Top 5 lists are built from — just filtered to one office.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyOfficePerformance()
      .then((res) => setStats(res.data))
      .finally(() => setLoading(false));
  }, []);

  const hasSpeedData = stats?.avg_hours != null;
  const hasRatingData = stats?.avg_rating != null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{user.office} Dashboard</h1>
      <p className="text-slate-500 text-sm">How your office is performing, based on real processing and citizen-feedback data.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
        {/* Office Performance — average turnaround time */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-indigo-500 w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg">
              <Clock3Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Office Performance</p>
              <p className="text-xs text-slate-400">Average processing turnaround time</p>
            </div>
          </div>

          {loading ? (
            <p className="text-slate-400 text-sm py-4">Loading…</p>
          ) : !hasSpeedData ? (
            <p className="text-slate-400 text-sm py-4">Not enough data yet — this office hasn't processed a timed document yet.</p>
          ) : (
            <>
              <p className="text-4xl font-black text-indigo-700">{stats.avg_hours}<span className="text-lg">h</span></p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
                Based on {stats.count} document{stats.count === 1 ? '' : 's'} processed
              </p>
            </>
          )}
        </div>

        {/* Citizen Satisfaction — average star rating */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-amber-500 w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg">
              <StarIcon className="w-5 h-5" filled />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Citizen Satisfaction</p>
              <p className="text-xs text-slate-400">Average rating from citizen evaluations</p>
            </div>
          </div>

          {loading ? (
            <p className="text-slate-400 text-sm py-4">Loading…</p>
          ) : !hasRatingData ? (
            <p className="text-slate-400 text-sm py-4">No citizen evaluations for this office yet.</p>
          ) : (
            <>
              <p className="text-4xl font-black text-amber-600 flex items-center gap-2">
                {stats.avg_rating} <StarIcon className="w-7 h-7" filled />
              </p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
                Based on {stats.rating_count} rating{stats.rating_count === 1 ? '' : 's'}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-2xl p-5">
        <p className="text-sm text-blue-800">
          These numbers reflect how quickly your office moves documents along and how citizens rate their experience — keep them in mind as you process requests.
        </p>
      </div>

      <CitizenCommentsWidget
        fetchComments={fetchMyOfficeComments}
        subtitle="Written feedback from citizens your office has served — anonymous, so you can see what's being said without seeing who said it."
      />
    </div>
  );
}
