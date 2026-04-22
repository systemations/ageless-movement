import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../components/ImageUpload';
import MealScheduleBuilder from './MealScheduleBuilder';

// Admin manager for MEAL SCHEDULES — assignable timelines in the three-tier
// model. A schedule wraps a duration (N weeks) and references meal_plans for
// each (week, day) slot via meal_schedule_entries.
//
// Left pane : list of schedules as cards (title, duration, calorie band, usage).
// Right pane: inline editor with metadata + a week tab bar + 7-day grid.
//             Clicking a day cell opens an inline picker of existing meal_plans
//             to assign. "Copy week" button duplicates the current week's
//             entries into the next week. Coach can preview any calorie target
//             by scaling on the server (?calorie_target=X).
//
// Assignment to clients is handled from ClientManager (not here).
export default function MealScheduleManager() {
  const { token } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [editing, setEditing] = useState(null);      // inline side panel, used only for NEW schedule creation
  const [builderId, setBuilderId] = useState(null);  // fullscreen builder for existing schedules
  const [search, setSearch] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => { fetchSchedules(); }, []);

  const fetchSchedules = async () => {
    const res = await fetch('/api/nutrition/meal-schedules', { headers });
    const data = await res.json();
    setSchedules(data.schedules || []);
  };

  const filtered = schedules.filter(s =>
    !search || s.title?.toLowerCase().includes(search.toLowerCase()) || s.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '24px 40px', display: 'grid', gridTemplateColumns: editing ? '1fr 680px' : '1fr', gap: 24 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800 }}>Meal Schedules</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              {schedules.length} schedule{schedules.length !== 1 ? 's' : ''} · assignable protocols built from meal plans
            </p>
          </div>
          <button onClick={() => setEditing({ __new: true })} style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
            padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>+ New Schedule</button>
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search schedules..."
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            border: '1px solid var(--divider)', background: 'var(--bg-card)',
            color: 'var(--text-primary)', fontSize: 13,
          }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {filtered.map(s => (
            <div
              key={s.id}
              onClick={() => setBuilderId(s.id)}
              style={{
                background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                border: '2px solid transparent',
              }}
            >
              <div style={{
                height: 130,
                background: s.image_url ? `url(${s.image_url}) center/cover` : 'linear-gradient(135deg, #1A2E1E, #243D26)',
              }} />
              <div style={{ padding: '12px 14px' }}>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{s.title}</p>
                <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                  <span>{s.duration_weeks}w</span>
                  <span>·</span>
                  <span>{s.entry_count || 0} days</span>
                  <span>·</span>
                  <span>{s.assigned_count || 0} clients</span>
                </div>
                {s.calorie_target_min && (
                  <p style={{ fontSize: 11, color: 'var(--accent-mint)', fontWeight: 600 }}>
                    {s.calorie_target_min}-{s.calorie_target_max} kcal
                  </p>
                )}
                {s.category && (
                  <span style={{
                    display: 'inline-block', marginTop: 4, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(255,140,0,0.15)', color: 'var(--accent)', fontSize: 10, fontWeight: 700,
                  }}>{s.category}</span>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              No schedules yet. Create one to get started.
            </div>
          )}
        </div>
      </div>

      {editing && editing.__new && (
        <ScheduleEditor
          key="new"
          schedule={null}
          token={token}
          onClose={() => setEditing(null)}
          onSaved={(newId) => {
            fetchSchedules();
            setEditing(null);
            if (newId) setBuilderId(newId);  // jump straight into the fullscreen builder
          }}
        />
      )}

      {builderId && (
        <MealScheduleBuilder
          scheduleId={builderId}
          onClose={() => setBuilderId(null)}
          onSaved={fetchSchedules}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Schedule editor — metadata + week/day grid
// -------------------------------------------------------------------------
function ScheduleEditor({ schedule, token, onClose, onSaved }) {
  const isNew = !schedule;
  const headers = { Authorization: `Bearer ${token}` };

  const [form, setForm] = useState({
    title: schedule?.title || '',
    description: schedule?.description || '',
    image_url: schedule?.image_url || '',
    category: schedule?.category || 'general',
    schedule_type: schedule?.schedule_type || 'weekly',
    duration_weeks: schedule?.duration_weeks || 1,
    repeating: schedule?.repeating ? 1 : 0,
    calorie_target_min: schedule?.calorie_target_min || '',
    calorie_target_max: schedule?.calorie_target_max || '',
  });
  const [detail, setDetail] = useState(null); // { schedule, weeks: [{ week_number, days }], calorie_target }
  const [mealPlans, setMealPlans] = useState([]);
  const [activeWeek, setActiveWeek] = useState(1);
  const [picking, setPicking] = useState(null); // { week_number, day_number }
  const [search, setSearch] = useState('');
  const [previewTarget, setPreviewTarget] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = async (id) => {
    const sid = id || schedule?.id || detail?.schedule?.id;
    if (!sid) return;
    const qs = previewTarget ? `?calorie_target=${previewTarget}` : '';
    const res = await fetch(`/api/nutrition/meal-schedules/${sid}${qs}`, { headers });
    const d = await res.json();
    setDetail(d);
  };

  useEffect(() => {
    if (schedule) reload(schedule.id);
    fetch('/api/nutrition/meal-plans', { headers })
      .then(r => r.json())
      .then(d => setMealPlans(d.plans || []));
  }, [schedule?.id]);

  useEffect(() => { if (detail?.schedule) reload(); /* eslint-disable-next-line */ }, [previewTarget]);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        duration_weeks: Number(form.duration_weeks) || 1,
        calorie_target_min: Number(form.calorie_target_min) || null,
        calorie_target_max: Number(form.calorie_target_max) || null,
      };
      if (isNew) {
        const res = await fetch('/api/nutrition/meal-schedules', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const d = await res.json();
        onSaved(d.id);
        return;
      } else {
        await fetch(`/api/nutrition/meal-schedules/${schedule.id}`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const remove = async () => {
    if (!schedule || !confirm(`Delete "${schedule.title}"? This unassigns it from any clients using it.`)) return;
    await fetch(`/api/nutrition/meal-schedules/${schedule.id}`, { method: 'DELETE', headers });
    onSaved();
    onClose();
  };

  const assignPlanToDay = async (weekNum, dayNum, planId) => {
    const sid = detail?.schedule?.id;
    if (!sid) return;
    await fetch(`/api/nutrition/meal-schedules/${sid}/entries`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_number: weekNum, day_number: dayNum, meal_plan_id: planId }),
    });
    setPicking(null);
    setSearch('');
    reload();
  };

  const copyWeek = async (fromWeek, toWeek) => {
    const sid = detail?.schedule?.id;
    if (!sid) return;
    const week = detail.weeks.find(w => w.week_number === fromWeek);
    if (!week) return;
    for (const day of week.days) {
      if (day.plan?.id) {
        await fetch(`/api/nutrition/meal-schedules/${sid}/entries`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ week_number: toWeek, day_number: day.day_number, meal_plan_id: day.plan.id }),
        });
      }
    }
    reload();
  };

  const filteredMealPlans = mealPlans.filter(p =>
    !search || p.title?.toLowerCase().includes(search.toLowerCase())
  );

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const activeWeekData = detail?.weeks?.find(w => w.week_number === activeWeek);

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12, padding: 20,
      position: 'sticky', top: 20, maxHeight: 'calc(100vh - 40px)', overflow: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>{isNew ? 'New Schedule' : 'Edit Schedule'}</h2>
        <button onClick={onClose} style={closeBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Metadata */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Title</label>
          <input value={form.title} onChange={e => update('title', e.target.value)} style={inputStyle} placeholder="e.g. Advanced Bulletproof Gut" />
        </div>
        <div>
          <label style={labelStyle}>Cover</label>
          <ImageUpload value={form.image_url} onChange={url => update('image_url', url)} width={140} height={80} />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Description</label>
        <textarea value={form.description} onChange={e => update('description', e.target.value)}
          style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} rows={2} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Category</label>
          <input value={form.category} onChange={e => update('category', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Weeks</label>
          <input type="number" value={form.duration_weeks} onChange={e => update('duration_weeks', e.target.value)}
            disabled={!isNew} style={{ ...inputStyle, opacity: isNew ? 1 : 0.5 }} min="1" max="52" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Min cal target</label>
          <input type="number" value={form.calorie_target_min} onChange={e => update('calorie_target_min', e.target.value)} style={inputStyle} placeholder="1400" />
        </div>
        <div>
          <label style={labelStyle}>Max cal target</label>
          <input type="number" value={form.calorie_target_max} onChange={e => update('calorie_target_max', e.target.value)} style={inputStyle} placeholder="1800" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {isNew && (
          <button onClick={save} disabled={saving || !form.title} style={{
            flex: 1, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            opacity: (saving || !form.title) ? 0.5 : 1,
          }}>{saving ? 'Saving...' : 'Create Schedule'}</button>
        )}
        {!isNew && (
          <button onClick={remove} style={{
            background: 'rgba(255,69,58,0.15)', color: '#FF453A', border: 'none', borderRadius: 8,
            padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Delete Schedule</button>
        )}
      </div>

      {/* Week grid — only when schedule exists */}
      {detail?.schedule && (
        <>
          {/* Preview calorie target */}
          <div style={{
            background: 'var(--bg-primary)', borderRadius: 10, padding: 10, marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase' }}>Preview at</span>
            <input
              type="number"
              value={previewTarget}
              onChange={e => setPreviewTarget(e.target.value)}
              placeholder="client target"
              style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: 12 }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>kcal</span>
            {previewTarget && (
              <button onClick={() => setPreviewTarget('')} style={{
                background: 'transparent', border: 'none', color: 'var(--accent-mint)',
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
              }}>Clear</button>
            )}
          </div>

          {/* Week tabs */}
          {detail.schedule.duration_weeks > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
              {Array.from({ length: detail.schedule.duration_weeks }, (_, i) => i + 1).map(w => (
                <button
                  key={w}
                  onClick={() => setActiveWeek(w)}
                  style={{
                    padding: '6px 14px', borderRadius: 16, border: 'none', flexShrink: 0,
                    background: w === activeWeek ? 'var(--accent)' : 'rgba(255,140,0,0.1)',
                    color: w === activeWeek ? '#fff' : 'var(--accent)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Wk {w}
                </button>
              ))}
            </div>
          )}

          {/* Copy-week action */}
          {detail.schedule.duration_weeks > 1 && activeWeek < detail.schedule.duration_weeks && (
            <button
              onClick={() => copyWeek(activeWeek, activeWeek + 1)}
              style={{
                marginBottom: 10, padding: '6px 12px', borderRadius: 8,
                background: 'rgba(61,255,210,0.12)', color: 'var(--accent-mint)',
                border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >↓ Copy Week {activeWeek} → Week {activeWeek + 1}</button>
          )}

          {/* Day grid */}
          <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Week {activeWeek} · 7 days
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 7 }, (_, i) => i + 1).map(dayNum => {
              const dayData = activeWeekData?.days.find(d => d.day_number === dayNum);
              const plan = dayData?.plan;
              const totals = dayData?.day_totals;
              const isPicking = picking?.week_number === activeWeek && picking?.day_number === dayNum;

              return (
                <div key={dayNum} style={{
                  background: 'var(--bg-primary)', borderRadius: 10, padding: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 8,
                      background: 'var(--bg-card)', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <p style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 700 }}>{dayNames[dayNum - 1]}</p>
                      <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>{dayNum}</p>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {plan ? (
                        <>
                          <p style={{ fontSize: 13, fontWeight: 700 }}>{plan.title}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {Math.round(totals?.calories || 0)} cal · {Math.round(totals?.protein || 0)}p
                            / {Math.round(totals?.fat || 0)}f / {Math.round(totals?.carbs || 0)}c
                            {dayData?.scale_factor && Math.abs(dayData.scale_factor - 1) > 0.02 && (
                              <span style={{ color: 'var(--accent-mint)', marginLeft: 6 }}>
                                ({dayData.scale_factor.toFixed(2)}×)
                              </span>
                            )}
                          </p>
                        </>
                      ) : (
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Empty</p>
                      )}
                    </div>
                    <button
                      onClick={() => setPicking(isPicking ? null : { week_number: activeWeek, day_number: dayNum })}
                      style={{
                        padding: '6px 12px', borderRadius: 6,
                        background: plan ? 'rgba(255,140,0,0.12)' : 'var(--accent)',
                        color: plan ? 'var(--accent)' : '#fff',
                        border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {plan ? 'Replace' : '+ Assign'}
                    </button>
                  </div>

                  {isPicking && (
                    <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-card)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <input
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="Search meal plans..."
                          style={{ ...inputStyle, fontSize: 12, padding: '6px 10px' }}
                          autoFocus
                        />
                        <button onClick={() => { setPicking(null); setSearch(''); }} style={{
                          background: 'transparent', border: 'none', color: 'var(--text-secondary)',
                          cursor: 'pointer', fontSize: 11, padding: '0 8px',
                        }}>Cancel</button>
                      </div>
                      <div style={{ maxHeight: 200, overflow: 'auto' }}>
                        {filteredMealPlans.map(mp => (
                          <button
                            key={mp.id}
                            onClick={() => assignPlanToDay(activeWeek, dayNum, mp.id)}
                            style={pickRow}
                            onMouseOver={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mp.title}</p>
                              <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                {mp.target_calories || 0} cal · {mp.category}
                              </p>
                            </div>
                          </button>
                        ))}
                        {filteredMealPlans.length === 0 && (
                          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: 10 }}>
                            No meal plans yet. Create one in the Meal Plans tab first.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const labelStyle = {
  fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4,
  fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
};

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--divider)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
};

const closeBtn = {
  width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--bg-primary)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const pickRow = {
  display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '8px 10px',
  background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left',
};
