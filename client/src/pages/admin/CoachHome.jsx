import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

// Coach Home — landing dashboard for the admin area.
// KPI tiles + at-risk clients + priority inbox + upcoming events + 30d check-in sparkline.
// All data is live from /api/coach/home.

const TIER_COLOR = {
  Free: '#94a3b8',
  Starter: '#38bdf8',
  Prime: '#FF8C00',
  Elite: '#ec4899',
};

export default function CoachHome({ onOpenClient }) {
  const { token, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [coachFilter, setCoachFilter] = useState(null); // null = all coaches

  useEffect(() => {
    let cancelled = false;
    const url = coachFilter ? `/api/coach/home?coach_id=${coachFilter}` : '/api/coach/home';
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, coachFilter]);

  if (loading) return <div style={{ padding: 40, color: 'var(--text-tertiary)' }}>Loading dashboard...</div>;
  if (!data) return <div style={{ padding: 40, color: 'var(--error)' }}>Failed to load dashboard.</div>;

  const k = data.kpis;
  const greeting = getGreeting();

  // Greeting uses the coach's real first name. Users stored as "Coach Dan"
  // should render as "Good afternoon, Dan" — strip the leading "Coach "
  // prefix (case-insensitive) before taking the first word.
  const displayName = (user?.name || '').replace(/^coach\s+/i, '').trim();
  const firstName = displayName.split(/\s+/)[0] || user?.name || 'Coach';

  return (
    <div style={{ padding: '28px 40px 60px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>
          {greeting}, {firstName}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Here's what's happening across your clients today.
        </p>
      </div>

      {/* KPI tiles row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12, marginBottom: 28,
      }}>
        <KpiTile label="Active clients" value={k.total_clients} sub={`+${k.new_clients_7d} new (7d)`} accent="#FF8C00" />
        <KpiTile label="At risk" value={k.at_risk_count} sub="No check-in 14+ days" accent="#ef4444" />
        <KpiTile label="Check-ins" value={k.checkins_7d} sub="Last 7 days" accent="#3DFFD2" />
        <KpiTile label="Workouts logged" value={k.workouts_completed_7d} sub="Last 7 days" accent="#38bdf8" />
        <KpiTile label="Messages" value={k.messages_7d} sub="Last 7 days" accent="#a78bfa" />
        <KpiTile label="Sessions today" value={k.sessions_today} sub="Scheduled bookings" accent="#f59e0b" />
      </div>

      {/* 3-col body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 16 }}>
        {/* Priority inbox — recent check-ins */}
        <Panel title="Priority inbox" subtitle="Most recent client check-ins">
          {data.recent_checkins.length === 0 ? (
            <EmptyState text="No check-ins yet" />
          ) : (
            <div>
              {data.recent_checkins.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpenClient?.(c.user_id)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 4px',
                    width: '100%', border: 'none', background: 'none', cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'left',
                  }}
                >
                  {/* Prefer the front check-in photo thumb, then profile picture, then initials */}
                  {c.photo_front_url ? (
                    <div style={{
                      width: 42, height: 42, borderRadius: 8, flexShrink: 0,
                      background: `url(${c.photo_front_url}) center/cover`,
                      border: '1px solid var(--divider)',
                    }} />
                  ) : c.photo_url ? (
                    <Avatar name={c.name} photoUrl={c.photo_url} />
                  ) : (
                    <Avatar name={c.name} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: c.feel ? 4 : 0 }}>
                      {formatDate(c.date)}
                      {c.weight ? ` · ${c.weight}kg` : ''}
                      {c.sleep_hours ? ` · ${c.sleep_hours}h sleep` : ''}
                      {c.recovery_score ? ` · recovery ${c.recovery_score}` : ''}
                    </p>
                    {c.feel && (
                      <p style={{
                        fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic',
                        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', lineHeight: 1.3,
                      }}>
                        "{c.feel}"
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* At-risk clients */}
        <Panel title="Needs attention" subtitle="Quiet for 14+ days">
          {data.at_risk.length === 0 ? (
            <EmptyState text="Everyone's on track" />
          ) : (
            <div>
              {data.at_risk.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpenClient?.(c.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px',
                    width: '100%', border: 'none', background: 'none', cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'left',
                  }}
                >
                  <Avatar name={c.name} photoUrl={c.photo_url} small />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {c.last_checkin ? `Last check-in ${formatRelative(c.last_checkin)}` : 'No check-ins yet'}
                    </p>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                    background: 'rgba(239,68,68,0.15)', color: '#ef4444', whiteSpace: 'nowrap',
                  }}>AT RISK</span>
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* Upcoming — merged 1:1 bookings + scheduled events, per-coach filterable */}
        <Panel
          title="Upcoming"
          subtitle={coachFilter ? 'Filtered to one coach' : 'All coaches, next 10'}
        >
          {/* Coach filter chips */}
          {(data.coaches || []).length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <FilterChip label="All" active={!coachFilter} onClick={() => setCoachFilter(null)} />
              {data.coaches.map(c => (
                <FilterChip
                  key={c.id}
                  label={(c.name || '').replace(/^coach\s+/i, '').trim() || c.name}
                  active={coachFilter === c.id}
                  onClick={() => setCoachFilter(c.id)}
                />
              ))}
            </div>
          )}

          {data.upcoming_events.length === 0 ? (
            <EmptyState text="Nothing on the calendar" />
          ) : (
            <div>
              {data.upcoming_events.map((e) => {
                const badge = formatBadge(e.event_format);
                return (
                  <div key={`${e.kind}-${e.id}`} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <div style={{
                      minWidth: 44, textAlign: 'center',
                      background: 'rgba(255,140,0,0.1)', borderRadius: 8, padding: '4px 6px',
                    }}>
                      <p style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 800, textTransform: 'uppercase' }}>
                        {formatMonthShort(e.start_at)}
                      </p>
                      <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                        {formatDayNum(e.start_at)}
                      </p>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {e.session_name || 'Session'}
                        </p>
                        <span style={{
                          fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 6,
                          background: badge.bg, color: badge.color,
                          textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap',
                        }}>{badge.label}</span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatTime(e.start_at)}
                        {e.coach_name ? ` · ${(e.coach_name || '').replace(/^coach\s+/i, '').trim() || e.coach_name}` : ''}
                        {e.client_name ? ` · ${e.client_name}` : ''}
                        {e.kind === 'event' && e.capacity ? ` · ${e.registration_count || 0}/${e.capacity}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Tier distribution + check-in sparkline */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginTop: 16 }}>
        <Panel title="Client tier mix" subtitle="Distribution across plans">
          <TierDonut data={data.tier_distribution} />
        </Panel>
        <Panel title="Check-in activity" subtitle="Last 30 days">
          <Sparkline data={data.checkin_trend} />
        </Panel>
      </div>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────

function KpiTile({ label, value, sub, accent }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12, padding: 16,
      border: '1px solid var(--divider)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, width: 3, height: '100%',
        background: accent,
      }} />
      <p style={{
        fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)',
        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
      }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>{sub}</p>
    </div>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12, padding: 16,
      border: '1px solid var(--divider)',
    }}>
      <div style={{ marginBottom: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 700 }}>{title}</p>
        {subtitle && <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '12px 4px', fontStyle: 'italic' }}>{text}</p>;
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 14, border: 'none', cursor: 'pointer',
        background: active ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
        color: active ? '#fff' : 'var(--text-secondary)',
        fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

const FORMAT_BADGES = {
  one_on_one:   { label: '1:1',         bg: 'rgba(255,140,0,0.15)',  color: '#FF8C00' },
  webinar:      { label: 'Webinar',     bg: 'rgba(56,189,248,0.15)', color: '#38bdf8' },
  masterclass:  { label: 'Masterclass', bg: 'rgba(236,72,153,0.15)', color: '#ec4899' },
  follow_along: { label: 'Follow-along',bg: 'rgba(133,255,186,0.15)',color: '#85FFBA' },
  in_person:    { label: 'In-person',   bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  workshop:     { label: 'Workshop',    bg: 'rgba(167,139,250,0.15)',color: '#a78bfa' },
};
function formatBadge(fmt) {
  return FORMAT_BADGES[fmt] || { label: fmt || 'Session', bg: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' };
}

function Avatar({ name, photoUrl, small }) {
  const size = small ? 28 : 34;
  if (photoUrl) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      }}>
        <img src={photoUrl} alt={name || ''}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: small ? 11 : 13, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {name?.charAt(0) || '?'}
    </div>
  );
}

function TierDonut({ data }) {
  const total = useMemo(() => data.reduce((s, r) => s + r.count, 0), [data]);
  if (total === 0) return <EmptyState text="No clients yet" />;

  let cum = 0;
  const segs = data.map((r) => {
    const start = (cum / total) * 100;
    cum += r.count;
    const end = (cum / total) * 100;
    return { ...r, start, end };
  });

  const gradient = segs.map((s) => {
    const color = TIER_COLOR[s.tier] || '#94a3b8';
    return `${color} ${s.start}% ${s.end}%`;
  }).join(', ');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 90, height: 90, borderRadius: '50%',
        background: `conic-gradient(${gradient})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', flexShrink: 0,
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%', background: 'var(--bg-card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <p style={{ fontSize: 18, fontWeight: 800 }}>{total}</p>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        {segs.map((s) => (
          <div key={s.tier} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: TIER_COLOR[s.tier] || '#94a3b8' }} />
            <span style={{ fontSize: 12, flex: 1 }}>{s.tier}</span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Sparkline({ data }) {
  if (!data.length) return <EmptyState text="No check-ins in the last 30 days" />;

  // Fill gaps
  const map = new Map(data.map(d => [d.date, d.c]));
  const points = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split('T')[0];
    points.push({ date: key, c: map.get(key) || 0 });
  }
  const max = Math.max(1, ...points.map(p => p.c));

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
      {points.map((p, i) => (
        <div key={i} title={`${p.date}: ${p.c}`} style={{
          flex: 1,
          height: `${(p.c / max) * 100}%`,
          minHeight: p.c === 0 ? 2 : 4,
          background: p.c === 0 ? 'rgba(255,255,255,0.05)' : 'var(--accent)',
          borderRadius: 2,
          opacity: p.c === 0 ? 0.5 : 1,
        }} />
      ))}
    </div>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
}

function formatRelative(s) {
  if (!s) return 'never';
  const days = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return formatDate(s);
}

function formatMonthShort(s) {
  return new Date(s).toLocaleDateString('en-IE', { month: 'short' });
}
function formatDayNum(s) {
  return new Date(s).getDate();
}
function formatTime(s) {
  return new Date(s).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
}
