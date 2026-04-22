import { useNavigate } from 'react-router-dom';

// Full-bleed welcome screen. Photo collage fills the viewport; brand +
// tagline sit at the top, Welcome copy + CTA overlay the bottom. Matches
// the phone-mockup aesthetic from the marketing shot.

const COLLAGE = [
  // 2 × 4 grid filling the mid-screen. Mixing skill shots (dramatic)
  // with gym shots (accessible) keeps the pitch balanced. Swap file
  // names to change the collage - images live under /public/welcome/.
  '/welcome/skill-flag.jpg',
  '/welcome/gym-explore.jpg',
  '/welcome/skill-backlever.jpg',
  '/welcome/gym-essentials.jpg',
  '/welcome/skill-pike.jpg',
  '/welcome/gym-elevate.jpg',
  '/welcome/skill-windmill.jpg',
  '/welcome/gym-empower.jpg',
];

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div style={page}>
      {/* Full-bleed photo collage - behind everything */}
      <div style={collageLayer} aria-hidden>
        <div style={collageGrid}>
          {COLLAGE.map((src) => (
            <div key={src} style={collageCell}>
              <img src={src} alt="" style={collageImg} />
            </div>
          ))}
        </div>
        {/* Gradient wash so text on top remains legible */}
        <div style={gradientWash} />
      </div>

      {/* Foreground content */}
      <div style={foreground}>
        {/* Top: logo + wordmark together */}
        <div style={topBlock}>
          <img src="/am-logo.png" alt="Ageless Movement" style={logo} />
          <h1 style={wordmark}>Ageless Movement</h1>
        </div>

        {/* Flex spacer pushes tagline toward vertical middle */}
        <div style={{ flex: 1 }} />

        {/* Hero tagline - full-bleed, centered on the collage */}
        <div style={taglineBlock}>
          <div style={taglineSmall}>TRAIN</div>
          <div style={taglineLarge}>
            WHEREVER,<br />WHENEVER
          </div>
        </div>

        {/* Flex spacer balances the one above so tagline sits visually centered */}
        <div style={{ flex: 1 }} />

        {/* Bottom: welcome copy + CTA */}
        <div style={bottomBlock}>
          <h2 style={welcomeTitle}>WELCOME</h2>
          <p style={welcomeBody}>
            Making world-class health and<br />fitness accessible for everyone.
          </p>
          <button onClick={() => navigate('/onboarding')} style={ctaBtn}>
            Get Started
          </button>
          <p style={loginLink}>
            Already have an account?{' '}
            <span onClick={() => navigate('/login')} style={loginLinkTxt}>Sign In</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────────

const page = {
  position: 'relative',
  minHeight: '100vh',
  background: '#060D1A',
  color: '#fff',
  overflow: 'hidden',
};

const collageLayer = {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
};

const collageGrid = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gridTemplateRows: 'repeat(4, 1fr)',
  gap: 2,
};

const collageCell = {
  overflow: 'hidden',
  background: '#000',
};

const collageImg = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  filter: 'grayscale(0.25) contrast(1.05) brightness(0.9)',
};

// Vertical gradient: mostly transparent through the middle (photos visible),
// dark at top and bottom so the brand + welcome copy remain readable.
const gradientWash = {
  position: 'absolute',
  inset: 0,
  background: `
    linear-gradient(
      180deg,
      rgba(6, 13, 26, 0.92) 0%,
      rgba(6, 13, 26, 0.55) 22%,
      rgba(6, 13, 26, 0.2) 42%,
      rgba(6, 13, 26, 0.35) 60%,
      rgba(6, 13, 26, 0.85) 82%,
      rgba(6, 13, 26, 0.98) 100%
    )
  `,
};

const foreground = {
  position: 'relative',
  zIndex: 1,
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  padding: '32px 24px 32px',
  maxWidth: 480,
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
};

const topBlock = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: 12,
  textShadow: '0 2px 14px rgba(0,0,0,0.55)',
};

const logo = {
  width: 72,
  height: 72,
  borderRadius: '50%',
  border: '1.5px solid rgba(255, 255, 255, 0.22)',
  boxShadow: '0 8px 24px rgba(133, 255, 186, 0.22)',
};

const taglineBlock = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: 8,
  // Reach past the foreground's 24px side padding so the hero line
  // really fills the screen edge-to-edge.
  marginLeft: -24,
  marginRight: -24,
  textShadow: '0 2px 18px rgba(0,0,0,0.6)',
};

const wordmark = {
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: 0.5,
  color: '#fff',
  margin: 0,
};

const taglineSmall = {
  fontSize: 14,
  letterSpacing: 6,
  color: 'rgba(255,255,255,0.6)', // light grey
  fontWeight: 600,
};

const taglineLarge = {
  // Scales with viewport so the hero line reaches edge-to-edge on every
  // phone width without clipping on narrow devices or looking tiny on wide.
  fontSize: 'clamp(42px, 14vw, 64px)',
  fontWeight: 900,
  letterSpacing: 1,
  lineHeight: 1.02,
  color: '#fff',
};

const bottomBlock = {
  textAlign: 'center',
  paddingBottom: 8,
};

const welcomeTitle = {
  fontSize: 13,
  letterSpacing: 4,
  color: '#85FFBA',
  fontWeight: 800,
  marginBottom: 8,
};

const welcomeBody = {
  fontSize: 14,
  lineHeight: 1.5,
  color: 'rgba(255,255,255,0.85)',
  margin: '0 0 20px',
  textShadow: '0 2px 12px rgba(0,0,0,0.45)',
};

const ctaBtn = {
  width: '100%',
  padding: '16px 24px',
  borderRadius: 14,
  background: 'var(--accent)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: 0.5,
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 10px 28px rgba(255, 140, 0, 0.35)',
};

const loginLink = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.75)',
  margin: '16px 0 0',
  textShadow: '0 1px 6px rgba(0,0,0,0.4)',
};

const loginLinkTxt = {
  color: '#85FFBA',
  fontWeight: 700,
  cursor: 'pointer',
};
