import { useState, useEffect, useRef } from 'react';
import {
  fetchDocumentType, fetchGeneratedDocument, saveGeneratedDocumentDraft,
  generateDocument, previewGeneratedDocument,
} from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';
import { PrinterIcon } from '../Icons';

const DEFAULT_SECTION = 'Document Information';
const SUFFIX_OPTIONS = ['Jr.', 'Sr.', 'II', 'III', 'IV'];

// Groups fields by DocumentTemplateField.section (falling back to a generic
// label for anything unset), preserving each field's own `order` within its
// group and the natural (first-seen) order of the sections themselves —
// no separate "section order" concept needed.
function groupBySection(fields) {
  const sections = new Map();
  for (const field of fields) {
    const key = field.section || DEFAULT_SECTION;
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key).push(field);
  }
  return Array.from(sections.entries());
}

// Whether `value` counts as "filled in" for one field — mirrors
// views.py::_field_has_value() so the client can block a Generate attempt
// with the same rule the server will enforce anyway, but with immediate,
// per-field feedback instead of a round-trip.
function fieldHasValue(field, value) {
  if (field.field_type === 'name') {
    if (value && typeof value === 'object') {
      return Boolean((value.first || '').trim()) && Boolean((value.last || '').trim());
    }
    return Boolean(value && String(value).trim());
  }
  return value !== undefined && value !== null && String(value).trim() !== '';
}

// One control per field_type. 'name' is the odd one out — it renders four
// separate First/Middle/Last/Suffix inputs instead of a single box, but the
// result is still stored under this one field's key (as {first, middle,
// last, suffix}) and joined into a single rendered line server-side — see
// DocumentTemplateField.FieldType.NAME's docstring.
function FieldControl({ field, value, onChange, error }) {
  const baseClass = `w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    error ? 'border-red-300 dark:border-red-500/50' : 'border-slate-200 dark:border-slate-700'
  }`;

  if (field.field_type === 'name') {
    const nameValue = value && typeof value === 'object' ? value : {};
    const legacyValue = value && typeof value !== 'object' ? String(value) : '';
    const update = (part, partValue) => onChange({ ...nameValue, [part]: partValue });

    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">First Name</label>
          <input value={nameValue.first || ''} onChange={(e) => update('first', e.target.value)}
            placeholder="Juan" className={baseClass} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">Middle Name</label>
          <input value={nameValue.middle || ''} onChange={(e) => update('middle', e.target.value)}
            placeholder="Dela Cruz" className={baseClass} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">Last Name</label>
          <input value={nameValue.last || ''} onChange={(e) => update('last', e.target.value)}
            placeholder="Santos" className={baseClass} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">Suffix</label>
          <select value={nameValue.suffix || ''} onChange={(e) => update('suffix', e.target.value)}
            className={baseClass}>
            <option value="">—</option>
            {SUFFIX_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {legacyValue && (
          <p className="col-span-2 text-[11px] text-amber-600 dark:text-amber-400">
            Previously saved as "{legacyValue}" — fill in the split fields above to update it.
          </p>
        )}
      </div>
    );
  }

  if (field.field_type === 'textarea') {
    return (
      <textarea rows={2} value={value || ''} onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder} className={baseClass} />
    );
  }

  if (field.field_type === 'select') {
    return (
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={baseClass}>
        <option value="">-- Select --</option>
        {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }

  if (field.field_type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 mt-1">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)}
          className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500" />
        {field.placeholder || 'Yes'}
      </label>
    );
  }

  const inputType = field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text';
  return (
    <input type={inputType} value={value || ''} onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder} className={baseClass} />
  );
}

/**
 * Staff/Admin-only "Fill / Generate Document" workflow — opens from
 * DocumentFormModal's Official Document section. Renders the document
 * type's template_fields as an editable form, grouped into the sections an
 * admin configured (DocumentTemplateField.section), each using the input
 * control appropriate to its field_type — pre-filled from the citizen's
 * original request via source_request_key, or from a previously-saved
 * draft. Lets staff Save Draft, Preview, or Generate/Update the actual
 * overlaid PDF (see document_generation.py).
 * Never reachable by citizens — the parent only renders the button that
 * opens this for admin/employee roles.
 */
