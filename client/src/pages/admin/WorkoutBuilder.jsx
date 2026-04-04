import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

const BLOCK_TYPES = [
  { id: 'standard', label: 'Standard', desc: 'One or more sets with rest', icon: '📋' },
  { id: 'superset', label: 'Superset', desc: 'Add 2 exercises in sequential order', icon: '🔄' },
  { id: 'circuit', label: 'Circuit', desc: 'Run multiple exercises in order without rest', icon: '⚡' },
  { id: 'emom', label: 'EMOM', desc: 'Timed work and rest intervals', icon: '⏱️' },
  { id: 'tabata', label: 'Tabata', desc: 'High-intensity exercise intervals', icon: '🔥' },
  { id: 'notes', label: 'Notes', desc: 'Add coaching notes without exercises', icon: '📝' },
];

export default function WorkoutBuilder() {
  const { token } = useAuth();
  const [workouts, setWorkouts] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [workoutForm, setWorkoutForm] = useState({ title: '', description: '', tags: '', program_id: '', week_number: 1, day_number: 1, duration_mins: 30, intensity: 'Medium', body_parts: '', workout_type: 'strength' });
  const [blocks, setBlocks] = useState([]);
  const [creating, setCreating] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [addingToBlock, setAddingToBlock] = useState(null);
  const [inspectorExercise, setInspectorExercise] = useState(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    const h = { Authorization: `Bearer ${token}` };
    const [w, p, e] = await Promise.all([
      fetch('/api/content/workouts', { headers: h }).then(r => r.json()),
      fetch('/api/content/programs', { headers: h }).then(r => r.json()),
      fetch('/api/content/exercises', { headers: h }).then(r => r.json()),
    ]);
    setWorkouts(w.workouts || []);
    setPrograms(p.programs || []);
    setExercises(e.exercises || []);
  };

  const loadWorkout = async (workout) => {
    setSelectedWorkout(workout);
    setWorkoutForm({ title: workout.title, description: workout.description || '', tags: workout.body_parts || '', program_id: workout.program_id || '', week_number: workout.week_number, day_number: workout.day_number, duration_mins: workout.duration_mins, intensity: workout.intensity, body_parts: workout.body_parts || '', workout_type: workout.workout_type });

    const res = await fetch(`/api/explore/workouts/${workout.id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      // Convert exercises to blocks
      const exBlocks = [];
      let currentBlock = null;
      (data.exercises || []).forEach(ex => {
        if (ex.group_type && currentBlock?.type === ex.group_type) {
          currentBlock.exercises.push(ex);
        } else {
          if (currentBlock) exBlocks.push(currentBlock);
          currentBlock = { id: Date.now() + Math.random(), type: ex.group_type || 'standard', exercises: [ex], sets: ex.sets || 3, rest: ex.rest_secs || 30 };
        }
      });
      if (currentBlock) exBlocks.push(currentBlock);
      setBlocks(exBlocks);
    }
    setCreating(true);
  };

  const saveWorkout = async () => {
    const method = selectedWorkout ? 'PUT' : 'POST';
    const url = selectedWorkout ? `/api/content/workouts/${selectedWorkout.id}` : '/api/content/workouts';
    const res = await fetch(url, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(workoutForm),
    });
    const data = await res.json();
    const workoutId = selectedWorkout?.id || data.workout?.id;

    // Save exercise blocks
    if (workoutId) {
      // Delete existing exercises
      const existing = await fetch(`/api/explore/workouts/${workoutId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      for (const ex of (existing.exercises || [])) {
        await fetch(`/api/content/workout-exercises/${ex.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      }
      // Add new ones from blocks
      let order = 0;
      for (const block of blocks) {
        for (const ex of block.exercises) {
          await fetch(`/api/content/workouts/${workoutId}/exercises`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ exercise_id: ex.exercise_id || ex.id, order_index: order, sets: block.sets || ex.sets || 3, reps: ex.reps || '10', rest_secs: block.rest || 30, group_type: block.type === 'standard' ? null : block.type, tempo: ex.tempo, rir: ex.rir ? parseInt(ex.rir) : null, rpe: ex.rpe ? parseInt(ex.rpe) : null, per_side: ex.per_side, modality: ex.modality, training_type: ex.training_type, time_based: !!ex.duration }),
          });
          order++;
        }
      }
    }
    setCreating(false); setSelectedWorkout(null); setBlocks([]); fetchAll();
  };

  const addBlock = (type) => {
    setBlocks([...blocks, { id: Date.now(), type, exercises: [], sets: type === 'tabata' ? 8 : 3, rest: 30, duration: type === 'emom' ? 60 : null, note: '' }]);
  };

  const addExerciseToBlock = (blockId, exercise) => {
    setBlocks(blocks.map(b => b.id === blockId ? { ...b, exercises: [...b.exercises, { ...exercise, exercise_id: exercise.id, reps: '10', sets: 3 }] } : b));
    setAddingToBlock(null);
    setExerciseSearch('');
  };

  const removeExerciseFromBlock = (blockId, exIdx) => {
    setBlocks(blocks.map(b => b.id === blockId ? { ...b, exercises: b.exercises.filter((_, i) => i !== exIdx) } : b));
  };

  const removeBlock = (blockId) => {
    setBlocks(blocks.filter(b => b.id !== blockId));
  };

  const updateBlockExercise = (blockId, exIdx, field, value) => {
    setBlocks(blocks.map(b => b.id === blockId ? { ...b, exercises: b.exercises.map((ex, i) => i === exIdx ? { ...ex, [field]: value } : ex) } : b));
  };

  const updateBlock = (blockId, field, value) => {
    setBlocks(blocks.map(b => b.id === blockId ? { ...b, [field]: value } : b));
  };

  const filteredExercises = exercises.filter(e => !exerciseSearch || e.name.toLowerCase().includes(exerciseSearch.toLowerCase()));

  // ===== WORKOUT BUILDER =====
  if (creating) {
    return (
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {/* Left: Block types */}
        <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--divider)', padding: 16, overflow: 'auto' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: 0.5 }}>COMMON BLOCKS</h3>
          {BLOCK_TYPES.map(bt => (
            <button key={bt.id} onClick={() => addBlock(bt.id)} style={{
              width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: 'none',
              background: 'var(--bg-card)', cursor: 'pointer', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>{bt.icon}</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{bt.label}</p>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{bt.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Center: Workout form + blocks */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 32px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, background: 'var(--success)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>Draft</span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>W{workoutForm.week_number} · D{workoutForm.day_number}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setCreating(false); setSelectedWorkout(null); setBlocks([]); }} style={{ background: 'var(--bg-card)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>Back to workouts</button>
              <button onClick={saveWorkout} style={{ background: 'var(--bg-card)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>Save draft</button>
              <button onClick={saveWorkout} style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>Publish</button>
            </div>
          </div>

          {/* Workout details card */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.5 }}>WORKOUT BUILDER</h3>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer' }}>Collapse</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Workout name</label>
                <input className="input-field" value={workoutForm.title} onChange={e => setWorkoutForm({ ...workoutForm, title: e.target.value })} placeholder="Untitled workout" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tags</label>
                <input className="input-field" value={workoutForm.body_parts} onChange={e => setWorkoutForm({ ...workoutForm, body_parts: e.target.value })} placeholder="e.g. upper, strength" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Description</label>
                <textarea className="input-field" value={workoutForm.description} onChange={e => setWorkoutForm({ ...workoutForm, description: e.target.value })} placeholder="Add a short description" style={{ minHeight: 60, resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Program</label>
                <select className="input-field" value={workoutForm.program_id} onChange={e => setWorkoutForm({ ...workoutForm, program_id: parseInt(e.target.value) || '' })}>
                  <option value="">None</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Week</label><input type="number" className="input-field" value={workoutForm.week_number} onChange={e => setWorkoutForm({ ...workoutForm, week_number: parseInt(e.target.value) })} /></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Day</label><input type="number" className="input-field" value={workoutForm.day_number} onChange={e => setWorkoutForm({ ...workoutForm, day_number: parseInt(e.target.value) })} /></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Mins</label><input type="number" className="input-field" value={workoutForm.duration_mins} onChange={e => setWorkoutForm({ ...workoutForm, duration_mins: parseInt(e.target.value) })} /></div>
              </div>
            </div>
          </div>

          {/* Blocks */}
          {blocks.map((block, bi) => (
            <div key={block.id} style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, marginBottom: 12, borderLeft: `4px solid ${block.type === 'superset' ? '#0A84FF' : block.type === 'circuit' ? '#FF9500' : block.type === 'emom' ? '#BF5AF2' : block.type === 'tabata' ? '#FF453A' : 'var(--accent)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>Block {bi + 1}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,140,0,0.1)', color: 'var(--accent)', textTransform: 'uppercase' }}>{block.type}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Sets</label>
                    <input type="number" value={block.sets} onChange={e => updateBlock(block.id, 'sets', parseInt(e.target.value))} style={{ width: 40, background: 'var(--bg-primary)', border: '1px solid var(--divider)', borderRadius: 6, padding: '4px 6px', color: 'var(--text-primary)', fontSize: 13, textAlign: 'center' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Rest</label>
                    <input type="number" value={block.rest} onChange={e => updateBlock(block.id, 'rest', parseInt(e.target.value))} style={{ width: 40, background: 'var(--bg-primary)', border: '1px solid var(--divider)', borderRadius: 6, padding: '4px 6px', color: 'var(--text-primary)', fontSize: 13, textAlign: 'center' }} />
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>s</span>
                  </div>
                  <button onClick={() => removeBlock(block.id)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
              </div>

              {/* Block exercises */}
              {block.exercises.map((ex, ei) => (
                <div key={ei} style={{ padding: '8px 0', borderTop: ei > 0 ? '1px solid var(--divider)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', width: 20 }}>{ei + 1}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600 }}>{ex.name}</p>
                      {ex.per_side && <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>PER SIDE</span>}
                    </div>
                    <button onClick={() => setInspectorExercise(ex)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </button>
                    <button onClick={() => removeExerciseFromBlock(block.id, ei)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: 14 }}>×</button>
                  </div>
                  {/* Exercise detail row */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, marginLeft: 28, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 28 }}>Reps</label>
                      <input value={ex.reps || ''} onChange={e => updateBlockExercise(block.id, ei, 'reps', e.target.value)} placeholder="10" style={{ width: 50, background: 'var(--bg-primary)', border: '1px solid var(--divider)', borderRadius: 4, padding: '3px 4px', color: 'var(--text-primary)', fontSize: 11, textAlign: 'center' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 36 }}>Tempo</label>
                      <input value={ex.tempo || ''} onChange={e => updateBlockExercise(block.id, ei, 'tempo', e.target.value)} placeholder="3-1-2-1" style={{ width: 58, background: 'var(--bg-primary)', border: '1px solid var(--divider)', borderRadius: 4, padding: '3px 4px', color: 'var(--text-primary)', fontSize: 11, textAlign: 'center' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 20 }}>RIR</label>
                      <input type="number" value={ex.rir || ''} onChange={e => updateBlockExercise(block.id, ei, 'rir', e.target.value)} placeholder="-" style={{ width: 32, background: 'var(--bg-primary)', border: '1px solid var(--divider)', borderRadius: 4, padding: '3px 4px', color: 'var(--text-primary)', fontSize: 11, textAlign: 'center' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 22 }}>RPE</label>
                      <input type="number" value={ex.rpe || ''} onChange={e => updateBlockExercise(block.id, ei, 'rpe', e.target.value)} placeholder="-" style={{ width: 32, background: 'var(--bg-primary)', border: '1px solid var(--divider)', borderRadius: 4, padding: '3px 4px', color: 'var(--text-primary)', fontSize: 11, textAlign: 'center' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 28 }}>Time</label>
                      <input value={ex.duration || ''} onChange={e => updateBlockExercise(block.id, ei, 'duration', e.target.value)} placeholder="0:45" style={{ width: 42, background: 'var(--bg-primary)', border: '1px solid var(--divider)', borderRadius: 4, padding: '3px 4px', color: 'var(--text-primary)', fontSize: 11, textAlign: 'center' }} />
                    </div>
                    <button onClick={() => updateBlockExercise(block.id, ei, 'per_side', !ex.per_side)} style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, border: 'none', cursor: 'pointer',
                      background: ex.per_side ? 'rgba(255,140,0,0.2)' : 'var(--bg-primary)', color: ex.per_side ? 'var(--accent)' : 'var(--text-tertiary)',
                    }}>
                      /side
                    </button>
                    <select value={ex.modality || ''} onChange={e => updateBlockExercise(block.id, ei, 'modality', e.target.value)} style={{ fontSize: 10, background: 'var(--bg-primary)', border: '1px solid var(--divider)', borderRadius: 4, padding: '2px 4px', color: 'var(--text-primary)' }}>
                      <option value="">Modality</option>
                      {['Barbell', 'Dumbbell', 'Cable', 'Bodyweight', 'TRX', 'Kettlebell', 'Band', 'Machine', 'Rings', 'Other'].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              ))}

              {/* Add exercise to block */}
              {addingToBlock === block.id ? (
                <div style={{ marginTop: 8 }}>
                  <input value={exerciseSearch} onChange={e => setExerciseSearch(e.target.value)} placeholder="Search exercises..." className="input-field" style={{ fontSize: 13, marginBottom: 4 }} autoFocus />
                  <div style={{ maxHeight: 200, overflow: 'auto', background: 'var(--bg-primary)', borderRadius: 8, padding: 4 }}>
                    {filteredExercises.slice(0, 20).map(ex => (
                      <div key={ex.id} onClick={() => addExerciseToBlock(block.id, ex)} style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,140,0,0.08)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ fontSize: 12, opacity: 0.3 }}>💪</span>
                        <span>{ex.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <button onClick={() => { setAddingToBlock(block.id); setExerciseSearch(''); }} style={{ marginTop: 8, background: 'none', border: '1px dashed var(--divider)', borderRadius: 8, padding: '8px 0', width: '100%', color: 'var(--text-tertiary)', fontSize: 13, cursor: 'pointer' }}>
                  + Add exercise to this block
                </button>
              )}

              {block.type === 'notes' && (
                <textarea value={block.note || ''} onChange={e => updateBlock(block.id, 'note', e.target.value)} placeholder="Add coaching notes..." className="input-field" style={{ marginTop: 8, minHeight: 60, fontSize: 13 }} />
              )}
            </div>
          ))}

          {/* Add block prompt */}
          {blocks.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, background: 'var(--bg-card)', borderRadius: 12 }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>No blocks added yet</p>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Click a block type from the left sidebar to start building</p>
            </div>
          )}
        </div>

        {/* Right: Inspector */}
        <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--divider)', padding: 16, overflow: 'auto' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: 0.5 }}>INSPECTOR</h3>
          {inspectorExercise ? (
            <div>
              <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{inspectorExercise.name}</h4>
              {inspectorExercise.body_part && <p style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 8 }}>{inspectorExercise.body_part}</p>}
              {inspectorExercise.description && <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>{inspectorExercise.description?.substring(0, 200)}</p>}
              {inspectorExercise.demo_video_url && (
                <a href={inspectorExercise.demo_video_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>Watch demo video →</a>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Select a block or exercise to edit details.</p>
          )}
        </div>
      </div>
    );
  }

  // ===== WORKOUT LIST =====
  return (
    <div style={{ padding: '24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Workouts</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{workouts.length} workouts</p>
        </div>
        <button onClick={() => { setCreating(true); setSelectedWorkout(null); setBlocks([]); setWorkoutForm({ title: '', description: '', tags: '', program_id: '', week_number: 1, day_number: 1, duration_mins: 30, intensity: 'Medium', body_parts: '', workout_type: 'strength' }); }} style={{
          background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}>+ New Workout</button>
      </div>

      {/* Workout table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 100px 100px 80px', padding: '10px 16px', borderBottom: '1px solid var(--divider)', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
          <span>Workout</span><span>Program</span><span>Week/Day</span><span>Duration</span><span>Type</span>
        </div>
        {workouts.slice(0, 50).map(w => (
          <div key={w.id} onClick={() => loadWorkout(w)} style={{
            display: 'grid', gridTemplateColumns: '1fr 160px 100px 100px 80px', padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', alignItems: 'center',
          }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,140,0,0.04)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{w.title}</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{w.program_title || '—'}</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>W{w.week_number} D{w.day_number}</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{w.duration_mins || '?'} min</p>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,140,0,0.1)', color: 'var(--accent)', textTransform: 'capitalize' }}>{w.workout_type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
