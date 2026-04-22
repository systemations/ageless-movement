import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import WorkoutPlayer from './WorkoutPlayer';
import FollowAlongPlayer from './FollowAlongPlayer';
import ExerciseDetailModal from '../../components/ExerciseDetailModal';
import ExerciseThumb, { getExerciseLabel } from '../../components/ExerciseThumb';
import FavButton from '../../components/FavButton';
import WorkoutThumb from '../../components/WorkoutThumb';

const BLOCK_COLORS = {
  standard: '#FF8C00',
  warmup: '#FFD60A',
  superset: '#0A84FF',
  triset: '#30D158',
  circuit: '#FF9500',
  amrap: '#FF453A',
  tabata: '#FF375F',
  emom: '#BF5AF2',
  notes: '#8E8E93',
};

const BLOCK_LABELS = {
  standard: 'Straight Sets',
  warmup: 'Warm Up',
  superset: 'Superset',
  triset: 'Triset',
  circuit: 'Circuit',
  amrap: 'AMRAP',
  tabata: 'Tabata',
  emom: 'EMOM',
  notes: 'Notes',
};

const getBlockColor = (type) => BLOCK_COLORS[type] || '#FF8C00';
const getBlockLabel = (type, label) => {
  const typeName = BLOCK_LABELS[type] || type?.toUpperCase() || 'Block';
  return label ? `${label} - ${typeName}` : typeName;
};

