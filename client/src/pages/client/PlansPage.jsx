import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Plans landing page - reached from Profile → "Explore Plans". Shows all
// tiers with the client's current plan marked, plus a CTA per tier that
// routes to the coach (message_coach) or an external booking link
// (booking_link). No in-app purchase - upgrades happen off-app so the
// App Store takes no cut.

export default function PlansPage() {
  const navigate = useNavigate();
  const { token, profile } = useAuth();
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/content/tiers', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setTiers(d.tiers || []))
      .catch(() => setTiers([]))
      .finally(() => setLoading(false));
  }, [token]);

  const parseFeatures = (raw) => {
    if (!raw) return [];
    return raw.split('\n').map(s => s.trim()).filter(Boolean);
  };

  const myTierId = profile?.tier_id || 1;
  const myTier = tiers.find(t => t.id === myTierId);
  const myLevel = myTier?.level ?? 0;

  const handleMessageCoach = () => navigate('/messages');
  const handleBookingLink = (url) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div style={page}>
      <div style={inner}>
        <div style={header}>
          <button onClick={() => navigate('/profile')} style={backBtn}>← Back</button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.2, color: 'var(--accent)', fontWeight: 700 }}>
            MEMBERSHIP
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 8, lineHeight: 1.2 }}>
            Ageless Movement plans
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 10, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
            Unlock more of the library, or upgrade to personalised coaching.
          </p>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading plans...</div>
        ) : (
          <div style={grid}>
            {tiers.map(tier => {
              const features = parseFeatures(tier.features);
              const isCurrent = tier.id === myTierId;
              const isHigher = tier.level > myLevel;
              const isRecommended = tier.level === 2 && !isCurrent;
              return (
                <div
                  key={tier.id}
                  style={{
                    ...card,
                    ...(isCurrent ? cardCurrent : {}),
                    ...(isRecommended ? cardRecommended : {}),
                  }}
                >
                  {isCurrent && <div style={chipCurrent}>Your plan</div>}
                  {isRecommended && <div style={chipRecommended}>Most popular</div>}

                  <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{tier.name}</h3>
                  {tier.price_label && (
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>
                      {tier.price_label}
                    </div>
                  )}
                  {tier.description && (
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
                      {tier.description}
                    </p>
                  )}

                  {features.length > 0 && (
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {features.map((f, i) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, lineHeight: 1.4 }}>
                          <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {isCurrent ? (
                    <button style={btnDisabled} disabled>Active plan</button>
                  ) : !isHigher ? (
                    <button style={btnGhost} disabled>Included in your plan</button>
                  ) : tier.cta_type === 'booking_link' && tier.cta_url ? (
                    <button onClick={() => handleBookingLink(tier.cta_url)} style={btnPrimary}>
                      {tier.cta_label || 'Book a call'} →
                    </button>
                  ) : (
                    <button onClick={handleMessageCoach} style={btnPrimary}>
                      {tier.cta_label || 'Message coach'} →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const page = { minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px 16px 48px' };
const inner = { maxWidth: 1040, margin: '0 auto' };
const header = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 };
const backBtn = {
  background: 'transparent', border: 'none', color: 'var(--text-secondary)',
  fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const grid = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 16, maxWidth: 1040, margin: '0 auto',
};
const card = {
  background: 'var(--bg-card)', borderRadius: 16, padding: 22,
  border: '2px solid var(--divider)', display: 'flex', flexDirection: 'column',
  position: 'relative',
};
const cardCurrent = { borderColor: 'rgba(255,255,255,0.3)', opacity: 0.88 };
const cardRecommended = {
  borderColor: 'var(--accent)',
  boxShadow: '0 0 0 3px rgba(255,140,0,0.15)',
};
const chipCurrent = {
  position: 'absolute', top: -10, right: 14,
  background: 'var(--text-secondary)', color: 'var(--bg-primary)',
  fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 10,
  letterSpacing: 0.5, textTransform: 'uppercase',
};
const chipRecommended = {
  position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
  background: 'var(--accent)', color: '#000',
  fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 10,
  letterSpacing: 0.5, textTransform: 'uppercase',
};
const btnPrimary = {
  marginTop: 'auto', padding: '13px 16px', borderRadius: 12, border: 'none',
  background: 'var(--accent)', color: '#000', fontSize: 14, fontWeight: 800,
  cursor: 'pointer',
};
const btnGhost = {
  marginTop: 'auto', padding: '13px 16px', borderRadius: 12,
  background: 'transparent', color: 'var(--text-tertiary)',
  border: '1px solid var(--divider)', fontSize: 14, fontWeight: 700,
  cursor: 'default',
};
const btnDisabled = {
  marginTop: 'auto', padding: '13px 16px', borderRadius: 12,
  background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
  border: 'none', fontSize: 14, fontWeight: 700,
  cursor: 'default',
};
