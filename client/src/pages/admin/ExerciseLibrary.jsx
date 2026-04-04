import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import VimeoEmbed from '../../components/VimeoEmbed';
import ExerciseModal from './ExerciseModal';

export default function ExerciseLibrary() {
  const { token } = useAuth();
  const [exercises, setExercises] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);
  const [videoFilter, setVideoFilter] = useState('with_video');
  const [alternatives, setAlternatives] = useState([]);
  const [altSearch, setAltSearch] = useState('');
  const [showAltPanel, setShowAltPanel] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { fetchExercises(); }, []);

  const fetchExercises = async () => {
    const res = await fetch('/api/content/exercises', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const data = await res.json(); setExercises(data.exercises); }
  };

  const fetchAlternatives = async (exId) => {
    const res = await fetch(`/api/content/exercises/${exId}/alternatives`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const data = await res.json(); setAlternatives(data.alternatives); }
  };

  const addAlternative = async (altId) => {
    if (!selected) return;
    await fetch(`/api/content/exercises/${selected.id}/alternatives`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ alternative_id: altId }),
    });
    fetchAlternatives(selected.id);
    setAltSearch('');
  };

  const moveAlternative = (index, direction) => {
    const newAlts = [...alternatives];
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= newAlts.length) return;
    [newAlts[index], newAlts[newIdx]] = [newAlts[newIdx], newAlts[index]];
    setAlternatives(newAlts);
  };

  const removeAlternative = async (altId) => {
    if (!selected) return;
    await fetch(`/api/content/exercises/${selected.id}/alternatives/${altId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    fetchAlternatives(selected.id);
  };

  const filtered = exercises.filter(ex => {
    const matchesSearch = !search || ex.name.toLowerCase().includes(search.toLowerCase()) || (ex.body_part || '').toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'All' || (ex.body_part || '').toLowerCase().includes(filterType.toLowerCase());
    const matchesVideo = videoFilter === 'all' || (videoFilter === 'with_video' ? ex.demo_video_url : !ex.demo_video_url);
    return matchesSearch && matchesType && matchesVideo;
  });

  const noVideoCount = exercises.filter(e => !e.demo_video_url).length;
  const withVideoCount = exercises.filter(e => e.demo_video_url).length;

  const bodyParts = ['All', ...new Set(exercises.map(e => e.body_part).filter(Boolean).flatMap(bp => bp.split(',').map(b => b.trim())).filter(Boolean))].slice(0, 20);

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
    await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setEditing(false); setForm({}); setSelected(null); fetchExercises();
  };

  const deleteExercise = async (id) => {
    if (!confirm('Delete this exercise?')) return;
    await fetch(`/api/content/exercises/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setSelected(null); fetchExercises();
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* LEFT: Exercise List */}
      <div style={{ width: 420, flexShrink: 0, borderRight: '1px solid var(--divider)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>Exercises ({exercises.length})</h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{exercises.filter(e => e.demo_video_url).length} with video</p>
            </div>
            <button onClick={() => setEditing('new')} style={{
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '50%',
              width: 40, height: 40, fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>+</button>
          </div>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search exercises..." className="input-field" style={{ paddingLeft: 36, fontSize: 14 }} />
          </div>
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { id: 'with_video', label: `Video (${withVideoCount})` },
                { id: 'no_video', label: `No Video (${noVideoCount})` },
                { id: 'all', label: 'All' },
              ].map(f => (
                <button key={f.id} onClick={() => setVideoFilter(f.id)} style={{
                  padding: '4px 8px', borderRadius: 14, border: 'none', fontSize: 10, fontWeight: 600,
                  background: videoFilter === f.id ? (f.id === 'no_video' ? 'var(--error)' : 'var(--accent)') : 'var(--bg-card)',
                  color: videoFilter === f.id ? '#fff' : 'var(--text-secondary)', cursor: 'pointer',
                }}>{f.label}</button>
              ))}
            </div>
            <button onClick={() => setShowFilters(!showFilters)} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 14, border: '1px solid var(--divider)',
              background: showFilters || filterType !== 'All' ? 'rgba(255,140,0,0.1)' : 'transparent',
              color: filterType !== 'All' ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              {filterType !== 'All' ? filterType : 'Filter'}
            </button>
          </div>
          {/* Expandable body part filters */}
          {showFilters && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12, padding: 8, background: 'var(--bg-card)', borderRadius: 8 }}>
              {bodyParts.map(bp => (
                <button key={bp} onClick={() => { setFilterType(bp); if (bp !== 'All') setShowFilters(false); }} style={{
                  padding: '4px 10px', borderRadius: 14, border: 'none', fontSize: 11, fontWeight: 600,
                  background: filterType === bp ? 'var(--accent)' : 'transparent', color: filterType === bp ? '#fff' : 'var(--text-secondary)', cursor: 'pointer',
                }}>{bp}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
          {filtered.slice(0, 100).map(ex => (
            <div key={ex.id} onClick={() => { setSelected(ex); setEditing(false); setForm(ex); fetchAlternatives(ex.id); setShowAltPanel(false); }} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', marginBottom: 2,
              background: selected?.id === ex.id ? 'rgba(255,140,0,0.1)' : 'transparent',
              border: selected?.id === ex.id ? '1px solid var(--accent)' : '1px solid transparent',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid var(--divider)', position: 'relative',
              }}>
                {ex.thumbnail_url ? <img src={ex.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 18, opacity: 0.3 }}>💪</span>}
                {ex.demo_video_url && (
                  <div style={{ position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21"/></svg>
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.name}</p>
                {ex.body_part && <p style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 500 }}>{ex.body_part?.split(',')[0]?.trim()}</p>}
              </div>
              {ex.description && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
            </div>
          ))}
          {filtered.length > 100 && <p style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>Showing 100 of {filtered.length}</p>}
        </div>
      </div>

      {/* RIGHT: Detail Panel */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!selected && !editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ marginBottom: 16, opacity: 0.3 }}><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Select an Exercise to View</h3>
            <p style={{ fontSize: 13 }}>Click an exercise from the list to view details</p>
          </div>
        ) : (
          <div style={{ padding: '24px 40px', maxWidth: 800 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 20 }}>
              {!editing && selected && (
                <>
                  <button onClick={() => setEditing(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => deleteExercise(selected.id)} style={{ background: 'rgba(255,69,58,0.1)', color: 'var(--error)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                </>
              )}
              {editing && (
                <>
                  <button onClick={save} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => { setEditing(false); if (!selected) { setForm({}); } }} style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                </>
              )}
            </div>

            {editing ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Reference Name *</label><input className="input-field" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} style={{ fontSize: 15, fontWeight: 600 }} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Display Name</label><input className="input-field" value={form.display_name || ''} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Same as reference name if blank" /></div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Type</label>
                  <select className="input-field" value={form.exercise_type || ''} onChange={e => setForm({ ...form, exercise_type: e.target.value })}>
                    <option value="">None</option>
                    {['Strength', 'Mobility', 'Bodyweight', 'Stretching', 'TRX', 'Conditioning', 'Prehab', 'Cardio'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Tracking Fields</label>
                    <select className="input-field" value={form.tracking_fields || ''} onChange={e => setForm({ ...form, tracking_fields: e.target.value })}>
                      {['Repetitions with Weight', 'Repetitions', 'Duration', 'Distance'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Per Side</label>
                    <select className="input-field" value={form.per_side || 'None'} onChange={e => setForm({ ...form, per_side: e.target.value })}>
                      {['None', 'Per Side', 'Per Arm', 'Per Leg'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div><label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Equipment</label><input className="input-field" value={form.equipment || ''} onChange={e => setForm({ ...form, equipment: e.target.value })} placeholder="Add equipment..." /></div>
                <div><label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Muscle Groups</label><input className="input-field" value={form.body_part || ''} onChange={e => setForm({ ...form, body_part: e.target.value })} placeholder="Add muscle groups..." /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Target Area</label><input className="input-field" value={form.target_area || ''} onChange={e => setForm({ ...form, target_area: e.target.value })} placeholder="e.g. Upper Body, Lower Body, Full Body" /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Description</label><textarea className="input-field" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} style={{ minHeight: 80, resize: 'vertical' }} /></div>

                {/* Media */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Media</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 14, background: 'var(--accent)', color: '#fff', fontWeight: 600 }}>Vimeo</span>
                  </div>
                  <input className="input-field" value={form.demo_video_url || ''} onChange={e => setForm({ ...form, demo_video_url: e.target.value })} placeholder="https://vimeo.com/..." style={{ marginBottom: 8 }} />
                  {form.demo_video_url && <VimeoEmbed url={form.demo_video_url} height={250} />}
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Thumbnail</label>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {form.thumbnail_url && <img src={form.thumbnail_url} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />}
                    <label style={{ padding: '8px 16px', background: 'var(--bg-card)', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--accent)', border: '1px solid var(--divider)' }}>
                      {uploading ? 'Uploading...' : 'Upload Thumbnail'}<input type="file" accept="image/*" onChange={handleUploadThumb} style={{ display: 'none' }} />
                    </label>
                    {form.thumbnail_url && <button onClick={() => setForm({ ...form, thumbnail_url: null })} style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: 11, cursor: 'pointer' }}>Remove</button>}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Header with thumbnail + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-card)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selected?.thumbnail_url ? <img src={selected.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 28, opacity: 0.3 }}>💪</span>}
                  </div>
                  <div>
                    <h2 style={{ fontSize: 22, fontWeight: 800 }}>{selected?.name}</h2>
                    {selected?.display_name && selected.display_name !== selected.name && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{selected.display_name}</p>}
                  </div>
                </div>

                {/* Meta grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 12 }}>
                    <p style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>EXERCISE TYPE</p>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{selected?.exercise_type || 'Not specified'}</p>
                  </div>
                  <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 12 }}>
                    <p style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>TRACKING FIELDS</p>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{selected?.tracking_fields || 'Repetitions with Weight'}</p>
                  </div>
                  <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 12 }}>
                    <p style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>MUSCLE GROUPS</p>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {selected?.body_part ? selected.body_part.split(',').map(bp => (
                        <span key={bp} style={{ fontSize: 12, background: 'rgba(255,140,0,0.1)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>{bp.trim()}</span>
                      )) : <span style={{ fontSize: 13 }}>Not specified</span>}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 12 }}>
                    <p style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>TARGET AREA</p>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{selected?.target_area || 'Not specified'}</p>
                  </div>
                  <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 12 }}>
                    <p style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>EQUIPMENT</p>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{selected?.equipment || 'Bodyweight'}</p>
                  </div>
                  <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 12 }}>
                    <p style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>PER SIDE</p>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{selected?.per_side || 'None'}</p>
                  </div>
                </div>

                {/* Video */}
                {selected?.demo_video_url && <div style={{ marginBottom: 20 }}><VimeoEmbed url={selected.demo_video_url} height={320} style={{ borderRadius: 12 }} /></div>}

                {/* How to Perform */}
                {selected?.description && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 700 }}>How to Perform</h4>
                      <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line', color: 'var(--text-secondary)' }}>{selected.description}</p>
                  </div>
                )}

                {/* Alternatives */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>ALTERNATIVES ({alternatives.length})</h4>
                    <button onClick={() => setShowAltPanel(!showAltPanel)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      + Add
                    </button>
                  </div>

                  {showAltPanel && (
                    <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 12, marginBottom: 12, border: '1px solid var(--accent)' }}>
                      <input value={altSearch} onChange={e => setAltSearch(e.target.value)} placeholder="Search exercises to add as alternative..." className="input-field" style={{ fontSize: 13, marginBottom: 8 }} autoFocus />
                      <div style={{ maxHeight: 200, overflow: 'auto' }}>
                        {exercises.filter(e => e.id !== selected?.id && e.demo_video_url && altSearch && e.name.toLowerCase().includes(altSearch.toLowerCase())).slice(0, 15).map(ex => (
                          <div key={ex.id} onClick={() => addAlternative(ex.id)} style={{ padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,140,0,0.08)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {ex.thumbnail_url ? <img src={ex.thumbnail_url} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} /> : <span style={{ fontSize: 14, opacity: 0.3 }}>💪</span>}
                            <span>{ex.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Grid layout like FitBudd */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                    {alternatives.map((alt, ai) => (
                      <div key={alt.id} style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, position: 'relative', textAlign: 'center' }}>
                        <button onClick={() => removeAlternative(alt.alternative_id)} style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: 12, opacity: 0.6 }}>×</button>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', margin: '0 auto 6px', overflow: 'hidden', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {alt.thumbnail_url ? <img src={alt.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 18, opacity: 0.3 }}>💪</span>}
                        </div>
                        <p style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alt.name}</p>
                        {/* Reorder */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 4 }}>
                          <button onClick={() => moveAlternative(ai, -1)} disabled={ai === 0} style={{ background: 'none', border: 'none', cursor: ai === 0 ? 'default' : 'pointer', opacity: ai === 0 ? 0.2 : 0.6, padding: 0 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                          </button>
                          <button onClick={() => moveAlternative(ai, 1)} disabled={ai === alternatives.length - 1} style={{ background: 'none', border: 'none', cursor: ai === alternatives.length - 1 ? 'default' : 'pointer', opacity: ai === alternatives.length - 1 ? 0.2 : 0.6, padding: 0 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {alternatives.length === 0 && !showAltPanel && (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: 12 }}>No alternatives linked yet</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Exercise Modal */}
      {editing && (
        <ExerciseModal
          exercise={editing === 'new' ? null : (selected || null)}
          onClose={() => { setEditing(false); }}
          onSaved={() => { setEditing(false); fetchExercises(); setSelected(null); }}
        />
      )}
    </div>
  );
}
