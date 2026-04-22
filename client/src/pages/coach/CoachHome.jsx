import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Coach mobile Home dashboard. Mirrors the desktop admin CoachHome but
// mobile-sized: a greeting, 4 KPI tiles in a 2x2 grid, then priority
// sections (at-risk clients, recent check-ins, upcoming sessions).
// Consumes the same GET /api/coach/home endpoint the desktop uses.
export default function CoachHome() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/coach/home', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then(setData)
      .catch(() => setError('Failed to load dashboard.'));
  }, [token]);

  if (error) {
    return (
      <div className="page-content" style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  const firstName = (user?.name || 'Coach').split(' ')[0];
  const greeting = getGreeting();

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      {/* Greeting */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{greeting},</p>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>{firstName}</h1>
      </div>

      {/* KPI tiles — 2x2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <Kpi label="Active clients" value={data.kpis.total_clients} sub={`+${data.kpis.new_clients_7d} in last 7d`} color="var(--accent)" />
        <Kpi label="At risk" value={data.kpis.at_risk_count} sub="No check-in 14+ days" color="#FF5E5E" />
        <Kpi label="Check-ins" value={data.kpis.checkins_7d} sub="Last 7 days" color="var(--accent-mint)" />
        <Kpi label="Sessions today" value={data.kpis.sessions_today} sub="Scheduled bookings" color="#64D2FF" />
      </div>

      {/* Priority: recent check-ins */}
      <Section
        title="Priority inbox"
        subtitle="Most recent check-ins"
        onSeeAll={() => navigate('/coach/checkins')}
      >
        {data.recent_checkins.length === 0 ? (
          <EmptyRow text="No check-ins yet" />
        ) : (
          data.recent_checkins.slice(0, 4).map((c) => (
            <div
              key={c.id}
              onClick={() => navigate('/coach/checkins')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                background: 'var(--bg-card)', borderRadius: 10, marginBottom: 6,
                cursor: 'pointer',
              }}
            >
              <Avatar name={c.name} photo={c.photo_url} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                {c.feel && (
                  <p style={{
                    fontSize: 11, color: 'var(--text-tertiary)',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
                  }}>"{c.feel}"</p>
                )}
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                {formatShortDate(c.date)}
              </span>
            </div>
          ))
        )}
      </Section>

      {/* At-risk */}
      <Section
        title="Needs attention"
        subtitle={`${data.at_risk.length} client${data.at_risk.length === 1 ? '' : 's'} quiet for 14+ days`}
      >
        {data.at_risk.length === 0 ? (
          <EmptyRow text="Everyone's on track this week" />
        ) : (
          data.at_risk.slice(0, 4).map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                background: 'var(--bg-card)', borderRadius: 10, marginBottom: 6,
                borderLeft: '3px solid #FF5E5E',
              }}
            >
              <Avatar name={c.name} photo={c.photo_url} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Last check-in {c.last_checkin ? formatShortDate(c.last_checkin) : 'never'}
                </p>
              </div>
            </div>
          ))
        )}
      </Section>

      {/* Upcoming — 1:1 bookings + scheduled events merged chronologically */}
      <Section
        title="Upcoming"
        subtitle="All coaches"
        onSeeAll={() => navigate('/coach/live')}
      >
        {data.upcoming_events.length === 0 ? (
          <EmptyRow text="Nothing on the calendar" />
        ) : (
          data.upcoming_events.map((e) => {
            const coachDisplay = (e.coach_name || '').replace(/^coach\s+/i, '').trim() || e.coach_name;
            const metaBits = [
              e.client_name || null,
              coachDisplay || null,
              formatShortTime(e.start_at),
              e.kind === 'event' && e.capacity ? `${e.registration_count || 0}/${e.capacity}` : null,
            ].filter(Boolean);
            return (
              <div
                key={`${e.kind}-${e.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  background: 'var(--bg-card)', borderRadius: 10, marginBottom: 6,
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  background: 'rgba(255,156,51,0.15)', color: 'var(--accent)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>
                    {new Date(e.start_at).toLocaleDateString('en-IE', { month: 'short' }).toUpperCase()}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>
                    {new Date(e.start_at).getDate()}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {e.session_name || 'Session'}
                    </p>
                    {e.event_format && e.event_format !== 'one_on_one' && (
                      <span style={{
                        fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 6,
                        background: 'rgba(61,255,210,0.12)', color: 'var(--accent-mint)',
                        textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap',
                      }}>{e.event_format.replace(/_/g, ' ')}</span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {metaBits.join(' · ')}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </Section>
    </div>
  );
}

function Kpi({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12, padding: '14px 14px',
      borderLeft: `3px solid ${color}`,
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </p>
      <p style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, marginBottom: 4 }}>{value}</p>
      <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{sub}</p>
    </div>
  );
}

function Section({ title, subtitle, onSeeAll, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800 }}>{title}</h2>
          {subtitle && <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{subtitle}</p>}
        </div>
        {onSeeAll && (
          <button onClick={onSeeAll} style={{
            background: 'none', border: 'none', color: 'var(--accent)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>See all</button>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ text }) {
  return (
    <div style={{
      padding: '14px 12px', background: 'var(--bg-card)', borderRadius: 10,
      textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12,
    }}>{text}</div>
  );
}

function Avatar({ name, photo, size = 32 }) {
  if (photo) {
    return <img src={photo} alt={name}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size / 2.5), fontWeight: 800, color: '#fff',
    }}>{name?.charAt(0) || '?'}</div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date();
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
}

function formatShortTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
}
