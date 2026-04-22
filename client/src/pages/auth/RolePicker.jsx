import { useNavigate } from 'react-router-dom';

// Shown after the welcome screen. "How are you joining?" — funnels clients
// into signup and coaches into login. Coaches are invite-only so there's
// no "coach register" path; if a coach lands here and taps the card they
// go to the login screen with their account already provisioned by admin.

export default function RolePicker() {
  const navigate = useNavigate();

  return (
    <div style={page}>
      <div style={inner}>
        <button onClick={() => navigate('/welcome')} style={backBtn} aria-label="Back">
          ← Back
        </button>

        <div style={{ marginTop: 36, textAlign: 'center' }}>
          <img src="/am-logo.png" alt="" style={logo} />
          <h1 style={title}>How are you joining?</h1>
          <p style={subtitle}>We'll take you where you need to go.</p>
        </div>

        <div style={cards}>
          <Card
            accentColor="#85FFBA"
            headline="I'm a Client"
            body="New or existing. Training, mobility, nutrition, community."
            cta="Continue as Client"
            onClick={() => navigate('/onboarding')}
          />
          <Card
            accentColor="var(--accent)"
            headline="I'm a Coach"
            body="Invite-only. Sign in with the credentials we provided."
            cta="Sign in as Coach"
            onClick={() => navigate('/login?role=coach')}
          />
        </div>

        <p style={helpText}>
          Not sure? <span onClick={() => navigate('/login')} style={helpLink}>Just sign in</span>
        </p>
      </div>
    </div>
  );
}

function Card({ accentColor, headline, body, cta, onClick }) {
  return (
    <div onClick={onClick} style={{ ...card, borderColor: `${accentColor}40` }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = accentColor; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = `${accentColor}40`; }}
    >
      <div style={{ fontSize: 20, fontWeight: 800, color: accentColor, marginBottom: 6 }}>
        {headline}
      </div>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, margin: '0 0 16px' }}>
        {body}
      </p>
      <div style={{
        padding: '12px 16px', borderRadius: 10,
        background: accentColor, color: '#0A1428',
        fontSize: 13, fontWeight: 800, letterSpacing: 0.3,
        textAlign: 'center',
      }}>
        {cta} →
      </div>
    </div>
  );
}

const page = {
  minHeight: '100vh',
  background: 'radial-gradient(ellipse at top, #132235 0%, #0A1428 55%, #060D1A 100%)',
  color: '#fff',
  padding: '24px 20px 40px',
};

const inner = {
  width: '100%',
  maxWidth: 440,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
};

const backBtn = {
  alignSelf: 'flex-start',
  padding: '8px 14px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.85)',
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const logo = {
  width: 58, height: 58, borderRadius: '50%', marginBottom: 14,
};

const title = {
  fontSize: 24,
  fontWeight: 800,
  color: '#fff',
  margin: '0 0 6px',
};

const subtitle = {
  fontSize: 14,
  color: 'rgba(255,255,255,0.6)',
  margin: 0,
};

const cards = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  marginTop: 28,
};

const card = {
  padding: '20px 22px',
  borderRadius: 16,
  background: 'rgba(255,255,255,0.03)',
  border: '2px solid rgba(133,255,186,0.25)',
  cursor: 'pointer',
  transition: 'border-color 0.15s',
};

const helpText = {
  fontSize: 13,
  textAlign: 'center',
  color: 'rgba(255,255,255,0.5)',
  marginTop: 22,
};

const helpLink = {
  color: '#85FFBA',
  fontWeight: 700,
  cursor: 'pointer',
};
