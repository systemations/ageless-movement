import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekStart(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d.toISOString().split('T')[0];
}

function getWeekDates(startStr) {
  const base = new Date(startStr + 'T00:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

function formatDate(str) {
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
}

export default function ScheduleManager() {
  const { token } = useAuth();
  const [clients, setClients] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekData, setWeekData] = useState({});
  const [showAssign, setShowAssign] = useState(false);
  const [assignForm, setAssignForm] = useState({ user_id: '', program_id: '', started_at: new Date().toISOString().split('T')[0] });
  const [msg, setMsg] = useState('');
  // Drag state for the week calendar. dragItem holds:
  //   * an existing workout row being moved (from an on-calendar card), OR
  //   * a NEW program/workout dragged in from the right-side library panel
  //     (kind === 'new-program' or 'new-workout').
  const [dragItem, setDragItem] = useState(null);
  // Right-side library panel state
  const [libraryTab, setLibraryTab] = useState('programs'); // 'programs' | 'workouts'
  const [librarySearch, setLibrarySearch] = useState('');
  const [workoutsCatalog, setWorkoutsCatalog] = useState([]);
  // "Repeat week N times" inline control
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(3);
  const [repeatBusy, setRepeatBusy] = useState(false);

  // Fetch all workouts once so the library panel can search across every
  // workout in the system (not just the selected program's).
  useEffect(() => {
    fetch('/api/content/workouts', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setWorkoutsCatalog(d.workouts || []))
      .catch(() => setWorkoutsCatalog([]));
  }, [token]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const headers = { Authorization: `Bearer ${token}` };
    const [c, p, e] = await Promise.all([
      fetch('/api/coach/clients', { headers }).then(r => r.json()),
      fetch('/api/content/programs', { headers }).then(r => r.json()),
      fetch('/api/coach/schedules', { headers }).then(r => r.json()),
    ]);
    setClients(c.clients || []);
    setPrograms(p.programs || []);
    setEnrollments(e.enrollments || []);
  };

  // Fetch week view when client or week changes
  useEffect(() => {
    if (!selectedClient) { setWeekData({}); return; }
    const start = getWeekStart(weekOffset);
    fetch(`/api/coach/schedules/${selectedClient}/week?start=${start}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setWeekData(d.week || {}))
      .catch(() => setWeekData({}));
  }, [selectedClient, weekOffset]);

  const assignProgram = async () => {
    if (!assignForm.user_id || !assignForm.program_id) return;
    setMsg('');
    const res = await fetch('/api/coach/schedules', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(assignForm),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg('Program assigned');
      setShowAssign(false);
      setAssignForm({ user_id: '', program_id: '', started_at: new Date().toISOString().split('T')[0] });
      fetchData();
    } else {
      setMsg(data.error || 'Failed to assign');
    }
  };

  const removeEnrollment = async (id) => {
    await fetch(`/api/coach/schedules/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchData();
    setWeekData({});
  };

  // Reload just the current week view - cheaper than fetchData + used after
  // drag-drop moves so the grid reflects the new dates without losing nav state.
  const refetchWeek = async () => {
    if (!selectedClient) return;
    const start = getWeekStart(weekOffset);
    const res = await fetch(`/api/coach/schedules/${selectedClient}/week?start=${start}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await res.json();
    setWeekData(d.week || {});
  };

  // Drop handler. Four cases:
  //  * kind='new-program'  → POST /api/coach/schedules to enroll the client
  //    starting on the target date. Existing program enrollments are left
  //    alone (multi-program stacking is fine in this view).
  //  * kind='new-workout'  → POST /api/coach/schedules/user-workout to add an
  //    ad-hoc one-off workout on the target date. Does not touch any program.
  //  * source='user'       → PATCH the single ad-hoc row to the new date.
  //  * source='program'    → Shift the whole enrollment by (target - source)
  //    days because a program IS the schedule - nudging one day cascades.
  const handleDropOnDate = async (targetDate) => {
    if (!dragItem) return;

    // --- New program dropped from library panel ---
    if (dragItem.kind === 'new-program') {
      if (!selectedClient) { setDragItem(null); return; }
      const res = await fetch('/api/coach/schedules', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selectedClient, program_id: dragItem.id, started_at: targetDate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.error) setMsg(err.error);
      } else {
        setMsg(`Assigned ${dragItem.title} starting ${targetDate}`);
      }
      setDragItem(null);
      fetchData();
      refetchWeek();
      return;
    }

    // --- New ad-hoc workout dropped from library panel ---
    if (dragItem.kind === 'new-workout') {
      if (!selectedClient) { setDragItem(null); return; }
      await fetch('/api/coach/schedules/user-workout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selectedClient, workout_id: dragItem.id, scheduled_date: targetDate }),
      });
      setDragItem(null);
      refetchWeek();
      return;
    }

    // --- Existing card being moved between days on the calendar ---
    if (dragItem.fromDate === targetDate) { setDragItem(null); return; }
    const src = new Date(dragItem.fromDate + 'T00:00:00');
    const tgt = new Date(targetDate + 'T00:00:00');
    const deltaDays = Math.round((tgt - src) / (1000 * 60 * 60 * 24));

    if (dragItem.source === 'user' && dragItem.schedule_id) {
      await fetch(`/api/coach/schedules/user-workout/${dragItem.schedule_id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_date: targetDate }),
      });
    } else if (dragItem.source === 'program' && dragItem.enrollment_id) {
      const ok = confirm(`Shift the whole ${dragItem.program_title || 'program'} by ${deltaDays} day${Math.abs(deltaDays) === 1 ? '' : 's'}? Every day in the program will move together.`);
      if (!ok) { setDragItem(null); return; }
      await fetch(`/api/coach/schedules/${dragItem.enrollment_id}/shift`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: deltaDays }),
      });
      fetchData(); // enrollment started_at changed - refresh enrollment list card dates
    }
    setDragItem(null);
    refetchWeek();
  };

  const duplicateWeek = async () => {
    if (!selectedClient) return;
    const n = parseInt(repeatWeeks, 10);
    if (!Number.isFinite(n) || n < 1) { setMsg('Enter 1 or more weeks'); return; }
    setRepeatBusy(true);
    setMsg('');
    const start = getWeekStart(weekOffset);
    try {
      const res = await fetch(`/api/coach/schedules/${selectedClient}/week/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, weeks: n }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || 'Failed to duplicate'); return; }
      if (data.copied === 0) setMsg('No ad-hoc workouts in this week to repeat');
      else setMsg(`Copied ${data.copied} workout${data.copied === 1 ? '' : 's'} across ${n} week${n === 1 ? '' : 's'}`);
      setRepeatOpen(false);
      refetchWeek();
    } catch (e) {
      setMsg('Failed to duplicate');
    } finally {
      setRepeatBusy(false);
    }
  };

  const clientEnrollments = (clientId) => enrollments.filter(e => e.user_id === clientId);
  const weekStart = getWeekStart(weekOffset);
  const weekDates = getWeekDates(weekStart);
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div style={{ padding: '24px 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Schedules</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {enrollments.length} active enrollment{enrollments.length !== 1 ? 's' : ''} across {clients.length} client{clients.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowAssign(!showAssign)} style={{
          background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
          padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}>+ Assign Program</button>
      </div>

      {/* Assign program form */}
      {showAssign && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, marginBottom: 20, maxWidth: 700 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Assign Program to Client</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Client</label>
              <select
                value={assignForm.user_id}
                onChange={e => setAssignForm(f => ({ ...f, user_id: e.target.value }))}
                style={inputStyle}
              >
                <option value="">Select client...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Program</label>
              <select
                value={assignForm.program_id}
                onChange={e => setAssignForm(f => ({ ...f, program_id: e.target.value }))}
                style={inputStyle}
              >
                <option value="">Select program...</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.title} ({p.duration_weeks}w)</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Start date</label>
              <input
                type="date"
                value={assignForm.started_at}
                onChange={e => setAssignForm(f => ({ ...f, started_at: e.target.value }))}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button onClick={assignProgram} style={{
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>Assign</button>
            <button onClick={() => setShowAssign(false)} style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
            }}>Cancel</button>
            {msg && <span style={{ fontSize: 13, color: msg.includes('assign') ? 'var(--accent)' : '#FF453A' }}>{msg}</span>}
          </div>
        </div>
      )}

      {/* Layout: three-column with Clients list when nothing selected,
          two-column (calendar + library) when a client is selected so the
          calendar fills ~2/3 instead of being cramped. A "Back to Clients"
          button lets coach swap the selection if they picked wrong. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: selectedClient ? '1fr 280px' : '280px 1fr 280px',
        gap: 20,
        alignItems: 'start',
      }}>

        {/* Client list - hidden once a client is selected */}
        {!selectedClient && (
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700 }}>Clients</h3>
            </div>
            {clients.length === 0 ? (
              <p style={{ padding: 20, color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' }}>No clients yet</p>
            ) : (
              clients.map(c => {
                const ce = clientEnrollments(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClient(c.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: 'transparent',
                      borderBottom: '1px solid var(--divider)',
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--bg-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)',
                    }}>
                      {c.name?.charAt(0) || '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</p>
                      {ce.length > 0 ? (
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ce.map(e => e.program_title).join(', ')}
                        </p>
                      ) : (
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No program assigned</p>
                      )}
                    </div>
                    {ce.length > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: 'rgba(10,132,255,0.15)', color: '#0A84FF',
                      }}>{ce.length}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Right panel: enrollments + calendar */}
        <div>
          {!selectedClient ? (
            <div style={{
              background: 'var(--bg-card)', borderRadius: 12, padding: 40,
              textAlign: 'center', color: 'var(--text-tertiary)',
            }}>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Select a client</p>
              <p style={{ fontSize: 13 }}>Choose a client from the list to view their schedule and enrollments.</p>
            </div>
          ) : (
            <>
              {/* Back-to-Clients escape - useful when the coach picked the
                  wrong client and wants to swap without having to scroll
                  the narrow sidebar. */}
              <button
                onClick={() => setSelectedClient(null)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', marginBottom: 16,
                  background: 'var(--bg-card)', color: 'var(--text-secondary)',
                  border: '1px solid var(--divider)', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                ← Back to Clients
              </button>

              {/* Enrollments for selected client */}
              {(() => {
                const ce = clientEnrollments(selectedClient);
                const client = clients.find(c => c.id === selectedClient);
                return (
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
                      {client?.name} -- Enrolled Programs
                    </h3>
                    {ce.length === 0 ? (
                      <div style={{
                        background: 'var(--bg-card)', borderRadius: 10, padding: 16,
                        color: 'var(--text-tertiary)', fontSize: 13,
                      }}>
                        No programs assigned. Use the "Assign Program" button above.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        {ce.map(e => {
                          const pct = e.total_workouts > 0 ? Math.round((e.completed_workouts / e.total_workouts) * 100) : 0;
                          const startDate = new Date(e.started_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
                          return (
                            <div key={e.id} style={{
                              background: 'var(--bg-card)', borderRadius: 10, padding: '14px 16px',
                              border: '1px solid var(--divider)', minWidth: 220, flex: '1 1 220px', maxWidth: 340,
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                                <div>
                                  <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{e.program_title}</p>
                                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                    Started {startDate} -- {e.duration_weeks} weeks
                                  </p>
                                </div>
                                <button
                                  onClick={() => removeEnrollment(e.id)}
                                  title="Remove enrollment"
                                  style={{
                                    background: 'rgba(255,69,58,0.1)', border: 'none', borderRadius: 6,
                                    padding: '4px 8px', fontSize: 11, color: '#FF453A', cursor: 'pointer', fontWeight: 600,
                                  }}
                                >Remove</button>
                              </div>
                              {/* Progress bar */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--divider)', overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--accent)' }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                                  {e.completed_workouts}/{e.total_workouts}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Week calendar */}
              <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' }}>
                {/* Week nav */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderBottom: '1px solid var(--divider)',
                }}>
                  <button onClick={() => setWeekOffset(o => o - 1)} style={navBtnStyle}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>
                      {formatDate(weekDates[0])} -- {formatDate(weekDates[6])}
                    </span>
                    {weekOffset !== 0 && (
                      <button onClick={() => setWeekOffset(0)} style={{
                        marginLeft: 8, fontSize: 11, color: 'var(--accent)', background: 'none',
                        border: 'none', cursor: 'pointer', fontWeight: 600,
                      }}>Today</button>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {!repeatOpen ? (
                      <button
                        onClick={() => setRepeatOpen(true)}
                        title="Repeat this week's workouts forward N weeks"
                        style={{
                          fontSize: 12, fontWeight: 600, color: 'var(--accent)',
                          background: 'rgba(61,255,210,0.08)', border: '1px solid rgba(61,255,210,0.3)',
                          borderRadius: 6, padding: '6px 10px', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                        </svg>
                        Repeat week
                      </button>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Repeat for</span>
                        <input
                          type="number" min={1} max={52}
                          value={repeatWeeks}
                          onChange={e => setRepeatWeeks(e.target.value)}
                          disabled={repeatBusy}
                          style={{
                            width: 54, padding: '6px 8px', fontSize: 13, fontWeight: 600,
                            background: 'var(--bg-primary)', color: 'var(--text-primary)',
                            border: '1px solid var(--divider)', borderRadius: 6, textAlign: 'center',
                          }}
                        />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>more weeks</span>
                        <button
                          onClick={duplicateWeek}
                          disabled={repeatBusy}
                          style={{
                            fontSize: 12, fontWeight: 700, color: '#000', background: 'var(--accent)',
                            border: 'none', borderRadius: 6, padding: '6px 12px',
                            cursor: repeatBusy ? 'default' : 'pointer', opacity: repeatBusy ? 0.6 : 1,
                          }}
                        >
                          {repeatBusy ? '...' : 'Apply'}
                        </button>
                        <button
                          onClick={() => { setRepeatOpen(false); setMsg(''); }}
                          disabled={repeatBusy}
                          style={{
                            fontSize: 12, color: 'var(--text-secondary)', background: 'none',
                            border: 'none', cursor: 'pointer', padding: '6px 4px',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    <button onClick={() => setWeekOffset(o => o + 1)} style={navBtnStyle}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </div>
                </div>

                {/* Feedback strip for repeat-week action */}
                {msg && (
                  <div style={{
                    padding: '8px 16px', fontSize: 12, fontWeight: 600,
                    color: msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('no ad-hoc')
                      ? '#FFB340' : 'var(--accent)',
                    background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--divider)',
                  }}>
                    {msg}
                  </div>
                )}

                {/* Day columns */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: 200 }}>
                  {weekDates.map((date, i) => {
                    const workouts = weekData[date] || [];
                    const isToday = date === todayStr;
                    const isDropTarget = dragItem && dragItem.fromDate !== date;
                    return (
                      <div key={date}
                        onDragOver={e => {
                          if (isDropTarget) { e.preventDefault(); e.currentTarget.style.background = 'rgba(61,255,210,0.08)'; }
                        }}
                        onDragLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        onDrop={e => {
                          e.preventDefault();
                          e.currentTarget.style.background = 'transparent';
                          handleDropOnDate(date);
                        }}
                        style={{
                          borderRight: i < 6 ? '1px solid var(--divider)' : 'none',
                          padding: '10px 6px', minHeight: 180, transition: 'background 0.1s',
                        }}>
                        {/* Day header */}
                        <div style={{ textAlign: 'center', marginBottom: 8 }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 2 }}>{DAYS[i]}</p>
                          <span style={{
                            fontSize: 14, fontWeight: 700, display: 'inline-block',
                            width: 28, height: 28, lineHeight: '28px', borderRadius: '50%',
                            background: isToday ? 'var(--accent)' : 'transparent',
                            color: isToday ? '#000' : 'var(--text-primary)',
                          }}>
                            {new Date(date + 'T00:00:00').getDate()}
                          </span>
                        </div>
                        {/* Workout cards */}
                        {workouts.map((w, wi) => (
                          <div key={wi}
                            draggable
                            onDragStart={() => setDragItem({ ...w, fromDate: date })}
                            onDragEnd={() => setDragItem(null)}
                            title={w.source === 'program'
                              ? 'Drag to shift the whole program by the day delta'
                              : 'Drag to move this workout to another day'}
                            style={{
                              background: w.workout_type === 'follow_along' ? 'rgba(10,132,255,0.1)' : 'rgba(255,140,0,0.08)',
                              borderRadius: 6, padding: '6px 8px', marginBottom: 4, cursor: 'grab', userSelect: 'none',
                              borderLeft: `3px solid ${w.workout_type === 'follow_along' ? '#0A84FF' : 'var(--accent)'}`,
                              opacity: dragItem && dragItem.fromDate === date && dragItem.id === w.id ? 0.4 : 1,
                            }}>
                            <p style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3, color: 'var(--text-primary)' }}>
                              {w.title}
                            </p>
                            <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
                              {w.duration_mins && (
                                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{w.duration_mins}m</span>
                              )}
                              <span style={{
                                fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                                background: w.source === 'program' ? 'rgba(255,140,0,0.15)' : 'rgba(61,255,210,0.15)',
                                color: w.source === 'program' ? 'var(--accent)' : 'var(--accent-mint)',
                                textTransform: 'uppercase', letterSpacing: 0.3,
                              }}>{w.source === 'program' ? 'Program' : 'Ad-hoc'}</span>
                            </div>
                          </div>
                        ))}
                        {workouts.length === 0 && (
                          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 20 }}>Rest</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p style={{ padding: '10px 14px', fontSize: 10, color: 'var(--text-tertiary)', borderTop: '1px solid var(--divider)' }}>
                  Drag any workout between days. Moving an <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Program</span> workout
                  shifts the whole enrolment by the day delta. Moving an <span style={{ color: 'var(--accent-mint)', fontWeight: 700 }}>Ad-hoc</span> workout just moves that single day.
                </p>
              </div>
            </>
          )}
        </div>

        {/* ===== LIBRARY: drag a program or workout onto the calendar ===== */}
        <div style={{
          background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden',
          position: 'sticky', top: 16, maxHeight: 'calc(100vh - 40px)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--divider)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Library</h3>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Drag onto any day in the calendar</p>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', padding: '8px', gap: 6, borderBottom: '1px solid var(--divider)' }}>
            {['programs', 'workouts'].map(tab => (
              <button
                key={tab}
                onClick={() => setLibraryTab(tab)}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: libraryTab === tab ? 'var(--accent)' : 'transparent',
                  color: libraryTab === tab ? '#fff' : 'var(--text-secondary)',
                  fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
                }}
              >{tab}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: '8px 10px' }}>
            <input
              value={librarySearch}
              onChange={e => setLibrarySearch(e.target.value)}
              placeholder={libraryTab === 'programs' ? 'Search programs...' : 'Search workouts...'}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8,
                border: '1px solid var(--divider)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', fontSize: 12, outline: 'none',
              }}
            />
          </div>

          {/* Draggable rows */}
          <div style={{ overflow: 'auto', flex: 1, padding: '4px 10px 12px' }}>
            {!selectedClient && (
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: 10, textAlign: 'center' }}>
                Select a client first, then drag items here onto their calendar.
              </p>
            )}
            {selectedClient && libraryTab === 'programs' && (
              programs
                .filter(p => !librarySearch || (p.title || '').toLowerCase().includes(librarySearch.toLowerCase()))
                .slice(0, 40)
                .map(p => (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={() => setDragItem({ kind: 'new-program', id: p.id, title: p.title })}
                    onDragEnd={() => setDragItem(null)}
                    title="Drag onto a day to start this program for the selected client"
                    style={{
                      padding: '8px 10px', borderRadius: 8, marginBottom: 4, cursor: 'grab',
                      border: '1px solid var(--divider)', userSelect: 'none',
                      borderLeft: '3px solid var(--accent)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,140,0,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <p style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{p.title}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {p.duration_weeks}w · {p.workouts_per_week || '?'} workouts/wk
                    </p>
                  </div>
                ))
            )}
            {selectedClient && libraryTab === 'workouts' && (
              workoutsCatalog
                .filter(w => !librarySearch
                  || (w.title || '').toLowerCase().includes(librarySearch.toLowerCase())
                  || (w.body_parts || '').toLowerCase().includes(librarySearch.toLowerCase())
                  || (w.workout_type || '').toLowerCase().includes(librarySearch.toLowerCase()))
                .slice(0, 80)
                .map(w => (
                  <div
                    key={w.id}
                    draggable
                    onDragStart={() => setDragItem({ kind: 'new-workout', id: w.id, title: w.title })}
                    onDragEnd={() => setDragItem(null)}
                    title="Drag onto a day to schedule this as an ad-hoc workout"
                    style={{
                      padding: '8px 10px', borderRadius: 8, marginBottom: 4, cursor: 'grab',
                      border: '1px solid var(--divider)', userSelect: 'none',
                      borderLeft: '3px solid var(--accent-mint)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(61,255,210,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <p style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {w.program_title ? `${w.program_title} · ` : ''}
                      {w.duration_mins ? `${w.duration_mins}m` : ''}
                      {w.workout_type ? ` · ${w.workout_type}` : ''}
                    </p>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4,
  fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
};

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--divider)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: 14, outline: 'none',
};

const navBtnStyle = {
  width: 32, height: 32, borderRadius: 8, border: '1px solid var(--divider)',
  background: 'var(--bg-primary)', color: 'var(--text-secondary)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};
