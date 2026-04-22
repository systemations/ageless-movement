import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const TABS = ['Leaderboards', 'My Levels'];
const GENDERS = [
  { key: 'all',    label: 'All' },
  { key: 'male',   label: 'Men' },
  { key: 'female', label: 'Women' },
];
const AGE_OPTIONS = [
  { key: 'all', label: 'All ages' },
  { key: '20s', label: '20-29' },
  { key: '30s', label: '30-39' },
  { key: '40s', label: '40-49' },
  { key: '50s', label: '50-59' },
  { key: '60s', label: '60-69' },
  { key: '70s', label: '70-79' },
  { key: '80p', label: '80+' },
];
const CATEGORY_COLORS = {
  BURN:  '#FF453A',
  LIFT:  '#FF8C00',
  MOVE:  '#85FFBA',
  FLEX:  '#5AC8FA',
  NUTRITION: '#34C759',
  SLEEP: '#AF52DE',
};
// Warm-to-cool level progression - same palette used on Home hero tiles.
const LEVEL_COLORS = {
  0: '#94a3b8',
  1: '#fb7185',
  2: '#fb923c',
  3: '#facc15',
  4: '#22c55e',
  5: '#8b5cf6',
};

const UNIT_FMT = {
  seconds: v => { const n = +v; const m = Math.floor(n / 60); const s = Math.round(n % 60); return m > 0 ? `${m}:${String(s).padStart(2,'0')}` : `${s}s`; },
  kg: v => `${v}kg`, reps: v => `${v} reps`, watts: v => `${v}W`, cal: v => `${v} cal`, m: v => `${v}m`,
};
const fmt = (unit, v) => (UNIT_FMT[unit] || (x => String(x)))(v);

export default function Challenges() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Leaderboards');

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => navigate(-1)} style={backBtnStyle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Challenges & Levels</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', borderRadius: 50, padding: 4, marginBottom: 14 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 50, border: 'none',
              fontSize: 12, fontWeight: 700,
              background: activeTab === t ? 'var(--accent)' : 'transparent',
              color: activeTab === t ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >{t}</button>
        ))}
      </div>

      {activeTab === 'Leaderboards' && <LeaderboardsTab token={token} currentUserId={user?.id} />}
      {activeTab === 'My Levels'    && <BenchmarksHub token={token} onOpen={slug => navigate(`/challenges/${slug}`)} />}
    </div>
  );
}

