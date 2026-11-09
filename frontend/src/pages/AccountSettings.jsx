import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { changeMyPassword, fetchMyLinkedRequests, fetchMyProfile, updateMyProfile } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { extractErrorMessage } from '../utils/apiError';
import { CONTACT_NUMBER_ERROR, isInvalidContactNumber } from '../utils/contactNumber';
import PasswordInput from '../components/PasswordInput';
import { BellIcon, MoonIcon, ShieldCheckIcon, SunIcon, UserCircleIcon, ArrowRightLeftIcon } from '../components/Icons';

const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 dark:disabled:bg-slate-800/50 disabled:text-slate-500';
const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';
const errorClass = 'text-xs text-red-600 dark:text-red-400 mt-1';

// DRF errors come back as { field: ["message"] }; keep the first per field.
function fieldErrorsFrom(err) {
  const data = err?.response?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}

function Section({ id, icon: Icon, title, description, children }) {
  return (
    <section id={id} className="scroll-mt-24 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          {description && <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function ProfileSection({ profile, onSaved }) {
  const { showToast } = useToast();
  const initial = { first_name: profile.first_name, last_name: profile.last_name, email: profile.email, contact_number: profile.contact_number };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const changed = Object.keys(initial).filter((k) => form[k] !== initial[k]);
  const contactInvalid = isInvalidContactNumber(form.contact_number);
  const emailChanged = form.email.trim().toLowerCase() !== profile.email.toLowerCase();
  const isStaff = profile.role !== 'citizen';

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (contactInvalid || changed.length === 0) return;
    setSaving(true);
    setErrors({});
    try {
      const res = await updateMyProfile(Object.fromEntries(changed.map((k) => [k, form[k]])));
      showToast(emailChanged ? 'Profile saved. Sign in with your new email from now on.' : 'Profile saved.', 'success');
      onSaved(res.data);
    } catch (err) {
      setErrors(fieldErrorsFrom(err));
      showToast(extractErrorMessage(err, "We couldn't save your profile."), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section id="profile" icon={UserCircleIcon} title="Profile" description="Your name and how the office can reach you.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="first_name">First name</label>
            <input id="first_name" name="first_name" required value={form.first_name} onChange={update} className={inputClass} autoComplete="given-name" />
            {errors.first_name && <p className={errorClass}>{errors.first_name}</p>}
          </div>
          <div>
            <label className={labelClass} htmlFor="last_name">Last name</label>
            <input id="last_name" name="last_name" required value={form.last_name} onChange={update} className={inputClass} autoComplete="family-name" />
            {errors.last_name && <p className={errorClass}>{errors.last_name}</p>}
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required value={form.email} onChange={update} className={inputClass} autoComplete="email" />
          {errors.email && <p className={errorClass}>{errors.email}</p>}
          {emailChanged && !errors.email && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">You will sign in with this new email after saving.</p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="contact_number">Mobile number <span className="text-slate-400 font-normal">(optional)</span></label>
          <input
            id="contact_number" name="contact_number" type="tel" inputMode="tel" autoComplete="tel"
            placeholder="09XXXXXXXXX" value={form.contact_number} onChange={update}
            aria-invalid={contactInvalid}
            className={`${inputClass} ${contactInvalid ? 'border-red-400 dark:border-red-500 focus:ring-red-500' : ''}`}
          />
          {(contactInvalid || errors.contact_number) && <p role="alert" className={errorClass}>{errors.contact_number || CONTACT_NUMBER_ERROR}</p>}
        </div>

        {isStaff && (
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 text-sm">
            <div><dt className="text-xs text-slate-400 dark:text-slate-500">Employee ID</dt><dd className="font-mono font-bold text-blue-600 dark:text-blue-400">{profile.employee_id || '—'}</dd></div>
            <div><dt className="text-xs text-slate-400 dark:text-slate-500">Office</dt><dd className="font-semibold text-slate-800 dark:text-slate-200">{profile.office || '—'}</dd></div>
            <div><dt className="text-xs text-slate-400 dark:text-slate-500">Position</dt><dd className="font-semibold text-slate-800 dark:text-slate-200">{profile.position || '—'}</dd></div>
            <p className="sm:col-span-3 text-xs text-slate-500 dark:text-slate-400">Your office and position are managed by the Municipal Administrator.</p>
          </dl>
        )}

        <div className="flex justify-end">
          <button
            type="submit" disabled={saving || contactInvalid || changed.length === 0}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg px-5 py-2.5 transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Section>
  );
}

function PasswordSection() {
  const { showToast } = useToast();
  const empty = { current_password: '', new_password: '', confirm_password: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  // Live hints mirror Django's default validators; the server still has the final say.
  const checks = [
    { ok: form.new_password.length >= 8, label: 'At least 8 characters' },
    { ok: form.new_password !== '' && !/^\d+$/.test(form.new_password), label: 'Not only numbers' },
    { ok: form.new_password !== '' && form.new_password !== form.current_password, label: 'Different from your current password' },
    { ok: form.confirm_password !== '' && form.new_password === form.confirm_password, label: 'Both new passwords match' },
  ];
  const ready = form.current_password && checks.every((c) => c.ok);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    setErrors({});
    try {
      const res = await changeMyPassword(form);
      localStorage.setItem('access_token', res.data.access);
      localStorage.setItem('refresh_token', res.data.refresh);
      setForm(empty);
      showToast(res.data.message, 'success');
    } catch (err) {
      setErrors(fieldErrorsFrom(err));
      showToast(extractErrorMessage(err, "We couldn't change your password."), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section id="security" icon={ShieldCheckIcon} title="Password & Security" description="Changing your password signs out your other devices.">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label className={labelClass} htmlFor="current_password">Current password</label>
          <PasswordInput id="current_password" name="current_password" required autoComplete="current-password" value={form.current_password} onChange={update} className={inputClass} />
          {errors.current_password && <p className={errorClass}>{errors.current_password}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="new_password">New password</label>
          <PasswordInput id="new_password" name="new_password" required autoComplete="new-password" value={form.new_password} onChange={update} className={inputClass} />
          {errors.new_password && <p className={errorClass}>{errors.new_password}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="confirm_password">Confirm new password</label>
          <PasswordInput id="confirm_password" name="confirm_password" required autoComplete="new-password" value={form.confirm_password} onChange={update} className={inputClass} />
          {errors.confirm_password && <p className={errorClass}>{errors.confirm_password}</p>}
        </div>
        {form.new_password && (
          <ul className="text-xs space-y-1" aria-live="polite">
            {checks.map((c) => (
              <li key={c.label} className={c.ok ? 'text-green-700 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}>
                {c.ok ? '✓' : '○'} {c.label}
              </li>
            ))}
          </ul>
        )}
        <button
          type="submit" disabled={saving || !ready}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg px-5 py-2.5 transition-colors"
        >
          {saving ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </Section>
  );
}

function NotificationsSection({ profile, onSaved }) {
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState(profile.notification_preferences);
  const [busyKey, setBusyKey] = useState(null);

  const toggle = async (key, enabled) => {
    setPrefs((list) => list.map((p) => (p.key === key ? { ...p, enabled } : p)));
    setBusyKey(key);
    try {
      const res = await updateMyProfile({ notification_preferences: { [key]: enabled } });
      setPrefs(res.data.notification_preferences);
      onSaved(res.data);
    } catch (err) {
      setPrefs((list) => list.map((p) => (p.key === key ? { ...p, enabled: !enabled } : p)));
      showToast(extractErrorMessage(err, "We couldn't save that setting."), 'error');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Section id="notifications" icon={BellIcon} title="Notifications" description="Choose which alerts you receive. Changes save right away.">
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {prefs.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm text-slate-700 dark:text-slate-300">{p.label}</span>
            <button
              type="button" role="switch" aria-checked={p.enabled} aria-label={p.label}
              disabled={busyKey === p.key} onClick={() => toggle(p.key, !p.enabled)}
              className={`relative w-12 h-7 shrink-0 rounded-full transition-colors disabled:opacity-60 ${p.enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${p.enabled ? 'translate-x-5' : ''}`} />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
        Follow-up requests from citizens and account security notices are always sent.
      </p>
    </Section>
  );
}

function AppearanceSection() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Section id="appearance" icon={theme === 'dark' ? MoonIcon : SunIcon} title="Appearance" description="Saved on this device only.">
      <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1" role="group" aria-label="Theme">
        {['light', 'dark'].map((mode) => (
          <button
            key={mode} type="button" aria-pressed={theme === mode}
            onClick={() => theme !== mode && toggleTheme()}
            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${theme === mode ? 'bg-white dark:bg-slate-700 shadow text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
          >
            {mode}
          </button>
        ))}
      </div>
    </Section>
  );
}

function LinkedRequestsSection() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchMyLinkedRequests().then((res) => setData(res.data)).catch(() => setData({ error: true }));
  }, []);

  return (
    <Section id="linked" icon={ArrowRightLeftIcon} title="Linked Requests" description="Walk-in requests made under your email are added to your account when you sign in.">
      {!data ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : data.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">Couldn't load your linked requests.</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            Matching email: <span className="font-semibold text-slate-800 dark:text-slate-200 break-all">{data.email}</span>
            {' · '}Requests on your account: <span className="font-semibold text-slate-800 dark:text-slate-200">{data.requests_on_account}</span>
          </p>
          {data.events.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">No walk-in requests have been linked yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.events.map((e) => (
                <li key={e.timestamp} className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
                  <p className="text-slate-700 dark:text-slate-300">{e.detail}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{new Date(e.timestamp).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  );
}

/** Profile & Settings for every role; sections appear according to the user's role. */
export default function AccountSettings() {
  const { refreshUser } = useAuth();
  const { hash } = useLocation();
  const [profile, setProfile] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchMyProfile().then((res) => setProfile(res.data)).catch(() => setFailed(true));
  }, []);

  // The header's "Settings" link jumps past the profile to the preferences.
  useEffect(() => {
    if (profile && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [profile, hash]);

  const handleSaved = (updated) => {
    setProfile(updated);
    refreshUser();
  };

  if (failed) return <p className="text-red-600 dark:text-red-400">Couldn't load your account. Please refresh the page.</p>;
  if (!profile) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Profile & Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your account details, password, and preferences.</p>
      </div>
      <ProfileSection key={profile.email + profile.first_name + profile.last_name + profile.contact_number} profile={profile} onSaved={handleSaved} />
      <PasswordSection />
      {profile.notification_preferences.length > 0 && <NotificationsSection profile={profile} onSaved={handleSaved} />}
      <AppearanceSection />
      {profile.role === 'citizen' && <LinkedRequestsSection />}
    </div>
  );
}
