import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Onboarding step that lands between the questionnaire and Home. Shows
// the live payment_plans list (filtered to the current platform - iOS
// users see IAP-marked-up twins, web users see Stripe pricing). Free
// plans are processed instantly via /api/plans/me/choose; paid plans
// stamp tier_requested_id and route the client into chat with their
// coach to complete payment manually until Stripe / IAP land.

const billingLabel = (b) => ({
  one_time: 'one-off',
  weekly: 'per week',
  monthly: 'per month',
  quarterly: 'per quarter',
  yearly: 'per year',
}[b] || b);

const formatPrice = (cents) => {
  if (cents === 0) return 'Free';
  const dollars = cents / 100;
  return `$${dollars.toFixed(dollars >= 100 ? 0 : 2)}`;
};

export default function PackageSelection() {
  const navigate = useNavigate();
  const { token, refreshProfile } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/plans')
      .then((r) => r.json())
      .then((d) => setPlans(d.plans || []))
      .catch(() => setError('Could not load plans'))
      .finally(() => setLoading(false));
  }, []);

  const choose = async (plan) => {
    setSubmitting(plan.id);
    setError(null);
    try {
      const res = await fetch('/api/plans/me/choose', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: plan.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not select plan');
      try { localStorage.setItem('am_chosen_plan_id', String(plan.id)); } catch {}

      // Refresh the cached profile so the routing gate sees the latest
      // tier_id / tier_requested_id rather than the pre-purchase snapshot.
      try { await refreshProfile(); } catch {}

      if (data.free) {
        navigate('/home');
      } else {
        navigate('/messages?intent=upgrade-plan');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div style={page}>
        <div style={inner}>
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: 80 }}>Loading plans…</p>
        </div>
      </div>
    );
  }

  // Free plan rendered as the first card; paid plans grouped under it.
  const free = plans.find((p) => p.price_cents === 0);
  const paid = plans.filter((p) => p.price_cents > 0).sort((a, b) => a.price_cents - b.price_cents);

  return (
    <div style={page}>
      <div style={inner}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <p style={kicker}>STEP 2 OF 2</p>
          <h1 style={title}>Pick your plan</h1>
          <p style={subtitle}>You can change or upgrade anytime. All paid plans include a 3-day free trial.</p>
        </div>

        {error && <div style={errorBox}>{error}</div>}

        {free && (
          <PlanCard
            plan={free}
            highlight
            onSelect={() => choose(free)}
            busy={submitting === free.id}
            ctaLabel="Start Free"
            secondary="Get going immediately. Upgrade when you're ready."
          />
        )}

        {paid.length > 0 && (
          <>
            <div style={dividerWrap}>
              <span style={dividerText}>OR GO ALL-IN</span>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              {paid.map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  onSelect={() => choose(p)}
                  busy={submitting === p.id}
                  ctaLabel={p.billing_type === 'one_time' ? 'Get Started' : 'Start Trial'}
                  secondary={p.billing_type === 'one_time'
                    ? 'One-time payment. Lifetime access.'
                    : `${p.free_trial_days || 0} days free, then ${formatPrice(p.price_cents)} ${billingLabel(p.billing_type)}.`
                  }
                />
              ))}
            </div>
          </>
        )}

        <p style={footnote}>
          Payment is handled by your coach for now. Pick a plan and they'll DM you next steps.
        </p>
      </div>
    </div>
  );
}

function PlanCard({ plan, highlight, onSelect, busy, ctaLabel, secondary }) {
  const isFree = plan.price_cents === 0;
  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: 16,
      padding: 20,
      border: highlight ? '2px solid var(--accent-mint)' : '1px solid var(--divider)',
      marginBottom: highlight ? 14 : 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, gap: 12 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800 }}>{plan.name}</h3>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{formatPrice(plan.price_cents)}</span>
          {!isFree && plan.billing_type !== 'one_time' && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 4 }}>/ {billingLabel(plan.billing_type).replace('per ', '')}</span>
          )}
        </div>
      </div>

      {plan.description && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.45 }}>
          {plan.description}
        </p>
      )}

      {secondary && (
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>
          {secondary}
        </p>
      )}

      <button
        onClick={onSelect}
        disabled={busy}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: 12,
          border: 'none',
          background: highlight ? 'var(--accent-mint)' : 'var(--accent)',
          color: highlight ? '#000' : '#fff',
          fontSize: 15,
          fontWeight: 800,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >{busy ? 'One sec…' : ctaLabel}</button>
    </div>
  );
}

const page = {
  minHeight: '100vh',
  background: 'var(--bg-primary)',
  padding: '32px 16px 60px',
};

const inner = {
  maxWidth: 520,
  margin: '0 auto',
};

const kicker = {
  fontSize: 11,
  letterSpacing: 3,
  color: 'var(--accent)',
  fontWeight: 800,
  marginBottom: 6,
  textTransform: 'uppercase',
};

const title = {
  fontSize: 28,
  fontWeight: 800,
  marginBottom: 6,
};

const subtitle = {
  fontSize: 14,
  color: 'var(--text-secondary)',
};

const dividerWrap = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  margin: '20px 0 14px',
};

const dividerText = {
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--text-tertiary)',
  letterSpacing: 2,
  flex: 1,
  textAlign: 'center',
  position: 'relative',
};

const footnote = {
  fontSize: 11,
  color: 'var(--text-tertiary)',
  textAlign: 'center',
  marginTop: 24,
  lineHeight: 1.5,
};

const errorBox = {
  background: 'rgba(255, 94, 94, 0.12)',
  border: '1px solid rgba(255, 94, 94, 0.3)',
  borderRadius: 10,
  padding: '10px 14px',
  color: '#FF5E5E',
  fontSize: 13,
  marginBottom: 14,
};
