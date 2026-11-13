import { CONTACT_NUMBER_ERROR, isInvalidContactNumber } from '../../utils/contactNumber';
import { blockInvalidNumberKeys, numberFieldError } from '../../utils/positiveNumber';

// Fallback for a document type with no request_fields configured yet
// (e.g. one an admin just created) — better than showing nothing.
const GENERIC_FALLBACK_FIELDS = [
  { key: 'purpose', label: 'Purpose', type: 'text', required: true },
  { key: 'contact_no', label: 'Contact Number', type: 'tel', required: true },
  { key: 'number_of_copies', label: 'Number of Copies', type: 'number', integer: true, required: false, placeholder: '1' },
];

/**
 * Renders DocumentType.request_fields into labeled inputs — the single
 * source of truth for "what does THIS document type actually need," shared
 * by both the employee (NewRequestModal) and admin (NewDocumentModal)
 * request-creation forms so the two produce the same form for the same
 * document type instead of two different hardcoded field sets.
 */
export default function DocumentRequestFields({ fields, value, onChange }) {
  const effectiveFields = fields && fields.length > 0 ? fields : GENERIC_FALLBACK_FIELDS;

  return (
    <div className="space-y-4">
      {effectiveFields.map((f) => {
        const error = f.type === 'tel'
          ? (isInvalidContactNumber(value[f.key]) ? CONTACT_NUMBER_ERROR : null)
          : (f.type === 'number' ? numberFieldError(f, value[f.key]) : null);
        return (
        <div key={f.key}>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
            {f.label}{' '}
            {f.required ? (
              <span className="text-red-500">*</span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500 normal-case font-normal">(optional)</span>
            )}
          </label>

          {f.type === 'textarea' ? (
            <textarea
              required={f.required}
              value={value[f.key] || ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              placeholder={f.placeholder}
              rows={2}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : f.type === 'select' ? (
            <select
              required={f.required}
              value={value[f.key] || ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select --</option>
              {(f.options || []).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            // A field's unit sits inside the box: `prefix` before the value
            // (₱ for amounts), `suffix` after it (sq m for areas).
            <div className={`flex items-stretch w-full border rounded-lg overflow-hidden bg-white dark:bg-slate-800 focus-within:ring-2 ${
              error
                ? 'border-red-400 dark:border-red-500 focus-within:ring-red-500'
                : 'border-slate-200 dark:border-slate-700 focus-within:ring-blue-500'
            }`}>
              {f.prefix && (
                <span className="flex items-center px-3 bg-slate-50 dark:bg-slate-700/60 border-r border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200">
                  {f.prefix}
                </span>
              )}
              <input
                type={['number', 'date', 'tel'].includes(f.type) ? f.type : 'text'}
                required={f.required}
                value={value[f.key] || ''}
                onChange={(e) => onChange(f.key, e.target.value)}
                placeholder={f.placeholder || (f.type === 'tel' ? '09XXXXXXXXX' : undefined)}
                // Quantities and amounts are always greater than zero; counts are whole numbers.
                {...(f.type === 'number' && {
                  min: f.integer ? 1 : 0.01,
                  step: f.integer ? 1 : 0.01,
                  inputMode: f.integer ? 'numeric' : 'decimal',
                  onKeyDown: blockInvalidNumberKeys(f),
                })}
                aria-invalid={Boolean(error)}
                className="flex-1 min-w-0 bg-transparent text-slate-900 dark:text-slate-100 p-2 text-sm focus:outline-none"
              />
              {f.suffix && (
                <span className="flex items-center px-3 bg-slate-50 dark:bg-slate-700/60 border-l border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {f.suffix}
                </span>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
          )}

          {f.help_text && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{f.help_text}</p>}
        </div>
        );
      })}
    </div>
  );
}
