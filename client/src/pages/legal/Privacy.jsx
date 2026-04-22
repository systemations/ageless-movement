import { Link } from 'react-router-dom';

// Placeholder privacy policy. The copy below is scaffolding only - replace
// every section with lawyer-reviewed text before inviting real users.
// The goal of this file existing on day one is so the signup flow has a
// link target and the consent record has something to point to.

export default function Privacy() {
  return (
    <div style={wrap}>
      <Link to="/" style={back}>&larr; Back</Link>
      <h1 style={h1}>Privacy Policy</h1>
      <p style={meta}>
        <strong>Draft - alpha placeholder.</strong> Pending legal review before
        general availability.
      </p>

      <Section title="Who we are">
        Ageless Movement is operated by Systemations (Ireland). Controller
        contact: info@systemations.io.
      </Section>

      <Section title="What we collect">
        Account: name, email, password (hashed). Profile: age, gender, tier,
        preferences. Fitness: workout logs, check-ins, body measurements,
        habit logs, benchmark results, photos/videos you upload. Messages
        sent to coaches and groups.
      </Section>

      <Section title="Why we collect it">
        To deliver coaching, personalised programs, progress tracking and
        community features. To contact you about your account and service.
        To improve the product in aggregate.
      </Section>

      <Section title="Who sees your data">
        Your assigned coach(es). Fellow members of community groups you join,
        for messages you post in those groups. No third parties sell or receive
        your data.
      </Section>

      <Section title="Where it's stored">
        European Union (Render Frankfurt). Uploaded media on Render persistent
        storage. We plan to migrate database to encrypted Postgres; media to
        S3/R2 with signed URLs, before general availability.
      </Section>

      <Section title="Your rights (GDPR)">
        You have the right to access, correct, delete or export your data.
        During alpha this is handled by emailing info@systemations.io. Self-
        serve export + deletion flows will ship before GA.
      </Section>

      <Section title="Retention">
        Active account data: for the life of your account. Deleted account
        data: purged within 30 days unless we are legally required to retain.
      </Section>

      <Section title="Cookies + analytics">
        We use a necessary session token stored client-side for authentication.
        No third-party analytics or marketing trackers at alpha. If we add any
        before GA, we'll update this policy and prompt consent.
      </Section>

      <Section title="Contact">
        Questions, corrections, or to exercise a right: info@systemations.io.
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
