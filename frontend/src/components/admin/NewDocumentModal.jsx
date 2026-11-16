import { useState, useEffect } from 'react';
import { fetchDocumentTypes, createDocument } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';
import { hasInvalidContactNumber } from '../../utils/contactNumber';
import { hasInvalidNumber } from '../../utils/positiveNumber';
import DocumentRequestFields from '../documents/DocumentRequestFields';
import CitizenPicker from '../documents/CitizenPicker';
import PrintableQRSlip from './PrintableQRSlip';
import PrintableDocumentForm from './PrintableDocumentForm';
import { PrinterIcon } from '../Icons';

export default function NewDocumentModal({ onClose, onCreated }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [types, setTypes] = useState([]);
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [citizen, setCitizen] = useState(null);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  // Set once, right after creation, so the modal can offer "Print QR Slip"
  // immediately instead of closing straight away.
  const [created, setCreated] = useState(null);
  const [showSlip, setShowSlip] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Populated from GET /api/documents/types/ — any document type an admin
  // creates in the Workflow Builder shows up here automatically.
  useEffect(() => {
    fetchDocumentTypes().then((res) => setTypes(res.data));
  }, []);

  // Clear stale field values from a previously-selected document type.
  useEffect(() => {
    setForm({});
  }, [documentTypeId]);

  // Internal vs External is never asked: it comes from the chosen document
  // type itself (DocumentType.scope). Only types whose workflow starts at
  // this user's office can be created (see can_create).
  const creatableTypes = types.filter((t) => t.can_create);
  const externalTypes = creatableTypes.filter((t) => t.scope === 'external');
  const internalTypes = creatableTypes.filter((t) => t.scope === 'internal');
  const notAllowedCount = types.length - creatableTypes.length;

  const selectedType = types.find((t) => String(t.id) === String(documentTypeId));
  // Internal documents belong to the office that files them: no citizen, no guest details.
  const isInternal = selectedType?.scope === 'internal';
  const limitReached = selectedType?.daily_limit != null && selectedType.requests_today >= selectedType.daily_limit;
  const contactNumberInvalid = Boolean(documentTypeId) && hasInvalidContactNumber(selectedType?.request_fields, form);
  const numberInvalid = Boolean(documentTypeId) && hasInvalidNumber(selectedType?.request_fields, form);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // The Enter key can still submit past the disabled button; the inline
    // error is already showing under the field.
    if (contactNumberInvalid || numberInvalid) return;

    const nextFieldErrors = {};
    if (!isInternal && !citizen && !guestName.trim()) nextFieldErrors.guest_name = "Please enter the requesting citizen's name.";
    if (!isInternal && !citizen && !guestEmail.trim()) nextFieldErrors.guest_email = "Please enter the requesting citizen's email address.";
    if (!documentTypeId) nextFieldErrors.document_type = 'Please select a document type.';

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError('Please fill in all required fields.');
      return;
    }

    setFieldErrors({});
    setError('');
    setLoading(true);
    try {
      const res = await createDocument({
        document_type: documentTypeId,
        form_data: form,
        ...(isInternal ? {} : citizen ? { requested_by: citizen.id } : { guest_name: guestName, guest_email: guestEmail }),
      });
      showToast('Document request created successfully.', 'success');
      setCreated(res.data);
      onCreated(); // tell parent to refresh the table now; modal stays open to offer the QR slip
    } catch (err) {
      setError(extractErrorMessage(err, "We couldn't save your document request. Please try again."));
      const typeError = err.response?.data?.document_type;
      if (typeError) setFieldErrors({ document_type: Array.isArray(typeError) ? typeError[0] : typeError });
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    // Auto-forward (CreateDocumentSerializer): if status came back as
    // in_transit, the document was immediately released toward Step 2 on
    // creation — no separate manual "Release" step needed. It stays
    // in_progress (this block doesn't show) if the creator wasn't actually
    // staff at the document's own origin office, in which case the usual
    // manual release flow still applies.
    const autoForwarded = created.status === 'in_transit';
    const nextOfficeName = autoForwarded
      ? created.document_type_steps?.[created.route_position + 1]?.office?.name
        || created.document_type_steps?.[created.route_position + 1]?.office?.code
      : null;

    return (
      <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4 overlay-fade-in">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md p-7 modal-pop-in text-center">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Document Request Created</h2>
          <p className="font-mono text-blue-600 dark:text-blue-400 font-bold mt-2 bg-blue-50 dark:bg-blue-500/10 inline-block px-3 py-1 rounded-lg">
            {created.tracking_number}
          </p>
          {autoForwarded && nextOfficeName && (
            <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/30 rounded-lg px-3 py-2 mt-3">
              Document created successfully and automatically routed to <strong>{nextOfficeName}</strong> for the next process.
            </p>
          )}
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
            Print the QR slip now to hand to the requester, or continue later from the document's detail view.
          </p>

          <button
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl mt-6 transition-colors"
          >
            <PrinterIcon className="w-4 h-4" /> Print Official Form
          </button>
          <button
            onClick={() => setShowSlip(true)}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 text-white font-bold py-3 rounded-xl mt-2 transition-colors"
          >
            <PrinterIcon className="w-4 h-4" /> Print QR Slip
          </button>
          <button
            onClick={onClose}
            className="w-full text-slate-500 dark:text-slate-400 font-medium py-3 mt-1"
          >
            Done
          </button>
        </div>
        {showSlip && <PrintableQRSlip document={created} onClose={() => setShowSlip(false)} />}
        {showForm && <PrintableDocumentForm document={created} onClose={() => setShowForm(false)} />}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4 overlay-fade-in">
      {/* max-h + flex-col keeps this modal from ever exceeding the viewport;
          the form below splits into a scrollable field area and a footer
          that's a true flex sibling (not just `sticky`), so the submit
          button is always on-screen regardless of how tall the fields get —
          no browser zoom-out needed. */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] modal-pop-in flex flex-col overflow-hidden">
        <div className="shrink-0 px-7 pt-7">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">New Document Request</h2>
            <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl">×</button>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Log a new document entering the workflow.</p>

          {error && (
            <div className="mt-4 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 mt-5">
          <div className="flex-1 overflow-y-auto px-7 space-y-4">

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Document type <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={documentTypeId}
                onChange={(e) => setDocumentTypeId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 dark:disabled:bg-slate-800/50 disabled:text-slate-400 dark:disabled:text-slate-500"
              >
                <option value="">Select a document type…</option>
                {externalTypes.length > 0 && (
                  <optgroup label="For citizens (External)">
                    {externalTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                )}
                {internalTypes.length > 0 && (
                  <optgroup label="Internal office documents">
                    {internalTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                )}
              </select>
              {fieldErrors.document_type && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.document_type}</p>}
              {creatableTypes.length === 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {notAllowedCount > 0
                    ? `None of the document types start at your office (${user?.office || 'none assigned'}). Only the office at Step 1 of a workflow can create its requests.`
                    : 'No document types yet — an admin needs to create one in Workflow Builder first.'}
                </p>
              )}
              {creatableTypes.length > 0 && notAllowedCount > 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Showing only the document types that start at your office.
                </p>
              )}
              {selectedType?.daily_limit != null && (
                <p className={`text-xs mt-1 ${limitReached ? 'text-red-600 dark:text-red-400 font-bold' : 'text-slate-400 dark:text-slate-500'}`}>
                  {limitReached
                    ? `Daily limit reached (${selectedType.requests_today}/${selectedType.daily_limit}) — try again tomorrow.`
                    : `${selectedType.requests_today}/${selectedType.daily_limit} requests used today.`}
                </p>
              )}
            </div>

            {selectedType && (isInternal ? (
              <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2">
                <span className="font-bold">Internal document</span> — requested by your office ({user?.office || '—'}) as {user?.full_name}.
              </p>
            ) : (
              <CitizenPicker
                value={citizen}
                onChange={setCitizen}
                guestName={guestName}
                onGuestNameChange={setGuestName}
                guestEmail={guestEmail}
                onGuestEmailChange={setGuestEmail}
                errors={fieldErrors}
              />
            ))}

            {documentTypeId && (
              <DocumentRequestFields
                fields={selectedType?.request_fields}
                value={form}
                onChange={(key, val) => setForm((f) => ({ ...f, [key]: val }))}
              />
            )}
          </div>

          <div className="shrink-0 px-7 py-5 mt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="submit" disabled={loading || limitReached || contactNumberInvalid || numberInvalid}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg py-2.5 transition-colors">
              {loading ? 'Creating…' : limitReached ? 'Daily limit reached' : 'Create document request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
