import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { BookmarkIcon, SearchIcon } from '../../components/Icons';
import FavButton from '../../components/FavButton';

export default function RecipeBrowser({ onBack }) {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [addQty, setAddQty] = useState(1);
  const [addMeal, setAddMeal] = useState('Breakfast');

  useEffect(() => {
    const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
    fetch(`/api/nutrition/recipes${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setData)
      .catch(console.error);
  }, [searchQuery]);

  const mealOptions = ['Early Morning', 'Breakfast', 'Mid-morning', 'Lunch', 'Afternoon', 'Dinner', 'Evening Snack'];

  const addToDiary = async () => {
    if (!selectedRecipe) return;
    const r = selectedRecipe;
    await fetch('/api/nutrition/diary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        date: new Date().toISOString().split('T')[0],
        meal_type: addMeal,
        food_name: r.name,
        calories: Math.round(r.calories * addQty),
        protein: Math.round(r.protein * addQty),
        fat: Math.round(r.fat * addQty),
        carbs: Math.round(r.carbs * addQty),
        serving_size: `${addQty} serving`,
      }),
    });
    alert('Added to diary!');
  };

  // ─── Recipe Detail View ─────────────────────────────
  if (selectedRecipe) {
    const r = selectedRecipe;
    const totalMacroCals = (r.protein * 4) + (r.fat * 9) + (r.carbs * 4);
    const proteinPct = totalMacroCals > 0 ? Math.round((r.protein * 4 / totalMacroCals) * 100) : 0;
    const fatPct = totalMacroCals > 0 ? Math.round((r.fat * 9 / totalMacroCals) * 100) : 0;
    const carbsPct = totalMacroCals > 0 ? Math.round((r.carbs * 4 / totalMacroCals) * 100) : 0;

    return (
      <div style={{ paddingBottom: 120 }}>
        {/* Hero Image */}
        <div style={{ position: 'relative', width: '100%', height: 280, background: 'var(--bg-card)' }}>
          {r.thumbnail ? (
            <img src={r.thumbnail} alt={r.name} style={{
              width: '100%', height: '100%', objectFit: 'cover',
            }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 64, opacity: 0.3 }}>🍳</span>
            </div>
          )}
          {/* Back button overlay */}
          <button onClick={() => setSelectedRecipe(null)} style={{
            position: 'absolute', top: 16, left: 16,
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          {/* Bookmark overlay */}
          <div style={{ position: 'absolute', top: 16, right: 16 }}>
            <FavButton itemType="recipe" itemId={r.id} itemTitle={r.name} itemMeta={`${r.calories} cals`} />
          </div>
        </div>

        <div className="page-content">
          {/* Title */}
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, lineHeight: 1.2 }}>{r.name}</h1>
          {r.description && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{r.description}</p>
          )}

          {/* Add to Diary card */}
          <div className="card" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Add to Diary</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8,
                overflow: 'hidden',
              }}>
                <button onClick={() => setAddQty(Math.max(1, addQty - 1))} style={{
                  width: 36, height: 36, background: 'none', border: 'none', color: 'var(--text-primary)',
                  fontSize: 18, fontWeight: 700, cursor: 'pointer',
                }}>-</button>
                <span style={{ width: 28, textAlign: 'center', fontSize: 16, fontWeight: 700 }}>{addQty}</span>
                <button onClick={() => setAddQty(addQty + 1)} style={{
                  width: 36, height: 36, background: 'none', border: 'none', color: 'var(--text-primary)',
                  fontSize: 18, fontWeight: 700, cursor: 'pointer',
                }}>+</button>
              </div>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>serving</span>
            </div>
            <select
              value={addMeal}
              onChange={(e) => setAddMeal(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, marginBottom: 12,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', fontSize: 14, appearance: 'none',
              }}
            >
              {mealOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button onClick={addToDiary} className="btn-primary" style={{ fontSize: 14, width: '100%' }}>Add</button>
          </div>

          {/* Nutrition section */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Nutrition</h3>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{r.calories} cals</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>1 serving</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              {[
                { label: 'Protein', value: r.protein, pct: proteinPct, color: '#3DFFD2' },
                { label: 'Fat', value: r.fat, pct: fatPct, color: '#FF9500' },
                { label: 'Carbs', value: r.carbs, pct: carbsPct, color: '#64D2FF' },
              ].map(({ label, value, pct, color }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 8px' }}>
                    <svg width="72" height="72" viewBox="0 0 72 72">
                      <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                      <circle cx="36" cy="36" r="28" fill="none" stroke={color} strokeWidth="5"
                        strokeDasharray={`${2 * Math.PI * 28}`}
                        strokeDashoffset={`${2 * Math.PI * 28 * (1 - pct / 100)}`}
                        strokeLinecap="round" transform="rotate(-90 36 36)" />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 800 }}>{value} g</span>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{pct}%</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Ingredients */}
          {r.ingredients && r.ingredients.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Ingredients</h3>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>for 1 serving</span>
              </div>
              {r.ingredients.map((ing, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'baseline', gap: 10, padding: '6px 0',
                  borderBottom: i < r.ingredients.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%', background: '#3DFFD2',
                    flexShrink: 0, marginTop: 6,
                  }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {ing.qty}{ing.unit ? ` ${ing.unit}` : ''} - {ing.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Instructions */}
          {r.instructions && r.instructions.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>How to Prepare</h3>
              {r.instructions.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: '#fff',
                  }}>
                    {i + 1}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1, paddingTop: 4 }}>{step}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Category Detail View ───────────────────────────
  if (selectedCategory) {
    const cat = data?.categories?.find(c => c.title === selectedCategory);
    if (!cat) return null;

    return (
      <div className="page-content" style={{ paddingBottom: 100 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={() => setSelectedCategory(null)} style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h2 style={{ fontSize: 18, fontWeight: 700, flex: 1, textAlign: 'center' }}>{cat.title}</h2>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{cat.recipes.length}</span>
        </div>

        {/* Grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
        }}>
          {cat.recipes.map((recipe) => (
            <div key={recipe.id} onClick={() => setSelectedRecipe(recipe)} style={{ cursor: 'pointer' }}>
              <div style={{
                width: '100%', aspectRatio: '1', borderRadius: 12, background: 'var(--bg-card)',
                marginBottom: 6, position: 'relative', overflow: 'hidden',
              }}>
                {recipe.thumbnail ? (
                  <img src={recipe.thumbnail} alt={recipe.name} loading="lazy" style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                  }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 32, opacity: 0.3 }}>🍽️</span>
                  </div>
                )}
                <div style={{ position: 'absolute', top: 4, right: 4 }}>
                  <FavButton itemType="recipe" itemId={recipe.id} itemTitle={recipe.name} itemMeta={`${recipe.calories} cals`} />
                </div>
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, lineHeight: 1.3 }}>{recipe.name}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{recipe.calories} cals</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}><div className="spinner" /></div>;

  // ─── Browse View (Categories) ──────────────────────
  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        {onBack && (
          <button onClick={onBack} style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
        <h2 style={{ fontSize: 18, fontWeight: 700, flex: 1, textAlign: onBack ? 'center' : 'left' }}>Recipes</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => setShowSearch(!showSearch)} style={{ background: 'none', border: 'none', color: 'var(--accent)' }}><SearchIcon /></button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Search recipes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', outline: 'none',
            }}
          />
        </div>
      )}

      {/* Category carousels */}
      {data.categories.map((cat) => (
        <div key={cat.title} style={{ marginBottom: 24 }}>
          <div className="section-header" onClick={() => setSelectedCategory(cat.title)} style={{ cursor: 'pointer' }}>
            <h2 style={{ fontSize: 16 }}>{cat.title} &gt;</h2>
          </div>
          <div className="hide-scrollbar" style={{
            display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -16px', padding: '0 16px',
          }}>
            {cat.recipes.slice(0, 10).map((recipe) => (
              <div
                key={recipe.id}
                onClick={() => setSelectedRecipe(recipe)}
                style={{ minWidth: 160, cursor: 'pointer' }}
              >
                <div style={{
                  width: 160, height: 160, borderRadius: 12, background: 'var(--bg-card)',
                  marginBottom: 8, position: 'relative', overflow: 'hidden',
                }}>
                  {recipe.thumbnail ? (
                    <img src={recipe.thumbnail} alt={recipe.name} loading="lazy" style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                    }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 40, opacity: 0.3 }}>🍽️</span>
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: 4, right: 4 }}>
                    <FavButton itemType="recipe" itemId={recipe.id} itemTitle={recipe.name} itemMeta={`${recipe.calories} cals`} />
                  </div>
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, lineHeight: 1.3 }}>{recipe.name}</p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{recipe.calories} cals</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
