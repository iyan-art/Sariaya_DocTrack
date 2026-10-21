import { CheckCircle2Icon } from '../Icons';

/**
 * Shown once, right after a successful registration or login, when
 * Automatic Guest-to-User Account Linking found pre-existing guest-created
 * document requests under this email and synced them into the account —
 * see accounts/services.py::link_guest_documents(). The citizen's own
 * dashboard/history already reflect the linked documents by the time this
 * shows (same requested_by-scoped query Home.jsx/History.jsx always use),
 * so this is purely a heads-up, not something they need to act on.
 */
export default function GuestDocumentsLinkedModal({ email, count, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm p-7 modal-pop-in text-center">
        <div className="w-14 h-14 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2Icon className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Welcome!</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          We found {count} existing document request{count === 1 ? '' : 's'} linked to <strong>{email}</strong> and
          automatically synced {count === 1 ? 'it' : 'them'} to your account dashboard.
        </p>
        <button
          onClick={onClose}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl mt-6 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
