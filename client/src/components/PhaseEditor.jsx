import { useMemo, useState } from 'react';

// Reusable phase-list editor for cardio/interval prescriptions. Works for
// the primary exercise row on a cardio workout AND for each alternative
// (when the coach wants rowing to get a different interval scheme than
// running). Emits the phases as an array of { label, duration_secs,
// intensity, zone, notes } objects via onChange.

const INTENSITY_OPTIONS = [
  { value: 'easy',     label: 'Easy',     color: '#30D158' },
  { value: 'moderate', label: 'Moderate', color: '#FFD60A' },
  { value: 'hard',     label: 'Hard',     color: '#FF9500' },
  { value: 'max',      label: 'Max',      color: '#FF453A' },
  { value: 'rest',     label: 'Rest',     color: '#64D2FF' },
];

// Quick templates to avoid tedious manual entry. Each returns a fresh
// phase list — the coach can then tweak before saving.
const TEMPLATES = {
  steady: () => [
    { label: 'Zone 2', duration_secs: 40 * 60, intensity: 'easy', zone: 2, notes: null },
  ],
  uniform: () => {
    const work = 180, rest = 120, rounds = 5;
    const phases = [];
    for (let i = 1; i <= rounds; i++) {
      phases.push({ label: `Work ${i}`, duration_secs: work, intensity: 'hard', zone: 4, notes: null });
      if (i < rounds) phases.push({ label: `Rest ${i}`, duration_secs: rest, intensity: 'rest', zone: 1, notes: null });
    }
    return phases;
  },
  pyramid: () => {
    // Classic 1-2-3-2-1 minute pyramid with 60s rest between
    const durations = [60, 120, 180, 120, 60];
    const phases = [];
    durations.forEach((d, i) => {
      phases.push({ label: `Pyramid ${i + 1}`, duration_secs: d, intensity: 'hard', zone: 4, notes: null });
      if (i < durations.length - 1) phases.push({ label: 'Rest', duration_secs: 60, intensity: 'rest', zone: 1, notes: null });
    });
    return phases;
  },
  alternating: () => {
    const rounds = 4;
    const phases = [];
    for (let i = 1; i <= rounds; i++) {
      phases.push({ label: `Max ${i}`, duration_secs: 180, intensity: 'max', zone: 5, notes: null });
      phases.push({ label: `Mid ${i}`, duration_secs: 180, intensity: 'moderate', zone: 3, notes: null });
    }
    return phases;
  },
  fartlek: () => [
    { label: 'Fartlek', duration_secs: 30 * 60, intensity: 'moderate', zone: 3,
      notes: 'Vary intensity by feel — surge on hills / lampposts / straights. Keep total ~30 min.' },
  ],
};

