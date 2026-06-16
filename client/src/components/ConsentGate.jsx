import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Re-consent gate (SECURITY.md L8). When a logged-in user has outstanding
// consent versions — a newer Terms/Privacy was published since they last
// accepted, or they predate versioned consent entirely — this blocks the app
// until they accept. Mounted once in App for any signed-in user.

const KIND_LABELS = { terms: 'Terms of Service', privacy: 'Privacy Policy' };
const KIND_PATHS = { terms: '/terms', privacy: '/privacy' };

export default function ConsentGate() {
  const { token, logout } = useAuth();
  const location = useLocation();
  const [outstanding, setOutstanding] = useState(null); // null = loading, [] = none
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setOutstanding([]); return; }
    let alive = true;
    fetch('/api/consent/outstanding', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setOutstanding(d?.outstanding || []); })
      // Fail open: don't trap the user behind the gate on a transient network
      // error — it re-checks on the next mount. Consent was already taken at
      // signup; this only adds the re-accept on a version bump.
      .catch(() => { if (alive) setOutstanding([]); });
    return () => { alive = false; };
  }, [token]);

  // Let the legal pages through so the user can actually read what they're
  // accepting (the links below open these in a new tab).
  if (location.pathname === '/terms' || location.pathname === '/privacy') return null;
  if (!outstanding || outstanding.length === 0) return null;

  const labels = outstanding.map((v) => KIND_LABELS[v.kind] || v.kind);

  const accept = async () => {
    if (!agreed || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/consent/accept', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error();
      setOutstanding([]);
    } catch {
      setError('Could not save right now. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={card}>
        <h2 style={title}>We&apos;ve updated our terms</h2>
        <p style={lead}>
          Please review and accept the latest version{outstanding.length > 1 ? 's' : ''} to
          keep using Ageless Movement.
        </p>
        <ul style={list}>
          {outstanding.map((v) => (
            <li key={`${v.kind}@${v.version}`} style={listItem}>
              <Link
                to={KIND_PATHS[v.kind] || '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={docLink}
              >
                {KIND_LABELS[v.kind] || v.kind} →
              </Link>
              <span style={meta}>{v.summary ? `${v.summary} · ` : ''}v{v.version}</span>
            </li>
          ))}
        </ul>
        <label style={agreeRow}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <span>I have read and agree to the updated {labels.join(' and ')}.</span>
        </label>
        {error && <p style={errStyle}>{error}</p>}
        <button
          onClick={accept}
          disabled={!agreed || saving}
          style={{ ...acceptBtn, opacity: !agreed || saving ? 0.45 : 1 }}
        >
          {saving ? 'Saving…' : 'Accept & Continue'}
        </button>
        <button onClick={logout} style={logoutBtn}>Log out</button>
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed', inset: 0, zIndex: 4000,
  background: 'rgba(4,9,18,0.92)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};
const card = {
  width: '100%', maxWidth: 420,
  background: 'var(--bg-card, #11161f)', borderRadius: 18, padding: '26px 22px',
  color: 'var(--text-primary, #fff)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};
const title = { fontSize: 20, fontWeight: 800, marginBottom: 8, letterSpacing: -0.3 };
const lead = { fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary, #aab3c0)', marginBottom: 18 };
const list = { listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: 12 };
const listItem = {
  display: 'flex', flexDirection: 'column', gap: 2,
  padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.05)',
};
const docLink = { color: '#85FFBA', fontWeight: 700, fontSize: 15, textDecoration: 'none' };
const meta = { fontSize: 12, color: 'var(--text-tertiary, #7c8696)' };
const agreeRow = {
  display: 'flex', gap: 10, alignItems: 'flex-start',
  fontSize: 13.5, lineHeight: 1.45, color: 'var(--text-secondary, #aab3c0)', marginBottom: 16, cursor: 'pointer',
};
const errStyle = { color: '#ff6b6b', fontSize: 13, marginBottom: 12 };
const acceptBtn = {
  width: '100%', padding: '14px 20px', borderRadius: 12, border: 'none',
  background: 'var(--accent-mint, #85FFBA)', color: '#000', fontSize: 16, fontWeight: 700, cursor: 'pointer',
};
const logoutBtn = {
  width: '100%', padding: '12px', borderRadius: 12, marginTop: 10,
  background: 'transparent', color: 'var(--text-tertiary, #7c8696)',
  border: '1px solid var(--divider, rgba(255,255,255,0.12))', fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
