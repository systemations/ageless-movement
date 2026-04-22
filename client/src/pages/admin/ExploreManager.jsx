import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../components/ImageUpload';
import CourseBuilder from './CourseBuilder';
import WorkoutThumb from '../../components/WorkoutThumb';

const tabItems = [
  { id: 'sections', label: 'Page Builder' },
  { id: 'courses', label: 'Courses' },
  { id: 'tiers', label: 'Tiers & Access' },
  { id: 'config', label: 'Configuration' },
];

const sectionTypes = ['carousel', 'featured', 'grid'];
const layouts = ['square', 'wide', 'tall', 'circular'];
const parentTabs = ['fitness', 'nutrition', 'resources'];
// Content types - single source of truth for what kind of items a section holds.
// Note: 'follow_along' and 'workout' both resolve to the workouts table at the
// item-level (item_type='workout' in explore_section_items), but they filter
// to mutually exclusive subsets based on workouts.workout_type. Keep in sync
// with the dual-surface taxonomy rule and project_follow_along.md.
const contentTypes = [
  { value: 'course', label: 'Courses' },
  { value: 'program', label: 'Programs' },
  { value: 'workout', label: 'Workouts' },
  { value: 'follow_along', label: 'Follow Along Workouts' },
  { value: 'exercise', label: 'Exercises' },
  { value: 'recipe', label: 'Recipes' },
  { value: 'meal_plan', label: 'Meal Plans' },
];

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'var(--bg-primary)', border: '1px solid var(--divider)',
  color: 'var(--text-primary)', fontSize: 14, outline: 'none',
};

const btnPrimary = {
  padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13,
  background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer',
};

const btnDanger = {
  padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13,
  background: 'rgba(255,59,48,0.15)', color: '#FF3B30', fontWeight: 600, cursor: 'pointer',
};

const btnSecondary = {
  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--divider)',
  background: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
};

