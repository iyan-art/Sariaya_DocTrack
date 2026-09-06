/**
 * Shown by TrackDocumentCard when a tracking-number lookup comes back
 * empty — replaces a silent failure or an unclear inline error with an
 * explicit warning and a clear next action.
 */
export default function TrackingNotFoundModal({ onCancel, onRetry }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 modal-pop-in text-center">
        <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
          !
        </div>
        <h2 className="text-lg font-bold text-slate-900">Document Not Found</h2>
        <p className="text-sm text-slate-500 mt-2">
          Your Document tracking number does not exist or Wrong Document Tracking, Please Try Again
        </p>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onRetry}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-bold transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
