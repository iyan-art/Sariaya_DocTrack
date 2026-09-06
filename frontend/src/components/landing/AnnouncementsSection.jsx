import { useState, useEffect } from 'react';
import { fetchPublicAnnouncements } from '../../api/axios';
import { NewspaperIcon } from '../Icons';

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function AnnouncementsSection() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchPublicAnnouncements()
      .then((res) => setAnnouncements(res.data))
      .catch(() => setAnnouncements([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section id="announcements" className="py-20 sm:py-28 bg-slate-50 scroll-mt-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-14">
          <span className="text-xs font-black uppercase tracking-widest text-blue-600">News &amp; Updates</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900">Latest Announcements</h2>
        </div>

        {loading ? (
          <p className="text-center text-slate-400">Loading announcements…</p>
        ) : announcements.length === 0 ? (
          <div className="max-w-lg mx-auto text-center bg-white border border-dashed border-slate-200 rounded-2xl py-14 px-8">
            <NewspaperIcon className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="font-bold text-slate-600">No announcements posted yet</p>
            <p className="text-sm text-slate-400 mt-1">Municipal news and updates will appear here.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {announcements.map((a) => (
              <div key={a.id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                {a.image ? (
                  <img src={a.image} alt={a.title} className="w-full h-40 object-cover" />
                ) : (
                  <div className="w-full h-40 bg-amber-50 flex items-center justify-center">
                    <NewspaperIcon className="w-8 h-8 text-amber-300" />
                  </div>
                )}
                <div className="p-5">
                  <p className="text-xs text-slate-400 font-semibold">{formatDate(a.published_at)}</p>
                  <h3 className="mt-1.5 font-bold text-slate-900 leading-snug">{a.title}</h3>
                  {a.summary && <p className="mt-2 text-sm text-slate-600 line-clamp-2">{a.summary}</p>}
                  {expandedId === a.id && a.body && (
                    <p className="mt-2 text-sm text-slate-600">{a.body}</p>
                  )}
                  {a.body && (
                    <button
                      onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                      className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-800"
                    >
                      {expandedId === a.id ? 'Show less' : 'Read More'}
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
