import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function ProgramBuilder() {
  const { token } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [addingExercise, setAddingExercise] = useState(false);
  const [exerciseForm, setExerciseForm] = useState({ sets: 3, reps: '10', group_type: '', rest_secs: 30 });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    const headers = { Authorization: `Bearer ${token}` };
    const [p, w, e] = await Promise.all([
      fetch('/api/content/programs', { headers }).then(r => r.json()),
      fetch('/api/content/workouts', { headers }).then(r => r.json()),
      fetch('/api/content/exercises', { headers }).then(r => r.json()),
    ]);
    setPrograms(p.programs || []);
    setWorkouts(w.workouts || []);
    setExercises(e.exercises || []);
  };

  const saveProgram = async () => {
    const method = editing === 'new' ? 'POST' : 'PUT';
    const url = editing === 'new' ? '/api/content/programs' : `/api/content/programs/${form.id}`;
    await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setEditing(null); setForm({}); fetchAll();
  };

  const saveWorkout = async () => {
    const body = { ...form, program_id: selectedProgram?.id };
    const method = editing === 'new-workout' ? 'POST' : 'PUT';
    const url = method === 'POST' ? '/api/content/workouts' : `/api/content/workouts/${form.id}`;
    await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setEditing(null); setForm({}); fetchAll();
  };

  const addExerciseToWorkout = async (exercise) => {
    const workoutExercises = await fetch(`/api/explore/workouts/${selectedWorkout.id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    const orderIndex = (workoutExercises.exercises?.length || 0);

    await fetch(`/api/content/workouts/${selectedWorkout.id}/exercises`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exercise_id: exercise.id,
        order_index: orderIndex,
        sets: exerciseForm.sets,
        reps: exerciseForm.reps,
        rest_secs: exerciseForm.rest_secs,
        group_type: exerciseForm.group_type || null,
      }),
    });
    setAddingExercise(false);
    setExerciseForm({ sets: 3, reps: '10', group_type: '', rest_secs: 30 });
    // Refresh workout detail
    const updated = await fetch(`/api/explore/workouts/${selectedWorkout.id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    setSelectedWorkout({ ...selectedWorkout, exercises: updated.exercises });
  };

  const deleteWorkoutExercise = async (weId) => {
    await fetch(`/api/content/workout-exercises/${weId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    const updated = await fetch(`/api/explore/workouts/${selectedWorkout.id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    setSelectedWorkout({ ...selectedWorkout, exercises: updated.exercises });
  };

  // ===== WORKOUT DETAIL (exercise list editor) =====
  if (selectedWorkout) {
    const filteredExercises = exercises.filter(e => !exerciseSearch || e.name.toLowerCase().includes(exerciseSearch.toLowerCase()));

    return (
      <div style={{ padding: '24px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setSelectedWorkout(null)} style={{ background: 'var(--bg-card)', border: 'none', borderRadius: 8, padding: '8px 16px', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>← Back to Program</button>
          <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>{selectedWorkout.title}</h2>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Week {selectedWorkout.week_number} · Day {selectedWorkout.day_number}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>
          {/* Exercise list */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Exercises ({selectedWorkout.exercises?.length || 0})</h3>
              <button onClick={() => setAddingExercise(true)} style={{
                background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
                padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>+ Add Exercise</button>
            </div>

            {(selectedWorkout.exercises || []).map((ex, i) => (
              <div key={ex.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                background: 'var(--bg-card)', borderRadius: 10, marginBottom: 4,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)', width: 24 }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{ex.name}</p>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ex.sets} sets × {ex.reps}</span>
                    {ex.group_type && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 6, background: 'rgba(255,149,0,0.2)', color: 'var(--accent-orange)', textTransform: 'uppercase' }}>
                        {ex.group_type}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Rest: {ex.rest_secs || 30}s</span>
                  </div>
                </div>
                <button onClick={() => deleteWorkoutExercise(ex.id)} style={{
                  background: 'rgba(255,69,58,0.1)', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))}

            {(!selectedWorkout.exercises || selectedWorkout.exercises.length === 0) && (
              <div style={{ textAlign: 'center', padding: 32, background: 'var(--bg-card)', borderRadius: 12 }}>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>No exercises added yet</p>
                <button onClick={() => setAddingExercise(true)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>+ Add your first exercise</button>
              </div>
            )}
          </div>

          {/* Add exercise panel */}
          {addingExercise && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, height: 'fit-content', position: 'sticky', top: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>Add Exercise</h3>
                <button onClick={() => setAddingExercise(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>✕</button>
              </div>

              {/* Exercise config */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Sets</label>
                  <input type="number" className="input-field" value={exerciseForm.sets} onChange={e => setExerciseForm({ ...exerciseForm, sets: parseInt(e.target.value) })} style={{ fontSize: 14 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Reps / Duration</label>
                  <input className="input-field" value={exerciseForm.reps} onChange={e => setExerciseForm({ ...exerciseForm, reps: e.target.value })} placeholder="10 or 30s or 10/side" style={{ fontSize: 14 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Rest (secs)</label>
                  <input type="number" className="input-field" value={exerciseForm.rest_secs} onChange={e => setExerciseForm({ ...exerciseForm, rest_secs: parseInt(e.target.value) })} style={{ fontSize: 14 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Grouping</label>
                  <select className="input-field" value={exerciseForm.group_type} onChange={e => setExerciseForm({ ...exerciseForm, group_type: e.target.value })} style={{ fontSize: 14 }}>
                    <option value="">Standalone</option>
                    <option value="superset">Superset</option>
                    <option value="triset">Triset</option>
                    <option value="giant_set">Giant Set</option>
                    <option value="warmup">Warmup</option>
                    <option value="cooldown">Cooldown</option>
                  </select>
                </div>
              </div>

              {/* Search exercises */}
              <input
                value={exerciseSearch} onChange={e => setExerciseSearch(e.target.value)}
                placeholder="Search exercises..." className="input-field"
                style={{ marginBottom: 8, fontSize: 13 }}
              />

              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                {filteredExercises.slice(0, 30).map(ex => (
                  <div key={ex.id} onClick={() => addExerciseToWorkout(ex)} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(61,255,210,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontSize: 14, opacity: 0.3 }}>💪</span>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500 }}>{ex.name}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{ex.body_part || 'No body part'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== PROGRAM DETAIL (workout list) =====
  if (selectedProgram) {
    const programWorkouts = workouts.filter(w => w.program_id === selectedProgram.id).sort((a, b) => (a.week_number * 10 + a.day_number) - (b.week_number * 10 + b.day_number));

    if (editing === 'new-workout' || (editing && editing !== 'new')) {
      return (
        <div style={{ padding: '24px 40px', maxWidth: 900 }}>
          <button onClick={() => { setEditing(null); setForm({}); }} style={{ background: 'var(--bg-card)', border: 'none', borderRadius: 8, padding: '8px 16px', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', marginBottom: 16 }}>← Back</button>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>{editing === 'new-workout' ? 'New Workout' : 'Edit Workout'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Title</label><input className="input-field" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <div><label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Week</label><input type="number" className="input-field" value={form.week_number || ''} onChange={e => setForm({ ...form, week_number: parseInt(e.target.value) })} /></div>
            <div><label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Day</label><input type="number" className="input-field" value={form.day_number || ''} onChange={e => setForm({ ...form, day_number: parseInt(e.target.value) })} /></div>
            <div><label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Duration (mins)</label><input type="number" className="input-field" value={form.duration_mins || ''} onChange={e => setForm({ ...form, duration_mins: parseInt(e.target.value) })} /></div>
            <div><label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Intensity</label>
              <select className="input-field" value={form.intensity || 'Medium'} onChange={e => setForm({ ...form, intensity: e.target.value })}>
                {['Low', 'Medium', 'High'].map(i => <option key={i}>{i}</option>)}
              </select>
            </div>
            <div><label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Body Parts</label><input className="input-field" value={form.body_parts || ''} onChange={e => setForm({ ...form, body_parts: e.target.value })} /></div>
            <div><label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Type</label>
              <select className="input-field" value={form.workout_type || 'strength'} onChange={e => setForm({ ...form, workout_type: e.target.value })}>
                {['strength', 'mobility', 'cardio', 'flexibility', 'rehab'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Equipment</label><input className="input-field" value={form.equipment || ''} onChange={e => setForm({ ...form, equipment: e.target.value })} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Description</label><textarea className="input-field" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} style={{ minHeight: 60 }} /></div>
          </div>
          <button onClick={saveWorkout} style={{ marginTop: 16, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Save Workout</button>
        </div>
      );
    }

    return (
      <div style={{ padding: '24px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setSelectedProgram(null)} style={{ background: 'var(--bg-card)', border: 'none', borderRadius: 8, padding: '8px 16px', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>← All Programs</button>
          <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>{selectedProgram.title}</h2>
          <button onClick={() => { setEditing('new-workout'); setForm({ week_number: 1, day_number: programWorkouts.length + 1 }); }} style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>+ Add Workout</button>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
          {selectedProgram.duration_weeks} weeks · {selectedProgram.workouts_per_week} workouts/week · {programWorkouts.length} workouts created
        </p>

        {programWorkouts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, background: 'var(--bg-card)', borderRadius: 12 }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>No workouts yet</p>
            <button onClick={() => { setEditing('new-workout'); setForm({ week_number: 1, day_number: 1 }); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>+ Create first workout</button>
          </div>
        ) : (
          programWorkouts.map(w => (
            <div key={w.id} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px',
              background: 'var(--bg-card)', borderRadius: 10, marginBottom: 4, cursor: 'pointer',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
            >
              <div style={{ textAlign: 'center', minWidth: 50 }}>
                <p style={{ fontSize: 10, color: 'var(--accent-orange)', fontWeight: 700 }}>WEEK {w.week_number}</p>
                <p style={{ fontSize: 18, fontWeight: 800 }}>D{w.day_number}</p>
              </div>
              <div style={{ flex: 1 }} onClick={async () => {
                const detail = await fetch(`/api/explore/workouts/${w.id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
                setSelectedWorkout({ ...w, exercises: detail.exercises });
              }}>
                <p style={{ fontSize: 15, fontWeight: 600 }}>{w.title}</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {w.duration_mins} mins · {w.intensity} · {w.body_parts || w.workout_type}
                </p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setEditing(w.id); setForm(w); }} style={{
                background: 'rgba(61,255,210,0.1)', border: 'none', borderRadius: 6, padding: 8, cursor: 'pointer',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
          ))
        )}
      </div>
    );
  }

  // ===== PROGRAM LIST =====
  if (editing === 'new') {
    return (
      <div style={{ padding: '24px 40px', maxWidth: 700 }}>
        <button onClick={() => { setEditing(null); setForm({}); }} style={{ background: 'var(--bg-card)', border: 'none', borderRadius: 8, padding: '8px 16px', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', marginBottom: 16 }}>← Back</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>New Program</h2>
        <div className="input-group"><label>Title</label><input className="input-field" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. AMS Ground Zero" /></div>
        <div className="input-group"><label>Description</label><textarea className="input-field" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} style={{ minHeight: 80 }} /></div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="input-group" style={{ flex: 1 }}><label>Weeks</label><input type="number" className="input-field" value={form.duration_weeks || ''} onChange={e => setForm({ ...form, duration_weeks: parseInt(e.target.value) })} /></div>
          <div className="input-group" style={{ flex: 1 }}><label>Workouts/Week</label><input type="number" className="input-field" value={form.workouts_per_week || ''} onChange={e => setForm({ ...form, workouts_per_week: parseInt(e.target.value) })} /></div>
        </div>
        <button onClick={saveProgram} style={{ marginTop: 8, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Create Program</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Programs</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{programs.length} programs</p>
        </div>
        <button onClick={() => { setEditing('new'); setForm({}); }} style={{
          background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
          padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}>+ New Program</button>
      </div>

      {programs.map(p => {
        const pWorkouts = workouts.filter(w => w.program_id === p.id);
        return (
          <div key={p.id} onClick={() => setSelectedProgram(p)} style={{
            display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
            background: 'var(--bg-card)', borderRadius: 12, marginBottom: 8, cursor: 'pointer',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
          >
            <div style={{ width: 56, height: 56, borderRadius: 12, background: 'linear-gradient(135deg, #1E1A2E, #2D2640)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 24 }}>📚</span>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 17, fontWeight: 700 }}>{p.title}</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{p.duration_weeks} weeks · {p.workouts_per_week} workouts/wk · {pWorkouts.length} workouts built</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        );
      })}
    </div>
  );
}
