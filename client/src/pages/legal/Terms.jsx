import { Link } from 'react-router-dom';

// Placeholder terms of service. Copy is scaffolding only - replace with
// lawyer-reviewed text before inviting real users. See Privacy.jsx comment.

export default function Terms() {
  return (
    <div style={wrap}>
      <Link to="/" style={back}>&larr; Back</Link>
      <h1 style={h1}>Terms of Service</h1>
      <p style={meta}>
        <strong>Draft - alpha placeholder.</strong> Pending legal review before
        general availability.
      </p>

      <Section title="1. Service">
        Ageless Movement is a fitness + mobility coaching platform operated
        by Systemations (Ireland). By creating an account you agree to these
        terms.
      </Section>

      <Section title="2. Eligibility">
        You must be 18 or older to create an account. You confirm that any
        health information you provide is accurate.
      </Section>

      <Section title="3. Medical disclaimer">
        Ageless Movement provides fitness coaching and movement guidance - not
        medical advice. Consult a qualified medical professional before
        starting any exercise program, particularly if you have an injury,
        chronic condition, or are pregnant.
      </Section>

      <Section title="4. Your account">
        You are responsible for your credentials. Notify us immediately if you
        suspect unauthorised access. We may suspend or terminate accounts that
        violate these terms.
      </Section>

      <Section title="5. Content you upload">
        You retain ownership of content you upload (photos, videos, messages).
        You grant us a licence to store + display it to you and your assigned
        coach(es). You are responsible for the content of anything you post in
        community groups.
      </Section>

      <Section title="6. Payments (once live)">
        Subscription and lifetime-access prices are shown in-app. Payments are
        processed by Stripe; we never store card details. Refund policy will
        be published on this page before payments go live.
      </Section>

      <Section title="7. Alpha status">
        The service is currently in alpha. Features may change, break, or be
        removed without notice. Do not rely on it for critical fitness
        tracking. We will give reasonable notice before material changes at
        general availability.
      </Section>

      <Section title="8. Limitation of liability">
        To the maximum extent permitted by law, Ageless Movement and
        Systemations are not liable for any indirect or consequential loss
        arising from use of the service. Our total liability is capped at the
        fees you have paid us in the 12 months preceding the claim.
      </Section>

      <Section title="9. Governing law">
        These terms are governed by the laws of Ireland. Disputes are subject
        to the exclusive jurisdiction of the Irish courts.
      </Section>

      <Section title="10. Contact">
        info@systemations.io
      </Section>

      <p style={footer}>Last updated: 2026-04-22 (placeholder).</p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={h2}>{title}</h2>
      <p style={p}>{children}</p>
    </div>
  );
}

const wrap = { maxWidth: 720, margin: '40px auto', padding: '0 20px', color: 'var(--text-primary)' };
const back = { color: 'var(--accent)', fontSize: 13, textDecoration: 'none', display: 'inline-block', marginBottom: 18 };
const h1 = { fontSize: 28, fontWeight: 800, marginBottom: 8 };
const h2 = { fontSize: 16, fontWeight: 700, marginBottom: 6, marginTop: 6 };
const p = { fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' };
const meta = { padding: 12, background: 'rgba(255,140,0,0.08)', borderLeft: '3px solid var(--accent)', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 26 };
const footer = { fontSize: 12, color: 'var(--text-tertiary)', marginTop: 30, textAlign: 'center' };
