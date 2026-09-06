import { PrinterIcon } from '../Icons';

// Everything outside .qr-slip-printable is hidden at print time, and the
// printable block is pulled out of normal flow to fill the page — the
// standard "print just this one element" trick, done in plain CSS since
// Tailwind has no print-scoped visibility utility for an arbitrary subtree.
const PRINT_STYLES = `
  @media print {
    body * { visibility: hidden; }
    .qr-slip-printable, .qr-slip-printable * { visibility: visible; }
    .qr-slip-printable { position: absolute; top: 0; left: 0; width: 100%; margin: 0; box-shadow: none; border: none; }
    .qr-slip-no-print { display: none !important; }
  }
`;

export default function PrintableQRSlip({ document, onClose }) {
  if (!document) return null;

  const qrSrc = document.qr_code
    ? (document.qr_code.startsWith('http') ? document.qr_code : `http://127.0.0.1:8000${document.qr_code}`)
    : null;

  const firstDestination = document.route?.[0] || document.current_office || '—';
  const scopeLabel = document.document_type_scope === 'internal' ? 'INTERNAL' : 'EXTERNAL';
  const scopeStyle = document.document_type_scope === 'internal'
    ? 'bg-slate-800 text-white'
    : 'bg-blue-600 text-white';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in qr-slip-no-print-parent">
      <style>{PRINT_STYLES}</style>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm modal-pop-in overflow-hidden">
        <div className="qr-slip-no-print flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Document QR Slip</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>

        {/* Printable slip content */}
        <div className="qr-slip-printable p-8 text-center border-2 border-dashed border-slate-300 m-4 rounded-2xl">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
            Sariaya Office of the Municipal Administrator
          </p>
          <p className="text-sm font-bold text-slate-700 mt-0.5">Document Tracking Slip</p>

          <div className="mt-4 flex justify-center">
            {qrSrc ? (
              <img src={qrSrc} alt="QR Code" className="w-48 h-48 bg-white p-2 border border-slate-200 rounded-lg" />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                No QR generated
              </div>
            )}
          </div>

          <p className="font-mono font-black text-slate-900 text-lg mt-4 tracking-wider">
            {document.tracking_number}
          </p>

          <span className={`inline-block mt-2 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${scopeStyle}`}>
            {scopeLabel}
          </span>

          <div className="mt-6 text-left space-y-2.5 text-sm border-t border-slate-100 pt-5">
            <div className="flex justify-between">
              <span className="text-slate-400 text-xs uppercase font-bold tracking-wide">Document</span>
              <span className="font-bold text-slate-900 text-right">{document.document_type_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-xs uppercase font-bold tracking-wide">Date Submitted</span>
              <span className="font-medium text-slate-700">
                {new Date(document.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-xs uppercase font-bold tracking-wide">First Destination</span>
              <span className="font-medium text-slate-700">{firstDestination}</span>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 mt-6">
            Present or scan this slip to follow up. Track anytime at /track/{document.tracking_number}
          </p>
        </div>

        <div className="qr-slip-no-print flex gap-3 px-6 py-4 border-t border-slate-100">
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
            <PrinterIcon className="w-4 h-4" /> Print
          </button>
        </div>
      </div>
    </div>
  );
}
