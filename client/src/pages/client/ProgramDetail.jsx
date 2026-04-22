import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import WorkoutThumb from '../../components/WorkoutThumb';

export default function ProgramDetail({ programId, onBack, onSelectWorkout }) {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [enrolling, setEnrolling] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(null); // { current_program }

  useEffect(() => {
    fetch(`/api/explore/programs/${programId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(setData)
      .catch(console.error);
  }, [programId]);

  if (!data) return (
    <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );

  const { program, phases, workouts, enrollment } = data;

  const handleEnroll = async (force = false) => {
    setEnrolling(true);
    try {
      const res = await fetch(`/api/explore/programs/${programId}/enroll`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      if (res.status === 409) {
        // Server blocked because another program is active — show confirmation
        const result = await res.json();
        setConfirmReplace(result.current_program || { title: 'your current program' });
        setEnrolling(false);
        return;
      }
      const result = await res.json();
      if (result.enrollment) {
        setData({ ...data, enrollment: result.enrollment });
        setConfirmReplace(null);
      }
    } catch (err) {
      console.error('Enroll error:', err);
    }
    setEnrolling(false);
  };

  // Group workouts by week
  const weekGroups = {};
  workouts.forEach(w => {
    const key = `Week ${w.week_number}`;
    if (!weekGroups[key]) weekGroups[key] = [];
    weekGroups[key].push(w);
  });

  // If the client is already enrolled, compute the real calendar date each
  // (week, day) falls on by offsetting from enrollment.started_at. This keeps
  // the client's week-view aligned with the day they actually started the
  // program (so day 1 of a program enrolled on Thursday appears on Thursday,
  // not on some abstract "Day 1" column).
  const dateForWorkout = (w) => {
    if (!enrollment?.started_at) return null;
    const start = new Date(enrollment.started_at);
    const offset = ((w.week_number || 1) - 1) * 7 + ((w.day_number || 1) - 1);
    const d = new Date(start);
    d.setDate(start.getDate() + offset);
    return d;
  };
  const formatDayDate = (d) => d?.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </div>

      {/* Hero */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16,
        padding: '28px 20px', marginBottom: 20, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', border: '1px solid rgba(61,255,210,0.08)' }} />
        <img src="/logo.png" alt="" style={{ width: 40, height: 40, borderRadius: '50%', marginBottom: 12, opacity: 0.8 }} />
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, lineHeight: 1.2 }}>{program.title}</h1>

        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{program.duration_weeks} weeks</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{program.min_duration} - {program.max_duration} / workout</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{program.workouts_per_week} workouts / week</span>
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{program.description}</p>
      </div>

      {/* Enrollment status */}
      {enrollment && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>Currently Active</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Week {enrollment.current_week} · Day {enrollment.current_day}</p>
          </div>
          <div style={{ position: 'relative', width: 44, height: 44 }}>
            <svg width="44" height="44" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
              <circle cx="22" cy="22" r="18" fill="none" stroke="var(--accent-mint)" strokeWidth="3"
                strokeDasharray={`${2 * Math.PI * 18}`}
                strokeDashoffset={`${2 * Math.PI * 18 * (1 - (enrollment.total_workouts > 0 ? enrollment.completed_workouts / enrollment.total_workouts : 0))}`}
                strokeLinecap="round" transform="rotate(-90 22 22)" />
            </svg>
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
              {enrollment.total_workouts > 0 ? Math.round((enrollment.completed_workouts / enrollment.total_workouts) * 100) : 0}%
            </span>
          </div>
        </div>
      )}

      {/* Week breakdown */}
      {Object.entries(weekGroups).map(([weekTitle, dayWorkouts]) => (
        <div key={weekTitle} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--divider)' }}>
            {weekTitle}
          </h3>
          {dayWorkouts.map((w) => (
            <div
              key={w.id}
              onClick={() => onSelectWorkout(w.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer',
              }}
            >
              <div style={{ width: 56, flexShrink: 0 }}>
                <WorkoutThumb
                  title={w.title}
                  thumbnailUrl={w.image_url}
                  aspectRatio="1/1"
                  borderRadius={10}
                  titleFontSize={9}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, color: 'var(--accent-orange)', fontWeight: 700, marginBottom: 2 }}>
                  {enrollment?.started_at ? formatDayDate(dateForWorkout(w)).toUpperCase() : `DAY ${w.day_number}`}
                </p>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {w.title}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {w.duration_mins} mins · {w.body_parts}
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          ))}
        </div>
      ))}

      {/* Add to Schedule */}
      {!enrollment && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 480, width: 'calc(100% - 32px)', padding: '12px 0',
          background: 'linear-gradient(to top, var(--bg-primary) 70%, transparent)',
        }}>
          <button className="btn-primary" onClick={() => handleEnroll(false)} disabled={enrolling}>
            {enrolling ? 'Adding...' : 'Add to Schedule'}
          </button>
        </div>
      )}

      {/* Replace-program confirmation modal */}
      {confirmReplace && (
        <div
          onClick={() => setConfirmReplace(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: 16, maxWidth: 420, width: '100%',
              padding: 24, textAlign: 'center',
            }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'rgba(255,149,0,0.15)', margin: '0 auto 12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Replace current program?
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
              You're already doing <strong style={{ color: 'var(--text-primary)' }}>{confirmReplace.program_title || confirmReplace.title}</strong>.
              Starting a new program will override your current one — all scheduled program workouts will be replaced.
              Individual workouts you've added to your schedule will stay.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmReplace(null)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  border: '1px solid var(--divider)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={() => handleEnroll(true)}
                disabled={enrolling}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  background: 'var(--accent-orange)', color: '#fff',
                  border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  opacity: enrolling ? 0.5 : 1,
                }}
              >{enrolling ? 'Replacing…' : 'Replace'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
