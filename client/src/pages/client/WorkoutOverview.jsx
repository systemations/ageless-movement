import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import WorkoutPlayer from './WorkoutPlayer';

export default function WorkoutOverview({ workoutId, onBack }) {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [showAlternatives, setShowAlternatives] = useState(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    fetch(`/api/explore/workouts/${workoutId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(setData)
      .catch(console.error);
  }, [workoutId]);

  if (playing && data) {
    return <WorkoutPlayer workout={data.workout} exercises={data.exercises} onBack={() => setPlaying(false)} />;
  }

  if (!data) return (
    <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );

  const { workout, exercises } = data;

  // Group exercises by group_type
  const groups = [];
  let currentGroup = null;
  exercises.forEach((ex, i) => {
    if (ex.group_type && ex.group_type === currentGroup?.type) {
      currentGroup.exercises.push(ex);
    } else {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = {
        type: ex.group_type,
        label: ex.group_type ? `${ex.sets} Sets ${ex.group_type.toUpperCase()}` : null,
        exercises: [ex],
      };
    }
  });
  if (currentGroup) groups.push(currentGroup);

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      {/* Hero */}
      <div style={{
        margin: '-16px -16px 0', minHeight: 220, position: 'relative',
        background: 'var(--bg-card)',
        display: 'flex', alignItems: 'flex-end',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--bg-primary) 0%, transparent 60%)' }} />
        <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', gap: 8 }}>
          <button onClick={onBack} style={{
            width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        </div>
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 }}>
          <button style={{ background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
          </button>
          <button style={{ background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        </div>
        <div style={{ position: 'relative', padding: '20px 16px', width: '100%' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{workout.title}</h1>
        </div>
      </div>

      {/* Metadata */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{workout.duration_mins} mins</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{workout.intensity}</span>
        </div>
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {workout.body_parts?.split(',').map(p => (
          <span key={p} style={{ fontSize: 12, background: 'var(--bg-card)', padding: '4px 12px', borderRadius: 20, color: 'var(--text-secondary)' }}>
            {p.trim()}
          </span>
        ))}
      </div>

      {/* Equipment */}
      {workout.equipment && (
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          Equipment: {workout.equipment}
        </p>
      )}

      {workout.description && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
          {workout.description}
        </p>
      )}

      <div className="divider" />

      {/* Exercise List */}
      {groups.map((group, gi) => (
        <div key={gi} style={{ marginBottom: 16 }}>
          {/* Group label */}
          {group.label && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-orange)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-orange)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {group.label}
              </span>
            </div>
          )}

          {group.exercises.map((ex, ei) => (
            <div key={ex.id} style={{ marginBottom: 4 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                {/* Thumbnail */}
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-card)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid var(--divider)',
                }}>
                  <span style={{ fontSize: 16, opacity: 0.4 }}>💪</span>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{ex.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ex.reps} {ex.reps?.includes(':') || ex.reps?.includes('s') ? '' : 'reps'}</p>
                </div>

                {/* Swap icon */}
                {ex.alternatives && ex.alternatives.length > 0 && (
                  <button
                    onClick={() => setShowAlternatives(ex)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: 4 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Rest between groups */}
          {group.type && gi < groups.length - 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
              color: 'var(--text-tertiary)', fontSize: 13,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Rest 0:30
            </div>
          )}
        </div>
      ))}

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
            <h3 style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 16 }}>Exercise Alternatives</h3>

            {/* Primary */}
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-orange)', marginBottom: 8, letterSpacing: 0.5 }}>PRIMARY</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--divider)', marginBottom: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 16, opacity: 0.4 }}>💪</span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{showAlternatives.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{showAlternatives.reps} reps</p>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--accent)', padding: 4 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </button>
            </div>

            {/* Alternatives */}
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-orange)', marginBottom: 8, letterSpacing: 0.5 }}>ALTERNATIVES</p>
            {showAlternatives.alternatives.map((alt) => (
              <div key={alt.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer',
              }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 16, opacity: 0.4 }}>💪</span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{alt.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{alt.reps || showAlternatives.reps} reps</p>
                </div>
                <button style={{ background: 'none', border: 'none', color: 'var(--accent)', padding: 4 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Start Button */}
      <div style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        maxWidth: 480, width: 'calc(100% - 32px)', padding: '12px 0',
        background: 'linear-gradient(to top, var(--bg-primary) 70%, transparent)',
      }}>
        <button className="btn-primary" onClick={() => setPlaying(true)} style={{ fontSize: 17 }}>
          Start
        </button>
      </div>
    </div>
  );
}
