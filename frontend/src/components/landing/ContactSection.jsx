import { MapPinIcon, ClipboardListIcon } from '../Icons';
import { scrollToSection } from './LandingNavbar';

// Only genuinely-configured information is shown here — this project has no
// stored municipal phone number, email, or social-media handle anywhere in
// its settings, so none is invented. Add real values to the system (and
// this section) once they're available.
export default function ContactSection() {
  return (
    <section id="contact" className="py-20 sm:py-28 bg-white scroll-mt-16">
      <div className="max-w-4xl mx-auto px-6 lg:px-10 text-center">
        <span className="text-xs font-black uppercase tracking-widest text-blue-600">Get in Touch</span>
        <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900">Contact the Municipality</h2>

        <div className="mt-10 grid sm:grid-cols-2 gap-5 text-left max-w-2xl mx-auto">
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6">
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-3">
              <MapPinIcon className="w-5 h-5" />
            </div>
            <p className="font-bold text-slate-900">Municipal Hall</p>
            <p className="text-sm text-slate-500 mt-1">Municipality of Sariaya, Quezon, Philippines</p>
          </div>

          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6">
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-3">
              <ClipboardListIcon className="w-5 h-5" />
            </div>
            <p className="font-bold text-slate-900">Reach a Specific Office</p>
            <p className="text-sm text-slate-500 mt-1">
              For office-specific concerns, visit the Municipal Office Directory above to find the right office and where to find it.
            </p>
            <button
              onClick={() => scrollToSection('municipal-info')}
              className="mt-3 text-sm font-bold text-blue-600 hover:text-blue-800"
            >
              View Office Directory →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
