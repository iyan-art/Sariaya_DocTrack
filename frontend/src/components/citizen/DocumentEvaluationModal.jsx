import { useState, useEffect } from 'react';
import { fetchDocumentEvaluation, submitDocumentEvaluation } from '../../api/axios';
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
          <StarIcon className="w-6 h-6" filled={n <= (hover || value)} />
        </button>
      ))}
    </div>
  );
}

/**
 * Evaluation of a RELEASED document — one Overall Experience Rating for the
 * whole transaction, answered once per request with the admin's active
 * survey. Feeds the overall Citizen Satisfaction figure on the dashboard.
 *
 * Reused for both entry points: a logged-in citizen rating their own
 * document by id (the default fetch/submit props), and a guest with no
 * account rating by tracking number from the public Track page or the
 * landing page (pass subject=trackingNumber, fetchEvaluation=fetchPublicDocumentEvaluation,
 * submitEvaluation=submitPublicDocumentEvaluation).
 */
export default function DocumentEvaluationModal({
  subject, onClose, onSubmitted,
  fetchEvaluation = fetchDocumentEvaluation, submitEvaluation = submitDocumentEvaluation,
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState(null);
  const [alreadyRated, setAlreadyRated] = useState(false);
  const [answers, setAnswers] = useState({}); // questionId -> { rating_value } | { text_value } | { selected_option_ids }
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchEvaluation(subject)
      .then((res) => {
        setSurvey(res.data.survey);
        setAlreadyRated(Boolean(res.data.already_rated));
      })
      .catch((err) => {
        showToast(err.response?.data?.detail || 'Failed to load the evaluation form.', 'error');
        onClose();
      })
      .finally(() => setLoading(false));
  }, [subject]);

  const setRating = (questionId, value) => setAnswers((a) => ({ ...a, [questionId]: { rating_value: value } }));
  const setText = (questionId, value) => setAnswers((a) => ({ ...a, [questionId]: { text_value: value } }));
  const setSingle = (questionId, optionId) => setAnswers((a) => ({ ...a, [questionId]: { selected_option_ids: [optionId] } }));
  const toggleMulti = (questionId, optionId) =>
    setAnswers((a) => {
      const current = a[questionId]?.selected_option_ids || [];
      const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
      return { ...a, [questionId]: { selected_option_ids: next } };
    });

  const handleSubmit = async (e) => {
    e.preventDefault();

    for (const q of survey.questions) {
      const ans = answers[q.id] || {};
      if (q.question_type === 'rating' && !ans.rating_value) {
        showToast(`Please rate "${q.text}".`, 'error');
        return;
      }
      if (q.question_type !== 'rating' && q.question_type !== 'text' && !ans.selected_option_ids?.length) {
        showToast(`Please answer "${q.text}".`, 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      await submitEvaluation(subject, survey.questions.map((q) => {
        const ans = answers[q.id] || {};
        if (q.question_type === 'rating') return { question: q.id, rating_value: ans.rating_value };
        if (q.question_type === 'text') return { question: q.id, text_value: ans.text_value || '' };
        return { question: q.id, selected_option_ids: ans.selected_option_ids || [] };
      }));
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to submit your evaluation.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      {/* max-h + flex-col caps the whole survey so the header (title + X)
          never scrolls away and the upper part of the survey is always
          visible the moment it opens — only the question list below
          scrolls, same pattern used throughout this app's other modals. */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl dark:shadow-none w-full max-w-lg max-h-[90vh] modal-pop-in flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <StarIcon className="w-5 h-5 text-amber-500" filled /> Rate Your Experience
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 rounded-lg text-2xl leading-none w-8 h-8 flex items-center justify-center shrink-0 transition-colors"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-6 sm:p-8">
          {loading ? (
            <p className="text-slate-400 dark:text-slate-500 text-center py-16">Loading…</p>
          ) : !survey ? (
            <p className="text-slate-500 dark:text-slate-400 text-center py-10">
              The evaluation form hasn't been set up yet. Please try again later.
            </p>
          ) : submitted || alreadyRated ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2Icon className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Thank you for your feedback!</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {submitted ? 'It helps us improve our service to every citizen.' : 'This request has already been rated.'}
              </p>
              <button
                onClick={onClose}
                className="mt-6 bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <p className="text-sm text-slate-500 dark:text-slate-400 -mt-2">
                {survey.description || 'How was your overall experience with this request, from filing to pickup?'}
              </p>

              {survey.questions.map((q) => (
                <div key={q.id}>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{q.text}</label>
                  {q.question_type === 'rating' && (
                    <StarRatingInput value={answers[q.id]?.rating_value || 0} onChange={(v) => setRating(q.id, v)} />
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
                  {/* Likert / single choice: one pick; checkboxes: one or more. */}
                  {['likert', 'single', 'multiple'].includes(q.question_type) && (
                    <div className="space-y-1.5">
                      {(q.options || []).map((opt) => {
                        const picked = answers[q.id]?.selected_option_ids || [];
                        const multi = q.question_type === 'multiple';
                        const checked = picked.includes(opt.id);
                        return (
                          <label
                            key={opt.id}
                            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                              checked ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-900 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <input
                              type={multi ? 'checkbox' : 'radio'}
                              name={`q${q.id}`}
                              checked={checked}
                              onChange={() => (multi ? toggleMulti : setSingle)(q.id, opt.id)}
                              className={multi ? 'rounded text-blue-600' : 'text-blue-600'}
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
                {submitting ? 'Submitting…' : 'Submit Evaluation'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
