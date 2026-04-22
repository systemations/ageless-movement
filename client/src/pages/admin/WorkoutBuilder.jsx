import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import ExerciseThumb, { getExerciseLabel } from '../../components/ExerciseThumb';
import ImageUpload from '../../components/ImageUpload';
import FollowAlongEditor from './FollowAlongEditor';
import PhaseEditor from '../../components/PhaseEditor';

const BLOCK_TYPES = [
  { id: 'standard', label: 'Regular', color: 'var(--accent)' },
  { id: 'warmup', label: 'Warmup', color: '#FFD60A' },
  { id: 'superset', label: 'Superset', color: '#0A84FF' },
  { id: 'triset', label: 'Triset', color: '#30D158' },
  { id: 'circuit', label: 'Circuit', color: '#FF9500' },
  { id: 'amrap', label: 'AMRAP', color: '#FF453A' },
  { id: 'tabata', label: 'TABATA', color: '#FF375F' },
  { id: 'emom', label: 'EMOM', color: '#BF5AF2' },
  { id: 'notes', label: 'Notes', color: '#8E8E93' },
];

const TRACKING_TYPES = ['Repetitions', 'Duration', 'Distance', 'Meters', 'Calories'];
const SETWISE_OPTIONS = ['Fixed', 'Range', 'Per Set'];
const SIDE_OPTIONS = ['None', 'Per Arm', 'Per Side', 'Per Leg'];
const MODALITY_OPTIONS = ['Barbell', 'Dumbbell', 'Cable', 'Bodyweight', 'TRX', 'Kettlebell', 'Band', 'Machine', 'Rings', 'Other'];

const getBlockColor = (type) => BLOCK_TYPES.find(b => b.id === type)?.color || 'var(--accent)';
const getBlockLabel = (type) => BLOCK_TYPES.find(b => b.id === type)?.label || type;

// Map variable type pills to tracking_type values
const VARIABLE_TYPE_MAP = {
  'Sets & Reps': 'Repetitions',
  'Reps Only': 'Repetitions',
  'Duration': 'Duration',
  'Calories': 'Calories',
};

// Reverse: infer variable type from tracking_type
const inferVariableType = (trackingType) => {
  if (!trackingType || trackingType === 'reps' || trackingType === 'Repetitions') return 'Sets & Reps';
  if (trackingType === 'Duration' || trackingType === 'duration') return 'Duration';
  if (trackingType === 'Calories' || trackingType === 'calories') return 'Calories';
  return 'Sets & Reps';
};

