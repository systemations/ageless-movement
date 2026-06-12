import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { safeUrl } from '../lib/safeUrl';

// Upsell shown when a client taps a locked program. Deliberately mirrors the
// first-login plan screen (SuggestionScreen in OnboardingQuestionnaire) so the
// pricing they see here is the same as the one they saw on day one: Free
// (their current plan) + Prime + Elite, pulled live from /api/content/tiers.
//
// CTAs open an EXTERNAL checkout/booking link (tier.cta_url) in a new tab
// rather than an in-app purchase. Payment confirmation + access granting is
// handled out-of-band (Stripe/Zapier webhook bumps the user's tier) and wired
// separately - see notes in the packages system.
export default function PlansModal({ open, onClose, itemTitle }) {
  const { token, profile } = useAuth();
  const navigate = useNavigate();
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/content/tiers', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setTiers(d.tiers || []))
      .catch(() => setTiers([]))
      .finally(() => setLoading(false));
  }, [open, token]);

  if (!open) return null;

  const myTierId = profile?.tier_id || 1;
  const byName = (n) => tiers.find(t => t.name === n);
  const prime = byName('Prime');
  const elite = byName('Elite');
  const parseFeatures = (raw) => (!raw ? [] : String(raw).split('\n').map(s => s.trim()).filter(Boolean));

  const act = (tier) => {
    const url = safeUrl(tier?.cta_url);
    if (url) {
      // External checkout / booking link - opens off-platform so the purchase
      // doesn't go through an in-app purchase.
      window.open(url, '_blank', 'noopener');
      return;
    }
    // Fallback when no link is configured yet: drop them into the coach inbox.
    onClose?.();
    navigate('/messages');
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={closeBtn} aria-label="Close">✕</button>
        <div style={{ textAlign: 'center', padding: '26px 20px 4px' }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--accent)', fontWeight: 800, marginBottom: 8 }}>
            UNLOCK
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
            {itemTitle || 'Premium content'}
          </h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
            Choose the plan that fits where you're at.
          </p>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading plans...</div>
        ) : (
          <div style={cardGrid}>
            <TierCard
              badge="YOUR PLAN"
              badgeColor="rgba(255,255,255,0.55)"
              title="Free"
              price="Free"
              description="What you're on now. Free content + the Getting Started course."
              features={['Getting Started course', 'Free workout library', 'Workout + meal logging']}
              ctaLabel="Current plan"
              disabled={myTierId === 1}
              onClick={() => {}}
            />
            <TierCard
              badge="MOST POPULAR"
              badgeColor="var(--accent)"
              highlight
              title={prime?.name || 'Prime'}
              price={prime?.price_label || '$49/mo'}
              description={prime?.description || 'Full Ageless Movement program library + group coaching.'}
              features={parseFeatures(prime?.features)}
              ctaLabel={prime?.cta_label || 'Get Prime →'}
              onClick={() => act(prime)}
            />
            <TierCard
              badge="1:1"
              badgeColor="var(--accent-mint)"
              title={elite?.name || 'Elite'}
              price={null}
              description={elite?.description || 'Personalised 1:1 coaching with a dedicated coach.'}
              features={parseFeatures(elite?.features)}
              ctaLabel={elite?.cta_label || 'Book a call →'}
              onClick={() => act(elite)}
            />
          </div>
        )}
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center', padding: '4px 20px 22px', lineHeight: 1.5 }}>
          Payment opens securely in your browser. Access unlocks automatically once it's confirmed.
        </p>
      </div>
    </div>
  );
}

function TierCard({ badge, badgeColor, highlight, title, price, description, features, ctaLabel, onClick, disabled }) {
  return (
    <div style={{ ...card, ...(highlight ? cardHighlight : {}) }}>
      {badge && (
        <div style={{
          position: 'absolute', top: -10, left: 14, background: badgeColor, color: '#000',
          fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 10,
          letterSpacing: 0.5, textTransform: 'uppercase',
        }}>{badge}</div>
      )}
      <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{title}</h3>
      {price && (
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', marginTop: 2 }}>{price}</div>
      )}
      {description && (
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, marginTop: 8 }}>{description}</p>
      )}
      {features && features.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {features.map((f, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, lineHeight: 1.4 }}>
              <span style={{ color: 'var(--accent-mint)', fontWeight: 800, flexShrink: 0, marginTop: 1 }}>✓</span>
              <span style={{ color: 'rgba(255,255,255,0.92)' }}>{f}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          marginTop: 'auto', width: '100%', padding: '12px 14px', borderRadius: 10, border: 'none',
          background: disabled ? 'rgba(255,255,255,0.06)' : (highlight ? 'var(--accent)' : 'rgba(255,255,255,0.08)'),
          color: disabled ? 'var(--text-secondary)' : (highlight ? '#fff' : 'var(--text-primary)'),
          fontSize: 13, fontWeight: 800, cursor: disabled ? 'default' : 'pointer',
        }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}

const backdrop = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const sheet = {
  position: 'relative',
  background: 'radial-gradient(ellipse at top, #132235 0%, #0A1428 70%)',
  borderRadius: 18, width: '100%', maxWidth: 460, maxHeight: '92vh', overflow: 'auto',
  boxShadow: '0 30px 60px rgba(0,0,0,0.45)', border: '1px solid var(--divider)',
};
const closeBtn = {
  position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: '50%',
  background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)',
  border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, zIndex: 2,
};
const cardGrid = {
  display: 'flex', flexDirection: 'column', gap: 16, padding: '18px 20px 6px',
};
const card = {
  background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 20,
  border: '1.5px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column',
  position: 'relative',
};
const cardHighlight = {
  border: '1.5px solid var(--accent)', background: 'rgba(255,140,0,0.06)',
};
