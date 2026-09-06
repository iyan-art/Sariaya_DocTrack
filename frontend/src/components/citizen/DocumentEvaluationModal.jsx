import { useState, useEffect } from 'react';
import { fetchDocumentEvaluation, submitDocumentEvaluation } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { StarIcon, CheckCircle2Icon, MapPinIcon } from '../Icons';

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
 * Evaluation of a RELEASED document — one rating block PER OFFICE that
 * touched it (document.route resolved to real offices server-side), so a
 * bad experience at one office doesn't drag down another office's
 * citizen-satisfaction KPI. Offices already rated for this document are
 * left out of the form entirely; submitting stores one SurveyResponse per
 * office, which is what AdminDashboard's Top 5 Highest/Lowest Rated Offices
 * and the Heatmap page's rating badges are computed from.
 *
 * Reused for both entry points: a logged-in citizen rating their own
 * document by id (History/Home pages, the default fetch/submit props), and
 * a guest with no account rating by tracking number from the public Track
 * page (pass subject=trackingNumber, fetchEvaluation=fetchPublicDocumentEvaluation,
 * submitEvaluation=submitPublicDocumentEvaluation).
 */
export default function DocumentEvaluationModal({
  subject, onClose, onSubmitted,
  fetchEvaluation = fetchDocumentEvaluation, submitEvaluation = submitDocumentEvaluation,
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState(null);
  const [offices, setOffices] = useState([]);
  const [answers, setAnswers] = useState({}); // officeId -> { questionId -> { rating_value } | { text_value } }
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchEvaluation(subject)
      .then((res) => {
        setSurvey(res.data.survey);
        setOffices(res.data.offices || []);
      })
      .catch((err) => {
        showToast(err.response?.data?.detail || 'Failed to load the evaluation form.', 'error');
        onClose();
      })
      .finally(() => setLoading(false));
  }, [subject]);

  const pendingOffices = offices.filter((o) => !o.already_rated);

  const setRating = (officeId, questionId, value) =>
    setAnswers((a) => ({ ...a, [officeId]: { ...a[officeId], [questionId]: { rating_value: value } } }));
  const setText = (officeId, questionId, value) =>
    setAnswers((a) => ({ ...a, [officeId]: { ...a[officeId], [questionId]: { text_value: value } } }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    for (const office of pendingOffices) {
      const missingRating = survey.questions.find(
        (q) => q.question_type === 'rating' && !answers[office.id]?.[q.id]?.rating_value
      );
      if (missingRating) {
        showToast(`Please rate "${missingRating.text}" for ${office.name}.`, 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      const officeRatings = pendingOffices.map((office) => ({
        office: office.id,
        answers: survey.questions.map((q) => ({ question: q.id, ...(answers[office.id]?.[q.id] || {}) })),
      }));
      await submitEvaluation(subject, officeRatings);
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] modal-pop-in flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <StarIcon className="w-5 h-5 text-amber-500" filled /> Rate Your Experience
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-200 rounded-lg text-2xl leading-none w-8 h-8 flex items-center justify-center shrink-0 transition-colors"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-6 sm:p-8">
          {loading ? (
            <p className="text-slate-400 text-center py-16">Loading…</p>
          ) : !survey ? (
            <p className="text-slate-400 text-center py-10">No evaluation form is available right now.</p>
          ) : submitted || pendingOffices.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2Icon className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Thank you for your feedback!</h3>
              <p className="text-sm text-slate-500 mt-1">It helps us improve every office involved in your request.</p>
              <button
                onClick={onClose}
                className="mt-6 bg-slate-900 hover:bg-black text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              <p className="text-sm text-slate-500 -mt-2">
                Please rate each office that handled your request — your feedback goes straight into that office's performance record.
              </p>

              {pendingOffices.map((office) => (
                <div key={office.id} className="border border-slate-100 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPinIcon className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold text-slate-900">{office.name}</h3>
                  </div>

                  <div className="space-y-5">
                    {survey.questions.map((q) => (
                      <div key={q.id}>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">{q.text}</label>
                        {q.question_type === 'rating' ? (
                          <StarRatingInput
                            value={answers[office.id]?.[q.id]?.rating_value || 0}
                            onChange={(v) => setRating(office.id, q.id, v)}
                          />
                        ) : (
                          <textarea
                            rows={2}
                            value={answers[office.id]?.[q.id]?.text_value || ''}
                            onChange={(e) => setText(office.id, q.id, e.target.value)}
                            placeholder="Your answer (optional)…"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </div>
                    ))}
                  </div>
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
