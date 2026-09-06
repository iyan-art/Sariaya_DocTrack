import { useState, useEffect } from 'react';
import { fetchPublicDocumentTypes } from '../../api/axios';
import { scrollToSection } from './LandingNavbar';
import { FileTextIcon } from '../Icons';

/**
 * Citizen Services — one card per real, currently-active EXTERNAL document
 * type (fetched live, never hardcoded), so this list can never drift from
 * what the system actually offers. There's no per-service detail page or
 * self-service request form in this system (requests are filed by staff on
 * a citizen's behalf), so "View Service" is honest about where that
 * actually happens today: signing in.
 */
export default function ServicesSection() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPublicDocumentTypes()
      .then((res) => setTypes(res.data))
      .catch(() => setTypes([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section id="services" className="py-20 sm:py-28 bg-white scroll-mt-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-14">
          <span className="text-xs font-black uppercase tracking-widest text-blue-600">Citizen Services</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900">Municipal documents you can request</h2>
          <p className="mt-3 text-slate-500 max-w-xl mx-auto">
            Available document services, loaded live from the Sariaya DocTrack system.
          </p>
        </div>

        {loading ? (
          <p className="text-center text-slate-400">Loading services…</p>
        ) : types.length === 0 ? (
          <p className="text-center text-slate-400">No services are configured yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {types.map((t) => (
              <div key={t.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-6 flex flex-col">
                <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center mb-4">
                  <FileTextIcon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900">{t.name}</h3>
                <p className="mt-2 text-sm text-slate-500 flex-1">
                  {t.description || 'Request and track your document.'}
                </p>
                <button
                  onClick={() => scrollToSection('access')}
                  className="mt-5 text-sm font-bold text-blue-600 hover:text-blue-800 text-left"
                >
                  View Service →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
