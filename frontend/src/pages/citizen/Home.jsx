import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchMyDocuments } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { FileTextIcon, Clock3Icon, CheckCircle2Icon } from '../../components/Icons';

// The citizen's post-login landing screen. Surfaces a quick summary of
// their requests. Rating a released document happens on the History page's
// "Rate" button, or from the public Landing page's tracking-number widget —
// not here.
export default function Home() {
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyDocuments()
      .then((res) => setDocs(res.data.results || []))
      .finally(() => setLoading(false));
  }, []);

  const active = docs.filter((d) => !['released'].includes(d.status));
  const released = docs.filter((d) => d.status === 'released');

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Welcome, {user.first_name}!</h1>
      <p className="text-slate-500 mt-1">Here's a quick look at your document requests.</p>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
            <FileTextIcon className="w-5 h-5" />
          </div>
          <p className="text-2xl font-black text-slate-900">{loading ? '—' : docs.length}</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Total Requests</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
            <Clock3Icon className="w-5 h-5" />
          </div>
          <p className="text-2xl font-black text-slate-900">{loading ? '—' : active.length}</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">In Progress</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
            <CheckCircle2Icon className="w-5 h-5" />
          </div>
          <p className="text-2xl font-black text-slate-900">{loading ? '—' : released.length}</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Released to You</p>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link to="/citizen/history" className="text-sm font-bold text-blue-600 hover:text-blue-700">
          View full request history →
        </Link>
      </div>
    </div>
  );
}
