export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  confirmColor = 'bg-red-600 hover:bg-red-700',
  onConfirm,
  onCancel,
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 modal-pop-in">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500 mt-2">{message}</p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-200 text-slate-600 font-medium py-2.5 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-lg text-white font-medium py-2.5 text-sm transition-colors ${confirmColor}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}