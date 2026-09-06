import { scrollToSection } from './LandingNavbar';

const QUICK_LINKS = [
  { label: 'Home', href: 'hero' },
  { label: 'About Sariaya', href: 'about' },
  { label: 'History', href: 'history' },
  { label: 'Events', href: 'events' },
  { label: 'Announcements', href: 'announcements' },
  { label: 'Services', href: 'services' },
  { label: 'Contact', href: 'contact' },
];

export default function LandingFooter() {
  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14 grid sm:grid-cols-3 gap-10">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">S</div>
            <div>
              <p className="font-bold text-white">Municipality of Sariaya</p>
              <p className="text-xs text-slate-400">Quezon, Philippines</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-400 leading-relaxed max-w-xs">
            The official document tracking and citizen-services portal of the Sariaya Office of the Municipal Administrator.
          </p>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Quick Links</p>
          <ul className="space-y-2">
            {QUICK_LINKS.map((l) => (
              <li key={l.href}>
                <button onClick={() => scrollToSection(l.href)} className="text-sm text-slate-400 hover:text-white transition-colors">
                  {l.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Citizen Services</p>
          <ul className="space-y-2">
            <li>
              <button onClick={() => scrollToSection('access')} className="text-sm text-slate-400 hover:text-white transition-colors">
                Request a Document
              </button>
            </li>
            <li>
              <button onClick={() => scrollToSection('track')} className="text-sm text-slate-400 hover:text-white transition-colors">
                Track My Document
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-800 py-6 px-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Municipality of Sariaya. All rights reserved. · Document Tracking &amp; Workflow Management System
      </div>
    </footer>
  );
}
