import { useState, useEffect } from 'react';
import { fetchPublicEvents } from '../../api/axios';
import { CalendarIcon, MapPinIcon } from '../Icons';

function formatDateRange(start, end) {
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const startText = new Date(start).toLocaleDateString(undefined, opts);
  if (!end || end === start) return startText;
  return `${startText} – ${new Date(end).toLocaleDateString(undefined, opts)}`;
}

export default function EventsSection() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchPublicEvents()
      .then((res) => setEvents(res.data))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section id="events" className="py-20 sm:py-28 bg-white scroll-mt-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-14">
          <span className="text-xs font-black uppercase tracking-widest text-blue-600">Events in Sariaya</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900">What's happening in our community</h2>
        </div>

        {loading ? (
          <p className="text-center text-slate-400">Loading events…</p>
        ) : events.length === 0 ? (
          <div className="max-w-lg mx-auto text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl py-14 px-8">
            <CalendarIcon className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="font-bold text-slate-600">No upcoming events posted yet</p>
            <p className="text-sm text-slate-400 mt-1">Check back soon for municipal celebrations and community activities.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((ev) => (
              <div key={ev.id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                {ev.image ? (
                  <img src={ev.image} alt={ev.title} className="w-full h-40 object-cover" />
                ) : (
                  <div className="w-full h-40 bg-blue-50 flex items-center justify-center">
                    <CalendarIcon className="w-8 h-8 text-blue-300" />
                  </div>
                )}
                <div className="p-5">
                  <p className="text-xs font-bold text-blue-600 flex items-center gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5" /> {formatDateRange(ev.start_date, ev.end_date)}
                  </p>
                  <h3 className="mt-2 font-bold text-slate-900 leading-snug">{ev.title}</h3>
                  {ev.location && (
                    <p className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
                      <MapPinIcon className="w-3.5 h-3.5" /> {ev.location}
                    </p>
                  )}
                  {ev.description && (
                    <p className={`mt-2 text-sm text-slate-600 ${expandedId === ev.id ? '' : 'line-clamp-2'}`}>
                      {ev.description}
                    </p>
                  )}
                  {ev.description && ev.description.length > 100 && (
                    <button
                      onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                      className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-800"
                    >
                      {expandedId === ev.id ? 'Show less' : 'View Details'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
