export default function PlaceholderPage({ title, description }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {description && <p className="text-slate-500 mt-1">{description}</p>}
      <div className="mt-6 bg-white rounded-xl border border-slate-100 p-10 text-center text-slate-400">
        This page is ready to be built next.
      </div>
    </div>
  );
}