export default function WorkoutOverview({ workoutId, onBack, previewMode = false, prefillScheduleDate = null }) {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [showAlternatives, setShowAlternatives] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => prefillScheduleDate || new Date().toISOString().split('T')[0]);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState('');
  const [swappedExercises, setSwappedExercises] = useState({});
  const [showExDetail, setShowExDetail] = useState(null);
  // Client dose overrides keyed by workout_exercise_id. Non-null values are
  // this-session-only duration targets the client picked for themselves -
  // they replace the coach's prescribed duration without touching modality.
  // Logged to workout_logs on complete so the coach sees what the client did.
  const [durationOverrides, setDurationOverrides] = useState({});

  useEffect(() => {
    fetch(`/api/explore/workouts/${workoutId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(setData)
      .catch(console.error);
  }, [workoutId]);

  if (playing && data) {
    if (data.workout?.workout_type === 'follow_along') {
      return <FollowAlongPlayer workout={data.workout} onBack={() => setPlaying(false)} />;
    }
    // Apply client-side per-exercise overrides (swap + duration tweak) to
    // the exercise list before handing it to the player. The coach's
    // template is untouched on the server - these mutations are session-
    // scoped and get logged alongside the completion.
    const exercisesForPlayer = (data.exercises || []).map(ex => {
      const swap = swappedExercises[ex.id];
      let out = ex;
      if (swap) {
        out = {
          ...ex,
          name: swap.name,
          // Alt's own metric overrides win over the primary's
          reps: swap.reps || ex.reps,
          duration_secs: swap.duration_secs ?? ex.duration_secs,
          meta_duration_secs: swap.duration_secs ?? ex.meta_duration_secs,
          tracking_type: swap.tracking_type || ex.tracking_type,
          meta_tracking_type: swap.tracking_type || ex.meta_tracking_type,
          interval_structure: Array.isArray(swap.interval_structure) && swap.interval_structure.length > 0
            ? swap.interval_structure
            : ex.interval_structure,
          thumbnail_url: swap.thumbnail_url || ex.thumbnail_url,
          _swapped_to: swap.name,
        };
      }
      // Client duration override stacks on top of swap.
      if (durationOverrides[ex.id] != null) {
        out = {
          ...out,
          duration_secs: durationOverrides[ex.id],
          meta_duration_secs: durationOverrides[ex.id],
          _client_duration_override: durationOverrides[ex.id],
        };
      }
      return out;
    });
    return <WorkoutPlayer workout={data.workout} exercises={exercisesForPlayer} onBack={() => setPlaying(false)} />;
  }

  if (!data) return (
    <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );

  // Defensive: if the API returned an error payload or missing fields,
  // render a friendly fallback instead of crashing on destructure.
  if (data.error || !data.workout || !Array.isArray(data.exercises)) {
    return (
      <div className="page-content" style={{ padding: 24, textAlign: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Workout unavailable</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          {data.error || "We couldn't load this workout. Please try again."}
        </p>
        <button
          onClick={onBack}
          style={{
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: 'var(--accent)', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >Back</button>
      </div>
    );
  }

  const { workout, exercises } = data;
  const isFollowAlong = workout?.workout_type === 'follow_along';

  // Group exercises by group_label (A, B, C, D...) so supersets with different letters stay separate
  const groups = [];
  let currentGroup = null;
  exercises.forEach((ex) => {
    const groupKey = ex.group_label || null;
    if (groupKey && groupKey === currentGroup?.groupKey) {
      currentGroup.exercises.push(ex);
    } else {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = {
        groupKey,
        type: ex.group_type,
        label: ex.group_label,
        sets: ex.sets,
        exercises: [ex],
      };
    }
  });
  if (currentGroup) groups.push(currentGroup);

  const formatDurationSecs = (secs) => {
    if (!secs || secs <= 0) return '';
    if (secs >= 60 && secs % 60 === 0) return `${secs / 60} min`;
    if (secs >= 60) {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${m}:${String(s).padStart(2, '0')}`;
    }
    return `${secs}s`;
  };

  const formatTracking = (ex) => {
    // Interval phase list trumps every other metric display. A cardio row
    // with phases gets a short summary like "5 phases · 40 min" or
    // "5 × (3:00 / 2:00)". Player steps through the phases.
    if (Array.isArray(ex.interval_structure) && ex.interval_structure.length > 0) {
      return formatIntervalSummary(ex.interval_structure);
    }
    const tt = ex.meta_tracking_type || ex.tracking_type || 'Repetitions';
    const val = String(ex.reps || '');
    const sideRaw = ex.meta_per_side || ex.per_side;
    const side = sideRaw != null ? String(sideRaw) : '';
    const sideLabel = side && side !== 'none' ? ` / ${side.replace(/_/g, ' ')}` : '';
    const looksLikeTime = val.includes(':') || val.endsWith('s') || val.endsWith('m');
    if (tt === 'Duration' || tt === 'duration' || looksLikeTime) {
      // Prefer explicit duration_secs over whatever is in reps (which may
      // just be a leftover default like "10" for cardio rows).
      const durSecs = ex.meta_duration_secs || ex.duration_secs;
      if (durSecs) return formatDurationSecs(durSecs) + sideLabel;
      return val + sideLabel;
    }
    if (tt === 'Calories' || tt === 'calories') return val + ' cal' + sideLabel;
    if (tt === 'Distance' || tt === 'Meters') return val + 'm' + sideLabel;
    return val + ' reps' + sideLabel;
  };

  // Render a concise human-readable summary of an interval phase list.
  // Collapses uniform patterns ("5 × 3:00 / 2:00") but falls back to a
  // phase count + total duration for irregular structures (pyramids).
  function formatIntervalSummary(phases) {
    const total = phases.reduce((s, p) => s + (Number(p.duration_secs) || 0), 0);
    const totalLabel = formatDurationSecs(total);
    if (phases.length === 1) {
      return totalLabel; // steady state / fartlek
    }
    // Detect uniform N × (work/rest) pattern: work phases share duration,
    // rest phases share duration, phases alternate work/rest.
    const workPhases = phases.filter(p => p.intensity !== 'rest');
    const restPhases = phases.filter(p => p.intensity === 'rest');
    if (workPhases.length > 1 && workPhases.every(p => p.duration_secs === workPhases[0].duration_secs) &&
        restPhases.every(p => p.duration_secs === (restPhases[0]?.duration_secs))) {
      const w = formatDurationSecs(workPhases[0].duration_secs);
      if (restPhases.length === 0) return `${workPhases.length} × ${w} (${totalLabel} total)`;
      const r = formatDurationSecs(restPhases[0].duration_secs);
      return `${workPhases.length} × ${w} / ${r} (${totalLabel} total)`;
    }
    return `${phases.length} phases · ${totalLabel}`;
  }

  const handleSwap = (originalExId, alt) => {
    setSwappedExercises(prev => ({ ...prev, [originalExId]: alt }));
    setShowAlternatives(null);
  };

  const handleResetSwap = (originalExId) => {
    setSwappedExercises(prev => {
      const next = { ...prev };
      delete next[originalExId];
      return next;
    });
    setShowAlternatives(null);
  };

  // Get display exercise (swapped or original)
  const getDisplayExercise = (ex) => {
    const swap = swappedExercises[ex.id];
    const durOverride = durationOverrides[ex.id];
    let out = ex;
    if (swap) {
      out = {
        ...ex,
        name: swap.name,
        reps: swap.reps || ex.reps,
        duration_secs: swap.duration_secs ?? ex.duration_secs,
        meta_duration_secs: swap.duration_secs ?? ex.meta_duration_secs,
        tracking_type: swap.tracking_type || ex.tracking_type,
        meta_tracking_type: swap.tracking_type || ex.meta_tracking_type,
        interval_structure: Array.isArray(swap.interval_structure) && swap.interval_structure.length > 0
          ? swap.interval_structure
          : ex.interval_structure,
        thumbnail_url: swap.thumbnail_url || ex.thumbnail_url,
      };
    }
    if (durOverride != null) {
      out = { ...out, duration_secs: durOverride, meta_duration_secs: durOverride, _client_duration_override: durOverride };
    }
    return out;
  };

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      {/* Back + Actions row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        {/* Favourite heart - saves this workout to the client's Favourites tab */}
        <div style={{
          width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--divider)',
        }}>
          <FavButton
            itemType="workout"
            itemId={workout.id}
            itemTitle={workout.title}
            itemMeta={`${workout.duration_mins} mins · ${workout.body_parts || ''}`}
            size={18}
          />
        </div>
      </div>

      {/* Hero Card */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16,
        marginBottom: 20, position: 'relative', overflow: 'hidden',
      }}>
        {/* Poster - full-width above the title. WorkoutThumb falls back to
            a light coloured gradient card with the workout title if no image. */}
        <WorkoutThumb
          title={workout.title}
          thumbnailUrl={workout.image_url}
          aspectRatio="16/9"
          borderRadius={0}
          titleFontSize={28}
        />
        <div style={{ padding: '20px 20px 24px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', border: '1px solid rgba(61,255,210,0.08)' }} />
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12, lineHeight: 1.2 }}>{workout.title}</h1>

        {/* Metadata */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{workout.duration_mins} mins</span>
          </div>
          {workout.intensity && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{workout.intensity}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isFollowAlong ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Follow Along Video</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{exercises.length} exercises</span>
              </>
            )}
          </div>
        </div>

        {/* Body part tags */}
        {workout.body_parts && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: workout.description ? 12 : 0 }}>
            {workout.body_parts.split(',').map(p => (
              <span key={p} style={{
                fontSize: 11, background: 'rgba(255,140,0,0.1)', color: 'var(--accent)',
                padding: '4px 10px', borderRadius: 20, fontWeight: 600,
              }}>
                {p.trim()}
              </span>
            ))}
          </div>
        )}

        {/* Equipment - show as pills like body parts, more prominent than the old line */}
        {workout.equipment && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: workout.description ? 12 : 0, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 4 }}>
              Equipment:
            </span>
            {workout.equipment.split(',').map(e => (
              <span key={e} style={{
                fontSize: 11, background: 'rgba(61,255,210,0.1)', color: 'var(--accent-mint)',
                padding: '4px 10px', borderRadius: 20, fontWeight: 600,
              }}>
                {e.trim()}
              </span>
            ))}
          </div>
        )}

        {workout.description && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {workout.description}
          </p>
        )}
        </div>
      </div>

      {/* Exercise List (skipped for follow-along workouts) */}
      {!isFollowAlong && groups.map((group, gi) => {
        const blockColor = getBlockColor(group.type);
        const blockLabel = getBlockLabel(group.type, group.label);

        return (
          <div key={gi} style={{
            marginBottom: 20,
            borderLeft: group.type ? `3px solid ${blockColor}` : 'none',
            paddingLeft: group.type ? 12 : 0,
          }}>
            {/* Block header */}
            {group.type && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 12, paddingBottom: 8,
                borderBottom: `1px solid var(--divider)`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: blockColor,
                  }} />
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: blockColor,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    {blockLabel}
                  </span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)' }}>
                  {group.sets} {group.sets === 1 ? 'set' : 'sets'}
                </span>
              </div>
            )}

            {group.exercises.map((originalEx, exIdx) => {
              const ex = getDisplayExercise(originalEx);
              const isSwapped = !!swappedExercises[originalEx.id];
              const positionLabel = getExerciseLabel(gi, exIdx, group.exercises.length);

              return (
                <div
                  key={originalEx.id}
                  onClick={() => setShowExDetail(ex)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                  }}
                >
                  {/* Block letter tile (no exercise thumbnails inside workouts) */}
                  <ExerciseThumb
                    name={ex.name}
                    label={positionLabel}
                    color={blockColor || '#FF8C00'}
                    size={42}
                    borderRadius={8}
                  />

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: 14, fontWeight: 600 }}>{ex.name}</p>
                      {isSwapped && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: blockColor || 'var(--accent)',
                          background: `${blockColor || 'var(--accent)'}20`,
                          padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase',
                        }}>swapped</span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatTracking(ex)}
                    </p>
                    {(ex.tempo || ex.modality) && (
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {[ex.tempo, ex.modality].filter(Boolean).join(' - ')}
                      </p>
                    )}
                  </div>

                  {/* Swap button */}
                  {originalEx.alternatives && originalEx.alternatives.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowAlternatives({ ...originalEx, _label: positionLabel, _color: blockColor || '#FF8C00' }); }}
                      style={{
                        background: 'none', border: 'none', padding: 6, cursor: 'pointer',
                        color: isSwapped ? (blockColor || 'var(--accent)') : 'var(--text-tertiary)',
                        opacity: isSwapped ? 1 : 0.5,
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}

            {/* Rest between groups */}
            {group.type && gi < groups.length - 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0',
                color: 'var(--text-tertiary)', fontSize: 13,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Rest {(() => { const s = group.exercises[0]?.rest_secs || 30; return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; })()}
              </div>
            )}
          </div>
        );
      })}

      {/* Alternatives Bottom Sheet */}
      {showAlternatives && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
          display: 'flex', alignItems: 'flex-end',
        }} onClick={() => setShowAlternatives(null)}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%',
            maxWidth: 480, margin: '0 auto', padding: '12px 16px 32px',
            maxHeight: '60vh', overflow: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>Swap Exercise</h3>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: 16 }}>
              Choose an alternative for this exercise
            </p>

            {/* Current / Primary */}
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-orange)', marginBottom: 8, letterSpacing: 0.5 }}>
              {swappedExercises[showAlternatives.id] ? 'ORIGINAL' : 'CURRENT'}
            </p>
            <div
              onClick={() => handleResetSwap(showAlternatives.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px',
                borderRadius: 12, marginBottom: 16, cursor: 'pointer',
                background: !swappedExercises[showAlternatives.id] ? 'rgba(255,140,0,0.08)' : 'transparent',
                border: !swappedExercises[showAlternatives.id] ? '1px solid rgba(255,140,0,0.2)' : '1px solid var(--divider)',
              }}
            >
              <ExerciseThumb name={showAlternatives.name} label={showAlternatives._label} color={showAlternatives._color} size={48} borderRadius={10} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{showAlternatives.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatTracking(showAlternatives)}</p>
              </div>
              {!swappedExercises[showAlternatives.id] && (
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              )}
            </div>

            {/* Alternatives */}
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 8, letterSpacing: 0.5 }}>ALTERNATIVES</p>
            {showAlternatives.alternatives.map((alt) => {
              const isSelected = swappedExercises[showAlternatives.id]?.id === alt.id;
              return (
                <div
                  key={alt.id}
                  onClick={() => handleSwap(showAlternatives.id, alt)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px',
                    borderRadius: 12, marginBottom: 8, cursor: 'pointer',
                    background: isSelected ? 'rgba(255,140,0,0.08)' : 'transparent',
                    border: isSelected ? '1px solid rgba(255,140,0,0.2)' : '1px solid var(--divider)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <ExerciseThumb name={alt.name} size={48} borderRadius={10} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{alt.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {alt.reps || showAlternatives.reps} reps
                    </p>
                  </div>
                  {isSelected ? (
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  ) : (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--accent)',
                      padding: '4px 10px', borderRadius: 20,
                      background: 'rgba(255,140,0,0.1)',
                    }}>Use</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Exercise Detail Modal */}
      {showExDetail && (
        <ExerciseDetailModal
          exercise={showExDetail}
          onClose={() => setShowExDetail(null)}
          onSwap={(alt) => {
            if (alt === null) {
              handleResetSwap(showExDetail.id);
            } else {
              handleSwap(showExDetail.id, alt);
            }
          }}
          clientDurationOverride={durationOverrides[showExDetail.id] ?? null}
          onSetDurationOverride={(secs) => {
            setDurationOverrides(prev => {
              const next = { ...prev };
              if (secs == null) delete next[showExDetail.id];
              else next[showExDetail.id] = secs;
              return next;
            });
          }}
        />
      )}

      {/* Bottom action buttons - pinned above the nav.
          In previewMode (opened from the calendar to decide on scheduling),
          the primary CTA is "Add to Schedule". Otherwise it's "Start". */}
      <div style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        maxWidth: 480, width: 'calc(100% - 32px)', padding: '12px 0',
        background: 'linear-gradient(to top, var(--bg-primary) 70%, transparent)',
        display: 'flex', gap: 10,
      }}>
        {previewMode ? (
          <button className="btn-primary" onClick={() => setShowSchedule(true)} style={{ fontSize: 17, flex: 1 }}>
            Add to Schedule
          </button>
        ) : (
          <button className="btn-primary" onClick={() => setPlaying(true)} style={{ fontSize: 17, flex: 1 }}>
            Start
          </button>
        )}
      </div>

      {/* Add to Schedule bottom sheet */}
      {showSchedule && (
        <div
          onClick={() => { if (!scheduling) { setShowSchedule(false); setScheduleMsg(''); } }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
              width: '100%', maxWidth: 480, margin: '0 auto', padding: '16px 20px 32px',
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Add to Schedule</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Pick a day to add <strong style={{ color: 'var(--text-primary)' }}>{workout.title}</strong> to your personal schedule.
            </p>

            <label style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
              Date
            </label>
            <input
              type="date"
              value={scheduleDate}
              onChange={e => setScheduleDate(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                border: '1px solid var(--divider)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', fontSize: 15, marginBottom: 8,
                colorScheme: 'dark',
              }}
            />

            {/* Quick shortcuts */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Today', offset: 0 },
                { label: 'Tomorrow', offset: 1 },
                { label: 'In 3 days', offset: 3 },
                { label: 'Next week', offset: 7 },
              ].map(opt => (
                <button
                  key={opt.label}
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + opt.offset);
                    setScheduleDate(d.toISOString().split('T')[0]);
                  }}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 8,
                    background: 'var(--bg-primary)', border: '1px solid var(--divider)',
                    color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >{opt.label}</button>
              ))}
            </div>

            {scheduleMsg && (
              <p style={{ fontSize: 13, color: 'var(--accent-mint)', textAlign: 'center', marginBottom: 10 }}>
                {scheduleMsg}
              </p>
            )}

            <button
              onClick={async () => {
                setScheduling(true);
                try {
                  const res = await fetch('/api/schedule', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workout_id: workout.id, scheduled_date: scheduleDate }),
                  });
                  if (res.ok) {
                    setScheduleMsg(`Added to ${scheduleDate}`);
                    setTimeout(() => { setShowSchedule(false); setScheduleMsg(''); }, 900);
                  } else {
                    setScheduleMsg('Failed to add - try again');
                  }
                } catch (err) {
                  setScheduleMsg('Network error');
                }
                setScheduling(false);
              }}
              disabled={scheduling}
              className="btn-primary"
              style={{ fontSize: 15, opacity: scheduling ? 0.5 : 1 }}
            >
              {scheduling ? 'Adding…' : 'Add to Schedule'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