export default function DocumentGenerateModal({ documentId, documentTypeId, onClose, onGenerated }) {
  const { showToast } = useToast();
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [nameReferenceValues, setNameReferenceValues] = useState({});
  const [status, setStatus] = useState('draft');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const previewFrameRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchDocumentType(documentTypeId),
      fetchGeneratedDocument(documentId),
    ])
      .then(([typeRes, genRes]) => {
        setFields(typeRes.data.template_fields || []);
        setValues(genRes.data.field_values || {});
        setNameReferenceValues(genRes.data.name_reference_values || {});
        setStatus(genRes.data.status || 'draft');
      })
      .catch((err) => {
        showToast(extractErrorMessage(err, "Couldn't load this document's fill form."), 'error');
      })
      .finally(() => setLoading(false));
  }, [documentId, documentTypeId]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const handleChange = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((e) => { const next = { ...e }; delete next[key]; return next; });
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await saveGeneratedDocumentDraft(documentId, values);
      showToast('Draft saved.', 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, "Couldn't save the draft."), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await previewGeneratedDocument(documentId, values);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(res.data));
    } catch (err) {
      showToast(extractErrorMessage(err, "Couldn't render a preview."), 'error');
    } finally {
      setPreviewing(false);
    }
  };

  // Client-side mirror of the server's required-field check (views.py::
  // _field_has_value()) — catches the common case instantly, with the
  // server as the authoritative backstop (never rely on this alone).
  const validate = () => {
    const errors = {};
    for (const field of fields) {
      if (field.required && !fieldHasValue(field, values[field.key])) {
        errors[field.key] = field.field_type === 'name'
          ? 'First and last name are required.'
          : 'This field is required.';
      }
    }
    return errors;
  };

  const handleGenerate = async () => {
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      showToast('Please fill in all required fields before generating.', 'error');
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const res = await generateDocument(documentId, values);
      setStatus(res.data.status);
      showToast(
        status === 'generated' ? 'Document updated.' : 'Document generated.',
        'success',
      );
      onGenerated?.();
    } catch (err) {
      showToast(extractErrorMessage(err, "Couldn't generate the document."), 'error');
    } finally {
      setSaving(false);
    }
  };

  const sections = groupBySection(fields);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl dark:shadow-none w-full max-w-5xl max-h-[90vh] overflow-hidden modal-pop-in flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Fill / Generate Official Document</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Values already on the citizen's request are pre-filled — edit anything that needs it.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl">×</button>
        </div>

        {loading ? (
          <p className="text-slate-400 dark:text-slate-500 text-center py-16">Loading…</p>
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 min-w-0">
            <div className="space-y-5 min-w-0">
              {fields.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">No fillable fields are configured for this document type yet.</p>
              ) : (
                sections.map(([sectionName, sectionFields]) => (
                  <div key={sectionName} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-xl p-4">
                    <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                      {sectionName}
                    </p>
                    <div className="space-y-4">
                      {sectionFields.map((field) => (
                        <div key={field.key} className="min-w-0">
                          {field.field_type !== 'checkbox' && (
                            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1 break-words">
                              {field.label}
                              {field.required && <span className="text-red-500"> *</span>}
                              {field.source_request_key && field.field_type !== 'name' && (
                                <span className="ml-1.5 normal-case font-medium text-blue-500 dark:text-blue-400">(from request)</span>
                              )}
                            </label>
                          )}
                          <FieldControl
                            field={field}
                            value={values[field.key]}
                            onChange={(val) => handleChange(field.key, val)}
                            error={fieldErrors[field.key]}
                          />
                          {field.field_type === 'name' && nameReferenceValues[field.key] && (
                            <p className="text-[11px] text-blue-500 dark:text-blue-400 mt-1 break-words">
                              As entered in original request: "{nameReferenceValues[field.key]}"
                            </p>
                          )}
                          {fieldErrors[field.key] && (
                            <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{fieldErrors[field.key]}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden min-w-0">
              {previewUrl ? (
                <iframe ref={previewFrameRef} src={previewUrl} title="Preview" className="w-full h-full min-h-[50vh]" />
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500 min-h-[50vh] text-center px-4">
                  Click Preview to see the filled document
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            onClick={handleSaveDraft}
            disabled={saving || loading}
            className="flex-1 min-w-[8rem] py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-60 transition-colors"
          >
            Save Draft
          </button>
          <button
            onClick={handlePreview}
            disabled={previewing || loading}
            className="flex-1 min-w-[8rem] flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 disabled:opacity-60 transition-colors"
          >
            <PrinterIcon className="w-4 h-4" /> {previewing ? 'Rendering…' : 'Preview'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={saving || loading}
            className="flex-1 min-w-[10rem] py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving ? 'Working…' : status === 'generated' ? 'Update Document' : 'Generate Document'}
          </button>
        </div>
      </div>
    </div>
  );
}
