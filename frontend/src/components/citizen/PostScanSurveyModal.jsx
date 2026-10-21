import { useState, useEffect } from 'react';
import { fetchPostScanSurvey, submitPostScanSurvey } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { StarIcon, CheckCircle2Icon } from '../Icons';

function StarRatingInput({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="text-amber-400 hover:scale-110 transition-transform"
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
        >
          <StarIcon className="w-7 h-7" filled={n <= (hover || value)} />
        </button>
      ))}
    </div>
  );
}

/**
 * The automated post-transaction survey shown to a logged-in citizen right
 * after they scan their own document's QR code (see ScanDocument.jsx). Reads
 * the single active Survey and renders each question by type — 5-star,
 * Likert, single-choice, multi-choice, or short text. One submission per
 * document is allowed; the backend (and this modal's "already answered"
 * state) enforce that.
 */
export default function PostScanSurveyModal({ documentId, onClose, onSubmitted }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState(null);
  const [answers, setAnswers] = useState({}); // questionId -> { rating_value | text_value | selected_option_ids }
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetchPostScanSurvey(documentId)
      .then((res) => {
        setSurvey(res.data.survey);
        if (res.data.already_submitted) setDone(true);
      })
      .catch((err) => {
        showToast(err.response?.data?.detail || 'Could not load the survey.', 'error');
        onClose();
      })
      .finally(() => setLoading(false));
  }, [documentId]);

  const setRating = (qId, v) => setAnswers((a) => ({ ...a, [qId]: { rating_value: v } }));
  const setText = (qId, v) => setAnswers((a) => ({ ...a, [qId]: { text_value: v } }));
  const setSingle = (qId, optId) => setAnswers((a) => ({ ...a, [qId]: { selected_option_ids: [optId] } }));
  const toggleMulti = (qId, optId) =>
    setAnswers((a) => {
      const current = a[qId]?.selected_option_ids || [];
      const next = current.includes(optId)
        ? current.filter((id) => id !== optId)
        : [...current, optId];
      return { ...a, [qId]: { selected_option_ids: next } };
    });

  const handleSubmit = async (e) => {
    e.preventDefault();

    for (const q of survey.questions) {
      const ans = answers[q.id] || {};
      if (q.question_type === 'rating' && !ans.rating_value) {
        showToast(`Please rate: ${q.text}`, 'error');
        return;
      }
      if ((q.question_type === 'likert' || q.question_type === 'single') && !ans.selected_option_ids?.length) {
        showToast(`Please choose an option for: ${q.text}`, 'error');
        return;
      }
      if (q.question_type === 'multiple' && !ans.selected_option_ids?.length) {
        showToast(`Please pick at least one option for: ${q.text}`, 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = survey.questions.map((q) => {
        const ans = answers[q.id] || {};
        if (q.question_type === 'rating') return { question: q.id, rating_value: ans.rating_value };
        if (q.question_type === 'text') return { question: q.id, text_value: ans.text_value || '' };
        return { question: q.id, selected_option_ids: ans.selected_option_ids || [] };
      });
      await submitPostScanSurvey(documentId, payload);
      setDone(true);
      onSubmitted?.();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to submit your feedback.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl dark:shadow-none w-full max-w-lg max-h-[90vh] modal-pop-in flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <StarIcon className="w-5 h-5 text-amber-500" filled /> Quick Feedback Survey
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-2xl leading-none w-8 h-8 flex items-center justify-center shrink-0"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-6 sm:p-8">
          {loading ? (
            <p className="text-slate-400 dark:text-slate-500 text-center py-16">Loading…</p>
          ) : !survey ? (
            <p className="text-slate-400 dark:text-slate-500 text-center py-10">No survey is available right now.</p>
          ) : done ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2Icon className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Salamat sa iyong feedback!</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Your response helps the Municipality of Sariaya improve its services.
              </p>
              <button
                onClick={onClose}
                className="mt-6 bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-7">
              {survey.description && <p className="text-sm text-slate-500 dark:text-slate-400 -mt-2">{survey.description}</p>}

              {survey.questions.map((q) => (
                <div key={q.id}>
                  <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">{q.text}</label>

                  {q.question_type === 'rating' && (
                    <StarRatingInput
                      value={answers[q.id]?.rating_value || 0}
                      onChange={(v) => setRating(q.id, v)}
                    />
                  )}

                  {q.question_type === 'text' && (
                    <textarea
                      rows={2}
                      value={answers[q.id]?.text_value || ''}
                      onChange={(e) => setText(q.id, e.target.value)}
                      placeholder="Your answer (optional)…"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}

                  {(q.question_type === 'likert' || q.question_type === 'single') && (
                    <div className="space-y-1.5">
                      {q.options.map((opt) => {
                        const checked = answers[q.id]?.selected_option_ids?.[0] === opt.id;
                        return (
                          <label
                            key={opt.id}
                            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                              checked ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-900 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              checked={checked}
                              onChange={() => setSingle(q.id, opt.id)}
                              className="text-blue-600"
                            />
                            {opt.label}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {q.question_type === 'multiple' && (
                    <div className="space-y-1.5">
                      {q.options.map((opt) => {
                        const checked = (answers[q.id]?.selected_option_ids || []).includes(opt.id);
                        return (
                          <label
                            key={opt.id}
                            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                              checked ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-900 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMulti(q.id, opt.id)}
                              className="rounded text-blue-600"
                            />
                            {opt.label}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit Feedback'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