export default function WorkoutBuilder({
  initialWorkoutId,
  onClearInitial,
  // Personalise-for-one-client mode. When overrideClientId is set, the
  // builder loads the template + any existing override for this client,
  // saves to the override endpoint instead of the template, skips the
  // drift prompt, and calls onExitPersonalise when the coach backs out
  // or saves successfully.
  overrideClientId = null,
  overrideClientName = null,
  onExitPersonalise = null,
}) {
  const isPersonalising = !!overrideClientId;
  const { token } = useAuth();
  const [workouts, setWorkouts] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [workoutForm, setWorkoutForm] = useState({ title: '', description: '', tags: '', program_id: '', week_number: 1, day_number: 1, duration_mins: 30, intensity: 'Medium', body_parts: '', workout_type: 'strength', image_url: '' });
  const [blocks, setBlocks] = useState([]);
  const [creating, setCreating] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [addingToBlock, setAddingToBlock] = useState(null);
  const [inspectorExercise, setInspectorExercise] = useState(null);
  const [trackingPopover, setTrackingPopover] = useState(null); // { blockId, exIdx }
  const [manageAltsFor, setManageAltsFor] = useState(null); // workout_exercise id
  const [editingFollowAlong, setEditingFollowAlong] = useState(null); // workoutId or 'new'
  // Personalise-mode-only: coach note stored on the override, and whether
  // an override already exists (so we can show "Revert to template").
  const [coachNote, setCoachNote] = useState('');
  const [hasOverride, setHasOverride] = useState(false);
  // Map of workout_id -> number of clients with a personalised version,
  // rendered as a badge in the library list.
  const [overrideCounts, setOverrideCounts] = useState({});

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    const h = { Authorization: `Bearer ${token}` };
    const [w, p, e, oc] = await Promise.all([
      fetch('/api/content/workouts', { headers: h }).then(r => r.json()),
      fetch('/api/content/programs', { headers: h }).then(r => r.json()),
      fetch('/api/content/exercises', { headers: h }).then(r => r.json()),
      fetch('/api/coach/workouts/overrides/counts', { headers: h }).then(r => r.ok ? r.json() : { counts: {} }).catch(() => ({ counts: {} })),
    ]);
    setWorkouts(w.workouts || []);
    setPrograms(p.programs || []);
    setExercises(e.exercises || []);
    setOverrideCounts(oc.counts || {});
  };

  // Auto-load workout when coming from ProgramBuilder (template edit mode).
  useEffect(() => {
    if (isPersonalising) return; // Personalise mode has its own loader below.
    if (initialWorkoutId && workouts.length > 0) {
      const w = workouts.find(w => w.id === initialWorkoutId);
      if (w) { loadWorkout(w); if (onClearInitial) onClearInitial(); }
    }
  }, [initialWorkoutId, workouts, isPersonalising]);

  // Auto-load in personalise mode. Uses the coach endpoint which returns
  // both template_exercises + any existing override, so the coach picks up
  // where they left off. Rebuilds blocks from whichever list is active
  // (override → template) using the same grouping logic as loadWorkout().
  useEffect(() => {
    if (!isPersonalising || !initialWorkoutId) return;
    let cancelled = false;
    (async () => {
      const h = { Authorization: `Bearer ${token}` };
      const res = await fetch(`/api/coach/clients/${overrideClientId}/workouts/${initialWorkoutId}`, { headers: h });
      if (!res.ok || cancelled) return;
      const data = await res.json();
      const w = data.workout;
      if (!w || cancelled) return;

      setSelectedWorkout(w);
      setWorkoutForm({
        title: w.title || '',
        description: w.description || '',
        tags: w.body_parts || '',
        program_id: w.program_id || '',
        week_number: w.week_number,
        day_number: w.day_number,
        duration_mins: w.duration_mins,
        intensity: w.intensity,
        body_parts: w.body_parts || '',
        workout_type: w.workout_type,
        image_url: w.image_url || '',
      });

      const sourceList = (data.override && Array.isArray(data.override.exercises))
        ? data.override.exercises
        : (data.template_exercises || []);
      setHasOverride(!!data.override);
      setCoachNote(data.override?.coach_note || '');

      const exBlocks = [];
      let currentBlock = null;
      sourceList.forEach(raw => {
        const ex = { ...raw };
        if (ex.meta_tracking_type) ex.tracking_type = ex.meta_tracking_type;
        if (ex.meta_per_side) ex.per_side = ex.meta_per_side;
        if (ex.meta_duration_secs) ex.duration_secs = ex.meta_duration_secs;
        const sameGroup = ex.group_type && currentBlock?.type === ex.group_type;
        const sameSets = currentBlock && (ex.sets || 3) === currentBlock.sets;
        const sameLabel = !ex.group_label || !currentBlock?.label || ex.group_label === currentBlock.label;
        if (sameGroup && sameSets && sameLabel) {
          currentBlock.exercises.push(ex);
        } else {
          if (currentBlock) exBlocks.push(currentBlock);
          currentBlock = { id: Date.now() + Math.random(), type: ex.group_type || 'standard', exercises: [ex], sets: ex.sets || 3, rest: ex.rest_secs || 30, label: ex.group_label || null };
        }
      });
      if (currentBlock) exBlocks.push(currentBlock);
      exBlocks.forEach(b => {
        const firstTrack = b.exercises[0]?.tracking_type;
        if (firstTrack) b.variableType = inferVariableType(firstTrack);
      });
      setBlocks(exBlocks);
      setCreating(true);
      if (onClearInitial) onClearInitial();
    })();
    return () => { cancelled = true; };
  }, [isPersonalising, initialWorkoutId, overrideClientId, token]);

  const loadWorkout = async (workout) => {
    // Follow-along workouts get a simpler dedicated editor — no blocks/exercises.
    if (workout.workout_type === 'follow_along') {
      setEditingFollowAlong(workout.id);
      return;
    }
    setSelectedWorkout(workout);
    setWorkoutForm({ title: workout.title, description: workout.description || '', tags: workout.body_parts || '', program_id: workout.program_id || '', week_number: workout.week_number, day_number: workout.day_number, duration_mins: workout.duration_mins, intensity: workout.intensity, body_parts: workout.body_parts || '', workout_type: workout.workout_type, image_url: workout.image_url || '' });
    const res = await fetch(`/api/explore/workouts/${workout.id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      const exBlocks = [];
      let currentBlock = null;
      (data.exercises || []).forEach(ex => {
        // Merge meta fields onto exercise (meta columns use aliases to avoid conflicts)
        if (ex.meta_tracking_type) ex.tracking_type = ex.meta_tracking_type;
        if (ex.meta_per_side) ex.per_side = ex.meta_per_side;
        if (ex.meta_duration_secs) ex.duration_secs = ex.meta_duration_secs;
        // Preserve the workout_exercise.id so Manage Alternates can target the right row
        // (ex.id will collide with exercise.id for newly-added rows before save)
        ex._weId = ex.id;

        const sameGroup = ex.group_type && currentBlock?.type === ex.group_type;
        const sameSets = currentBlock && (ex.sets || 3) === currentBlock.sets;
        const sameLabel = !ex.group_label || !currentBlock?.label || ex.group_label === currentBlock.label;
        if (sameGroup && sameSets && sameLabel) {
          currentBlock.exercises.push(ex);
        } else {
          if (currentBlock) exBlocks.push(currentBlock);
          currentBlock = { id: Date.now() + Math.random(), type: ex.group_type || 'standard', exercises: [ex], sets: ex.sets || 3, rest: ex.rest_secs || 30, label: ex.group_label || null };
        }
      });
      if (currentBlock) exBlocks.push(currentBlock);
      // Infer variableType for each block from its exercises' tracking_type
      exBlocks.forEach(b => {
        const firstTrack = b.exercises[0]?.tracking_type;
        if (firstTrack) b.variableType = inferVariableType(firstTrack);
      });
      setBlocks(exBlocks);
    }
    setCreating(true);
  };

  const [saving, setSaving] = useState(false);
  // After a coach edits an existing workout template, we check whether any
  // clients have personalised (override) versions. If so, we prompt the coach
  // to pick which of those clients should receive the new template.
  // Shape: { workoutId, workoutTitle, clients: [...], selected: Set<number>, submitting: bool }
  const [driftPrompt, setDriftPrompt] = useState(null);

  const saveWorkout = async (status) => {
    if (saving) return;
    setSaving(true);

    // ── Personalise mode: flatten blocks → exercises with per-row group
    // metadata and PUT to the override endpoint. Skips the template write,
    // the drift prompt, and the list refresh.
    if (isPersonalising) {
      try {
        const flat = [];
        let order = 0;
        for (const block of blocks) {
          for (const ex of block.exercises) {
            flat.push({
              exercise_id: ex.exercise_id || ex.id,
              name: ex.name,
              thumbnail_url: ex.thumbnail_url,
              body_part: ex.body_part,
              order_index: order++,
              sets: block.sets || ex.sets || 3,
              reps: ex.reps || '10',
              rest_secs: block.rest || 30,
              duration_secs: ex.duration_secs || null,
              group_type: block.type === 'standard' ? null : block.type,
              group_label: block.label || null,
              notes: ex.notes || null,
              tempo: ex.tempo || null,
              rir: ex.rir ? parseInt(ex.rir) : null,
              rpe: ex.rpe ? parseInt(ex.rpe) : null,
              per_side: ex.per_side || 'none',
              modality: ex.modality || null,
              training_type: ex.training_type || null,
              time_based: !!ex.duration || !!ex.time_based,
              tracking_type: ex.tracking_type || 'reps',
              setwise_variation: ex.setwise_variation || 'fixed',
              secondary_tracking: !!ex.secondary_tracking,
            });
          }
        }
        const res = await fetch(`/api/coach/clients/${overrideClientId}/workouts/${selectedWorkout.id}/override`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ exercises: flat, coach_note: coachNote || null }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Save failed: ${err}`);
        }
        if (onExitPersonalise) onExitPersonalise();
      } catch (err) {
        console.error('savePersonalised error:', err);
        alert('Failed to save personalised version. Check console for details.');
      } finally {
        setSaving(false);
      }
      return;
    }

    const wasEdit = !!selectedWorkout;
    const editWorkoutId = selectedWorkout?.id;
    const editWorkoutTitle = workoutForm.title || selectedWorkout?.title || 'this workout';
    try {
      const method = selectedWorkout ? 'PUT' : 'POST';
      const url = selectedWorkout ? `/api/content/workouts/${selectedWorkout.id}` : '/api/content/workouts';
      const payload = { ...workoutForm, program_id: workoutForm.program_id || null, status: status || 'draft' };
      const res = await fetch(url, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`Save failed: ${err}`); }
      const data = await res.json();
      const workoutId = selectedWorkout?.id || data.workout?.id;

      if (workoutId) {
        const existing = await fetch(`/api/explore/workouts/${workoutId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
        for (const ex of (existing.exercises || [])) {
          await fetch(`/api/content/workout-exercises/${ex.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        }
        let order = 0;
        for (const block of blocks) {
          for (const ex of block.exercises) {
            const exRes = await fetch(`/api/content/workouts/${workoutId}/exercises`, {
              method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                exercise_id: ex.exercise_id || ex.id, order_index: order,
                sets: block.sets || ex.sets || 3, reps: ex.reps || '10',
                rest_secs: block.rest || 30,
                group_type: block.type === 'standard' ? null : block.type,
                group_label: block.label || null,
                notes: ex.notes || null,
                tempo: ex.tempo, rir: ex.rir ? parseInt(ex.rir) : null,
                rpe: ex.rpe ? parseInt(ex.rpe) : null,
                per_side: ex.per_side || 'none', modality: ex.modality,
                training_type: ex.training_type, time_based: !!ex.duration,
                tracking_type: ex.tracking_type || 'reps',
                setwise_variation: ex.setwise_variation || 'fixed',
                secondary_tracking: ex.secondary_tracking || false,
              }),
            });
            if (!exRes.ok) {
              console.error('Failed to save exercise', ex.exercise_id || ex.id);
            } else if (Array.isArray(ex.interval_structure) && ex.interval_structure.length > 0) {
              // Persist the phase list after the row is created. Exercises
              // are re-created from scratch on every save (the route above
              // DELETE-then-INSERTs), so the interval PATCH uses the new
              // workout_exercise id from the POST response.
              const exData = await exRes.json();
              if (exData.id) {
                await fetch(`/api/content/workout-exercises/${exData.id}/interval`, {
                  method: 'PATCH',
                  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ interval_structure: ex.interval_structure }),
                });
              }
            }
            order++;
          }
        }
      }
      setCreating(false); setSelectedWorkout(null); setBlocks([]); fetchAll();

      // Drift prompt: only fires when the coach edited an existing template.
      // If any clients have personalised (override) versions, ask which ones
      // should receive the new template (others keep their personal version).
      if (wasEdit && editWorkoutId) {
        try {
          const ovRes = await fetch(`/api/coach/workouts/${editWorkoutId}/overrides`, { headers: { Authorization: `Bearer ${token}` } });
          if (ovRes.ok) {
            const ovData = await ovRes.json();
            const clients = ovData.clients || [];
            if (clients.length > 0) {
              setDriftPrompt({
                workoutId: editWorkoutId,
                workoutTitle: editWorkoutTitle,
                clients,
                selected: new Set(),
                submitting: false,
              });
            }
          }
        } catch (e) {
          console.error('Drift prompt fetch failed:', e);
        }
      }
    } catch (err) {
      console.error('saveWorkout error:', err);
      alert('Failed to save workout. Check console for details.');
    } finally {
      setSaving(false);
    }
  };

  // Personalise-mode only: drop the override so the client snaps back to
  // the template. Called from the "Revert to template" button.
  const revertOverride = async () => {
    if (!isPersonalising || !selectedWorkout || saving) return;
    const name = overrideClientName?.split(' ')[0] || 'this client';
    if (!confirm(`Remove the personalised version of "${selectedWorkout.title}"? ${name} will revert to the template.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/coach/clients/${overrideClientId}/workouts/${selectedWorkout.id}/override`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      if (onExitPersonalise) onExitPersonalise();
    } catch (err) {
      console.error('revertOverride error:', err);
      alert('Failed to revert.');
    } finally {
      setSaving(false);
    }
  };

  const toggleDriftClient = (userId) => {
    setDriftPrompt(prev => {
      if (!prev) return prev;
      const next = new Set(prev.selected);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return { ...prev, selected: next };
    });
  };

  const driftSelectAll = () => {
    setDriftPrompt(prev => prev ? { ...prev, selected: new Set(prev.clients.map(c => c.user_id)) } : prev);
  };

  const driftClearAll = () => {
    setDriftPrompt(prev => prev ? { ...prev, selected: new Set() } : prev);
  };

  const applyDriftToSelected = async () => {
    if (!driftPrompt || driftPrompt.submitting) return;
    const ids = Array.from(driftPrompt.selected);
    if (ids.length === 0) { setDriftPrompt(null); return; }
    setDriftPrompt(prev => prev ? { ...prev, submitting: true } : prev);
    try {
      const res = await fetch(`/api/coach/workouts/${driftPrompt.workoutId}/overrides/clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: ids }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Clear failed');
      }
      setDriftPrompt(null);
    } catch (e) {
      console.error('Drift apply failed:', e);
      alert('Failed to apply changes to selected clients.');
      setDriftPrompt(prev => prev ? { ...prev, submitting: false } : prev);
    }
  };

  const addBlock = () => {
    setBlocks([...blocks, { id: Date.now(), type: 'standard', exercises: [], sets: 3, rest: 30, note: '' }]);
  };

  const addExerciseToBlock = (blockId, exercise) => {
    const block = blocks.find(b => b.id === blockId);
    const trackingType = VARIABLE_TYPE_MAP[block?.variableType] || 'Repetitions';
    const defaultReps = trackingType === 'Repetitions' ? '10' : trackingType === 'Duration' ? '0:45' : trackingType === 'Calories' ? '15' : '10';
    setBlocks(blocks.map(b => b.id === blockId ? { ...b, exercises: [...b.exercises, { ...exercise, exercise_id: exercise.id, reps: defaultReps, tracking_type: trackingType, setwise_variation: 'fixed', per_side: 'none' }] } : b));
    setAddingToBlock(null);
    setExerciseSearch('');
  };

  const removeExerciseFromBlock = (blockId, exIdx) => {
    const block = blocks.find(b => b.id === blockId);
    const exName = block?.exercises?.[exIdx]?.name || 'this exercise';
    if (!confirm(`Remove "${exName}" from this block?`)) return;
    setBlocks(blocks.map(b => b.id === blockId ? { ...b, exercises: b.exercises.filter((_, i) => i !== exIdx) } : b));
  };

  const removeBlock = (blockId) => {
    const block = blocks.find(b => b.id === blockId);
    const exCount = block?.exercises?.length || 0;
    if (!confirm(`Delete this block${exCount ? ` and its ${exCount} exercise${exCount > 1 ? 's' : ''}` : ''}?`)) return;
    setBlocks(blocks.filter(b => b.id !== blockId));
  };

  const updateBlockExercise = (blockId, exIdx, field, value) => {
    setBlocks(blocks.map(b => b.id === blockId ? { ...b, exercises: b.exercises.map((ex, i) => i === exIdx ? { ...ex, [field]: value } : ex) } : b));
  };

  const moveExercise = (blockId, fromIdx, toIdx) => {
    setBlocks(blocks.map(b => {
      if (b.id !== blockId) return b;
      const exs = [...b.exercises];
      const [moved] = exs.splice(fromIdx, 1);
      exs.splice(toIdx, 0, moved);
      return { ...b, exercises: exs };
    }));
  };

  const duplicateExercise = (blockId, exIdx) => {
    setBlocks(blocks.map(b => {
      if (b.id !== blockId) return b;
      const exs = [...b.exercises];
      exs.splice(exIdx + 1, 0, { ...exs[exIdx] });
      return { ...b, exercises: exs };
    }));
  };

  const [expandedExercise, setExpandedExercise] = useState(null); // { blockId, exIdx }

  const updateBlock = (blockId, field, value) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, [field]: value } : b));
  };

  const updateBlockMulti = (blockId, updates) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ...updates } : b));
  };

  const filteredExercises = exercises.filter(e => !exerciseSearch || e.name.toLowerCase().includes(exerciseSearch.toLowerCase()));

  // Get tracking display for an exercise
  const getTrackingDisplay = (ex) => {
    const type = ex.tracking_type || 'reps';
    const val = ex.reps || ex.duration || '';
    if (type === 'reps' || type === 'Repetitions') return val ? `${val} reps` : '10 reps';
    if (type === 'Duration' || type === 'duration') return ex.duration || val || '0:45';
    if (type === 'Distance' || type === 'distance') return val ? `${val}m` : '500m';
    if (type === 'Calories' || type === 'calories') return val ? `${val} cal` : '15 cal';
    return val || '10';
  };

  // ===== FOLLOW-ALONG EDITOR =====
  if (editingFollowAlong) {
    return (
      <FollowAlongEditor
        workoutId={editingFollowAlong === 'new' ? null : editingFollowAlong}
        onBack={() => setEditingFollowAlong(null)}
        onSaved={fetchAll}
      />
    );
  }

  // In personalise mode, never fall through to the workouts list — while the
  // async loader is working, show a small loading shim. Once the loader
  // flips `creating` true, the main editor takes over below.
  if (isPersonalising && !creating) {
    return <div style={{ padding: 40, color: 'var(--text-tertiary)' }}>Loading personalised workout...</div>;
  }

  // ===== WORKOUT BUILDER =====
  if (creating) {
    return (
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {/* Main: Workout form + blocks */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 32px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isPersonalising ? (
                <>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Personalising for {overrideClientName || 'client'}
                  </span>
                  {hasOverride && (
                    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 800, background: 'rgba(133,255,186,0.18)', color: 'var(--accent-mint, #3DFFD2)' }}>PERSONALISED</span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>· W{workoutForm.week_number} - D{workoutForm.day_number}</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 12, background: 'var(--success)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>Draft</span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>W{workoutForm.week_number} - D{workoutForm.day_number}</span>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {isPersonalising ? (
                <>
                  <button onClick={() => onExitPersonalise?.()} style={{ background: 'var(--bg-card)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
                  {hasOverride && (
                    <button onClick={revertOverride} disabled={saving} style={{ background: 'rgba(255,69,58,0.15)', color: '#FF5E5E', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>Revert to template</button>
                  )}
                  <button onClick={() => saveWorkout()} disabled={saving || blocks.length === 0} style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: (saving || blocks.length === 0) ? 0.5 : 1 }}>
                    {saving ? 'Saving...' : (hasOverride ? 'Update personal version' : 'Save personal version')}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { setCreating(false); setSelectedWorkout(null); setBlocks([]); }} style={{ background: 'var(--bg-card)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>Back to workouts</button>
                  <button onClick={() => saveWorkout('draft')} disabled={saving} style={{ background: 'var(--bg-card)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving...' : 'Save draft'}</button>
                  <button onClick={() => saveWorkout('published')} disabled={saving} style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving...' : 'Publish'}</button>
                </>
              )}
            </div>
          </div>

          {/* Coach note — personalise mode only. Lives above the (greyed-out)
              workout details since the rest of the details are template-level
              metadata that the override doesn't change. */}
          {isPersonalising && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
                Coach note (optional)
              </label>
              <textarea
                value={coachNote}
                onChange={(e) => setCoachNote(e.target.value)}
                placeholder="Why is this personalised? e.g. 'Wrist injury — floor press instead of bench'"
                rows={2}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.08)', border: '1px solid var(--divider)',
                  color: 'var(--text-primary)', fontSize: 13, outline: 'none', resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          )}

          {/* Workout details card */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.5, marginBottom: 12 }}>WORKOUT DETAILS</h3>
            <div style={{ marginBottom: 12 }}>
              <ImageUpload value={workoutForm.image_url} onChange={v => setWorkoutForm({ ...workoutForm, image_url: v })} label="Workout Thumbnail" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Workout name</label>
                <input className="input-field" value={workoutForm.title} onChange={e => setWorkoutForm({ ...workoutForm, title: e.target.value })} placeholder="Untitled workout" />
              </div>
              <div>
                <label style={labelStyle}>Tags</label>
                <input className="input-field" value={workoutForm.body_parts} onChange={e => setWorkoutForm({ ...workoutForm, body_parts: e.target.value })} placeholder="e.g. upper, strength" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Description</label>
                <textarea className="input-field" value={workoutForm.description} onChange={e => setWorkoutForm({ ...workoutForm, description: e.target.value })} placeholder="Add a short description" style={{ minHeight: 60, resize: 'vertical' }} />
              </div>
              <div>
                <label style={labelStyle}>Program</label>
                <select className="input-field" value={workoutForm.program_id} onChange={e => setWorkoutForm({ ...workoutForm, program_id: parseInt(e.target.value) || '' })}>
                  <option value="">None</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>Week</label><input type="number" className="input-field" value={workoutForm.week_number} onChange={e => setWorkoutForm({ ...workoutForm, week_number: parseInt(e.target.value) })} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>Day</label><input type="number" className="input-field" value={workoutForm.day_number} onChange={e => setWorkoutForm({ ...workoutForm, day_number: parseInt(e.target.value) })} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>Mins</label><input type="number" className="input-field" value={workoutForm.duration_mins} onChange={e => setWorkoutForm({ ...workoutForm, duration_mins: parseInt(e.target.value) })} /></div>
              </div>
            </div>
          </div>

          {/* ===== BLOCKS ===== */}
          {blocks.map((block, bi) => (
            <div key={block.id} style={{
              background: 'var(--bg-card)', borderRadius: 12, marginBottom: 16,
              borderLeft: `4px solid ${getBlockColor(block.type)}`,
              overflow: 'hidden',
            }}>
              {/* Block header */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
                {/* Top row: block name + type dropdown + sets + menu */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: block.type !== 'notes' ? 10 : 0 }}>
                  {/* Editable block name */}
                  <input
                    value={block.blockName || ''}
                    onChange={e => updateBlock(block.id, 'blockName', e.target.value)}
                    placeholder={`Block ${bi + 1}`}
                    style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, outline: 'none' }}
                    onFocus={e => e.target.style.border = '1px solid var(--divider)'}
                    onBlur={e => e.target.style.border = '1px solid transparent'}
                  />
                  {block.type !== 'notes' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {(block.type === 'amrap' || block.type === 'emom') && (
                        <>
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Time</span>
                          <input type="number" value={block.timeCap || ''} onChange={e => updateBlock(block.id, 'timeCap', parseInt(e.target.value) || '')} placeholder="15" style={{ width: 40, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--divider)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, textAlign: 'center', fontWeight: 600 }} />
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>min</span>
                        </>
                      )}
                      {block.type !== 'amrap' && (
                        <>
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Sets</span>
                          <input type="number" value={block.sets} onChange={e => updateBlock(block.id, 'sets', parseInt(e.target.value))} style={{ width: 40, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--divider)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, textAlign: 'center', fontWeight: 600 }} />
                        </>
                      )}
                    </div>
                  )}
                  <select
                    value={block.type}
                    onChange={e => {
                      const newType = e.target.value;
                      const updates = { type: newType };
                      // Auto-configure based on block type
                      if (newType === 'tabata') {
                        updates.sets = 8;
                        updates.rest = 10;
                        updates.variableType = 'Duration';
                        updates.exercises = block.exercises.map(ex => ({ ...ex, tracking_type: 'Duration', reps: '0:20' }));
                      } else if (newType === 'emom') {
                        updates.sets = 10;
                        updates.timeCap = 10;
                        updates.variableType = 'Reps Only';
                        updates.exercises = block.exercises.map(ex => ({ ...ex, tracking_type: 'Repetitions' }));
                      } else if (newType === 'amrap') {
                        updates.sets = 1;
                        updates.timeCap = 15;
                        updates.variableType = 'Reps Only';
                        updates.exercises = block.exercises.map(ex => ({ ...ex, tracking_type: 'Repetitions' }));
                      }
                      updateBlockMulti(block.id, updates);
                    }}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: '4px 24px 4px 10px', borderRadius: 6,
                      border: '1px solid var(--divider)', cursor: 'pointer', flexShrink: 0,
                      background: 'var(--bg-primary)', color: 'var(--text-primary)',
                      appearance: 'none', WebkitAppearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
                    }}
                  >
                    {BLOCK_TYPES.map(bt => <option key={bt.id} value={bt.id}>{bt.label}</option>)}
                  </select>
                  <button onClick={() => removeBlock(block.id)} title="Delete block" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                  </button>
                </div>

                {/* Variable type pills + action links */}
                {block.type !== 'notes' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {/* Variable pills */}
                    {['Sets & Reps', 'Reps Only', 'Duration', 'Calories'].map(v => (
                      <button
                        key={v}
                        onClick={() => {
                          updateBlock(block.id, 'variableType', v);
                          const newTrackingType = VARIABLE_TYPE_MAP[v] || 'Repetitions';
                          const defaultVal = newTrackingType === 'Duration' ? '0:45' : newTrackingType === 'Calories' ? '15' : '10';
                          setBlocks(prev => prev.map(b => b.id === block.id ? {
                            ...b, variableType: v,
                            exercises: b.exercises.map(ex => ({ ...ex, tracking_type: newTrackingType, reps: defaultVal })),
                          } : b));
                        }}
                        style={{
                          padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          border: (block.variableType || 'Sets & Reps') === v ? '1px solid var(--accent)' : '1px solid var(--divider)',
                          background: (block.variableType || 'Sets & Reps') === v ? 'rgba(255,140,0,0.1)' : 'transparent',
                          color: (block.variableType || 'Sets & Reps') === v ? 'var(--accent)' : 'var(--text-tertiary)',
                        }}
                      >{v}</button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => updateBlock(block.id, 'showBlockNote', !block.showBlockNote)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {block.showBlockNote || block.note ? 'Hide Note' : 'Add Note'}
                    </button>
                    <button onClick={() => { setAddingToBlock(block.id); setExerciseSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                      Add Exercises
                    </button>
                  </div>
                )}
              </div>

              {/* Block-level coaching note */}
              {(block.showBlockNote || block.note) && (
                <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--divider)', background: 'var(--bg-primary)' }}>
                  <textarea
                    value={block.note || ''}
                    onChange={e => updateBlock(block.id, 'note', e.target.value)}
                    placeholder="Add coaching notes for this block..."
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--divider)', background: 'var(--bg-card)', color: 'var(--text-primary)', minHeight: 40, resize: 'vertical', lineHeight: 1.4 }}
                  />
                </div>
              )}

              {/* Exercise search dropdown */}
              {addingToBlock === block.id && (
                <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--divider)', background: 'var(--bg-primary)' }}>
                  <input value={exerciseSearch} onChange={e => setExerciseSearch(e.target.value)} placeholder="Type 3+ letters to search exercises..." className="input-field" style={{ fontSize: 13, marginBottom: 4 }} autoFocus />
                  {exerciseSearch.length >= 3 && (
                    <div style={{ maxHeight: 240, overflow: 'auto', background: 'var(--bg-card)', borderRadius: 8, padding: 4 }}>
                      {filteredExercises.length === 0 && (
                        <p style={{ padding: '12px 10px', fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>No exercises found</p>
                      )}
                      {filteredExercises.slice(0, 20).map(ex => (
                        <div key={ex.id} onClick={() => addExerciseToBlock(block.id, ex)} style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,140,0,0.08)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <ExerciseThumb name={ex.name} size={40} borderRadius={8} />
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 500 }}>{ex.name}</span>
                            <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{ex.body_part}{ex.equipment ? ' - ' + ex.equipment : ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {exerciseSearch.length > 0 && exerciseSearch.length < 3 && (
                    <p style={{ padding: '8px 0', fontSize: 11, color: 'var(--text-tertiary)' }}>Type {3 - exerciseSearch.length} more character{3 - exerciseSearch.length > 1 ? 's' : ''} to search...</p>
                  )}
                  <button onClick={() => { setAddingToBlock(null); setExerciseSearch(''); }} style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>Cancel</button>
                </div>
              )}

              {/* Block exercises - inline column layout */}
              {block.type !== 'notes' && (
                <div style={{ padding: '0 16px' }}>
                  {/* Column headers - only show when all exercises share the same tracking type */}
                  {block.exercises.length > 0 && (() => {
                    const types = new Set(block.exercises.map(e => e.tracking_type || 'Repetitions'));
                    if (types.size === 1) {
                      const tt = [...types][0];
                      const vtMap = { 'Repetitions': 'Sets & Reps', 'reps': 'Sets & Reps', 'Duration': 'Duration', 'duration': 'Duration', 'Calories': 'Calories', 'calories': 'Calories', 'Distance': 'Reps Only', 'Meters': 'Reps Only' };
                      return <ExerciseColumnHeaders variableType={vtMap[tt] || 'Sets & Reps'} />;
                    }
                    return null;
                  })()}
                  {block.exercises.map((ex, ei) => {
                    const isExpanded = expandedExercise?.blockId === block.id && expandedExercise?.exIdx === ei;
                    const tt = ex.tracking_type || 'Repetitions';
                    const isReps = tt === 'Repetitions' || tt === 'reps';
                    const isDur = tt === 'Duration' || tt === 'duration';
                    const isDist = tt === 'Distance' || tt === 'Meters';
                    const isCal = tt === 'Calories' || tt === 'calories';
                    const positionLabel = getExerciseLabel(bi, ei, block.exercises.length);
                    const blockColor = getBlockColor(block.type);
                    return (
                    <div key={ei}>
                      {/* Main exercise row */}
                      <div
                        onClick={() => setExpandedExercise(isExpanded ? null : { blockId: block.id, exIdx: ei })}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--divider)', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,140,0,0.03)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {/* Block letter tile (no exercise thumbnails inside workouts) */}
                        <ExerciseThumb
                          name={ex.name}
                          label={positionLabel}
                          color={blockColor}
                          size={36}
                          borderRadius={6}
                        />

                        {/* Exercise name */}
                        <div style={{ flex: 1, minWidth: 100 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 0 }}>{ex.name}</p>
                          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: 0 }}>{tt.toLowerCase()}</p>
                        </div>

                        {/* Inline tracking columns driven by exercise tracking_type */}
                        {isReps && (
                          <>
                            <div style={{ width: 60 }} onClick={e => e.stopPropagation()}>
                              <input value={ex.reps || ''} onChange={e => updateBlockExercise(block.id, ei, 'reps', e.target.value)} placeholder="10" style={colInput} />
                              <span style={colUnit}>reps</span>
                            </div>
                            <div style={{ width: 70 }} onClick={e => e.stopPropagation()}>
                              <input value={ex.prescribed_weight || ''} onChange={e => updateBlockExercise(block.id, ei, 'prescribed_weight', e.target.value)} placeholder="--" style={colInput} />
                              <span style={colUnit}>kg</span>
                            </div>
                          </>
                        )}
                        {isDur && (
                          <>
                            <div style={{ width: 60 }} onClick={e => e.stopPropagation()}>
                              <input value={ex.reps || ''} onChange={e => updateBlockExercise(block.id, ei, 'reps', e.target.value)} placeholder="0:45" style={colInput} />
                              <span style={colUnit}>time</span>
                            </div>
                            <div style={{ width: 60 }} onClick={e => e.stopPropagation()}>
                              <input value={ex.distance || ''} onChange={e => updateBlockExercise(block.id, ei, 'distance', e.target.value)} placeholder="--" style={colInput} />
                              <span style={colUnit}>dist</span>
                            </div>
                          </>
                        )}
                        {isDist && (
                          <>
                            <div style={{ width: 60 }} onClick={e => e.stopPropagation()}>
                              <input value={ex.reps || ''} onChange={e => updateBlockExercise(block.id, ei, 'reps', e.target.value)} placeholder="500" style={colInput} />
                              <span style={colUnit}>meters</span>
                            </div>
                            <div style={{ width: 60 }} onClick={e => e.stopPropagation()}>
                              <input value={ex.distance_time || ''} onChange={e => updateBlockExercise(block.id, ei, 'distance_time', e.target.value)} placeholder="--" style={colInput} />
                              <span style={colUnit}>time</span>
                            </div>
                          </>
                        )}
                        {isCal && (
                          <>
                            <div style={{ width: 60 }} onClick={e => e.stopPropagation()}>
                              <input value={ex.reps || ''} onChange={e => updateBlockExercise(block.id, ei, 'reps', e.target.value)} placeholder="0:45" style={colInput} />
                              <span style={colUnit}>time</span>
                            </div>
                            <div style={{ width: 60 }} onClick={e => e.stopPropagation()}>
                              <input value={ex.distance || ''} onChange={e => updateBlockExercise(block.id, ei, 'distance', e.target.value)} placeholder="--" style={colInput} />
                              <span style={colUnit}>dist</span>
                            </div>
                            <div style={{ width: 50 }} onClick={e => e.stopPropagation()}>
                              <input value={ex.calories || ''} onChange={e => updateBlockExercise(block.id, ei, 'calories', e.target.value)} placeholder="--" style={colInput} />
                              <span style={colUnit}>cal</span>
                            </div>
                          </>
                        )}

                        {/* Action icons */}
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => ei > 0 && moveExercise(block.id, ei, ei - 1)} disabled={ei === 0} style={iconBtn} title="Move up">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
                          </button>
                          <button onClick={() => ei < block.exercises.length - 1 && moveExercise(block.id, ei, ei + 1)} disabled={ei === block.exercises.length - 1} style={iconBtn} title="Move down">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                          </button>
                          <button onClick={() => duplicateExercise(block.id, ei)} style={iconBtn} title="Duplicate">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                          </button>
                          <ExerciseRowMenu
                            canManageAlts={!!ex._weId}
                            onManageAlts={() => setManageAltsFor(ex._weId)}
                            onDelete={() => removeExerciseFromBlock(block.id, ei)}
                          />
                        </div>
                      </div>

                      {/* Expandable detail row */}
                      {isExpanded && (
                        <div style={{ padding: '12px 0 12px 48px', borderBottom: '1px solid var(--divider)', background: 'rgba(255,140,0,0.02)' }}>
                          {/* Notes */}
                          <div style={{ marginBottom: 10 }}>
                            <label style={popoverLabel}>Notes</label>
                            <textarea
                              value={ex.notes || ''}
                              onChange={e => updateBlockExercise(block.id, ei, 'notes', e.target.value)}
                              placeholder="Coaching notes for this exercise..."
                              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--divider)', background: 'var(--bg-card)', color: 'var(--text-primary)', minHeight: 36, resize: 'vertical', lineHeight: 1.4 }}
                            />
                          </div>

                          {/* Tracking + Side + Tempo + Modality */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                            <div>
                              <label style={popoverLabel}>Tracking Field</label>
                              <select value={ex.tracking_type || 'Repetitions'} onChange={e => updateBlockExercise(block.id, ei, 'tracking_type', e.target.value)} style={popoverSelect}>
                                {TRACKING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={popoverLabel}>Side Info</label>
                              <select value={ex.per_side || 'none'} onChange={e => updateBlockExercise(block.id, ei, 'per_side', e.target.value)} style={popoverSelect}>
                                {SIDE_OPTIONS.map(s => <option key={s} value={s.toLowerCase().replace(' ', '_')}>{s}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={popoverLabel}>Tempo</label>
                              <input value={ex.tempo || ''} onChange={e => updateBlockExercise(block.id, ei, 'tempo', e.target.value)} placeholder="X-X-X-X" style={popoverInput} />
                            </div>
                            <div>
                              <label style={popoverLabel}>Modality</label>
                              <select value={ex.modality || ''} onChange={e => updateBlockExercise(block.id, ei, 'modality', e.target.value)} style={popoverSelect}>
                                <option value="">None</option>
                                {MODALITY_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </div>
                          </div>

                          {/* Advanced: RPE, RIR, Weight, Rest, Setwise */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                            <div>
                              <label style={popoverLabel}>RPE</label>
                              <select value={ex.rpe || ''} onChange={e => updateBlockExercise(block.id, ei, 'rpe', e.target.value)} style={popoverSelect}>
                                <option value="">None</option>
                                {[5,6,7,7.5,8,8.5,9,9.5,10].map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={popoverLabel}>RIR</label>
                              <select value={ex.rir || ''} onChange={e => updateBlockExercise(block.id, ei, 'rir', e.target.value)} style={popoverSelect}>
                                <option value="">None</option>
                                {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={popoverLabel}>Setwise Variation</label>
                              <select value={ex.setwise_variation || 'fixed'} onChange={e => updateBlockExercise(block.id, ei, 'setwise_variation', e.target.value)} style={popoverSelect}>
                                {SETWISE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={popoverLabel}>Prescribed Weight</label>
                              <input value={ex.prescribed_weight || ''} onChange={e => updateBlockExercise(block.id, ei, 'prescribed_weight', e.target.value)} placeholder="e.g. 20kg" style={popoverInput} />
                            </div>
                            <div>
                              <label style={popoverLabel}>Rest Override</label>
                              <input type="number" value={ex.rest_override || ''} onChange={e => updateBlockExercise(block.id, ei, 'rest_override', e.target.value)} placeholder="Use block" style={popoverInput} />
                            </div>
                          </div>

                          {/* Interval / phase prescription — for cardio or any exercise
                              that needs a structured phase list (intervals, pyramids,
                              alternating intensities, fartlek, or steady state). */}
                          <div style={{ marginTop: 4 }}>
                            <label style={popoverLabel}>Interval phases (optional)</label>
                            <PhaseEditor
                              value={ex.interval_structure || []}
                              onChange={(phases) => updateBlockExercise(block.id, ei, 'interval_structure', phases.length > 0 ? phases : null)}
                              compact={false}
                            />
                          </div>

                        </div>
                      )}
                    </div>
                    );
                  })}

                  {/* Inline exercise search at bottom of block */}
                  {addingToBlock !== block.id && block.exercises.length > 0 && (
                    <div style={{ padding: '8px 0' }}>
                      <input
                        value=""
                        onFocus={() => { setAddingToBlock(block.id); setExerciseSearch(''); }}
                        placeholder="Add Exercise"
                        readOnly
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px dashed var(--divider)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer' }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Notes-only block */}
              {block.type === 'notes' && (
                <div style={{ padding: 16 }}>
                  <textarea value={block.note || ''} onChange={e => updateBlock(block.id, 'note', e.target.value)} placeholder="Add coaching notes..." className="input-field" style={{ minHeight: 60, fontSize: 13 }} />
                </div>
              )}

              {/* Rest section - below exercises */}
              {block.type !== 'notes' && block.exercises.length > 0 && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--accent)', display: 'inline-block' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Rest</span>
                    <input
                      value={block.rest ? (block.rest >= 60 ? `${Math.floor(block.rest/60)}:${String(block.rest%60).padStart(2,'0')}` : `0:${String(block.rest).padStart(2,'0')}`) : '0:30'}
                      onChange={e => {
                        const parts = e.target.value.split(':');
                        const secs = parts.length === 2 ? parseInt(parts[0])*60 + parseInt(parts[1]) : parseInt(e.target.value);
                        if (!isNaN(secs)) updateBlock(block.id, 'rest', secs);
                      }}
                      style={{ width: 50, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--divider)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12, textAlign: 'center', fontWeight: 600 }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* + Add Block button */}
          <button onClick={addBlock} style={{
            width: '100%', padding: '14px', borderRadius: 12, border: '2px dashed var(--divider)',
            background: 'none', color: 'var(--accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            marginBottom: 20,
          }}>
            + Add Block
          </button>
        </div>

        {/* Right sidebar — Manage Alternates (takes priority) or exercise inspector */}
        <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--divider)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {manageAltsFor ? (
            <ManageAlternatesPanel
              workoutExerciseId={manageAltsFor}
              token={token}
              onClose={() => setManageAltsFor(null)}
            />
          ) : inspectorExercise ? (
            <div style={{ padding: 16, overflow: 'auto' }}>
              {inspectorExercise.thumbnail_url && (
                <img src={inspectorExercise.thumbnail_url} alt="" style={{ width: '100%', borderRadius: 10, marginBottom: 12 }} />
              )}
              <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{inspectorExercise.name}</h4>
              {inspectorExercise.body_part && <p style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 8 }}>{inspectorExercise.body_part}</p>}
              {inspectorExercise.description && <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>{inspectorExercise.description?.substring(0, 200)}</p>}
              {inspectorExercise.demo_video_url && (
                <a href={inspectorExercise.demo_video_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>Watch demo video</a>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // ===== WORKOUT LIST =====
  return (
    <>
    <div style={{ padding: '24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Workouts</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{workouts.length} workouts</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setEditingFollowAlong('new')} style={{
            background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--divider)',
            borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>+ New Follow-Along</button>
          <button onClick={() => { setCreating(true); setSelectedWorkout(null); setBlocks([]); setWorkoutForm({ title: '', description: '', tags: '', program_id: '', week_number: 1, day_number: 1, duration_mins: 30, intensity: 'Medium', body_parts: '', workout_type: 'strength', image_url: '' }); }} style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>+ New Workout</button>
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 100px 100px 80px', padding: '10px 16px', borderBottom: '1px solid var(--divider)', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
          <span>Workout</span><span>Program</span><span>Week/Day</span><span>Duration</span><span>Type</span>
        </div>
        {workouts.slice(0, 50).map(w => {
          const personalisedCount = overrideCounts[w.id] || 0;
          return (
          <div key={w.id} onClick={() => loadWorkout(w)} style={{
            display: 'grid', gridTemplateColumns: '1fr 160px 100px 100px 80px', padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', alignItems: 'center',
          }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,140,0,0.04)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</p>
              {personalisedCount > 0 && (
                <span
                  title={`${personalisedCount} client${personalisedCount === 1 ? '' : 's'} have a personalised version of this workout`}
                  style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                    background: 'rgba(10,132,255,0.15)', color: '#0A84FF',
                    textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >{personalisedCount} personalised</span>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{w.program_title || '-'}</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>W{w.week_number} D{w.day_number}</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{w.duration_mins || '?'} min</p>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
              background: w.workout_type === 'follow_along' ? 'rgba(10,132,255,0.15)' : 'rgba(255,140,0,0.1)',
              color: w.workout_type === 'follow_along' ? '#0A84FF' : 'var(--accent)',
              textTransform: 'capitalize', whiteSpace: 'nowrap',
            }}>{w.workout_type === 'follow_along' ? 'Follow-Along' : w.workout_type}</span>
          </div>
          );
        })}
      </div>

    </div>

    {driftPrompt && (
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        onClick={() => !driftPrompt.submitting && setDriftPrompt(null)}
      >
        <div
          style={{ background: 'var(--bg-primary)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--divider)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: '22px 24px 12px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
              {driftPrompt.clients.length} client{driftPrompt.clients.length === 1 ? ' has' : 's have'} a personalised version
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Tick which clients should receive your new template for "{driftPrompt.workoutTitle}". Unticked clients keep their personal version.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 16, padding: '0 24px 8px' }}>
            <button
              onClick={driftSelectAll}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >Select all</button>
            <button
              onClick={driftClearAll}
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >Clear</button>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '4px 12px 12px' }}>
            {driftPrompt.clients.map(c => {
              const checked = driftPrompt.selected.has(c.user_id);
              return (
                <label
                  key={c.user_id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    background: checked ? 'rgba(10, 132, 255, 0.08)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDriftClient(c.user_id)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }}
                  />
                  {c.photo_url ? (
                    <img src={c.photo_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {(c.name || c.email || '?').trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name || c.email || `Client #${c.user_id}`}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      Personalised {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : ''}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div style={{ padding: '14px 24px 20px', borderTop: '1px solid var(--divider)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              onClick={() => setDriftPrompt(null)}
              disabled={driftPrompt.submitting}
              style={{ background: 'var(--bg-card)', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', opacity: driftPrompt.submitting ? 0.5 : 1 }}
            >Keep all personalised</button>
            <button
              onClick={applyDriftToSelected}
              disabled={driftPrompt.submitting || driftPrompt.selected.size === 0}
              style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: (driftPrompt.submitting || driftPrompt.selected.size === 0) ? 0.5 : 1 }}
            >{driftPrompt.submitting ? 'Applying...' : `Apply to ${driftPrompt.selected.size || ''} selected`.trim()}</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ═══════════════════════════════════════════════
// MANAGE ALTERNATES PANEL (right-sidebar, inline)
// ═══════════════════════════════════════════════
function ManageAlternatesPanel({ workoutExerciseId, token, onClose }) {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expandedAltId, setExpandedAltId] = useState(null); // which alt row is open for editing

  useEffect(() => {
    fetch(`/api/content/workout-exercises/${workoutExerciseId}/alternates`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(setData)
      .catch(err => console.error('Load alternates error:', err));
  }, [workoutExerciseId]);

  const toggle = (id) => {
    setData(d => ({ ...d, alternates: d.alternates.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a) }));
  };

  const patchAlt = (id, patch) => {
    setData(d => ({ ...d, alternates: d.alternates.map(a => a.id === id ? { ...a, ...patch } : a) }));
  };

  const move = (idx, dir) => {
    setData(d => {
      const next = [...d.alternates];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return d;
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...d, alternates: next.map((a, i) => ({ ...a, sort_order: i })) };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/content/workout-exercises/${workoutExerciseId}/alternates`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alternates_disabled: !!data.alternates_disabled,
          alternates: data.alternates.map((a, i) => ({
            id: a.id,
            enabled: !!a.enabled,
            sort_order: i,
            // Per-alt metric overrides. All nullable — blank = inherit primary.
            sets: Number.isFinite(a.sets) ? a.sets : null,
            reps: a.reps || null,
            duration_secs: Number.isFinite(a.duration_secs) ? a.duration_secs : null,
            rest_secs: Number.isFinite(a.rest_secs) ? a.rest_secs : null,
            tracking_type: a.tracking_type || null,
            notes: a.notes || null,
            interval_structure: Array.isArray(a.interval_structure) && a.interval_structure.length > 0
              ? a.interval_structure
              : null,
          })),
        }),
      });
      onClose();
    } catch (err) {
      console.error('Save alternates error:', err);
    }
    setSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-card)' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', fontSize: 20, lineHeight: 1, color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}>×</button>
        <h3 style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>Manage Alternates</h3>
        <button
          onClick={save}
          disabled={!data || saving}
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (!data || saving) ? 0.5 : 1 }}
        >
          {saving ? 'Saving…' : 'Done'}
        </button>
      </div>

      {!data ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>Loading…</div>
      ) : (
        <>
          {/* Master disable */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--divider)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!data.alternates_disabled}
                onChange={e => setData({ ...data, alternates_disabled: e.target.checked })}
              />
              Disable Alternates for this slot
            </label>
          </div>

          {/* Primary */}
          {data.primary && (
            <div style={{ padding: '10px 16px', background: 'rgba(10,132,255,0.08)', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <ExerciseThumb name={data.primary.name} size={40} borderRadius={8} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: '#0A84FF', textTransform: 'uppercase', letterSpacing: 0.5 }}>Primary</p>
                <p style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.primary.name}</p>
              </div>
            </div>
          )}

          {/* Alternates list */}
          <div style={{ flex: 1, overflowY: 'auto', opacity: data.alternates_disabled ? 0.4 : 1, pointerEvents: data.alternates_disabled ? 'none' : 'auto' }}>
            {data.alternates.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                No alternates linked. Add them in Exercise Library.
              </div>
            ) : (
              data.alternates.map((alt, idx) => {
                const isOpen = expandedAltId === alt.id;
                // Display summary under the name — "3 sets · 40 min · Duration" or "5 phases · 15:00 total"
                const hasPhases = Array.isArray(alt.interval_structure) && alt.interval_structure.length > 0;
                const totalPhaseSecs = hasPhases
                  ? alt.interval_structure.reduce((s, p) => s + (Number(p.duration_secs) || 0), 0)
                  : 0;
                const metricSummary = hasPhases
                  ? `${alt.interval_structure.length} phase${alt.interval_structure.length === 1 ? '' : 's'} · ${Math.round(totalPhaseSecs / 60)} min`
                  : (alt.duration_secs || alt.sets || alt.reps || alt.tracking_type)
                    ? [
                        alt.sets ? `${alt.sets} set${alt.sets === 1 ? '' : 's'}` : null,
                        alt.duration_secs ? `${Math.round(alt.duration_secs / 60)} min` : null,
                        alt.reps ? `${alt.reps} reps` : null,
                        alt.tracking_type && alt.tracking_type !== 'Repetitions' ? alt.tracking_type : null,
                      ].filter(Boolean).join(' · ')
                    : 'Inherits primary metrics';

                return (
                  <div key={alt.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px' }}>
                      <input
                        type="checkbox"
                        checked={!!alt.enabled}
                        onChange={() => toggle(alt.id)}
                      />
                      <ExerciseThumb name={alt.name} size={36} borderRadius={6} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alt.name}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{metricSummary}</p>
                      </div>
                      <button
                        onClick={() => setExpandedAltId(isOpen ? null : alt.id)}
                        style={{
                          background: isOpen ? 'rgba(255,140,0,0.15)' : 'none',
                          border: '1px solid var(--divider)', borderRadius: 6,
                          color: isOpen ? 'var(--accent)' : 'var(--text-secondary)',
                          cursor: 'pointer', fontSize: 11, fontWeight: 600,
                          padding: '4px 10px', whiteSpace: 'nowrap',
                        }}
                        title="Edit metrics + intervals for this alternative"
                      >{isOpen ? 'Close' : 'Edit metrics'}</button>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button onClick={() => move(idx, -1)} disabled={idx === 0} style={{ ...iconBtn, opacity: idx === 0 ? 0.3 : 1 }} title="Move up">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
                        </button>
                        <button onClick={() => move(idx, 1)} disabled={idx === data.alternates.length - 1} style={{ ...iconBtn, opacity: idx === data.alternates.length - 1 ? 0.3 : 1 }} title="Move down">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <AlternateMetricEditor
                        alt={alt}
                        onChange={(patch) => patchAlt(alt.id, patch)}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// PER-ALTERNATIVE METRIC EDITOR
// Collapsible form under an alternate row in ManageAlternatesPanel. Lets
// the coach override sets/duration/rest + set up phase-list intervals for
// that specific alt (e.g. "if client swaps to rowing, do 5km at Z2").
// ═══════════════════════════════════════════════
function AlternateMetricEditor({ alt, onChange }) {
  const parseDurationText = (txt) => {
    if (!txt) return null;
    const s = String(txt).trim();
    if (s.includes(':')) {
      const [m, sec] = s.split(':').map(n => parseInt(n, 10) || 0);
      return m * 60 + sec;
    }
    if (/^\d+\s*m$/i.test(s)) return parseInt(s, 10) * 60;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  };
  const fmtSecs = (s) => {
    if (!s) return '';
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    if (r === 0) return `${m}`;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  return (
    <div style={{
      padding: '12px 16px 16px', background: 'rgba(255,255,255,0.02)',
      borderTop: '1px solid var(--divider)',
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Metric overrides — blank fields inherit the primary exercise
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3 }}>Sets</p>
          <input
            type="number" min="1"
            value={alt.sets ?? ''}
            onChange={e => onChange({ sets: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder="—"
            style={miniInput}
          />
        </div>
        <div>
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3 }}>Duration</p>
          <input
            type="text"
            value={alt.duration_secs ? fmtSecs(alt.duration_secs) : ''}
            onChange={e => onChange({ duration_secs: parseDurationText(e.target.value) })}
            placeholder="mm:ss"
            style={miniInput}
          />
        </div>
        <div>
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3 }}>Rest</p>
          <input
            type="text"
            value={alt.rest_secs ? fmtSecs(alt.rest_secs) : ''}
            onChange={e => onChange({ rest_secs: parseDurationText(e.target.value) })}
            placeholder="mm:ss"
            style={miniInput}
          />
        </div>
        <div>
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3 }}>Tracking</p>
          <select
            value={alt.tracking_type || ''}
            onChange={e => onChange({ tracking_type: e.target.value || null })}
            style={miniInput}
          >
            <option value="">— inherit</option>
            <option value="Duration">Duration</option>
            <option value="Distance">Distance</option>
            <option value="Meters">Meters</option>
            <option value="Calories">Calories</option>
            <option value="Repetitions">Reps</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3 }}>Coach note (shown to client)</p>
        <input
          type="text"
          value={alt.notes || ''}
          onChange={e => onChange({ notes: e.target.value || null })}
          placeholder="e.g. Keep HR in Z2. Steady cadence."
          style={miniInput}
        />
      </div>

      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Interval phases (optional) — overrides Duration / Rest above
      </p>
      <PhaseEditor
        value={alt.interval_structure || []}
        onChange={(phases) => onChange({ interval_structure: phases })}
        compact={true}
      />
    </div>
  );
}

const miniInput = {
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--divider)',
  borderRadius: 6,
  padding: '5px 8px',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
};

// ═══════════════════════════════════════════════
// TRACKING POPOVER
// ═══════════════════════════════════════════════
function TrackingPopover({ exercise, onChange, onClose }) {
  const trackType = exercise.tracking_type || 'Repetitions';
  const isDuration = trackType === 'Duration' || trackType === 'duration';
  const valueConfig = {
    'Repetitions': { label: 'Reps', placeholder: '10', suffix: 'reps', inputType: 'text' },
    'Duration': { label: 'Time (mm:ss)', placeholder: '1:30', suffix: '', inputType: 'text' },
    'Distance': { label: 'Distance', placeholder: '500', suffix: 'm', inputType: 'number' },
    'Meters': { label: 'Meters', placeholder: '500', suffix: 'm', inputType: 'number' },
    'Calories': { label: 'Calories', placeholder: '15', suffix: 'cal', inputType: 'number' },
    'reps': { label: 'Reps', placeholder: '10', suffix: 'reps', inputType: 'text' },
  };
  const vc = valueConfig[trackType] || valueConfig['Repetitions'];
  const secTrackType = exercise.secondary_tracking_type || 'Repetitions';
  const secVc = valueConfig[secTrackType] || valueConfig['Repetitions'];

  return (
    <div style={{
      margin: '8px 0 4px 0', padding: '16px 16px 20px', background: 'var(--bg-primary)',
      border: '1px solid var(--divider)', borderRadius: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h4 style={{ fontSize: 13, fontWeight: 700 }}>Manage Tracking</h4>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16 }}>x</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div>
          <label style={popoverLabel}>Tracking Field</label>
          <select value={trackType} onChange={e => onChange('tracking_type', e.target.value)} style={popoverSelect}>
            {TRACKING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={popoverLabel}>Setwise Variation</label>
          <select value={exercise.setwise_variation || 'fixed'} onChange={e => onChange('setwise_variation', e.target.value)} style={popoverSelect}>
            {SETWISE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Value input - changes based on tracking type */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div>
          <label style={popoverLabel}>{vc.label}</label>
          {isDuration ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                value={exercise.duration_mins || ''}
                onChange={e => onChange('duration_mins', e.target.value)}
                placeholder="0"
                style={{ ...popoverInput, width: '40%', textAlign: 'center' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>m</span>
              <input
                value={exercise.duration_secs || exercise.reps || ''}
                onChange={e => onChange('reps', e.target.value)}
                placeholder="30"
                style={{ ...popoverInput, width: '40%', textAlign: 'center' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>s</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type={vc.inputType} value={exercise.reps || ''} onChange={e => onChange('reps', e.target.value)} placeholder={vc.placeholder} style={popoverInput} />
              {vc.suffix && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{vc.suffix}</span>}
            </div>
          )}
        </div>
        <div>
          <label style={popoverLabel}>Side Info</label>
          <select value={exercise.per_side || 'none'} onChange={e => onChange('per_side', e.target.value)} style={popoverSelect}>
            {SIDE_OPTIONS.map(s => <option key={s} value={s.toLowerCase().replace(' ', '_')}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Specify different for male & female */}
      {isDuration && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={exercise.gender_specific || false} onChange={e => onChange('gender_specific', e.target.checked)} />
            Specify different for male & female
          </label>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <label style={popoverLabel}>Tempo</label>
          <input value={exercise.tempo || ''} onChange={e => onChange('tempo', e.target.value)} placeholder="X - X - X - X  EPCP" style={popoverInput} />
        </div>
        <div>
          <label style={popoverLabel}>Modality</label>
          <select value={exercise.modality || ''} onChange={e => onChange('modality', e.target.value)} style={popoverSelect}>
            <option value="">None</option>
            {MODALITY_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Advanced Settings toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--divider)' }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Advanced Settings</label>
        <button
          onClick={() => onChange('showAdvanced', !exercise.showAdvanced)}
          style={{
            width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: exercise.showAdvanced ? 'var(--accent)' : 'var(--divider)',
            position: 'relative', transition: 'background 0.2s',
          }}
        >
          <div style={{
            width: 20, height: 20, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 2,
            left: exercise.showAdvanced ? 20 : 2, transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </button>
      </div>

      {/* Advanced settings panel */}
      {exercise.showAdvanced && (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--divider)' }}>
          {/* RIR + RPE */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={popoverLabel}>RIR (Reps in Reserve)</label>
              <select value={exercise.rir || ''} onChange={e => onChange('rir', e.target.value)} style={popoverSelect}>
                <option value="">None</option>
                {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={popoverLabel}>RPE (Effort 1-10)</label>
              <select value={exercise.rpe || ''} onChange={e => onChange('rpe', e.target.value)} style={popoverSelect}>
                <option value="">None</option>
                {[5,6,7,7.5,8,8.5,9,9.5,10].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* Prescribed Weight */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={popoverLabel}>Prescribed Weight</label>
              <input value={exercise.prescribed_weight || ''} onChange={e => onChange('prescribed_weight', e.target.value)} placeholder="e.g. 20kg, bodyweight" style={popoverInput} />
            </div>
            <div>
              <label style={popoverLabel}>Rest Override (secs)</label>
              <input type="number" value={exercise.rest_override || ''} onChange={e => onChange('rest_override', e.target.value)} placeholder="Use block rest" style={popoverInput} />
            </div>
          </div>

          {/* Secondary Tracking */}
          <div style={{ paddingTop: 10, borderTop: '1px solid var(--divider)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: exercise.secondary_tracking ? 8 : 0 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>Secondary Tracking</label>
              <button
                onClick={() => onChange('secondary_tracking', !exercise.secondary_tracking)}
                style={{
                  width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: exercise.secondary_tracking ? 'var(--accent)' : 'var(--divider)',
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 2,
                  left: exercise.secondary_tracking ? 18 : 2, transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
            </div>
            {exercise.secondary_tracking && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <select value={secTrackType} onChange={e => onChange('secondary_tracking_type', e.target.value)} style={popoverSelect}>
                    {TRACKING_TYPES.filter(t => t !== trackType).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <input
                    value={exercise.secondary_value || ''}
                    onChange={e => onChange('secondary_value', e.target.value)}
                    placeholder={secVc.placeholder}
                    style={popoverInput}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// EXERCISE MENU (3-dot)
// ═══════════════════════════════════════════════
// Three-dots menu on each exercise row in a workout block
function ExerciseRowMenu({ canManageAlts, onManageAlts, onDelete }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);
  return (
    <div ref={wrapRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={iconBtn}
        title="More actions"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          background: 'var(--bg-card)', border: '1px solid var(--divider)', borderRadius: 8,
          overflow: 'hidden', zIndex: 30, minWidth: 180,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        }}>
          <button
            onClick={() => { if (canManageAlts) { onManageAlts(); setOpen(false); } }}
            disabled={!canManageAlts}
            title={canManageAlts ? '' : 'Save workout first'}
            style={{
              ...menuItem,
              opacity: canManageAlts ? 1 : 0.4,
              cursor: canManageAlts ? 'pointer' : 'not-allowed',
            }}
          >
            Manage Alternates
          </button>
          <button onClick={() => { onDelete(); setOpen(false); }} style={{ ...menuItem, color: '#FF3B30' }}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function ExerciseMenu({ onDelete, onInspect, onManageTracking, onAddNote }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, background: 'var(--bg-card)',
          border: '1px solid var(--divider)', borderRadius: 8, overflow: 'hidden', zIndex: 20,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)', minWidth: 160,
        }}>
          <button onClick={() => { onInspect(); setOpen(false); }} style={menuItem}>View Details</button>
          {onManageTracking && <button onClick={() => { onManageTracking(); setOpen(false); }} style={menuItem}>Manage Tracking</button>}
          {onAddNote && <button onClick={() => { onAddNote(); setOpen(false); }} style={menuItem}>Add Note</button>}
          <button onClick={() => { onDelete(); setOpen(false); }} style={{ ...menuItem, color: '#FF3B30' }}>Delete</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// MINI COMPONENTS
// ═══════════════════════════════════════════════
const labelStyle = { fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 };
const popoverLabel = { fontSize: 10, color: 'var(--text-tertiary)', display: 'block', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase' };
const popoverSelect = { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--divider)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12 };
const popoverInput = { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--divider)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12 };
const menuItem = { display: 'block', width: '100%', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', textAlign: 'left' };
const colInput = { width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--divider)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12, textAlign: 'center', fontWeight: 600 };
const colUnit = { display: 'block', fontSize: 9, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 1, textTransform: 'uppercase' };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 3, borderRadius: 4, display: 'flex', alignItems: 'center' };

// Column headers component
function ExerciseColumnHeaders({ variableType }) {
  const cols = {
    'Sets & Reps': [{ label: 'EXERCISE', flex: true }, { label: 'REPS', w: 60 }, { label: 'WEIGHT', w: 70 }, { label: '', w: 96 }],
    'Reps Only': [{ label: 'EXERCISE', flex: true }, { label: 'REPS', w: 60 }, { label: '', w: 96 }],
    'Duration': [{ label: 'EXERCISE', flex: true }, { label: 'DURATION', w: 60 }, { label: 'DISTANCE', w: 60 }, { label: '', w: 96 }],
    'Calories': [{ label: 'EXERCISE', flex: true }, { label: 'DURATION', w: 60 }, { label: 'DISTANCE', w: 60 }, { label: 'CALORIES', w: 50 }, { label: '', w: 96 }],
  };
  const headers = cols[variableType] || cols['Sets & Reps'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--divider)' }}>
      <div style={{ width: 40, flexShrink: 0 }} />
      {headers.map((h, i) => (
        <span key={i} style={{
          fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase',
          flex: h.flex ? 1 : undefined,
          width: h.flex ? undefined : h.w,
          textAlign: h.flex ? 'left' : 'center',
          minWidth: h.flex ? 100 : undefined,
        }}>{h.label}</span>
      ))}
    </div>
  );
}
