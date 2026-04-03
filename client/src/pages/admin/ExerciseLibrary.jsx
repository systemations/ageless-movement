import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import VimeoEmbed from '../../components/VimeoEmbed';

export default function ExerciseLibrary() {
  const { token } = useAuth();
  const [exercises, setExercises] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => { fetchExercises(); }, []);

  const fetchExercises = async () => {
    const res = await fetch('/api/content/exercises', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const data = await res.json(); setExercises(data.exercises); }
  };

  const filtered = exercises.filter(ex => {
    const matchesSearch = !search || ex.name.toLowerCase().includes(search.toLowerCase()) || (ex.body_part || '').toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'All' || (ex.body_part || '').toLowerCase().includes(filterType.toLowerCase());
    return matchesSearch && matchesType;
  });

  const bodyParts = ['All', ...new Set(exercises.map(e => e.body_part).filter(Boolean).flatMap(bp => bp.split(',').map(b => b.trim())).filter(Boolean))].slice(0, 15);

  const handleUploadThumb = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    if (res.ok) { const data = await res.json(); setForm({ ...form, thumbnail_url: data.url }); }
    setUploading(false);
  };

  const save = async () => {
    const method = editing === 'new' ? 'POST' : 'PUT';
    const url = editing === 'new' ? '/api/content/exercises' : `/api/content/exercises/${form.id}`;
    await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setEditing(null);
    setForm({});
    fetchExercises();
  };

  // Edit view
  if (editing) {
    return (
      <div style={{ padding: '24px 40px', maxWidth: 900 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => { setEditing(null); setForm({}); }} style={{
            background: 'var(--bg-card)', border: 'none', borderRadius: 8, padding: '8px 16px',
            color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
          }}>← Back</button>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{editing === 'new' ? 'New Exercise' : 'Edit Exercise'}</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Exercise Name</label>
            <input className="input-field" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Bench Press - Dumbbells" style={{ fontSize: 16 }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Body Part / Muscle Groups</label>
            <input className="input-field" value={form.body_part || ''} onChange={e => setForm({ ...form, body_part: e.target.value })} placeholder="e.g. Chest, Triceps" />
          </div>
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Equipment</label>
            <input className="input-field" value={form.equipment || ''} onChange={e => setForm({ ...form, equipment: e.target.value })} placeholder="e.g. Dumbbell, Barbell" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Description & Instructions</label>
            <textarea className="input-field" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} style={{ minHeight: 100, resize: 'vertical' }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Demo Video URL</label>
            <input className="input-field" value={form.demo_video_url || ''} onChange={e => setForm({ ...form, demo_video_url: e.target.value })} placeholder="https://vimeo.com/..." style={{ marginBottom: 8 }} />
            {form.demo_video_url && <VimeoEmbed url={form.demo_video_url} height={280} />}
          </div>
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Thumbnail</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {form.thumbnail_url && <img src={form.thumbnail_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />}
              <label style={{
                padding: '8px 16px', background: 'var(--bg-card)', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, color: 'var(--accent)', border: '1px solid var(--divider)',
              }}>
                {uploading ? 'Uploading...' : 'Upload Image'}
                <input type="file" accept="image/*" onChange={handleUploadThumb} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button onClick={save} style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
            padding: '12px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>Save Exercise</button>
          <button onClick={() => { setEditing(null); setForm({}); }} style={{
            background: 'var(--bg-card)', color: 'var(--text-secondary)', border: 'none', borderRadius: 10,
            padding: '12px 24px', fontSize: 14, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Exercise Library</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{exercises.length} exercises · {exercises.filter(e => e.demo_video_url).length} with video</p>
        </div>
        <button onClick={() => { setEditing('new'); setForm({}); }} style={{
          background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
          padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}>+ New Exercise</button>
      </div>

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 300px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search exercises..."
            className="input-field" style={{ paddingLeft: 36, fontSize: 14 }}
          />
        </div>
      </div>

      {/* Body part filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {bodyParts.map(bp => (
          <button key={bp} onClick={() => setFilterType(bp)} style={{
            padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600,
            background: filterType === bp ? 'var(--accent-mint)' : 'var(--bg-card)',
            color: filterType === bp ? '#000' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}>{bp}</button>
        ))}
      </div>

      {/* Results count */}
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>{filtered.length} exercises</p>

      {/* Exercise table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Header row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '48px 1fr 220px 160px 80px',
          padding: '10px 16px', borderBottom: '1px solid var(--divider)',
          fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          <span></span>
          <span>Exercise</span>
          <span>Muscle Groups</span>
          <span>Equipment</span>
          <span>Video</span>
        </div>

        {/* Rows */}
        {filtered.slice(0, 50).map(ex => (
          <div key={ex.id} onClick={() => { setEditing(ex.id); setForm(ex); }} style={{
            display: 'grid', gridTemplateColumns: '48px 1fr 220px 160px 80px',
            padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)',
            cursor: 'pointer', alignItems: 'center',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 8, overflow: 'hidden',
              background: '#2C2C2E', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {ex.thumbnail_url ? (
                <img src={ex.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 14, opacity: 0.3 }}>💪</span>
              )}
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600 }}>{ex.name}</p>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ex.body_part || '—'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ex.equipment || 'Bodyweight'}</p>
            <div>
              {ex.demo_video_url ? (
                <span style={{ fontSize: 10, background: 'rgba(48,209,88,0.15)', color: 'var(--success)', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>✓ Video</span>
              ) : (
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>—</span>
              )}
            </div>
          </div>
        ))}

        {filtered.length > 50 && (
          <p style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
            Showing 50 of {filtered.length} — use search to narrow down
          </p>
        )}
      </div>
    </div>
  );
}
