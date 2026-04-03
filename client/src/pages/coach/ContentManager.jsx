import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

const tabs = ['Programs', 'Workouts', 'Exercises'];

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

export default function ContentManager({ onBack }) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('Programs');
  const [programs, setPrograms] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    const headers = { Authorization: `Bearer ${token}` };
    const [p, w, e] = await Promise.all([
      fetch('/api/content/programs', { headers }).then(r => r.json()),
      fetch('/api/content/workouts', { headers }).then(r => r.json()),
      fetch('/api/content/exercises', { headers }).then(r => r.json()),
    ]);
    setPrograms(p.programs || []);
    setWorkouts(w.workouts || []);
    setExercises(e.exercises || []);
  };

  const save = async () => {
    const type = activeTab.toLowerCase().slice(0, -1); // program, workout, exercise
    const endpoint = `/api/content/${activeTab.toLowerCase()}`;
    const method = editing === 'new' ? 'POST' : 'PUT';
    const url = editing === 'new' ? endpoint : `${endpoint}/${form.id}`;

    await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setEditing(null);
    setForm({});
    fetchAll();
  };

  const deleteItem = async (type, id) => {
    if (!confirm('Delete this item?')) return;
    await fetch(`/api/content/${type}/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchAll();
  };

  // Edit form
  if (editing) {
    return (
      <div className="page-content" style={{ paddingBottom: 120 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => { setEditing(null); setForm({}); }} style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-mint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>{editing === 'new' ? 'Create' : 'Edit'} {activeTab.slice(0, -1)}</h1>
        </div>

        {activeTab === 'Programs' && (
          <>
            <ImageUpload value={form.image_url} onChange={v => setForm({ ...form, image_url: v })} label="Program Image" />
            <div className="input-group"><label>Title</label><input className="input-field" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. AMS Ground Zero" /></div>
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
                {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
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
                {['strength', 'mobility', 'cardio', 'flexibility', 'rehab'].map(t => <option key={t} value={t}>{t}</option>)}
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
          background: 'linear-gradient(to top, #000 70%, transparent)',
        }}>
          <button className="btn-primary" onClick={save}>Save {activeTab.slice(0, -1)}</button>
        </div>
      </div>
    );
  }

  // List view
  const items = activeTab === 'Programs' ? programs : activeTab === 'Workouts' ? workouts : exercises;

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-mint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>Content Manager</h1>
        <button onClick={() => { setEditing('new'); setForm({}); }} style={{
          background: 'var(--accent-mint)', border: 'none', borderRadius: 20,
          padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#000',
        }}>+ New</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'var(--bg-card)', borderRadius: 50, padding: 4, marginBottom: 20 }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            flex: 1, padding: '10px 0', borderRadius: 50, fontSize: 13, fontWeight: 600,
            background: activeTab === tab ? 'rgba(61,255,210,0.15)' : 'transparent',
            color: activeTab === tab ? 'var(--accent-mint)' : 'var(--text-secondary)',
            border: 'none',
          }}>{tab}</button>
        ))}
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>No {activeTab.toLowerCase()} yet</p>
          <button onClick={() => { setEditing('new'); setForm({}); }} style={{
            background: 'none', border: 'none', color: 'var(--accent-mint)', fontSize: 14, fontWeight: 600,
          }}>Create your first {activeTab.slice(0, -1).toLowerCase()}</button>
        </div>
      ) : (
        items.map(item => (
          <div key={item.id} className="card-sm" style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4,
          }}>
            {/* Thumbnail */}
            <div style={{
              width: 52, height: 52, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
              background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {(item.image_url || item.thumbnail_url) ? (
                <img src={item.image_url || item.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 22, opacity: 0.3 }}>
                  {activeTab === 'Programs' ? '📚' : activeTab === 'Workouts' ? '🏋️' : '💪'}
                </span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.title || item.name}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {activeTab === 'Programs' ? `${item.duration_weeks} weeks · ${item.workouts_per_week} workouts/wk` :
                 activeTab === 'Workouts' ? `${item.duration_mins || '?'} mins · ${item.body_parts || 'No tags'}` :
                 `${item.body_part || 'No body part'} · ${item.equipment || 'No equipment'}`}
              </p>
            </div>
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
        ))
      )}
    </div>
  );
}
