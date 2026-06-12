import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { modal } from '../../components/Modal';

const tabs = ['Programs', 'Workouts', 'Exercises'];
const PAGE_SIZE = 50;

// Filter chip option sets. Body-part groups mirror the client Exercise Library
// (and the server's BODY_PART_GROUPS); workout types mirror the edit form.
const BODY_PART_GROUPS = ['Hips', 'Back', 'Shoulders', 'Core', 'Arms', 'Legs', 'Chest', 'Full Body'];
const WORKOUT_TYPES = ['strength', 'mobility', 'cardio', 'flexibility', 'rehab'];
const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
];

function ImageUpload({ value, onChange, label }) {
  const { token } = useAuth();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        onChange(data.url);
      }
    } catch (err) { console.error(err); }
    setUploading(false);
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{label || 'Image'}</p>
      <label style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        width: '100%', height: value ? 160 : 80, borderRadius: 12, overflow: 'hidden',
        background: 'var(--bg-card)', border: '2px dashed var(--divider)',
      }}>
        {value ? (
          <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ textAlign: 'center' }}>
            {uploading ? (
              <div className="spinner" style={{ margin: '0 auto' }} />
            ) : (
              <>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2" style={{ margin: '0 auto 4px' }}>
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
                </svg>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tap to upload</p>
              </>
            )}
          </div>
        )}
        <input type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
      </label>
      {value && (
        <button onClick={() => onChange(null)} style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: 12, marginTop: 4 }}>Remove image</button>
      )}
    </div>
  );
}

// Horizontal scrolling filter-chip row.
function Chips({ options, value, onChange }) {
  return (
    <div className="hide-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8 }}>
      {options.map(o => {
        const val = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        const active = value === val;
        return (
          <button key={val} onClick={() => onChange(val)} style={{
            padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
            whiteSpace: 'nowrap', border: 'none', cursor: 'pointer', textTransform: 'capitalize',
            background: active ? 'var(--accent)' : 'var(--bg-card)',
            color: active ? '#fff' : 'var(--text-secondary)',
          }}>{label}</button>
        );
      })}
    </div>
  );
}

