import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const API_URL = '/api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('am_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setProfile(data.profile);
      } else {
        logout();
      }
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  };

  // Refetch profile from the server. Used after onboarding finalize so
  // the routing guard in App.jsx sees onboarding_complete = 1 without
  // requiring a hard reload.
  const refreshProfile = async () => {
    if (!token) return null;
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setProfile(data.profile);
        return data.profile;
      }
    } catch {}
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
    localStorage.setItem('am_token', data.token);
    // Same race as register(): if setUser lands before profile, ProtectedRoute
    // on /home renders for one frame before being redirected to /onboarding.
    // Fetch profile first, commit token + user + profile in a single render.
    let freshProfile = null;
    try {
      const meRes = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${data.token}` } });
      if (meRes.ok) {
        const me = await meRes.json();
        freshProfile = me.profile;
      }
    } catch {}
    setProfile(freshProfile);
    setToken(data.token);
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
    localStorage.setItem('am_token', data.token);
    localStorage.removeItem('am_onboarding_answers');
    // IMPORTANT: fetch the profile BEFORE flipping user, then commit
    // both together. If user lands first, /register's route element
    // immediately Navigates to defaultRoute (/home) because user is
    // truthy. ProtectedRoute on /home can't redirect to /onboarding
    // yet (it requires profile to be present), so Home flashes for a
    // frame until profile arrives. Awaiting /me before setUser closes
    // that race so the user goes straight from /register -> /onboarding
    // with no flash.
    let freshProfile = null;
    try {
      const meRes = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${data.token}` } });
      if (meRes.ok) {
        const me = await meRes.json();
        freshProfile = me.profile;
      }
    } catch {}
    setProfile(freshProfile);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('am_token');
    setToken(null);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, token, loading, login, register, refreshProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
