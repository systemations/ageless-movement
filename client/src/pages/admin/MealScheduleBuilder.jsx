import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../components/ImageUpload';

// Fullscreen meal schedule builder with three-pane layout:
//   Left   - draggable meal plan library
//   Center - scrollable week x day grid canvas
//   Right  - day detail panel (meal slots, items, alternatives, swap plan)
//
// Clicking a day cell opens the detail panel. Drag-and-drop from library to
// grid is supported. Explicit Save button batches all dirty changes.

export default function MealScheduleBuilder({ scheduleId, onClose, onSaved }) {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [schedule, setSchedule] = useState(null);
  const [weeks, setWeeks] = useState([]);
  const [mealPlans, setMealPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Local entries map { "w:d": planId }
  const [entries, setEntries] = useState({});
  const [initialEntries, setInitialEntries] = useState({});

  // Metadata
  const [form, setForm] = useState({
    title: '', description: '', image_url: '', category: 'general',
    duration_weeks: 1, calorie_target_min: '', calorie_target_max: '',
  });
  const [initialForm, setInitialForm] = useState(null);

  const [search, setSearch] = useState('');
  const [previewTarget, setPreviewTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragPlan, setDragPlan] = useState(null);
  const [dragOverCell, setDragOverCell] = useState(null);
  const [metaOpen, setMetaOpen] = useState(false);

  // Day detail panel
  const [selectedDay, setSelectedDay] = useState(null); // { weekNum, dayNum }
  const [dayDetail, setDayDetail] = useState(null);      // full plan items from server
  const [dayDetailLoading, setDayDetailLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);        // show plan picker inside detail

  // ---------------------------------------------------------------- load
  const loadAll = async () => {
    setLoading(true);
    const qs = previewTarget ? `?calorie_target=${previewTarget}` : '';
    const [schedRes, plansRes] = await Promise.all([
      fetch(`/api/nutrition/meal-schedules/${scheduleId}${qs}`, { headers }),
      fetch('/api/nutrition/meal-plans', { headers }),
    ]);
    const schedData = await schedRes.json();
    const plansData = await plansRes.json();

    setSchedule(schedData.schedule);
    setWeeks(schedData.weeks || []);
    setMealPlans(plansData.plans || []);

    const flat = {};
    (schedData.weeks || []).forEach((w) => {
      w.days.forEach((d) => {
        if (d.plan?.id) flat[`${w.week_number}:${d.day_number}`] = d.plan.id;
      });
    });
    setEntries(flat);
    setInitialEntries(flat);

    const meta = {
      title: schedData.schedule?.title || '',
      description: schedData.schedule?.description || '',
      image_url: schedData.schedule?.image_url || '',
      category: schedData.schedule?.category || 'general',
      duration_weeks: schedData.schedule?.duration_weeks || 1,
      calorie_target_min: schedData.schedule?.calorie_target_min || '',
      calorie_target_max: schedData.schedule?.calorie_target_max || '',
    };
    setForm(meta);
    setInitialForm(meta);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [scheduleId]);
  useEffect(() => { if (schedule) loadAll(); }, [previewTarget]);

  // Load detail when a day is selected
  const loadDayDetail = async (planId) => {
    if (!planId) { setDayDetail(null); return; }
    setDayDetailLoading(true);
    try {
      const qs = previewTarget ? `?calorie_target=${previewTarget}` : '';
      const res = await fetch(`/api/nutrition/meal-plans/${planId}${qs}`, { headers });
      const data = await res.json();
      setDayDetail(data);
    } catch { setDayDetail(null); }
    setDayDetailLoading(false);
  };

  useEffect(() => {
    if (!selectedDay) { setDayDetail(null); setSwapping(false); return; }
    const planId = entries[`${selectedDay.weekNum}:${selectedDay.dayNum}`];
    loadDayDetail(planId);
  }, [selectedDay, entries[selectedDay ? `${selectedDay.weekNum}:${selectedDay.dayNum}` : '']]);

  // ---------------------------------------------------------------- dirty
  const entriesDirty = useMemo(() => {
    const a = Object.keys(entries).sort();
    const b = Object.keys(initialEntries).sort();
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i] || entries[a[i]] !== initialEntries[a[i]]) return true;
    }
    return false;
  }, [entries, initialEntries]);

  const formDirty = useMemo(() => {
    if (!initialForm) return false;
    return Object.keys(form).some((k) => String(form[k] ?? '') !== String(initialForm[k] ?? ''));
  }, [form, initialForm]);

  const dirty = entriesDirty || formDirty;

  // ---------------------------------------------------------------- mutate
  const assign = (weekNum, dayNum, planId) => {
    setEntries((e) => ({ ...e, [`${weekNum}:${dayNum}`]: planId }));
  };
  const clear = (weekNum, dayNum) => {
    setEntries((e) => { const n = { ...e }; delete n[`${weekNum}:${dayNum}`]; return n; });
  };
  const copyWeek = (fromWeek, toWeek) => {
    setEntries((e) => {
      const n = { ...e };
      for (let d = 1; d <= 7; d++) { const s = e[`${fromWeek}:${d}`]; if (s) n[`${toWeek}:${d}`] = s; else delete n[`${toWeek}:${d}`]; }
      return n;
    });
  };
  const clearWeek = (weekNum) => {
    setEntries((e) => { const n = { ...e }; for (let d = 1; d <= 7; d++) delete n[`${weekNum}:${d}`]; return n; });
  };

  // ---------------------------------------------------------------- save
  const saveAll = async () => {
    setSaving(true);
    try {
      if (formDirty) {
        await fetch(`/api/nutrition/meal-schedules/${scheduleId}`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title, description: form.description, image_url: form.image_url,
            category: form.category, duration_weeks: Number(form.duration_weeks) || 1,
            calorie_target_min: Number(form.calorie_target_min) || null,
            calorie_target_max: Number(form.calorie_target_max) || null,
          }),
        });
      }
      if (entriesDirty) {
        const flat = Object.entries(entries).map(([key, plan_id]) => {
          const [w, d] = key.split(':').map(Number);
          return { week_number: w, day_number: d, meal_plan_id: plan_id };
        });
        await fetch(`/api/nutrition/meal-schedules/${scheduleId}/entries`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: flat }),
        });
      }
      await loadAll();
      onSaved?.();
    } catch (err) { console.error(err); alert('Save failed.'); }
    setSaving(false);
  };

  const tryClose = () => {
    if (dirty && !confirm('You have unsaved changes. Discard?')) return;
    onClose();
  };

  // ---------------------------------------------------------------- helpers
  const planById = useMemo(() => { const m = new Map(); mealPlans.forEach((p) => m.set(p.id, p)); return m; }, [mealPlans]);

  const getDayTotals = (weekNum, dayNum) => {
    const serverWeek = weeks.find((w) => w.week_number === weekNum);
    const serverDay = serverWeek?.days.find((d) => d.day_number === dayNum);
    const currentId = entries[`${weekNum}:${dayNum}`];
    if (serverDay?.plan?.id === currentId) return { totals: serverDay.day_totals, scale_factor: serverDay.scale_factor };
    const plan = planById.get(currentId);
    if (!plan) return { totals: null, scale_factor: 1 };
    return { totals: { calories: plan.target_calories, protein: plan.target_protein, fat: plan.target_fat, carbs: plan.target_carbs }, scale_factor: 1, unsaved: true };
  };

  const filteredPlans = useMemo(() => {
    const q = search.toLowerCase();
    return mealPlans.filter((p) => !q || (p.title || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
  }, [mealPlans, search]);

  const durationWeeks = Number(form.duration_weeks) || schedule?.duration_weeks || 1;
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const isSelected = (w, d) => selectedDay?.weekNum === w && selectedDay?.dayNum === d;

  // ---------------------------------------------------------------- render
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-primary)', zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
      {/* ---- Top bar ---- */}
      <div style={{
        padding: '10px 24px', background: 'var(--bg-card)', borderBottom: '1px solid var(--divider)',
        display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
      }}>
        <button onClick={tryClose} style={iconBtn} title="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Schedule title"
            style={{ fontSize: 18, fontWeight: 800, background: 'transparent', border: 'none', color: 'var(--text-primary)', width: '100%', padding: 0, outline: 'none' }} />
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {durationWeeks}w · {Object.keys(entries).length}/{durationWeeks * 7} days
            {dirty && <span style={{ color: 'var(--accent)', marginLeft: 8, fontWeight: 700 }}>* Unsaved</span>}
          </p>
        </div>
        <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase' }}>Preview</span>
          <input type="number" value={previewTarget} onChange={(e) => setPreviewTarget(e.target.value)} placeholder="kcal"
            style={{ width: 56, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, padding: 3, outline: 'none' }} />
          {previewTarget && <button onClick={() => setPreviewTarget('')} style={{ background: 'none', border: 'none', color: 'var(--accent-mint)', cursor: 'pointer', fontSize: 11 }}>x</button>}
        </div>
        <button onClick={() => setMetaOpen((o) => !o)} style={iconBtn} title="Settings">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        </button>
        <button onClick={saveAll} disabled={!dirty || saving} style={{
          background: dirty ? 'var(--accent)' : 'rgba(255,140,0,0.12)', color: dirty ? '#fff' : 'var(--text-tertiary)',
          border: 'none', borderRadius: 10, padding: '9px 22px', fontSize: 13, fontWeight: 700,
          cursor: dirty ? 'pointer' : 'not-allowed', opacity: saving ? 0.6 : 1,
        }}>{saving ? 'Saving...' : dirty ? 'Save Changes' : 'Saved'}</button>
      </div>

      {/* ---- Metadata drawer ---- */}
      {metaOpen && (
        <div style={{ padding: '14px 24px', background: 'var(--bg-card)', borderBottom: '1px solid var(--divider)', display: 'flex', gap: 14, alignItems: 'start', flexWrap: 'wrap' }}>
          <div style={{ width: 140 }}>
            <label style={labelStyle}>Cover</label>
            <ImageUpload value={form.image_url} onChange={(url) => setForm((f) => ({ ...f, image_url: url }))} width={140} height={90} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle}>Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
          </div>
          <div style={{ width: 130 }}><label style={labelStyle}>Category</label><input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={inputStyle} /></div>
          <div style={{ width: 100 }}><label style={labelStyle}>Min kcal</label><input type="number" value={form.calorie_target_min} onChange={(e) => setForm((f) => ({ ...f, calorie_target_min: e.target.value }))} style={inputStyle} /></div>
          <div style={{ width: 100 }}><label style={labelStyle}>Max kcal</label><input type="number" value={form.calorie_target_max} onChange={(e) => setForm((f) => ({ ...f, calorie_target_max: e.target.value }))} style={inputStyle} /></div>
        </div>
      )}

      {/* ---- Body: sidebar + grid + day detail ---- */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left: meal plan library */}
        <div style={{ width: 260, flexShrink: 0, background: 'var(--bg-card)', borderRight: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--divider)' }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Meal Plans · {mealPlans.length}
            </h3>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." style={{ ...inputStyle, fontSize: 12 }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
            {filteredPlans.map((p) => (
              <div key={p.id} draggable onDragStart={() => setDragPlan(p)} onDragEnd={() => { setDragPlan(null); setDragOverCell(null); }}
                style={{ padding: 8, borderRadius: 8, marginBottom: 4, cursor: 'grab', background: dragPlan?.id === p.id ? 'rgba(255,140,0,0.2)' : 'var(--bg-primary)', border: '1px solid transparent' }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}>
                <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
                <p style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
                  {p.target_calories || 0} cal · {Math.round(p.target_protein || 0)}p/{Math.round(p.target_fat || 0)}f/{Math.round(p.target_carbs || 0)}c
                </p>
                {p.category && <span style={{ display: 'inline-block', marginTop: 3, padding: '1px 5px', borderRadius: 6, background: 'rgba(255,140,0,0.12)', color: 'var(--accent)', fontSize: 8, fontWeight: 700 }}>{p.category}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Center: week grid canvas */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, minWidth: 0 }}>
          {loading && <p style={{ color: 'var(--text-tertiary)', padding: 20 }}>Loading schedule...</p>}
          {!loading && Array.from({ length: durationWeeks }, (_, i) => i + 1).map((weekNum) => {
            const weekFilled = Array.from({ length: 7 }, (_, i) => entries[`${weekNum}:${i + 1}`]).filter(Boolean).length;
            return (
              <div key={weekNum} style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <h2 style={{ fontSize: 13, fontWeight: 800 }}>Week {weekNum}</h2>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{weekFilled}/7</span>
                  <div style={{ flex: 1 }} />
                  {weekNum < durationWeeks && <button onClick={() => copyWeek(weekNum, weekNum + 1)} style={smallBtn}>Copy → Wk {weekNum + 1}</button>}
                  {weekFilled > 0 && <button onClick={() => clearWeek(weekNum)} style={{ ...smallBtn, color: '#FF453A', background: 'rgba(255,69,58,0.1)' }}>Clear</button>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                  {Array.from({ length: 7 }, (_, i) => i + 1).map((dayNum) => {
                    const cellKey = `${weekNum}:${dayNum}`;
                    const planId = entries[cellKey];
                    const plan = planId ? planById.get(planId) : null;
                    const { totals, scale_factor } = getDayTotals(weekNum, dayNum);
                    const isOver = dragOverCell === cellKey;
                    const sel = isSelected(weekNum, dayNum);
                    return (
                      <div key={dayNum}
                        onDragOver={(e) => { e.preventDefault(); setDragOverCell(cellKey); }}
                        onDragLeave={() => setDragOverCell((c) => (c === cellKey ? null : c))}
                        onDrop={(e) => { e.preventDefault(); if (dragPlan) assign(weekNum, dayNum, dragPlan.id); setDragOverCell(null); setDragPlan(null); }}
                        onClick={() => {
                          if (sel) { setSelectedDay(null); }
                          else { setSelectedDay({ weekNum, dayNum }); setSwapping(false); }
                        }}
                        style={{
                          background: sel ? 'rgba(255,140,0,0.15)' : isOver ? 'rgba(255,140,0,0.1)' : plan ? 'var(--bg-card)' : 'var(--bg-primary)',
                          border: sel ? '2px solid var(--accent)' : isOver ? '2px dashed var(--accent)' : plan ? '1px solid var(--divider)' : '1px dashed var(--divider)',
                          borderRadius: 10, padding: 8, minHeight: 90, cursor: 'pointer',
                          display: 'flex', flexDirection: 'column', position: 'relative', transition: 'all 0.1s',
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: sel ? 'var(--accent)' : 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase' }}>{dayNames[dayNum - 1]}</span>
                          {plan && (
                            <button onClick={(e) => { e.stopPropagation(); clear(weekNum, dayNum); if (sel) setSelectedDay(null); }}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          )}
                        </div>
                        {plan ? (
                          <>
                            <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 3, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{plan.title}</p>
                            {totals && (
                              <p style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 'auto' }}>
                                {Math.round(totals.calories || 0)} cal
                                {scale_factor && Math.abs(scale_factor - 1) > 0.02 && <span style={{ color: 'var(--accent-mint)' }}> {scale_factor.toFixed(2)}x</span>}
                              </p>
                            )}
                          </>
                        ) : (
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 10, fontStyle: 'italic' }}>+</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: day detail panel */}
        {selectedDay && (
          <DayDetailPanel
            weekNum={selectedDay.weekNum}
            dayNum={selectedDay.dayNum}
            dayNames={dayNames}
            planId={entries[`${selectedDay.weekNum}:${selectedDay.dayNum}`]}
            plan={planById.get(entries[`${selectedDay.weekNum}:${selectedDay.dayNum}`])}
            detail={dayDetail}
            loading={dayDetailLoading}
            swapping={swapping}
            setSwapping={setSwapping}
            filteredPlans={filteredPlans}
            search={search}
            setSearch={setSearch}
            onAssign={(planId) => { assign(selectedDay.weekNum, selectedDay.dayNum, planId); setSwapping(false); }}
            onClear={() => { clear(selectedDay.weekNum, selectedDay.dayNum); }}
            onClose={() => setSelectedDay(null)}
            getDayTotals={() => getDayTotals(selectedDay.weekNum, selectedDay.dayNum)}
          />
        )}
      </div>
    </div>
  );
}

// =========================================================================
// Day detail panel - shows full meal plan breakdown on the right
// =========================================================================
function DayDetailPanel({
  weekNum, dayNum, dayNames, planId, plan, detail, loading,
  swapping, setSwapping, filteredPlans, search, setSearch,
  onAssign, onClear, onClose, getDayTotals,
}) {
  const { totals, scale_factor } = getDayTotals();

  // Group items by meal_type
  const mealSlots = useMemo(() => {
    if (!detail?.items) return [];
    const order = ['Early Morning', 'Breakfast', 'Mid Morning', 'Lunch', 'Dinner', 'Snack', 'Evening Snack'];
    const map = new Map();
    for (const item of detail.items) {
      const mt = item.meal_type || 'Other';
      if (!map.has(mt)) map.set(mt, { primary: [], alternatives: new Map() });
      const group = map.get(mt);
      if (item.alternative_group === 0) {
        group.primary.push(item);
      } else {
        if (!group.alternatives.has(item.alternative_group)) group.alternatives.set(item.alternative_group, []);
        group.alternatives.get(item.alternative_group).push(item);
      }
    }
    return order.filter((mt) => map.has(mt)).map((mt) => ({ meal_type: mt, ...map.get(mt) }));
  }, [detail]);

  return (
    <div style={{
      width: 400, flexShrink: 0, background: 'var(--bg-card)', borderLeft: '1px solid var(--divider)',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: 'rgba(255,140,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>{dayNum}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 800 }}>
            {dayNames[dayNum - 1]}, Week {weekNum}
          </p>
          {plan && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.title}</p>}
        </div>
        <button onClick={onClose} style={{ ...iconBtn, width: 28, height: 28 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Actions */}
      <div style={{ padding: '10px 16px', display: 'flex', gap: 8, borderBottom: '1px solid var(--divider)' }}>
        <button onClick={() => setSwapping(!swapping)} style={{
          flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          background: swapping ? 'var(--accent)' : 'rgba(255,140,0,0.12)', color: swapping ? '#fff' : 'var(--accent)',
        }}>
          {plan ? (swapping ? 'Cancel' : 'Swap Plan') : 'Assign Plan'}
        </button>
        {plan && (
          <button onClick={onClear} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: 'rgba(255,69,58,0.1)', color: '#FF453A',
          }}>Remove</button>
        )}
      </div>

      {/* Swap picker */}
      {swapping && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--divider)', maxHeight: 240, overflowY: 'auto' }}>
          {filteredPlans.map((mp) => (
            <button key={mp.id} onClick={() => onAssign(mp.id)} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8,
              border: mp.id === planId ? '1px solid var(--accent)' : '1px solid transparent',
              background: mp.id === planId ? 'rgba(255,140,0,0.1)' : 'transparent',
              cursor: 'pointer', color: 'var(--text-primary)', marginBottom: 3,
            }}>
              <p style={{ fontSize: 12, fontWeight: 600 }}>{mp.title}</p>
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{mp.target_calories || 0} cal · {mp.category}</p>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {loading && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: 20 }}>Loading...</p>}

        {!loading && !plan && !swapping && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>+</p>
            <p style={{ fontSize: 13 }}>No meal plan assigned.</p>
            <p style={{ fontSize: 11 }}>Click "Assign Plan" or drag one from the library.</p>
          </div>
        )}

        {!loading && plan && !swapping && (
          <>
            {/* Day totals summary */}
            {totals && (
              <div style={{
                background: 'var(--bg-primary)', borderRadius: 10, padding: 12, marginBottom: 16,
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, textAlign: 'center',
              }}>
                <div>
                  <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{Math.round(totals.calories || 0)}</p>
                  <p style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>kcal</p>
                </div>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 700 }}>{Math.round(totals.protein || 0)}g</p>
                  <p style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 700 }}>Protein</p>
                </div>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 700 }}>{Math.round(totals.fat || 0)}g</p>
                  <p style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 700 }}>Fat</p>
                </div>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 700 }}>{Math.round(totals.carbs || 0)}g</p>
                  <p style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 700 }}>Carbs</p>
                </div>
              </div>
            )}
            {scale_factor && Math.abs(scale_factor - 1) > 0.02 && (
              <div style={{ marginBottom: 12, padding: '6px 10px', borderRadius: 8, background: 'rgba(61,255,210,0.1)', fontSize: 11, color: 'var(--accent-mint)', fontWeight: 600 }}>
                Scaled to {scale_factor.toFixed(2)}x for preview target
              </div>
            )}

            {/* Meal slots */}
            {mealSlots.map((slot) => (
              <div key={slot.meal_type} style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--divider)' }}>
                  {slot.meal_type}
                </h4>
                {/* Primary items */}
                {slot.primary.map((item) => (
                  <ItemRow key={item.id} item={item} isPrimary />
                ))}
                {/* Alternatives */}
                {[...slot.alternatives.entries()].map(([groupNum, items]) => (
                  <div key={groupNum}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 4px' }}>
                      <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
                      <span style={{ fontSize: 9, color: 'var(--accent-mint)', fontWeight: 700, textTransform: 'uppercase' }}>or</span>
                      <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
                    </div>
                    {items.map((item) => (
                      <ItemRow key={item.id} item={item} />
                    ))}
                  </div>
                ))}
              </div>
            ))}

            {mealSlots.length === 0 && detail && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: 20 }}>
                No items in this plan yet.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Single item row inside a meal slot
function ItemRow({ item, isPrimary }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
      borderRadius: 8, marginBottom: 3,
      background: isPrimary ? 'var(--bg-primary)' : 'transparent',
    }}>
      {item.thumbnail_url ? (
        <img src={item.thumbnail_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,140,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 14 }}>🍽</span>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: isPrimary ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.recipe_title || item.custom_name || 'Item'}
        </p>
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          {item.serving_qty && item.serving_qty !== 1 ? `${item.serving_qty}x · ` : ''}
          {Math.round((item.calories || 0) * (item.serving_qty || 1))} cal
        </p>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 };
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--divider)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' };
const iconBtn = { background: 'var(--bg-primary)', border: 'none', borderRadius: 8, width: 36, height: 36, cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const smallBtn = { padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: 'rgba(61,255,210,0.12)', color: 'var(--accent-mint)', border: 'none', cursor: 'pointer' };
