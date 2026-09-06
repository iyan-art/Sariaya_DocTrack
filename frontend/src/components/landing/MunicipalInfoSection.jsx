import { useState, useEffect } from 'react';
import { fetchPublicOffices } from '../../api/axios';
import { MapPinIcon, ClipboardListIcon } from '../Icons';

export default function MunicipalInfoSection() {
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPublicOffices().then((res) => setOffices(res.data)).catch(() => setOffices([])).finally(() => setLoading(false));
  }, []);

  return (
    <section id="municipal-info" className="py-20 sm:py-28 bg-slate-50 scroll-mt-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-14">
          <span className="text-xs font-black uppercase tracking-widest text-blue-600">Municipal Information</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900">Municipal Office Directory</h2>
          <p className="mt-3 text-slate-500 max-w-xl mx-auto">
            Find the municipal office you need and where to find it in Municipal Hall.
          </p>
        </div>

        {loading ? (
          <p className="text-center text-slate-400">Loading…</p>
        ) : offices.length === 0 ? (
          <p className="text-center text-slate-400">Office information is not available right now.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {offices.map((o) => (
              <div key={o.id} className="bg-white border border-slate-100 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <ClipboardListIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 leading-snug break-words">{o.name}</p>
                    {(o.location || o.floor) && (
                      <p className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
                        <MapPinIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="break-words">{[o.location, o.floor].filter(Boolean).join(' · ')}</span>
                      </p>
                    )}
                    {o.office_hours && <p className="mt-1 text-xs text-slate-400">{o.office_hours}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
