import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import WorkoutOverview from './WorkoutOverview';

// Client-facing challenge detail. Shows all levels as a vertical progression,
// with current/completed/locked state. Tapping an unlocked level opens the
// workout overview. When the user completes that workout, the challenge
// progresses automatically on next load (since level completion is tracked
// via workout_logs + the completed_levels JSON field on user_challenges).
export default function ChallengeDetail({ challengeId, onBack }) {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(null);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => { fetchData(); }, [challengeId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/challenges/${challengeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setData(d);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const enroll = async () => {
    setEnrolling(true);
    try {
      await fetch(`/api/challenges/${challengeId}/enroll`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchData();
    } catch (err) { console.error(err); }
    setEnrolling(false);
  };

  const markLevelComplete = async (levelIdx) => {
    try {
      await fetch(`/api/challenges/${challengeId}/levels/${levelIdx}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchData();
    } catch (err) { console.error(err); }
  };

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (selectedWorkoutId) {
    return <WorkoutOverview
      workoutId={selectedWorkoutId}
      onBack={async () => {
        // When user returns from a workout, refresh challenge state in case they logged it
        setSelectedWorkoutId(null);
        await fetchData();
      }}
    />;
  }

  if (!data?.challenge) {
    return (
      <div className="page-content">
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14 }}>← Back</button>
        <p style={{ marginTop: 20 }}>Challenge not found</p>
      </div>
    );
  }

  const { challenge, levels, enrollment } = data;
  const isEnrolled = !!enrollment;
  const completedLevels = enrollment?.completed_levels || [];
  const currentLevel = enrollment?.current_level || 0;
  const progressPct = levels.length > 0 ? Math.round((completedLevels.length / levels.length) * 100) : 0;
  const isComplete = !!enrollment?.completed_at;

  return (
    <div className="page-content">
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-card)',
          border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16, cursor: 'pointer',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>

      {/* Hero card */}
      <div className="card" style={{ marginBottom: 16, overflow: 'hidden', padding: 0 }}>
        <div style={{
          height: 160,
          background: challenge.image_url
            ? `url(${challenge.image_url}) center/cover`
            : 'linear-gradient(135deg, #1a1a2e, #16213e)',
          display: 'flex', alignItems: 'flex-end', padding: 16, position: 'relative',
        }}>
          <div style={{ position: 'absolute', top: 12, right: 12 }}>
            <span style={{
              fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 12,
              background: 'rgba(0,0,0,0.6)', color: '#fff', letterSpacing: 0.5,
            }}>CHALLENGE</span>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{challenge.title}</h1>
          {challenge.category && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
              background: 'rgba(255,140,0,0.15)', color: 'var(--accent)', marginBottom: 8, display: 'inline-block',
            }}>{challenge.category}</span>
          )}
          {challenge.description && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 8 }}>
              {challenge.description}
            </p>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
            {levels.length} levels
          </div>
        </div>
      </div>

      {/* Progress bar / enrol CTA */}
      {!isEnrolled ? (
        <button
          onClick={enroll}
          disabled={enrolling}
          className="btn-primary"
          style={{ marginBottom: 20, opacity: enrolling ? 0.5 : 1 }}
        >
          {enrolling ? 'Starting...' : 'Start Challenge'}
        </button>
      ) : (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700 }}>
              {isComplete ? 'Challenge Complete!' : 'Your Progress'}
            </p>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-mint)' }}>
              {completedLevels.length} / {levels.length}
            </p>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--divider)', overflow: 'hidden' }}>
            <div style={{
              width: `${progressPct}%`, height: '100%',
              background: isComplete ? 'var(--accent)' : 'var(--accent-mint)',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      )}

      {/* Levels list */}
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Levels</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {levels.map((level, idx) => {
          const isCompleted = completedLevels.includes(idx);
          const isCurrent = isEnrolled && idx === currentLevel && !isCompleted;
          const isLocked = isEnrolled && idx > currentLevel && !isCompleted;
          const canStart = !isEnrolled || !isLocked;

          return (
            <div
              key={level.cw_id}
              onClick={() => canStart && setSelectedWorkoutId(level.workout_id)}
              className="card"
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                cursor: canStart ? 'pointer' : 'default',
                opacity: isLocked ? 0.5 : 1,
                border: isCurrent ? '2px solid var(--accent-mint)' : '1px solid transparent',
              }}
            >
              {/* Level number circle */}
              <div style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                background: isCompleted
                  ? 'var(--accent-mint)'
                  : isCurrent
                    ? 'var(--accent)'
                    : 'var(--bg-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: (isCompleted || isCurrent) ? '#000' : 'var(--text-secondary)',
                fontSize: 14, fontWeight: 800,
              }}>
                {isCompleted ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : isLocked ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{level.level_label}</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {level.title}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {level.duration_mins} min
                  {level.workout_type === 'follow_along' && ' · Follow Along'}
                </p>
              </div>

              {/* Mark complete shortcut (only for current level when enrolled) */}
              {isCurrent && (
                <button
                  onClick={(e) => { e.stopPropagation(); markLevelComplete(idx); }}
                  style={{
                    background: 'rgba(61,255,210,0.15)', border: 'none', borderRadius: 8,
                    padding: '6px 10px', fontSize: 11, fontWeight: 700, color: 'var(--accent-mint)',
                    cursor: 'pointer',
                  }}
                >
                  Mark done
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
