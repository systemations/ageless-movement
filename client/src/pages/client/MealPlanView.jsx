import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import ShoppingListView from './ShoppingListView';

// Client meal view -- three-tier model (Recipe -> MealPlan -> MealSchedule).
//
// Flow:
//   1. Load /api/nutrition/my-schedule -- if the client has an active schedule,
//      render it with weeks -> days -> meals, all pre-scaled for their calorie target.
//   2. If no active schedule, browse /api/nutrition/meal-schedules and let them pick.
//   3. Tapping a day expands inline to show meals + alternatives grouped by meal_type.
export default function MealPlanView({ initialScheduleId } = {}) {
  const { token } = useAuth();
  const [mySchedule, setMySchedule] = useState(null);
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeWeek, setActiveWeek] = useState(1);
  const [expandedDays, setExpandedDays] = useState({});
  const [showShopping, setShowShopping] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [previewId, setPreviewId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [enrolling, setEnrolling] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => { fetchAll(); }, []);

  // If opened from Explore with a specific schedule, always load its preview
  useEffect(() => {
    if (initialScheduleId && !loading) {
      loadPreview(initialScheduleId);
    }
  }, [initialScheduleId, loading]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [mine, list] = await Promise.all([
        fetch('/api/nutrition/my-schedule', { headers }).then(r => r.json()),
        fetch('/api/nutrition/meal-schedules', { headers }).then(r => r.json()),
      ]);
      setMySchedule(mine?.schedule ? mine : null);
      setAvailable(list.schedules || []);
    } catch (e) {
      console.error('Load meal schedule error:', e);
    }
    setLoading(false);
  };

  const loadPreview = async (id) => {
    setPreviewId(id);
    const res = await fetch(`/api/nutrition/meal-schedules/${id}`, { headers });
    const data = await res.json();
    setPreview(data);
    setExpandedDays({});
    setActiveWeek(1);
  };

  const closePreview = () => { setPreviewId(null); setPreview(null); setConfirmReplace(null); setExpandedDays({}); };

  const toggleDay = (dayNum) => {
    setExpandedDays(prev => ({ ...prev, [dayNum]: !prev[dayNum] }));
  };

  const handleEnroll = async (scheduleId, force = false) => {
    setEnrolling(true);
    try {
      const res = await fetch(`/api/nutrition/meal-schedules/${scheduleId}/enroll`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      if (res.status === 409) {
        const data = await res.json();
        setConfirmReplace({ current: data.current, newId: scheduleId });
        setEnrolling(false);
        return;
      }
      if (res.ok) {
        setConfirmReplace(null);
        closePreview();
        await fetchAll();
      }
    } catch (err) {
      console.error('Enroll error:', err);
    }
    setEnrolling(false);
  };

  const generateShoppingList = async (scheduleId) => {
    setGenerating(true);
    try {
      const res = await fetch('/api/nutrition/shopping-lists/generate', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ meal_schedule_id: scheduleId }),
      });
      const data = await res.json();
      if (data.id) setShowShopping(data.id);
    } catch (err) { console.error(err); }
    setGenerating(false);
  };

  if (loading) {
    return <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}><div className="spinner" /></div>;
  }

  if (showShopping) {
    return <ShoppingListView listId={showShopping} onBack={() => setShowShopping(null)} />;
  }

  // ========== PREVIEW / DETAIL VIEW (from Explore tap or browse) ==========
  if (previewId && preview?.schedule) {
    const s = preview.schedule;
    const weeks = preview.weeks || [];
    const week = weeks.find(w => w.week_number === activeWeek) || weeks[0];
    const isCurrentlyActive = mySchedule?.schedule?.id === Number(previewId);

    return (
      <div className="page-content" style={{ paddingBottom: 120 }}>
        {/* Header image */}
        <div style={{
          height: 160, borderRadius: 16, overflow: 'hidden', marginBottom: 16,
          background: s.image_url
            ? `url(${s.image_url}) center/cover`
            : 'linear-gradient(135deg, #1A2E1E, #243D26)',
        }} />

        {/* Title + cart icon */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, flex: 1 }}>{s.title}</h2>
          <button
            onClick={() => generateShoppingList(Number(previewId))}
            disabled={generating}
            title="Shopping List"
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: 'rgba(255,149,0,0.12)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: generating ? 0.5 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
            </svg>
          </button>
        </div>

        {s.category && (
          <span style={{
            display: 'inline-block', marginBottom: 8, fontSize: 10, fontWeight: 700,
            padding: '2px 8px', borderRadius: 6,
            background: 'rgba(255,149,0,0.12)', color: 'var(--accent)',
          }}>{s.category}</span>
        )}

        {s.description && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
            {s.description}
          </p>
        )}

        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          {s.duration_weeks} week{s.duration_weeks !== 1 ? 's' : ''}
          {preview.calorie_target ? ` - ${preview.calorie_target} kcal target` : ''}
        </div>

        {/* Week picker */}
        {weeks.length > 1 && (
          <div className="hide-scrollbar" style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {weeks.map((w) => (
              <button
                key={w.week_number}
                onClick={() => { setActiveWeek(w.week_number); setExpandedDays({}); }}
                style={{
                  padding: '6px 14px', borderRadius: 16, border: 'none', flexShrink: 0,
                  background: w.week_number === activeWeek ? 'var(--accent)' : 'rgba(255,140,0,0.1)',
                  color: w.week_number === activeWeek ? '#fff' : 'var(--accent)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Week {w.week_number}
              </button>
            ))}
          </div>
        )}

        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Week {week?.week_number || 1}
        </h3>

        {/* Days with inline expansion */}
        {week?.days.map((day) => {
          const isExpanded = !!expandedDays[day.day_number];
          return (
            <div key={day.day_number} style={{ marginBottom: 8 }}>
              <div
                onClick={() => toggleDay(day.day_number)}
                className="card"
                style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: isExpanded ? 0 : undefined, borderRadius: isExpanded ? '12px 12px 0 0' : undefined }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--accent)', fontSize: 13, fontWeight: 800,
                }}>
                  {day.day_number}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, color: 'var(--accent-orange)', fontWeight: 700 }}>DAY {day.day_number}</p>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{day.plan?.title}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {day.items?.filter(i => i.alternative_group === 0).length || 0} meals
                  </p>
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginRight: 4 }}>
                  {Math.round(day.day_totals?.calories || 0)} cal
                </p>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5"
                  style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              {/* Expanded meals */}
              {isExpanded && day.items && (
                <div style={{
                  background: 'var(--bg-card)', borderRadius: '0 0 12px 12px',
                  padding: '8px 12px 12px', borderTop: '1px solid var(--divider)',
                }}>
                  <DayMeals items={day.items} />
                </div>
              )}
            </div>
          );
        })}

        {/* Confirm replace modal */}
        {confirmReplace && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
            <div style={{
              background: 'var(--bg-card)', borderRadius: 16, padding: 24, maxWidth: 340, width: '100%',
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Replace Current Schedule?</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>
                You already have <strong>{confirmReplace.current.title}</strong> active.
                Starting this schedule will replace it.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setConfirmReplace(null)}
                  style={{
                    flex: 1, padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                    background: 'transparent', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >Cancel</button>
                <button
                  onClick={() => handleEnroll(confirmReplace.newId, true)}
                  disabled={enrolling}
                  style={{
                    flex: 1, padding: 12, borderRadius: 10, border: 'none',
                    background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    opacity: enrolling ? 0.5 : 1,
                  }}
                >{enrolling ? 'Replacing...' : 'Replace'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Add to Schedule button */}
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 480, width: 'calc(100% - 32px)', padding: '12px 0',
          background: 'linear-gradient(to top, var(--bg-primary) 70%, transparent)',
        }}>
          {isCurrentlyActive ? (
            <div style={{
              width: '100%', padding: 14, borderRadius: 12, border: '1px solid var(--accent)',
              background: 'rgba(255,149,0,0.08)', textAlign: 'center',
              fontSize: 14, fontWeight: 700, color: 'var(--accent)',
            }}>
              Currently Active
            </div>
          ) : (
            <button
              onClick={() => handleEnroll(previewId)}
              disabled={enrolling}
              className="btn-primary"
              style={{ opacity: enrolling ? 0.5 : 1 }}
            >
              {enrolling ? 'Adding...' : 'Add to My Schedule'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ========== ACTIVE SCHEDULE OVERVIEW ==========
  if (mySchedule?.schedule) {
    const s = mySchedule.schedule;
    const week = mySchedule.weeks.find(w => w.week_number === activeWeek) || mySchedule.weeks[0];

    return (
      <div className="page-content" style={{ paddingBottom: 140 }}>
        {/* Header image */}
        <div style={{
          height: 160, borderRadius: 16, overflow: 'hidden', marginBottom: 16,
          background: s.image_url ? `url(${s.image_url}) center/cover` : 'linear-gradient(135deg, #1A2E1E, #243D26)',
        }} />

        {/* Title + cart icon */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, flex: 1 }}>{s.title}</h2>
          <button
            onClick={() => generateShoppingList(s.id)}
            disabled={generating}
            title="Shopping List"
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: 'rgba(255,149,0,0.12)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: generating ? 0.5 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
            </svg>
          </button>
        </div>

        {s.category && (
          <span style={{
            display: 'inline-block', marginBottom: 8, fontSize: 10, fontWeight: 700,
            padding: '2px 8px', borderRadius: 6,
            background: 'rgba(255,149,0,0.12)', color: 'var(--accent)',
          }}>{s.category}</span>
        )}
        {s.description && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
            {s.description}
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          <span>{s.duration_weeks} week{s.duration_weeks !== 1 ? 's' : ''}</span>
          {mySchedule.calorie_target && <span>- {mySchedule.calorie_target} kcal target</span>}
        </div>

        {/* Week picker (only if multi-week) */}
        {mySchedule.weeks.length > 1 && (
          <div className="hide-scrollbar" style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {mySchedule.weeks.map((w) => (
              <button
                key={w.week_number}
                onClick={() => { setActiveWeek(w.week_number); setExpandedDays({}); }}
                style={{
                  padding: '6px 14px', borderRadius: 16, border: 'none', flexShrink: 0,
                  background: w.week_number === activeWeek ? 'var(--accent)' : 'rgba(255,140,0,0.1)',
                  color: w.week_number === activeWeek ? '#fff' : 'var(--accent)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Week {w.week_number}
              </button>
            ))}
          </div>
        )}

        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Week {week?.week_number || 1}
        </h3>

        {/* Days with inline expansion */}
        {week?.days.map((day) => {
          const isExpanded = !!expandedDays[day.day_number];
          return (
            <div key={day.day_number} style={{ marginBottom: 8 }}>
              <div
                onClick={() => toggleDay(day.day_number)}
                className="card"
                style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: isExpanded ? 0 : undefined, borderRadius: isExpanded ? '12px 12px 0 0' : undefined }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--accent)', fontSize: 13, fontWeight: 800,
                }}>
                  {day.day_number}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, color: 'var(--accent-orange)', fontWeight: 700 }}>DAY {day.day_number}</p>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{day.plan?.title}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {day.items?.filter(i => i.alternative_group === 0).length || 0} meals
                  </p>
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginRight: 4 }}>
                  {Math.round(day.day_totals?.calories || 0)} cal
                </p>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5"
                  style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              {/* Expanded meals */}
              {isExpanded && day.items && (
                <div style={{
                  background: 'var(--bg-card)', borderRadius: '0 0 12px 12px',
                  padding: '8px 12px 12px', borderTop: '1px solid var(--divider)',
                }}>
                  <DayMeals items={day.items} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ========== BROWSE AVAILABLE SCHEDULES ==========
  return (
    <div className="page-content" style={{ paddingBottom: 140 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Meal Schedules</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Browse available schedules and add one to start following it
      </p>

      {available.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ color: 'var(--text-secondary)' }}>No meal schedules available yet</p>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Check back soon for new schedules</p>
        </div>
      ) : (
        available.map(s => (
          <div
            key={s.id}
            onClick={() => loadPreview(s.id)}
            className="card"
            style={{ marginBottom: 10, overflow: 'hidden', padding: 0, cursor: 'pointer' }}
          >
            <div style={{
              height: 120,
              background: s.image_url ? `url(${s.image_url}) center/cover` : 'linear-gradient(135deg, #1A2E1E, #243D26)',
            }} />
            <div style={{ padding: 12 }}>
              <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{s.title}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {s.duration_weeks} week{s.duration_weeks !== 1 ? 's' : ''}
                {s.calorie_target_min ? ` - ${s.calorie_target_min}-${s.calorie_target_max} kcal` : ''}
              </p>
              {s.category && (
                <span style={{
                  display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 6,
                  background: 'rgba(255,149,0,0.12)', color: 'var(--accent)',
                }}>{s.category}</span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// Inline day meals grouped by meal_type
function DayMeals({ items }) {
  const mealOrder = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Evening Snack'];
  const slots = {};
  items.forEach((it) => {
    if (!slots[it.meal_type]) slots[it.meal_type] = [];
    slots[it.meal_type].push(it);
  });
  const orderedTypes = mealOrder.filter(m => slots[m]).concat(
    Object.keys(slots).filter(m => !mealOrder.includes(m))
  );

  return orderedTypes.map((mealType) => (
    <MealSlot key={mealType} mealType={mealType} items={slots[mealType]} />
  ));
}

function MealSlot({ mealType, items }) {
  const [showAlts, setShowAlts] = useState(false);
  const primary = items.filter(i => i.alternative_group === 0);
  const alts = items.filter(i => i.alternative_group > 0);

  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ fontSize: 10, color: 'var(--accent-mint)', fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {mealType}
      </p>
      {primary.map((item) => (
        <MealCard key={item.id} item={item} />
      ))}
      {alts.length > 0 && !showAlts && (
        <button
          onClick={() => setShowAlts(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            marginTop: 4, borderRadius: 8, border: '1px solid rgba(61,255,210,0.2)',
            background: 'rgba(61,255,210,0.06)', color: 'var(--accent-mint)',
            fontSize: 10, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
          </svg>
          {alts.length} alternative{alts.length > 1 ? 's' : ''}
        </button>
      )}
      {alts.length > 0 && showAlts && (
        <div style={{ marginLeft: 10, marginTop: 4, borderLeft: '2px solid rgba(61,255,210,0.2)', paddingLeft: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>OR swap with</p>
            <button onClick={() => setShowAlts(false)} style={{
              fontSize: 9, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600,
            }}>Hide</button>
          </div>
          {alts.map((item) => (
            <MealCard key={item.id} item={item} alt />
          ))}
        </div>
      )}
    </div>
  );
}

// Single meal card
function MealCard({ item, alt }) {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0',
      opacity: alt ? 0.85 : 1,
      borderLeft: alt ? '2px solid var(--accent-mint)' : undefined,
      paddingLeft: alt ? 8 : 0,
    }}>
      {item.thumbnail_url ? (
        <img src={item.thumbnail_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>🍽️</span>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{item.recipe_title || item.custom_name || 'Meal'}</p>
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          {Math.round(item.scaled_calories ?? item.calories ?? 0)} cal
          {item.scaled_serving_qty && Math.abs(item.scaled_serving_qty - 1) > 0.05
            ? ` - ${item.scaled_serving_qty.toFixed(1)}x serving`
            : ''}
        </p>
      </div>
    </div>
  );
}
