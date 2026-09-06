import { useState, useEffect, useRef } from 'react';
import { searchCitizens } from '../../api/axios';

/**
 * Staff-facing "which citizen is this request for" section, shown when
 * creating a document request. Selecting an existing account (via search)
 * links the created document to it (CreateDocumentSerializer's
 * requested_by) so it shows up on that citizen's Home/History pages, and
 * its own account name/email are used for automated notifications going
 * forward — no further typing needed once one is picked.
 *
 * Leaving the search blank keeps the request as a walk-in with no account
 * (still trackable by tracking number), in which case the Requesting
 * Citizen Name and Email Address fields below become the only source of
 * that information — both required, since without them there's no reliable
 * name for an email greeting and nowhere to send the "ready for release"
 * notification (previously silently fell back to "Dear N/A,").
 *
 * `readOnly` is for Internal Documents only — there's no citizen at all for
 * an internal request, so the parent modal auto-fills guestName/guestEmail
 * from the logged-in staff/admin account and passes readOnly=true here,
 * which hides the account-search block entirely and renders the two
 * fields as disabled/pre-filled rather than editable. External Documents
 * behavior (readOnly=false, the default) is completely unchanged.
 */
export default function CitizenPicker({
  value, onChange, guestName, onGuestNameChange, guestEmail, onGuestEmailChange, errors = {}, readOnly = false,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      searchCitizens(query.trim())
        .then((res) => setResults(res.data))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const select = (citizen) => {
    onChange(citizen);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="space-y-3">
      {!readOnly && (
        <div className="relative">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
            Link an Existing Citizen Account (optional)
          </label>

          {value ? (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-bold text-blue-900">{value.full_name}</p>
                <p className="text-xs text-blue-700/70">{value.email}</p>
              </div>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-xs font-bold text-blue-700 hover:text-blue-900"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder="Search by name or email — leave blank for walk-in"
                className="w-full border border-slate-200 rounded-xl p-3 bg-slate-50 focus:ring-2 focus:ring-blue-500 text-sm"
              />
              {open && query.trim().length >= 2 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {searching ? (
                    <p className="text-xs text-slate-400 px-4 py-3">Searching…</p>
                  ) : results.length === 0 ? (
                    <p className="text-xs text-slate-400 px-4 py-3">No matching citizen account.</p>
                  ) : (
                    results.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => select(c)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors"
                      >
                        <p className="text-sm font-semibold text-slate-800">{c.full_name}</p>
                        <p className="text-xs text-slate-400">{c.email}</p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* External: only relevant for a walk-in with no linked account (an
          existing account's own name/email are used automatically and take
          priority server-side, so these are hidden once one is picked).
          Internal: always shown, always read-only — see readOnly doc above. */}
      {(readOnly || !value) && onGuestNameChange && (
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
            {readOnly ? "Employee's Name" : 'Requesting Citizen Name'} {!readOnly && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            required={!readOnly}
            readOnly={readOnly}
            disabled={readOnly}
            value={guestName || ''}
            onChange={(e) => onGuestNameChange(e.target.value)}
            placeholder="e.g. Juan Dela Cruz"
            className={`w-full border rounded-xl p-3 text-sm ${
              readOnly
                ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                : `bg-slate-50 focus:ring-2 focus:ring-blue-500 ${errors.guest_name ? 'border-red-300' : 'border-slate-200'}`
            }`}
          />
          {readOnly ? (
            <p className="text-[11px] text-slate-400 mt-1">Automatically set from your staff/admin account.</p>
          ) : (
            errors.guest_name && <p className="text-[11px] text-red-600 mt-1">{errors.guest_name}</p>
          )}
        </div>
      )}

      {(readOnly || !value) && onGuestEmailChange && (
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
            {readOnly ? "Employee's Email Address" : 'Requesting Citizen Email Address'} {!readOnly && <span className="text-red-500">*</span>}
          </label>
          <input
            type="email"
            required={!readOnly}
            readOnly={readOnly}
            disabled={readOnly}
            value={guestEmail || ''}
            onChange={(e) => onGuestEmailChange(e.target.value)}
            placeholder="citizen@example.com"
            className={`w-full border rounded-xl p-3 text-sm ${
              readOnly
                ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                : `bg-slate-50 focus:ring-2 focus:ring-blue-500 ${errors.guest_email ? 'border-red-300' : 'border-slate-200'}`
            }`}
          />
          {readOnly ? (
            <p className="text-[11px] text-slate-400 mt-1">Automatically set from your staff/admin account.</p>
          ) : errors.guest_email ? (
            <p className="text-[11px] text-red-600 mt-1">{errors.guest_email}</p>
          ) : (
            <p className="text-[11px] text-slate-400 mt-1">
              Used to automatically notify the citizen when their document is ready for release.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
