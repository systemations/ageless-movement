import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

// Pain Log - issue-based tracking. Each pain_issue is a discrete entity
// (e.g. "right shoulder impingement") that the client logs severity
// entries against over time. New issue creation goes through a body-
// region picker; ongoing entries are just the severity slider on the
// existing issue card.
//
// Data model + spec lives in project_pain_log_todo.md.

// 17 body regions, ordered head-to-foot. Position percents are joint
// anchors used both as tap targets and as endpoints for skeleton
// lines connecting them. Slight gender-specific tweaks (wider
// shoulders for male, wider hips for female) come from the
// genderAdjustments map below.
const BODY_REGIONS = [
  { key: 'neck',         label: 'Neck',                x: 50, y: 11 },
  { key: 'shoulder_l',   label: 'Left Shoulder',       x: 30, y: 18 },
  { key: 'shoulder_r',   label: 'Right Shoulder',      x: 70, y: 18 },
  { key: 'elbow_l',      label: 'Left Elbow',          x: 22, y: 32 },
  { key: 'elbow_r',      label: 'Right Elbow',         x: 78, y: 32 },
  { key: 'wrist_l',      label: 'Left Wrist',          x: 18, y: 44 },
  { key: 'wrist_r',      label: 'Right Wrist',         x: 82, y: 44 },
  { key: 'upper_back',   label: 'Upper Back',          x: 50, y: 24 },
  { key: 'lower_back',   label: 'Lower Back',          x: 50, y: 38 },
  { key: 'hip_l',        label: 'Left Hip',            x: 38, y: 48 },
  { key: 'hip_r',        label: 'Right Hip',           x: 62, y: 48 },
  { key: 'knee_l',       label: 'Left Knee',           x: 38, y: 68 },
  { key: 'knee_r',       label: 'Right Knee',          x: 62, y: 68 },
  { key: 'ankle_l',      label: 'Left Ankle',          x: 38, y: 86 },
  { key: 'ankle_r',      label: 'Right Ankle',         x: 62, y: 86 },
  { key: 'foot_l',       label: 'Left Foot',           x: 38, y: 94 },
  { key: 'foot_r',       label: 'Right Foot',          x: 62, y: 94 },
];

// Skeleton line connections - each pair is an edge in the joint graph.
// Drawn as glowing lines on top of a faint body shadow, VALD-style.
const SKELETON_EDGES = [
  ['neck', 'upper_back'],
  ['neck', 'shoulder_l'], ['neck', 'shoulder_r'],
  ['shoulder_l', 'upper_back'], ['shoulder_r', 'upper_back'],
  ['upper_back', 'lower_back'],
  ['shoulder_l', 'elbow_l'], ['elbow_l', 'wrist_l'],
  ['shoulder_r', 'elbow_r'], ['elbow_r', 'wrist_r'],
  ['lower_back', 'hip_l'], ['lower_back', 'hip_r'],
  ['hip_l', 'knee_l'], ['knee_l', 'ankle_l'], ['ankle_l', 'foot_l'],
  ['hip_r', 'knee_r'], ['knee_r', 'ankle_r'], ['ankle_r', 'foot_r'],
];

// Adjust joint x-positions per gender so the skeleton + silhouette
// shadow read correctly: male wider shoulders, female wider hips.
const genderAdjustedRegions = (sex) => {
  if (sex === 'female') {
    return BODY_REGIONS.map(r => {
      if (r.key === 'shoulder_l') return { ...r, x: 33 };
      if (r.key === 'shoulder_r') return { ...r, x: 67 };
      if (r.key === 'hip_l') return { ...r, x: 36 };
      if (r.key === 'hip_r') return { ...r, x: 64 };
      return r;
    });
  }
  // Male / unset
  return BODY_REGIONS.map(r => {
    if (r.key === 'shoulder_l') return { ...r, x: 28 };
    if (r.key === 'shoulder_r') return { ...r, x: 72 };
    return r;
  });
};

const regionLabel = (key) => BODY_REGIONS.find(r => r.key === key)?.label || 'Other';

const severityColor = (s) => {
  if (s == null) return 'var(--text-tertiary)';
  if (s <= 3) return '#30D158';
  if (s <= 6) return '#FF9500';
  return '#FF453A';
};

