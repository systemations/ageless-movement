import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../components/ImageUpload';

const categoryOptions = ['Breakfast', 'Smoothies', 'Mains', 'Salads', 'Soups', 'Snacks'];
const filterCategories = ['All', ...categoryOptions];

const emptyRecipe = {
  name: '', description: '', category: 'Mains', thumbnail: '',
  calories: 0, protein: 0, fat: 0, carbs: 0,
  ingredients: [], instructions: [],
};

export default function RecipeManager() {
  const { token } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('All');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyRecipe);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchRecipes(); }, []);

  const fetchRecipes = () => {
    setLoading(true);
    fetch('/api/nutrition/recipes', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const all = data.categories?.flatMap(c => c.recipes.map(r => ({ ...r, category: c.title }))) || [];
        setRecipes(all);
        setLoading(false);
      })
      .catch(err => { console.error(err); setLoading(false); });
  };

  const filtered = recipes.filter(r => {
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'All' || r.category === filterCat;
    return matchSearch && matchCat;
  });

  const startEdit = (recipe) => {
    setForm({
      id: recipe.id,
      name: recipe.name || '',
      description: recipe.description || '',
      category: recipe.category || 'Mains',
      thumbnail: recipe.thumbnail || '',
      calories: recipe.calories || 0,
      protein: recipe.protein || 0,
      fat: recipe.fat || 0,
      carbs: recipe.carbs || 0,
      ingredients: recipe.ingredients || [],
      instructions: recipe.instructions || [],
    });
    setEditing(true);
  };

  const startAdd = () => {
    setForm({ ...emptyRecipe });
    setSelected(null);
    setEditing(true);
  };

  const saveRecipe = async () => {
    setSaving(true);
    const url = form.id ? `/api/nutrition/recipes/${form.id}` : '/api/nutrition/recipes';
    const method = form.id ? 'PUT' : 'POST';
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setEditing(false);
    setSelected(null);
    fetchRecipes();
  };

  const deleteRecipe = async (id) => {
    if (!confirm('Delete this recipe?')) return;
    await fetch(`/api/nutrition/recipes/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setSelected(null);
    fetchRecipes();
  };

  const addIngredient = () => {
    setForm({ ...form, ingredients: [...form.ingredients, { qty: '', unit: '', name: '' }] });
  };

  const updateIngredient = (i, field, value) => {
    const ings = [...form.ingredients];
    ings[i] = { ...ings[i], [field]: value };
    setForm({ ...form, ingredients: ings });
  };

  const removeIngredient = (i) => {
    setForm({ ...form, ingredients: form.ingredients.filter((_, idx) => idx !== i) });
  };

  const addInstruction = () => {
    setForm({ ...form, instructions: [...form.instructions, ''] });
  };

  const updateInstruction = (i, value) => {
    const inst = [...form.instructions];
    inst[i] = value;
    setForm({ ...form, instructions: inst });
  };

  const removeInstruction = (i) => {
    setForm({ ...form, instructions: form.instructions.filter((_, idx) => idx !== i) });
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    background: 'var(--bg-primary)', border: '1px solid var(--divider)',
    color: 'var(--text-primary)', fontSize: 14, outline: 'none',
  };

  // ─── Edit / Add Form ──────────────────────────
  if (editing) {
    return (
      <div style={{ padding: 32, maxWidth: 860, margin: '0 auto' }}>
        <button onClick={() => { setEditing(false); if (!form.id) setSelected(null); }} style={{
          background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14,
          cursor: 'pointer', marginBottom: 20, padding: 0,
        }}>
          ← Cancel
        </button>

        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>
          {form.id ? 'Edit Recipe' : 'Add New Recipe'}
        </h2>

        {/* Basic info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Recipe Name</label>
            <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Chicken Stir Fry" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Category</label>
            <select style={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Description (optional)</label>
            <input style={inputStyle} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Short description..." />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <ImageUpload value={form.thumbnail} onChange={(url) => setForm({ ...form, thumbnail: url })} width={200} height={140} label="Recipe Thumbnail" />
          </div>
        </div>

        {/* Macros */}
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Nutrition (per serving)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { key: 'calories', label: 'Calories', unit: 'kcal' },
            { key: 'protein', label: 'Protein', unit: 'g' },
            { key: 'fat', label: 'Fat', unit: 'g' },
            { key: 'carbs', label: 'Carbs', unit: 'g' },
          ].map(m => (
            <div key={m.key}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>{m.label} ({m.unit})</label>
              <input type="number" style={inputStyle} value={form[m.key]} onChange={e => setForm({ ...form, [m.key]: Number(e.target.value) })} />
            </div>
          ))}
        </div>

        {/* Ingredients */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Ingredients</h3>
            <button onClick={addIngredient} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 13,
              background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer',
            }}>+ Add</button>
          </div>
          {form.ingredients.map((ing, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input style={{ ...inputStyle, width: 70 }} value={ing.qty} onChange={e => updateIngredient(i, 'qty', e.target.value)} placeholder="Qty" />
              <input style={{ ...inputStyle, width: 80 }} value={ing.unit} onChange={e => updateIngredient(i, 'unit', e.target.value)} placeholder="Unit" />
              <input style={{ ...inputStyle, flex: 1 }} value={ing.name} onChange={e => updateIngredient(i, 'name', e.target.value)} placeholder="Ingredient name" />
              <button onClick={() => removeIngredient(i)} style={{
                width: 32, height: 32, borderRadius: 8, border: 'none',
                background: 'rgba(255,59,48,0.15)', color: '#FF3B30', cursor: 'pointer', fontSize: 16, flexShrink: 0,
              }}>x</button>
            </div>
          ))}
          {form.ingredients.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No ingredients yet</p>}
        </div>

        {/* Instructions */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Instructions</h3>
            <button onClick={addInstruction} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 13,
              background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer',
            }}>+ Add Step</button>
          </div>
          {form.instructions.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: '#fff', marginTop: 6,
              }}>{i + 1}</div>
              <textarea style={{ ...inputStyle, flex: 1, minHeight: 60, resize: 'vertical' }} value={step} onChange={e => updateInstruction(i, e.target.value)} placeholder={`Step ${i + 1}...`} />
              <button onClick={() => removeInstruction(i)} style={{
                width: 32, height: 32, borderRadius: 8, border: 'none',
                background: 'rgba(255,59,48,0.15)', color: '#FF3B30', cursor: 'pointer', fontSize: 16, flexShrink: 0, marginTop: 6,
              }}>x</button>
            </div>
          ))}
          {form.instructions.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No instructions yet</p>}
        </div>

        {/* Save */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={saveRecipe} disabled={saving || !form.name} style={{
            padding: '12px 32px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700,
            background: form.name ? 'var(--accent)' : 'var(--bg-card)', color: form.name ? '#000' : 'var(--text-tertiary)',
            cursor: form.name ? 'pointer' : 'not-allowed',
          }}>{saving ? 'Saving...' : form.id ? 'Save Changes' : 'Create Recipe'}</button>
          <button onClick={() => { setEditing(false); if (!form.id) setSelected(null); }} style={{
            padding: '12px 24px', borderRadius: 10, border: '1px solid var(--divider)',
            background: 'none', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </div>
    );
  }

  // ─── Recipe Detail View ────────────────────────
  if (selected) {
    const r = selected;
    return (
      <div style={{ padding: 32, maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <button onClick={() => setSelected(null)} style={{
            background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14,
            cursor: 'pointer', padding: 0,
          }}>
            ← Back to recipes
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => startEdit(r)} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13,
              background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer',
            }}>Edit Recipe</button>
            <button onClick={() => deleteRecipe(r.id)} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13,
              background: 'rgba(255,59,48,0.15)', color: '#FF3B30', fontWeight: 600, cursor: 'pointer',
            }}>Delete</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
          <div style={{ width: 220, height: 220, borderRadius: 16, overflow: 'hidden', background: 'var(--bg-card)', flexShrink: 0 }}>
            {r.thumbnail ? (
              <img src={r.thumbnail} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 48, opacity: 0.3 }}>🍽️</span>
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{r.name}</h2>
            <span style={{
              display: 'inline-block', padding: '4px 10px', borderRadius: 20, fontSize: 12,
              background: 'rgba(255,140,0,0.15)', color: 'var(--accent)', marginBottom: 12,
            }}>{r.category}</span>
            {r.description && <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>{r.description}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Calories', value: r.calories, unit: 'kcal', color: 'var(--accent)' },
                { label: 'Protein', value: r.protein, unit: 'g', color: '#3DFFD2' },
                { label: 'Fat', value: r.fat, unit: 'g', color: '#FF9500' },
                { label: 'Carbs', value: r.carbs, unit: 'g', color: '#64D2FF' },
              ].map(m => (
                <div key={m.label} style={{
                  background: 'var(--bg-card)', borderRadius: 12, padding: '12px',
                  textAlign: 'center', borderLeft: `3px solid ${m.color}`,
                }}>
                  <p style={{ fontSize: 20, fontWeight: 700 }}>{m.value}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)' }}> {m.unit}</span></p>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
              Ingredients <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--text-secondary)' }}>({r.ingredients?.length || 0} items)</span>
            </h3>
            {r.ingredients?.length > 0 ? r.ingredients.map((ing, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 0', borderBottom: i < r.ingredients.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3DFFD2', flexShrink: 0, marginTop: 6 }} />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{ing.qty}{ing.unit ? ` ${ing.unit}` : ''}</strong> — {ing.name}
                </span>
              </div>
            )) : <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No ingredients listed</p>}
          </div>
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
              How to Prepare <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--text-secondary)' }}>({r.instructions?.length || 0} steps)</span>
            </h3>
            {r.instructions?.length > 0 ? r.instructions.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>{i + 1}</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1 }}>{step}</p>
              </div>
            )) : <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No instructions listed</p>}
          </div>
        </div>
      </div>
    );
  }

  // ─── Recipe List View ─────────────────────────
  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Recipes</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{recipes.length} recipes in library</p>
        </div>
        <button onClick={startAdd} style={{
          padding: '10px 20px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700,
          background: 'var(--accent)', color: '#fff', cursor: 'pointer',
        }}>+ Add Recipe</button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search recipes..." value={search} onChange={e => setSearch(e.target.value)} style={{
          flex: 1, minWidth: 200, maxWidth: 360, padding: '10px 14px', borderRadius: 10,
          background: 'var(--bg-card)', border: '1px solid var(--divider)',
          color: 'var(--text-primary)', fontSize: 14, outline: 'none',
        }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {filterCategories.map(cat => (
            <button key={cat} onClick={() => setFilterCat(cat)} style={{
              padding: '8px 14px', borderRadius: 20, border: 'none', fontSize: 13, cursor: 'pointer',
              background: filterCat === cat ? 'var(--accent)' : 'var(--bg-card)',
              color: filterCat === cat ? '#000' : 'var(--text-secondary)',
              fontWeight: filterCat === cat ? 600 : 400,
            }}>{cat}</button>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>
        Showing {filtered.length} recipe{filtered.length !== 1 ? 's' : ''}
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {filtered.map(recipe => (
            <div key={recipe.id} onClick={() => setSelected(recipe)} style={{
              background: 'var(--bg-card)', borderRadius: 16, overflow: 'hidden',
              cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
            >
              <div style={{ width: '100%', aspectRatio: '1', overflow: 'hidden', position: 'relative' }}>
                {recipe.thumbnail ? (
                  <img src={recipe.thumbnail} alt={recipe.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
                    <span style={{ fontSize: 32, opacity: 0.3 }}>🍽️</span>
                  </div>
                )}
                <span style={{
                  position: 'absolute', top: 8, right: 8, padding: '3px 8px', borderRadius: 12,
                  background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11, fontWeight: 600,
                }}>{recipe.category}</span>
              </div>
              <div style={{ padding: '12px 14px' }}>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>{recipe.name}</p>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span>{recipe.calories} cals</span>
                  <span>P: {recipe.protein}g</span>
                  <span>F: {recipe.fat}g</span>
                  <span>C: {recipe.carbs}g</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
