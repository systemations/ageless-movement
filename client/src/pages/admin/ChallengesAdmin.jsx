import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';

const CATEGORY_COLORS = {
  BURN: '#FF453A', LIFT: '#FF8C00', MOVE: '#85FFBA',
  FLEX: '#5AC8FA', NUTRITION: '#34C759', SLEEP: '#AF52DE',
};
const UNIT_FMT = {
  seconds: v => { const n = +v; const m = Math.floor(n / 60); const s = Math.round(n % 60); return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`; },
  kg: v => `${v}kg`, reps: v => `${v} reps`, watts: v => `${v}W`, cal: v => `${v} cal`, m: v => `${v}m`,
};
const fmt = (unit, v) => (UNIT_FMT[unit] || (x => String(x)))(v);

export default function ChallengesAdmin() {
  const { token } = useAuth();
  const [categories, setCategories] = useState([]);
  const [queueCount, setQueueCount] = useState(0);
  // selected item in the left nav
  const [selected, setSelected] = useState({ kind: 'review' });

  useEffect(() => {
    fetch('/api/benchmarks', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setCategories(d.categories || []));
    fetch('/api/benchmarks/coach/review-queue', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setQueueCount((d.pending || []).length));
  }, [token]);

  return (
    <div style={{ padding: '20px 24px', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Challenges & Levels</h1>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
          Global view of every leaderboard + review queue + benchmark ladder editor.
        </p>
      </div>

      <div style={{
        flex: 1, minHeight: 0,
        display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16,
      }}>
        {/* ── Left: master list ─────────────────────────────── */}
        <div style={{
          background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--divider)',
          overflow: 'auto',
        }}>
          <NavSection title="Review">
            <NavItem
              label="Pending submissions"
              icon="📥"
              badge={queueCount || null}
              active={selected.kind === 'review'}
              onClick={() => setSelected({ kind: 'review' })}
            />
          </NavSection>

          <NavSection title="Overall leaderboards">
            <NavItem
              label="Ageless Mover"
              icon="🏅"
              active={selected.kind === 'ageless_mover'}
              onClick={() => setSelected({ kind: 'ageless_mover' })}
            />
            <NavItem
              label="Streaks"
              icon="🔥"
              active={selected.kind === 'streaks'}
              onClick={() => setSelected({ kind: 'streaks' })}
            />
            <NavItem
              label="Steps"
              icon="👣"
              active={selected.kind === 'steps'}
              onClick={() => setSelected({ kind: 'steps' })}
            />
          </NavSection>

          {categories.map(cat => (
            <NavSection key={cat.category} title={cat.category} color={CATEGORY_COLORS[cat.category]}>
              {cat.benchmarks.map(b => (
                <NavItem
                  key={b.slug}
                  label={b.name}
                  icon={b.icon || '⭐'}
                  active={selected.kind === 'benchmark' && selected.slug === b.slug}
                  onClick={() => setSelected({ kind: 'benchmark', slug: b.slug, benchmark: b })}
                />
              ))}
            </NavSection>
          ))}

          <NavSection title="Admin">
            <NavItem
              label="Edit ladders & thresholds"
              icon="⚙️"
              active={selected.kind === 'manage'}
              onClick={() => setSelected({ kind: 'manage' })}
            />
          </NavSection>
        </div>

        {/* ── Right: detail view ─────────────────────────────── */}
        <div style={{
          background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--divider)',
          overflow: 'auto', padding: 20,
        }}>
          {selected.kind === 'review'          && <ReviewQueue onQueueCount={setQueueCount} />}
          {selected.kind === 'ageless_mover'   && <LeaderboardView kind="ageless_mover" title="Ageless Mover" subtitle="All-rounder points across every benchmark" />}
          {selected.kind === 'streaks'         && <LeaderboardView kind="streaks"       title="Streaks" subtitle="Current consecutive days of activity" />}
          {selected.kind === 'steps'           && <LeaderboardView kind="steps"         title="Steps" subtitle="Total steps over the chosen window" showTimeframe />}
          {selected.kind === 'benchmark'       && <LeaderboardView kind="benchmark"     title={selected.benchmark?.name} subtitle={`${selected.benchmark?.category} · ${selected.benchmark?.subcategory || ''}`} slug={selected.slug} unit={selected.benchmark?.unit} />}
          {selected.kind === 'manage'          && <BenchmarksTable />}
        </div>
      </div>
    </div>
  );
}

function NavSection({ title, color, children }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--divider)' }}>
      <p style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
        color: color || 'var(--text-tertiary)',
        padding: '6px 16px 4px',
      }}>{title}</p>
      {children}
    </div>
  );
}

function NavItem({ label, icon, badge, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
        padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
        background: active ? 'rgba(255,140,0,0.12)' : 'transparent',
        borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 12, fontWeight: active ? 700 : 500,
        transition: 'background 0.15s',
      }}
    >
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {badge != null && badge > 0 && (
        <span style={{
          fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 10,
          background: 'var(--accent)', color: '#fff',
        }}>{badge}</span>
      )}
    </button>
  );
}

// ── Unified leaderboard view ───────────────────────────────────────────────
function LeaderboardView({ kind, title, subtitle, slug, unit, showTimeframe }) {
  const { token } = useAuth();
  const [gender, setGender]   = useState('all');
  const [age, setAge]         = useState('all');
  const [timeframe, setTime]  = useState('week');
  const [data, setData]       = useState(null);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (gender !== 'all') p.set('gender', gender);
    if (age !== 'all')    p.set('age', age);
    if (kind === 'steps') p.set('timeframe', timeframe);
    if (kind === 'benchmark') return `/api/benchmarks/${slug}/leaderboard?${p}`;
    if (kind === 'ageless_mover') return `/api/benchmarks/leaderboards/ageless-mover?${p}`;
    if (kind === 'streaks') return `/api/benchmarks/leaderboards/streaks?${p}`;
    if (kind === 'steps') return `/api/benchmarks/leaderboards/steps?${p}`;
    return null;
  }, [kind, slug, gender, age, timeframe]);

  useEffect(() => {
    if (!url) return;
    setData(null);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setData);
  }, [url, token]);

  const entries = (data?.entries || []).map(e => {
    if (kind === 'ageless_mover') return { ...e, primary: `${e.points} pts`, secondary: `${e.tested_count} tests · avg Lv ${e.avg_level}` };
    if (kind === 'streaks') return { ...e, primary: `${e.current_streak} day${e.current_streak === 1 ? '' : 's'}`, secondary: `Best ${e.best_streak}` };
    if (kind === 'steps') return { ...e, primary: `${(e.total_steps || 0).toLocaleString()} steps`, secondary: e.days_logged ? `${e.days_logged} day${e.days_logged === 1 ? '' : 's'} logged` : '' };
    if (kind === 'benchmark') return { ...e, primary: fmt(unit || 'reps', e.best_value), secondary: e.age ? `${e.age} · ${e.gender || '—'}` : '' };
    return e;
  });

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{subtitle}</p>}
      </div>

      <FilterBar
        gender={gender} onGender={setGender}
        age={age} onAge={setAge}
        timeframe={showTimeframe ? timeframe : null}
        onTimeframe={setTime}
      />

      {!data ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: 20 }}>Loading...</p>
      ) : entries.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: 20, textAlign: 'center' }}>
          No entries match these filters.
        </p>
      ) : (
        <div>
          {entries.map(e => (
            <div key={e.user_id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              borderBottom: '1px solid var(--divider)',
            }}>
              <div style={{
                minWidth: 34, textAlign: 'center', fontSize: 13, fontWeight: 800,
                color: e.rank === 1 ? '#FFD700' : e.rank === 2 ? '#C0C0C0' : e.rank === 3 ? '#CD7F32' : 'var(--text-tertiary)',
              }}>#{e.rank}</div>
              {e.photo_url
                ? <img src={e.photo_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>{(e.name || '?').charAt(0).toUpperCase()}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</p>
                {e.secondary && <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{e.secondary}</p>}
              </div>
              <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>{e.primary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBar({ gender, onGender, age, onAge, timeframe, onTimeframe }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
      <ChipGroup
        value={gender} onChange={onGender}
        options={[['all','All'],['male','Men'],['female','Women']]}
      />
      <ChipGroup
        value={age} onChange={onAge}
        options={[['all','All ages'],['20s','20-29'],['30s','30-39'],['40s','40-49'],['50s','50-59'],['60s','60-69'],['70s','70-79'],['80p','80+']]}
      />
      {timeframe != null && (
        <ChipGroup
          value={timeframe} onChange={onTimeframe}
          options={[['today','Today'],['week','7 days'],['month','30 days'],['all','All time']]}
        />
      )}
    </div>
  );
}

function ChipGroup({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: 3 }}>
      {options.map(([k, l]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          style={{
            padding: '5px 12px', borderRadius: 18, border: 'none', cursor: 'pointer',
            background: value === k ? 'var(--accent)' : 'transparent',
            color: value === k ? '#fff' : 'var(--text-secondary)',
            fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          }}
        >{l}</button>
      ))}
    </div>
  );
}

// ── Review queue ───────────────────────────────────────────────────────────
function ReviewQueue({ onQueueCount }) {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState({ mine: 0, all: 0 });
  const [scope, setScope] = useState('mine');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/benchmarks/coach/review-queue?scope=${scope}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setData(json.pending || []);
      setCounts(json.counts || { mine: 0, all: 0 });
      // Left-nav badge always reflects "mine" so unassigned or other-coach
      // submissions don't scream at a coach who isn't responsible for them.
      onQueueCount?.((json.counts || {}).mine ?? (json.pending || []).length);
    }
    setLoading(false);
  }, [token, scope, onQueueCount]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Review queue</h2>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Clients marked assigned to you by default. Switch to "All" to see every coach's queue.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: 3 }}>
          {[['mine', `Mine ${counts.mine}`], ['all', `All ${counts.all}`]].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setScope(k)}
              style={{
                padding: '6px 14px', borderRadius: 18, border: 'none', cursor: 'pointer',
                background: scope === k ? 'var(--accent)' : 'transparent',
                color: scope === k ? '#fff' : 'var(--text-secondary)',
                fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              }}
            >{l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-tertiary)', padding: 20 }}>Loading...</p>
      ) : !data || data.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)', padding: 20, textAlign: 'center', fontSize: 13 }}>
          {scope === 'mine' ? 'All caught up — no pending submissions from your clients.' : 'All caught up — nothing pending anywhere.'}
        </p>
      ) : (
        <div>
          {data.map(a => {
            const coachShort = (a.coach_name || '').replace(/^coach\s+/i, '').trim().split(/\s+/)[0] || null;
            return (
              <button
                key={a.id}
                onClick={() => setOpenId(a.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '12px', cursor: 'pointer',
                  background: 'transparent', border: 'none',
                  borderBottom: '1px solid var(--divider)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                {a.photo_url
                  ? <img src={a.photo_url} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
                  : <div style={initialStyle}>{(a.client_name || '?').charAt(0).toUpperCase()}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700 }}>{a.client_name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{a.benchmark_name}</p>
                </div>
                {scope === 'all' && coachShort && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 10,
                    background: 'rgba(255,140,0,0.12)', color: 'var(--accent)',
                    textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
                  }}>{coachShort}</span>
                )}
                {scope === 'all' && !coachShort && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 10,
                    background: 'rgba(142,142,147,0.12)', color: 'var(--text-tertiary)',
                    textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
                  }}>Unassigned</span>
                )}
                <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>{fmt(a.unit, a.value)}</p>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 80, textAlign: 'right' }}>
                  {new Date(a.submitted_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {openId && (
        <ReviewModal
          item={data.find(d => d.id === openId)}
          token={token}
          onClose={() => setOpenId(null)}
          onReviewed={() => { setOpenId(null); fetchQueue(); }}
        />
      )}
    </div>
  );
}

function ReviewModal({ item, token, onClose, onReviewed }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const decide = async (status) => {
    setSubmitting(true);
    try {
      await fetch(`/api/benchmarks/coach/attempts/${item.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, review_note: note }),
      });
      onReviewed();
    } catch (err) { console.error(err); }
    setSubmitting(false);
  };

  const isVideo = (item.video_url || '').match(/\.(mp4|mov|webm)$/i);
  const isImage = (item.video_url || '').match(/\.(jpg|jpeg|png|heic|webp)$/i);
  const isLink  = (item.video_url || '').startsWith('http') && !isVideo && !isImage;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', borderRadius: 14, padding: 24,
        width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          {item.photo_url ? (
            <img src={item.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div style={{ ...initialStyle, width: 44, height: 44 }}>{(item.client_name || '?').charAt(0).toUpperCase()}</div>
          )}
          <div>
            <p style={{ fontSize: 14, fontWeight: 800 }}>{item.client_name}</p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{item.benchmark_name}</p>
          </div>
          <p style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 900, color: 'var(--accent)' }}>
            {fmt(item.unit, item.value)}
          </p>
        </div>

        {item.video_url ? (
          <div style={{
            background: '#000', borderRadius: 10, overflow: 'hidden', marginBottom: 12,
            aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isVideo
              ? <video src={item.video_url} controls style={{ width: '100%', height: '100%' }} />
              : isImage
                ? <img src={item.video_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : isLink
                  ? <a href={item.video_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 700 }}>Open evidence link ↗</a>
                  : <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No preview</span>}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: '#FF9500', marginBottom: 10 }}>
            ⚠ No evidence attached — client did not provide a video or link.
          </p>
        )}

        {item.notes && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, marginBottom: 12 }}>
            <strong>Client notes:</strong> {item.notes}
          </p>
        )}

        <label style={lblStyle}>Review note (shown to client)</label>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Nice work / re-record / form check..."
          style={inp}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} disabled={submitting} style={cancelBtn}>Close</button>
          <button onClick={() => decide('rejected')} disabled={submitting} style={{ ...cancelBtn, color: '#FF5E5E' }}>
            Reject
          </button>
          <button onClick={() => decide('verified')} disabled={submitting} style={saveBtn}>
            {submitting ? 'Saving...' : 'Verify ✓'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Benchmarks CRUD ────────────────────────────────────────────────────────
function BenchmarksTable() {
  const { token } = useAuth();
  const [categories, setCategories] = useState(null);
  const [editing, setEditing] = useState(null);

  const fetchList = useCallback(() => {
    fetch('/api/benchmarks', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setCategories(d.categories || []));
  }, [token]);

  useEffect(() => { fetchList(); }, [fetchList]);

  if (!categories) return <p style={{ color: 'var(--text-tertiary)', padding: 20 }}>Loading...</p>;

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Edit ladders & thresholds</h2>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>
        Tune male/female thresholds at each level. Clients' current levels recompute automatically on save.
      </p>
      {categories.map(cat => (
        <div key={cat.category} style={{ marginBottom: 20 }}>
          <h3 style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 8,
            color: CATEGORY_COLORS[cat.category] || 'var(--accent)',
          }}>{cat.category}</h3>
          <div>
            {cat.benchmarks.map(b => (
              <div key={b.id} style={{
                padding: '12px', borderBottom: '1px solid var(--divider)',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{ fontSize: 20 }}>{b.icon || '⭐'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700 }}>{b.name}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {b.type === 'skill_ladder' ? 'Skill ladder' : `Numeric · ${b.unit} · ${b.direction === 'lower' ? 'lower is better' : 'higher is better'}`}
                    {b.requires_video ? ' · requires video' : ''}
                  </p>
                </div>
                {b.type === 'numeric' && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1,2,3,4,5].map(n => {
                      const L = (b.levels || []).find(l => l.level_number === n);
                      return (
                        <span key={n} style={{
                          padding: '3px 7px', borderRadius: 6, fontSize: 10,
                          background: 'rgba(255,255,255,0.04)', color: 'var(--text-tertiary)',
                          fontWeight: 700, minWidth: 54, textAlign: 'center',
                        }}>L{n}: {L ? fmt(b.unit, L.male_threshold) : '—'}</span>
                      );
                    })}
                  </div>
                )}
                <button onClick={() => setEditing(b)} style={{
                  padding: '5px 12px', borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 700,
                }}>Edit</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {editing && (
        <BenchmarkEditModal
          benchmark={editing}
          token={token}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchList(); }}
        />
      )}
    </div>
  );
}