const severityLabel = (s) => {
  if (s <= 0) return 'No pain';
  if (s <= 3) return 'Noticeable';
  if (s <= 6) return 'Limiting';
  return 'Severe';
};

const formatDate = (iso) => {
  if (!iso) return '';
  // Server sends UTC without 'Z'; tag it so toLocaleDateString is correct.
  return new Date(iso.includes('Z') ? iso : iso + 'Z').toLocaleDateString('en-IE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

export default function PainLogging({ onBack }) {
  const { token } = useAuth();
  const [view, setView] = useState('list'); // list | new | detail | logEntry
  const [activeIssues, setActiveIssues] = useState([]);
  const [resolvedIssues, setResolvedIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [a, r] = await Promise.all([
        fetch('/api/pain/issues?status=active', { headers: { Authorization: `Bearer ${token}` } }).then(x => x.json()),
        fetch('/api/pain/issues?status=resolved', { headers: { Authorization: `Bearer ${token}` } }).then(x => x.json()),
      ]);
      setActiveIssues(a.issues || []);
      setResolvedIssues(r.issues || []);
    } catch (err) { /* swallow */ }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [token]);

  if (view === 'new') {
    return <NewIssueFlow token={token} onBack={() => setView('list')} onCreated={() => { fetchAll(); setView('list'); }} />;
  }
  if (view === 'detail' && selectedIssue) {
    return <IssueDetail token={token} issueId={selectedIssue} onBack={() => { fetchAll(); setView('list'); }} />;
  }
  if (view === 'logEntry' && selectedIssue) {
    return <LogEntryFlow token={token} issueId={selectedIssue} onBack={() => { fetchAll(); setView('list'); }} />;
  }

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>Pain Log</h1>
        <button onClick={() => setView('new')} style={{
          background: 'var(--accent)', border: 'none', borderRadius: 20,
          padding: '6px 14px', fontSize: 13, fontWeight: 600, color: '#fff',
        }}>+ New issue</button>
      </div>

      {loading && <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 24 }}>Loading…</p>}

      {!loading && activeIssues.length === 0 && resolvedIssues.length === 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 28, marginBottom: 8 }}>👌</p>
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>No pain to track</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Tap "+ New issue" if something flares up. Once logged, severity goes onto a trend so you can see if it's improving.
          </p>
        </div>
      )}

      {!loading && activeIssues.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.6, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 10 }}>
            Active ({activeIssues.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {activeIssues.map(issue => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onTap={() => { setSelectedIssue(issue.id); setView('detail'); }}
                onLog={() => { setSelectedIssue(issue.id); setView('logEntry'); }}
              />
            ))}
          </div>
        </>
      )}

      {!loading && resolvedIssues.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.6, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 10 }}>
            Resolved ({resolvedIssues.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {resolvedIssues.map(issue => (
              <div
                key={issue.id}
                onClick={() => { setSelectedIssue(issue.id); setView('detail'); }}
                className="card"
                style={{ cursor: 'pointer', opacity: 0.7, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <span style={{ fontSize: 14 }}>✓</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.title}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {regionLabel(issue.body_region)} · resolved {formatDate(issue.resolved_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Active issue card - title + region + last severity dot + Log button.
function IssueCard({ issue, onTap, onLog }) {
  const sev = issue.latest_entry?.severity;
  const color = severityColor(sev);
  return (
    <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        onClick={onTap}
        style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: `${color}20`, color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 14, cursor: 'pointer',
        }}>
        {sev != null ? sev : '–'}
      </div>
      <div onClick={onTap} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
        <p style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.title}</p>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {regionLabel(issue.body_region)} · {issue.entry_count} {issue.entry_count === 1 ? 'entry' : 'entries'}
          {issue.latest_entry && ` · last ${formatDate(issue.latest_entry.created_at)}`}
        </p>
      </div>
      <button
        onClick={onLog}
        style={{
          padding: '8px 12px', borderRadius: 10, border: '1px solid var(--accent)',
          background: 'transparent', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}
      >Log</button>
    </div>
  );
}

// VALD HumanTrak-inspired pose overlay. Faint body shadow for context,
// glowing skeleton lines connecting joints, prominent joint dots that
// double as tap targets. Two gendered shadow shapes (broader-shoulder
// male / wider-hip female); skeleton geometry comes from the joint
// region coords with gender adjustments.

const SHADOW_FILL = 'var(--pain-silhouette)';

// Subtle body shadow behind the skeleton. Drawn as separate paths
// (head / torso / arms / legs) so each shape stays clean.
function BodyShadow({ sex }) {
  const female = sex === 'female';
  return (
    <g fill={SHADOW_FILL}>
      {/* Head */}
      <ellipse cx="50" cy="14" rx={female ? '7' : '7.5'} ry={female ? '8.5' : '9'} />
      {/* Neck */}
      <rect x={female ? '47' : '46'} y="21" width={female ? '6' : '8'} height="5" />
      {/* Torso - male V-shape vs female hourglass */}
      {female ? (
        <path d="M33,28 Q30,30 31,40 L34,54 Q32,62 33,72 Q31,82 31,92 Q31,100 36,101 L64,101 Q69,100 69,92 Q69,82 67,72 Q68,62 66,54 L69,40 Q70,30 67,28 L58,26 L42,26 Z" />
      ) : (
        <path d="M28,28 Q24,30 26,40 L29,58 Q31,80 33,94 Q33,99 38,99 L62,99 Q67,99 67,94 Q69,80 71,58 L74,40 Q76,30 72,28 L60,26 L40,26 Z" />
      )}
      {/* Arms */}
      <path d={female
        ? "M33,28 Q26,32 22,44 Q19,58 19,76 Q19,86 21,92 Q24,93 26,90 Q28,75 29,62 Q30,48 32,40 Z"
        : "M28,28 Q22,32 18,44 Q15,58 15,76 Q15,86 17,92 Q20,93 22,90 Q24,75 26,62 Q27,48 29,40 Z"
      } />
      <path d={female
        ? "M67,28 Q74,32 78,44 Q81,58 81,76 Q81,86 79,92 Q76,93 74,90 Q72,75 71,62 Q70,48 68,40 Z"
        : "M72,28 Q78,32 82,44 Q85,58 85,76 Q85,86 83,92 Q80,93 78,90 Q76,75 74,62 Q73,48 71,40 Z"
      } />
      {/* Legs */}
      <path d="M37,99 Q34,102 34,110 L33,150 Q33,172 34,182 Q34,186 37,186 L45,186 Q48,186 48,182 Q49,172 48,150 L48,110 Q48,102 46,99 Z" />
      <path d="M63,99 Q66,102 66,110 L67,150 Q67,172 66,182 Q66,186 63,186 L55,186 Q52,186 52,182 Q51,172 52,150 L52,110 Q52,102 54,99 Z" />
      {/* Feet */}
      <ellipse cx="40" cy="188" rx="5" ry="2.5" />
      <ellipse cx="60" cy="188" rx="5" ry="2.5" />
    </g>
  );
}

// Skeleton overlay - bright lines + halo glow connecting joint dots.
// BODY_REGIONS y values are 0-100 (percent of container) but the SVG
// viewBox is 0-200 in Y so the body shadow paths can use anatomical
// proportions cleanly. We scale region.y * 2 inside the SVG so dot +
// edge geometry maps back to the same anchors used by the percentage
// dot positions before this overlay-style rebuild.
const sx = (v) => v;
const sy = (v) => v * 2;

function Skeleton({ regions, selectedKey }) {
  const byKey = Object.fromEntries(regions.map(r => [r.key, r]));
  return (
    <g>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {SKELETON_EDGES.map(([a, b]) => {
        const A = byKey[a]; const B = byKey[b];
        if (!A || !B) return null;
        const hot = selectedKey === a || selectedKey === b;
        return (
          <line
            key={`${a}-${b}`}
            x1={sx(A.x)} y1={sy(A.y)} x2={sx(B.x)} y2={sy(B.y)}
            stroke={hot ? 'var(--accent)' : 'rgba(255,156,51,0.55)'}
            strokeWidth={hot ? '1.6' : '1.1'}
            strokeLinecap="round"
            filter="url(#glow)"
          />
        );
      })}
    </g>
  );
}

// Body region picker: VALD-style pose overlay. Skeleton lines connect
// joint dots over a faint body shadow. Selecting a joint highlights
// it + its connected limbs.
function BodyMap({ value, onChange }) {
  const { profile } = useAuth();
  const sex = profile?.sex || 'male';
  const regions = genderAdjustedRegions(sex);
  return (
    <div>
      <div style={{
        position: 'relative', width: '100%', maxWidth: 260, margin: '0 auto 12px',
        aspectRatio: '1/2',
        background: 'radial-gradient(ellipse at center, rgba(255,156,51,0.05), var(--bg-card) 70%)',
        borderRadius: 16, padding: 0, overflow: 'hidden',
      }}>
        <svg
          viewBox="0 0 100 200"
          preserveAspectRatio="xMidYMid meet"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <BodyShadow sex={sex} />
          <Skeleton regions={regions} selectedKey={value} />
          {/* Joint dots rendered inside the SVG so they scale with it.
              Each dot sits at the region's (x,y) and acts as a tap
              target via onClick on the <circle>. */}
          {regions.map(r => {
            const selected = value === r.key;
            return (
              <g key={r.key} style={{ cursor: 'pointer' }} onClick={() => onChange(r.key)}>
                <circle
                  cx={sx(r.x)} cy={sy(r.y)} r={selected ? 3.5 : 2.4}
                  fill={selected ? 'var(--accent)' : '#FF9C33'}
                  stroke="#fff"
                  strokeWidth={selected ? '0.8' : '0.5'}
                  filter="url(#glow)"
                />
                {/* Invisible larger hit target so the dot is easy to tap on mobile */}
                <circle cx={sx(r.x)} cy={sy(r.y)} r="6" fill="rgba(0,0,0,0)">
                  <title>{r.label}</title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>
      {value && (
        <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 16 }}>
          {regionLabel(value)}
        </p>
      )}
    </div>
  );
}

// Severity slider + label. Anchor labels: 0/3/6/9.
function SeveritySlider({ value, onChange }) {
  const color = severityColor(value);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 800, color }}>{value}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color }}>{severityLabel(value)}</span>
      </div>
      <input
        type="range" min="0" max="10" value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        style={{
          width: '100%', height: 6, appearance: 'none',
          background: `linear-gradient(to right, #30D158, #FF9500, #FF453A)`,
          borderRadius: 3, outline: 'none',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--text-tertiary)' }}>
        <span>0 No pain</span>
        <span>3 Noticeable</span>
        <span>6 Limiting</span>
        <span>9 Severe</span>
      </div>
    </div>
  );
}

// Flow: pick region → set initial severity + write a title + optional notes → save.
function NewIssueFlow({ token, onBack, onCreated }) {
  const [region, setRegion] = useState(null);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState(5);
  const [notesInitial, setNotesInitial] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Auto-fill the title with the region label so the user can just hit save
  // for a quick log; they can rename if they want something more specific.
  useEffect(() => {
    if (region && !title) setTitle(regionLabel(region));
  }, [region]);

  const save = async () => {
    if (!region || !title.trim()) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch('/api/pain/issues', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body_region: region, title: title.trim(), severity, notes_initial: notesInitial }),
      });
      if (!r.ok) { setError('Could not save. Try again.'); setSaving(false); return; }
      onCreated();
    } catch (e) { setError('Network error.'); setSaving(false); }
  };

  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>New pain issue</h1>
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        Where is the pain?
      </h3>
      <BodyMap value={region} onChange={setRegion} />

      {region && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
            Title (so you recognise it later)
          </h3>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Right shoulder impingement"
            className="input-field"
            style={{ marginBottom: 16 }}
          />

          <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
            How bad is it right now?
          </h3>
          <SeveritySlider value={severity} onChange={setSeverity} />

          <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
            Notes <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>(optional)</span>
          </h3>
          <textarea
            value={notesInitial}
            onChange={e => setNotesInitial(e.target.value)}
            placeholder="When does it hurt? What makes it worse or better?"
            className="input-field"
            style={{ minHeight: 80, fontSize: 14, resize: 'vertical', marginBottom: 16 }}
          />

          {error && <p style={{ color: 'var(--accent-orange)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

          <button
            className="btn-primary"
            onClick={save}
            disabled={saving || !region || !title.trim()}
          >{saving ? 'Saving…' : 'Save issue'}</button>
        </>
      )}
    </div>
  );
}

// Quick "+ Log entry" against an existing issue: severity + optional note.
function LogEntryFlow({ token, issueId, onBack }) {
  const [issue, setIssue] = useState(null);
  const [severity, setSeverity] = useState(5);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/pain/issues/${issueId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        setIssue(d.issue);
        if (d.entries?.[0]) setSeverity(d.entries[0].severity);
      });
  }, [issueId, token]);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/pain/issues/${issueId}/entries`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ severity, notes }),
      });
      if (!r.ok) { setError('Could not save. Try again.'); setSaving(false); return; }
      onBack();
    } catch (e) { setError('Network error.'); setSaving(false); }
  };

  if (!issue) return <div className="page-content"><p style={{ color: 'var(--text-tertiary)' }}>Loading…</p></div>;

  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Log update</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{issue.title} · {regionLabel(issue.body_region)}</p>
        </div>
      </div>

      <SeveritySlider value={severity} onChange={setSeverity} />

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Anything notable about how this feels today?"
        className="input-field"
        style={{ minHeight: 80, fontSize: 14, resize: 'vertical', marginBottom: 16 }}
      />

      {error && <p style={{ color: 'var(--accent-orange)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <button className="btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save entry'}
      </button>
    </div>
  );
}

// Detail page: trend bars + entry-by-entry history + Mark resolved.
function IssueDetail({ token, issueId, onBack }) {
  const [issue, setIssue] = useState(null);
  const [entries, setEntries] = useState([]);
  const [resolving, setResolving] = useState(false);

  const reload = () => {
    fetch(`/api/pain/issues/${issueId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setIssue(d.issue); setEntries(d.entries || []); });
  };
  useEffect(reload, [issueId, token]);

  const resolve = async () => {
    setResolving(true);
    await fetch(`/api/pain/issues/${issueId}/resolve`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    setResolving(false);
    reload();
  };
  const reopen = async () => {
    setResolving(true);
    await fetch(`/api/pain/issues/${issueId}/reopen`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    setResolving(false);
    reload();
  };

  if (!issue) return <div className="page-content"><p style={{ color: 'var(--text-tertiary)' }}>Loading…</p></div>;

  // Trend data: oldest first for the chart bars.
  const chronological = [...entries].reverse();

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>{issue.title}</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {regionLabel(issue.body_region)} · opened {formatDate(issue.opened_at)}
            {issue.status === 'resolved' && ` · resolved ${formatDate(issue.resolved_at)}`}
          </p>
        </div>
      </div>

      {/* Trend chart - simple bars, oldest → newest left to right. */}
      {chronological.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
            Severity trend
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 72 }}>
            {chronological.map(e => (
              <div
                key={e.id}
                title={`${e.severity}/10 on ${formatDate(e.created_at)}`}
                style={{
                  flex: 1, height: `${(e.severity / 10) * 100}%`, minHeight: 4,
                  background: severityColor(e.severity), borderRadius: 4,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Entry list */}
      <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
        History ({entries.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {entries.map(e => (
          <div key={e.id} className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: `${severityColor(e.severity)}20`, color: severityColor(e.severity),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 13,
            }}>{e.severity}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{formatDate(e.created_at)}</p>
              {e.notes && <p style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{e.notes}</p>}
            </div>
          </div>
        ))}
      </div>

      {issue.status === 'active' ? (
        <button
          onClick={resolve}
          disabled={resolving}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            background: 'var(--accent-mint)', border: 'none', color: '#000',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}
        >{resolving ? '…' : '✓ Mark resolved'}</button>
      ) : (
        <button
          onClick={reopen}
          disabled={resolving}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            background: 'transparent', border: '1px solid var(--divider)', color: 'var(--text-primary)',
            fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}
        >{resolving ? '…' : 'Reopen issue'}</button>
      )}
    </div>
  );
}
