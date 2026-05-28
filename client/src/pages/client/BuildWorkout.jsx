import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFavourites } from '../../context/FavouritesContext';

// UI prototype for the client "build your own workout" feature (phase 2).
// Block-based: each block has a format (straight set / superset / tri-set /
// AMRAP / Tabata...) and exercises auto-labelled by block letter + position
// (A1, B1, B2, C1, C2, C3). Exercise picker pulls the real library; Save is a
// front-end stub for now so the flow can be reviewed before the backend.

// Round-based formats run a fixed number of rounds across the WHOLE block, so
// per-exercise Sets is redundant - the block-level Rounds / Total time setting
// drives the count. For these, the exercise card hides the Sets input and we
// default sets=1 on save.
const ROUND_BASED = new Set(['AMRAP', 'Tabata', 'EMOM', 'Circuit']);

// Block formats + colours aligned with the coach WorkoutBuilder palette so the
// client builder reads the same (Warmup yellow, Superset blue, Triset green...).
const BLOCK_TYPES = [
  { label: 'Warmup', color: '#FFD60A' },
  { label: 'Straight Set', color: '#FF9C33' },
  { label: 'Superset', color: '#0A84FF' },
  { label: 'Tri-set', color: '#30D158' },
  { label: 'Giant Set', color: '#64D2FF' },
  { label: 'Circuit', color: '#FF9500' },
  { label: 'AMRAP', color: '#FF453A' },
  { label: 'Tabata', color: '#FF375F' },
  { label: 'EMOM', color: '#BF5AF2' },
  { label: 'For Time', color: '#5E5CE6' },
];
const blockColor = (type) => BLOCK_TYPES.find(b => b.label === type)?.color || '#FF9C33';

// Duration options for the time picker (renders as a native scroll wheel on mobile).
const TIME_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 45, 60, 75, 90, 120, 150, 180, 240, 300];
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const letter = (i) => String.fromCharCode(65 + i);

// Option sets for the per-block format settings.
const MIN_OPTS = [4, 5, 8, 10, 12, 15, 16, 20, 25, 30];
const REST_OPTS = ['0:15', '0:30', '0:45', '1:00', '1:30', '2:00', '3:00'];
const WORK_OPTS = [20, 30, 40, 45, 50, 60];
const TABATA_REST_OPTS = [10, 15, 20, 30];
const ROUNDS_OPTS = [2, 3, 4, 5, 6, 8, 10, 12];

let uid = 0;

