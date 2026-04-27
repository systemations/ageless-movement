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

  const login = async (email, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('am_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const register = async (email, password, name, role, onboarding) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, role, onboarding }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('am_token', data.token);
    localStorage.removeItem('am_onboarding_answers');
    setToken(data.token);
    setUser(data.user);
    // Pull the freshly-created profile so the routing guard can decide
    // whether to lock them on /onboarding (slim signup path) or send
    // them straight to /home (legacy path with onboarding inline).
    try {
      const meRes = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${data.token}` } });
      if (meRes.ok) {
        const me = await meRes.json();
        setProfile(me.profile);
      }
    } catch {}
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
