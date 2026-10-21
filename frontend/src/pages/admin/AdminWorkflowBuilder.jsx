import { useState, useEffect, useCallback } from 'react';
import {
  fetchAllDocumentTypes, createDocumentType, updateDocumentType,
  deleteDocumentType, saveWorkflowSteps, fetchOffices,
} from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { ClipboardListIcon, FileTextIcon } from '../../components/Icons';
import { Link } from 'react-router-dom';

const BLANK_STEP = () => ({ office: '', action_required: '', max_hours_allowed: 24 });

export default function AdminWorkflowBuilder() {
  const { showToast } = useToast();
  const [types, setTypes] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  // Active offices for the step editor's dynamic dropdown — pulled straight
  // from the Office catalog, so a newly-created office is selectable the
  // moment it exists, with zero hardcoding.
  const [offices, setOffices] = useState([]);

  const [details, setDetails] = useState({ name: '', description: '', scope: 'external', is_active: true });
  const [steps, setSteps] = useState([]);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingSteps, setSavingSteps] = useState(false);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newType, setNewType] = useState({ name: '', description: '', scope: 'external' });
  const [creating, setCreating] = useState(false);

  const loadTypes = useCallback((keepSelection = true) => {
    setLoadingTypes(true);
    fetchAllDocumentTypes()
      .then((res) => {
        setTypes(res.data);
        if (!keepSelection && res.data.length > 0) {
          setSelectedId(res.data[0].id);
        }
      })
      .finally(() => setLoadingTypes(false));
  }, []);

  useEffect(() => { loadTypes(false); }, [loadTypes]);
  useEffect(() => { fetchOffices().then((res) => setOffices(res.data)); }, []);

  // Load the selected type's details + steps into the builder whenever the
  // selection changes or the type list is refreshed. Steps come back from
  // the API with a nested `office` object — flatten it to just the id for
  // the <select>'s value, which the dropdown re-expands via `offices`.
  useEffect(() => {
    if (!selectedId) return;
    const type = types.find((t) => t.id === selectedId);
    if (!type) return;
    setDetails({ name: type.name, description: type.description, scope: type.scope, is_active: type.is_active });
    setSteps(
      type.steps.length > 0
        ? type.steps.map((s) => ({ ...s, office: s.office.id }))
        : [BLANK_STEP()]
    );
  }, [selectedId, types]);

  const selectedType = types.find((t) => t.id === selectedId);

  const handleCreateType = async (e) => {
    e.preventDefault();
    if (!newType.name.trim()) return;
    setCreating(true);
    try {
      const res = await createDocumentType(newType);
      showToast(`Document type "${res.data.name}" created.`, 'success');
      setNewType({ name: '', description: '', scope: 'external' });
      setShowNewForm(false);
      loadTypes();
      setSelectedId(res.data.id);
    } catch (err) {
      showToast(err.response?.data?.name?.[0] || 'Failed to create document type.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveDetails = async () => {
    setSavingDetails(true);
    try {
      await updateDocumentType(selectedId, details);
      showToast('Document type details saved.', 'success');
      loadTypes();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to save details.', 'error');
    } finally {
      setSavingDetails(false);
    }
  };

  const handleDeleteType = async () => {
    if (!window.confirm(`Delete "${details.name}"? This cannot be undone.`)) return;
    try {
      await deleteDocumentType(selectedId);
      showToast('Document type deleted.', 'success');
      setSelectedId(null);
      loadTypes(false);
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to delete document type.', 'error');
    }
  };

  // --- Step editing (client-side array; step_number is renumbered from
  // array position right before saving, so reordering is just moving items) ---

  const updateStep = (index, field, value) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const addStep = () => setSteps((prev) => [...prev, BLANK_STEP()]);

  const removeStep = (index) => setSteps((prev) => prev.filter((_, i) => i !== index));

  const moveStep = (index, direction) => {
    setSteps((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSaveWorkflow = async () => {
    if (steps.length === 0) {
      showToast('Add at least one step before saving.', 'error');
      return;
    }
    if (steps.some((s) => !s.office)) {
      showToast('Every step needs an office assigned.', 'error');
      return;
    }
    const payload = steps.map((s, i) => ({
      step_number: i + 1,
      office: s.office,
      action_required: s.action_required?.trim() || '',
      max_hours_allowed: Number(s.max_hours_allowed) || 24,
    }));
    setSavingSteps(true);
    try {
      const res = await saveWorkflowSteps(selectedId, payload);
      showToast('Workflow saved.', 'success');
      setSteps(res.data.steps.map((s) => ({ ...s, office: s.office.id })));
      loadTypes();
    } catch (err) {
      const detail = err.response?.data?.steps?.[0] || err.response?.data?.detail || 'Failed to save workflow.';
      showToast(detail, 'error');
    } finally {
      setSavingSteps(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 dark:shadow-none">
          <ClipboardListIcon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Workflow Builder</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Define document types and the sequential offices each one routes through.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">

        {/* --- Document Type list --- */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Document Types</p>
            <button
              onClick={() => setShowNewForm((v) => !v)}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              {showNewForm ? 'Cancel' : '+ New'}
            </button>
          </div>

          {showNewForm && (
            <form onSubmit={handleCreateType} className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 space-y-2">
              <input
                required
                placeholder="Type name, e.g. Barangay Clearance"
                value={newType.name}
                onChange={(e) => setNewType({ ...newType, name: e.target.value })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                placeholder="Description (optional)"
                rows={2}
                value={newType.description}
                onChange={(e) => setNewType({ ...newType, description: e.target.value })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={newType.scope}
                onChange={(e) => setNewType({ ...newType, scope: e.target.value })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="external">External — citizen-facing</option>
                <option value="internal">Internal — staff-only</option>
              </select>
              <button type="submit" disabled={creating}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold rounded-lg py-2 transition-colors">
                {creating ? 'Creating…' : 'Create'}
              </button>
            </form>
          )}

          <div className="max-h-[60vh] overflow-y-auto">
            {loadingTypes ? (
              <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-8">Loading…</p>
            ) : types.length === 0 ? (
              <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-8 px-4">No document types yet. Create one to get started.</p>
            ) : (
              types.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between gap-2 transition-colors ${
                    selectedId === t.id ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <FileTextIcon className={`w-4 h-4 shrink-0 ${selectedId === t.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`} />
                    <span className={`text-sm truncate ${selectedId === t.id ? 'font-bold text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {t.name}
                    </span>
                  </span>
                  {!t.is_active && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                      Archived
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* --- Builder panel --- */}
        {!selectedType ? (
          <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-16 text-center">
            <p className="text-slate-400 dark:text-slate-500 font-medium">Select a document type on the left, or create a new one.</p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Details card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Name</label>
                  <input
                    value={details.name}
                    onChange={(e) => setDetails({ ...details, name: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Scope</label>
                  <select
                    value={details.scope}
                    onChange={(e) => setDetails({ ...details, scope: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="external">External — citizen-facing</option>
                    <option value="internal">Internal — staff-only</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Description</label>
                <textarea
                  rows={2}
                  value={details.description}
                  onChange={(e) => setDetails({ ...details, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={details.is_active}
                    onChange={(e) => setDetails({ ...details, is_active: e.target.checked })}
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                  Active (selectable when creating documents)
                </label>
              </div>
              <div className="flex justify-between items-center pt-1">
                <button onClick={handleDeleteType} className="text-xs font-bold text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
                  Delete Document Type
                </button>
                <button
                  onClick={handleSaveDetails}
                  disabled={savingDetails}
                  className="bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 disabled:opacity-60 text-white text-sm font-bold rounded-lg px-4 py-2 transition-colors"
                >
                  {savingDetails ? 'Saving…' : 'Save Details'}
                </button>
              </div>
            </div>

            {/* Steps builder */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Processing Steps</p>
                <button onClick={addStep} className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                  + Add Step
                </button>
              </div>

              {offices.length === 0 && (
                <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
                  No active offices yet.{' '}
                  <Link to="/admin/offices" className="font-bold underline">Create one in Office Manager</Link>{' '}
                  before assigning steps.
                </div>
              )}

              <div className="space-y-3">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                    <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
                      <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center">
                        {i + 1}
                      </span>
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={() => moveStep(i, -1)}
                          className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-20 text-xs px-1"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={i === steps.length - 1}
                          onClick={() => moveStep(i, 1)}
                          className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-20 text-xs px-1"
                          title="Move down"
                        >
                          ↓
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 grid sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Office / Department</label>
                        <select
                          required
                          value={step.office}
                          onChange={(e) => updateStep(i, 'office', Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select office…</option>
                          {offices.map((o) => (
                            <option key={o.id} value={o.id}>{o.code} — {o.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Action Required</label>
                        <input
                          placeholder="e.g. Tax Assessment"
                          value={step.action_required}
                          onChange={(e) => updateStep(i, 'action_required', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">SLA (hours)</label>
                        <input
                          type="number"
                          min={1}
                          value={step.max_hours_allowed}
                          onChange={(e) => updateStep(i, 'max_hours_allowed', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 text-lg leading-none pt-1.5 px-1 shrink-0"
                      title="Remove step"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={handleSaveWorkflow}
                disabled={savingSteps}
                className="mt-5 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-100 dark:shadow-none"
              >
                {savingSteps ? 'Saving Workflow…' : 'Save Workflow'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
