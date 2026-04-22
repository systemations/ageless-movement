import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Shown when a client taps a locked Explore item. Renders a side-by-side
// comparison of every tier (price, description, feature checklist) with
// the current tier marked, and a CTA button per tier:
//   - message_coach → routes to the team inbox
//   - booking_link  → opens cta_url in a new tab (e.g. Systemations call)
// Context: {itemTitle, requiredTierName} so the modal opens with a framed
// "Unlock {title}" header.

export default function TiersModal({ open, onClose, itemTitle, requiredTierLevel }) {
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
  const myTier = tiers.find(t => t.id === myTierId);
  const myLevel = myTier?.level ?? 0;

  const handleMessageCoach = async () => {
    onClose?.();
    navigate('/messages');
  };

  const handleBookingLink = (url) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  };

  const parseFeatures = (raw) => {
    if (!raw) return [];
    return raw.split('\n').map(s => s.trim()).filter(Boolean);
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.2, color: 'var(--accent)', fontWeight: 700 }}>
              UNLOCK
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>
              {itemTitle || 'Premium Content'}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
              Choose the plan that fits where you're at.
            </p>
          </div>
          <button onClick={onClose} style={closeBtn} aria-label="Close">✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading plans...</div>
        ) : (
          <div style={grid}>
            {tiers.map(tier => {
              const features = parseFeatures(tier.features);
              const isCurrent = tier.id === myTierId;
              const isHigher = tier.level > myLevel;
              const isRequired = requiredTierLevel != null && tier.level === requiredTierLevel;

              return (
                <div
                  key={tier.id}
                  style={{
                    ...card,
                    ...(isCurrent ? cardCurrent : {}),
                    ...(isRequired ? cardRequired : {}),
                  }}
                >
                  {isCurrent && (
                    <div style={chipCurrent}>Your plan</div>
                  )}
                  {isRequired && !isCurrent && (
                    <div style={chipRequired}>Needed for this</div>
                  )}

                  <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{tier.name}</h3>
                  {tier.price_label && (
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>
                      {tier.price_label}
                    </div>
                  )}
                  {tier.description && (
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
                      {tier.description}
                    </p>
                  )}

                  {features.length > 0 && (
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: 7 }}>
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
                    <button
                      onClick={() => handleBookingLink(tier.cta_url)}
                      style={btnPrimary}
                    >
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

const backdrop = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16,
};
const sheet = {
  background: 'var(--bg-primary)', borderRadius: 18,
  width: '100%', maxWidth: 960, maxHeight: '92vh', overflow: 'auto',
  boxShadow: '0 30px 60px rgba(0,0,0,0.4)',
  border: '1px solid var(--divider)',
};
const header = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  padding: '24px 26px 12px', borderBottom: '1px solid var(--divider)',
};
const closeBtn = {
  width: 34, height: 34, borderRadius: '50%',
  background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
  border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
};
const grid = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 14, padding: 22,
};
const card = {
  background: 'var(--bg-card)', borderRadius: 14, padding: 20,
  border: '2px solid var(--divider)', display: 'flex', flexDirection: 'column',
  position: 'relative',
};
const cardCurrent = {
  borderColor: 'rgba(255,255,255,0.3)', opacity: 0.88,
};
const cardRequired = {
  borderColor: 'var(--accent)',
  boxShadow: '0 0 0 3px rgba(255,140,0,0.15)',
};
const chipCurrent = {
  position: 'absolute', top: -10, right: 14,
  background: 'var(--text-secondary)', color: 'var(--bg-primary)',
  fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 10,
  letterSpacing: 0.5, textTransform: 'uppercase',
};
const chipRequired = {
  position: 'absolute', top: -10, right: 14,
  background: 'var(--accent)', color: '#000',
  fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 10,
  letterSpacing: 0.5, textTransform: 'uppercase',
};
const btnPrimary = {
  marginTop: 'auto', padding: '11px 16px', borderRadius: 10, border: 'none',
  background: 'var(--accent)', color: '#000', fontSize: 13, fontWeight: 800,
  cursor: 'pointer',
};
const btnGhost = {
  marginTop: 'auto', padding: '11px 16px', borderRadius: 10,
  background: 'transparent', color: 'var(--text-tertiary)',
  border: '1px solid var(--divider)', fontSize: 13, fontWeight: 600,
  cursor: 'default',
};
const btnDisabled = {
  marginTop: 'auto', padding: '11px 16px', borderRadius: 10,
  background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
  border: 'none', fontSize: 13, fontWeight: 700,
  cursor: 'default',
};
