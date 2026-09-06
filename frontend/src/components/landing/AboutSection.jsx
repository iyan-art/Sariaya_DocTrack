import { useState } from 'react';
import { MapPinIcon, UsersIcon, ShieldCheckIcon } from '../Icons';

const HIGHLIGHTS = [
  { icon: MapPinIcon, label: 'Location', value: 'Province of Quezon, CALABARZON Region' },
  { icon: UsersIcon, label: 'Community', value: 'A growing, close-knit municipal community' },
  { icon: ShieldCheckIcon, label: 'Governance', value: 'Serving citizens through modern local government' },
];

export default function AboutSection() {
  const [expanded, setExpanded] = useState(false);

  return (
    <section id="about" className="py-20 sm:py-28 bg-white scroll-mt-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          <div className="order-2 lg:order-1">
            <img
              src="/sariaya-church.webp"
              alt="St. Francis of Assisi Parish Church, Sariaya"
              className="aspect-[4/3] w-full rounded-3xl object-cover shadow-xl"
            />
          </div>

          <div className="order-1 lg:order-2">
            <span className="text-xs font-black uppercase tracking-widest text-blue-600">About Sariaya</span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900">Getting to know our municipality</h2>
            <p className="mt-5 text-slate-600 leading-relaxed">
              Sariaya is a municipality in the province of Quezon, Philippines. Known for its well-preserved
              ancestral houses and warm community spirit, Sariaya blends its heritage with the everyday work
              of local governance — serving residents, processing civil documents, and keeping the community
              informed and connected.
            </p>
            {expanded && (
              <p className="mt-4 text-slate-600 leading-relaxed">
                This website serves as the municipality's digital front door — a place for residents to learn
                about local happenings and to access citizen services online, including requesting and
                tracking official municipal documents without needing to visit an office in person for every
                step of the process.
              </p>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>

            <div className="mt-8 grid sm:grid-cols-1 gap-3">
              {HIGHLIGHTS.map((h) => (
                <div key={h.label} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <h.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h.label}</p>
                    <p className="text-sm font-semibold text-slate-800">{h.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
