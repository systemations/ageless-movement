import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../components/ImageUpload';

// Program preset blocks - clicking one of these pre-fills duration_weeks.
// These are the common training cycle lengths we design programs around and
// will later drive coach-side triggers (e.g. "client finished a 4 week block").
const DURATION_PRESETS = [2, 4, 6, 8, 12];

// Day column header labels. The scheduler grid has a toggle so the coach can
// pick between abstract day numbers (useful when the program isn't tied to a
// specific weekday rhythm) and Mon-Sun labels (which mirror how clients see
// their own week). Preference is persisted in localStorage.
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function ProgramBuilder({ onEditWorkout }) {
  const { token } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name_asc'); // name_asc | name_desc | duration | workouts | recent
  const [groupBySeries, setGroupBySeries] = useState(true);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [addingExercise, setAddingExercise] = useState(false);
  const [exerciseForm, setExerciseForm] = useState({ sets: 3, reps: '10', group_type: '', rest_secs: 30 });
  // Program Builder scheduler state - the drag/drop calendar + search picker
  const [dragWorkoutId, setDragWorkoutId] = useState(null);
  const [librarySearch, setLibrarySearch] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [pendingSlot, setPendingSlot] = useState(null); // { week, day } when user clicks an empty cell
  // Persist the day-label toggle so coaches don't have to re-flip it each visit
  const [useWeekdayLabels, setUseWeekdayLabels] = useState(() => {
    try { return localStorage.getItem('am_program_weekday_labels') === '1'; } catch { return false; }
  });

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

  // Scheduler helpers - move a workout to a new (week, day) cell via the
  // lightweight PATCH /slot endpoint, and clone a library workout into the
  // current program at a specific slot.
  const moveWorkoutToSlot = async (workoutId, week, day) => {
    await fetch(`/api/content/workouts/${workoutId}/slot`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_number: week, day_number: day, program_id: selectedProgram?.id }),
    });
    fetchAll();
  };

  const cloneWorkoutIntoSlot = async (sourceWorkoutId, week, day) => {
    await fetch(`/api/content/programs/${selectedProgram.id}/workouts/clone`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_workout_id: sourceWorkoutId, week_number: week, day_number: day }),
    });
    setPendingSlot(null);
    setLibrarySearch('');
    setShowLibrary(false);
    fetchAll();
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
  // When editing the program's own metadata, skip this block and fall through
  // to the shared program form at the bottom of the component.
  if (selectedProgram && editing !== 'edit-program') {
    const programWorkouts = workouts.filter(w => w.program_id === selectedProgram.id).sort((a, b) => (a.week_number * 10 + a.day_number) - (b.week_number * 10 + b.day_number));

    if (editing === 'new-workout' || (typeof editing === 'number')) {
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

    // Build a (week, day) grid of the program's workouts.
    // Weeks = duration_weeks (fallback: max week in workouts, or 4).
    // Days per week = 7 so the coach can slot rest days anywhere.
    const totalWeeks = Math.max(
      selectedProgram.duration_weeks || 0,
      ...programWorkouts.map(w => w.week_number || 1),
      1,
    );
    const DAYS = [1, 2, 3, 4, 5, 6, 7];
    const cellKey = (w, d) => `${w}-${d}`;
    const workoutsBySlot = {};
    programWorkouts.forEach(w => {
      const key = cellKey(w.week_number || 1, w.day_number || 1);
      (workoutsBySlot[key] = workoutsBySlot[key] || []).push(w);
    });

    // Library = all workouts NOT yet in this program, filtered by search.
    const libraryFiltered = workouts
      .filter(w => w.program_id !== selectedProgram.id)
      .filter(w => !librarySearch || (w.title || '').toLowerCase().includes(librarySearch.toLowerCase())
        || (w.body_parts || '').toLowerCase().includes(librarySearch.toLowerCase())
        || (w.workout_type || '').toLowerCase().includes(librarySearch.toLowerCase()))
      .slice(0, 50);

    const openWorkout = (w) => {
      if (onEditWorkout) { onEditWorkout(w.id); return; }
      fetch(`/api/explore/workouts/${w.id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(detail => {
        setSelectedWorkout({ ...w, exercises: detail.exercises });
      });
    };

    return (
      <div style={{ padding: '24px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={() => setSelectedProgram(null)} style={{ background: 'var(--bg-card)', border: 'none', borderRadius: 8, padding: '8px 16px', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>← All Programs</button>
          <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>{selectedProgram.title}</h2>
          <button onClick={() => { setEditing('edit-program'); setForm(selectedProgram); }} style={{
            background: 'rgba(61,255,210,0.1)', color: 'var(--accent-mint)', border: 'none', borderRadius: 8,
            padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>✎ Edit Program</button>
          <button onClick={() => setShowLibrary(v => !v)} style={{
            background: showLibrary ? 'var(--accent)' : 'rgba(255,140,0,0.15)',
            color: showLibrary ? '#fff' : 'var(--accent)', border: 'none', borderRadius: 8,
            padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>{showLibrary ? '✕ Close Library' : '🔍 Workout Library'}</button>
          <button onClick={() => { setEditing('new-workout'); setForm({ week_number: 1, day_number: programWorkouts.length + 1 }); }} style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>+ New Workout</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
            {selectedProgram.duration_weeks || totalWeeks} week block · {selectedProgram.workouts_per_week || '?'} workouts/week target · {programWorkouts.length} workouts placed
            <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>(drag cards between cells to move days)</span>
          </p>
          {/* Day label toggle - flips column headers between abstract day numbers and Mon–Sun */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--text-tertiary)' }}>Day labels:</span>
            <button
              onClick={() => {
                setUseWeekdayLabels(false);
                try { localStorage.setItem('am_program_weekday_labels', '0'); } catch {}
              }}
              style={{
                padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: !useWeekdayLabels ? 'var(--accent)' : 'transparent',
                color: !useWeekdayLabels ? '#fff' : 'var(--text-secondary)',
                fontSize: 12, fontWeight: 600,
              }}
            >Day 1–7</button>
            <button
              onClick={() => {
                setUseWeekdayLabels(true);
                try { localStorage.setItem('am_program_weekday_labels', '1'); } catch {}
              }}
              style={{
                padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: useWeekdayLabels ? 'var(--accent)' : 'transparent',
                color: useWeekdayLabels ? '#fff' : 'var(--text-secondary)',
                fontSize: 12, fontWeight: 600,
              }}
            >Mon–Sun</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: showLibrary ? '1fr 320px' : '1fr', gap: 16 }}>
          {/* ===== WEEK × DAY GRID ===== */}
          <div>
            {/* Shared column header so labels only render once above the whole grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 4 }}>
              {DAYS.map((d, i) => (
                <div key={d} style={{
                  fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
                  textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', padding: '4px 0',
                }}>
                  {useWeekdayLabels ? WEEKDAY_LABELS[i] : `Day ${d}`}
                </div>
              ))}
            </div>
            {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(weekNum => (
              <div key={weekNum} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-orange)', letterSpacing: 0.5 }}>WEEK {weekNum}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                  {DAYS.map(dayNum => {
                    const cellWorkouts = workoutsBySlot[cellKey(weekNum, dayNum)] || [];
                    const isEmpty = cellWorkouts.length === 0;
                    return (
                      <div
                        key={dayNum}
                        onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = 'rgba(61,255,210,0.08)'; }}
                        onDragLeave={e => { e.currentTarget.style.background = isEmpty ? 'transparent' : 'var(--bg-card)'; }}
                        onDrop={e => {
                          e.preventDefault();
                          e.currentTarget.style.background = isEmpty ? 'transparent' : 'var(--bg-card)';
                          if (dragWorkoutId) {
                            moveWorkoutToSlot(dragWorkoutId, weekNum, dayNum);
                            setDragWorkoutId(null);
                          }
                        }}
                        style={{
                          minHeight: 88, borderRadius: 10, padding: 8,
                          background: isEmpty ? 'transparent' : 'var(--bg-card)',
                          border: isEmpty ? '1.5px dashed var(--divider)' : '1px solid var(--divider)',
                          display: 'flex', flexDirection: 'column', gap: 4,
                          cursor: isEmpty ? 'pointer' : 'default',
                        }}
                        onClick={() => {
                          if (isEmpty) {
                            setPendingSlot({ week: weekNum, day: dayNum });
                            setShowLibrary(true);
                          }
                        }}
                      >
                        {isEmpty && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <span style={{ fontSize: 14, color: 'var(--text-tertiary)', lineHeight: 1 }}>+</span>
                          </div>
                        )}
                        {cellWorkouts.map(w => (
                          <div
                            key={w.id}
                            draggable
                            onDragStart={e => { setDragWorkoutId(w.id); e.dataTransfer.effectAllowed = 'move'; }}
                            onDragEnd={() => setDragWorkoutId(null)}
                            onClick={(e) => { e.stopPropagation(); openWorkout(w); }}
                            style={{
                              padding: '6px 8px', background: 'rgba(255,140,0,0.12)',
                              borderLeft: '3px solid var(--accent)', borderRadius: 6,
                              cursor: 'grab', userSelect: 'none',
                            }}
                            title="Drag to move, click to edit"
                          >
                            <p style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.2,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</p>
                            <p style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>
                              {w.duration_mins ? `${w.duration_mins}m` : ''} {w.workout_type || ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {programWorkouts.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, marginTop: 8, background: 'var(--bg-card)', borderRadius: 12 }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 4 }}>
                  Click any cell to drop an existing workout from the library, or create a new one.
                </p>
              </div>
            )}
          </div>

          {/* ===== WORKOUT LIBRARY PICKER ===== */}
          {showLibrary && (
            <div style={{
              background: 'var(--bg-card)', borderRadius: 12, padding: 12,
              position: 'sticky', top: 16, height: 'fit-content', maxHeight: 'calc(100vh - 80px)',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700 }}>Workout Library</h3>
                <button onClick={() => { setShowLibrary(false); setPendingSlot(null); }} style={{
                  background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16,
                }}>✕</button>
              </div>
              {pendingSlot && (
                <div style={{
                  background: 'rgba(61,255,210,0.1)', borderRadius: 8, padding: '6px 10px',
                  fontSize: 11, color: 'var(--accent-mint)', fontWeight: 600, marginBottom: 8,
                }}>
                  Dropping into Week {pendingSlot.week} · Day {pendingSlot.day}
                  <button onClick={() => setPendingSlot(null)} style={{
                    float: 'right', background: 'none', border: 'none', color: 'var(--accent-mint)', cursor: 'pointer',
                  }}>clear</button>
                </div>
              )}
              <input
                value={librarySearch}
                onChange={e => setLibrarySearch(e.target.value)}
                placeholder="Search workouts by name, body part, type..."
                className="input-field"
                style={{ fontSize: 13, marginBottom: 8 }}
                autoFocus
              />
              <div style={{ overflow: 'auto', flex: 1 }}>
                {libraryFiltered.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: 12, textAlign: 'center' }}>
                    No matches. Try another search.
                  </p>
                )}
                {libraryFiltered.map(w => (
                  <div
                    key={w.id}
                    onClick={() => {
                      if (pendingSlot) {
                        cloneWorkoutIntoSlot(w.id, pendingSlot.week, pendingSlot.day);
                      } else {
                        // No slot picked - default to the next empty day in week 1
                        let placed = false;
                        for (let wk = 1; wk <= totalWeeks && !placed; wk++) {
                          for (const d of DAYS) {
                            if (!workoutsBySlot[cellKey(wk, d)]) {
                              cloneWorkoutIntoSlot(w.id, wk, d);
                              placed = true; break;
                            }
                          }
                        }
                        if (!placed) cloneWorkoutIntoSlot(w.id, totalWeeks, 7);
                      }
                    }}
                    style={{
                      padding: '8px 10px', borderRadius: 8, marginBottom: 4, cursor: 'pointer',
                      border: '1px solid var(--divider)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,140,0,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{w.title}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {w.program_title ? `${w.program_title} · ` : ''}
                      {w.duration_mins ? `${w.duration_mins}m` : ''}
                      {w.workout_type ? ` · ${w.workout_type}` : ''}
                      {w.body_parts ? ` · ${w.body_parts}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== PROGRAM LIST =====
  // Program create/edit form - reused for both 'new' and editing an existing
  // program (editing = program.id). Exposes DURATION_PRESETS as one-tap buttons
  // to lock the program into a 2 / 4 / 6 / 8 / 12 week block; later phases will
  // read duration_weeks to trigger coach notifications at block boundaries.
  if (editing === 'new' || editing === 'edit-program') {
    const isNew = editing === 'new';
    return (
      <div style={{ padding: '24px 40px', maxWidth: 700 }}>
        <button onClick={() => { setEditing(null); setForm({}); }} style={{ background: 'var(--bg-card)', border: 'none', borderRadius: 8, padding: '8px 16px', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', marginBottom: 16 }}>← Back</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>{isNew ? 'New Program' : 'Edit Program'}</h2>
        <div className="input-group"><label>Title</label><input className="input-field" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. AMS Ground Zero" /></div>
        <div className="input-group"><label>Description</label><textarea className="input-field" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} style={{ minHeight: 80 }} /></div>

        <ImageUpload
          value={form.image_url}
          onChange={(v) => setForm({ ...form, image_url: v })}
          label="Program Thumbnail"
        />

        {/* Duration block presets + manual override */}
        <div className="input-group">
          <label>Program Block Duration</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {DURATION_PRESETS.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setForm({ ...form, duration_weeks: n })}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: form.duration_weeks === n ? '2px solid var(--accent)' : '1px solid var(--divider)',
                  background: form.duration_weeks === n ? 'rgba(255,140,0,0.15)' : 'transparent',
                  color: form.duration_weeks === n ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >{n} weeks</button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
            Block length powers the scheduler grid and will drive coach triggers in later phases.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="input-group" style={{ flex: 1 }}>
            <label>Weeks (custom)</label>
            <input type="number" className="input-field" value={form.duration_weeks || ''} onChange={e => setForm({ ...form, duration_weeks: parseInt(e.target.value) || '' })} />
          </div>
          <div className="input-group" style={{ flex: 1 }}>
            <label>Workouts/Week</label>
            <input type="number" className="input-field" value={form.workouts_per_week || ''} onChange={e => setForm({ ...form, workouts_per_week: parseInt(e.target.value) || '' })} />
          </div>
        </div>
        {!isNew && (() => {
          const programWorkouts = workouts.filter(w => w.program_id === form.id);
          const freeCount = programWorkouts.filter(w => w.is_free_preview).length;
          const total = programWorkouts.length;
          const allFree = total > 0 && freeCount === total;
          const bulkSet = async (value) => {
            await fetch(`/api/content/programs/${form.id}/free-preview`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: value ? 1 : 0 }),
            });
            fetchAll();
          };
          return (
            <div className="input-group">
              <label>Free preview</label>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: -4, marginBottom: 8 }}>
                Free-tier clients can access preview workouts even if the program is tier-locked.
                <span style={{ marginLeft: 6, color: 'var(--text-secondary)' }}>{freeCount} of {total} marked.</span>
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" disabled={allFree || total === 0} onClick={() => bulkSet(true)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--divider)', background: allFree ? 'var(--bg-card)' : 'transparent', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: allFree || total === 0 ? 'default' : 'pointer', opacity: allFree || total === 0 ? 0.5 : 1 }}>
                  Mark all as free preview
                </button>
                <button type="button" disabled={freeCount === 0} onClick={() => bulkSet(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: freeCount === 0 ? 'default' : 'pointer', opacity: freeCount === 0 ? 0.5 : 1 }}>
                  Unmark all
                </button>
              </div>
            </div>
          );
        })()}
        <button onClick={async () => { await saveProgram(); if (!isNew) setSelectedProgram({ ...selectedProgram, ...form }); }} style={{ marginTop: 8, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{isNew ? 'Create Program' : 'Save Changes'}</button>
      </div>
    );
  }

  // Filter + sort
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? programs.filter(p => (p.title || '').toLowerCase().includes(q))
    : programs;

  const sorted = [...filtered].sort((a, b) => {
    const countA = workouts.filter(w => w.program_id === a.id).length;
    const countB = workouts.filter(w => w.program_id === b.id).length;
    switch (sortBy) {
      case 'name_desc': return (b.title || '').localeCompare(a.title || '');
      case 'duration': return (b.duration_weeks || 0) - (a.duration_weeks || 0);
      case 'workouts': return countB - countA;
      case 'recent': return (b.id || 0) - (a.id || 0);
      case 'name_asc':
      default: return (a.title || '').localeCompare(b.title || '');
    }
  });

  // Group by series (everything before the first '|' is the series name)
  const getSeries = (title) => {
    const parts = (title || '').split('|');
    return parts.length > 1 ? parts[0].trim() : 'Other';
  };
  const grouped = {};
  if (groupBySeries) {
    for (const p of sorted) {
      const s = getSeries(p.title);
      if (!grouped[s]) grouped[s] = [];
      grouped[s].push(p);
    }
  }
  const seriesList = Object.keys(grouped).sort();

  const renderCard = (p) => {
    const pWorkouts = workouts.filter(w => w.program_id === p.id);
    return (
      <div key={p.id} onClick={() => setSelectedProgram(p)} style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
        background: 'var(--bg-card)', borderRadius: 12, marginBottom: 8, cursor: 'pointer',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
      >
        <div style={{
          width: 56, height: 56, borderRadius: 12, flexShrink: 0,
          background: 'var(--bg-primary)', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {p.image_url ? (
            <img src={p.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 24 }}>📚</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{p.duration_weeks} weeks · {p.workouts_per_week} workouts/wk · {pWorkouts.length} workouts built</p>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    );
  };

  return (
    <div style={{ padding: '24px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Programs</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {filtered.length} of {programs.length} programs
          </p>
        </div>
        <button onClick={() => { setEditing('new'); setForm({}); }} style={{
          background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
          padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}>+ New Program</button>
      </div>

      {/* Search + sort + group toggle */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
          >
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search programs..."
            style={{
              width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10,
              background: 'var(--bg-card)', border: '1px solid var(--divider)',
              color: 'var(--text-primary)', fontSize: 14, outline: 'none',
            }}
          />
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            padding: '10px 12px', borderRadius: 10,
            background: 'var(--bg-card)', border: '1px solid var(--divider)',
            color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer',
          }}
        >
          <option value="name_asc">Name A–Z</option>
          <option value="name_desc">Name Z–A</option>
          <option value="duration">Longest first</option>
          <option value="workouts">Most workouts</option>
          <option value="recent">Newest first</option>
        </select>
        <button
          onClick={() => setGroupBySeries(!groupBySeries)}
          style={{
            padding: '10px 14px', borderRadius: 10,
            background: groupBySeries ? 'rgba(255,140,0,0.15)' : 'var(--bg-card)',
            border: `1px solid ${groupBySeries ? 'var(--accent)' : 'var(--divider)'}`,
            color: groupBySeries ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {groupBySeries ? '✓ Grouped' : 'Group by series'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 40 }}>
          No programs match "{searchQuery}"
        </p>
      ) : groupBySeries ? (
        seriesList.map(series => (
          <div key={series} style={{ marginBottom: 24 }}>
            <h3 style={{
              fontSize: 12, fontWeight: 800, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: 0.8,
              marginBottom: 8, padding: '0 4px',
            }}>
              {series} <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>({grouped[series].length})</span>
            </h3>
            {grouped[series].map(renderCard)}
          </div>
        ))
      ) : (
        sorted.map(renderCard)
      )}
    </div>
  );
}
