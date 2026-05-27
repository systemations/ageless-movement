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
  // mode = null until the user picks; 'feedback' shows the type grid,
  // 'testimonial' is a simpler "share your experience" prompt.
  const [mode, setMode] = useState(null);
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const isTestimonial = mode === 'testimonial';

  const submit = async () => {
    if (!message.trim() || sending) return;
    setSending(true); setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        // context = where they came from, helps triage bug reports
        body: JSON.stringify({
          category: isTestimonial ? 'testimonial' : category,
          message,
          context: document.referrer || '',
        }),
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
        <div style={{ fontSize: 48, marginBottom: 12 }}>{isTestimonial ? '⭐' : '🙌'}</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          {isTestimonial ? 'Thank you for sharing!' : 'Thanks for the feedback!'}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 24 }}>
          {isTestimonial
            ? 'Your words mean a lot. Dan may feature your testimonial to help others find Ageless Movement.'
            : 'It goes straight to the team and helps shape the app.'}
        </p>
        <button className="btn-primary" onClick={() => { setDone(false); setMessage(''); }} style={{ marginBottom: 10 }}>
          {isTestimonial ? 'Share another' : 'Send more feedback'}
        </button>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>
          Back
        </button>
      </div>
    );
  }

  const goBack = () => { if (mode) { setMode(null); setMessage(''); setError(null); } else { navigate(-1); } };

  // Step 1: choose what they want to do.
  if (!mode) {
    return (
      <div className="page-content" style={{ paddingBottom: 120 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={() => navigate(-1)} style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Feedback &amp; Testimonials</h1>
        </div>

        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
          This is your direct line to the team. Leave <strong style={{ color: 'var(--text-primary)' }}>feedback</strong> to
          report a bug or suggest an improvement, or share a <strong style={{ color: 'var(--text-primary)' }}>testimonial</strong> about
          your experience that Dan may feature to help others. Choose one to get started.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={() => { setMode('feedback'); setCategory('bug'); }} style={{
            textAlign: 'left', padding: '16px 18px', borderRadius: 14, cursor: 'pointer',
            border: '1px solid var(--divider)', background: 'var(--bg-card)', color: 'var(--text-primary)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>💬 Leave Feedback</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Report a bug, suggest an idea, or tell us what could be better.</div>
          </button>
          <button onClick={() => setMode('testimonial')} style={{
            textAlign: 'left', padding: '16px 18px', borderRadius: 14, cursor: 'pointer',
            border: '1px solid var(--divider)', background: 'var(--bg-card)', color: 'var(--text-primary)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>⭐ Give a Testimonial</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Share your experience - Dan may feature it to help others.</div>
          </button>
        </div>
      </div>
    );
  }

  // Step 2: the chosen form.
  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={goBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>{isTestimonial ? 'Share a Testimonial' : 'Send Feedback'}</h1>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 18 }}>
        {isTestimonial
          ? 'Tell us how Ageless Movement has helped you. With your permission, Dan may share it on the website or social media.'
          : 'Found a bug, have an idea, or just want to say something? Tell us - it goes straight to the team.'}
      </p>

      {!isTestimonial && (
        <>
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
        </>
      )}

      <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
        {isTestimonial ? 'Your testimonial' : 'What happened / what would you like?'}
      </label>
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder={isTestimonial
          ? 'What changed for you? How do you feel? What would you tell someone thinking about joining?'
          : 'The more detail the better - what you were doing, what you expected, what happened.'}
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
        {sending ? 'Sending...' : (isTestimonial ? 'Send Testimonial' : 'Send Feedback')}
      </button>

      {isTestimonial && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
          </div>
          <button
            onClick={() => navigate('/events?book=testimonial')}
            style={{
              width: '100%', textAlign: 'left', padding: '16px 18px', borderRadius: 14, cursor: 'pointer',
              border: '1px solid var(--divider)', background: 'var(--bg-card)', color: 'var(--text-primary)',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>📹 Record it on video</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Book a short, relaxed video call with Dan. We may feature clips on social to help others find Ageless Movement.
            </div>
          </button>
        </>
      )}
    </div>
  );
}
