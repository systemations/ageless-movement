import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../components/ImageUpload';

// Admin manager for MEAL PLANS - one reusable structured day in the three-tier
// model (Recipe → MealPlan → MealSchedule).
//
// Left pane : list of all meal plans as cards, showing title, target calories,
//             how many schedules use them (usage count), and category chip.
// Right pane: inline editor for the selected plan. Metadata at top, then a
//             list of meal slots (Breakfast/Lunch/Dinner/Snack) where each slot
//             has a primary item + any OR alternative items. "+ Add meal" and
//             "+ Add alternative" buttons inline per slot.
//
// Macros are rolled up server-side from the linked recipes, so this component
// doesn't duplicate calorie/macro calculations. Per feedback_admin_inline_panels,
// editing happens in a sticky right sidebar (never a floating modal).
export default function MealPlanManager() {
  const { token } = useAuth();
  const [plans, setPlans] = useState([]);
  const [editing, setEditing] = useState(null); // { id, ... } | { __new: true } | null
  const [search, setSearch] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => { fetchPlans(); }, []);

  const fetchPlans = async () => {
    const res = await fetch('/api/nutrition/meal-plans', { headers });
    const data = await res.json();
    setPlans(data.plans || []);
  };

  const filtered = plans.filter(p =>
    !search || p.title?.toLowerCase().includes(search.toLowerCase()) || p.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '24px 40px', display: 'grid', gridTemplateColumns: editing ? '1fr 560px' : '1fr', gap: 24 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800 }}>Meal Plans</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              {plans.length} reusable day{plans.length !== 1 ? 's' : ''} · combine them into schedules
            </p>
          </div>
          <button onClick={() => setEditing({ __new: true })} style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
            padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>+ New Meal Plan</button>
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search meal plans..."
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            border: '1px solid var(--divider)', background: 'var(--bg-card)',
            color: 'var(--text-primary)', fontSize: 13,
          }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {filtered.map(p => (
            <div
              key={p.id}
              onClick={() => setEditing(p)}
              style={{
                background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                border: editing?.id === p.id ? '2px solid var(--accent)' : '2px solid transparent',
                padding: 14,
              }}
            >
              <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{p.title}</p>
              <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                <span>{p.target_calories || 0} cal</span>
                <span>·</span>
                <span>{p.item_count || 0} meals</span>
                <span>·</span>
                <span>used in {p.used_in_schedules || 0}</span>
              </div>
              {p.category && (
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                  background: 'rgba(255,140,0,0.15)', color: 'var(--accent)', fontSize: 10, fontWeight: 700,
                }}>{p.category}</span>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              No meal plans yet. Create one to get started.
            </div>
          )}
        </div>
      </div>

      {editing && (
        <MealPlanEditor
          key={editing.__new ? 'new' : editing.id}
          plan={editing.__new ? null : editing}
          token={token}
          onClose={() => setEditing(null)}
          onSaved={() => { fetchPlans(); }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Meal plan editor (inline right panel)
// -------------------------------------------------------------------------
function MealPlanEditor({ plan, token, onClose, onSaved }) {
  const isNew = !plan;
  const headers = { Authorization: `Bearer ${token}` };

  const [form, setForm] = useState({
    title: plan?.title || '',
    description: plan?.description || '',
    thumbnail_url: plan?.thumbnail_url || '',
    category: plan?.category || 'general',
    tags: plan?.tags || '',
  });
  const [detail, setDetail] = useState(null); // { plan, items, day_totals, scale_factor }
  const [recipes, setRecipes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(null); // { meal_type, alternative_group }
  const [search, setSearch] = useState('');

  const reload = async (id) => {
    const pid = id || plan?.id || detail?.plan?.id;
    if (!pid) return;
    const res = await fetch(`/api/nutrition/meal-plans/${pid}`, { headers });
    const d = await res.json();
    setDetail(d);
  };

  useEffect(() => {
    if (plan) reload(plan.id);
    fetch('/api/nutrition/recipes', { headers })
      .then(r => r.json())
      .then(d => {
        const flat = [];
        (d.categories || []).forEach(cat => {
          (cat.recipes || []).forEach(r => flat.push({ ...r, category: cat.title }));
        });
        setRecipes(flat);
      });
  }, [plan?.id]);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      if (isNew) {
        const res = await fetch('/api/nutrition/meal-plans', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const d = await res.json();
        await reload(d.id);
      } else {
        await fetch(`/api/nutrition/meal-plans/${plan.id}`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        await reload(plan.id);
      }
      onSaved();
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const remove = async () => {
    if (!plan || !confirm(`Delete "${plan.title}"? This cannot be undone.`)) return;
    await fetch(`/api/nutrition/meal-plans/${plan.id}`, { method: 'DELETE', headers });
    onSaved();
    onClose();
  };

  const addItem = async (mealType, altGroup, recipe) => {
    const pid = detail?.plan?.id || plan?.id;
    if (!pid) return;
    await fetch(`/api/nutrition/meal-plans/${pid}/items`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meal_type: mealType,
        recipe_id: recipe.id,
        custom_name: recipe.name,
        alternative_group: altGroup,
        serving_qty: 1,
      }),
    });
    // Server rolls up macros automatically on update, but our meal_plan's
    // target_calories lives on the plans table and was set at seed time.
    // We just need to reload the items list - the summary at the top uses
    // the items' own serving × recipe macros via the scaling helper.
    setPicking(null);
    setSearch('');
    reload();
  };

  const removeItem = async (itemId) => {
    await fetch(`/api/nutrition/meal-plans/items/${itemId}`, { method: 'DELETE', headers });
    reload();
  };

  const filteredRecipes = recipes.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 30);

  // Group items by meal_type
  const mealOrder = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Evening Snack'];
  const slots = {};
  (detail?.items || []).forEach((it) => {
    if (!slots[it.meal_type]) slots[it.meal_type] = [];
    slots[it.meal_type].push(it);
  });
  const orderedTypes = [
    ...mealOrder.filter(m => slots[m]),
    ...Object.keys(slots).filter(m => !mealOrder.includes(m)),
  ];
  // Ensure we always show the standard meal slots even when empty, so coach can add
  const visibleTypes = Array.from(new Set([...mealOrder, ...orderedTypes]));

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12, padding: 20,
      position: 'sticky', top: 20, maxHeight: 'calc(100vh - 40px)', overflow: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>{isNew ? 'New Meal Plan' : 'Edit Meal Plan'}</h2>
        <button onClick={onClose} style={closeBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Metadata */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Title</label>
        <input value={form.title} onChange={e => update('title', e.target.value)} style={inputStyle} placeholder="e.g. Monday · 1800 kcal" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Description</label>
        <textarea value={form.description} onChange={e => update('description', e.target.value)}
          style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} rows={2} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Category</label>
          <input value={form.category} onChange={e => update('category', e.target.value)} style={inputStyle} placeholder="general" />
        </div>
        <div>
          <label style={labelStyle}>Cover</label>
          <ImageUpload value={form.thumbnail_url} onChange={url => update('thumbnail_url', url)} width={120} height={64} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button onClick={save} disabled={saving || !form.title} style={{
          flex: 1, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          opacity: (saving || !form.title) ? 0.5 : 1,
        }}>{saving ? 'Saving...' : (isNew ? 'Create Plan' : 'Save')}</button>
        {!isNew && (
          <button onClick={remove} style={{
            background: 'rgba(255,69,58,0.15)', color: '#FF453A', border: 'none', borderRadius: 8,
            padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Delete</button>
        )}
      </div>

      {/* Day summary bar - only visible once saved */}
      {detail?.plan && (
        <div style={{
          background: 'var(--bg-primary)', borderRadius: 10, padding: 12, marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Daily total</p>
            <p style={{ fontSize: 18, fontWeight: 800 }}>{Math.round(detail.day_totals?.calories || 0)} cal</p>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
            <span><b style={{ color: 'var(--text-primary)' }}>{Math.round(detail.day_totals?.protein || 0)}</b> P</span>
            <span><b style={{ color: 'var(--text-primary)' }}>{Math.round(detail.day_totals?.fat || 0)}</b> F</span>
            <span><b style={{ color: 'var(--text-primary)' }}>{Math.round(detail.day_totals?.carbs || 0)}</b> C</span>
          </div>
        </div>
      )}

      {/* Meal slots */}
      {detail?.plan ? (
        <div>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Meals
          </h3>
          {visibleTypes.map((mealType) => {
            const primary = (slots[mealType] || []).filter(i => i.alternative_group === 0);
            const alts = (slots[mealType] || []).filter(i => i.alternative_group > 0);
            const nextAltGroup = alts.length === 0 ? 1 : Math.max(...alts.map(a => a.alternative_group)) + 1;

            return (
              <div key={mealType} style={{
                background: 'var(--bg-primary)', borderRadius: 10, padding: 12, marginBottom: 10,
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 800, color: 'var(--accent-mint)',
                  textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
                }}>{mealType}</p>

                {/* Primary items */}
                {primary.map(it => (
                  <ItemRow key={it.id} item={it} onRemove={() => removeItem(it.id)} />
                ))}
                {primary.length === 0 && picking?.meal_type !== mealType && (
                  <button onClick={() => setPicking({ meal_type: mealType, alternative_group: 0 })} style={dashedBtn}>
                    + Add {mealType.toLowerCase()}
                  </button>
                )}
                {primary.length > 0 && picking?.meal_type !== mealType && (
                  <button onClick={() => setPicking({ meal_type: mealType, alternative_group: 0 })} style={{ ...dashedBtn, marginTop: 4 }}>
                    + Replace
                  </button>
                )}

                {/* Alternatives */}
                {alts.length > 0 && (
                  <div style={{ marginTop: 6, marginLeft: 10, borderLeft: '2px solid var(--accent-mint)', paddingLeft: 8 }}>
                    <p style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>OR</p>
                    {alts.map(it => (
                      <ItemRow key={it.id} item={it} onRemove={() => removeItem(it.id)} />
                    ))}
                  </div>
                )}
                {primary.length > 0 && picking?.meal_type !== mealType && (
                  <button
                    onClick={() => setPicking({ meal_type: mealType, alternative_group: nextAltGroup })}
                    style={{ ...dashedBtn, marginTop: 6, borderColor: 'rgba(61,255,210,0.3)', color: 'var(--accent-mint)' }}
                  >
                    + Add alternative
                  </button>
                )}

                {/* Inline recipe picker */}
                {picking?.meal_type === mealType && (
                  <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-card)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search recipes..."
                        style={{ ...inputStyle, fontSize: 12, padding: '6px 10px' }}
                        autoFocus
                      />
                      <button onClick={() => { setPicking(null); setSearch(''); }} style={{
                        background: 'transparent', border: 'none', color: 'var(--text-secondary)',
                        cursor: 'pointer', fontSize: 11, padding: '0 8px',
                      }}>Cancel</button>
                    </div>
                    <div style={{ maxHeight: 220, overflow: 'auto' }}>
                      {filteredRecipes.map(r => (
                        <button
                          key={r.id}
                          onClick={() => addItem(picking.meal_type, picking.alternative_group, r)}
                          style={recipePickRow}
                          onMouseOver={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                        >
                          {r.thumbnail && <img src={r.thumbnail} style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</p>
                            <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{r.calories} cal · {r.category}</p>
                          </div>
                        </button>
                      ))}
                      {filteredRecipes.length === 0 && (
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: 10 }}>
                          No recipes match "{search}"
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : isNew ? (
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: 16 }}>
          Create the plan first, then add meals.
        </p>
      ) : null}
    </div>
  );
}

function ItemRow({ item, onRemove }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
      background: 'var(--bg-card)', borderRadius: 6, marginBottom: 4,
    }}>
      {item.thumbnail_url ? (
        <img src={item.thumbnail_url} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />
      ) : (
        <div style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🍽️</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.recipe_title || item.custom_name}
        </p>
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          {Math.round((item.calories || 0) * (item.serving_qty || 1))} cal
        </p>
      </div>
      <button onClick={onRemove} style={{
        background: 'transparent', border: 'none', color: '#FF453A', cursor: 'pointer', padding: 4,
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
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

const dashedBtn = {
  width: '100%', padding: '6px', background: 'transparent',
  border: '1px dashed var(--divider)', borderRadius: 6,
  color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
};

const recipePickRow = {
  display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '6px 8px',
  background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left',
};
