import { useState, useEffect } from 'react';
import { fetchDocumentTypes, createDocument } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';
import DocumentRequestFields from '../documents/DocumentRequestFields';
import CitizenPicker from '../documents/CitizenPicker';
import PrintableQRSlip from '../admin/PrintableQRSlip';
import PrintableDocumentForm from '../admin/PrintableDocumentForm';
import { PrinterIcon } from '../Icons';

const PURPOSE_OPTIONS = [
  { value: 'external', label: 'External Documents', hint: 'For citizens' },
  { value: 'internal', label: 'Internal Documents', hint: 'Municipal / internal use' },
];

export default function NewRequestModal({ onClose, onCreated }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [types, setTypes] = useState([]);
  const [purpose, setPurpose] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(null);
  const [showSlip, setShowSlip] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({});
  const [citizen, setCitizen] = useState(null);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [copyPreference, setCopyPreference] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    fetchDocumentTypes().then(res => setTypes(res.data));
  }, []);

  // Clear out any fields left over from a previously-selected document
  // type — a Business Permit's fields have no business showing up (or being
  // submitted) once the user switches to Birth Certificate.
  useEffect(() => {
    setFormData({});
  }, [selectedTypeId]);

  // Document Purpose (DocumentType.scope) gates which types are even
  // selectable — the same type name (e.g. "Mayor's Permit") can exist as
  // both an internal and an external row, each its own independent entry.
  const typesForPurpose = types.filter((t) => t.scope === purpose);

  // If the purpose changes and the previously-selected type no longer
  // belongs to it, drop the selection rather than silently submitting a
  // type that doesn't match what's now showing in the dropdown.
  useEffect(() => {
    if (selectedTypeId && !typesForPurpose.some((t) => String(t.id) === String(selectedTypeId))) {
      setSelectedTypeId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose]);

  // Internal Documents have no citizen at all — the requester is whoever's
  // logged in. Auto-fill (and lock) name/email from the staff/admin's own
  // account, and drop any citizen account link that might still be set from
  // a previous External selection. Switching back to External clears the
  // auto-filled values so they don't get mistaken for real citizen info.
  useEffect(() => {
    if (purpose === 'internal') {
      setCitizen(null);
      setGuestName(user?.full_name || '');
      setGuestEmail(user?.email || '');
    } else if (purpose === 'external') {
      setGuestName('');
      setGuestEmail('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose]);

  const selectedType = types.find((t) => String(t.id) === String(selectedTypeId));
  const limitReached = selectedType?.daily_limit != null && selectedType.requests_today >= selectedType.daily_limit;

  const handleSubmit = async (e) => {
    e.preventDefault();

    const nextFieldErrors = {};
    if (!purpose) nextFieldErrors.purpose = 'Please select Internal or External Documents.';
    if (!citizen && !guestName.trim()) nextFieldErrors.guest_name = "Please enter the requestor's name.";
    if (!citizen && !guestEmail.trim()) nextFieldErrors.guest_email = "Please enter the requestor's email address.";
    if (!selectedTypeId) nextFieldErrors.document_type = 'Please select a document type.';
    if (!copyPreference) nextFieldErrors.copy_preference = 'Please select Hard Copy or Soft Copy.';

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      showToast('Please fill in all required fields.', 'error');
      return;
    }
    if (limitReached) return showToast('Daily limit reached for this document type.', 'error');

    setFieldErrors({});
    setLoading(true);
    try {
      const res = await createDocument({
        document_type: selectedTypeId,
        form_data: formData,
        copy_preference: copyPreference,
        ...(citizen ? { requested_by: citizen.id } : { guest_name: guestName, guest_email: guestEmail }),
      });
      showToast('Document request created successfully.', 'success');
      setCreated(res.data);
      onCreated(); // tell parent to refresh in the background; modal stays open to offer the QR slip
    } catch (err) {
      showToast(extractErrorMessage(err, "We couldn't save your document request. Please try again."), 'error');
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 modal-pop-in text-center">
          <h2 className="text-2xl font-bold text-slate-900">Request Created</h2>
          <p className="font-mono text-blue-600 font-bold mt-2 bg-blue-50 inline-block px-3 py-1 rounded-lg">
            {created.tracking_number}
          </p>
          <p className="text-slate-500 mt-3">
            Print the QR slip now, or find it again later from this document's detail view.
          </p>

          <button
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-bold shadow-lg shadow-blue-200 mt-6"
          >
            <PrinterIcon className="w-4 h-4" /> Print Official Form
          </button>
          <button
            onClick={() => setShowSlip(true)}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white rounded-xl py-3 font-bold mt-2"
          >
            <PrinterIcon className="w-4 h-4" /> Print QR Slip
          </button>
          <button onClick={onClose} className="w-full py-3 text-slate-500 font-bold mt-1">
            Done
          </button>
        </div>
        {showSlip && <PrintableQRSlip document={created} onClose={() => setShowSlip(false)} />}
        {showForm && <PrintableDocumentForm document={created} onClose={() => setShowForm(false)} />}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      {/* max-h + flex-col keeps this modal from ever exceeding the viewport;
          the form below splits into a scrollable field area and a footer
          that's a true flex sibling (not just `sticky`), so Cancel/Save are
          always on-screen regardless of how tall the fields get — no
          browser zoom-out needed. */}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[85vh] modal-pop-in flex flex-col overflow-hidden">
        <div className="shrink-0 px-8 pt-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">New Document Request</h2>
          <p className="text-slate-500 mb-2">Select a document and fill out the details.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-8 py-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Document Purpose
              </label>
              <div className="grid grid-cols-2 gap-3">
                {PURPOSE_OPTIONS.map(({ value, label, hint }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPurpose(value)}
                    className={`rounded-xl py-3 text-sm font-bold border-2 transition-colors ${
                      purpose === value
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {label}
                    <span className="block text-[10px] font-normal opacity-70">{hint}</span>
                  </button>
                ))}
              </div>
              {fieldErrors.purpose && <p className="text-xs text-red-600 mt-1">{fieldErrors.purpose}</p>}
            </div>

            <CitizenPicker
              value={citizen}
              onChange={setCitizen}
              guestName={guestName}
              onGuestNameChange={setGuestName}
              guestEmail={guestEmail}
              onGuestEmailChange={setGuestEmail}
              errors={fieldErrors}
              readOnly={purpose === 'internal'}
            />

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Select Document Type</label>
              <select
                className="w-full border border-slate-200 rounded-xl p-3 bg-slate-50 focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                value={selectedTypeId}
                onChange={(e) => setSelectedTypeId(e.target.value)}
                disabled={!purpose}
                required
              >
                <option value="">{purpose ? '-- Choose Option --' : '-- Select a document purpose first --'}</option>
                {typesForPurpose.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {fieldErrors.document_type && <p className="text-xs text-red-600 mt-1">{fieldErrors.document_type}</p>}
              {purpose && typesForPurpose.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  No {purpose} document types yet — an admin needs to create one in Workflow Builder first.
                </p>
              )}
              {selectedType?.daily_limit != null && (
                <p className={`text-xs mt-1 ${limitReached ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                  {limitReached
                    ? `Daily limit reached (${selectedType.requests_today}/${selectedType.daily_limit}) — try again tomorrow.`
                    : `${selectedType.requests_today}/${selectedType.daily_limit} requests used today.`}
                </p>
              )}
            </div>

            {selectedTypeId && (
              <div className="border-t border-slate-100 pt-6 mt-6 animate-in fade-in duration-500 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Delivery Type
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[['hard', 'Hard Copy'], ['soft', 'Soft Copy']].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setCopyPreference(value)}
                        className={`rounded-xl py-3 text-sm font-bold border-2 transition-colors ${
                          copyPreference === value
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {fieldErrors.copy_preference && <p className="text-xs text-red-600 mt-1">{fieldErrors.copy_preference}</p>}
                </div>

                <DocumentRequestFields
                  fields={selectedType?.request_fields}
                  value={formData}
                  onChange={(key, val) => setFormData((f) => ({ ...f, [key]: val }))}
                />
              </div>
            )}
          </div>

          <div className="shrink-0 flex gap-3 px-8 py-5 border-t border-slate-100">
            <button type="button" onClick={onClose} className="flex-1 py-3 text-slate-500 font-bold">Cancel</button>
            <button
              type="submit"
              disabled={loading || limitReached}
              className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-bold shadow-lg shadow-blue-200 disabled:opacity-60"
            >
              {loading ? 'Processing...' : limitReached ? 'Daily limit reached' : 'Save Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
