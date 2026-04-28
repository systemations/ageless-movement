import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

// Pain Log — issue-based tracking. Each pain_issue is a discrete entity
// (e.g. "right shoulder impingement") that the client logs severity
// entries against over time. New issue creation goes through a body-
// region picker; ongoing entries are just the severity slider on the
// existing issue card.
//
// Data model + spec lives in project_pain_log_todo.md.

// 17 body regions ordered head-to-foot. Position percents are for the
// minimal body silhouette below — anatomical-ish dot map, not pixel-
// perfect art. Good enough for V1; can swap for a real SVG later.
const BODY_REGIONS = [
  { key: 'neck',         label: 'Neck',                x: 50, y: 10 },
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
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

// Active issue card — title + region + last severity dot + Log button.
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

// Body region picker: tap a dot on the silhouette to choose a region.
// SVG anatomical figure — front view, arms slightly out, neutral. Dots
// are absolutely positioned over the SVG using the same x,y percent
// coords stored on each region. Single-path silhouette so it scales
// crisp at any size and matches the navy theme.
function BodyMap({ value, onChange }) {
  return (
    <div>
      <div style={{
        position: 'relative', width: '100%', maxWidth: 240, margin: '0 auto 12px',
        aspectRatio: '1/2', background: 'var(--bg-card)', borderRadius: 16,
        padding: 0, overflow: 'hidden',
      }}>
        <svg
          viewBox="0 0 100 200"
          preserveAspectRatio="xMidYMid meet"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {/* Single front-view silhouette: head, neck, shoulders, torso,
              arms hanging slightly out, legs, feet. Drawn as one path
              with the navy fill + a soft outline so the dots read on top. */}
          <path
            d="
              M50 8
              C55 8 59 12 59 17
              C59 22 56 25 53 26
              L53 30
              C61 30 68 32 73 36
              C76 39 78 43 78 48
              L80 60
              C82 70 82 80 80 90
              C79 95 78 100 76 105
              L74 100
              C72 90 70 75 70 60
              L70 96
              C70 110 72 130 70 175
              C70 184 68 188 64 188
              L58 188
              C57 188 56 187 56 185
              L55 175
              C55 130 54 110 54 96
              L54 70
              L46 70
              L46 96
              C46 110 45 130 45 175
              L44 185
              C44 187 43 188 42 188
              L36 188
              C32 188 30 184 30 175
              C28 130 30 110 30 96
              L30 60
              C30 75 28 90 26 100
              L24 105
              C22 100 21 95 20 90
              C18 80 18 70 20 60
              L22 48
              C22 43 24 39 27 36
              C32 32 39 30 47 30
              L47 26
              C44 25 41 22 41 17
              C41 12 45 8 50 8
              Z
            "
            fill="rgba(255,255,255,0.05)"
            stroke="var(--divider)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
        {BODY_REGIONS.map(r => {
          const selected = value === r.key;
          return (
            <button
              key={r.key}
              onClick={() => onChange(r.key)}
              title={r.label}
              style={{
                position: 'absolute', left: `${r.x}%`, top: `${r.y}%`, transform: 'translate(-50%, -50%)',
                width: selected ? 22 : 16, height: selected ? 22 : 16, borderRadius: '50%',
                border: selected ? 'none' : '2px solid rgba(255,255,255,0.45)',
                cursor: 'pointer',
                background: selected ? 'var(--accent)' : 'rgba(0,0,0,0.45)',
                boxShadow: selected ? '0 0 14px var(--accent)' : '0 1px 4px rgba(0,0,0,0.4)',
                transition: 'all 0.15s',
                zIndex: 1,
              }}
            />
          );
        })}
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>{issue.title}</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {regionLabel(issue.body_region)} · opened {formatDate(issue.opened_at)}
            {issue.status === 'resolved' && ` · resolved ${formatDate(issue.resolved_at)}`}
          </p>
        </div>
      </div>

      {/* Trend chart — simple bars, oldest → newest left to right. */}
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
