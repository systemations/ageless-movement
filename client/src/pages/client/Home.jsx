import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { CalendarIcon } from '../../components/Icons';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function getWeekDates() {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export default function Home() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [tasks, setTasks] = useState([]);
  const today = new Date();
  const weekDates = getWeekDates();
  const todayStr = today.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDashboard(data);
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    }
  };

  const toggleTask = async (taskId) => {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
    try {
      await fetch(`/api/dashboard/tasks/${taskId}/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      // Revert on error
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
    }
  };

  const addWater = async (amount) => {
    try {
      const res = await fetch('/api/dashboard/water', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_ml: amount }),
      });
      if (res.ok) {
        const data = await res.json();
        setDashboard(prev => ({ ...prev, water: data.total }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const completedTasks = tasks.filter(t => t.completed).length;
  const profile = dashboard?.profile || {};
  const streak = dashboard?.streak || { current_streak: 0, best_streak: 0 };
  const nutrition = dashboard?.nutrition || { calories: 0, protein: 0, fat: 0, carbs: 0 };
  const waterAmount = dashboard?.water || 0;
  const stepsAmount = dashboard?.steps || 0;
  const activeProgram = dashboard?.activeProgram;
  const todayWorkout = dashboard?.todayWorkout;
  const weekActivity = dashboard?.weekActivity || Array(7).fill(false);

  const completionPct = activeProgram && activeProgram.total_workouts > 0
    ? Math.round((activeProgram.completed_workouts / activeProgram.total_workouts) * 100)
    : 0;

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <img src="/logo.png" alt="AM" style={{ width: 36, height: 36, borderRadius: '50%' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="header-icon" onClick={() => navigate('/progress')}><CalendarIcon /></button>
          <button
            onClick={() => navigate('/profile')}
            style={{
              width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-mint)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
              color: '#000', fontWeight: 700, fontSize: 14
            }}
          >
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </button>
        </div>
      </div>

      {/* Greeting */}
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 2 }}>
        Hello <span>{user?.name || 'there'}</span>
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
        Today · {todayStr}
      </p>

      {/* Training Streak */}
      <div style={{
        background: 'linear-gradient(135deg, #1E1A2E 0%, #2D1F10 100%)',
        borderRadius: 16, padding: '16px 20px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, #FF9500, #FF6B00)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, flexShrink: 0,
          boxShadow: '0 0 20px rgba(255,149,0,0.3)',
        }}>
          🔥
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-orange)' }}>{streak.current_streak}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>day streak</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Personal best: {streak.best_streak} days</p>
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            {DAYS.map((d, i) => (
              <div key={i} style={{
                width: 20, height: 20, borderRadius: '50%', fontSize: 8, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: weekActivity[i] ? 'var(--accent-orange)' : 'rgba(255,255,255,0.08)',
                color: weekActivity[i] ? '#000' : 'var(--text-tertiary)',
              }}>
                {d}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Daily Tasks */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Today's Tasks</h3>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              background: completedTasks === tasks.length && tasks.length > 0 ? 'var(--accent-mint)' : 'rgba(255,255,255,0.1)',
              color: completedTasks === tasks.length && tasks.length > 0 ? '#000' : 'var(--text-secondary)',
            }}>
              {completedTasks}/{tasks.length}
            </span>
          </div>
          {tasks.length > 0 && (
            <div style={{ position: 'relative', width: 36, height: 36 }}>
              <svg width="36" height="36" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="14" fill="none" stroke="var(--accent-mint)" strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 14}`}
                  strokeDashoffset={`${2 * Math.PI * 14 * (1 - completedTasks / tasks.length)}`}
                  strokeLinecap="round" transform="rotate(-90 18 18)"
                  style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                />
              </svg>
            </div>
          )}
        </div>

        {tasks.length === 0 && (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: 8 }}>No tasks assigned yet</p>
        )}

        {tasks.map((task) => (
          <div
            key={task.id}
            onClick={() => toggleTask(task.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
              borderTop: '1px solid var(--divider)', cursor: 'pointer',
            }}
          >
            <div style={{
              width: 24, height: 24, borderRadius: 7, flexShrink: 0,
              border: task.completed ? 'none' : '2px solid var(--text-tertiary)',
              background: task.completed ? 'var(--accent-mint)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}>
              {task.completed && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </div>
            <span style={{
              flex: 1, fontSize: 14, fontWeight: 500,
              textDecoration: task.completed ? 'line-through' : 'none',
              color: task.completed ? 'var(--text-tertiary)' : 'var(--text-primary)',
              transition: 'all 0.2s',
            }}>
              {task.label}
            </span>
            {task.streak > 0 && (
              <span style={{
                fontSize: 11, color: 'var(--accent-orange)', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                🔥 {task.streak}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Week Calendar Strip */}
      <div className="card" style={{ padding: '12px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          {weekDates.map((date, i) => {
            const isToday = date.toDateString() === today.toDateString();
            const hasActivity = weekActivity[i];
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{DAYS[i]}</span>
                <div style={{ fontSize: 8, height: 6 }}>
                  {hasActivity && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-mint)' }} />
                  )}
                </div>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 600,
                  border: isToday ? '2px solid var(--accent-orange)' : '2px solid transparent',
                  color: isToday ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: hasActivity && !isToday ? 'rgba(61,255,210,0.1)' : 'transparent',
                }}>
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Workouts Section */}
      <div className="section-header">
        <h2>Workouts</h2>
      </div>

      {/* Program Card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ color: 'var(--accent-mint)', fontSize: 14, fontWeight: 600 }}>
            {activeProgram?.program_title || `${user?.name || 'Your'} - Phase 1`} &gt;
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Week {activeProgram?.current_week || 1} · Day {activeProgram?.current_day || 1}
          </p>
        </div>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="var(--divider)" strokeWidth="3" />
            <circle
              cx="24" cy="24" r="20" fill="none" stroke="var(--accent-mint)" strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 20}`}
              strokeDashoffset={`${2 * Math.PI * 20 * (1 - completionPct / 100)}`}
              strokeLinecap="round" transform="rotate(-90 24 24)"
            />
          </svg>
          <span style={{ position: 'absolute', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
            {completionPct}%
          </span>
        </div>
      </div>

      {/* Hero Workout Card */}
      <div className="card" style={{
        padding: 0, overflow: 'hidden', position: 'relative',
        background: 'linear-gradient(135deg, #2C2C2E 0%, #1C1C1E 100%)', minHeight: 200,
        display: 'flex', alignItems: 'flex-end',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%)',
        }} />
        <div style={{ position: 'relative', padding: 20, width: '100%' }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
            {todayWorkout?.title || '#1 Full Body Mobility'}
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {todayWorkout
              ? `${todayWorkout.duration_mins} mins · ${todayWorkout.body_parts}`
              : '25 mins · Full Body'}
          </p>
          {todayWorkout?.intensity && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, marginTop: 8,
              display: 'inline-block',
              background: todayWorkout.intensity === 'High' ? 'rgba(255,69,58,0.2)' : 'rgba(61,255,210,0.15)',
              color: todayWorkout.intensity === 'High' ? '#FF453A' : 'var(--accent-mint)',
            }}>
              {todayWorkout.intensity}
            </span>
          )}
        </div>
      </div>

      {/* Nutrition Section */}
      <div className="section-header">
        <h2>Nutrition</h2>
      </div>
      <div className="card" onClick={() => navigate('/nutrition')} style={{ cursor: 'pointer' }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>Daily Calories</p>
          <p style={{ fontSize: 24, fontWeight: 700 }}>
            {Math.round(nutrition.calories)} <span style={{ fontSize: 16, color: 'var(--text-secondary)', fontWeight: 400 }}>/ {profile.calorie_target?.toLocaleString() || '2,200'} cals</span>
          </p>
          <p style={{ fontSize: 12, color: 'var(--accent-mint)' }}>
            {Math.max(0, (profile.calorie_target || 2200) - Math.round(nutrition.calories)).toLocaleString()} left
          </p>
        </div>
        <div style={{ height: 4, background: 'var(--divider)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${Math.min(100, (nutrition.calories / (profile.calorie_target || 2200)) * 100)}%`, background: 'var(--accent-mint)', borderRadius: 2, transition: 'width 0.3s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          {[
            { label: 'Protein', value: Math.round(nutrition.protein), target: profile.protein_target || 163, color: '#3DFFD2' },
            { label: 'Fat', value: Math.round(nutrition.fat), target: profile.fat_target || 167, color: '#FF9500' },
            { label: 'Carbs', value: Math.round(nutrition.carbs), target: profile.carbs_target || 10, color: '#64D2FF' },
          ].map(({ label, value, target, color }) => (
            <div key={label} style={{ textAlign: 'center', flex: 1 }}>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</p>
              <p style={{ fontSize: 14, fontWeight: 600 }}>{value}g <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>/ {target}g</span></p>
              <div style={{ height: 3, background: 'var(--divider)', borderRadius: 2, marginTop: 4 }}>
                <div style={{ height: '100%', width: `${Math.min(100, (value / target) * 100)}%`, background: color, borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Activity Section */}
      <div className="section-header">
        <h2>Activity</h2>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        {/* Water */}
        <div className="card" style={{ flex: 1 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, #64D2FF, #0A84FF)', marginBottom: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Water</p>
          <p style={{ fontSize: 18, fontWeight: 700 }}>
            {waterAmount.toLocaleString()} <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 400 }}>/ {(profile.water_target || 2500).toLocaleString()} ml</span>
          </p>
          <div style={{ height: 4, background: 'var(--divider)', borderRadius: 2, marginTop: 8 }}>
            <div style={{ height: '100%', width: `${Math.min(100, (waterAmount / (profile.water_target || 2500)) * 100)}%`, background: 'var(--water-blue)', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
          <button
            onClick={() => addWater(250)}
            style={{
              marginTop: 8, background: 'rgba(100,210,255,0.15)', border: 'none', borderRadius: 8,
              padding: '6px 0', width: '100%', color: 'var(--water-blue)', fontSize: 12, fontWeight: 600,
            }}
          >
            + 250ml
          </button>
        </div>
        {/* Steps */}
        <div className="card" style={{ flex: 1 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, #FF6B9D, #FF2D55)', marginBottom: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M13.5 5.5C14.59 5.5 15.5 4.59 15.5 3.5S14.59 1.5 13.5 1.5 11.5 2.41 11.5 3.5s.91 2 2 2zm-3.6 4.7L7.75 22h2.1l1.15-5.3L13 18v4h2v-5.5l-2-2.1.6-3c1.3 1.5 3.3 2.5 5.4 2.6v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 9.8V14h2V11l1.9-.8z"/></svg>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Steps</p>
          <p style={{ fontSize: 18, fontWeight: 700 }}>
            {stepsAmount.toLocaleString()} <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 400 }}>/ {(profile.step_target || 6000).toLocaleString()}</span>
          </p>
          <div style={{ height: 4, background: 'var(--divider)', borderRadius: 2, marginTop: 8 }}>
            <div style={{ height: '100%', width: `${Math.min(100, (stepsAmount / (profile.step_target || 6000)) * 100)}%`, background: 'var(--steps-pink)', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>
            {Math.round((stepsAmount / (profile.step_target || 6000)) * 100)}% of daily goal
          </p>
        </div>
      </div>

      {/* More Section */}
      <div className="section-header">
        <h2>More</h2>
      </div>
      {[
        { icon: '🏋️', label: 'Workout Planner', path: '/explore' },
        { icon: '🥗', label: 'Meal Planner', path: '/nutrition' },
        { icon: '📅', label: 'Book Session', path: '/events' },
        { icon: '🕐', label: 'Past Bookings', path: '/events' },
        { icon: '🔖', label: 'Favourites', path: '/explore' },
        { icon: '🏃', label: 'Log Other Workout', path: '/explore' },
        { icon: '📥', label: 'Downloaded Workouts', path: '/explore' },
      ].map(({ icon, label, path }) => (
        <div key={label} onClick={() => navigate(path)} className="card-sm" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      ))}
    </div>
  );
}
