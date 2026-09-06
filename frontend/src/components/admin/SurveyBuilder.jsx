import { useState } from 'react';
import { createSurvey, updateSurvey, saveSurveyQuestions } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';

let tempIdCounter = 0;
const blankQuestion = () => ({ tempId: `new-${tempIdCounter++}`, id: null, text: '', question_type: 'rating' });

/**
 * Admin create/edit modal for a Survey — title/description/active toggle
 * plus a dynamic, reorderable list of questions (5-star rating or free
 * text). Saves in two steps against the real API: the Survey shell first
 * (create or patch), then PUT the full question list atomically — mirrors
 * how the Workflow Builder saves a DocumentType's steps.
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
      ? survey.questions.map((q) => ({ tempId: `existing-${q.id}`, id: q.id, text: q.text, question_type: q.question_type }))
      : [blankQuestion()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateQuestion = (tempId, patch) => {
    setQuestions((qs) => qs.map((q) => (q.tempId === tempId ? { ...q, ...patch } : q)));
  };

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

    setSaving(true);
    try {
      const surveyPayload = { title, description, is_active: isActive };
      const savedSurvey = isEditing
        ? (await updateSurvey(survey.id, surveyPayload)).data
        : (await createSurvey(surveyPayload)).data;

      const questionsPayload = cleanQuestions.map((q, i) => ({
        ...(q.id ? { id: q.id } : {}),
        order: i + 1, text: q.text.trim(), question_type: q.question_type,
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-7 modal-pop-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">{isEditing ? 'Edit Survey' : 'New Survey'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Survey title</label>
            <input
              required value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="How was your visit today?"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Description</label>
            <textarea
              rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us about your experience with our office."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-slate-300 w-4 h-4" />
            Active — visible to citizens
          </label>

          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700">Questions</p>
              <button type="button" onClick={addQuestion} className="text-xs font-bold text-blue-600 hover:text-blue-700">
                + Add question
              </button>
            </div>

            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={q.tempId} className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-black text-slate-400 mt-2.5 w-5 shrink-0">{i + 1}.</span>
                    <textarea
                      rows={1} value={q.text}
                      onChange={(e) => updateQuestion(q.tempId, { text: e.target.value })}
                      placeholder="Question text…"
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center justify-between pl-7">
                    <select
                      value={q.question_type}
                      onChange={(e) => updateQuestion(q.tempId, { question_type: e.target.value })}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="rating">5-Star Rating</option>
                      <option value="text">Text Response</option>
                    </select>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveQuestion(i, -1)} disabled={i === 0}
                        className="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-30 px-1.5">↑</button>
                      <button type="button" onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1}
                        className="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-30 px-1.5">↓</button>
                      <button type="button" onClick={() => removeQuestion(q.tempId)}
                        className="text-xs font-bold text-red-500 hover:text-red-700 px-1.5">Remove</button>
                    </div>
                  </div>
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
