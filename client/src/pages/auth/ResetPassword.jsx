import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

// Reset-link landing page. Reads the one-time token from ?token=, takes a new
// password, and posts to /api/auth/reset-password. Reached from the link in
// the reset email (self-service forgot flow or coach-initiated reset).

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (pw.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (pw !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not reset password. The link may have expired.');
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // No token in the URL - nothing to reset. Point them back to the request flow.
  if (!token) {
    return (
      <div style={page}>
        <div style={inner}>
          <div style={brandBlock}>
            <img src="/am-logo.png" alt="Ageless Movement" style={logo} />
            <h1 style={title}>Invalid link</h1>
            <p style={subtitle}>This reset link is missing its token.</p>
          </div>
          <Link to="/forgot-password" style={{ ...ctaBtn, textAlign: 'center', textDecoration: 'none', display: 'block' }}>
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={inner}>
        <div style={brandBlock}>
          <img src="/am-logo.png" alt="Ageless Movement" style={logo} />
          <h1 style={title}>{done ? 'Password updated' : 'Set a new password'}</h1>
          <p style={subtitle}>
            {done ? 'You can now sign in with your new password' : 'Choose a strong password you don’t use elsewhere'}
          </p>
        </div>

        {done ? (
          <Link to="/login" style={{ ...ctaBtn, textAlign: 'center', textDecoration: 'none', display: 'block' }}>
            Go to sign in →
          </Link>
        ) : (
          <form onSubmit={handleSubmit} style={form}>
            {error && <div style={errorBox}>{error}</div>}

            <div style={field}>
              <label style={fieldLabel}>New password</label>
              <input
                type="password"
                placeholder="At least 8 characters"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
                autoComplete="new-password"
                style={input}
              />
            </div>

            <div style={field}>
              <label style={fieldLabel}>Confirm password</label>
              <input
                type="password"
                placeholder="Re-enter your new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                style={input}
              />
            </div>

            <button type="submit" disabled={loading} style={{ ...ctaBtn, opacity: loading ? 0.55 : 1 }}>
              {loading ? 'Updating...' : 'Update password →'}
            </button>
          </form>
        )}

        <p style={newHere}>
          <Link to="/login" style={newHereLink}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

// ── styles (mirrors Login.jsx) ────────────────────────────────────────────

const page = {
  minHeight: '100vh',
  background: 'radial-gradient(ellipse at top, #132235 0%, #0A1428 55%, #060D1A 100%)',
  color: '#fff',
  padding: '24px 22px 40px',
  display: 'flex',
  justifyContent: 'center',
};

const inner = { width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column' };

const brandBlock = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  marginTop: 64, marginBottom: 36,
};

const logo = {
  width: 68, height: 68, borderRadius: '50%',
  border: '1.5px solid rgba(255, 255, 255, 0.22)',
  boxShadow: '0 8px 24px rgba(133, 255, 186, 0.18)', marginBottom: 8,
};

const title = { fontSize: 26, fontWeight: 800, color: '#fff', margin: 0 };
const subtitle = { fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: 0, textAlign: 'center' };
const form = { display: 'flex', flexDirection: 'column', gap: 16 };
const field = { display: 'flex', flexDirection: 'column', gap: 6 };
const fieldLabel = { fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: 'rgba(255,255,255,0.7)' };

const input = {
  padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.05)',
  border: '1.5px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 15, outline: 'none',
};

const ctaBtn = {
  marginTop: 8, padding: '15px 24px', borderRadius: 12, background: 'var(--accent)',
  color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: 0.5, border: 'none',
  cursor: 'pointer', boxShadow: '0 8px 22px rgba(255,140,0,0.28)',
};

const errorBox = {
  padding: '10px 14px', borderRadius: 10, background: 'rgba(255,59,48,0.12)',
  border: '1px solid rgba(255,59,48,0.4)', color: '#ff8fa0', fontSize: 13,
};

const newHere = { fontSize: 13, textAlign: 'center', color: 'rgba(255,255,255,0.55)', marginTop: 28 };
const newHereLink = { color: '#85FFBA', fontWeight: 700, textDecoration: 'none' };
