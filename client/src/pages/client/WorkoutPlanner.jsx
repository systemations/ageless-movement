import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MiniThumb } from '../../components/WorkoutThumb';

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WorkoutPlanner({ onBack, onSelectWorkout }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState([]);
  const [deletingWorkout, setDeletingWorkout] = useState(null); // { workout, date }
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [program, setProgram] = useState(null);
  const [weekSchedule, setWeekSchedule] = useState({}); // date -> [workout]

  // Drag state
  const [dragging, setDragging] = useState(null); // { workout, fromDate, fromIndex }
  const [dragOverDate, setDragOverDate] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 }); // for the floating ghost
  const [dropConfirm, setDropConfirm] = useState(null); // { workout, fromDate, toDate }
  const [saving, setSaving] = useState(false);
  const longPressTimer = useRef(null);
  const touchStart = useRef(null);
  const rowRefs = useRef({}); // date -> DOM element

  const today = new Date();
  const weekDates = getWeekDates();

  useEffect(() => { fetchData(); }, []);

  function getWeekDates() {
    const t = new Date();
    const monday = new Date(t);
    monday.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }

  const fetchData = async () => {
    try {
      // Fetch week schedule from the schedule API (respects reschedules)
      const start = weekDates[0].toISOString().split('T')[0];
      const byDate = {};
      for (const date of weekDates) {
        const iso = date.toISOString().split('T')[0];
        const res = await fetch(`/api/schedule?date=${iso}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          // Include both client program workouts AND coach-assigned block workouts
          byDate[iso] = (data.workouts || []).filter(w => w.source === 'program' || w.source === 'block');
        } else {
          byDate[iso] = [];
        }
      }
      setWeekSchedule(byDate);

      // Fetch program/block info for context. Prefer the coach-assigned block
      // (from /api/athlete/today) since that's the active prescription.
      const todayRes = await fetch('/api/athlete/today', { headers: { Authorization: `Bearer ${token}` } });
      const todayData = todayRes.ok ? await todayRes.json() : null;
      if (todayData?.block) {
        setProgram({
          title: todayData.phase?.name || todayData.block.name,
          block_name: todayData.block.name,
          week: todayData.week_number,
          total_weeks: todayData.block.duration_weeks,
          source: 'block',
        });
      } else {
        // Fallback to dashboard activeProgram if no block is assigned
        const dashRes = await fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } });
        if (dashRes.ok) {
          const dash = await dashRes.json();
          if (dash.activeProgram) setProgram({ ...dash.activeProgram, source: 'program' });
        }
      }
    } catch (err) { console.error(err); }
  };

  // --- Touch-based drag and drop ---
  const handleTouchStart = useCallback((e, workout, date) => {
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = setTimeout(() => {
      setDragging({ workout, fromDate: date });
      setDragPos({ x: touch.clientX, y: touch.clientY });
      // Light haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(30);
    }, 400); // 400ms long press
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!dragging) {
      // Cancel long press if finger moves too much
      if (longPressTimer.current && touchStart.current) {
        const touch = e.touches[0];
        const dx = touch.clientX - touchStart.current.x;
        const dy = touch.clientY - touchStart.current.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      }
      return;
    }
    e.preventDefault();
    const touch = e.touches[0];
    setDragPos({ x: touch.clientX, y: touch.clientY });

    // Determine which row we're over
    let overDate = null;
    for (const [date, el] of Object.entries(rowRefs.current)) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        overDate = date;
        break;
      }
    }
    setDragOverDate(overDate);
  }, [dragging]);

  const handleTouchEnd = useCallback(() => {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = null;

    if (dragging && dragOverDate && dragOverDate !== dragging.fromDate) {
      setDropConfirm({
        workout: dragging.workout,
        fromDate: dragging.fromDate,
        toDate: dragOverDate,
      });
    }
    setDragging(null);
    setDragOverDate(null);
  }, [dragging, dragOverDate]);

  useEffect(() => {
    if (dragging) {
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      return () => {
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [dragging, handleTouchMove, handleTouchEnd]);

  // --- Mouse-based drag (desktop) ---
  const handleMouseDragStart = (e, workout, date) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ workout_id: workout.workout_id, fromDate: date }));
    setDragging({ workout, fromDate: date });
  };

  const handleMouseDragOver = (e, date) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(date);
  };

  const handleMouseDrop = (e, toDate) => {
    e.preventDefault();
    setDragOverDate(null);
    if (dragging && toDate !== dragging.fromDate) {
      setDropConfirm({
        workout: dragging.workout,
        fromDate: dragging.fromDate,
        toDate,
      });
    }
    setDragging(null);
  };

  // --- Confirm the move ---
  const confirmDrop = async (permanent) => {
    if (!dropConfirm) return;
    setSaving(true);
    try {
      await fetch('/api/schedule/reschedule', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workout_id: dropConfirm.workout.workout_id,
          program_id: dropConfirm.workout.program_id,
          original_date: dropConfirm.fromDate,
          new_date: dropConfirm.toDate,
          permanent,
        }),
      });
      setDropConfirm(null);
      fetchData(); // refresh
    } catch (err) {
      console.error('Reschedule error:', err);
    }
    setSaving(false);
  };

  const cancelDrop = () => setDropConfirm(null);

  const formatDate = (date) => {
    const d = date.getDate();
    const m = date.toLocaleDateString('en-IE', { month: 'short' });
    return `${d} ${m}`;
  };

  return (
    <div
      className="page-content"
      style={{
        touchAction: dragging ? 'none' : undefined,
        userSelect: dragging ? 'none' : undefined,
        overflowX: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Workout Planner</h1>
          {program ? (
            <p style={{
              fontSize: 12, color: 'var(--text-secondary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {program.title}
              {program.week && program.total_weeks ? ` · Wk ${program.week}/${program.total_weeks}` : ''}
            </p>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>This Week</p>
          )}
        </div>
        <div style={{ width: 36 }} />
      </div>

      {/* Hint */}
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: 8 }}>
        Hold and drag a workout to move it to another day
      </p>

      {/* Weekly workout list */}
      {weekDates.map((date, i) => {
        const iso = date.toISOString().split('T')[0];
        const isToday = date.toDateString() === today.toDateString();
        const dayWorkouts = weekSchedule[iso] || [];
        const isOver = dragOverDate === iso && dragging?.fromDate !== iso;

        return (
          <div
            key={i}
            ref={(el) => { rowRefs.current[iso] = el; }}
            onDragOver={(e) => handleMouseDragOver(e, iso)}
            onDragLeave={() => setDragOverDate(null)}
            onDrop={(e) => handleMouseDrop(e, iso)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
              borderBottom: '1px solid var(--divider)',
              background: isOver ? 'rgba(255,149,0,0.08)' : 'transparent',
              borderRadius: isOver ? 10 : 0,
              transition: 'background 0.15s ease',
              minHeight: 76,
            }}
          >
            <div style={{ width: 50, textAlign: 'center', flexShrink: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: isToday ? 'var(--accent)' : 'var(--text-primary)' }}>
                {formatDate(date)}
              </p>
              <p style={{ fontSize: 11, color: isToday ? 'var(--accent)' : 'var(--text-secondary)' }}>
                {isToday ? 'Today' : DAYS_SHORT[i]}
              </p>
            </div>

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dayWorkouts.length > 0 ? dayWorkouts.map((w, wi) => {
                const isDraggingThis = dragging?.workout?.workout_id === w.workout_id && dragging?.fromDate === iso;
                return (
                  <div
                    key={`${w.workout_id}-${wi}`}
                    draggable
                    onDragStart={(e) => handleMouseDragStart(e, w, iso)}
                    onDragEnd={() => { setDragging(null); setDragOverDate(null); }}
                    onTouchStart={(e) => handleTouchStart(e, w, iso)}
                    onClick={() => { if (!dragging) navigate(`/explore?workout=${w.workout_id}`); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: 'var(--bg-card)', borderRadius: 12, padding: '10px 12px',
                      cursor: 'grab', opacity: isDraggingThis ? 0.3 : 1,
                      border: isDraggingThis ? '2px dashed var(--accent-orange)' : '2px solid transparent',
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    <div style={{
                      width: 48, height: 48, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
                      background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {w.image_url ? (
                        <img src={w.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <MiniThumb title={w.title || 'Workout'} size={48} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {w.title}
                      </p>
                      <p style={{ fontSize: 12, color: isToday ? 'var(--accent)' : 'var(--text-secondary)' }}>
                        {w.duration_mins ? (w.duration_mins >= 60 ? `${Math.floor(w.duration_mins / 60)}h ${w.duration_mins % 60}m` : `${w.duration_mins} min`) : ''}
                      </p>
                    </div>
                    {/* Delete icon */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingWorkout({ workout: w, date: iso }); }}
                      title="Delete from schedule"
                      style={{
                        flexShrink: 0, width: 28, height: 28, borderRadius: 6,
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-tertiary)', padding: 0,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2"/>
                      </svg>
                    </button>
                  </div>
                );
              }) : (
                isOver ? (
                  <div style={{ padding: '6px 0' }}>
                    <p style={{ fontSize: 13, color: 'var(--accent)' }}>Drop here</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', flex: 1 }}>Rest day</p>
                    <button
                      onClick={() => navigate(`/home?day=${iso}&add=1`)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '6px 12px', borderRadius: 8,
                        background: 'rgba(255,149,0,0.12)', color: 'var(--accent-orange)',
                        border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      Add workout
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        );
      })}

      {/* Floating drag ghost (touch only) */}
      {dragging && dragPos.y > 0 && (
        <div style={{
          position: 'fixed',
          left: dragPos.x - 120,
          top: dragPos.y - 30,
          width: 240,
          pointerEvents: 'none',
          zIndex: 999,
          opacity: 0.85,
        }}>
          <div style={{
            background: 'var(--accent)', borderRadius: 12, padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
              background: 'rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {dragging.workout.image_url ? (
                <img src={dragging.workout.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <MiniThumb title={dragging.workout.title || 'Workout'} size={36} borderRadius={8} />
              )}
            </div>
            <p style={{
              fontSize: 13, fontWeight: 700, color: '#000',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {dragging.workout.title}
            </p>
          </div>
        </div>
      )}

      {/* Drop confirmation modal */}
      {dropConfirm && (
        <div
          onClick={cancelDrop}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: 20, padding: 20,
            maxWidth: 340, width: '100%',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Move workout</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {dropConfirm.workout.title}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
              {DAYS_SHORT[weekDates.findIndex(d => d.toISOString().split('T')[0] === dropConfirm.fromDate)]}
              {' '}&#8594;{' '}
              {DAYS_SHORT[weekDates.findIndex(d => d.toISOString().split('T')[0] === dropConfirm.toDate)]}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => confirmDrop(false)}
                disabled={saving}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {saving ? 'Moving...' : 'Just this week'}
              </button>
              <button
                onClick={() => confirmDrop(true)}
                disabled={saving}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 12,
                  border: '1px solid var(--accent)', background: 'transparent',
                  color: 'var(--accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {saving ? 'Moving...' : 'Save for all future weeks'}
              </button>
              <button
                onClick={cancelDrop}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 12,
                  border: 'none', background: 'transparent',
                  color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Delete confirmation modal */}
      {deletingWorkout && (
        <div
          onClick={() => !deleteSaving && setDeletingWorkout(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: 20, padding: 20,
            maxWidth: 340, width: '100%',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Delete workout?</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {deletingWorkout.workout.title}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
              This removes it from your schedule for this day only. Your program stays the same for other weeks.
            </p>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  setDeleteSaving(true);
                  try {
                    const w = deletingWorkout.workout;
                    const d = deletingWorkout.date;
                    if (w.source === 'user') {
                      // User-added scheduled workout - hard delete via schedule_id
                      await fetch(`/api/schedule/${w.schedule_id}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` },
                      });
                    } else {
                      // Program or block-sourced: create a one-off suppression
                      await fetch('/api/schedule/suppress', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ workout_id: w.workout_id, date: d }),
                      });
                    }
                    setDeletingWorkout(null);
                    fetchData();
                  } catch (err) { console.error('Delete error:', err); }
                  setDeleteSaving(false);
                }}
                disabled={deleteSaving}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
                  background: '#FF453A', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  opacity: deleteSaving ? 0.6 : 1,
                }}
              >
                {deleteSaving ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setDeletingWorkout(null)}
                disabled={deleteSaving}
                style={{
                  padding: '12px 20px', borderRadius: 12,
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  border: '1px solid var(--divider)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
