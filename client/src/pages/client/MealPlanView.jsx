import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function MealPlanView() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    fetch('/api/nutrition/meal-plans', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data) return <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}><div className="spinner" /></div>;

  const plan = data.plans[0];
  if (!plan) return <div className="page-content"><p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: 40 }}>No meal plans assigned</p></div>;

  // Day detail view
  if (selectedDay) {
    const day = plan.days.find(d => d.day === selectedDay);
    if (!day || !day.meals) return null;

    // Rough macro split
    const protein = Math.round(day.calories * 0.28 / 4);
    const fat = Math.round(day.calories * 0.52 / 9);
    const carbs = Math.round(day.calories * 0.20 / 4);

    return (
      <div className="page-content" style={{ paddingBottom: 140 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setSelectedDay(null)} style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{plan.title} - {day.label}</h2>
        </div>

        {/* Nutrition summary */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total</p>
          <p style={{ fontSize: 22, fontWeight: 700 }}>{day.calories} cals</p>
        </div>

        {/* Macro gauges */}
        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 24 }}>
          {[
            { label: 'Protein', value: protein, unit: 'g', pct: 28, color: '#3DFFD2' },
            { label: 'Fat', value: fat, unit: 'g', pct: 52, color: '#FF9500' },
            { label: 'Carbs', value: carbs, unit: 'g', pct: 20, color: '#64D2FF' },
          ].map(({ label, value, unit, pct, color }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 8px' }}>
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                  <circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="5"
                    strokeDasharray={`${2 * Math.PI * 26}`}
                    strokeDashoffset={`${2 * Math.PI * 26 * (1 - pct / 100)}`}
                    strokeLinecap="round" transform="rotate(-90 32 32)" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{value}{unit}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>({pct}%)</span>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Meals */}
        {day.meals.map((meal, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>{meal.meal}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{meal.calories} cals</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 16 }}>🍽️</span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600 }}>{meal.name}</p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{meal.serving} · {meal.calories} cals</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Plan overview
  return (
    <div className="page-content" style={{ paddingBottom: 140 }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1A2E1E, #243D26)', borderRadius: 16,
        padding: '24px 20px', marginBottom: 20, position: 'relative', overflow: 'hidden',
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{plan.title}</h2>
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>📅 {plan.duration}</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>🍽️ {plan.calRange}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{plan.description}</p>
      </div>

      {/* Week */}
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--divider)' }}>Week 1</h3>

      {plan.days.map((day) => (
        <div
          key={day.day}
          onClick={() => day.meals && setSelectedDay(day.day)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
            borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: day.meals ? 'pointer' : 'default',
            opacity: day.meals ? 1 : 0.6,
          }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: 'var(--logo-bg)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src="/logo.png" alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 11, color: 'var(--accent-orange)', fontWeight: 700 }}>DAY {day.day}</p>
            <p style={{ fontSize: 13, fontWeight: 600 }}>{plan.title} - {day.label}</p>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{day.calories} cals</p>
        </div>
      ))}
    </div>
  );
}
