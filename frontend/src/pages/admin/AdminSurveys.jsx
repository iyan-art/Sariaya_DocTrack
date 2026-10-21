import { useState, useEffect, useCallback } from 'react';
import { fetchAllSurveys, updateSurvey, deleteSurvey } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import SurveyBuilder from '../../components/admin/SurveyBuilder';
import AdminSurveyAnalytics from '../../components/admin/AdminSurveyAnalytics';
import { StarIcon } from '../../components/Icons';

export default function AdminSurveys() {
  const { showToast } = useToast();
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState(null);
  const [analyticsSurveyId, setAnalyticsSurveyId] = useState(null);

  const loadSurveys = useCallback(() => {
    setLoading(true);
    fetchAllSurveys()
      .then((res) => setSurveys(res.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadSurveys(); }, [loadSurveys]);

  const openCreate = () => { setEditingSurvey(null); setShowBuilder(true); };
  const openEdit = (survey) => { setEditingSurvey(survey); setShowBuilder(true); };

  const toggleActive = async (survey) => {
    try {
      await updateSurvey(survey.id, { is_active: !survey.is_active });
      showToast(survey.is_active ? `"${survey.title}" deactivated.` : `"${survey.title}" activated.`, 'success');
      loadSurveys();
    } catch {
      showToast('Failed to update survey.', 'error');
    }
  };

  const handleDelete = async (survey) => {
    if (!window.confirm(`Permanently delete "${survey.title}"? This also deletes all its responses.`)) return;
    try {
      await deleteSurvey(survey.id);
      showToast(`"${survey.title}" deleted.`, 'success');
      loadSurveys();
    } catch {
      showToast('Failed to delete survey.', 'error');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 dark:shadow-none">
            <StarIcon className="w-6 h-6" filled />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Citizen Surveys</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Create and manage feedback surveys shown to citizens.</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-100 dark:shadow-none transition-all"
        >
          + New Survey
        </button>
      </div>

      {loading ? (
        <p className="text-center py-10 text-slate-400 dark:text-slate-500">Loading…</p>
      ) : surveys.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl p-16 text-center">
          <p className="text-slate-400 dark:text-slate-500 font-bold">No surveys yet — create your first one.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {surveys.map((s) => (
            <div key={s.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 leading-tight">{s.title}</h3>
                <span className={`shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded-full border ${
                  s.is_active ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}>
                  {s.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {s.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2">{s.description}</p>}

              <div className="flex items-center gap-4 mt-4 text-xs text-slate-500 dark:text-slate-400">
                <span>{s.questions.length} question{s.questions.length === 1 ? '' : 's'}</span>
                <span>{s.response_count} response{s.response_count === 1 ? '' : 's'}</span>
                {s.average_rating != null && (
                  <span className="flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                    <StarIcon className="w-3.5 h-3.5" filled /> {s.average_rating}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-4 pt-4 border-t border-slate-50 dark:border-slate-800 text-xs font-bold">
                <button onClick={() => setAnalyticsSurveyId(s.id)} className="text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100">Analytics</button>
                <button onClick={() => openEdit(s)} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">Edit</button>
                <button onClick={() => toggleActive(s)} className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300">
                  {s.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => handleDelete(s)} className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showBuilder && (
        <SurveyBuilder
          survey={editingSurvey}
          onClose={() => setShowBuilder(false)}
          onSaved={() => { setShowBuilder(false); loadSurveys(); }}
        />
      )}

      {analyticsSurveyId && (
        <AdminSurveyAnalytics
          surveyId={analyticsSurveyId}
          onClose={() => setAnalyticsSurveyId(null)}
        />
      )}
    </div>
  );
}
