import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// Self-service "forgot password" entry point. Posts the email to
// /api/auth/forgot-password and always shows the same confirmation,
// regardless of whether the account exists - the server is deliberately
// non-committal to avoid leaking which emails are registered, so the UI
// must not imply success/failure based on the address either.

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={page}>
      <div style={inner}>
        <button onClick={() => navigate('/login')} style={backBtn}>← Back to sign in</button>

        <div style={brandBlock}>
          <img src="/am-logo.png" alt="Ageless Movement" style={logo} />
          <h1 style={title}>Forgot password?</h1>
          <p style={subtitle}>
            {sent ? 'Check your inbox' : "Enter your email and we'll send you a reset link"}
          </p>
        </div>

        {sent ? (
          <div style={form}>
            <div style={successBox}>
              If an account exists for <strong>{email.trim().toLowerCase()}</strong>, a
              password reset link is on its way. The link expires in 60 minutes.
            </div>
            <p style={hint}>
              Didn't get it? Check spam, or{' '}
              <button type="button" onClick={() => setSent(false)} style={linkBtn}>try again</button>.
            </p>
            <Link to="/login" style={{ ...ctaBtn, textAlign: 'center', textDecoration: 'none', display: 'block' }}>
              Back to sign in
            </Link>
          </div>
        ) : (
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
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                inputMode="email"
                style={input}
              />
            </div>

            <button type="submit" disabled={loading} style={{ ...ctaBtn, opacity: loading ? 0.55 : 1 }}>
              {loading ? 'Sending...' : 'Send reset link →'}
            </button>
          </form>
        )}

        <p style={newHere}>
          Remembered it?{' '}
          <Link to="/login" style={newHereLink}>Sign in →</Link>
        </p>
      </div>
    </div>
  );
}

// ── styles (mirrors Login.jsx) ────────────────────────────────────────────

const page = {
  // Fill the app-shell content area (already inset for the status bar) so the
  // page doesn't overflow by the safe-area-top and cause a small scroll.
  minHeight: 'calc(100dvh - env(safe-area-inset-top, 0px))',
  background: 'radial-gradient(ellipse at top, #132235 0%, #0A1428 55%, #060D1A 100%)',
  color: '#fff',
  padding: '24px 22px calc(40px + env(safe-area-inset-bottom, 0px))',
  display: 'flex',
  justifyContent: 'center',
};

const inner = { width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column' };

const backBtn = {
  alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 10,
  background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.85)',
  border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const brandBlock = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  marginTop: 48, marginBottom: 36,
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

const successBox = {
  padding: '14px 16px', borderRadius: 12, background: 'rgba(133,255,186,0.10)',
  border: '1px solid rgba(133,255,186,0.35)', color: '#bdffd9', fontSize: 14, lineHeight: 1.55,
};

const hint = { fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0, textAlign: 'center' };

const linkBtn = {
  background: 'none', border: 'none', color: '#85FFBA', fontWeight: 700,
  cursor: 'pointer', fontSize: 13, padding: 0,
};

const newHere = { fontSize: 13, textAlign: 'center', color: 'rgba(255,255,255,0.55)', marginTop: 28 };
const newHereLink = { color: '#85FFBA', fontWeight: 700, textDecoration: 'none' };
