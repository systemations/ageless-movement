import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { BookmarkIcon, SearchIcon } from '../../components/Icons';
import FavButton from '../../components/FavButton';

export default function RecipeBrowser({ onBack }) {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [bookmarked, setBookmarked] = useState(new Set([1, 4]));

  useEffect(() => {
    fetch('/api/nutrition/recipes', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  const toggleBookmark = (id) => {
    setBookmarked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Recipe detail
  if (selectedRecipe) {
    const r = selectedRecipe;
    return (
      <div className="page-content" style={{ paddingBottom: 120 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={() => setSelectedRecipe(null)} style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1, textAlign: 'center' }}>{r.name}</h2>
          <FavButton itemType="recipe" itemId={r.id} itemTitle={r.name} itemMeta={`${r.calories} cals`} />
        </div>

        {/* Hero placeholder */}
        <div style={{
          height: 200, borderRadius: 16, background: 'linear-gradient(135deg, #2C2C2E, #1C1C1E)',
          marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 64, opacity: 0.3 }}>🍳</span>
        </div>

        {/* Add to Diary */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <span style={{ fontSize: 14 }}>Qty:</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>1</span>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>serving</span>
            </div>
          </div>
          <button className="btn-primary" style={{ fontSize: 14 }}>Add to Diary</button>
        </div>

        {/* Nutrition */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{r.calories} cals</span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r.servings} serving{r.servings > 1 ? 's' : ''}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            {[
              { label: 'Protein', value: r.protein, pct: Math.round((r.protein * 4 / r.calories) * 100), color: '#3DFFD2' },
              { label: 'Fat', value: r.fat, pct: Math.round((r.fat * 9 / r.calories) * 100), color: '#FF9500' },
              { label: 'Carbs', value: r.carbs, pct: Math.round((r.carbs * 4 / r.calories) * 100), color: '#64D2FF' },
            ].map(({ label, value, pct, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ position: 'relative', width: 56, height: 56, margin: '0 auto 6px' }}>
                  <svg width="56" height="56" viewBox="0 0 56 56">
                    <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                    <circle cx="28" cy="28" r="22" fill="none" stroke={color} strokeWidth="4"
                      strokeDasharray={`${2 * Math.PI * 22}`}
                      strokeDashoffset={`${2 * Math.PI * 22 * (1 - pct / 100)}`}
                      strokeLinecap="round" transform="rotate(-90 28 28)" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{value}g</span>
                    <span style={{ fontSize: 8, color: 'var(--text-tertiary)' }}>({pct}%)</span>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Ingredients */}
        {r.ingredients && r.ingredients.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
              Ingredients <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>for {r.servings} serving{r.servings > 1 ? 's' : ''}</span>
            </h3>
            {r.ingredients.map((ing, i) => (
              <p key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0', paddingLeft: 12, borderLeft: '2px solid var(--accent-mint)' }}>
                {ing}
              </p>
            ))}
          </div>
        )}

        {/* Instructions */}
        {r.instructions && r.instructions.length > 0 && (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>How to Prepare</h3>
            {r.instructions.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: '#000',
                }}>
                  {i + 1}
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, flex: 1 }}>{step}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!data) return <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}><div className="spinner" /></div>;

  // Browse view
  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 700, flex: 1, textAlign: 'center' }}>Recipes</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={{ background: 'none', border: 'none', color: 'var(--accent)' }}><BookmarkIcon /></button>
          <button style={{ background: 'none', border: 'none', color: 'var(--accent)' }}><SearchIcon /></button>
        </div>
      </div>

      {/* Category carousels */}
      {data.categories.map((cat) => (
        <div key={cat.title} style={{ marginBottom: 24 }}>
          <div className="section-header">
            <h2 style={{ fontSize: 16 }}>{cat.title} &gt;</h2>
          </div>
          <div className="hide-scrollbar" style={{
            display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -16px', padding: '0 16px',
          }}>
            {cat.recipes.map((recipe) => (
              <div
                key={recipe.id}
                onClick={() => setSelectedRecipe(recipe)}
                style={{ minWidth: 160, cursor: 'pointer' }}
              >
                <div style={{
                  width: 160, height: 160, borderRadius: 12, background: 'var(--bg-card)',
                  marginBottom: 8, position: 'relative', overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 40, opacity: 0.3 }}>🍽️</span>
                  <div style={{ position: 'absolute', top: 4, right: 4 }}>
                    <FavButton
                      itemType="recipe"
                      itemId={recipe.id}
                      itemTitle={recipe.name}
                      itemMeta={`${recipe.calories} cals`}
                    />
                  </div>
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{recipe.name}</p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{recipe.calories} cals</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
