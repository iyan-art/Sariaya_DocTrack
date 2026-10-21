import { useState } from 'react';
import { EyeIcon, EyeOffIcon } from './Icons';

/**
 * A password <input> with a built-in show/hide eye toggle. Drop-in
 * replacement for <input type="password">  — same props, plus the toggle
 * button positioned inside the field. Used everywhere a password is
 * collected (citizen registration, and the shared citizen/staff/admin
 * login) so the masking behavior stays consistent in one place.
 */
export default function PasswordInput({ className = '', ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        className={`${className} pr-11`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      >
        {visible ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
      </button>
    </div>
  );
}