// Format a seconds count as mm:ss (or just "Xm" for whole minutes).
function formatSecs(s) {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  if (r === 0) return `${m}m`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Parse a user input (e.g. "3:00" or "180" or "3m") back into seconds.
function parseDuration(input) {
  if (typeof input === 'number') return input;
  const s = String(input).trim();
  if (!s) return 0;
  // mm:ss
  if (s.includes(':')) {
    const [m, sec] = s.split(':').map(n => parseInt(n, 10) || 0);
    return m * 60 + sec;
  }
  // Nm (minutes shorthand)
  if (/^\d+\s*m$/i.test(s)) return parseInt(s, 10) * 60;
  // Plain seconds
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export default function PhaseEditor({ value, onChange, compact = false }) {
  const phases = Array.isArray(value) ? value : [];
  const [durationInputs, setDurationInputs] = useState({}); // idx → draft string

  const totalSecs = useMemo(
    () => phases.reduce((acc, p) => acc + (Number(p.duration_secs) || 0), 0),
    [phases],
  );

  const updatePhase = (idx, patch) => {
    const next = phases.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(next);
  };

  const addPhase = () => {
    const last = phases[phases.length - 1];
    onChange([
      ...phases,
      {
        label: last?.intensity === 'rest' ? `Work ${phases.filter(p => p.intensity !== 'rest').length + 1}` : 'Rest',
        duration_secs: last?.intensity === 'rest' ? 180 : 60,
        intensity: last?.intensity === 'rest' ? 'hard' : 'rest',
        zone: last?.intensity === 'rest' ? 4 : 1,
        notes: null,
      },
    ]);
  };

  const removePhase = (idx) => {
    onChange(phases.filter((_, i) => i !== idx));
  };

  const move = (idx, dir) => {
    const next = [...phases];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const applyTemplate = (key) => {
    const gen = TEMPLATES[key];
    if (gen) onChange(gen());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Templates */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button type="button" onClick={() => applyTemplate('steady')} style={templateBtn}>Steady state</button>
        <button type="button" onClick={() => applyTemplate('uniform')} style={templateBtn}>5 × 3/2 intervals</button>
        <button type="button" onClick={() => applyTemplate('pyramid')} style={templateBtn}>Pyramid 1-2-3-2-1</button>
        <button type="button" onClick={() => applyTemplate('alternating')} style={templateBtn}>Max / Mid alternating</button>
        <button type="button" onClick={() => applyTemplate('fartlek')} style={templateBtn}>Fartlek</button>
        {phases.length > 0 && (
          <button type="button" onClick={() => onChange([])} style={{ ...templateBtn, color: '#FF5E5E' }}>Clear</button>
        )}
      </div>

      {/* Summary */}
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
        {phases.length === 0
          ? 'No phases — add one below, or pick a template.'
          : `${phases.length} phase${phases.length === 1 ? '' : 's'} · total ${formatSecs(totalSecs)}`}
      </div>

      {/* Phase rows */}
      {phases.map((p, idx) => {
        const intensity = INTENSITY_OPTIONS.find(i => i.value === p.intensity) || INTENSITY_OPTIONS[0];
        const draft = durationInputs[idx];
        const displayDuration = draft !== undefined ? draft : formatSecs(Number(p.duration_secs) || 0);
        return (
          <div key={idx} style={{
            display: 'grid',
            gridTemplateColumns: compact
              ? '24px 1fr 70px 90px 28px 28px 28px'
              : '28px 1.4fr 80px 110px 60px 1.2fr 30px 30px 30px',
            gap: 6, alignItems: 'center',
            padding: '8px 8px', borderRadius: 8,
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--divider)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              {idx + 1}
            </div>

            <input
              type="text"
              value={p.label || ''}
              onChange={e => updatePhase(idx, { label: e.target.value })}
              placeholder="Phase name"
              style={phaseInput}
            />

            <input
              type="text"
              value={displayDuration}
              onFocus={() => setDurationInputs(d => ({ ...d, [idx]: formatSecs(Number(p.duration_secs) || 0) }))}
              onChange={e => setDurationInputs(d => ({ ...d, [idx]: e.target.value }))}
              onBlur={e => {
                const secs = parseDuration(e.target.value);
                setDurationInputs(d => { const { [idx]: _, ...rest } = d; return rest; });
                updatePhase(idx, { duration_secs: secs });
              }}
              placeholder="3:00"
              style={phaseInput}
              title="Duration. Accepts mm:ss (e.g. 3:00), whole minutes (3m), or seconds (180)."
            />

            <select
              value={p.intensity || 'easy'}
              onChange={e => updatePhase(idx, { intensity: e.target.value })}
              style={{ ...phaseInput, color: intensity.color, fontWeight: 700 }}
            >
              {INTENSITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {!compact && (
              <select
                value={p.zone || ''}
                onChange={e => updatePhase(idx, { zone: e.target.value ? Number(e.target.value) : null })}
                style={phaseInput}
                title="Heart-rate zone (optional)"
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map(z => <option key={z} value={z}>Z{z}</option>)}
              </select>
            )}

            {!compact && (
              <input
                type="text"
                value={p.notes || ''}
                onChange={e => updatePhase(idx, { notes: e.target.value || null })}
                placeholder="Notes"
                style={phaseInput}
              />
            )}

            <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} style={iconBtn} title="Move up">↑</button>
            <button type="button" onClick={() => move(idx, 1)} disabled={idx === phases.length - 1} style={iconBtn} title="Move down">↓</button>
            <button type="button" onClick={() => removePhase(idx)} style={{ ...iconBtn, color: '#FF5E5E' }} title="Delete phase">✕</button>
          </div>
        );
      })}

      <button type="button" onClick={addPhase} style={{
        alignSelf: 'flex-start',
        background: 'rgba(255,140,0,0.1)', color: 'var(--accent)',
        border: '1px dashed var(--accent)', borderRadius: 8,
        padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
      }}>+ Add phase</button>
    </div>
  );
}

const templateBtn = {
  background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)',
  border: '1px solid var(--divider)', borderRadius: 14,
  padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const phaseInput = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--divider)',
  borderRadius: 6,
  padding: '5px 8px',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
  minWidth: 0,
};

const iconBtn = {
  background: 'none',
  border: 'none',
  color: 'var(--text-tertiary)',
  cursor: 'pointer',
  fontSize: 14,
  padding: 0,
  width: 24, height: 24,
  borderRadius: 6,
};
