import { HandshakeIcon, ShieldCheckIcon, UsersIcon, ClipboardListIcon } from '../Icons';

// Icon-led cards rather than photography — no verified Sariaya landmark
// photos are bundled with this project, and using unrelated stock images
// would misrepresent the municipality. Swap in real photos here once
// available; the layout is ready for them.
const DISCOVER_ITEMS = [
  {
    icon: HandshakeIcon,
    title: 'Heritage',
    text: 'Home to well-preserved ancestral houses reflecting Sariaya’s prosperous early-20th-century past.',
  },
  {
    icon: UsersIcon,
    title: 'Culture',
    text: 'A community that celebrates its traditions through local festivities and gatherings throughout the year.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Community',
    text: 'Residents and local government working together to keep Sariaya a safe, welcoming place to live.',
  },
  {
    icon: ClipboardListIcon,
    title: 'Municipal Facilities',
    text: 'Municipal offices and facilities serving the everyday needs of Sariaya’s residents.',
  },
];

export default function DiscoverSection() {
  return (
    <section id="discover" className="py-20 sm:py-28 bg-white scroll-mt-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-14">
          <span className="text-xs font-black uppercase tracking-widest text-blue-600">Discover Sariaya</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900">What makes our municipality special</h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {DISCOVER_ITEMS.map((item) => (
            <div key={item.title} className="bg-slate-50 border border-slate-100 rounded-2xl p-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-4">
                <item.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
