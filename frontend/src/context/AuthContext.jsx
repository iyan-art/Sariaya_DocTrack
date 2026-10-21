import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const AuthContext = createContext(null);

// Decodes a JWT's payload without verifying its signature — this is only
// ever used to read the `exp` claim for an early, client-side "is this
// worth even trying" check. The server is still the real authority: every
// protected request carries the token and Django/SimpleJWT rejects it
// again if it's actually invalid, forged, or revoked.
function decodeJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null; // malformed/unreadable token
  }
}

// `exp` is seconds-since-epoch (JWT standard); Date.now() is milliseconds.
// A token with no readable `exp` claim at all is treated as expired too,
// rather than trusted by default.
function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  return !payload?.exp || Date.now() >= payload.exp * 1000;
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);   // { id, email, role, full_name, ... } — null until a session is confirmed
  const [loading, setLoading] = useState(true); // true while we check "are we logged in?"

  // On app load (including every full refresh), decide whether to restore
  // a session BEFORE trusting anything in localStorage.
  useEffect(() => {
    const accessToken = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');

    // No tokens at all, or the long-lived refresh token has already
    // expired (so there is no way to recover this session even via the
    // silent-refresh flow below) — fail fast. `user` stays null and
    // ProtectedRoute sends any protected route straight to /login; the
    // public Landing page at "/" is unaffected either way.
    if (!accessToken || !refreshToken || isTokenExpired(refreshToken)) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      setLoading(false);
      return;
    }

    // The access token itself may be expired while the refresh token is
    // still good — that's the normal case on a returning visit, and
    // api.js's response interceptor already handles it transparently
    // (a 401 here triggers one silent refresh-and-retry before this
    // resolves), so it's deliberately NOT special-cased away here.
    api.get('/accounts/me/')
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      })
      .finally(() => setLoading(false));
  }, []);

  // Silently re-fetches the current user's own profile — used to pick up
  // changes made elsewhere (an admin editing this user's office/position in
  // User Management, say) without forcing a logout/login. `user` is only
  // ever set once at login and read from here afterward for the lifetime of
  // the tab, so without this, a staff member who gets reassigned to a new
  // office while already logged in would keep acting under their old office
  // in every office-matching check in the UI until they manually refreshed.
  const refreshUser = () => {
    if (!localStorage.getItem('access_token')) return;
    api.get('/accounts/me/').then((res) => setUser(res.data)).catch(() => {});
  };

  // Re-check on return to the tab (switching back from another tab/app, or
  // waking the device) — the moments a change made elsewhere is most likely
  // to have happened without this tab knowing.
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== 'hidden') refreshUser(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/accounts/login/', { email, password });
    localStorage.setItem('access_token', res.data.access);
    localStorage.setItem('refresh_token', res.data.refresh);
    setUser(res.data.user);
    // Existing callers only ever read .role/.full_name/etc off this — adding
    // linked_guest_documents (present only when Automatic Guest-to-User
    // Account Linking actually found something) doesn't change that contract.
    return { ...res.data.user, linked_guest_documents: res.data.linked_guest_documents };
  };

  const register = async (formData) => {
    const res = await api.post('/accounts/register/', formData);
    return res.data;
  };

  // Clears every localStorage key (not just the two auth tokens — a stray
  // leftover key should never be able to influence the next session) and
  // always lands back on the public Landing page, regardless of which
  // protected route the user was on when they logged out.
  const logout = () => {
    localStorage.clear();
    setUser(null);
    navigate('/', { replace: true });
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