// ── Leaderboards tab ───────────────────────────────────────────────────────
// Picker switches the data source. Streaks + Steps are standalone; benchmarks
// map to their per-benchmark leaderboard. Same gender+age filters apply.
function LeaderboardsTab({ token, currentUserId }) {
  const [boardsIndex, setBoardsIndex] = useState(null); // list of selectable leaderboards
  const [selected, setSelected] = useState({ kind: 'ageless_mover', slug: null, label: 'Ageless Mover' });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [gender, setGender] = useState('all');
  const [age, setAge] = useState('all');
  const [timeframe, setTimeframe] = useState('week'); // only for Steps
  // Server returns only buckets that actually have at least one client in
  // them. We filter AGE_OPTIONS down to those to avoid showing empty chips.
  const [populatedAgeBuckets, setPopulatedAgeBuckets] = useState(null);

  useEffect(() => {
    fetch('/api/benchmarks', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        setBoardsIndex(d.categories || []);
        setPopulatedAgeBuckets(d.populated_age_buckets || []);
      })
      .catch(() => {});
  }, [token]);

  // Filter the static AGE_OPTIONS to just "All ages" plus the populated ones.
  const visibleAgeOptions = populatedAgeBuckets == null
    ? AGE_OPTIONS // pre-load: show all until we know
    : [AGE_OPTIONS[0], ...AGE_OPTIONS.slice(1).filter(o => populatedAgeBuckets.some(b => b.key === o.key))];

  return (
    <>
      <button
        onClick={() => setPickerOpen(true)}
        style={{
          width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 12, border: 'none',
          background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: 'rgba(255,140,0,0.15)',
          color: 'var(--accent-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>🏆</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: 0.8, textTransform: 'uppercase' }}>
            Leaderboard
          </p>
          <p style={{ fontSize: 15, fontWeight: 800, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected.label}
          </p>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      <ChipRow value={gender} onChange={setGender} options={GENDERS} />
      {visibleAgeOptions.length > 1 && (
        <ChipRow value={age} onChange={setAge} options={visibleAgeOptions} />
      )}

      {selected.kind === 'steps' && (
        <ChipRow
          value={timeframe}
          onChange={setTimeframe}
          options={[
            { key: 'today', label: 'Today' },
            { key: 'week',  label: '7 days' },
            { key: 'month', label: '30 days' },
            { key: 'all',   label: 'All time' },
          ]}
        />
      )}

      {selected.kind === 'ageless_mover' && <AgelessMoverBoard token={token} gender={gender} age={age} currentUserId={currentUserId} />}
      {selected.kind === 'streaks'       && <StreaksBoard      token={token} gender={gender} age={age} currentUserId={currentUserId} />}
      {selected.kind === 'steps'         && <StepsBoard        token={token} gender={gender} age={age} timeframe={timeframe} currentUserId={currentUserId} />}
      {selected.kind === 'benchmark'     && <BenchmarkBoard    token={token} slug={selected.slug} unit={selected.unit} gender={gender} age={age} currentUserId={currentUserId} />}

      {pickerOpen && (
        <LeaderboardPicker
          categories={boardsIndex}
          onPick={(s) => { setSelected(s); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

function LeaderboardPicker({ categories, onPick, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 480, margin: '0 auto',
        maxHeight: '85vh', overflow: 'auto', padding: '16px 16px 32px',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Choose a leaderboard</h3>

        <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Overall</p>
        <PickerRow icon="🏅" label="Ageless Mover (all-rounder)" onClick={() => onPick({ kind: 'ageless_mover', label: 'Ageless Mover' })} />
        <PickerRow icon="🔥" label="Streaks" onClick={() => onPick({ kind: 'streaks', label: 'Streaks' })} />
        <PickerRow icon="👣" label="Steps"   onClick={() => onPick({ kind: 'steps',   label: 'Steps' })} />

        {categories && categories.map(cat => (
          <div key={cat.category}>
            <p style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase',
              marginTop: 14, marginBottom: 6,
              color: CATEGORY_COLORS[cat.category] || 'var(--accent)',
            }}>{cat.category}</p>
            {cat.benchmarks.map(b => (
              <PickerRow
                key={b.slug}
                icon={b.icon || '⭐'}
                label={b.name}
                onClick={() => onPick({ kind: 'benchmark', slug: b.slug, label: b.name, unit: b.unit })}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PickerRow({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: 'none',
      background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, fontSize: 13, fontWeight: 600,
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function ChipRow({ value, onChange, options }) {
  return (
    <div className="hide-scrollbar" style={{
      display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 4,
    }}>
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            padding: '5px 12px', borderRadius: 14, border: 'none', cursor: 'pointer', flexShrink: 0,
            background: value === o.key ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
            color: value === o.key ? '#fff' : 'var(--text-secondary)',
            fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}

function AgelessMoverBoard({ token, gender, age, currentUserId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams();
    if (gender !== 'all') params.set('gender', gender);
    if (age !== 'all')    params.set('age', age);
    fetch(`/api/benchmarks/leaderboards/ageless-mover?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(setData);
  }, [token, gender, age]);
  if (!data) return <div style={loadingStyle}>Loading...</div>;
  return (
    <LeaderList
      entries={data.entries.map(e => ({
        ...e,
        primary: `${e.points} pts`,
        secondary: `${e.tested_count} tests · avg Lv ${e.avg_level}`,
      }))}
      emptyText="No scores yet - be the first to test."
      currentUserId={currentUserId}
      footerNote={
        <>
          <strong>Ageless Mover</strong> is the all-rounder leaderboard - the athlete most well-rounded across every benchmark.
          Each verified level you hold earns points: <strong>Lv 1 = 1 · Lv 2 = 3 · Lv 3 = 6 · Lv 4 = 10 · Lv 5 = 15</strong>.
          Only your best attempt on each test counts. Max {data.max_points} pts.
        </>
      }
    />
  );
}

function StreaksBoard({ token, gender, age, currentUserId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams();
    if (gender !== 'all') params.set('gender', gender);
    if (age !== 'all')    params.set('age', age);
    fetch(`/api/benchmarks/leaderboards/streaks?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(setData);
  }, [token, gender, age]);
  if (!data) return <div style={loadingStyle}>Loading...</div>;
  return (
    <LeaderList
      entries={data.entries.map(e => ({
        ...e,
        primary: `${e.current_streak} day${e.current_streak === 1 ? '' : 's'}`,
        secondary: `Best ${e.best_streak}`,
      }))}
      emptyText="No streaks yet - log a check-in to start one."
      currentUserId={currentUserId}
      footerNote={
        <>
          Your streak counts the number of consecutive days you&apos;ve logged activity. Miss a day and it resets to zero - but your <strong>Best</strong> stays.
        </>
      }
    />
  );
}

function StepsBoard({ token, gender, age, timeframe, currentUserId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams({ timeframe });
    if (gender !== 'all') params.set('gender', gender);
    if (age !== 'all')    params.set('age', age);
    fetch(`/api/benchmarks/leaderboards/steps?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(setData);
  }, [token, gender, age, timeframe]);
  if (!data) return <div style={loadingStyle}>Loading...</div>;
  return (
    <LeaderList
      entries={data.entries.map(e => ({
        ...e,
        primary: `${(e.total_steps || 0).toLocaleString()} steps`,
        secondary: e.days_logged ? `${e.days_logged} day${e.days_logged === 1 ? '' : 's'} logged` : '',
      }))}
      emptyText="No steps logged in this window."
      currentUserId={currentUserId}
      footerNote={
        <>
          Steps are summed from your logged daily totals. Connect your watch or log manually on Home. We don&apos;t pull from the health app automatically yet &mdash; coming in V1.x.
        </>
      }
    />
  );
}

function BenchmarkBoard({ token, slug, unit, gender, age, currentUserId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    const params = new URLSearchParams();
    if (gender !== 'all') params.set('gender', gender);
    if (age !== 'all')    params.set('age', age);
    fetch(`/api/benchmarks/${slug}/leaderboard?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(setData);
  }, [token, slug, gender, age]);
  if (!data) return <div style={loadingStyle}>Loading...</div>;
  const requiresVideo = data.benchmark?.requires_video;
  return (
    <LeaderList
      entries={data.entries.map(e => ({
        ...e,
        primary: fmt(unit || 'reps', e.best_value),
        secondary: e.age ? `${e.age} · ${e.gender || '-'}` : '',
      }))}
      emptyText="No verified entries yet. Be first."
      currentUserId={currentUserId}
      footerNote={
        requiresVideo
          ? <>Entries require a short video or Strava/Garmin activity link. Coach reviews each submission before it appears here with a <strong>Verified</strong> tick. Self-reported attempts don&apos;t count until verified.</>
          : <>Self-reported - no video required for this benchmark.</>
      }
    />
  );
}

function LeaderList({ entries, emptyText, currentUserId, footerNote }) {
  const [expanded, setExpanded] = useState(false);

  if (!entries || !entries.length) {
    return <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>{emptyText}</div>;
  }

  const TOP_CUT = 10;
  const podium = entries.slice(0, 3);
  const top10Rest = entries.slice(3, TOP_CUT);
  const beyond = entries.slice(TOP_CUT);
  const me = entries.find(e => e.user_id === currentUserId);
  const meBeyondTop = me && me.rank > TOP_CUT;

  return (
    <div>
      <Podium entries={podium} currentUserId={currentUserId} />

      {top10Rest.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {top10Rest.map(e => (
            <LeaderRow key={e.user_id} entry={e} isMe={e.user_id === currentUserId} />
          ))}
        </div>
      )}

      {/* User's own rank if outside the top 10 - always visible without expanding. */}
      {meBeyondTop && !expanded && (
        <>
          <div style={{
            textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)',
            margin: '8px 0', letterSpacing: 2,
          }}>· · ·</div>
          <LeaderRow entry={me} isMe />
        </>
      )}

      {expanded && beyond.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {beyond.map(e => (
            <LeaderRow key={e.user_id} entry={e} isMe={e.user_id === currentUserId} />
          ))}
        </div>
      )}

      {beyond.length > 0 && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            width: '100%', marginTop: 10, padding: '10px', borderRadius: 10, cursor: 'pointer',
            border: '1px solid var(--divider)', background: 'transparent',
            color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700,
          }}
        >
          {expanded ? 'Show less' : `See all ${entries.length} athletes`}
        </button>
      )}

      {footerNote && (
        <div style={{
          marginTop: 16, padding: '12px 14px', borderRadius: 10,
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--divider)',
          fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6,
        }}>
          <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 4 }}>
            How this works
          </span>
          {footerNote}
        </div>
      )}
    </div>
  );
}

function Podium({ entries, currentUserId }) {
  // Desired visual order: #2 on the left, #1 centre (taller), #3 right.
  const order = [
    entries[1] || null,  // silver
    entries[0] || null,  // gold
    entries[2] || null,  // bronze
  ];
  const heights = [110, 130, 96];
  const medalColors = ['#C0C0C0', '#FFD700', '#CD7F32'];
  const medals = ['🥈', '🥇', '🥉'];

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'flex-end', padding: '14px 4px 16px' }}>
      {order.map((e, i) => {
        if (!e) return <div key={i} style={{ flex: 1 }} />;
        const isMe = e.user_id === currentUserId;
        return (
          <div key={e.user_id} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
            {/* Avatar + medal */}
            <div style={{ position: 'relative', width: 56, height: 56, margin: '0 auto 4px' }}>
              {e.photo_url ? (
                <img src={e.photo_url} alt="" style={{
                  width: 56, height: 56, borderRadius: '50%', objectFit: 'cover',
                  border: `2px solid ${medalColors[i]}`,
                  boxShadow: isMe ? '0 0 0 3px rgba(133,255,186,0.35)' : 'none',
                }} />
              ) : (
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'var(--accent)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 20,
                  border: `2px solid ${medalColors[i]}`,
                  boxShadow: isMe ? '0 0 0 3px rgba(133,255,186,0.35)' : 'none',
                }}>{(e.name || '?').charAt(0).toUpperCase()}</div>
              )}
              <div style={{
                position: 'absolute', bottom: -4, right: -4, fontSize: 18,
                background: 'var(--bg)', borderRadius: '50%', width: 22, height: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{medals[i]}</div>
            </div>
            <p style={{
              fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', marginBottom: 2,
              color: isMe ? 'var(--accent-mint)' : 'var(--text-primary)',
            }}>
              {isMe ? 'You' : e.name}
            </p>
            <p style={{ fontSize: 11, fontWeight: 800, color: medalColors[i], marginBottom: 4 }}>
              {e.primary}
            </p>
            {/* Pedestal */}
            <div style={{
              height: heights[i], borderRadius: '8px 8px 0 0',
              background: `linear-gradient(180deg, ${medalColors[i]}66, ${medalColors[i]}22)`,
              border: `1px solid ${medalColors[i]}55`,
              borderBottom: 'none',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              paddingTop: 6,
              fontSize: 18, fontWeight: 900, color: medalColors[i],
            }}>
              {i === 0 ? '2' : i === 1 ? '1' : '3'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeaderRow({ entry: e, isMe }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px',
      borderRadius: 10, marginBottom: 6,
      background: isMe ? 'var(--accent)' : 'var(--bg-card)',
      boxShadow: isMe ? '0 4px 14px rgba(255,140,0,0.25)' : 'none',
    }}>
      <div style={{
        minWidth: 28, textAlign: 'center', fontSize: 13, fontWeight: 800,
        color: isMe ? '#fff' : 'var(--text-secondary)',
      }}>#{e.rank}</div>
      {e.photo_url ? (
        <img src={e.photo_url} alt="" style={{
          width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
          border: isMe ? '2px solid #fff' : 'none',
        }} />
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: isMe ? '#fff' : 'var(--accent)',
          color: isMe ? 'var(--accent)' : '#fff',
          border: isMe ? '2px solid #fff' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800,
        }}>
          {(e.name || '?').charAt(0).toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13, fontWeight: 800,
          color: isMe ? '#fff' : 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {isMe ? (
            <span>
              {e.name}
              <span style={{
                fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 6, marginLeft: 6,
                background: '#fff', color: 'var(--accent)', letterSpacing: 0.8,
                verticalAlign: 'middle',
              }}>YOU</span>
            </span>
          ) : e.name}
        </p>
        {e.secondary && (
          <p style={{
            fontSize: 11,
            color: isMe ? 'rgba(255,255,255,0.85)' : 'var(--text-tertiary)',
          }}>{e.secondary}</p>
        )}
      </div>
      <p style={{
        fontSize: 14, fontWeight: 900,
        color: isMe ? '#fff' : 'var(--accent)',
        flexShrink: 0,
      }}>{e.primary}</p>
    </div>
  );
}

// ── My Levels tab ──────────────────────────────────────────────────────────
function BenchmarksHub({ token, onOpen }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/benchmarks', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, [token]);

  if (loading) return <div style={loadingStyle}>Loading...</div>;

  return (
    <>
      {data.categories.map(cat => {
        const color = CATEGORY_COLORS[cat.category] || 'var(--accent)';
        const total = cat.benchmarks.length;
        const avgLevel = cat.benchmarks.reduce((s, b) => s + (b.current_level || 0), 0) / total;
        return (
          <div key={cat.category} style={{ marginBottom: 18 }}>
            {/* Bold category banner - full-width pill with strong tint and avg-level pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', marginBottom: 8, borderRadius: 12,
              background: `linear-gradient(90deg, ${color}22, ${color}08)`,
              border: `1px solid ${color}55`,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: color, color: '#000',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 900, letterSpacing: 0.5,
              }}>{cat.category.charAt(0)}</div>
              <h2 style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1, color }}>
                {cat.category}
              </h2>
              <div style={{ flex: 1 }} />
              <span style={{
                fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 8,
                background: `${color}22`, color,
                textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
              }}>
                Avg Lv {avgLevel.toFixed(1)} · {total} tests
              </span>
            </div>
            {cat.benchmarks.map(b => (
              <BenchmarkRow key={b.id} benchmark={b} color={color} onClick={() => onOpen(b.slug)} />
            ))}
          </div>
        );
      })}
    </>
  );
}

function BenchmarkRow({ benchmark: b, color, onClick }) {
  const lv = b.current_level || 0;
  const pct = (lv / 5) * 100;
  // Category color paints the left stripe + icon tile (territory).
  // Level color paints the progress bar + LV badge (progression).
  const levelColor = LEVEL_COLORS[lv];
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        borderRadius: 12, marginBottom: 6, cursor: 'pointer',
        background: 'var(--bg-card)',
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: `${color}20`, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
      }}>{b.icon || '⭐'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {b.name}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: levelColor }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 800, color: levelColor, letterSpacing: 0.5 }}>LV {lv}/5</span>
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  );
}

const backBtnStyle = {
  width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-card)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', cursor: 'pointer', color: 'var(--text-primary)',
};
const loadingStyle = { padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' };
