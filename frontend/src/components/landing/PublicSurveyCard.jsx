import { useState, useEffect } from 'react';
import { fetchPublicSurvey, submitPublicSurvey } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';
import { StarIcon, CheckCircle2Icon } from '../Icons';

const doneKey = (id) => `sariaya_public_survey_done_${id}`;

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
 * Landing-page citizen survey — the single active Survey, answerable by any
 * visitor with no account and no document. Submits anonymously to
 * /documents/surveys/public/ (stored as a SurveyResponse with source
 * "public"). Renders nothing when no survey is active; once this browser has
 * answered, a localStorage flag keeps it collapsed to a short thank-you so
 * the same person isn't re-prompted on every visit.
 */
export default function PublicSurveyCard() {
  const { showToast } = useToast();
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetchPublicSurvey()
      .then((res) => {
        const s = res.data.survey;
        setSurvey(s);
        if (s) {
          try {
            if (localStorage.getItem(doneKey(s.id))) setDone(true);
          } catch { /* private mode — just show the form */ }
        }
      })
      .catch(() => setSurvey(null))
      .finally(() => setLoading(false));
  }, []);

  const setRating = (qId, v) => setAnswers((a) => ({ ...a, [qId]: { rating_value: v } }));
  const setText = (qId, v) => setAnswers((a) => ({ ...a, [qId]: { text_value: v } }));
  const setSingle = (qId, optId) => setAnswers((a) => ({ ...a, [qId]: { selected_option_ids: [optId] } }));
  const toggleMulti = (qId, optId) =>
    setAnswers((a) => {
      const current = a[qId]?.selected_option_ids || [];
      const next = current.includes(optId) ? current.filter((id) => id !== optId) : [...current, optId];
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
      await submitPublicSurvey(payload);
      try { localStorage.setItem(doneKey(survey.id), '1'); } catch { /* ignore */ }
      setDone(true);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to submit your feedback.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !survey) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center gap-2 text-blue-600">
        <StarIcon className="w-5 h-5" filled />
        <span className="text-xs font-black uppercase tracking-widest">Citizen Survey</span>
      </div>
      <h3 className="text-lg font-bold text-slate-900 mt-2">{survey.title}</h3>
      {survey.description && <p className="text-sm text-slate-500 mt-1">{survey.description}</p>}

      {done ? (
        <div className="mt-5 flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
          <CheckCircle2Icon className="w-5 h-5 shrink-0" />
          <span>Salamat! Naitala na ang iyong sagot. This helps the Municipality of Sariaya improve its services.</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {survey.questions.map((q) => (
            <div key={q.id}>
              <label className="block text-sm font-semibold text-slate-800 mb-2">{q.text}</label>

              {q.question_type === 'rating' && (
                <StarRatingInput value={answers[q.id]?.rating_value || 0} onChange={(v) => setRating(q.id, v)} />
              )}

              {q.question_type === 'text' && (
                <textarea
                  rows={2}
                  value={answers[q.id]?.text_value || ''}
                  onChange={(e) => setText(q.id, e.target.value)}
                  placeholder="Your answer (optional)…"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                          checked ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`pub-q-${q.id}`}
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
                          checked ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-slate-200 hover:bg-slate-50'
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
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-sm rounded-lg py-2.5 transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit Survey'}
          </button>
        </form>
      )}
    </div>
  );
}