function BenchmarkEditModal({ benchmark: bm, token, onClose, onSaved }) {
  const [levels, setLevels] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch(`/api/benchmarks/${bm.slug}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setLevels(d.levels || []));
  }, [bm.slug, token]);

  const update = (idx, field, val) => {
    setLevels(prev => prev.map((L, i) => i === idx ? { ...L, [field]: val } : L));
  };

  const save = async () => {
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/benchmarks/coach/benchmarks/${bm.id}/levels`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ levels: levels.map(L => ({
          level_number: L.level_number,
          title: L.title,
          description: L.description,
          male_threshold: L.male_threshold === '' ? null : Number(L.male_threshold),
          female_threshold: L.female_threshold === '' ? null : Number(L.female_threshold),
        })) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      onSaved();
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', borderRadius: 14, padding: 24,
        width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto',
      }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{bm.name}</h3>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>
          {bm.type === 'skill_ladder' ? 'Skill ladder — edit level titles & descriptions.' : `Numeric ladder — edit male/female thresholds (${bm.unit}).`}
        </p>

        {!levels ? <p style={{ color: 'var(--text-tertiary)' }}>Loading...</p> : levels.map((L, idx) => (
          <div key={L.id} style={{
            padding: 12, borderRadius: 10, marginBottom: 8,
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--divider)',
          }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 0.5, marginBottom: 6 }}>
              LEVEL {L.level_number}
            </p>
            {bm.type === 'skill_ladder' ? (
              <>
                <input value={L.title || ''} onChange={e => update(idx, 'title', e.target.value)} placeholder="Short title" style={{ ...inp, marginBottom: 6 }} />
                <textarea value={L.description || ''} onChange={e => update(idx, 'description', e.target.value)} rows={2} placeholder="Full requirement text" style={{ ...inp, resize: 'vertical' }} />
              </>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={lblStyle}>Men ({bm.unit})</label>
                  <input type="number" step="any" value={L.male_threshold ?? ''} onChange={e => update(idx, 'male_threshold', e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={lblStyle}>Women ({bm.unit})</label>
                  <input type="number" step="any" value={L.female_threshold ?? ''} onChange={e => update(idx, 'female_threshold', e.target.value)} style={inp} />
                </div>
              </div>
            )}
          </div>
        ))}

        {err && <p style={{ color: '#FF5E5E', fontSize: 12, marginTop: 8 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} disabled={saving} style={cancelBtn}>Cancel</button>
          <button onClick={save} disabled={saving || !levels} style={saveBtn}>
            {saving ? 'Saving...' : 'Save levels'}
          </button>
        </div>
      </div>
    </div>
  );
}

const initialStyle = {
  width: 34, height: 34, borderRadius: '50%',
  background: 'var(--accent)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13,
};
const inp = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.25)',
  color: 'var(--text-primary)', fontSize: 13,
};
const lblStyle = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5,
  marginBottom: 4, display: 'block',
};
const saveBtn = {
  flex: 1, padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 800,
};
const cancelBtn = {
  padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700,
};
