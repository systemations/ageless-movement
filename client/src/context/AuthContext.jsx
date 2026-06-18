import { createContext, useContext, useState, useEffect } from 'react';
import { isNative, setNativeToken, loadFileToken, clearFileToken } from '../lib/nativeApi';

const AuthContext = createContext(null);

const API_URL = '/api';

// The real JWT now lives only in the httpOnly `am_auth` cookie (SECURITY.md L2)
// — it is never stored in localStorage or held in JS, so an XSS can't read it.
// We still expose a truthy `token` sentinel so the app's many `if (token)`
// guards and `Authorization: Bearer ${token}` headers keep working unchanged;
// the server authenticates from the cookie and ignores this value.
const SESSION = 'cookie';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [token, setToken] = useState(null); // SESSION when logged in, else null
  const [loading, setLoading] = useState(true);

  // On load, establish session from the cookie via /me (cookie auto-sent).
  useEffect(() => {
    // One-time cleanup of the pre-L2 localStorage token (now unused).
    try { localStorage.removeItem('am_token'); } catch { /* ignore */ }
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bootstrap = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/me`);
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setProfile(data.profile);
        setToken(SESSION);
      }
    } catch { /* logged out */ }
    setLoading(false);
  };

  // Refetch profile (after onboarding finalize, etc.).
  const refreshProfile = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/me`);
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setProfile(data.profile);
        return data.profile;
      }
    } catch { /* ignore */ }
    return null;
  };

  const detectTimezone = () => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; }
    catch { return null; }
  };

  const login = async (email, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, timezone: detectTimezone() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    // Native: persist the JWT so the fetch wrapper sends it as a Bearer header,
    // then mint the file token — both before the /me call below so its avatar
    // URL gets rewritten for native image loading. Web ignores it (cookie auth).
    if (isNative && data.token) { await setNativeToken(data.token); await loadFileToken(); }
    // The server set the am_auth cookie. Fetch the profile (cookie auth) first,
    // then commit token + user + profile together so ProtectedRoute doesn't
    // flash /home before redirecting an unfinished-onboarding client.
    let freshProfile = null;
    try {
      const meRes = await fetch(`${API_URL}/auth/me`);
      if (meRes.ok) freshProfile = (await meRes.json()).profile;
    } catch { /* ignore */ }
    setProfile(freshProfile);
    setToken(SESSION);
    setUser(data.user);
    return data;
  };

  const register = async (email, password, name, role, onboarding) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, role, onboarding, timezone: detectTimezone() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (isNative && data.token) { await setNativeToken(data.token); await loadFileToken(); } // see login()
    localStorage.removeItem('am_onboarding_answers');
    let freshProfile = null;
    try {
      const meRes = await fetch(`${API_URL}/auth/me`);
      if (meRes.ok) freshProfile = (await meRes.json()).profile;
    } catch { /* ignore */ }
    setProfile(freshProfile);
    setToken(SESSION);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    // Revoke the session + clear the cookie server-side (best-effort).
    try { fetch(`${API_URL}/auth/logout`, { method: 'POST' }).catch(() => {}); } catch { /* ignore */ }
    // Clear the native + file tokens AFTER firing logout (so that request still
    // carried the Bearer to revoke the session server-side). No-op on web.
    if (isNative) { setNativeToken(null); clearFileToken(); }
    setToken(null);
    setUser(null);
    setProfile(null);
    // Clear per-session view caches so the next login doesn't flash old content.
    try { window.dispatchEvent(new Event('am-logout')); } catch { /* SSR/no-window */ }
  };

  return (
    <AuthContext.Provider value={{ user, profile, token, loading, login, register, refreshProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
