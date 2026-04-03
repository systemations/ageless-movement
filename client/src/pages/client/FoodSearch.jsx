import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function FoodSearch({ mealType, onSelect, onBack }) {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('Recents');

  useEffect(() => {
    searchFoods('');
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchFoods(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const searchFoods = async (q) => {
    try {
      const res = await fetch(`/api/nutrition/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFoods(data.foods);
      }
    } catch (err) { console.error(err); }
  };

  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-mint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1, textAlign: 'center' }}>{mealType}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Barcode Scanner */}
          <button style={{
            width: 32, height: 32, borderRadius: '50%', background: 'rgba(61,255,210,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="16"/><line x1="9" y1="8" x2="9" y2="16"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="15" y1="8" x2="15" y2="16"/><line x1="18" y1="8" x2="18" y2="16"/>
            </svg>
          </button>
          {/* AI Camera */}
          <button style={{
            width: 32, height: 32, borderRadius: '50%', background: 'rgba(61,255,210,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
          {/* Manual Add */}
          <button style={{
            width: 32, height: 32, borderRadius: '50%', background: 'rgba(61,255,210,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search here ..."
          className="input-field"
          style={{ paddingLeft: 42, fontSize: 15 }}
        />
      </div>

      {/* Food list */}
      {foods.map((food, i) => (
        <div
          key={i}
          onClick={() => onSelect(food)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
            borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer',
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 16, opacity: 0.5 }}>🍽️</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{food.name}</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {food.serving} · <span style={{ color: 'var(--accent-mint)' }}>{food.calories} kcals</span>
            </p>
          </div>
          <button style={{
            width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-mint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      ))}

      {/* Sub-tabs */}
      <div style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 0, background: 'var(--bg-card)', borderRadius: 50,
        padding: 4, maxWidth: 240, width: 'calc(100% - 32px)',
      }}>
        {['Recents', 'My Food'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '10px 0', borderRadius: 50, fontSize: 13, fontWeight: 600,
            background: tab === t ? 'rgba(61,255,210,0.15)' : 'transparent',
            color: tab === t ? 'var(--accent-mint)' : 'var(--text-secondary)',
            border: 'none',
          }}>{t}</button>
        ))}
      </div>

      {/* Add to meal button */}
      <div style={{
        position: 'fixed', bottom: 130, left: '50%', transform: 'translateX(-50%)',
        maxWidth: 480, width: 'calc(100% - 32px)',
      }}>
        <button className="btn-primary" style={{ fontSize: 15 }}>Add to {mealType}</button>
      </div>
    </div>
  );
}
