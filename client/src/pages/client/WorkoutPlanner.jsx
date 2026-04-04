import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function WorkoutPlanner({ onBack, onSelectWorkout }) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('Workouts');
  const [workouts, setWorkouts] = useState([]);
  const [program, setProgram] = useState(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const dashRes = await fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } });
      if (dashRes.ok) {
        const dash = await dashRes.json();
        if (dash.activeProgram) {
          setProgram(dash.activeProgram);
          const progRes = await fetch(`/api/explore/programs/${dash.activeProgram.program_id}`, { headers: { Authorization: `Bearer ${token}` } });
          if (progRes.ok) {
            const progData = await progRes.json();
            setWorkouts(progData.workouts || []);
          }
        }
      }
    } catch (err) { console.error(err); }
  };

  const getWeekDates = () => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  };

  const weekDates = getWeekDates();
  const today = new Date();

  // Map workouts to days of the week
  const currentWeek = program?.current_week || 1;
  const weekWorkouts = workouts.filter(w => w.week_number === currentWeek);

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Workout Planner</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>This Week</p>
        </div>
        <div style={{ width: 36 }} />
      </div>

      {/* Weekly workout list */}
      {weekDates.map((date, i) => {
        const isToday = date.toDateString() === today.toDateString();
        const dayWorkout = weekWorkouts.find(w => w.day_number === i + 1);
        const dateStr = date.toLocaleDateString('en-IE', { day: '2-digit', month: 'short' });
        const dayName = date.toLocaleDateString('en-IE', { weekday: 'short' });

        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
            borderBottom: '1px solid var(--divider)',
          }}>
            <div style={{ width: 50, textAlign: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: isToday ? 'var(--accent)' : 'var(--text-primary)' }}>{dateStr.split(' ')[0]} {dateStr.split(' ')[1]}</p>
              <p style={{ fontSize: 11, color: isToday ? 'var(--accent)' : 'var(--text-secondary)' }}>{isToday ? 'Today' : dayName}</p>
            </div>

            {dayWorkout ? (
              <div onClick={() => onSelectWorkout?.(dayWorkout.id)} style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--bg-card)', borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
                  background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {dayWorkout.image_url ? (
                    <img src={dayWorkout.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 20, opacity: 0.3 }}>🏋️</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dayWorkout.title}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {dayWorkout.duration_mins ? `${Math.floor(dayWorkout.duration_mins / 60)}h ${dayWorkout.duration_mins % 60}m` : dayWorkout.duration_mins + ' mins'}
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, padding: '14px 12px' }}>
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Rest day</p>
              </div>
            )}

            {isToday && !dayWorkout && (
              <button style={{
                width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            )}
          </div>
        );
      })}

      {/* Sub-tabs */}
      <div style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 0, background: 'var(--bg-card)', borderRadius: 50,
        padding: 4, maxWidth: 240, width: 'calc(100% - 32px)',
      }}>
        {['Workouts', 'Nutrition'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            flex: 1, padding: '10px 0', borderRadius: 50, fontSize: 13, fontWeight: 600,
            background: activeTab === tab ? 'var(--accent)' : 'transparent',
            color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
            border: 'none',
          }}>{tab}</button>
        ))}
      </div>
    </div>
  );
}
