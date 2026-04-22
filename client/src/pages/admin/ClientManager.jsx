import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import ClientProfile from './ClientProfile';

// ClientManager — coach admin Clients view. FitBudd-inspired clean table
// with compliance columns + Kahunas-style at-risk / on-track pill. Clicking
// a row opens ClientProfile (tabbed workspace). Filters: tier, status, search.

const TIER_COLORS = {
  Free:    { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
  Starter: { bg: 'rgba(56,189,248,0.18)',  fg: '#38bdf8' },
  Prime:   { bg: 'rgba(255,140,0,0.18)',   fg: '#FF8C00' },
  Elite:   { bg: 'rgba(236,72,153,0.18)',  fg: '#ec4899' },
};
const TIER_ORDER = ['All', 'Free', 'Starter', 'Prime', 'Elite'];
const STATUS_FILTERS = ['All', 'On track', 'At risk'];
// Lifecycle filter: Active = active+paused (the default view of engaged clients),
// Paused = subscription on hold, Archived = coaching ended. Default excludes archived
// so the main list shows ongoing relationships.
const LIFECYCLE_FILTERS = ['Active', 'Paused', 'Archived', 'All'];

export default function ClientManager({ openClientId, onClearOpen }) {
  const { token } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' });
  const [msg, setMsg] = useState('');
  const [tierFilter, setTierFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [lifecycleFilter, setLifecycleFilter] = useState('Active');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  // Default sort: most-recently-active clients first so Dan triages fresh activity
  const [sortBy, setSortBy] = useState('last_active_desc');

  // Allow parent (CoachHome clicks) to deep-link into a specific client
  useEffect(() => {
    if (openClientId != null) {
      setOpenId(openClientId);
      onClearOpen?.();
    }
  }, [openClientId]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch('/api/coach/clients-enriched', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setClients(data.clients || []);
    setLoading(false);
  };

  const invite = async () => {
    if (!inviteForm.name || !inviteForm.email) return;
    const res = await fetch('/api/coach/clients/invite', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(inviteForm),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`✓ ${inviteForm.name} invited! Temp password: welcome123`);
      setInviteForm({ name: '', email: '' });
      fetchData();
    } else setMsg(data.error);
  };

  const tierCounts = useMemo(() => {
    const counts = { All: clients.length, Free: 0, Starter: 0, Prime: 0, Elite: 0 };
    clients.forEach((c) => {
      if (c.tier_name && counts[c.tier_name] != null) counts[c.tier_name]++;
    });
    return counts;
  }, [clients]);

  const filtered = useMemo(() => {
    const out = clients.filter((c) => {
      const cStatus = c.status || 'active';
      // Lifecycle filter — Active view shows active+paused (engaged relationships),
      // Paused and Archived each show only their own status, All shows everything.
      if (lifecycleFilter === 'Active' && cStatus === 'archived') return false;
      if (lifecycleFilter === 'Paused' && cStatus !== 'paused') return false;
      if (lifecycleFilter === 'Archived' && cStatus !== 'archived') return false;
      if (tierFilter !== 'All' && c.tier_name !== tierFilter) return false;
      if (statusFilter === 'On track' && c.at_risk) return false;
      if (statusFilter === 'At risk' && !c.at_risk) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(c.name || '').toLowerCase().includes(q)
            && !(c.email || '').toLowerCase().includes(q)
            && !(c.goal || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });

    // Sort — null timestamps always sink to the bottom when sorting desc
    const cmpDate = (a, b, dir) => {
      if (!a && !b) return 0;
      if (!a) return dir === 'desc' ? 1 : -1;
      if (!b) return dir === 'desc' ? -1 : 1;
      const d = new Date(a) - new Date(b);
      return dir === 'desc' ? -d : d;
    };

    if (sortBy === 'last_active_desc') {
      out.sort((a, b) => cmpDate(a.last_active_at, b.last_active_at, 'desc'));
    } else if (sortBy === 'last_active_asc') {
      out.sort((a, b) => cmpDate(a.last_active_at, b.last_active_at, 'asc'));
    } else if (sortBy === 'name') {
      out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortBy === 'engagement_desc') {
      out.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
    }
    return out;
  }, [clients, tierFilter, statusFilter, lifecycleFilter, search, sortBy]);

  const lifecycleCounts = useMemo(() => {
    const counts = { Active: 0, Paused: 0, Archived: 0, All: clients.length };
    clients.forEach((c) => {
      const s = c.status || 'active';
      if (s === 'archived') counts.Archived++;
      else if (s === 'paused') { counts.Paused++; counts.Active++; }
      else counts.Active++;
    });
    return counts;
  }, [clients]);

  // If a client is open, render ClientProfile instead of the list.
  // Pass showRail so Clients > client matches Messages > client — 2-column
  // layout with the always-visible client info rail, including on the Chats tab.
  if (openId != null) {
    return <ClientProfile clientId={openId} showRail onBack={() => setOpenId(null)} />;
  }

  return (
    <div style={{ padding: '24px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Clients</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {clients.length} total · click a row to open the full profile
          </p>
        </div>
        <button onClick={() => setShowInvite(!showInvite)} style={{
          background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
          padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}>+ Invite Client</button>
      </div>

      {showInvite && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, marginBottom: 20, maxWidth: 500 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Invite New Client</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Name</label><input className="input-field" value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} /></div>
            <div><label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Email</label><input type="email" className="input-field" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button onClick={invite} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Send Invite</button>
            {msg && <p style={{ fontSize: 12, color: msg.startsWith('✓') ? 'var(--success)' : 'var(--error)' }}>{msg}</p>}
          </div>
        </div>
      )}

      {/* Lifecycle filter — Active / Paused / Archived */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        {LIFECYCLE_FILTERS.map((lc) => {
          const active = lifecycleFilter === lc;
          const isArchive = lc === 'Archived';
          const color = isArchive
            ? { bg: 'rgba(255,69,58,0.12)', fg: '#FF5E5E' }
            : lc === 'Paused'
              ? { bg: 'rgba(255,156,51,0.12)', fg: 'var(--accent)' }
              : { bg: 'rgba(61,255,210,0.10)', fg: 'var(--accent-mint)' };
          return (
            <button
              key={lc}
              onClick={() => setLifecycleFilter(lc)}
              style={{
                padding: '7px 12px', borderRadius: 18, border: 'none', cursor: 'pointer',
                background: active ? color.fg : color.bg,
                color: active ? '#fff' : color.fg,
                fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {lc}
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 10,
                background: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
              }}>
                {lifecycleCounts[lc] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {TIER_ORDER.map((tier) => {
          const active = tierFilter === tier;
          const color = TIER_COLORS[tier] || { bg: 'rgba(255,140,0,0.15)', fg: 'var(--accent)' };
          return (
            <button
              key={tier}
              onClick={() => setTierFilter(tier)}
              style={{
                padding: '7px 12px', borderRadius: 18, border: 'none', cursor: 'pointer',
                background: active ? color.fg : color.bg,
                color: active ? '#000' : color.fg,
                fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {tier}
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 10,
                background: active ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.08)',
              }}>
                {tierCounts[tier] ?? 0}
              </span>
            </button>
          );
        })}

        <div style={{ width: 1, height: 20, background: 'var(--divider)', margin: '0 6px' }} />

        {STATUS_FILTERS.map(s => {
          const active = statusFilter === s;
          return (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '7px 12px', borderRadius: 18, border: 'none', cursor: 'pointer',
              background: active ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
              color: active ? '#000' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: 700,
            }}>{s}</button>
          );
        })}

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{
            marginLeft: 'auto', padding: '8px 10px', borderRadius: 8,
            background: 'var(--bg-card)', border: '1px solid var(--divider)',
            color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <option value="last_active_desc">Most recently active</option>
          <option value="last_active_asc">Least recently active</option>
          <option value="engagement_desc">Highest engagement</option>
          <option value="name">Name (A→Z)</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, goal..."
          style={{
            padding: '8px 14px', borderRadius: 8,
            background: 'var(--bg-card)', border: '1px solid var(--divider)',
            color: 'var(--text-primary)', fontSize: 13, minWidth: 240,
          }}
        />
      </div>

      {/* Client table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--divider)' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 100px 1.2fr 100px 100px 100px 130px 110px',
          padding: '12px 18px', borderBottom: '1px solid var(--divider)',
          fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', gap: 10, letterSpacing: 0.5,
        }}>
          <span>Client</span>
          <span>Tier</span>
          <span>Goal</span>
          <span>Last active</span>
          <span>Last check-in</span>
          <span>Last workout</span>
          <span>Engagement</span>
          <span>Status</span>
        </div>

        {loading && <p style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading clients...</p>}

        {!loading && filtered.map(c => {
          const tierColor = TIER_COLORS[c.tier_name] || TIER_COLORS.Free;
          return (
            <div
              key={c.id}
              onClick={() => setOpenId(c.id)}
              style={{
                display: 'grid', gridTemplateColumns: '2fr 100px 1.2fr 100px 100px 100px 130px 110px',
                padding: '14px 18px', alignItems: 'center', gap: 10, cursor: 'pointer',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,140,0,0.04)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {c.photo_url ? (
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                    border: '1px solid var(--divider)',
                  }}>
                    <img src={c.photo_url} alt={c.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', background: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>{c.name?.charAt(0)}</div>
                )}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.email}
                  </p>
                </div>
              </div>

              <span style={{
                display: 'inline-block', padding: '3px 9px', borderRadius: 10,
                background: tierColor.bg, color: tierColor.fg,
                fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4,
                width: 'fit-content',
              }}>
                {c.tier_name || 'Free'}
              </span>

              <p style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.goal || '—'}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: c.last_active_at && daysSinceDate(c.last_active_at) === 0
                    ? '#3DFFD2'
                    : c.last_active_at && daysSinceDate(c.last_active_at) <= 7
                      ? '#f59e0b'
                      : 'var(--text-tertiary)',
                }} />
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatRelative(c.last_active_at)}</p>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatRelative(c.last_checkin)}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatRelative(c.last_workout)}</p>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${c.engagement}%`, height: '100%',
                      background: c.engagement >= 70 ? '#3DFFD2' : c.engagement >= 40 ? '#f59e0b' : '#ef4444',
                    }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, minWidth: 28, textAlign: 'right' }}>{c.engagement}%</span>
                </div>
              </div>

              <span style={{
                fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                background: c.at_risk ? 'rgba(239,68,68,0.15)' : 'rgba(61,255,210,0.15)',
                color: c.at_risk ? '#ef4444' : '#3DFFD2',
                textTransform: 'uppercase', letterSpacing: 0.4, width: 'fit-content',
              }}>
                {c.at_risk ? 'AT RISK' : 'ON TRACK'}
              </span>
            </div>
          );
        })}

        {!loading && filtered.length === 0 && (
          <p style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            No clients match these filters.
          </p>
        )}
      </div>
    </div>
  );
}

function formatRelative(s) {
  if (!s) return <span style={{ color: 'var(--text-tertiary)' }}>Never</span>;
  const ms = Date.now() - new Date(s).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(s).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
}

function daysSinceDate(s) {
  if (!s) return 9999;
  return Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
}
