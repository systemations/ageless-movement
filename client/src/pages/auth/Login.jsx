import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Login for returning users — clients AND coaches. Role on the account
// decides where they land post-login. No more "are you a client or a
// coach?" step up front.

export default function Login() {
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
        // Wide screens land on the admin dashboard, narrow on mobile coach home
        const isNarrow = window.matchMedia('(max-width: 768px)').matches;
        navigate(isNarrow ? '/coach/home' : '/admin');
      } else {
        navigate('/home');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={page}>
      <div style={inner}>
        <button onClick={() => navigate('/welcome')} style={backBtn}>← Back</button>

        <div style={brandBlock}>
          <img src="/am-logo.png" alt="Ageless Movement" style={logo} />
          <h1 style={title}>Welcome back</h1>
          <p style={subtitle}>Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} style={form}>
          {error && <div style={errorBox}>{error}</div>}

          <div style={field}>
            <label style={fieldLabel}>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={input}
            />
          </div>

          <div style={field}>
            <label style={fieldLabel}>Password</label>
            <input
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={input}
            />
          </div>

          <button type="submit" disabled={loading} style={{ ...ctaBtn, opacity: loading ? 0.55 : 1 }}>
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
        </form>

        <p style={newHere}>
          New here?{' '}
          <Link to="/onboarding" style={newHereLink}>Get started →</Link>
        </p>
      </div>
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────────

const page = {
  minHeight: '100vh',
  background: 'radial-gradient(ellipse at top, #132235 0%, #0A1428 55%, #060D1A 100%)',
  color: '#fff',
  padding: '24px 22px 40px',
  display: 'flex',
  justifyContent: 'center',
};

const inner = {
  width: '100%',
  maxWidth: 440,
  display: 'flex',
  flexDirection: 'column',
};

const backBtn = {
  alignSelf: 'flex-start',
  padding: '6px 12px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.85)',
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const brandBlock = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  marginTop: 48,
  marginBottom: 36,
};

const logo = {
  width: 68,
  height: 68,
  borderRadius: '50%',
  border: '1.5px solid rgba(255, 255, 255, 0.22)',
  boxShadow: '0 8px 24px rgba(133, 255, 186, 0.18)',
  marginBottom: 8,
};

const title = {
  fontSize: 26,
  fontWeight: 800,
  color: '#fff',
  margin: 0,
};

const subtitle = {
  fontSize: 14,
  color: 'rgba(255,255,255,0.6)',
  margin: 0,
};

const form = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const field = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const fieldLabel = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.6,
  color: 'rgba(255,255,255,0.7)',
};

const input = {
  padding: '14px 16px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.05)',
  border: '1.5px solid rgba(255,255,255,0.12)',
  color: '#fff',
  fontSize: 15,
  outline: 'none',
};

const ctaBtn = {
  marginTop: 8,
  padding: '15px 24px',
  borderRadius: 12,
  background: 'var(--accent)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: 0.5,
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 8px 22px rgba(255,140,0,0.28)',
};

const errorBox = {
  padding: '10px 14px',
  borderRadius: 10,
  background: 'rgba(255,59,48,0.12)',
  border: '1px solid rgba(255,59,48,0.4)',
  color: '#ff8fa0',
  fontSize: 13,
};

const newHere = {
  fontSize: 13,
  textAlign: 'center',
  color: 'rgba(255,255,255,0.55)',
  marginTop: 28,
};

const newHereLink = {
  color: '#85FFBA',
  fontWeight: 700,
  textDecoration: 'none',
};
