import { useState, useEffect, useCallback } from 'react';
import { fetchMySuggestions, createSuggestion } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';
import { HandshakeIcon } from '../../components/Icons';

const CATEGORIES = [
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'document_processing', label: 'Document Processing' },
  { value: 'staff_courtesy', label: 'Staff Courtesy' },
  { value: 'public_health', label: 'Public Health' },
  { value: 'general', label: 'General LGU Services' },
];

const STATUS_STYLES = {
  new: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30',
  reviewed: 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/30',
  in_progress: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30',
  archived: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
};

/**
 * Municipal Suggestion Box (CitizenSuggestionBox) — a logged-in citizen
 * sends constructive feedback addressed to the Municipality of Sariaya,
 * Quezon, tagged by category, and can watch the LGU's triage status on each
 * one they've sent.
 */
export default function SuggestionBox() {
  const { showToast } = useToast();
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchMySuggestions()
      .then((res) => setMine(res.data.results || res.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      showToast('Please fill in both a subject and your suggestion.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await createSuggestion({ category, subject: subject.trim(), message: message.trim() });
      showToast('Suggestion sent to the Municipality of Sariaya. Thank you!', 'success');
      setSubject('');
      setMessage('');
      setCategory('general');
      load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to send your suggestion.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 dark:shadow-none">
          <HandshakeIcon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Municipal Suggestion Box</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Constructive feedback for the Municipality of Sariaya, Quezon.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm dark:shadow-none space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={160}
            placeholder="Short summary of your suggestion"
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Your suggestion</label>
          <textarea
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe your idea or concern. Be specific — it helps the office act on it."
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-xl py-2.5 transition-colors"
        >
          {submitting ? 'Sending…' : 'Send Suggestion'}
        </button>
      </form>

      <h2 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-10 mb-3">Your suggestions</h2>
      {loading ? (
        <p className="text-slate-400 dark:text-slate-500 text-center py-8">Loading…</p>
      ) : mine.length === 0 ? (
        <p className="text-slate-400 dark:text-slate-500 text-sm bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-8 text-center">
          You haven't sent any suggestions yet.
        </p>
      ) : (
        <div className="space-y-3">
          {mine.map((s) => (
            <div key={s.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm dark:shadow-none">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100 leading-tight">{s.subject}</p>
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                    {s.category_display}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded-full border ${STATUS_STYLES[s.status] || STATUS_STYLES.new}`}>
                  {s.status_display}
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 whitespace-pre-wrap">{s.message}</p>
              {s.admin_notes && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2">
                  <span className="font-bold text-slate-600 dark:text-slate-300">LGU response: </span>{s.admin_notes}
                </p>
              )}
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">{new Date(s.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
