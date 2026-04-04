import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import VimeoEmbed from '../../components/VimeoEmbed';

const BODY_PARTS = [
  'Shoulders', 'Front Delts', 'Rear Delts', 'Lateral Delts', 'Back', 'Traps', 'Lats',
  'Lower Back', 'Chest', 'Triceps', 'Biceps', 'Forearms', 'Adductors', 'Abductors',
  'Glutes', 'Hamstrings', 'Quads', 'Calves', 'Abs', 'Obliques', 'Hip Flexors',
  'Erector Spinae', 'Rhomboids', 'Tibialis Anterior', 'Core', 'Full Body',
];

const EXERCISE_TYPES = ['Sets & Reps', 'Reps', 'Distance', 'Kcal', 'Time'];
const PER_SIDE_OPTIONS = ['None', 'Per Side', 'Per Arm', 'Per Leg'];

export default function ExerciseModal({ exercise, onClose, onSaved }) {
  const { token } = useAuth();
  const isNew = !exercise?.id;

  const [form, setForm] = useState({
    name: exercise?.name || '',
    display_name: exercise?.display_name || '',
    exercise_type: exercise?.exercise_type || 'Strength',
    tracking_fields: exercise?.tracking_fields || 'Sets & Reps',
    body_part: exercise?.body_part || '',
    target_area: exercise?.target_area || '',
    equipment: exercise?.equipment || '',
    per_side: exercise?.per_side || 'None',
    description: exercise?.description || '',
    demo_video_url: exercise?.demo_video_url || '',
    thumbnail_url: exercise?.thumbnail_url || '',
    tags: '',
    default_sets: '',
    default_reps: '',
    rest_min: 0,
    rest_sec: 0,
    rir: '',
    rpe: '',
    intensity: '',
    tempo: '',
    notes: '',
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showBodyPartDropdown, setShowBodyPartDropdown] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [altSearch, setAltSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedBodyParts = form.body_part ? form.body_part.split(',').map(b => b.trim()).filter(Boolean) : [];

  const toggleBodyPart = (bp) => {
    const current = selectedBodyParts;
    const updated = current.includes(bp) ? current.filter(b => b !== bp) : [...current, bp];
    setForm({ ...form, body_part: updated.join(', ') });
  };

  const handleUpload = async (e, field) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (res.ok) { const data = await res.json(); setForm({ ...form, [field]: data.url }); }
    } catch (err) { console.error(err); }
    setUploading(false);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew ? '/api/content/exercises' : `/api/content/exercises/${exercise.id}`;
    await fetch(url, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    onSaved?.();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-primary)', borderRadius: 16, width: '100%', maxWidth: 640,
        maxHeight: '90vh', overflow: 'auto', padding: '24px 28px',
        border: '1px solid var(--divider)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>{isNew ? 'Create a new exercise' : 'Edit exercise'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        {/* Name + Type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Exercise Name *</label>
            <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Enter Exercise Name" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Type of Exercise *</label>
            <select className="input-field" value={form.tracking_fields} onChange={e => setForm({ ...form, tracking_fields: e.target.value })}>
              {EXERCISE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Body Part + Volume */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
          <div style={{ position: 'relative' }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Body Part</label>
            <div
              onClick={() => setShowBodyPartDropdown(!showBodyPartDropdown)}
              className="input-field"
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }}
            >
              <span style={{ color: selectedBodyParts.length ? 'var(--text-primary)' : 'var(--text-tertiary)', fontSize: 13 }}>
                {selectedBodyParts.length ? selectedBodyParts.join(', ') : 'What body part is this?'}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            {showBodyPartDropdown && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)',
                border: '1px solid var(--divider)', borderRadius: 8, maxHeight: 200, overflow: 'auto', zIndex: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              }}>
                {BODY_PARTS.map(bp => (
                  <div key={bp} onClick={() => toggleBodyPart(bp)} style={{
                    padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: selectedBodyParts.includes(bp) ? 'rgba(255,140,0,0.1)' : 'transparent',
                  }}
                    onMouseEnter={e => { if (!selectedBodyParts.includes(bp)) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={e => { if (!selectedBodyParts.includes(bp)) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, border: selectedBodyParts.includes(bp) ? 'none' : '2px solid var(--text-tertiary)',
                      background: selectedBodyParts.includes(bp) ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selectedBodyParts.includes(bp) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    {bp}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Per Side</label>
            <select className="input-field" value={form.per_side} onChange={e => setForm({ ...form, per_side: e.target.value })}>
              {PER_SIDE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* + Another body part */}
        <button onClick={() => setShowBodyPartDropdown(true)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, marginBottom: 16, cursor: 'pointer' }}>
          + Another body part
        </button>

        {/* Equipment + Target Area */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Equipment</label>
            <input className="input-field" value={form.equipment} onChange={e => setForm({ ...form, equipment: e.target.value })} placeholder="Add Equipment..." />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Target Area</label>
            <input className="input-field" value={form.target_area} onChange={e => setForm({ ...form, target_area: e.target.value })} placeholder="e.g. Upper Body" />
          </div>
        </div>

        {/* Tags */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Tags</label>
          <input className="input-field" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="Push, Pull, Upper" />
        </div>

        {/* Media — Video + Photo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {/* Video */}
          <div>
            {form.demo_video_url ? (
              <div style={{ borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
                <VimeoEmbed url={form.demo_video_url} height={140} />
                <button onClick={() => setForm({ ...form, demo_video_url: '' })} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 24, height: 24, color: '#fff', cursor: 'pointer', fontSize: 14 }}>×</button>
              </div>
            ) : (
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                border: '2px dashed var(--divider)', borderRadius: 12, padding: 20, cursor: 'pointer', textAlign: 'center',
                minHeight: 140, background: 'var(--bg-card)',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" style={{ marginBottom: 8 }}>
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Drop Video Here</p>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>MP4, MOV · Max 500MB</p>
                <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Browse files</span>
                <input type="file" accept="video/*" onChange={e => handleUpload(e, 'demo_video_url')} style={{ display: 'none' }} />
              </label>
            )}
            {/* Video URL input */}
            <input className="input-field" value={form.demo_video_url} onChange={e => setForm({ ...form, demo_video_url: e.target.value })} placeholder="Paste Vimeo or YouTube URL..." style={{ marginTop: 8, fontSize: 12 }} />
          </div>

          {/* Photo */}
          <div>
            {form.thumbnail_url ? (
              <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
                <img src={form.thumbnail_url} alt="" style={{ width: '100%', height: 140, objectFit: 'cover' }} />
                <button onClick={() => setForm({ ...form, thumbnail_url: '' })} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 24, height: 24, color: '#fff', cursor: 'pointer', fontSize: 14 }}>×</button>
              </div>
            ) : (
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                border: '2px dashed var(--divider)', borderRadius: 12, padding: 20, cursor: 'pointer', textAlign: 'center',
                minHeight: 140, background: 'var(--bg-card)',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" style={{ marginBottom: 8 }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Drop Photo Here</p>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>JPG, PNG, HEIC</p>
                <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Browse files</span>
                <input type="file" accept="image/*" onChange={e => handleUpload(e, 'thumbnail_url')} style={{ display: 'none' }} />
              </label>
            )}
          </div>
        </div>

        {/* Dynamic fields based on exercise type */}
        {form.tracking_fields === 'Sets & Reps' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Sets *</label>
                <input type="number" className="input-field" value={form.default_sets} onChange={e => setForm({ ...form, default_sets: e.target.value })} placeholder="Enter Sets" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Reps *</label>
                <input className="input-field" value={form.default_reps} onChange={e => setForm({ ...form, default_reps: e.target.value })} placeholder="Enter Reps" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Rest Period</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" className="input-field" value={form.rest_min} onChange={e => setForm({ ...form, rest_min: parseInt(e.target.value) || 0 })} placeholder="0" style={{ width: 60 }} />
                  <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>Min</span>
                  <input type="number" className="input-field" value={form.rest_sec} onChange={e => setForm({ ...form, rest_sec: parseInt(e.target.value) || 0 })} placeholder="0" style={{ width: 60 }} />
                  <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>Sec</span>
                </div>
              </div>
            </div>
            {/* Advanced Settings */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: showAdvanced ? 12 : 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Advanced Settings</span>
              <button onClick={() => setShowAdvanced(!showAdvanced)} style={{
                width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative',
                background: showAdvanced ? 'var(--accent)' : 'var(--divider)', transition: 'background 0.2s',
              }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: showAdvanced ? 20 : 2, transition: 'left 0.2s' }} />
              </button>
            </div>
            {showAdvanced && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16, padding: 12, background: 'var(--bg-card)', borderRadius: 10 }}>
                <p style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>Note: You can enter either RIR or RPE</p>
                <div><label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>RIR</label><input className="input-field" value={form.rir} onChange={e => setForm({ ...form, rir: e.target.value })} placeholder="Enter RIR" style={{ fontSize: 13 }} /></div>
                <div><label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>RPE</label><input className="input-field" value={form.rpe} onChange={e => setForm({ ...form, rpe: e.target.value })} placeholder="Enter RPE" style={{ fontSize: 13 }} /></div>
                <div><label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Intensity</label><input className="input-field" value={form.intensity} onChange={e => setForm({ ...form, intensity: e.target.value })} placeholder="Enter Intensity" style={{ fontSize: 13 }} /></div>
                <div><label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Tempo</label><input className="input-field" value={form.tempo} onChange={e => setForm({ ...form, tempo: e.target.value })} placeholder="e.g. 3-1-2-1" style={{ fontSize: 13 }} /></div>
              </div>
            )}
          </>
        )}

        {form.tracking_fields === 'Reps' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Reps *</label>
              <input className="input-field" value={form.default_reps} onChange={e => setForm({ ...form, default_reps: e.target.value })} placeholder="Enter Reps" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>RPE</label>
              <input className="input-field" value={form.rpe} onChange={e => setForm({ ...form, rpe: e.target.value })} placeholder="Enter RPE" />
            </div>
          </div>
        )}

        {form.tracking_fields === 'Distance' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Distance *</label>
              <input className="input-field" value={form.default_reps} onChange={e => setForm({ ...form, default_reps: e.target.value })} placeholder="Enter Distance" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Distance Unit</label>
              <select className="input-field" value={form.distance_unit || 'Meters'} onChange={e => setForm({ ...form, distance_unit: e.target.value })}>
                {['Meters', 'Kilometers', 'Miles', 'Feet', 'Yards'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>RPE</label>
              <input className="input-field" value={form.rpe} onChange={e => setForm({ ...form, rpe: e.target.value })} placeholder="Enter RPE" />
            </div>
          </div>
        )}

        {form.tracking_fields === 'Kcal' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Kcal *</label>
            <input className="input-field" value={form.default_reps} onChange={e => setForm({ ...form, default_reps: e.target.value })} placeholder="Enter Calories" />
          </div>
        )}

        {form.tracking_fields === 'Time' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Time *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" className="input-field" value={form.rest_min} onChange={e => setForm({ ...form, rest_min: parseInt(e.target.value) || 0 })} placeholder="0" style={{ width: 60 }} />
                <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>Min</span>
                <input type="number" className="input-field" value={form.rest_sec} onChange={e => setForm({ ...form, rest_sec: parseInt(e.target.value) || 0 })} placeholder="0" style={{ width: 60 }} />
                <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>Sec</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Heart Rate</label>
                <input className="input-field" value={form.heart_rate || ''} onChange={e => setForm({ ...form, heart_rate: e.target.value })} placeholder="Enter Heart Rate" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Reps</label>
                <input className="input-field" value={form.default_reps} onChange={e => setForm({ ...form, default_reps: e.target.value })} placeholder="Enter Reps" />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>RPE</label>
              <input className="input-field" value={form.rpe} onChange={e => setForm({ ...form, rpe: e.target.value })} placeholder="Enter RPE" />
              <p style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4 }}>Allowed combinations: Time & Reps, Time & HR, or Time individually</p>
            </div>
          </>
        )}

        {/* Notes */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Notes</label>
          <textarea className="input-field" value={form.notes || form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Add notes..." style={{ minHeight: 60, resize: 'vertical' }} />
        </div>

        {/* Alternative Exercise button */}
        <button style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Alternative Exercise
        </button>

        {/* Save button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={save} disabled={!form.name.trim() || saving} style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            opacity: !form.name.trim() || saving ? 0.5 : 1,
          }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
