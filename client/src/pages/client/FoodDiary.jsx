import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import FoodSearch from './FoodSearch';

export default function FoodDiary() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [addingTo, setAddingTo] = useState(null);
  const [swapOpen, setSwapOpen] = useState(null); // key like "Lunch-Beef Mince..."
  const [mealTimes, setMealTimes] = useState({});
  const [editingTime, setEditingTime] = useState(null); // meal type currently editing
  const [customMeals, setCustomMeals] = useState([]); // user-added meal slots like ['Snack 2', 'Post Workout']
  const [addingMeal, setAddingMeal] = useState(false);
  const [newMealName, setNewMealName] = useState('');
  const [mealOrderOverride, setMealOrderOverride] = useState(null); // array of meal types in custom order
  const [editingTarget, setEditingTarget] = useState(false);

  const DEFAULT_MEAL_TIMES = {
    'Early Morning': '05:00',
    'Breakfast': '07:00',
    'Mid Morning': '10:00',
    'Lunch': '12:30',
    'Dinner': '18:00',
    'Snack': '15:00',
    'Evening Snack': '20:30',
  };

  const getDayType = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  const fetchMealTimes = async () => {
    try {
      const dayType = getDayType(date);
      const res = await fetch(`/api/nutrition/meal-times?day_type=${dayType}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setMealTimes(json.times || {});
      }
    } catch (err) { console.error(err); }
  };

  const saveMealTime = async (mealType, time) => {
    const dayType = getDayType(date);
    try {
      await fetch('/api/nutrition/meal-times', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ day_type: dayType, meal_type: mealType, preferred_time: time }),
      });
      setMealTimes(prev => ({ ...prev, [mealType]: time }));
    } catch (err) { console.error(err); }
    setEditingTime(null);
  };

  const formatTime12h = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  useEffect(() => { fetchDiary(); fetchMealTimes(); }, [date]);

  const fetchDiary = async () => {
    try {
      const res = await fetch(`/api/nutrition/diary?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } catch (err) { console.error(err); }
  };

  const logFood = async (food, mealType) => {
    await fetch('/api/nutrition/diary', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, meal_type: mealType, food_name: food.name, calories: food.calories, protein: food.protein, fat: food.fat, carbs: food.carbs, serving_size: food.serving }),
    });
    setAddingTo(null);
    fetchDiary();
  };

  const buildServing = (item) => {
    if (item.serving_qty) {
      return `${Math.round(item.serving_qty * 10) / 10}x ${item.serving_size || ''} ${item.serving_unit || ''}`.trim();
    }
    return item.serving_size || '';
  };

  const logSuggested = async (item, mealType) => {
    await fetch('/api/nutrition/diary', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        meal_type: mealType,
        food_name: item.name,
        calories: item.calories,
        protein: item.protein,
        fat: item.fat,
        carbs: item.carbs,
        serving_size: buildServing(item),
      }),
    });
    fetchDiary();
  };

  // Toggle: if already logged, remove it; if not logged, log it
  const toggleSuggested = async (item, mealType) => {
    const logEntry = findLogEntry(mealType, item.name);
    if (logEntry) {
      await deleteFood(logEntry.id);
    } else {
      await logSuggested(item, mealType);
    }
  };

  const confirmAllForMeal = async (mealType, items) => {
    for (const item of items) {
      if (!findLogEntry(mealType, item.name)) {
        await fetch('/api/nutrition/diary', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            meal_type: mealType,
            food_name: item.name,
            calories: item.calories,
            protein: item.protein,
            fat: item.fat,
            carbs: item.carbs,
            serving_size: buildServing(item),
          }),
        });
      }
    }
    fetchDiary();
  };

  // Swap: remove the primary logged entry and log the alternative instead
  const swapItem = async (primaryName, altItem, mealType) => {
    const logEntry = findLogEntry(mealType, primaryName);
    if (logEntry) {
      await fetch(`/api/nutrition/diary/${logEntry.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    await logSuggested(altItem, mealType);
    setSwapOpen(null);
  };

  const deleteFood = async (id) => {
    await fetch(`/api/nutrition/diary/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchDiary();
  };

  // Find the nutrition_logs entry matching this food name for the meal type
  const findLogEntry = (mealType, foodName) => {
    if (!data?.meals?.[mealType]) return null;
    return data.meals[mealType].items.find(
      i => i.food_name.toLowerCase() === foodName.toLowerCase()
    ) || null;
  };

  const isLogged = (mealType, foodName) => !!findLogEntry(mealType, foodName);

  // Check if any alternative for this item is logged instead of the primary
  const findLoggedAlternative = (mealType, item) => {
    if (!item.alternatives || !data?.meals?.[mealType]) return null;
    for (const alt of item.alternatives) {
      const entry = data.meals[mealType].items.find(
        i => i.food_name.toLowerCase() === alt.name.toLowerCase()
      );
      if (entry) return { alt, entry };
    }
    return null;
  };

  if (addingTo) {
    return <FoodSearch mealType={addingTo} onSelect={(food) => logFood(food, addingTo)} onBack={() => setAddingTo(null)} />;
  }

  if (!data) return <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}><div className="spinner" /></div>;

  const { meals, totals, targets, suggested } = data;
  const calsLeft = Math.max(0, targets.calories - Math.round(totals.calories));

  const formatDate = (d) => {
    const dt = new Date(d + 'T12:00:00');
    const today = new Date();
    if (dt.toDateString() === today.toDateString()) return `Today, ${dt.toLocaleDateString('en-IE', { day: '2-digit', month: 'short' })}`;
    return dt.toLocaleDateString('en-IE', { weekday: 'short', day: '2-digit', month: 'short' });
  };

  const shiftDate = (days) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  };

  // Build combined meal order
  // Default slots always shown so blank users have somewhere to log
  const mealOrder = ['Early Morning', 'Breakfast', 'Mid Morning', 'Lunch', 'Dinner', 'Snack', 'Evening Snack'];
  const hasSuggestedMeals = suggested && Object.keys(suggested).length > 0;
  const defaultSlots = hasSuggestedMeals
    ? mealOrder.filter(mt => meals[mt]?.items?.length > 0 || (suggested && suggested[mt]?.length > 0))
    : ['Breakfast', 'Lunch', 'Dinner', 'Snack']; // blank users get 4 default slots
  const allMealTypes = new Set(defaultSlots);
  // Add any types that have logged items
  Object.keys(meals).forEach(mt => { if (meals[mt]?.items?.length > 0) allMealTypes.add(mt); });
  // Add suggested meal types
  if (suggested) Object.keys(suggested).forEach(mt => { if (suggested[mt]?.length > 0) allMealTypes.add(mt); });
  customMeals.forEach(mt => allMealTypes.add(mt));
  let orderedMealTypes;
  if (mealOrderOverride) {
    // Use custom order, add any new types not in the override at the end
    orderedMealTypes = mealOrderOverride.filter(mt => allMealTypes.has(mt));
    [...allMealTypes].filter(mt => !mealOrderOverride.includes(mt)).forEach(mt => orderedMealTypes.push(mt));
  } else {
    orderedMealTypes = mealOrder.filter(mt => allMealTypes.has(mt));
    [...allMealTypes].filter(mt => !mealOrder.includes(mt)).forEach(mt => orderedMealTypes.push(mt));
  }

  const moveMeal = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= orderedMealTypes.length) return;
    const newOrder = [...orderedMealTypes];
    const movingMeal = newOrder[index];
    const swappingMeal = newOrder[newIndex];
    // Swap positions
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    setMealOrderOverride(newOrder);
    // Swap times - the time stays with the slot position
    const movingTime = mealTimes[movingMeal] || DEFAULT_MEAL_TIMES[movingMeal] || '12:00';
    const swappingTime = mealTimes[swappingMeal] || DEFAULT_MEAL_TIMES[swappingMeal] || '12:00';
    setMealTimes(prev => ({
      ...prev,
      [movingMeal]: swappingTime,
      [swappingMeal]: movingTime,
    }));
    // Save both times to backend
    const dayType = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    fetch('/api/nutrition/meal-times', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_type: dayType, meal_type: movingMeal, preferred_time: swappingTime }),
    }).catch(() => {});
    fetch('/api/nutrition/meal-times', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_type: dayType, meal_type: swappingMeal, preferred_time: movingTime }),
    }).catch(() => {});
  };

  const addCustomMeal = () => {
    const name = newMealName.trim();
    if (!name) return;
    setCustomMeals(prev => [...prev, name]);
    setNewMealName('');
    setAddingMeal(false);
    // If we have a custom order, append to it
    if (mealOrderOverride) {
      setMealOrderOverride(prev => [...prev, name]);
    }
  };

  return (
    <div className="page-content" style={{ paddingBottom: 140 }}>
      {/* Date picker pill - centered, no back-arrow confusion */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'var(--bg-card)', borderRadius: 20, padding: 4,
        }}>
          <button onClick={() => shiftDate(-1)} aria-label="Previous day" style={{
            width: 32, height: 32, borderRadius: '50%', background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h2 style={{
            fontSize: 14, fontWeight: 700, padding: '0 12px',
            minWidth: 120, textAlign: 'center',
          }}>{formatDate(date)}</h2>
          <button onClick={() => shiftDate(1)} aria-label="Next day" style={{
            width: 32, height: 32, borderRadius: '50%', background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>

      {/* Calorie Summary */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <p style={{ fontSize: 24, fontWeight: 700 }}>
            {Math.round(totals.calories)} <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 400 }}>/ </span>
            {editingTarget ? (
              <input
                type="number"
                autoFocus
                defaultValue={targets.calories}
                onBlur={async (e) => {
                  const val = parseInt(e.target.value) || targets.calories;
                  setEditingTarget(false);
                  try {
                    await fetch('/api/nutrition/targets', {
                      method: 'PUT',
                      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ calorie_target: val }),
                    });
                    fetchDiary();
                  } catch (err) { console.error(err); }
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                style={{
                  width: 70, fontSize: 14, fontWeight: 600, padding: '2px 6px',
                  borderRadius: 6, border: '1px solid var(--accent)',
                  background: 'var(--bg-card)', color: 'var(--text-primary)',
                  textAlign: 'center', outline: 'none',
                }}
              />
            ) : (
              <span
                onClick={() => setEditingTarget(true)}
                style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 400, cursor: 'pointer', borderBottom: '1px dashed var(--text-tertiary)' }}
              >
                {targets.calories.toLocaleString()} cals
              </span>
            )}
          </p>
          <p style={{ fontSize: 13, color: 'var(--accent)' }}>{calsLeft.toLocaleString()} left</p>
        </div>
        <div style={{ height: 6, background: 'var(--divider)', borderRadius: 3 }}>
          <div style={{ height: '100%', width: `${Math.min(100, (totals.calories / targets.calories) * 100)}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          {[
            { label: 'Protein', value: totals.protein, target: targets.protein, color: '#85FFBA' },
            { label: 'Fat', value: totals.fat, target: targets.fat, color: '#FF9500' },
            { label: 'Carbs', value: totals.carbs, target: targets.carbs, color: '#64D2FF' },
          ].map(({ label, value, target, color }) => {
            const pct = target > 0 ? Math.round((value / target) * 100) : 0;
            return (
              <div key={label} style={{ textAlign: 'center', flex: 1 }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>{label} · {pct}%</p>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{Math.round(value)} <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>/ {target} g</span></p>
                <div style={{ height: 3, background: 'var(--divider)', borderRadius: 2, marginTop: 4 }}>
                  <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Meal Sections */}
      {orderedMealTypes.map((mealType, mealIndex) => {
        const meal = meals[mealType] || { items: [], calories: 0 };
        const suggestedItems = (suggested && suggested[mealType]) || [];
        const unloggedCount = suggestedItems.filter(s => !isLogged(mealType, s.name) && !findLoggedAlternative(mealType, s)).length;
        const allConfirmed = unloggedCount === 0 && suggestedItems.length > 0;
        const mealLabel = `Meal ${mealIndex + 1}`;
        const isCustom = customMeals.includes(mealType);

        return (
          <div key={mealType} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700 }}>{mealLabel}</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>·</span>
                  {editingTime === mealType ? (
                    <input
                      type="time"
                      defaultValue={mealTimes[mealType] || DEFAULT_MEAL_TIMES[mealType] || '12:00'}
                      autoFocus
                      onBlur={(e) => saveMealTime(mealType, e.target.value)}
                      onChange={(e) => { if (e.target.value) saveMealTime(mealType, e.target.value); }}
                      style={{
                        background: 'var(--bg-card)', border: '1px solid var(--accent)', borderRadius: 6,
                        color: 'var(--text-primary)', fontSize: 12, padding: '2px 6px', width: 100,
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => setEditingTime(mealType)}
                      style={{
                        fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer',
                        padding: '2px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)',
                      }}
                    >
                      {formatTime12h(mealTimes[mealType] || DEFAULT_MEAL_TIMES[mealType] || '12:00')}
                    </span>
                  )}
                  {/* Move up/down */}
                  <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                    <button
                      onClick={() => moveMeal(mealIndex, -1)}
                      disabled={mealIndex === 0}
                      style={{
                        width: 24, height: 24, borderRadius: 6, border: 'none',
                        background: mealIndex === 0 ? 'transparent' : 'rgba(255,255,255,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: mealIndex === 0 ? 'default' : 'pointer',
                        opacity: mealIndex === 0 ? 0.2 : 0.6,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                    </button>
                    <button
                      onClick={() => moveMeal(mealIndex, 1)}
                      disabled={mealIndex === orderedMealTypes.length - 1}
                      style={{
                        width: 24, height: 24, borderRadius: 6, border: 'none',
                        background: mealIndex === orderedMealTypes.length - 1 ? 'transparent' : 'rgba(255,255,255,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: mealIndex === orderedMealTypes.length - 1 ? 'default' : 'pointer',
                        opacity: mealIndex === orderedMealTypes.length - 1 ? 0.2 : 0.6,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{mealType}</p>
                  {isCustom && (
                    <button
                      onClick={() => {
                        setCustomMeals(prev => prev.filter(m => m !== mealType));
                        if (mealOrderOverride) setMealOrderOverride(prev => prev.filter(m => m !== mealType));
                      }}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        fontSize: 10, color: 'var(--error)', fontWeight: 600,
                      }}
                    >Remove</button>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2, flexShrink: 0 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {Math.round(meal.calories)} cals
                </p>
                {allConfirmed && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(85,255,186,0.15)', color: 'var(--accent-mint)' }}>Logged</span>
                )}
              </div>
            </div>

            {/* Suggested items from meal plan */}
            {suggestedItems.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {unloggedCount > 1 && (
                  <button
                    onClick={() => confirmAllForMeal(mealType, suggestedItems.filter(s => !isLogged(mealType, s.name) && !findLoggedAlternative(mealType, s)))}
                    style={{
                      width: '100%', padding: '8px 0', borderRadius: 10, border: '1px dashed var(--accent-mint)',
                      background: 'rgba(61,255,210,0.05)', color: 'var(--accent-mint)',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 8,
                    }}
                  >
                    Confirm all {unloggedCount} items
                  </button>
                )}
                {suggestedItems.map((item, idx) => {
                  const logged = isLogged(mealType, item.name);
                  const loggedAlt = findLoggedAlternative(mealType, item);
                  const isConfirmed = logged || !!loggedAlt;
                  const displayName = loggedAlt ? loggedAlt.alt.name : item.name;
                  const displayItem = loggedAlt ? loggedAlt.alt : item;
                  const hasAlts = item.alternatives && item.alternatives.length > 0;
                  const itemKey = `${mealType}-${idx}`;

                  return (
                    <div key={`suggested-${idx}`}>
                      <div
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}
                      >
                        {/* Checkbox -- tap to toggle */}
                        <div
                          onClick={() => toggleSuggested(isConfirmed ? displayItem : item, mealType)}
                          style={{
                            width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                            border: isConfirmed ? 'none' : '2px solid var(--accent-mint)',
                            background: isConfirmed ? 'var(--accent-mint)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s', cursor: 'pointer',
                          }}
                        >
                          {isConfirmed && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          )}
                        </div>
                        {/* Thumbnail */}
                        <div style={{
                          width: 36, height: 36, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
                          background: 'var(--divider)',
                        }}>
                          {displayItem.thumbnail_url ? (
                            <img src={displayItem.thumbnail_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🍽</div>
                          )}
                        </div>
                        {/* Info */}
                        <div onClick={() => toggleSuggested(isConfirmed ? displayItem : item, mealType)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                          <p style={{
                            fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            textDecoration: isConfirmed ? 'line-through' : 'none',
                            color: isConfirmed ? 'var(--text-tertiary)' : 'var(--text-primary)',
                          }}>
                            {displayName}
                            {loggedAlt && <span style={{ fontSize: 10, color: 'var(--accent-orange)', marginLeft: 4 }}>(swapped)</span>}
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {displayItem.calories} cal · {displayItem.protein}p · {displayItem.fat}f · {displayItem.carbs}c
                          </p>
                        </div>
                        {/* Swap button */}
                        {hasAlts && (
                          <button
                            onClick={() => setSwapOpen(swapOpen === itemKey ? null : itemKey)}
                            style={{
                              padding: '4px 8px', borderRadius: 8, border: 'none',
                              background: swapOpen === itemKey ? 'var(--accent-orange)' : 'rgba(255,149,0,0.12)',
                              color: swapOpen === itemKey ? '#000' : 'var(--accent-orange)',
                              fontSize: 10, fontWeight: 700, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 3,
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                            </svg>
                            Swap
                          </button>
                        )}
                      </div>

                      {/* Swap panel */}
                      {hasAlts && swapOpen === itemKey && (
                        <div style={{
                          background: 'rgba(255,149,0,0.06)', borderRadius: 12, padding: '8px 12px',
                          marginBottom: 4, border: '1px solid rgba(255,149,0,0.15)',
                        }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-orange)', marginBottom: 6 }}>
                            Swap with:
                          </p>
                          {item.alternatives.map((alt, altIdx) => {
                            const altLogged = isLogged(mealType, alt.name);
                            return (
                              <div
                                key={altIdx}
                                onClick={() => {
                                  if (!altLogged) swapItem(isConfirmed ? displayName : item.name, alt, mealType);
                                }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                                  borderBottom: altIdx < item.alternatives.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                  cursor: altLogged ? 'default' : 'pointer',
                                  opacity: altLogged ? 0.5 : 1,
                                }}
                              >
                                <div style={{
                                  width: 32, height: 32, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
                                  background: 'var(--divider)',
                                }}>
                                  {alt.thumbnail_url ? (
                                    <img src={alt.thumbnail_url} alt="" style={{ width: 32, height: 32, objectFit: 'cover' }} />
                                  ) : (
                                    <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>🍽</div>
                                  )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alt.name}</p>
                                  <p style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                                    {alt.calories} cal · {alt.protein}p · {alt.fat}f · {alt.carbs}c
                                  </p>
                                </div>
                                {!altLogged && (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-orange)' }}>Select</span>
                                )}
                                {altLogged && (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-mint)' }}>Active</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Manually added items (not matching any suggestion) */}
            {meal.items.map((item) => {
              const matchesSuggestion = suggestedItems.some(s =>
                s.name.toLowerCase() === item.food_name.toLowerCase() ||
                (s.alternatives || []).some(a => a.name.toLowerCase() === item.food_name.toLowerCase())
              );
              if (matchesSuggestion) return null;
              return (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                    background: 'var(--accent-mint)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.food_name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.serving_size} · {item.calories} cals</p>
                  </div>
                  <button onClick={() => deleteFood(item.id)} style={{
                    width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,69,58,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                </div>
              );
            })}

            <button
              onClick={() => setAddingTo(mealType)}
              style={{
                background: 'none', border: 'none', color: 'var(--accent)',
                fontSize: 13, fontWeight: 600, padding: '8px 0', display: 'flex', alignItems: 'center', gap: 4,
                cursor: 'pointer',
              }}
            >
              + Add Food
            </button>
          </div>
        );
      })}

      {/* Add Meal */}
      {addingMeal ? (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          padding: '12px 0', borderTop: '1px solid var(--divider)', marginTop: 8,
        }}>
          <input
            autoFocus
            value={newMealName}
            onChange={e => setNewMealName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustomMeal()}
            placeholder="Meal name (e.g. Post Workout)"
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--divider)', background: 'var(--bg-card)',
              color: 'var(--text-primary)', fontSize: 14, outline: 'none',
            }}
          />
          <button
            onClick={addCustomMeal}
            style={{
              padding: '10px 16px', borderRadius: 10, border: 'none',
              background: 'var(--accent)', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >Add</button>
          <button
            onClick={() => { setAddingMeal(false); setNewMealName(''); }}
            style={{
              padding: '10px 12px', borderRadius: 10, border: 'none',
              background: 'var(--divider)', color: 'var(--text-secondary)',
              fontSize: 13, cursor: 'pointer',
            }}
          >Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setAddingMeal(true)}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 12,
            border: '1px dashed var(--divider)', background: 'transparent',
            color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', marginTop: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Meal
        </button>
      )}
    </div>
  );
}
