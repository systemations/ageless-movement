import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const [mode, setMode] = useState(null); // null = selection, 'client', 'coach'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      if (data.user.role === 'coach') {
        navigate('/coach/messages');
      } else {
        navigate('/home');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Role selection screen
  if (!mode) {
    return (
      <div className="auth-page">
        <img src="/logo.png" alt="Ageless Movement" className="auth-logo" />
        <h1 className="auth-title">Ageless Movement</h1>
        <p className="auth-subtitle">How are you logging in?</p>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={() => setMode('client')}
            style={{
              background: 'var(--bg-card)', border: '2px solid var(--divider)', borderRadius: 16,
              padding: '24px 20px', cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color 0.2s',
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: 'rgba(61,255,210,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>I'm a Client</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Access your workouts, nutrition & progress</p>
            </div>
          </button>

          <button
            onClick={() => setMode('coach')}
            style={{
              background: 'var(--bg-card)', border: '2px solid var(--divider)', borderRadius: 16,
              padding: '24px 20px', cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color 0.2s',
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,149,0,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>I'm a Coach</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Manage clients, programs & content</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Login form
  return (
    <div className="auth-page">
      <img src="/logo.png" alt="Ageless Movement" className="auth-logo" />
      <h1 className="auth-title">{mode === 'coach' ? 'Coach Login' : 'Client Login'}</h1>
      <p className="auth-subtitle">Sign in to Ageless Movement</p>

      <form className="auth-form" onSubmit={handleSubmit}>
        {error && <div className="auth-error">{error}</div>}

        <div className="input-group">
          <label>Email</label>
          <input
            type="email"
            className="input-field"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="input-group">
          <label>Password</label>
          <input
            type="password"
            className="input-field"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <p className="auth-link">
        Don't have an account? <Link to="/register">Sign Up</Link>
      </p>
      <button
        onClick={() => { setMode(null); setError(''); }}
        style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 13, marginTop: 8, cursor: 'pointer' }}
      >
        ← Back to role selection
      </button>
    </div>
  );
}
