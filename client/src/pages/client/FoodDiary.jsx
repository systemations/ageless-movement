import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import FoodSearch from './FoodSearch';

export default function FoodDiary() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [addingTo, setAddingTo] = useState(null);

  useEffect(() => { fetchDiary(); }, [date]);

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

  const deleteFood = async (id) => {
    await fetch(`/api/nutrition/diary/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchDiary();
  };

  if (addingTo) {
    return <FoodSearch mealType={addingTo} onSelect={(food) => logFood(food, addingTo)} onBack={() => setAddingTo(null)} />;
  }

  if (!data) return <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}><div className="spinner" /></div>;

  const { meals, totals, targets } = data;
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

  // Meal targets (rough distribution)
  const mealTargets = {
    'Early Morning': Math.round(targets.calories * 0.08),
    'Breakfast': Math.round(targets.calories * 0.25),
    'Mid-morning': Math.round(targets.calories * 0.08),
    'Lunch': Math.round(targets.calories * 0.35),
    'Afternoon': Math.round(targets.calories * 0.04),
    'Dinner': Math.round(targets.calories * 0.24),
    'Evening Snack': Math.round(targets.calories * 0.09),
  };

  return (
    <div className="page-content" style={{ paddingBottom: 140 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => shiftDate(-1)} style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>{formatDate(date)}</h2>
        <button onClick={() => shiftDate(1)} style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      {/* Calorie Summary */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <p style={{ fontSize: 24, fontWeight: 700 }}>
            {Math.round(totals.calories)} <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 400 }}>/ {targets.calories.toLocaleString()} cals</span>
          </p>
          <p style={{ fontSize: 13, color: 'var(--accent)' }}>{calsLeft.toLocaleString()} left</p>
        </div>
        <div style={{ height: 6, background: 'var(--divider)', borderRadius: 3 }}>
          <div style={{ height: '100%', width: `${Math.min(100, (totals.calories / targets.calories) * 100)}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>

        {/* Macros */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          {[
            { label: 'Protein', value: totals.protein, target: targets.protein, color: '#3DFFD2' },
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

      <div style={{ height: 2, background: 'var(--accent)', opacity: 0.3, borderRadius: 1, marginBottom: 16 }} />

      {/* Meal Sections */}
      {Object.entries(meals).map(([mealType, meal]) => {
        if (meal.items.length === 0 && !mealTargets[mealType]) return null;
        const target = mealTargets[mealType] || 0;
        return (
          <div key={mealType} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>{mealType}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {Math.round(meal.calories)} {target > 0 ? `/ ${target} cals` : 'cals'}
              </p>
            </div>

            {meal.items.map((item) => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--logo-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <img src="/logo.png" alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.food_name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.serving_size} · {item.calories} cals</p>
                </div>
                <button onClick={() => deleteFood(item.id)} style={{
                  width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,69,58,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              </div>
            ))}

            <button
              onClick={() => setAddingTo(mealType)}
              style={{
                background: 'none', border: 'none', color: 'var(--accent)',
                fontSize: 13, fontWeight: 600, padding: '8px 0', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              + Add Food
            </button>
          </div>
        );
      })}
    </div>
  );
}
