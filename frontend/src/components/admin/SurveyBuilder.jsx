import { useState } from 'react';
import { createSurvey, updateSurvey, saveSurveyQuestions } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';

let tempIdCounter = 0;
const blankQuestion = () => ({
  tempId: `new-${tempIdCounter++}`, id: null, text: '', question_type: 'rating', options: [],
});

// The five question types the citizen survey supports. `hasOptions` marks the
// ones whose answers are a pick from an admin-authored choice list (managed
// in the per-question options editor below); the rest are a star value or
// free text.
const QUESTION_TYPES = [
  { value: 'rating', label: '5-Star Rating', hasOptions: false },
  { value: 'likert', label: 'Likert Scale', hasOptions: true },
  { value: 'single', label: 'Multiple Choice (one answer)', hasOptions: true },
  { value: 'multiple', label: 'Checkboxes (multiple answers)', hasOptions: true },
  { value: 'text', label: 'Short Text', hasOptions: false },
];
const LIKERT_DEFAULT = ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];
const typeHasOptions = (t) => QUESTION_TYPES.find((qt) => qt.value === t)?.hasOptions;

/**
 * Admin create/edit modal for a Survey — title/description/active toggle
 * plus a dynamic, reorderable list of questions. Each question is a 5-star
 * rating, a Likert scale, a single- or multi-select choice list, or a short
 * text box; choice/Likert questions get an inline editor to add, rename, and
 * remove their options. Saves in two steps against the real API: the Survey
 * shell first (create or patch), then PUT the full question list (with
 * options) atomically — mirrors how the Workflow Builder saves a
 * DocumentType's steps.
 */
export default function SurveyBuilder({ survey, onClose, onSaved }) {
  const { showToast } = useToast();
  const isEditing = !!survey;

  const [title, setTitle] = useState(survey?.title || '');
  const [description, setDescription] = useState(survey?.description || '');
  const [isActive, setIsActive] = useState(survey?.is_active ?? true);
  const [questions, setQuestions] = useState(
    survey?.questions?.length
      // Carries the real SurveyQuestion id through to save — see
      // handleSubmit's questionsPayload, which sends it back so the
      // backend updates this row in place instead of recreating it
      // (preserving any SurveyAnswer history already attached to it).
      ? survey.questions.map((q) => ({
          tempId: `existing-${q.id}`, id: q.id, text: q.text, question_type: q.question_type,
          options: (q.options || []).map((o) => o.label),
        }))
      : [blankQuestion()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateQuestion = (tempId, patch) => {
    setQuestions((qs) => qs.map((q) => (q.tempId === tempId ? { ...q, ...patch } : q)));
  };

  const changeType = (tempId, nextType) => {
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.tempId !== tempId) return q;
        let options = q.options;
        if (typeHasOptions(nextType)) {
          // Seed a Likert question with the standard scale so the admin
          // isn't forced to retype it; keep whatever's there otherwise.
          if (options.length === 0) options = nextType === 'likert' ? [...LIKERT_DEFAULT] : ['', ''];
        } else {
          options = [];
        }
        return { ...q, question_type: nextType, options };
      })
    );
  };

  const setOption = (tempId, idx, value) =>
    setQuestions((qs) =>
      qs.map((q) =>
        q.tempId === tempId
          ? { ...q, options: q.options.map((o, i) => (i === idx ? value : o)) }
          : q
      )
    );
  const addOption = (tempId) =>
    setQuestions((qs) => qs.map((q) => (q.tempId === tempId ? { ...q, options: [...q.options, ''] } : q)));
  const removeOption = (tempId, idx) =>
    setQuestions((qs) =>
      qs.map((q) => (q.tempId === tempId ? { ...q, options: q.options.filter((_, i) => i !== idx) } : q))
    );

  const addQuestion = () => setQuestions((qs) => [...qs, blankQuestion()]);
  const removeQuestion = (tempId) => setQuestions((qs) => qs.filter((q) => q.tempId !== tempId));

  const moveQuestion = (index, direction) => {
    setQuestions((qs) => {
      const next = [...qs];
      const target = index + direction;
      if (target < 0 || target >= next.length) return qs;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanQuestions = questions.filter((q) => q.text.trim());
    if (cleanQuestions.length === 0) {
      setError('Add at least one question.');
      return;
    }
    for (const q of cleanQuestions) {
      if ((q.question_type === 'single' || q.question_type === 'multiple')) {
        const opts = q.options.map((o) => o.trim()).filter(Boolean);
        if (opts.length < 2) {
          setError(`"${q.text.trim()}" needs at least two choices.`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const surveyPayload = { title, description, is_active: isActive };
      const savedSurvey = isEditing
        ? (await updateSurvey(survey.id, surveyPayload)).data
        : (await createSurvey(surveyPayload)).data;

      const questionsPayload = cleanQuestions.map((q, i) => ({
        ...(q.id ? { id: q.id } : {}),
        order: i + 1,
        text: q.text.trim(),
        question_type: q.question_type,
        options: typeHasOptions(q.question_type)
          ? q.options.map((o) => o.trim()).filter(Boolean)
          : [],
      }));
      await saveSurveyQuestions(savedSurvey.id, questionsPayload);

      showToast(`Survey "${title}" ${isEditing ? 'updated' : 'created'}.`, 'success');
      onSaved();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to save survey.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-xl p-7 modal-pop-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{isEditing ? 'Edit Survey' : 'New Survey'}</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl">×</button>
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Survey title</label>
            <input
              required value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="How was your visit today?"
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
            <textarea
              rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us about your experience with our office."
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600 w-4 h-4" />
            Active — visible to citizens
          </label>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Questions</p>
              <button type="button" onClick={addQuestion} className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                + Add question
              </button>
            </div>

            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={q.tempId} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-black text-slate-400 dark:text-slate-500 mt-2.5 w-5 shrink-0">{i + 1}.</span>
                    <textarea
                      rows={1} value={q.text}
                      onChange={(e) => updateQuestion(q.tempId, { text: e.target.value })}
                      placeholder="Question text…"
                      className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center justify-between pl-7">
                    <select
                      value={q.question_type}
                      onChange={(e) => changeType(q.tempId, e.target.value)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {QUESTION_TYPES.map((qt) => (
                        <option key={qt.value} value={qt.value}>{qt.label}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveQuestion(i, -1)} disabled={i === 0}
                        className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 px-1.5">↑</button>
                      <button type="button" onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1}
                        className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 px-1.5">↓</button>
                      <button type="button" onClick={() => removeQuestion(q.tempId)}
                        className="text-xs font-bold text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 px-1.5">Remove</button>
                    </div>
                  </div>

                  {typeHasOptions(q.question_type) && (
                    <div className="pl-7 pt-1 space-y-1.5">
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                        {q.question_type === 'likert' ? 'Scale points' : 'Choices'}
                      </p>
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 w-4 text-right">{oi + 1}</span>
                          <input
                            value={opt}
                            onChange={(e) => setOption(q.tempId, oi, e.target.value)}
                            placeholder={`Option ${oi + 1}`}
                            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button" onClick={() => removeOption(q.tempId, oi)}
                            disabled={q.options.length <= 1}
                            className="text-xs font-bold text-red-400 dark:text-red-400/80 hover:text-red-600 dark:hover:text-red-300 disabled:opacity-30 px-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button" onClick={() => addOption(q.tempId)}
                        className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 ml-6"
                      >
                        + Add {q.question_type === 'likert' ? 'point' : 'choice'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button type="submit" disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg py-2.5 mt-2 transition-colors">
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Survey'}
          </button>
        </form>
      </div>
    </div>
  );
}