export default function ExploreManager() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('sections');
  const [sections, setSections] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [mealPlans, setMealPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => { fetchAll(true); }, []);

  // `showLoading` only flips the loading spinner on initial mount. Subsequent
  // refetches (after add/remove/reorder) are SILENT to avoid unmounting
  // SectionsTab, which would reset the picker scroll + search state.
  const fetchAll = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const [secRes, tierRes, courseRes, progRes, wkRes, recipeRes, mpRes] = await Promise.all([
      fetch('/api/content/explore-sections', { headers }).then(r => r.json()),
      fetch('/api/content/tiers', { headers }).then(r => r.json()),
      fetch('/api/content/courses', { headers }).then(r => r.json()),
      fetch('/api/content/programs', { headers }).then(r => r.json()),
      fetch('/api/content/workouts', { headers }).then(r => r.json()),
      fetch('/api/nutrition/recipes', { headers }).then(r => r.json()),
      fetch('/api/nutrition/meal-plans', { headers }).then(r => r.json()),
    ]);
    setSections(secRes.sections || []);
    setTiers(tierRes.tiers || []);
    setCourses(courseRes.courses || []);
    setPrograms(progRes.programs || []);
    setWorkouts(wkRes.workouts || []);
    // Flatten recipes from grouped-by-category structure
    const flatRecipes = [];
    (recipeRes.categories || []).forEach(cat => {
      (cat.recipes || []).forEach(r => flatRecipes.push({ ...r, title: r.name, image_url: r.thumbnail }));
    });
    setRecipes(flatRecipes);
    setMealPlans(mpRes.plans || []);
    if (showLoading) setLoading(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" /></div>;

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Explore</h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
        Manage what content clients see in the Explore tab
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--divider)', paddingBottom: 0 }}>
        {tabItems.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '10px 20px', border: 'none', fontSize: 14, cursor: 'pointer',
            background: 'none', fontWeight: activeTab === t.id ? 700 : 400,
            color: activeTab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'sections' && <SectionsTab sections={sections} setSections={setSections} tiers={tiers} programs={programs} workouts={workouts} courses={courses} recipes={recipes} mealPlans={mealPlans} headers={headers} onRefresh={fetchAll} />}
      {activeTab === 'courses' && <CoursesTab courses={courses} tiers={tiers} headers={headers} onRefresh={fetchAll} />}
      {activeTab === 'tiers' && <TiersTab tiers={tiers} headers={headers} onRefresh={fetchAll} />}
      {activeTab === 'config' && <ConfigTab tiers={tiers} headers={headers} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SECTIONS TAB - Page Builder
// ═══════════════════════════════════════════════════════
function SectionsTab({ sections, setSections, tiers, programs, workouts, courses, recipes, mealPlans, headers, onRefresh }) {
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addingItems, setAddingItems] = useState(null); // section id

  const createSection = async (data) => {
    await fetch('/api/content/explore-sections', { method: 'POST', headers, body: JSON.stringify(data) });
    setShowAdd(false);
    onRefresh();
  };

  const updateSection = async (id, data) => {
    await fetch(`/api/content/explore-sections/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) });
    setEditing(null);
    onRefresh();
  };

  const deleteSection = async (id) => {
    if (!confirm('Delete this section?')) return;
    await fetch(`/api/content/explore-sections/${id}`, { method: 'DELETE', headers });
    onRefresh();
  };

  // Look up enriched item fields from local programs/workouts/courses so
  // optimistic rows match the shape the server returns (so the item card
  // has a title/image immediately, no "loading..." flicker).
  const enrichItem = (itemType, itemId) => {
    let src;
    if (itemType === 'program') src = programs.find(p => p.id === itemId);
    else if (itemType === 'workout') src = workouts.find(w => w.id === itemId);
    else if (itemType === 'course') src = courses.find(c => c.id === itemId);
    return {
      item_type: itemType,
      item_id: itemId,
      item_title: src?.title || src?.name || '',
      item_image: src?.image_url || src?.thumbnail_url || null,
      duration_weeks: src?.duration_weeks || null,
    };
  };

  const addItem = async (sectionId, itemType, itemId) => {
    const section = sections.find(s => s.id === sectionId);
    const sortOrder = section?.items?.length || 0;
    // Optimistic: use a temp negative id that we'll swap for the real one
    // after the POST succeeds. Negative ids never collide with real ones.
    const tempId = -Date.now();
    const optimistic = { id: tempId, section_id: sectionId, sort_order: sortOrder, ...enrichItem(itemType, itemId) };
    setSections(prev => prev.map(s => s.id === sectionId
      ? { ...s, items: [...(s.items || []), optimistic] }
      : s));

    try {
      const res = await fetch(`/api/content/explore-sections/${sectionId}/items`, {
        method: 'POST', headers, body: JSON.stringify({ item_type: itemType, item_id: itemId, sort_order: sortOrder }),
      });
      const data = await res.json();
      // Swap the temp id for the real one so reorder/delete work afterwards
      if (data?.item?.id) {
        setSections(prev => prev.map(s => s.id === sectionId
          ? { ...s, items: (s.items || []).map(i => i.id === tempId ? { ...i, id: data.item.id } : i) }
          : s));
      }
    } catch (err) {
      // Revert on failure
      setSections(prev => prev.map(s => s.id === sectionId
        ? { ...s, items: (s.items || []).filter(i => i.id !== tempId) }
        : s));
    }
  };

  const removeItem = async (itemId) => {
    // Optimistic remove
    let removed = null;
    let removedSectionId = null;
    setSections(prev => prev.map(s => {
      const found = (s.items || []).find(i => i.id === itemId);
      if (found) {
        removed = found;
        removedSectionId = s.id;
        return { ...s, items: (s.items || []).filter(i => i.id !== itemId) };
      }
      return s;
    }));
    try {
      await fetch(`/api/content/explore-section-items/${itemId}`, { method: 'DELETE', headers });
    } catch (err) {
      // Revert
      if (removed && removedSectionId) {
        setSections(prev => prev.map(s => s.id === removedSectionId
          ? { ...s, items: [...(s.items || []), removed].sort((a, b) => a.sort_order - b.sort_order) }
          : s));
      }
    }
  };

  // Reorder a single item within its section by one step (up or down).
  // Optimistic: swap in local state, then PATCH the reorder endpoint with
  // the new ordered list for that section.
  const moveItem = async (sectionId, itemId, direction) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    const items = [...(section.items || [])];
    const idx = items.findIndex(i => i.id === itemId);
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || target < 0 || target >= items.length) return;
    [items[idx], items[target]] = [items[target], items[idx]];
    const reordered = items.map((it, i) => ({ ...it, sort_order: i }));

    // Optimistic update
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, items: reordered } : s));

    try {
      await fetch(`/api/content/explore-sections/${sectionId}/items/reorder`, {
        method: 'PUT', headers,
        body: JSON.stringify({ items: reordered.map(i => ({ id: i.id, sort_order: i.sort_order })) }),
      });
    } catch (err) {
      // On failure, refetch to get the canonical order
      onRefresh();
    }
  };

  const moveSection = async (id, direction) => {
    const idx = sections.findIndex(s => s.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;
    await fetch(`/api/content/explore-sections/${sections[idx].id}`, {
      method: 'PUT', headers, body: JSON.stringify({ ...sections[idx], sort_order: sections[swapIdx].sort_order }),
    });
    await fetch(`/api/content/explore-sections/${sections[swapIdx].id}`, {
      method: 'PUT', headers, body: JSON.stringify({ ...sections[swapIdx], sort_order: sections[idx].sort_order }),
    });
    onRefresh();
  };

  // Group by parent_tab
  const grouped = {};
  parentTabs.forEach(t => { grouped[t] = sections.filter(s => s.parent_tab === t); });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{sections.length} sections across {parentTabs.length} tabs</p>
        <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Add Section</button>
      </div>

      {/* Add Section Modal */}
      {showAdd && <SectionForm tiers={tiers} onSave={createSection} onCancel={() => setShowAdd(false)} />}

      {/* Sections grouped by tab */}
      {parentTabs.map(tab => (
        <div key={tab} style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, textTransform: 'capitalize', marginBottom: 12,
            padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 8, display: 'inline-block' }}>
            {tab}
          </h3>

          {grouped[tab].length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' }}>No sections yet. Click "+ Add Section" to create one.</p>
          ) : (
            grouped[tab].map((section, idx) => (
              <div key={section.id} style={{
                background: 'var(--bg-card)', borderRadius: 12, padding: 16, marginBottom: 12,
                border: editing === section.id ? '1px solid var(--accent)' : '1px solid var(--divider)',
              }}>
                {editing === section.id ? (
                  <SectionForm
                    initial={section}
                    tiers={tiers}
                    onSave={(data) => updateSection(section.id, data)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      {/* Reorder buttons */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button onClick={() => moveSection(section.id, 'up')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 10, padding: 0 }}>▲</button>
                        <button onClick={() => moveSection(section.id, 'down')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 10, padding: 0 }}>▼</button>
                      </div>

                      {/* Visibility dot */}
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: section.visible ? '#34C759' : '#8E8E93' }} />

                      <h4 style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{section.title}</h4>

                      {/* Badges */}
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(100,210,255,0.15)', color: '#64D2FF' }}>{section.section_type}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,140,0,0.15)', color: 'var(--accent)' }}>{section.layout}</span>
                      {section.tier_name && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(61,255,210,0.15)', color: '#3DFFD2' }}>{section.tier_name}+</span>}

                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{section.items?.length || 0} items</span>

                      <button onClick={() => setEditing(section.id)} style={btnSecondary}>Edit</button>
                      <button onClick={() => setAddingItems(addingItems === section.id ? null : section.id)} style={btnSecondary}>
                        {addingItems === section.id ? 'Close' : '+ Items'}
                      </button>
                      <button onClick={() => deleteSection(section.id)} style={{ ...btnDanger, padding: '6px 10px' }}>x</button>
                    </div>

                    {/* Items */}
                    {section.items?.length > 0 && (
                      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingTop: 8, paddingBottom: 4 }}>
                        {section.items.map((item, itemIdx) => (
                          <div key={item.id} style={{
                            minWidth: 140, maxWidth: 140, background: 'var(--bg-primary)', borderRadius: 10, padding: 10,
                            position: 'relative', flexShrink: 0,
                          }}>
                            {/* Shared WorkoutThumb: renders the image if one exists,
                                otherwise shows the title on a light gradient. */}
                            <div style={{ marginBottom: 6 }}>
                              <WorkoutThumb
                                title={item.item_title || ''}
                                thumbnailUrl={item.item_image}
                                aspectRatio="16/9"
                                borderRadius={8}
                                titleFontSize={11}
                              />
                            </div>
                            <p style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{item.item_title || `${item.item_type} #${item.item_id}`}</p>
                            <p style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{item.item_type}{item.duration_weeks ? ` - ${item.duration_weeks}wk` : ''}</p>
                            {/* Reorder arrows - move item left/right within its section */}
                            <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
                              <button
                                onClick={() => moveItem(section.id, item.id, 'up')}
                                disabled={itemIdx === 0}
                                title="Move left"
                                style={{
                                  flex: 1, padding: '3px 0', background: 'var(--bg-card)', border: '1px solid var(--divider)',
                                  borderRadius: 4, cursor: itemIdx === 0 ? 'not-allowed' : 'pointer',
                                  color: 'var(--text-secondary)', fontSize: 10,
                                  opacity: itemIdx === 0 ? 0.3 : 1,
                                }}
                              >◀</button>
                              <button
                                onClick={() => moveItem(section.id, item.id, 'down')}
                                disabled={itemIdx === section.items.length - 1}
                                title="Move right"
                                style={{
                                  flex: 1, padding: '3px 0', background: 'var(--bg-card)', border: '1px solid var(--divider)',
                                  borderRadius: 4, cursor: itemIdx === section.items.length - 1 ? 'not-allowed' : 'pointer',
                                  color: 'var(--text-secondary)', fontSize: 10,
                                  opacity: itemIdx === section.items.length - 1 ? 0.3 : 1,
                                }}
                              >▶</button>
                            </div>
                            <button onClick={() => removeItem(item.id)} style={{
                              position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%',
                              background: 'rgba(255,59,48,0.8)', color: '#fff', border: 'none', fontSize: 10, cursor: 'pointer',
                            }}>x</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add items panel */}
                    {addingItems === section.id && (
                      <ItemPicker
                        programs={programs}
                        workouts={workouts}
                        courses={courses}
                        recipes={recipes}
                        mealPlans={mealPlans}
                        existingIds={new Set(section.items?.map(i => `${i.item_type}_${i.item_id}`) || [])}
                        lockedType={section.content_type || section.items?.[0]?.item_type || guessTypeFromTitle(section.title)}
                        onAdd={(type, id) => addItem(section.id, type, id)}
                      />
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}

// Section edit/create form
function SectionForm({ initial, tiers, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    section_type: initial?.section_type || 'carousel',
    layout: initial?.layout || 'square',
    tile_size: initial?.tile_size || 'medium',
    sort_order: initial?.sort_order || 0,
    visible: initial?.visible !== undefined ? initial.visible : 1,
    min_tier_id: initial?.min_tier_id || 1,
    parent_tab: initial?.parent_tab || 'fitness',
    content_type: initial?.content_type || '',
  });

  return (
    <div style={{ padding: 16, background: 'var(--bg-primary)', borderRadius: 10, marginBottom: 12 }}>
      <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{initial ? 'Edit Section' : 'New Section'}</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Title</label>
          <input style={inputStyle} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Section title" />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Tab</label>
          <select style={inputStyle} value={form.parent_tab} onChange={e => setForm({ ...form, parent_tab: e.target.value })}>
            {parentTabs.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Min Tier</label>
          <select style={inputStyle} value={form.min_tier_id} onChange={e => setForm({ ...form, min_tier_id: Number(e.target.value) })}>
            {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr auto', gap: 12, marginBottom: 12, alignItems: 'end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Content</label>
          <select style={inputStyle} value={form.content_type} onChange={e => setForm({ ...form, content_type: e.target.value })}>
            <option value="">- Pick one -</option>
            {contentTypes.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Style</label>
          <select style={inputStyle} value={form.section_type} onChange={e => setForm({ ...form, section_type: e.target.value })}>
            {sectionTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Layout</label>
          <select style={inputStyle} value={form.layout} onChange={e => setForm({ ...form, layout: e.target.value })}>
            {layouts.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Order</label>
          <input type="number" style={inputStyle} value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 8 }}>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.visible === 1} onChange={e => setForm({ ...form, visible: e.target.checked ? 1 : 0 })} />
            Visible
          </label>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Description</label>
        <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description..." />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onSave(form)} disabled={!form.title} style={{ ...btnPrimary, opacity: form.title ? 1 : 0.5 }}>
          {initial ? 'Save' : 'Create Section'}
        </button>
        <button onClick={onCancel} style={btnSecondary}>Cancel</button>
      </div>
    </div>
  );
}

// Guess section content type from its title (used when section is empty)
function guessTypeFromTitle(title = '') {
  const t = title.toLowerCase();
  if (t.includes('course')) return 'course';
  if (t.includes('program')) return 'program';
  if (t.includes('follow')) return 'follow_along';
  if (t.includes('meal plan') || t.includes('meal-plan')) return 'meal_plan';
  if (t.includes('recipe')) return 'recipe';
  return 'workout';
}

// Human-readable label for the "X only" badge
const lockedLabel = {
  course: 'Courses',
  program: 'Programs',
  workout: 'Workouts',
  recipe: 'Recipes',
  meal_plan: 'Meal Plans',
  follow_along: 'Follow Along Workouts',
  exercise: 'Exercises',
};

// Item picker - choose programs/workouts/courses to add.
// Sections are single-type: lockedType pins the picker to one content type.
// 'follow_along' and 'workout' both save as item_type='workout' in the DB
// but filter the workouts array to mutually exclusive subsets based on
// the underlying workouts.workout_type column.
function ItemPicker({ programs, workouts, courses, recipes = [], mealPlans = [], existingIds, lockedType, onAdd }) {
  const [filter] = useState(lockedType || 'program');
  const [search, setSearch] = useState('');

  // Resolve which array of items this filter browses, and which item_type
  // should be persisted to explore_section_items when the user clicks +.
  let items;
  let saveType;
  if (filter === 'program') {
    items = programs;
    saveType = 'program';
  } else if (filter === 'course') {
    items = courses;
    saveType = 'course';
  } else if (filter === 'follow_along') {
    items = workouts.filter(w => w.workout_type === 'follow_along');
    saveType = 'workout';
  } else if (filter === 'recipe') {
    items = recipes;
    saveType = 'recipe';
  } else if (filter === 'meal_plan') {
    items = mealPlans;
    saveType = 'meal_plan';
  } else {
    // 'workout' = structured workouts only, exclude follow-alongs
    items = workouts.filter(w => w.workout_type !== 'follow_along');
    saveType = 'workout';
  }

  const filtered = items.filter(i => {
    const name = i.title || i.name || '';
    return name.toLowerCase().includes(search.toLowerCase()) && !existingIds.has(`${saveType}_${i.id}`);
  });

  return (
    <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-primary)', borderRadius: 10 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <span style={{
          padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6,
          background: 'var(--accent)', color: '#fff',
        }}>{lockedLabel[filter] || filter} only</span>
        <input style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '6px 10px' }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {filtered.slice(0, 20).map(item => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6,
            cursor: 'pointer', marginBottom: 2,
          }}
            onClick={() => onAdd(saveType, item.id)}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}
          >
            {(item.image_url) && <img src={item.image_url} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />}
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 500 }}>{item.title || item.name}</p>
              {item.duration_weeks && <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{item.duration_weeks} weeks</p>}
            </div>
            <span style={{ fontSize: 18, color: 'var(--accent)' }}>+</span>
          </div>
        ))}
        {filtered.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: 16 }}>No items to add</p>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// COURSES TAB
