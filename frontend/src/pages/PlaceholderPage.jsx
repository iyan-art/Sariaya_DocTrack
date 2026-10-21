export default function PlaceholderPage({ title, description }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
      {description && <p className="text-slate-500 dark:text-slate-400 mt-1">{description}</p>}
      <div className="mt-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-10 text-center text-slate-400 dark:text-slate-500">
        This page is ready to be built next.
      </div>
    </div>
  );
}