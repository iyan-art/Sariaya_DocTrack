import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { extractErrorMessage } from '../../utils/apiError';
import PasswordInput from '../PasswordInput';
import TrackDocumentCard from '../TrackDocumentCard';
import CitizenFeedbackCard from './CitizenFeedbackCard';
import PublicSurveyCard from './PublicSurveyCard';
import InstallPWAButton from '../InstallPWAButton';
import GuestDocumentsLinkedModal from './GuestDocumentsLinkedModal';

/**
 * The section immediately below the hero: the three things a returning
 * citizen most likely wants right away — track an existing request, leave
 * feedback on a released one, or sign in/register. Left column stacks the
 * two lightweight lookup cards (each just wraps existing, already-working
 * functionality); right column is the existing Login/Register flow itself,
 * unchanged from before this redesign.
 */
export default function QuickActionsSection() {
  const [mode, setMode] = useState('login');

  return (
    <section id="access" className="py-16 sm:py-24 bg-slate-50 scroll-mt-16">
      <div className="max-w-6xl mx-auto px-6 lg:px-10">
        <div className="grid lg:grid-cols-2 gap-8 items-start">
          <div id="track" className="space-y-6 scroll-mt-24">
            <TrackDocumentCard />
            <CitizenFeedbackCard />
            <PublicSurveyCard />
          </div>

          <div className="bg-white rounded-2xl shadow-xl border-t-4 border-blue-600 p-8 sm:p-10">
            <div className="text-center mb-6">
              <p className="text-xs font-black uppercase tracking-widest text-blue-600">Access Sariaya DocTrack</p>
              <p className="text-sm text-slate-500 mt-1">
                Log in to request documents, track applications, and access your municipal services.
              </p>
            </div>

            <div className="flex justify-center mb-7">
              <InstallPWAButton variant="compact" />
            </div>

            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-7">
              <button
                onClick={() => setMode('login')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                  mode === 'login' ? 'bg-white shadow text-blue-700' : 'text-slate-500'
                }`}
              >
                Log In / Sign In
              </button>
              <button
                onClick={() => setMode('register')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                  mode === 'register' ? 'bg-white shadow text-blue-700' : 'text-slate-500'
                }`}
              >
                Sign Up
              </button>
            </div>

            {mode === 'login' ? (
              <LoginForm onSwitch={() => setMode('register')} />
            ) : (
              <RegisterForm onSwitch={() => setMode('login')} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function LoginForm({ onSwitch }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      if (user.role === 'admin') navigate('/admin/dashboard');
      else if (user.role === 'employee') navigate('/employee/dashboard');
      // linkedGuestDocuments (Automatic Guest-to-User Account Linking)
      // only ever has anything for citizens — Home.jsx reads this via
      // location.state and shows the welcome modal if it's set.
      else navigate('/citizen/home', { state: { linkedGuestDocuments: user.linked_guest_documents } });
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
      <p className="text-slate-500 text-sm mt-2">
        For Citizens, Staff, and Administrators — sign in with the account you already have.
      </p>

      {error && (
        <div className="mt-5 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <label className="block mt-6 text-sm font-semibold text-slate-700">Email address</label>
      <input
        type="email"
        name="email"
        required
        value={form.email}
        onChange={handleChange}
        placeholder="you@example.com"
        className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <label className="block mt-5 text-sm font-semibold text-slate-700">Password</label>
      <PasswordInput
        name="password"
        required
        value={form.password}
        onChange={handleChange}
        placeholder="••••••••"
        className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="flex items-center justify-between mt-5 text-sm">
        <label className="flex items-center gap-2 text-slate-600">
          <input type="checkbox" className="rounded border-slate-300 w-4 h-4" />
          Remember me
        </label>
        <a href="#" className="text-blue-600 hover:underline font-medium">Forgot password?</a>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-7 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-base rounded-lg py-3.5 transition-colors"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-center text-sm text-slate-500 mt-6">
        New citizen?{' '}
        <button type="button" onClick={onSwitch} className="text-blue-600 font-semibold hover:underline">
          Sign Up
        </button>
      </p>
    </form>
  );
}

function RegisterForm({ onSwitch }) {
  const { register } = useAuth();
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', password: '', confirm_password: '',
  });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkedInfo, setLinkedInfo] = useState(null); // { email, count } — Automatic Guest-to-User Account Linking

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!agreed) {
      setError('Please agree to the Data Privacy Notice to continue.');
      return;
    }

    setLoading(true);
    try {
      const res = await register(form);
      if (res.linked_guest_documents > 0) {
        // Hold off on the auto-switch-to-login below — let them actually
        // read the welcome message; the modal's "Got it" triggers it instead.
        setLinkedInfo({ email: form.email, count: res.linked_guest_documents });
      } else {
        setSuccess('Account created successfully! You can now sign in.');
        setTimeout(onSwitch, 1500);
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'Registration failed. Please check your details.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <form onSubmit={handleSubmit}>
      <h2 className="text-2xl font-bold text-slate-900">Create citizen account</h2>
      <p className="text-slate-500 text-sm mt-2">Register as a citizen to request and track your documents.</p>

      {error && (
        <div className="mt-5 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-5 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-4 py-3">
          {success}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mt-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700">First name</label>
          <input
            name="first_name" required value={form.first_name} onChange={handleChange}
            placeholder="Juan"
            className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700">Last name</label>
          <input
            name="last_name" required value={form.last_name} onChange={handleChange}
            placeholder="Dela Cruz"
            className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <label className="block mt-5 text-sm font-semibold text-slate-700">Email address</label>
      <input
        type="email" name="email" required value={form.email} onChange={handleChange}
        placeholder="you@example.com"
        className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="grid grid-cols-2 gap-4 mt-5">
        <div>
          <label className="block text-sm font-semibold text-slate-700">Password</label>
          <PasswordInput
            name="password" required value={form.password} onChange={handleChange}
            placeholder="••••••••"
            className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700">Confirm</label>
          <PasswordInput
            name="confirm_password" required value={form.confirm_password} onChange={handleChange}
            placeholder="••••••••"
            className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <label className="flex items-start gap-3 mt-5 text-sm text-slate-500">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 rounded border-slate-300 w-4 h-4"
        />
        I agree to the Data Privacy Notice and consent to the processing of my
        personal information for municipal document services.
      </label>

      <button
        type="submit"
        disabled={loading}
        className="mt-7 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-base rounded-lg py-3.5 transition-colors"
      >
        {loading ? 'Creating account…' : 'Create citizen account'}
      </button>

      <p className="text-center text-sm text-slate-500 mt-6">
        Already have an account?{' '}
        <button type="button" onClick={onSwitch} className="text-blue-600 font-semibold hover:underline">
          Sign in
        </button>
      </p>
    </form>

    {linkedInfo && (
      <GuestDocumentsLinkedModal
        email={linkedInfo.email}
        count={linkedInfo.count}
        onClose={() => { setLinkedInfo(null); onSwitch(); }}
      />
    )}
    </>
  );
}
