import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const TYPES = [
  { key: 'bug', label: '🐛 Bug', hint: "Something broke or didn't work" },
  { key: 'idea', label: '💡 Idea', hint: 'A suggestion or request' },
  { key: 'praise', label: '⭐ Praise', hint: 'Something you loved' },
  { key: 'other', label: '💬 Other', hint: 'Anything else' },
];

export default function FeedbackForm() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!message.trim() || sending) return;
    setSending(true); setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        // context = where they came from, helps triage bug reports
        body: JSON.stringify({ category, message, context: document.referrer || '' }),
      });
      if (!res.ok) throw new Error('failed');
      setDone(true);
    } catch {
      setError('Could not send - please try again.');
    }
    setSending(false);
  };

  if (done) {
    return (
      <div className="page-content" style={{ paddingBottom: 120, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🙌</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Thanks for the feedback!</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 24 }}>
          It goes straight to the team and helps shape the app.
        </p>
        <button className="btn-primary" onClick={() => { setDone(false); setMessage(''); }} style={{ marginBottom: 10 }}>
          Send more feedback
        </button>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => navigate(-1)} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Send Feedback</h1>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 18 }}>
        Found a bug, have an idea, or just want to say something? Tell us - it goes straight to the team.
      </p>

      <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Type</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
        {TYPES.map(t => (
          <button
            key={t.key}
            onClick={() => setCategory(t.key)}
            style={{
              textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
              border: category === t.key ? '2px solid var(--accent)' : '1px solid var(--divider)',
              background: category === t.key ? 'rgba(255,140,0,0.12)' : 'var(--bg-card)',
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{t.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t.hint}</div>
          </button>
        ))}
      </div>

      <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
        What happened / what would you like?
      </label>
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="The more detail the better - what you were doing, what you expected, what happened."
        style={{
          width: '100%', minHeight: 140, background: 'var(--bg-card)', border: '1px solid var(--divider)',
          borderRadius: 12, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 14,
          outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
        }}
      />

      {error && <p style={{ fontSize: 12, color: '#ff8fa0', marginTop: 10 }}>{error}</p>}

      <button
        className="btn-primary"
        onClick={submit}
        disabled={!message.trim() || sending}
        style={{ marginTop: 16, opacity: (!message.trim() || sending) ? 0.5 : 1 }}
      >
        {sending ? 'Sending...' : 'Send Feedback'}
      </button>
    </div>
  );
}
