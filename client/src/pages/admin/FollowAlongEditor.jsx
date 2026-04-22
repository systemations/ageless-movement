import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../components/ImageUpload';

// Admin editor for follow-along video workouts.
// Simpler than WorkoutBuilder (which edits structured blocks + exercises).
// Follow-along workouts are just metadata + a single video URL:
//   - title, description
//   - video_url (Vimeo / YouTube)
//   - image_url (thumbnail poster shown on the client overview page)
//   - equipment (comma-separated list)
//   - body_parts (target areas)
//   - duration_mins, intensity
//   - optional program placement: program_id, week_number, day_number
export default function FollowAlongEditor({ workoutId, onBack, onSaved }) {
  const { token } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    video_url: '',
    image_url: '',
    equipment: '',
    body_parts: '',
    duration_mins: 15,
    intensity: 'Low',
    program_id: '',
    week_number: 1,
    day_number: 1,
  });
  const [loading, setLoading] = useState(!!workoutId);
  const [saving, setSaving] = useState(false);
  const isNew = !workoutId;

  useEffect(() => {
    fetch('/api/content/programs', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setPrograms(d.programs || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!workoutId) return;
    fetch(`/api/explore/workouts/${workoutId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.workout) {
          setForm({
            title: d.workout.title || '',
            description: d.workout.description || '',
            video_url: d.workout.video_url || '',
            image_url: d.workout.image_url || '',
            equipment: d.workout.equipment || '',
            body_parts: d.workout.body_parts || '',
            duration_mins: d.workout.duration_mins || 15,
            intensity: d.workout.intensity || 'Low',
            program_id: d.workout.program_id || '',
            week_number: d.workout.week_number || 1,
            day_number: d.workout.day_number || 1,
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [workoutId]);

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const save = async () => {
    if (!form.title) return;
    setSaving(true);
    const body = {
      title: form.title,
      description: form.description,
      video_url: form.video_url || null,
      image_url: form.image_url || null,
      equipment: form.equipment || null,
      body_parts: form.body_parts || null,
      duration_mins: Number(form.duration_mins) || 15,
      intensity: form.intensity || 'Low',
      workout_type: 'follow_along',
      program_id: form.program_id || null,
      week_number: form.program_id ? Number(form.week_number) || 1 : null,
      day_number: form.program_id ? Number(form.day_number) || 1 : null,
      phase_id: null,
    };
    try {
      const url = isNew ? '/api/content/workouts' : `/api/content/workouts/${workoutId}`;
      const method = isNew ? 'POST' : 'PUT';
      await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onSaved?.();
      onBack();
    } catch (err) {
      console.error('Save follow-along error:', err);
    }
    setSaving(false);
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" /></div>;
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{
            background: 'var(--bg-card)', border: 'none', borderRadius: 8,
            padding: '8px 14px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer',
          }}
        >
          ← Back to workouts
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>
          {isNew ? 'New Follow-Along Workout' : 'Edit Follow-Along'}
        </h2>
        <button
          onClick={save}
          disabled={!form.title || saving}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            opacity: (!form.title || saving) ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Form grid: left column = fields, right column = thumbnail upload */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 24 }}>
        <div>
          {/* Title */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Title</label>
            <input
              value={form.title}
              onChange={e => update('title', e.target.value)}
              placeholder="e.g. Desk Mobility Follow Along"
              style={inputStyle}
            />
          </div>

          {/* Video URL */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Video URL (Vimeo or YouTube)</label>
            <input
              value={form.video_url}
              onChange={e => update('video_url', e.target.value)}
              placeholder="https://vimeo.com/1023208379"
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Clients will see this video when they tap Start on the workout.
            </p>
          </div>

          {/* Equipment */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Equipment</label>
            <input
              value={form.equipment}
              onChange={e => update('equipment', e.target.value)}
              placeholder="e.g. Yoga Block, Foam Roller, Dumbbell"
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Comma-separated list. Shown on the client overview page.
            </p>
          </div>

          {/* Body parts / target area */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Target Area</label>
            <input
              value={form.body_parts}
              onChange={e => update('body_parts', e.target.value)}
              placeholder="e.g. Lower Body, Upper Body, Hips"
              style={inputStyle}
            />
          </div>

          {/* Duration + Intensity row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Duration (mins)</label>
              <input
                type="number"
                value={form.duration_mins}
                onChange={e => update('duration_mins', e.target.value)}
                min="1"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Intensity</label>
              <select
                value={form.intensity}
                onChange={e => update('intensity', e.target.value)}
                style={inputStyle}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Description</label>
            <textarea
              value={form.description}
              onChange={e => update('description', e.target.value)}
              placeholder="Short description shown on the client overview page"
              rows={3}
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
            />
          </div>

          {/* Program placement (optional) */}
          <div style={{ padding: 16, borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--divider)' }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)' }}>
              Program placement (optional)
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Program</label>
                <select
                  value={form.program_id}
                  onChange={e => update('program_id', e.target.value)}
                  style={inputStyle}
                >
                  <option value="">— Standalone (library) —</option>
                  {programs.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Week</label>
                <input
                  type="number"
                  value={form.week_number}
                  onChange={e => update('week_number', e.target.value)}
                  disabled={!form.program_id}
                  min="1"
                  style={{ ...inputStyle, opacity: form.program_id ? 1 : 0.4 }}
                />
              </div>
              <div>
                <label style={labelStyle}>Day</label>
                <input
                  type="number"
                  value={form.day_number}
                  onChange={e => update('day_number', e.target.value)}
                  disabled={!form.program_id}
                  min="1"
                  style={{ ...inputStyle, opacity: form.program_id ? 1 : 0.4 }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right column: thumbnail upload */}
        <div>
          <ImageUpload
            value={form.image_url}
            onChange={url => update('image_url', url)}
            width={220}
            height={160}
            label="Thumbnail"
          />
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.4 }}>
            Shown as the hero image on the client overview page before the user taps Start.
          </p>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: 0.5,
};

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--divider)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: 14, outline: 'none',
};
