import { PrinterIcon } from '../Icons';

// Same "print just this one element" technique as PrintableQRSlip.jsx, tuned
// for a full A4/Letter page rather than a small slip.
const PRINT_STYLES = `
  @page { size: A4; margin: 15mm; }
  @media print {
    body * { visibility: hidden; }
    .doc-form-printable, .doc-form-printable * { visibility: visible; }
    .doc-form-printable { position: absolute; top: 0; left: 0; width: 100%; margin: 0; box-shadow: none; border: none; }
    .doc-form-no-print { display: none !important; }
  }
`;

const HIDDEN_FORM_KEYS = new Set(['date']); // shown separately as "Date Submitted"

function humanizeKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PrintableDocumentForm({ document, onClose }) {
  if (!document) return null;

  const qrSrc = document.qr_code
    ? (document.qr_code.startsWith('http') ? document.qr_code : `http://127.0.0.1:8000${document.qr_code}`)
    : null;

  const scopeLabel = document.document_type_scope === 'internal' ? 'INTERNAL' : 'EXTERNAL';
  const formEntries = Object.entries(document.form_data || {}).filter(
    ([key, value]) => !HIDDEN_FORM_KEYS.has(key) && value
  );
  const steps = document.document_type_steps || [];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in overflow-y-auto">
      <style>{PRINT_STYLES}</style>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 modal-pop-in overflow-hidden">
        <div className="doc-form-no-print flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Official Document Request Form</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>

        {/* Printable form content */}
        <div className="doc-form-printable p-8 sm:p-10">
          {/* Letterhead */}
          <div className="text-center border-b-2 border-slate-800 pb-4">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Republic of the Philippines</p>
            <p className="text-xs text-slate-600">Province of Quezon</p>
            <p className="text-sm font-bold text-slate-900 mt-1">MUNICIPALITY OF SARIAYA</p>
            <p className="text-sm font-bold text-slate-900">Office of the Municipal Administrator</p>
          </div>

          <div className="flex items-start justify-between mt-6">
            <div>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-wide">
                Official Document Request Form
              </h1>
              <p className="font-mono font-bold text-blue-700 mt-1">{document.tracking_number}</p>
              <span className="inline-block mt-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-slate-800 text-white">
                {scopeLabel}
              </span>
            </div>
            {qrSrc && (
              <img src={qrSrc} alt="QR Code" className="w-24 h-24 bg-white p-1 border border-slate-200 rounded-lg shrink-0" />
            )}
          </div>

          {/* Applicant / request details */}
          <div className="mt-6">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">
              Request Details
            </p>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 pr-4 text-slate-500 w-1/3">Document Type</td>
                  <td className="py-1.5 font-semibold text-slate-900">{document.document_type_name}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 pr-4 text-slate-500">Date Submitted</td>
                  <td className="py-1.5 font-semibold text-slate-900">
                    {new Date(document.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                  </td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 pr-4 text-slate-500">Requested By</td>
                  <td className="py-1.5 font-semibold text-slate-900">{document.requested_by_name}</td>
                </tr>
                {formEntries.map(([key, value]) => (
                  <tr key={key} className="border-b border-slate-100">
                    <td className="py-1.5 pr-4 text-slate-500">{humanizeKey(key)}</td>
                    <td className="py-1.5 font-semibold text-slate-900">{String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Routing checklist */}
          <div className="mt-6">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">
              Routing Checklist
            </p>
            {steps.length === 0 ? (
              <p className="text-sm text-slate-400">No routing steps configured.</p>
            ) : (
              <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-[10px] font-black text-slate-400 uppercase w-10">✓</th>
                    <th className="text-left px-3 py-2 text-[10px] font-black text-slate-400 uppercase">Step</th>
                    <th className="text-left px-3 py-2 text-[10px] font-black text-slate-400 uppercase">Office</th>
                    <th className="text-left px-3 py-2 text-[10px] font-black text-slate-400 uppercase">Action Required</th>
                    <th className="text-left px-3 py-2 text-[10px] font-black text-slate-400 uppercase">SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((step, idx) => {
                    const isDone = idx < document.route_position;
                    const isCurrent = idx === document.route_position && document.status !== 'released';
                    return (
                      <tr key={step.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-center">
                          {isDone ? (
                            <span className="text-green-600 font-black">✓</span>
                          ) : (
                            <span className="inline-block w-3.5 h-3.5 border-2 border-slate-300 rounded-sm"></span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-700">{step.step_number}</td>
                        <td className={`px-3 py-2 font-semibold ${isCurrent ? 'text-amber-700' : 'text-slate-800'}`}>
                          {step.office?.name || step.office?.code}
                          {isCurrent && <span className="ml-1.5 text-[9px] font-black uppercase text-amber-600">(current)</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{step.action_required || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{step.max_hours_allowed}h</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Signature footer */}
          <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
            <div>
              <div className="border-b border-slate-400 h-10"></div>
              <p className="text-xs text-slate-500 mt-1">Requested by (Signature over Printed Name)</p>
            </div>
            <div>
              <div className="border-b border-slate-400 h-10"></div>
              <p className="text-xs text-slate-500 mt-1">Received by — Office use only (Signature / Date)</p>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 mt-8 text-center">
            This form was generated by the Sariaya Document Tracking System. Track this request anytime at /track/{document.tracking_number}
          </p>
        </div>

        <div className="doc-form-no-print flex gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl transition-colors"
          >
            <PrinterIcon className="w-4 h-4" /> Print Official Form
          </button>
        </div>
      </div>
    </div>
  );
}
