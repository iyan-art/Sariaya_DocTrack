import { FileTextIcon } from '../Icons';

/**
 * Shown when a visitor who isn't signed in picks a service: requests and
 * their history live in the citizen portal, so they sign in (or create an
 * account) first. `onSignIn` takes them to the sign-in section.
 */
export default function LoginRequiredModal({ serviceName, onSignIn, onClose }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 overlay-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-required-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center modal-pop-in"
      >
        <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto">
          <FileTextIcon className="w-6 h-6" />
        </div>
        <h2 id="login-required-title" className="mt-4 text-xl font-bold text-slate-900">Sign in to continue</h2>
        <p className="mt-2 text-sm text-slate-500">
          {serviceName ? <>To view <span className="font-semibold text-slate-700">{serviceName}</span> and </> : 'To '}
          request or follow up on a document, please sign in to your citizen account first.
        </p>
        <div className="mt-6 space-y-2">
          <button
            type="button"
            autoFocus
            onClick={onSignIn}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 transition-colors"
          >
            Sign in or create an account
          </button>
          <button type="button" onClick={onClose} className="w-full py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
