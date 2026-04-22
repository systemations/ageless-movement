import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFavourites } from '../../context/FavouritesContext';
import { CalendarIcon } from '../../components/Icons';
import WorkoutThumb, { MiniThumb } from '../../components/WorkoutThumb';
import EnhancedToday, { invalidateTodayCache } from '../../components/EnhancedToday';
import NotificationPopup from '../../components/NotificationPopup';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Module-level cache so tab switches don't flash blank while data refetches.
const homeCache = { dashboard: null, weekSchedule: null, athleteFeatures: null, hasEnhancedToday: false };

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
  const location = useLocation();
  const { favourites } = useFavourites() || { favourites: [] };
  const [dashboard, setDashboard] = useState(homeCache.dashboard);
  const [tasks, setTasks] = useState([]);
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [weekSchedule, setWeekSchedule] = useState(homeCache.weekSchedule || {}); // { 'YYYY-MM-DD': { count, completed_count, logged_count, is_rest_day } }
  const [selectedDay, setSelectedDay] = useState(null); // 'YYYY-MM-DD' or null
  const [dayWorkouts, setDayWorkouts] = useState([]); // workouts for the selected day
  const [dayLoggedWorkouts, setDayLoggedWorkouts] = useState([]); // logged workouts for the selected day
  const [dayIsRestDay, setDayIsRestDay] = useState(false);
  const [showAddPicker, setShowAddPicker] = useState(false); // show explore workout picker
  const [addPickerTab, setAddPickerTab] = useState('favourites'); // 'favourites' | 'recent' | 'browse'
  const [exploreWorkouts, setExploreWorkouts] = useState([]); // individual workouts from explore sections
  const [recentWorkouts, setRecentWorkouts] = useState([]); // recently logged workouts
  const [exploreLoading, setExploreLoading] = useState(false);
  const [movingWorkout, setMovingWorkout] = useState(null); // { workout_id, program_id, original_date, title }
  const [moveTarget, setMoveTarget] = useState(null); // 'YYYY-MM-DD'
  const [movePermanent, setMovePermanent] = useState(false);
  const [moveSaving, setMoveSaving] = useState(false);
  const [athleteFeatures, setAthleteFeatures] = useState(homeCache.athleteFeatures);
  const [hasEnhancedToday, setHasEnhancedToday] = useState(homeCache.hasEnhancedToday);
  const [notifications, setNotifications] = useState([]);
  const today = new Date();
  const weekDates = getWeekDates();
  const todayStr = today.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
  const todayIso = today.toISOString().split('T')[0];

  useEffect(() => {
    fetchDashboard();
    fetchWeekSchedule();
    fetchAthleteFeatures();
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications/active', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const d = await res.json();
      setNotifications(d.notifications || []);
    } catch (err) { console.error(err); }
  };

  const dismissNotification = async (n) => {
    setNotifications(prev => prev.filter(x => x.id !== n.id));
    try {
      await fetch(`/api/notifications/${n.id}/dismiss`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ occurrence_date: n.occurrence_date }),
      });
    } catch (err) { console.error(err); }
  };

  const completeCheckin = async (n, payload) => {
    setNotifications(prev => prev.filter(x => x.id !== n.id));
    try {
      await fetch(`/api/notifications/${n.id}/complete-checkin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) { console.error(err); }
  };

  // If the URL has ?day=YYYY-MM-DD (e.g. user navigated back from a workout
  // preview), reopen the day-detail sheet for that date.
  // If ?add=1 is also present, open the add-workout picker directly.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const day = params.get('day');
    const shouldAdd = params.get('add') === '1';
    if (day && day !== selectedDay) {
      openDay(day).then?.(() => {
        if (shouldAdd) openAddPicker();
      });
      // openDay isn't async, so schedule shouldAdd check after state settles
      if (shouldAdd) setTimeout(() => openAddPicker(), 50);
    }
  }, [location.search]);

  const fetchAthleteFeatures = async () => {
    try {
      const res = await fetch('/api/athlete/features', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        homeCache.athleteFeatures = data.features || null;
        setAthleteFeatures(data.features || null);
      }
    } catch (err) {
      // Non-critical -- enhanced features just won't show
    }
  };

  const fetchWeekSchedule = async () => {
    try {
      const start = weekDates[0].toISOString().split('T')[0];
      const res = await fetch(`/api/schedule/week?start=${start}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        homeCache.weekSchedule = data.week || {};
        setWeekSchedule(data.week || {});
      }
    } catch (err) {
      console.error('Week schedule fetch error:', err);
    }
  };

  const openDay = async (date) => {
    setSelectedDay(date);
    setDayWorkouts([]);
    setDayLoggedWorkouts([]);
    setDayIsRestDay(false);
    setShowAddPicker(false);
    try {
      const res = await fetch(`/api/schedule?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDayWorkouts(data.workouts || []);
        setDayLoggedWorkouts(data.logged_workouts || []);
        setDayIsRestDay(!!data.is_rest_day);
      }
    } catch (err) {
      console.error('Day schedule fetch error:', err);
    }
  };

  const removeFromSchedule = async (scheduleId) => {
    setDayWorkouts(prev => prev.filter(w => w.schedule_id !== scheduleId));
    try {
      await fetch(`/api/schedule/${scheduleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchWeekSchedule();
      if (selectedDay === todayIso) invalidateTodayCache();
    } catch (err) {
      console.error('Remove schedule error:', err);
    }
  };

  const toggleRestDay = async (date) => {
    const newVal = !dayIsRestDay;
    setDayIsRestDay(newVal);
    try {
      if (newVal) {
        await fetch('/api/schedule/rest-day', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ date }),
        });
      } else {
        await fetch(`/api/schedule/rest-day?date=${date}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      fetchWeekSchedule();
    } catch (err) {
      console.error('Rest day toggle error:', err);
      setDayIsRestDay(!newVal);
    }
  };

  const openAddPicker = async () => {
    setShowAddPicker(true);
    setAddPickerTab('favourites');
    if (exploreWorkouts.length > 0) return; // already loaded
    setExploreLoading(true);
    try {
      // Fetch explore content + recent workouts in parallel
      const [exploreRes, recentRes] = await Promise.all([
        fetch('/api/explore/content', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/schedule/recent-workouts', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (exploreRes.ok) {
        const data = await exploreRes.json();
        // Endpoint returns { sections: [...] }, though older versions returned an array.
        const sections = Array.isArray(data) ? data : (data.sections || []);
        const workouts = [];
        for (const section of sections) {
          if (section.locked) continue;
          for (const item of (section.items || [])) {
            if (item.item_type === 'workout' && item.title) {
              workouts.push({
                id: item.item_id,
                title: item.title,
                image_url: item.image_url,
                duration: item.duration,
                body_parts: item.body_parts,
                workout_type: item.workout_type,
                section_title: section.title,
              });
            }
          }
        }
        setExploreWorkouts(workouts);
      }
      if (recentRes.ok) {
        const data = await recentRes.json();
        setRecentWorkouts(data.workouts || []);
      }
    } catch (err) {
      console.error('Add picker fetch error:', err);
    }
    setExploreLoading(false);
  };

  const addWorkoutToDay = async (workoutId) => {
    if (!selectedDay) return;
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workout_id: workoutId, scheduled_date: selectedDay }),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'This workout is already scheduled for that day.');
        return;
      }
      setShowAddPicker(false);
      openDay(selectedDay);
      fetchWeekSchedule();
      if (selectedDay === todayIso) invalidateTodayCache();
    } catch (err) {
      console.error('Add workout error:', err);
    }
  };

  const startMoveWorkout = (workout) => {
    setMovingWorkout({
      workout_id: workout.workout_id,
      program_id: workout.program_id,
      original_date: selectedDay,
      title: workout.title,
    });
    setMoveTarget(null);
    setMovePermanent(false);
    setSelectedDay(null); // close the day detail sheet
  };

  const confirmMove = async () => {
    if (!movingWorkout || !moveTarget) return;
    setMoveSaving(true);
    try {
      await fetch('/api/schedule/reschedule', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workout_id: movingWorkout.workout_id,
          program_id: movingWorkout.program_id,
          original_date: movingWorkout.original_date,
          new_date: moveTarget,
          permanent: movePermanent,
        }),
      });
      setMovingWorkout(null);
      setMoveTarget(null);
      fetchWeekSchedule();
      // Refresh the day detail if still open
      if (selectedDay) openDay(selectedDay);
    } catch (err) {
      console.error('Reschedule error:', err);
    }
    setMoveSaving(false);
  };

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        homeCache.dashboard = data;
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

  const addTask = async () => {
    const label = newTaskLabel.trim();
    if (!label) return;
    setNewTaskLabel('');
    setAddingTask(false);
    try {
      const res = await fetch('/api/dashboard/tasks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(prev => [...prev, { id: data.id, label, completed: false, streak: 0 }]);
      }
    } catch (err) {
      console.error('Add task error:', err);
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
  const todayMealPlan = dashboard?.todayMealPlan;
  const weekActivity = dashboard?.weekActivity || Array(7).fill(false);

  const completionPct = activeProgram && activeProgram.total_workouts > 0
    ? Math.round((activeProgram.completed_workouts / activeProgram.total_workouts) * 100)
    : 0;

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <img src="/logo.png" alt="AM" style={{ width: 40, height: 40, borderRadius: '50%' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="header-icon" onClick={() => navigate('/progress')}><CalendarIcon /></button>
          <button
            onClick={() => navigate('/profile')}
            style={{
              width: 40, height: 40, borderRadius: '50%', border: 'none',
              background: profile.profile_image_url ? 'transparent' : 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 14, padding: 0, overflow: 'hidden',
            }}
          >
            {profile.profile_image_url ? (
              <img src={profile.profile_image_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              user?.name?.charAt(0)?.toUpperCase() || 'U'
            )}
          </button>
        </div>
      </div>

      {/* Greeting with inline streak */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>
          Hello <span>{(user?.name || 'there').split(' ')[0]}</span>
        </h1>
        {streak.current_streak > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            borderRadius: 20, background: 'rgba(255,149,0,0.15)',
          }}>
            <span style={{ fontSize: 16 }}>🔥</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-orange)' }}>
              {streak.current_streak} day streak
            </span>
          </div>
        )}
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
        Today · {todayStr}
      </p>

      {/* Week Calendar Strip - pinned at the top. Tap a day to see prescribed workouts. */}
      <div className="card" style={{ padding: '12px 8px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          {weekDates.map((date, i) => {
            const iso = date.toISOString().split('T')[0];
            const isToday = date.toDateString() === today.toDateString();
            const scheduleEntry = weekSchedule[iso] || { count: 0, completed_count: 0, logged_count: 0, is_rest_day: false };
            const scheduledCount = scheduleEntry.count || 0;
            const loggedCount = scheduleEntry.logged_count || 0;
            const isRestDay = scheduleEntry.is_rest_day;
            const hasActivity = weekActivity[i] || scheduledCount > 0 || loggedCount > 0;
            return (
              <div
                key={i}
                onClick={() => openDay(iso)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', flex: 1 }}
              >
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{DAYS[i]}</span>
                <div style={{ fontSize: 8, height: 6 }}>
                  {isRestDay ? (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)' }} />
                  ) : hasActivity ? (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                  ) : null}
                </div>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 600, position: 'relative',
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

      {/* Daily Tasks - collapsible dropdown */}
      <div className="card" style={{ marginBottom: 12, padding: 0 }}>
        {/* Clickable header */}
        <div
          onClick={() => setTasksExpanded(!tasksExpanded)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', cursor: 'pointer',
          }}
        >
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {tasks.length > 0 && (
              <div style={{ position: 'relative', width: 28, height: 28 }}>
                <svg width="28" height="28" viewBox="0 0 28 28">
                  <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
                  <circle
                    cx="14" cy="14" r="11" fill="none" stroke="var(--accent-mint)" strokeWidth="2.5"
                    strokeDasharray={`${2 * Math.PI * 11}`}
                    strokeDashoffset={`${2 * Math.PI * 11 * (1 - completedTasks / tasks.length)}`}
                    strokeLinecap="round" transform="rotate(-90 14 14)"
                    style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                  />
                </svg>
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setAddingTask(true); setTasksExpanded(true); }}
              aria-label="Add task"
              style={{
                width: 28, height: 28, borderRadius: '50%', border: 'none',
                background: 'var(--accent-mint)', color: '#000', fontSize: 16, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >+</button>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="var(--text-tertiary)" strokeWidth="2"
              style={{
                transition: 'transform 0.2s',
                transform: tasksExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>

        {/* Expanded content */}
        {tasksExpanded && (
          <div style={{ padding: '0 16px 12px' }}>
            {/* Add task inline input */}
            {addingTask && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  autoFocus
                  value={newTaskLabel}
                  onChange={e => setNewTaskLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTask()}
                  placeholder="Add a task..."
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--divider)',
                    background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14,
                    outline: 'none',
                  }}
                />
                <button onClick={addTask} style={{
                  padding: '8px 14px', borderRadius: 10, border: 'none',
                  background: 'var(--accent-mint)', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>Add</button>
                <button onClick={() => { setAddingTask(false); setNewTaskLabel(''); }} style={{
                  padding: '8px 10px', borderRadius: 10, border: 'none',
                  background: 'var(--divider)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
                }}>Cancel</button>
              </div>
            )}

            {tasks.length === 0 && !addingTask && (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: 8 }}>No tasks assigned yet</p>
            )}

            {tasks.map((task, idx) => (
              <div
                key={task.id}
                onClick={() => toggleTask(task.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                  borderTop: idx === 0 ? '1px solid var(--divider)' : '1px solid var(--divider)',
                  cursor: 'pointer',
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
                {/* Coach-assigned tasks get a badge so the client sees who set them */}
                {task.coach_id && (
                  <span title="Set by your coach" style={{
                    fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 5,
                    background: 'rgba(255,140,0,0.15)', color: 'var(--accent-orange)',
                    textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0,
                  }}>COACH</span>
                )}
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
        )}
      </div>

      {/* Enhanced Today -- phase banner, sessions, meals, supplements */}
      {athleteFeatures && (
        <EnhancedToday
          features={athleteFeatures}
          onNavigateWorkout={(workoutId) => navigate(`/explore?workout=${workoutId}`)}
          onNavigateNutrition={(tab) => navigate(`/nutrition${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`)}
          onActiveBlock={(active) => { homeCache.hasEnhancedToday = active; setHasEnhancedToday(active); }}
        />
      )}

      {/* Day detail bottom sheet -- opens when user taps a day on the calendar strip */}
      {selectedDay && !showAddPicker && (
        <div
          onClick={() => {
            setSelectedDay(null);
            // Drop ?day= from URL if present so refresh/history is clean
            if (location.search.includes('day=')) navigate('/home', { replace: true });
          }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
              width: '100%', maxWidth: 480, margin: '0 auto', padding: '16px 16px 32px',
              maxHeight: '80vh', overflow: 'auto',
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>
                {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              {dayIsRestDay && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10,
                  background: 'rgba(142,142,147,0.15)', color: 'var(--text-secondary)',
                }}>REST DAY</span>
              )}
            </div>
            {/* Limit display: always show SCHEDULED + user ADDED; cap PROGRAM suggestions at 2.
                Coach-scheduled work is locked in; we only surface a couple of program options
                so the sheet doesn't become a long unfilterable list. */}
            {(() => { return null; })()}

            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              {(() => {
                const scheduled = dayWorkouts.filter(w => w.source === 'block').length;
                const added = dayWorkouts.filter(w => w.source === 'user').length;
                const programTotal = dayWorkouts.filter(w => w.source === 'program').length;
                const programShown = Math.min(programTotal, Math.max(0, 3 - scheduled - added));
                const total = scheduled + added + programShown + dayLoggedWorkouts.length;
                const hiddenProgram = programTotal - programShown;
                let txt = `${total} workout${total === 1 ? '' : 's'}`;
                if (dayLoggedWorkouts.length > 0) txt += ` (${dayLoggedWorkouts.length} logged)`;
                if (hiddenProgram > 0) txt += ` · +${hiddenProgram} more suggestion${hiddenProgram === 1 ? '' : 's'}`;
                return txt;
              })()}
            </p>

            {/* Scheduled & program workouts - cap program at 2 */}
            {(() => {
              const scheduled = dayWorkouts.filter(w => w.source === 'block');
              const added = dayWorkouts.filter(w => w.source === 'user');
              const programAll = dayWorkouts.filter(w => w.source === 'program');
              const remaining = Math.max(0, 3 - scheduled.length - added.length);
              const programShown = programAll.slice(0, Math.min(2, remaining));
              // Preserve original order: scheduled, user, then capped program
              return [...scheduled, ...added, ...programShown];
            })().map((w, idx) => {
              const isProgram = w.source === 'program';
              const isBlock = w.source === 'block';
              const isPrescribed = isProgram || isBlock;
              const key = w.schedule_id ?? `${w.source}-${w.workout_id ?? w.session_ref}-${idx}`;
              return (
                <div
                  key={key}
                  onClick={() => {
                    if (!w.workout_id) return;
                    // Push a history entry with ?day=... so browser-back lands us here
                    // with the day sheet re-opened, not on the bare home page.
                    navigate(`/home?day=${selectedDay}`, { replace: true });
                    navigate(`/explore?workout=${w.workout_id}&from=calendar&date=${selectedDay}`);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: isBlock ? '12px 14px' : '10px 0',
                    marginBottom: isBlock ? 8 : 0,
                    borderBottom: isBlock ? 'none' : '1px solid var(--divider)',
                    background: isBlock ? 'rgba(133,255,186,0.18)' : 'transparent',
                    border: isBlock ? '1px solid rgba(133,255,186,0.35)' : 'none',
                    borderRadius: isBlock ? 12 : 0,
                    cursor: 'pointer',
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {w.title}
                      </p>
                      {isBlock ? (
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                          background: 'rgba(20,90,55,0.9)', color: '#D6FFE8',
                          textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0,
                        }}>SCHEDULED</span>
                      ) : isProgram ? (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          background: 'rgba(255,149,0,0.15)', color: 'var(--accent-orange)',
                          textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0,
                        }}>PROGRAM</span>
                      ) : (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          background: 'rgba(61,255,210,0.15)', color: 'var(--accent-mint)',
                          textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0,
                        }}>ADDED</span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {w.duration_mins} mins · {w.body_parts || w.workout_type}
                      {isBlock && w.time_slot ? ` · ${w.time_slot}` : ''}
                    </p>
                    {w.program_title && isProgram && (
                      <p style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>
                        {w.program_title} · W{w.week_number} D{w.day_number}
                      </p>
                    )}
                  </div>
                  {isProgram ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); startMoveWorkout(w); }}
                      title="Schedule on a different day"
                      style={{
                        background: 'rgba(255,149,0,0.12)', border: 'none', borderRadius: 8,
                        padding: '6px 10px', color: 'var(--accent-orange)', fontSize: 11,
                        fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >Schedule</button>
                  ) : isBlock ? null : (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFromSchedule(w.schedule_id); }}
                      style={{
                        background: 'rgba(255,59,48,0.1)', border: 'none', borderRadius: 8,
                        padding: '6px 10px', color: '#FF453A', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}
                    >Remove</button>
                  )}
                </div>
              );
            })}

            {/* Logged workouts (from Log Other Workout or completed workouts) */}
            {dayLoggedWorkouts.map((lw) => (
              <div
                key={`log-${lw.log_id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', marginBottom: 8,
                  background: 'rgba(180,245,200,0.35)',
                  border: '1px solid rgba(120,220,150,0.4)',
                  borderRadius: 12,
                }}
              >
                <div style={{
                  width: 56, height: 56, borderRadius: 10, flexShrink: 0,
                  overflow: 'hidden',
                }}>
                  {lw.image_url ? (
                    <img src={lw.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                  ) : (
                    <MiniThumb title={lw.title || 'Workout'} size={56} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {lw.workout_id === 0 || !lw.workout_id
                        ? (lw.notes?.split(':')[0] || 'Other Workout')
                        : lw.title}
                    </p>
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(20,110,55,0.9)', color: '#E0FFE8',
                      textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0,
                    }}>LOGGED</span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {lw.duration_mins ? `${lw.duration_mins} mins` : 'Completed'}
                    {lw.notes && lw.workout_id === 0 && lw.notes.includes(':')
                      ? ` · ${lw.notes.split(':').slice(1).join(':').trim().substring(0, 40)}`
                      : ''}
                  </p>
                </div>
              </div>
            ))}

            {/* Empty state -- only when nothing at all */}
            {dayWorkouts.length === 0 && dayLoggedWorkouts.length === 0 && !dayIsRestDay && (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px 0' }}>
                No workouts yet
              </p>
            )}

            {/* Action buttons -- always visible */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => openAddPicker()}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Workout
              </button>
              <button
                onClick={() => {
                  setSelectedDay(null);
                  navigate('/log-workout');
                }}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12,
                  border: '1px solid var(--divider)', background: 'transparent',
                  color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Log Workout
              </button>
            </div>

            {/* Rest day toggle */}
            <div
              onClick={() => toggleRestDay(selectedDay)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', marginTop: 8,
                background: dayIsRestDay ? 'rgba(142,142,147,0.12)' : 'var(--bg-primary)',
                borderRadius: 12, cursor: 'pointer',
                border: dayIsRestDay ? '1px solid var(--text-tertiary)' : '1px solid var(--divider)',
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                border: dayIsRestDay ? 'none' : '2px solid var(--text-tertiary)',
                background: dayIsRestDay ? 'var(--text-secondary)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 14, fontWeight: 900,
              }}>
                {dayIsRestDay && '\u2713'}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700 }}>Rest Day</p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {dayIsRestDay ? 'Marked as a rest day' : 'Mark this as a planned rest day'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add workout picker -- tabbed: Favourites / Recent / Browse Programs */}
      {selectedDay && showAddPicker && (() => {
        const favWorkouts = (favourites || []).filter(f => f.item_type === 'workout');
        const PICKER_TABS = [
          { id: 'favourites', label: 'Favourites', count: favWorkouts.length },
          { id: 'recent', label: 'Recent', count: recentWorkouts.length },
          { id: 'browse', label: 'Browse', count: exploreWorkouts.length },
        ];
        return (
          <div
            onClick={() => setShowAddPicker(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 250,
              display: 'flex', alignItems: 'flex-end',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
                width: '100%', maxWidth: 480, margin: '0 auto', padding: '16px 16px 32px',
                maxHeight: '85vh', overflow: 'auto',
              }}
            >
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700 }}>Add Workout</h3>
                <button
                  onClick={() => setShowAddPicker(false)}
                  style={{
                    background: 'var(--bg-primary)', border: 'none', borderRadius: 8,
                    padding: '6px 12px', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >Back</button>
              </div>

              {/* Tabs */}
              <div style={{
                display: 'flex', gap: 0, background: 'var(--bg-primary)', borderRadius: 10,
                padding: 3, marginBottom: 16,
              }}>
                {PICKER_TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setAddPickerTab(tab.id)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: addPickerTab === tab.id ? 'var(--accent)' : 'transparent',
                      color: addPickerTab === tab.id ? '#000' : 'var(--text-secondary)',
                      border: 'none', cursor: 'pointer',
                    }}
                  >{tab.label}</button>
                ))}
              </div>

              {exploreLoading ? (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: 20 }}>Loading...</p>
              ) : (
                <>
                  {/* Favourites tab */}
                  {addPickerTab === 'favourites' && (
                    favWorkouts.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <p style={{ fontSize: 28, marginBottom: 8 }}>&#9734;</p>
                        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No favourite workouts yet</p>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          Tap the heart icon on any workout to save it here for quick access
                        </p>
                      </div>
                    ) : (
                      favWorkouts.map((fav) => (
                        <div
                          key={`fav-${fav.item_id}`}
                          onClick={() => addWorkoutToDay(fav.item_id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                            borderBottom: '1px solid var(--divider)', cursor: 'pointer',
                          }}
                        >
                          <div style={{ width: 48, flexShrink: 0 }}>
                            <WorkoutThumb
                              title={fav.item_title}
                              thumbnailUrl={fav.image_url}
                              aspectRatio="1/1"
                              borderRadius={8}
                              titleFontSize={8}
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {fav.item_title}
                            </p>
                            {fav.item_meta && (
                              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fav.item_meta}</p>
                            )}
                          </div>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                            background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </div>
                        </div>
                      ))
                    )
                  )}

                  {/* Recent tab */}
                  {addPickerTab === 'recent' && (
                    recentWorkouts.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <p style={{ fontSize: 28, marginBottom: 8 }}>&#128337;</p>
                        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No recent workouts</p>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          Workouts you complete will appear here for quick re-scheduling
                        </p>
                      </div>
                    ) : (
                      recentWorkouts.map((rw) => (
                        <div
                          key={`recent-${rw.workout_id}`}
                          onClick={() => addWorkoutToDay(rw.workout_id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                            borderBottom: '1px solid var(--divider)', cursor: 'pointer',
                          }}
                        >
                          <div style={{ width: 48, flexShrink: 0 }}>
                            <WorkoutThumb
                              title={rw.title}
                              thumbnailUrl={rw.image_url}
                              aspectRatio="1/1"
                              borderRadius={8}
                              titleFontSize={8}
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {rw.title}
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              {rw.duration_mins ? `${rw.duration_mins} mins` : ''}{rw.body_parts ? ` · ${rw.body_parts}` : ''}
                            </p>
                          </div>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                            background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </div>
                        </div>
                      ))
                    )
                  )}

                  {/* Browse tab -- individual workouts from Explore sections, grouped by section */}
                  {addPickerTab === 'browse' && (
                    exploreWorkouts.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <p style={{ fontSize: 28, marginBottom: 8 }}>&#128270;</p>
                        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No workouts published yet</p>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          Individual workouts added to Explore sections will appear here
                        </p>
                      </div>
                    ) : (() => {
                      // Group workouts by their explore section
                      const grouped = {};
                      exploreWorkouts.forEach(ew => {
                        const key = ew.section_title || 'Workouts';
                        if (!grouped[key]) grouped[key] = [];
                        grouped[key].push(ew);
                      });
                      return Object.entries(grouped).map(([sectionTitle, sectionWorkouts]) => (
                        <div key={sectionTitle} style={{ marginBottom: 12 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                            {sectionTitle}
                          </p>
                          {sectionWorkouts.map((ew) => (
                            <div
                              key={`explore-${ew.id}`}
                              onClick={() => addWorkoutToDay(ew.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                                borderBottom: '1px solid var(--divider)', cursor: 'pointer',
                              }}
                            >
                              <div style={{ width: 48, flexShrink: 0 }}>
                                <WorkoutThumb
                                  title={ew.title}
                                  thumbnailUrl={ew.image_url}
                                  aspectRatio="1/1"
                                  borderRadius={8}
                                  titleFontSize={8}
                                />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {ew.title}
                                </p>
                                <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                  {ew.duration ? `${ew.duration} mins` : ''}{ew.body_parts ? ` · ${ew.body_parts}` : ''}
                                </p>
                              </div>
                              <div style={{
                                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                              </div>
                            </div>
                          ))}
                        </div>
                      ));
                    })()
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Move workout picker */}
      {movingWorkout && (
        <div
          onClick={() => setMovingWorkout(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: 20, padding: 20,
              maxWidth: 360, width: '100%',
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Schedule workout</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {movingWorkout.title}
            </p>

            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Pick a day
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 20 }}>
              {weekDates.map((date, i) => {
                const iso = date.toISOString().split('T')[0];
                const isOriginal = iso === movingWorkout.original_date;
                const isSelected = iso === moveTarget;
                return (
                  <div
                    key={i}
                    onClick={() => !isOriginal && setMoveTarget(iso)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      cursor: isOriginal ? 'default' : 'pointer',
                      opacity: isOriginal ? 0.35 : 1,
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{DAYS[i]}</span>
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700,
                      background: isSelected ? 'var(--accent)' : 'transparent',
                      color: isSelected ? '#000' : 'var(--text-primary)',
                      border: isOriginal ? '2px dashed var(--text-tertiary)' : isSelected ? 'none' : '2px solid var(--divider)',
                    }}>
                      {date.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              onClick={() => setMovePermanent(!movePermanent)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                background: movePermanent ? 'rgba(255,149,0,0.1)' : 'var(--bg-primary)',
                borderRadius: 12, cursor: 'pointer', marginBottom: 16,
                border: movePermanent ? '1px solid var(--accent-orange)' : '1px solid var(--divider)',
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                border: movePermanent ? 'none' : '2px solid var(--text-tertiary)',
                background: movePermanent ? 'var(--accent-orange)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#000', fontSize: 14, fontWeight: 900,
              }}>
                {movePermanent && '\u2713'}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700 }}>Save for all future weeks</p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {movePermanent ? 'This workout will always be on the new day' : 'Only moves it for this week'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={confirmMove}
                disabled={!moveTarget || moveSaving}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
                  background: moveTarget ? 'var(--accent)' : 'var(--bg-primary)',
                  color: moveTarget ? '#000' : 'var(--text-tertiary)',
                  fontSize: 14, fontWeight: 700, cursor: moveTarget ? 'pointer' : 'default',
                }}
              >
                {moveSaving ? 'Scheduling...' : 'Confirm'}
              </button>
              <button
                onClick={() => setMovingWorkout(null)}
                style={{
                  padding: '12px 20px', borderRadius: 12,
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  border: '1px solid var(--divider)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workouts Section -- hidden when enhanced today is active (it shows sessions instead) */}
      {!hasEnhancedToday && <>
      <div className="section-header">
        <h2>Workouts</h2>
      </div>

      {/* Hero Workout Card */}
      <div
        className="card"
        onClick={() => todayWorkout?.id && navigate(`/explore?workout=${todayWorkout.id}`)}
        style={{
          padding: 0, overflow: 'hidden', position: 'relative',
          background: 'var(--bg-card)',
          cursor: todayWorkout?.id ? 'pointer' : 'default',
        }}
      >
        <WorkoutThumb
          title={todayWorkout?.title || '#1 Full Body Mobility'}
          thumbnailUrl={todayWorkout?.image_url}
          aspectRatio="1/1"
          borderRadius={0}
          titleFontSize={28}
        />
        <div style={{ padding: '14px 20px 18px', color: 'var(--text-primary)' }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
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

      {/* Today's Meal Plan */}
      {todayMealPlan && (
        <>
          <div className="section-header" style={{ marginTop: 8 }}>
            <h2>Today's Meals</h2>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Week {todayMealPlan.week_number}, Day {todayMealPlan.day_number}
            </span>
          </div>
          <div className="card" onClick={() => navigate('/nutrition')} style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,140,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 16 }}>🍽</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{todayMealPlan.plan_title}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{todayMealPlan.schedule_title}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{Math.round(todayMealPlan.day_totals?.calories || 0)}</p>
                <p style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 700 }}>kcal</p>
              </div>
            </div>
            <div style={{ padding: '10px 16px' }}>
              {/* Macro bar */}
              <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 10, paddingTop: 6 }}>
                {[
                  { label: 'Protein', value: Math.round(todayMealPlan.day_totals?.protein || 0), unit: 'g', color: '#3DFFD2' },
                  { label: 'Fat', value: Math.round(todayMealPlan.day_totals?.fat || 0), unit: 'g', color: '#FF9500' },
                  { label: 'Carbs', value: Math.round(todayMealPlan.day_totals?.carbs || 0), unit: 'g', color: '#64D2FF' },
                ].map(({ label, value, unit, color }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color }}>{value}{unit}</p>
                    <p style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600 }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      </>}

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

      {/* Challenges & Levels hero card - sits below Activity */}
      <ChallengesCard token={token} onOpen={() => navigate('/challenges')} />

      {/* More Section */}
      <div className="section-header">
        <h2>More</h2>
      </div>
      {[
        { icon: '🏋️', label: 'Workout Planner', path: '/workout-planner' },
        { icon: '📅', label: 'Book Session', path: '/events?book=1' },
        { icon: '🔖', label: 'Favourites', path: '/favourites' },
        { icon: '🏃', label: 'Log Other Workout', path: '/log-workout' },
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

      {notifications.length > 0 && (
        <NotificationPopup
          notification={notifications[0]}
          onDismiss={() => dismissNotification(notifications[0])}
          onCompleteCheckin={(payload) => completeCheckin(notifications[0], payload)}
        />
      )}
    </div>
  );
}

const CATEGORY_COLORS = {
  BURN: '#FF453A', LIFT: '#FF8C00', MOVE: '#85FFBA',
  FLEX: '#5AC8FA', NUTRITION: '#34C759', SLEEP: '#AF52DE',
};
// Colour per level - a warm-to-cool climb so the tile colour itself
// communicates the user's progress on that category at a glance.
const LEVEL_COLORS = {
  0: '#94a3b8',  // slate (untested)
  1: '#fb7185',  // rose
  2: '#fb923c',  // amber
  3: '#facc15',  // gold
  4: '#22c55e',  // emerald
  5: '#8b5cf6',  // violet - mastery
};
const challengesCache = { data: null };

function ChallengesCard({ token, onOpen }) {
  const [data, setData] = useState(challengesCache.data);
  useEffect(() => {
    if (!token) return;
    fetch('/api/benchmarks', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { challengesCache.data = d; setData(d); } })
      .catch(() => {});
  }, [token]);

  const categories = data?.categories || [];
  const totalBenchmarks = categories.reduce((s, c) => s + c.benchmarks.length, 0);
  const avgLevel = totalBenchmarks > 0
    ? categories.reduce((s, c) => s + c.benchmarks.reduce((s2, b) => s2 + (b.current_level || 0), 0), 0) / totalBenchmarks
    : 0;

  return (
    <div
      onClick={onOpen}
      className="card"
      style={{ marginTop: 8, marginBottom: 12, padding: 16, cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: categories.length > 0 ? 12 : 0 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'rgba(133,255,186,0.15)', color: 'var(--accent-mint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
        }}>🏆</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 800 }}>Challenges & Levels</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {totalBenchmarks > 0 ? `${totalBenchmarks} tests · avg Lv ${avgLevel.toFixed(1)}/5` : 'Track benchmarks & climb the ladder'}
          </p>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>

      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: 8 }}>
          {categories.slice(0, 3).map(c => {
            const avg = c.benchmarks.reduce((s, b) => s + (b.current_level || 0), 0) / c.benchmarks.length;
            const lv = Math.round(avg);
            const color = LEVEL_COLORS[lv] || LEVEL_COLORS[0];
            return (
              <div key={c.category} style={{
                flex: 1, padding: '10px 10px', borderRadius: 10, textAlign: 'center',
                background: `linear-gradient(180deg, ${color}33, ${color}0F)`,
                border: `1px solid ${color}66`,
                borderTop: `3px solid ${color}`,
              }}>
                <p style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: 0.8, marginBottom: 2 }}>
                  {c.category}
                </p>
                <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)' }}>
                  LV {lv}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