// ═══════════════════════════════════════════════════════
function CoursesTab({ courses, tiers, headers, onRefresh }) {
  const [buildingCourseId, setBuildingCourseId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const createCourse = async (form) => {
    const res = await fetch('/api/content/courses', { method: 'POST', headers, body: JSON.stringify(form) });
    const data = await res.json();
    setShowAdd(false);
    onRefresh();
    // Open builder immediately after creation
    if (data.course?.id) setBuildingCourseId(data.course.id);
  };

  const deleteCourse = async (id) => {
    if (!confirm('Delete this course and all its modules/lessons?')) return;
    await fetch(`/api/content/courses/${id}`, { method: 'DELETE', headers });
    onRefresh();
  };

  // Course Builder view
  if (buildingCourseId) {
    return <CourseBuilder courseId={buildingCourseId} onBack={() => { setBuildingCourseId(null); onRefresh(); }} />;
  }

  // New Course form
  if (showAdd) {
    return <NewCourseForm tiers={tiers} onSave={createCourse} onCancel={() => setShowAdd(false)} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{courses.length} courses</p>
        <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Add Course</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {courses.map(c => (
          <div key={c.id} style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ height: 140, background: 'var(--bg-primary)', position: 'relative' }}>
              {c.image_url ? <img src={c.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> :
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 32, opacity: 0.3 }}>📚</span></div>}
              {c.featured === 1 && <span style={{ position: 'absolute', top: 8, left: 8, padding: '2px 8px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700 }}>FEATURED</span>}
              <span style={{ position: 'absolute', top: 8, right: 8, padding: '2px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10 }}>{c.tier_name || 'Free'}</span>
            </div>
            <div style={{ padding: 14 }}>
              <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{c.title}</h4>
              {c.subtitle && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{c.subtitle}</p>}
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                <span>{c.difficulty}</span>
                {c.duration && <span>{c.duration}</span>}
                <span>{c.modules || 0} modules</span>
                <span>{c.lessons || 0} lessons</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setBuildingCourseId(c.id)} style={btnPrimary}>Edit Course</button>
                <button onClick={() => deleteCourse(c.id)} style={{ ...btnDanger, padding: '6px 10px' }}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewCourseForm({ tiers, onSave, onCancel }) {
  const [form, setForm] = useState({ title: '', subtitle: '', description: '', image_url: '', difficulty: 'All Levels', duration: '', tier_id: 1, visible: 1, featured: 0 });
  return (
    <div style={{ maxWidth: 700 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>New Course</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Title</label><input style={inputStyle} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
        <div><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Subtitle</label><input style={inputStyle} value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} /></div>
        <div><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Difficulty</label>
          <select style={inputStyle} value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}>
            {['Beginner', 'Intermediate', 'Advanced', 'All Levels'].map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Duration</label><input style={inputStyle} value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="e.g. 8 weeks" /></div>
        <div><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Tier</label>
          <select style={inputStyle} value={form.tier_id} onChange={e => setForm({ ...form, tier_id: Number(e.target.value) })}>
            {tiers.map(t => <option key={t.id} value={t.id}>{t.name} - {t.price_label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.visible === 1} onChange={e => setForm({ ...form, visible: e.target.checked ? 1 : 0 })} /> Visible
          </label>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.featured === 1} onChange={e => setForm({ ...form, featured: e.target.checked ? 1 : 0 })} /> Featured
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
        <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} width={240} height={160} label="Course Thumbnail" />
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Description</label>
          <textarea style={{ ...inputStyle, minHeight: 160 }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onSave(form)} disabled={!form.title} style={{ ...btnPrimary, opacity: form.title ? 1 : 0.5 }}>Create & Build</button>
        <button onClick={onCancel} style={btnSecondary}>Cancel</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TIERS TAB
// ═══════════════════════════════════════════════════════
function TiersTab({ tiers, headers, onRefresh }) {
  const [editing, setEditing] = useState(null);

  const saveTier = async (tier) => {
    if (tier.id) {
      await fetch(`/api/content/tiers/${tier.id}`, { method: 'PUT', headers, body: JSON.stringify(tier) });
    } else {
      await fetch('/api/content/tiers', { method: 'POST', headers, body: JSON.stringify(tier) });
    }
    setEditing(null);
    onRefresh();
  };

  const deleteTier = async (id) => {
    if (!confirm('Delete this tier? Content assigned to it will need reassigning.')) return;
    await fetch(`/api/content/tiers/${id}`, { method: 'DELETE', headers });
    onRefresh();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Client tiers control what content is accessible. Clients on a tier can see all content at their level and below.</p>
        </div>
        <button onClick={() => setEditing({ name: '', level: tiers.length, description: '', price_label: '', features: '', cta_type: 'message_coach', cta_url: '', cta_label: '' })} style={btnPrimary}>+ Add Tier</button>
      </div>

      {editing && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{editing.id ? 'Edit Tier' : 'New Tier'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Name</label><input style={inputStyle} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
            <div><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Level</label><input type="number" style={inputStyle} value={editing.level} onChange={e => setEditing({ ...editing, level: Number(e.target.value) })} /></div>
            <div><label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Price Label</label><input style={inputStyle} value={editing.price_label || ''} onChange={e => setEditing({ ...editing, price_label: e.target.value })} placeholder="e.g. $49/mo" /></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button onClick={() => saveTier(editing)} disabled={!editing.name} style={btnPrimary}>Save</button>
              <button onClick={() => setEditing(null)} style={btnSecondary}>Cancel</button>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Description</label>
            <input style={inputStyle} value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="One-line summary shown on the tier card" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Features (one per line - shown as a checkmark list)
            </label>
            <textarea
              style={{ ...inputStyle, minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }}
              value={editing.features || ''}
              onChange={e => setEditing({ ...editing, features: e.target.value })}
              placeholder={'Lifetime access to this program\nGroup Q&A calls\nCommunity chat access'}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Upgrade CTA type</label>
              <select
                style={inputStyle}
                value={editing.cta_type || 'message_coach'}
                onChange={e => setEditing({ ...editing, cta_type: e.target.value })}
              >
                <option value="message_coach">Message coach</option>
                <option value="booking_link">Booking link</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>CTA button label (optional)</label>
              <input
                style={inputStyle}
                value={editing.cta_label || ''}
                onChange={e => setEditing({ ...editing, cta_label: e.target.value })}
                placeholder={editing.cta_type === 'booking_link' ? 'e.g. Book a discovery call' : 'e.g. Message coach to upgrade'}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Booking URL {editing.cta_type === 'booking_link' ? '(required)' : '(ignored)'}
              </label>
              <input
                style={{ ...inputStyle, opacity: editing.cta_type === 'booking_link' ? 1 : 0.5 }}
                value={editing.cta_url || ''}
                onChange={e => setEditing({ ...editing, cta_url: e.target.value })}
                placeholder="https://systemations.com/..."
                disabled={editing.cta_type !== 'booking_link'}
              />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {tiers.map(tier => (
          <div key={tier.id} style={{
            display: 'flex', alignItems: 'center', gap: 16, background: 'var(--bg-card)',
            borderRadius: 12, padding: '16px 20px', borderLeft: `4px solid ${tier.level === 0 ? '#8E8E93' : tier.level === 1 ? '#FF9500' : tier.level === 2 ? '#3DFFD2' : '#FFD700'}`,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-primary)', fontSize: 16, fontWeight: 800,
            }}>{tier.level}</div>
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: 16, fontWeight: 700 }}>{tier.name}</h4>
              {tier.description && <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{tier.description}</p>}
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>{tier.price_label}</span>
            <button onClick={() => setEditing(tier)} style={btnSecondary}>Edit</button>
            {tier.level > 0 && <button onClick={() => deleteTier(tier.id)} style={{ ...btnDanger, padding: '6px 10px' }}>Delete</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// CONFIG TAB
// ═══════════════════════════════════════════════════════
function ConfigTab({ tiers }) {
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Explore Configuration</h3>

      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Access Control</h4>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Clients on specific plans will be able to see the Explore tab in the app. Content visibility is controlled by tiers assigned to each section and course.
        </p>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--divider)' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>Plan</th>
              <th style={{ textAlign: 'center', padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>Fitness</th>
              <th style={{ textAlign: 'center', padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>Nutrition</th>
              <th style={{ textAlign: 'center', padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>Resources</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map(tier => (
              <tr key={tier.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                <td style={{ padding: '12px', fontSize: 14 }}>
                  <strong>{tier.name}</strong>
                  <br /><span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{tier.price_label}</span>
                </td>
                <td style={{ textAlign: 'center', padding: '12px' }}>
                  <span style={{ color: '#34C759', fontSize: 13 }}>Full Access</span>
                </td>
                <td style={{ textAlign: 'center', padding: '12px' }}>
                  <span style={{ color: tier.level >= 1 ? '#34C759' : '#FF9500', fontSize: 13 }}>
                    {tier.level >= 1 ? 'Full Access' : 'Partial Access'}
                  </span>
                </td>
                <td style={{ textAlign: 'center', padding: '12px' }}>
                  <span style={{ color: tier.level >= 2 ? '#34C759' : tier.level >= 1 ? '#FF9500' : '#FF3B30', fontSize: 13 }}>
                    {tier.level >= 2 ? 'Full Access' : tier.level >= 1 ? 'Partial Access' : 'No Access'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20 }}>
        <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Titles</h4>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Customise page, tab bar, and separator titles for different sections.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {['Fitness', 'Nutrition', 'Resources'].map(section => (
            <div key={section}>
              <h5 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{section}</h5>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Page Title</label>
                <input style={inputStyle} defaultValue={section === 'Fitness' ? 'Handsdan On-Demand' : 'On-Demand'} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Tab Bar Title</label>
                <input style={inputStyle} defaultValue={section === 'Fitness' ? 'Workouts' : section} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
