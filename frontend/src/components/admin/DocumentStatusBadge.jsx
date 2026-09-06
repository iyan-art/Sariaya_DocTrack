const STATUS_STYLES = {
  released: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  completed: 'bg-green-100 text-green-700 border-green-300',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  in_transit: 'bg-amber-50 text-amber-700 border-amber-200',
  missing: 'bg-red-50 text-red-700 border-red-200',
};

export default function DocumentStatusBadge({ doc }) {
  // SAFETY CHECK: Kung walang 'doc', huwag magpakita ng anuman para hindi mag-error
  if (!doc) return null;

  const label = doc.status_label || doc.status;
  const style = STATUS_STYLES[doc.status] || 'bg-slate-50 text-slate-600 border-slate-200';
  
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border capitalize shadow-sm ${style}`}>
      {doc.status === 'in_progress' && <span className="w-1 h-1 bg-blue-600 rounded-full animate-pulse"></span>}
      {doc.status === 'in_transit' && <span className="w-1 h-1 bg-amber-600 rounded-full animate-pulse"></span>}
      {label}
    </span>
  );
}