export default function ContentManager({ onBack }) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('Programs');

  // List + pagination state for the active tab.
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters (reset on tab change). `primary` = category / workout_type /
  // body-part group; `secondary` = exercise_type (Exercises tab only).
  const [status, setStatus] = useState('all');
  const [primary, setPrimary] = useState('all');
  const [secondary, setSecondary] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Filter option lists returned by the API.
  const [categories, setCategories] = useState([]); // program categories
  const [exTypes, setExTypes] = useState([]);        // exercise types
  const [programsForSelect, setProgramsForSelect] = useState([]); // workout form dropdown

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const headers = { Authorization: `Bearer ${token}` };

  // Lightweight program list for the workout edit form's Program dropdown.
  useEffect(() => {
    fetch('/api/content/programs?limit=200', { headers })
      .then(r => r.json())
      .then(d => setProgramsForSelect(d.programs || []))
      .catch(() => {});
  }, []);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = (offset) => {
    const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (status !== 'all') qs.set('status', status);
    if (debouncedSearch) qs.set('search', debouncedSearch);
    if (activeTab === 'Programs' && primary !== 'all') qs.set('category', primary);
    if (activeTab === 'Workouts' && primary !== 'all') qs.set('workout_type', primary);
    if (activeTab === 'Exercises') {
      if (primary !== 'all') qs.set('body_part', primary);
      if (secondary !== 'all') qs.set('exercise_type', secondary);
    }
    return qs.toString();
  };

  const load = async (reset) => {
    const key = activeTab.toLowerCase();
    const offset = reset ? 0 : items.length;
    setLoading(true);
    try {
      const r = await fetch(`/api/content/${key}?${buildQuery(offset)}`, { headers });
      const d = await r.json();
      const list = d[key] || [];
      setItems(reset ? list : prev => [...prev, ...list]);
      setTotal(d.total ?? list.length);
      if (activeTab === 'Programs' && d.categories) setCategories(d.categories);
      if (activeTab === 'Exercises' && d.types) setExTypes(d.types);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  // (Re)load page 0 whenever the tab or any filter changes.
  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [activeTab, status, primary, secondary, debouncedSearch]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setStatus('all'); setPrimary('all'); setSecondary('all');
    setSearch(''); setDebouncedSearch('');
    setItems([]); setTotal(0);
  };

  const save = async () => {
    const endpoint = `/api/content/${activeTab.toLowerCase()}`;
    const method = editing === 'new' ? 'POST' : 'PUT';
    const url = editing === 'new' ? endpoint : `${endpoint}/${form.id}`;
    await fetch(url, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setEditing(null);
    setForm({});
    load(true);
  };

  const deleteItem = async (type, id) => {
    if (!(await modal.confirm('Delete this item?'))) return;
    await fetch(`/api/content/${type}/${id}`, { method: 'DELETE', headers });
    load(true);
  };

  // Publish/unpublish toggle - optimistic local update.
  const toggleStatus = async (item) => {
    const next = item.status === 'published' ? 'draft' : 'published';
    const key = activeTab.toLowerCase();
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: next } : i));
    try {
      await fetch(`/api/content/${key}/${item.id}/status`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
    } catch (err) {
      console.error(err);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status } : i)); // revert
    }
  };

  // ── Edit / create form ────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="page-content" style={{ paddingBottom: 120 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => { setEditing(null); setForm({}); }} style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>{editing === 'new' ? 'Create' : 'Edit'} {activeTab.slice(0, -1)}</h1>
        </div>

        {/* Status selector - shared by all three types */}
        <div className="input-group">
          <label>Status</label>
          <select className="input-field" value={form.status || 'draft'} onChange={e => setForm({ ...form, status: e.target.value })}>
            <option value="draft">Draft (hidden from clients)</option>
            <option value="published">Published (live)</option>
          </select>
        </div>

        {activeTab === 'Programs' && (
          <>
            <ImageUpload value={form.image_url} onChange={v => setForm({ ...form, image_url: v })} label="Program Image" />
            <div className="input-group"><label>Title</label><input className="input-field" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. AMS Ground Zero" /></div>
            <div className="input-group"><label>Category</label><input className="input-field" value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Pickleball, AMS, Advanced" list="program-categories" /><datalist id="program-categories">{categories.map(c => <option key={c} value={c} />)}</datalist></div>
            <div className="input-group"><label>Description</label><textarea className="input-field" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Program description..." style={{ minHeight: 80, resize: 'vertical' }} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="input-group" style={{ flex: 1 }}><label>Weeks</label><input type="number" className="input-field" value={form.duration_weeks || ''} onChange={e => setForm({ ...form, duration_weeks: parseInt(e.target.value) })} /></div>
              <div className="input-group" style={{ flex: 1 }}><label>Workouts/Week</label><input type="number" className="input-field" value={form.workouts_per_week || ''} onChange={e => setForm({ ...form, workouts_per_week: parseInt(e.target.value) })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="input-group" style={{ flex: 1 }}><label>Min Duration</label><input className="input-field" value={form.min_duration || ''} onChange={e => setForm({ ...form, min_duration: e.target.value })} placeholder="13 mins" /></div>
              <div className="input-group" style={{ flex: 1 }}><label>Max Duration</label><input className="input-field" value={form.max_duration || ''} onChange={e => setForm({ ...form, max_duration: e.target.value })} placeholder="28 mins" /></div>
            </div>
          </>
        )}

        {activeTab === 'Workouts' && (
          <>
            <ImageUpload value={form.image_url} onChange={v => setForm({ ...form, image_url: v })} label="Workout Image" />
            <div className="input-group"><label>Title</label><input className="input-field" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Chest/Biceps/Hips" /></div>
            <div className="input-group">
              <label>Program</label>
              <select className="input-field" value={form.program_id || ''} onChange={e => setForm({ ...form, program_id: parseInt(e.target.value) })}>
                <option value="">None</option>
                {programsForSelect.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div className="input-group"><label>Description</label><textarea className="input-field" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} style={{ minHeight: 60, resize: 'vertical' }} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="input-group" style={{ flex: 1 }}><label>Week</label><input type="number" className="input-field" value={form.week_number || ''} onChange={e => setForm({ ...form, week_number: parseInt(e.target.value) })} /></div>
              <div className="input-group" style={{ flex: 1 }}><label>Day</label><input type="number" className="input-field" value={form.day_number || ''} onChange={e => setForm({ ...form, day_number: parseInt(e.target.value) })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="input-group" style={{ flex: 1 }}><label>Duration (mins)</label><input type="number" className="input-field" value={form.duration_mins || ''} onChange={e => setForm({ ...form, duration_mins: parseInt(e.target.value) })} /></div>
              <div className="input-group" style={{ flex: 1 }}>
                <label>Intensity</label>
                <select className="input-field" value={form.intensity || 'Medium'} onChange={e => setForm({ ...form, intensity: e.target.value })}>
                  {['Low', 'Medium', 'High'].map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>
            <div className="input-group"><label>Body Parts</label><input className="input-field" value={form.body_parts || ''} onChange={e => setForm({ ...form, body_parts: e.target.value })} placeholder="e.g. Upper Body, Core" /></div>
            <div className="input-group"><label>Equipment</label><input className="input-field" value={form.equipment || ''} onChange={e => setForm({ ...form, equipment: e.target.value })} placeholder="e.g. Dumbbell, Cable Station" /></div>
            <div className="input-group">
              <label>Type</label>
              <select className="input-field" value={form.workout_type || 'strength'} onChange={e => setForm({ ...form, workout_type: e.target.value })}>
                {WORKOUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </>
        )}

        {activeTab === 'Exercises' && (
          <>
            <ImageUpload value={form.thumbnail_url} onChange={v => setForm({ ...form, thumbnail_url: v })} label="Thumbnail" />
            <div className="input-group"><label>Name</label><input className="input-field" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Bench Press - Dumbbells" /></div>
            <div className="input-group"><label>Description</label><textarea className="input-field" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} style={{ minHeight: 60, resize: 'vertical' }} /></div>
            <div className="input-group"><label>Demo Video URL</label><input className="input-field" value={form.demo_video_url || ''} onChange={e => setForm({ ...form, demo_video_url: e.target.value })} placeholder="https://..." /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="input-group" style={{ flex: 1 }}><label>Body Part</label><input className="input-field" value={form.body_part || ''} onChange={e => setForm({ ...form, body_part: e.target.value })} /></div>
              <div className="input-group" style={{ flex: 1 }}><label>Equipment</label><input className="input-field" value={form.equipment || ''} onChange={e => setForm({ ...form, equipment: e.target.value })} /></div>
            </div>
          </>
        )}

        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 480, width: 'calc(100% - 32px)', padding: '12px 0',
          background: 'linear-gradient(to top, var(--bg-primary) 70%, transparent)',
        }}>
          <button className="btn-primary" onClick={save}>Save {activeTab.slice(0, -1)}</button>
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────
  const hasMore = items.length < total;
  // Secondary chip set for the active tab (the "sub-category").
  const primaryOptions =
    activeTab === 'Programs' ? ['all', ...categories]
    : activeTab === 'Workouts' ? ['all', ...WORKOUT_TYPES]
    : ['all', ...BODY_PART_GROUPS];

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>Content Manager</h1>
        <button onClick={() => { setEditing('new'); setForm({ status: 'draft' }); }} style={{
          background: 'var(--accent)', border: 'none', borderRadius: 20,
          padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#fff',
        }}>+ New</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'var(--bg-card)', borderRadius: 50, padding: 4, marginBottom: 14 }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => switchTab(tab)} style={{
            flex: 1, padding: '10px 0', borderRadius: 50, fontSize: 13, fontWeight: 600,
            background: activeTab === tab ? 'rgba(61,255,210,0.15)' : 'transparent',
            color: activeTab === tab ? 'var(--accent-mint)' : 'var(--text-secondary)',
            border: 'none',
          }}>{tab}</button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={`Search ${activeTab.toLowerCase()}...`}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--divider)',
          background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', marginBottom: 10,
        }}
      />

      {/* Status filter */}
      <Chips options={STATUS_OPTIONS} value={status} onChange={setStatus} />
      {/* Sub-category filter (category / type / body part) */}
      {primaryOptions.length > 1 && <Chips options={primaryOptions} value={primary} onChange={setPrimary} />}
      {/* Exercises get a second row: type */}
      {activeTab === 'Exercises' && exTypes.length > 0 && (
        <Chips options={['all', ...exTypes]} value={secondary} onChange={setSecondary} />
      )}

      {/* Count */}
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 10px' }}>
        {hasMore ? `Showing ${items.length} of ${total}` : `${total} ${activeTab.toLowerCase()}`}
      </p>

      {/* Items */}
      {items.length === 0 && !loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>No {activeTab.toLowerCase()} match</p>
          <button onClick={() => { setEditing('new'); setForm({ status: 'draft' }); }} style={{
            background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14, fontWeight: 600,
          }}>Create a {activeTab.slice(0, -1).toLowerCase()}</button>
        </div>
      ) : (
        <>
          {items.map(item => {
            const published = item.status === 'published';
            return (
              <div key={item.id} className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
                  background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {(item.image_url || item.thumbnail_url) ? (
                    <img src={item.image_url || item.thumbnail_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 22, opacity: 0.3 }}>
                      {activeTab === 'Programs' ? '📚' : activeTab === 'Workouts' ? '🏋️' : '💪'}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title || item.name}
                    </p>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeTab === 'Programs' ? `${item.category ? item.category + ' · ' : ''}${item.duration_weeks} wks · ${item.workouts_per_week}/wk` :
                     activeTab === 'Workouts' ? `${item.program_title ? item.program_title + ' · ' : ''}${item.duration_mins || '?'} mins` :
                     `${item.body_part || 'No body part'} · ${item.exercise_type || ''}`}
                  </p>
                </div>
                {/* Status pill - tap to toggle publish/draft */}
                <button onClick={() => toggleStatus(item)} title={published ? 'Tap to unpublish' : 'Tap to publish'} style={{
                  flexShrink: 0, padding: '4px 10px', borderRadius: 14, border: 'none', cursor: 'pointer',
                  fontSize: 10, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase',
                  background: published ? 'rgba(52,199,89,0.15)' : 'rgba(255,159,10,0.15)',
                  color: published ? '#34C759' : '#FF9F0A',
                }}>{published ? 'Live' : 'Draft'}</button>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => { setEditing(item.id); setForm(item); }} style={{
                    width: 32, height: 32, borderRadius: 8, background: 'rgba(61,255,210,0.1)', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button onClick={() => deleteItem(activeTab.toLowerCase(), item.id)} style={{
                    width: 32, height: 32, borderRadius: 8, background: 'rgba(255,69,58,0.1)', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}

          {loading && <p style={{ textAlign: 'center', padding: 16, color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</p>}

          {hasMore && !loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 4px' }}>
              <button onClick={() => load(false)} style={{
                padding: '10px 22px', borderRadius: 20, border: '1px solid var(--divider)',
                background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>Load more ({total - items.length} left)</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
