/**
 * The municipal letterhead at the top of every printout a citizen receives:
 * the Sariaya seal over the issuing office. Always dark-on-white, like paper,
 * whatever the app's theme.
 */
export default function OfficialLetterhead({ className = '' }) {
  return (
    <div className={`text-center border-b-2 border-slate-800 pb-4 ${className}`}>
      <img
        src="/sariaya-logo.jpg"
        alt="Official Seal of the Municipality of Sariaya"
        className="h-16 w-16 mx-auto mb-2 rounded-full object-contain bg-white"
      />
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Republic of the Philippines</p>
      <p className="text-xs text-slate-600">Province of Quezon</p>
      <p className="text-sm font-bold text-slate-900 mt-1">MUNICIPALITY OF SARIAYA</p>
      <p className="text-sm font-bold text-slate-900">Office of the Municipal Administrator</p>
    </div>
  );
}
