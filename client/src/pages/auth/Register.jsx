import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// New-client signup. Reached from the end of the onboarding funnel,
// which leaves the user's answers in localStorage. We pick those up here
// and forward to the server so registration + program enrolment happen
// in a single atomic call.
//
// Coaches are invite-only - they don't come through this screen.

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const role = 'client';
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!consent) {
      setError('Please accept the Terms and Privacy Policy to continue.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      // If the user came through onboarding, carry those answers so the
      // server can save them + auto-enrol the matched program. Absent →
      // the server just creates the account; a coach can set up a program
      // from the review queue.
      let onboarding = null;
      try {
        const raw = localStorage.getItem('am_onboarding_answers');
        if (raw) onboarding = JSON.parse(raw);
      } catch {}

      const data = await register(email, password, name, role, onboarding);
      navigate(data.user.role === 'coach' ? '/coach/messages' : '/home');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={page}>
      <div style={inner}>
        <button onClick={() => navigate('/onboarding')} style={backBtn}>← Back</button>

        <div style={brandBlock}>
          <img src="/am-logo.png" alt="Ageless Movement" style={logo} />
          <h1 style={title}>Create your account</h1>
          <p style={subtitle}>One last step before we start.</p>
        </div>

        <form onSubmit={handleSubmit} style={form}>
          {error && <div style={errorBox}>{error}</div>}

          <div style={field}>
            <label style={fieldLabel}>Name</label>
            <input
              type="text"
              placeholder="First and last name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              style={input}
            />
          </div>

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
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              style={input}
            />
          </div>

          <label style={consentRow}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{ marginTop: 3, accentColor: '#85FFBA' }}
            />
            <span>
              I agree to the{' '}
              <Link to="/terms" target="_blank" rel="noopener noreferrer" style={consentLink}>Terms</Link>
              {' '}and{' '}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" style={consentLink}>Privacy Policy</Link>.
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !consent}
            style={{ ...ctaBtn, opacity: (loading || !consent) ? 0.45 : 1 }}
          >
            {loading ? 'Creating account...' : 'Create Account →'}
          </button>
        </form>

        <p style={returning}>
          Already have an account?{' '}
          <Link to="/login" style={returningLink}>Sign in</Link>
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
  marginTop: 32,
  marginBottom: 28,
};

const logo = {
  width: 64,
  height: 64,
  borderRadius: '50%',
  border: '1.5px solid rgba(255, 255, 255, 0.22)',
  boxShadow: '0 8px 24px rgba(133, 255, 186, 0.18)',
  marginBottom: 8,
};

const title = {
  fontSize: 24,
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

const consentRow = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  fontSize: 13,
  color: 'rgba(255,255,255,0.7)',
  lineHeight: 1.5,
  marginTop: 2,
  cursor: 'pointer',
};

const consentLink = {
  color: '#85FFBA',
  textDecoration: 'none',
  fontWeight: 600,
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

const returning = {
  fontSize: 13,
  textAlign: 'center',
  color: 'rgba(255,255,255,0.55)',
  marginTop: 24,
};

const returningLink = {
  color: '#85FFBA',
  fontWeight: 700,
  textDecoration: 'none',
};