export default function BuildWorkout() {
  const { token } = useAuth();
  const { refresh: refreshFavourites } = useFavourites();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState([]); // { key, type, exercises: [{...ex, sets, measure, reps, time, notes}] }
  const [picker, setPicker] = useState(null); // block index we're adding to, or null
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Editing an existing client-built workout: pull its blocks back into the
  // builder. Each block/exercise gets a fresh React key on load.
  useEffect(() => {
    if (!editId) return;
    fetch(`/api/my-workouts/${editId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setTitle(d.title || '');
        setBlocks((d.blocks || []).map(b => ({ key: ++uid, settings: {}, restAfter: '', ...b })));
      })
      .catch(() => {});
  }, [editId, token]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const payload = { title, blocks };
    try {
      const res = await fetch(editId ? `/api/my-workouts/${editId}` : '/api/my-workouts', {
        method: editId ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Could not save. Try again.');
        setSaving(false);
        return;
      }
      if (refreshFavourites) await refreshFavourites();
      setSaved(true);
    } catch (err) {
      setError('Network error.');
    }
    setSaving(false);
  };

  const makeEx = (ex) => ({ ...ex, sets: '3', measure: 'reps', reps: '10', time: 30, notes: '', adv: false, rpe: '', rir: '', tempo: '', restAfter: '' });
  const addBlock = () => setBlocks(prev => [...prev, { key: ++uid, type: 'Straight Set', settings: {}, restAfter: '', exercises: [] }]);
  const removeBlock = (bi) => setBlocks(prev => prev.filter((_, i) => i !== bi));
  const setType = (bi, type) => setBlocks(prev => prev.map((b, i) => {
    if (i !== bi) return b;
    // A straight set holds a single exercise - trim extras if switching to it.
    const exercises = type === 'Straight Set' ? b.exercises.slice(0, 1) : b.exercises;
    return { ...b, type, exercises };
  }));
  const setSetting = (bi, key, val) => setBlocks(prev => prev.map((b, i) => i === bi ? { ...b, settings: { ...b.settings, [key]: val } } : b));
  const setBlockRest = (bi, val) => setBlocks(prev => prev.map((b, i) => i === bi ? { ...b, restAfter: val } : b));
  const addExercises = (exs) => {
    setBlocks(prev => prev.map((b, i) => i === picker ? { ...b, exercises: [...b.exercises, ...exs.map(makeEx)] } : b));
    setPicker(null);
  };
  const swap = (arr, i, j) => { const n = [...arr]; [n[i], n[j]] = [n[j], n[i]]; return n; };
  const moveBlock = (bi, dir) => setBlocks(prev => {
    const j = bi + dir; if (j < 0 || j >= prev.length) return prev; return swap(prev, bi, j);
  });
  const moveEx = (bi, ei, dir) => setBlocks(prev => prev.map((b, i) => {
    if (i !== bi) return b;
    const j = ei + dir; if (j < 0 || j >= b.exercises.length) return b;
    return { ...b, exercises: swap(b.exercises, ei, j) };
  }));
  const updateEx = (bi, ei, patch) => setBlocks(prev => prev.map((b, i) => i !== bi ? b
    : { ...b, exercises: b.exercises.map((e, j) => j === ei ? { ...e, ...patch } : e) }));
  const removeEx = (bi, ei) => setBlocks(prev => prev.map((b, i) => i !== bi ? b
    : { ...b, exercises: b.exercises.filter((_, j) => j !== ei) }));

  const totalExercises = blocks.reduce((n, b) => n + b.exercises.length, 0);

  if (saved) {
    return (
      <div className="page-content" style={{ textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>💪</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Workout saved</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 24 }}>
          "{title || 'Untitled workout'}" - {blocks.length} block{blocks.length === 1 ? '' : 's'}, {totalExercises} exercise{totalExercises === 1 ? '' : 's'}.
          You'd find it in your Favourites to do or schedule any time.
        </p>
        <button className="btn-primary" onClick={() => { setSaved(false); setBlocks([]); setTitle(''); if (editId) navigate('/build-workout'); }} style={{ marginBottom: 10 }}>Build another</button>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>Done</button>
      </div>
    );
  }

  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => navigate(-1)} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>{editId ? 'Edit Workout' : 'Build a Workout'}</h1>
        <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 8, background: 'rgba(255,156,51,0.15)', color: 'var(--accent-orange)', letterSpacing: 0.5 }}>PRIME</span>
      </div>

      <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Workout name</label>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="e.g. My Morning Mobility"
        style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--divider)', borderRadius: 12, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 15, marginBottom: 22 }}
      />

      {blocks.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 28, marginBottom: 14 }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>No blocks yet</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Add a block, set its format, then add exercises.</p>
        </div>
      )}

      {blocks.map((block, bi) => (
        <div key={block.key}>
        <div className="card" style={{ marginBottom: 14, borderLeft: `4px solid ${blockColor(block.type)}`, paddingLeft: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>Block {letter(bi)}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => moveBlock(bi, -1)} disabled={bi === 0} style={{ ...moveBtn, opacity: bi === 0 ? 0.3 : 1 }}>▲</button>
              <button onClick={() => moveBlock(bi, 1)} disabled={bi === blocks.length - 1} style={{ ...moveBtn, opacity: bi === blocks.length - 1 ? 0.3 : 1 }}>▼</button>
              <button onClick={() => removeBlock(bi)} style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Remove block</button>
            </div>
          </div>

          {/* Block format */}
          <div className="hide-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 2 }}>
            {BLOCK_TYPES.map(({ label, color }) => {
              const active = block.type === label;
              return (
                <button key={label} onClick={() => setType(bi, label)} style={{
                  flexShrink: 0, padding: '6px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: active ? `2px solid ${color}` : '1px solid var(--divider)',
                  background: active ? `${color}22` : 'transparent',
                  color: active ? color : 'var(--text-secondary)',
                }}>{label}</button>
              );
            })}
          </div>

          {/* Format-specific settings */}
          <BlockSettings block={block} onChange={(k, v) => setSetting(bi, k, v)} />

          {block.exercises.map((ex, ei) => (
            <div key={`${ex.id}-${ei}`}>
            <div style={{ background: 'var(--bg-input)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: blockColor(block.type), minWidth: 26 }}>{letter(bi)}{ei + 1}</span>
                <div style={{ width: 38, height: 38, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-card-hover)' }}>
                  {ex.thumbnail_url && <img src={ex.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <p style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.name}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <button onClick={() => moveEx(bi, ei, -1)} disabled={ei === 0} style={{ ...moveBtn, opacity: ei === 0 ? 0.3 : 1 }}>▲</button>
                  <button onClick={() => moveEx(bi, ei, 1)} disabled={ei === block.exercises.length - 1} style={{ ...moveBtn, opacity: ei === block.exercises.length - 1 ? 0.3 : 1 }}>▼</button>
                </div>
                <button onClick={() => removeEx(bi, ei)} style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: 17, cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {['reps', 'time'].map(m => (
                  <button key={m} onClick={() => updateEx(bi, ei, { measure: m })} style={{
                    padding: '4px 11px', borderRadius: 12, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    border: ex.measure === m ? '2px solid var(--accent-mint)' : '1px solid var(--divider)',
                    background: ex.measure === m ? 'rgba(61,255,210,0.12)' : 'transparent',
                    color: ex.measure === m ? 'var(--accent-mint-ink)' : 'var(--text-secondary)',
                  }}>{m === 'reps' ? 'Reps' : 'Time'}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!ROUND_BASED.has(block.type) && (
                  <div style={{ flex: 1 }}>
                    <label style={miniLabel}>Sets</label>
                    <input type="number" inputMode="numeric" value={ex.sets} onChange={e => updateEx(bi, ei, { sets: e.target.value })} style={miniInput} />
                  </div>
                )}
                {ex.measure === 'time' ? (
                  <div style={{ flex: 1 }}>
                    <label style={miniLabel}>Time</label>
                    <select value={ex.time} onChange={e => updateEx(bi, ei, { time: Number(e.target.value) })} style={miniInput}>
                      {TIME_OPTIONS.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                    </select>
                  </div>
                ) : (
                  <div style={{ flex: 1 }}>
                    <label style={miniLabel}>Reps</label>
                    <input type="number" inputMode="numeric" value={ex.reps} onChange={e => updateEx(bi, ei, { reps: e.target.value })} style={miniInput} />
                  </div>
                )}
                <div style={{ flex: 2 }}>
                  <label style={miniLabel}>Notes</label>
                  <input value={ex.notes} onChange={e => updateEx(bi, ei, { notes: e.target.value })} placeholder="optional" style={miniInput} />
                </div>
              </div>

              {/* Advanced: RPE / RIR / tempo / rest - collapsed by default */}
              <button onClick={() => updateEx(bi, ei, { adv: !ex.adv })} style={{
                background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', marginTop: 8, padding: 0,
              }}>{ex.adv ? '▾' : '▸'} Advanced</button>
              {ex.adv && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={miniLabel}>RPE</label>
                    <select value={ex.rpe} onChange={e => updateEx(bi, ei, { rpe: e.target.value })} style={miniInput}>
                      <option value="">-</option>
                      {['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={miniLabel}>RIR</label>
                    <select value={ex.rir} onChange={e => updateEx(bi, ei, { rir: e.target.value })} style={miniInput}>
                      <option value="">-</option>
                      {['0', '1', '2', '3', '4', '5'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={miniLabel}>Tempo</label>
                    <input value={ex.tempo} onChange={e => updateEx(bi, ei, { tempo: e.target.value })} placeholder="3010" style={miniInput} />
                  </div>
                </div>
              )}
            </div>
            {ei < block.exercises.length - 1 && <RestControl mini value={ex.restAfter} onChange={(v) => updateEx(bi, ei, { restAfter: v })} />}
            </div>
          ))}

          {/* A straight set is a single exercise - hide "add" once it has one. */}
          {!(block.type === 'Straight Set' && block.exercises.length >= 1) && (
            <button onClick={() => setPicker(bi)} style={{
              width: '100%', padding: '10px 0', borderRadius: 10, marginTop: 2,
              border: '1.5px dashed var(--divider)', background: 'transparent',
              color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>+ Add exercise to Block {letter(bi)}</button>
          )}
        </div>
        {bi < blocks.length - 1 && <RestControl value={block.restAfter} onChange={(v) => setBlockRest(bi, v)} />}
        </div>
      ))}

      <button onClick={addBlock} style={{
        width: '100%', padding: '14px 0', borderRadius: 12, marginTop: 4,
        border: 'none', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
      }}>+ Add block</button>

      {error && (
        <p style={{ color: 'var(--error)', fontSize: 13, fontWeight: 600, textAlign: 'center', marginTop: 14 }}>{error}</p>
      )}

      <button className="btn-primary" onClick={handleSave} disabled={saving || !title.trim() || totalExercises === 0}
        style={{ marginTop: 18, opacity: (saving || !title.trim() || totalExercises === 0) ? 0.5 : 1 }}>
        {saving ? 'Saving...' : editId ? 'Save changes' : 'Save to Favourites'}
      </button>

      {picker !== null && (
        <ExercisePicker
          token={token}
          multi={blocks[picker]?.type !== 'Straight Set'}
          blockType={blocks[picker]?.type}
          onConfirm={addExercises}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// Rest inserter. Collapsed to a faint "+ Rest" until added; then a small
// duration select with an × to clear back to no rest. Used between blocks and
// between exercises inside a superset/tri-set.
function RestControl({ value, onChange, mini }) {
  const margin = mini ? '4px 0' : '2px 0 14px';
  if (!value) {
    return (
      <div style={{ textAlign: 'center', margin }}>
        <button onClick={() => onChange('1:00')} style={{
          background: 'none', border: '1px dashed var(--divider)', borderRadius: 16,
          color: 'var(--text-tertiary)', fontSize: mini ? 11 : 12, fontWeight: 700, cursor: 'pointer', padding: '4px 12px',
        }}>+ Rest</button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>⏱ Rest</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...miniInput, width: 'auto', padding: '5px 8px' }}>
        {REST_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <button onClick={() => onChange('')} aria-label="Remove rest" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 16, cursor: 'pointer' }}>×</button>
    </div>
  );
}

// Per-block format settings: rest between sets for set-based blocks, total
// time for AMRAP/EMOM, work/rest intervals + total for Tabata, rounds + rest
// for Circuit, a time cap for For Time.
function BlockSettings({ block, onChange }) {
  const s = block.settings || {};
  const Sel = ({ label, k, options, fmt }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label style={miniLabel}>{label}</label>
      <select value={s[k] ?? ''} onChange={e => onChange(k, e.target.value)} style={miniInput}>
        <option value="">-</option>
        {options.map(o => <option key={o} value={o}>{fmt ? fmt(o) : o}</option>)}
      </select>
    </div>
  );
  let fields = null;
  if (block.type === 'Circuit') {
    fields = <><Sel label="Rounds" k="rounds" options={ROUNDS_OPTS} /><Sel label="Rest / round" k="restBetweenRounds" options={REST_OPTS} /></>;
  } else if (block.type === 'AMRAP') {
    fields = <Sel label="Total time (min)" k="totalMin" options={MIN_OPTS} />;
  } else if (block.type === 'Tabata') {
    fields = <><Sel label="Work" k="work" options={WORK_OPTS} fmt={fmtTime} /><Sel label="Rest" k="rest" options={TABATA_REST_OPTS} fmt={fmtTime} /><Sel label="Total (min)" k="totalMin" options={MIN_OPTS} /></>;
  } else if (block.type === 'EMOM') {
    fields = <Sel label="Total time (min)" k="totalMin" options={MIN_OPTS} />;
  } else if (block.type === 'For Time') {
    fields = <Sel label="Time cap (min)" k="cap" options={MIN_OPTS} />;
  }
  if (!fields) return null;
  return <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>{fields}</div>;
}

// Block-format -> recommended exercise tag. Coach tags exercises in admin
// ("warm up", "conditioning", etc); the picker pins matching exercises to
// the top when this block format is selected. As Dan tags more exercises
// the recommendations grow without any code change. Tag falls back to a
// type (exercise_type) when the tag pool is too small / not yet seeded.
const BLOCK_RECOMMENDATIONS = {
  Warmup:   { tag: 'warm up',     fallbackType: 'Mobility' },
  // Future block types - leaving the map open so we just add a line:
  // Tabata:   { tag: 'conditioning', fallbackType: 'Bodyweight' },
  // 'For Time': { tag: 'conditioning', fallbackType: 'Bodyweight' },
  // AMRAP:    { tag: 'conditioning', fallbackType: 'Bodyweight' },
};

function ExercisePicker({ token, multi, blockType, onConfirm, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [recommended, setRecommended] = useState([]); // tag/type-matched picks pinned to top
  const [selected, setSelected] = useState([]); // ex objects (multi mode)

  const rec = BLOCK_RECOMMENDATIONS[blockType] || null;

  useEffect(() => {
    const t = setTimeout(() => {
      const params = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : '';
      fetch(`/api/explore/exercises${params}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : { exercises: [] })
        .then(d => setResults((d.exercises || []).slice(0, 40)))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, token]);

  // Load tag-matched recommendations first. If the coach hasn't tagged
  // enough exercises yet, top up from the fallback exercise_type so the
  // user still sees two recommendations. Runs once on open.
  useEffect(() => {
    if (!rec) return;
    const fetchJson = (qs) => fetch(`/api/explore/exercises?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.ok ? r.json() : { exercises: [] }).then(d => d.exercises || []);

    Promise.all([
      fetchJson(`tag=${encodeURIComponent(rec.tag)}&limit=2`),
      rec.fallbackType ? fetchJson(`type=${encodeURIComponent(rec.fallbackType)}&limit=4`) : Promise.resolve([]),
    ]).then(([tagged, fallback]) => {
      const seen = new Set(tagged.map(e => e.id));
      const padded = [...tagged];
      for (const e of fallback) {
        if (padded.length >= 2) break;
        if (seen.has(e.id)) continue;
        padded.push(e);
        seen.add(e.id);
      }
      setRecommended(padded);
    }).catch(() => setRecommended([]));
  }, [rec, token]);

  const isSel = (id) => selected.some(s => s.id === id);
  const tap = (ex) => {
    if (!multi) { onConfirm([ex]); return; } // straight set: add one + drop off
    setSelected(prev => isSel(ex.id) ? prev.filter(s => s.id !== ex.id) : [...prev, ex]);
  };
  // Selected pinned to the top, then recommendations (warmup blocks only,
  // and only when the user hasn't typed a search), then the unselected
  // search results. Recommendations are tagged so we can render a chip.
  const selIds = new Set(selected.map(s => s.id));
  const showRecs = recommended.length > 0 && !q.trim();
  const recIds = new Set(recommended.map(r => r.id));
  const taggedRecs = recommended.map(r => ({ ...r, _recommended: true }));
  const restResults = results.filter(r => !selIds.has(r.id) && !recIds.has(r.id));
  const list = multi
    ? [...selected, ...(showRecs ? taggedRecs.filter(r => !selIds.has(r.id)) : []), ...restResults]
    : (showRecs ? [...taggedRecs, ...restResults] : results);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)',
        borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '16px 16px calc(12px + env(safe-area-inset-bottom,0px))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ fontSize: 16, fontWeight: 800 }}>{multi ? 'Add exercises' : 'Add an exercise'}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Search the exercise library..."
          style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--divider)', borderRadius: 12, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 14, marginBottom: 12 }} />
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: 20 }}>{q.trim() ? 'No exercises found' : 'Start typing to search'}</p>
          ) : list.map(ex => {
            const sel = isSel(ex.id);
            return (
              <button key={ex.id} onClick={() => tap(ex)} className="card-sm" style={{
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer',
                background: sel ? 'rgba(61,255,210,0.10)' : 'var(--bg-card)', color: 'var(--text-primary)',
                border: sel ? '2px solid var(--accent-mint)' : '2px solid transparent',
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-card-hover)' }}>
                  {ex.thumbnail_url && <img src={ex.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.name}</p>
                    {ex._recommended && (
                      <span style={{
                        flexShrink: 0, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6,
                        background: 'rgba(61,255,210,0.15)', color: 'var(--accent-mint-ink, #0E8A4F)',
                        letterSpacing: 0.4, textTransform: 'uppercase',
                      }}>Recommended</span>
                    )}
                  </div>
                  {ex.body_part && <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ex.body_part}</p>}
                </div>
                {sel
                  ? <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-mint)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>✓</span>
                  : <span style={{ color: 'var(--accent)', fontSize: 22, fontWeight: 700 }}>+</span>}
              </button>
            );
          })}
        </div>
        {multi && selected.length > 0 && (
          <button className="btn-primary" onClick={() => onConfirm(selected)} style={{ marginTop: 12 }}>
            Add {selected.length} exercise{selected.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </div>
  );
}

const moveBtn = { background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 11, cursor: 'pointer', lineHeight: 1, padding: '2px 4px' };
const miniLabel = { fontSize: 10, color: 'var(--text-tertiary)', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 };
const miniInput = { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 9px', color: 'var(--text-primary)', fontSize: 13 };
