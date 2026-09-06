// Deliberately high-level and qualitative rather than citing specific
// years/figures the project has no verified source for (per the redesign
// brief's "do not invent historical facts"). An admin-manageable version of
// this timeline can replace these once verified municipal records are
// available to source it from.
const MILESTONES = [
  {
    era: 'Spanish Colonial Era',
    text: 'Like many towns across Quezon Province, Sariaya traces its roots to the Spanish colonial period, when it was established as a farming and trading community.',
  },
  {
    era: 'Agricultural Growth',
    text: 'The town grew prosperous through agriculture, particularly coconut production, which brought lasting prosperity to many local families.',
  },
  {
    era: 'The Heritage House Era',
    text: 'Prominent Sariaya families built grand ancestral houses blending American colonial and Art Deco influences — several still stand today and are recognized as heritage structures.',
  },
  {
    era: 'Modern Sariaya',
    text: 'Today, Sariaya honors its heritage through community celebrations while serving residents through modern local governance and digital citizen services.',
  },
];

export default function HistorySection() {
  return (
    <section id="history" className="py-20 sm:py-28 bg-slate-50 scroll-mt-16">
      <div className="max-w-4xl mx-auto px-6 lg:px-10">
        <div className="text-center mb-14">
          <span className="text-xs font-black uppercase tracking-widest text-blue-600">History of Sariaya</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900">A community shaped by generations</h2>
        </div>

        <div className="relative pl-8 sm:pl-10">
          <div className="absolute left-[7px] sm:left-[9px] top-2 bottom-2 w-0.5 bg-blue-100" />
          <div className="space-y-10">
            {MILESTONES.map((m) => (
              <div key={m.era} className="relative">
                <div className="absolute -left-8 sm:-left-10 top-1 w-4 h-4 rounded-full bg-blue-600 border-4 border-blue-100" />
                <p className="text-xs font-black uppercase tracking-widest text-blue-600">{m.era}</p>
                <p className="mt-1.5 text-slate-600 leading-relaxed">{m.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
