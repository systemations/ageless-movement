import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../components/ImageUpload';

export default function ChallengeManager() {
  const { token } = useAuth();
  const [challenges, setChallenges] = useState([]);
  const [editing, setEditing] = useState(null); // challenge object being edited, or 'new'

  useEffect(() => { fetchChallenges(); }, []);

  const fetchChallenges = async () => {
    const res = await fetch('/api/challenges/admin/all', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setChallenges(data.challenges || []);
  };

  return (
    <div style={{ padding: '24px 40px', display: 'grid', gridTemplateColumns: editing ? '1fr 500px' : '1fr', gap: 24 }}>
      {/* LEFT: challenges list */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800 }}>Challenges</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              {challenges.length} challenge{challenges.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={() => setEditing('new')} style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
            padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>+ New Challenge</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {challenges.map(c => (
            <div
              key={c.id}
              onClick={() => setEditing(c)}
              style={{
                background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                border: editing?.id === c.id ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <div style={{
                height: 140, background: c.image_url ? `url(${c.image_url}) center/cover` : 'var(--bg-primary)',
                display: 'flex', alignItems: 'flex-end', padding: 16,
              }}>
                {!c.image_url && (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
                    <circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
                  </svg>
                )}
              </div>
              <div style={{ padding: '12px 16px' }}>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{c.title}</p>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
                  <span>{c.level_count} levels</span>
                  <span>-</span>
                  <span>{c.enrollment_count} enrolled</span>
                  {c.completed_count > 0 && (
                    <>
                      <span>-</span>
                      <span style={{ color: 'var(--accent-mint)', fontWeight: 700 }}>
                        {c.completed_count} finished
                      </span>
                    </>
                  )}
                </div>
                {c.category && (
                  <span style={{
                    display: 'inline-block', marginTop: 6, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(255,140,0,0.15)', color: 'var(--accent)', fontSize: 10, fontWeight: 700,
                  }}>{c.category}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: inline editor panel */}
      {editing && (
        <ChallengeEditor
          challenge={editing === 'new' ? null : editing}
          token={token}
          onClose={() => setEditing(null)}
          onSaved={() => { fetchChallenges(); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ChallengeEditor({ challenge, token, onClose, onSaved }) {
  const isNew = !challenge;
  const [form, setForm] = useState({
    title: challenge?.title || '',
    description: challenge?.description || '',
    image_url: challenge?.image_url || '',
    category: challenge?.category || '',
  });
  const [levels, setLevels] = useState([]);
  const [allWorkouts, setAllWorkouts] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [participants, setParticipants] = useState([]);

  useEffect(() => {
    // Load workout library for picker
    fetch('/api/content/workouts', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setAllWorkouts(d.workouts || []));

    if (challenge) {
      // Load full challenge with levels
      fetch(`/api/challenges/${challenge.id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setLevels(d.levels || []));

      // Load per-client progress
      fetch(`/api/challenges/admin/${challenge.id}/participants`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setParticipants(d.participants || []))
        .catch(() => setParticipants([]));
    } else {
      setParticipants([]);
    }
  }, [challenge?.id]);

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const addWorkout = (w) => {
    setLevels(ls => [...ls, {
      workout_id: w.id,
      title: w.title,
      duration_mins: w.duration_mins,
      level_label: `Level ${ls.length + (ls.some(l => l.level_label === 'Intro') ? 0 : 1)}`,
    }]);
    setShowPicker(false);
    setPickerSearch('');
  };

  const removeLevel = (idx) => setLevels(ls => ls.filter((_, i) => i !== idx));

  const moveLevel = (idx, dir) => {
    setLevels(ls => {
      const next = [...ls];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return ls;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const updateLabel = (idx, label) => {
    setLevels(ls => ls.map((l, i) => i === idx ? { ...l, level_label: label } : l));
  };

  const save = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      let id = challenge?.id;
      if (isNew) {
        const r = await fetch('/api/challenges/admin', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const d = await r.json();
        id = d.id;
      } else {
        await fetch(`/api/challenges/admin/${id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      }

      // Save levels
      await fetch(`/api/challenges/admin/${id}/workouts`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workouts: levels.map(l => ({ workout_id: l.workout_id, level_label: l.level_label })),
        }),
      });

      setMsg('Saved');
      onSaved();
    } catch (err) {
      console.error(err);
      setMsg('Error saving');
    }
    setSaving(false);
  };

  const remove = async () => {
    if (!challenge || !confirm(`Delete "${challenge.title}"? This cannot be undone.`)) return;
    await fetch(`/api/challenges/admin/${challenge.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    onSaved();
  };

  const filteredWorkouts = allWorkouts.filter(w =>
    !pickerSearch || w.title.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12, padding: 20,
      position: 'sticky', top: 20, maxHeight: 'calc(100vh - 40px)', overflow: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>{isNew ? 'New Challenge' : 'Edit Challenge'}</h2>
        <button onClick={onClose} style={{
          width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--bg-primary)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Form fields */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Title</label>
        <input value={form.title} onChange={e => update('title', e.target.value)} style={inputStyle} placeholder="e.g. Ground Zero Get Up" />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Description</label>
        <textarea value={form.description} onChange={e => update('description', e.target.value)}
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} rows={3} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Category</label>
          <input value={form.category} onChange={e => update('category', e.target.value)} style={inputStyle} placeholder="e.g. Mobility" />
        </div>
        <div>
          <label style={labelStyle}>Cover</label>
          <ImageUpload value={form.image_url} onChange={url => update('image_url', url)} width={140} height={80} />
        </div>
      </div>

      {/* Levels section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>Levels ({levels.length})</label>
        <button onClick={() => setShowPicker(!showPicker)} style={{
          background: 'var(--accent-mint)', color: '#000', border: 'none', borderRadius: 8,
          padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>+ Add</button>
      </div>

      {/* Workout picker */}
      {showPicker && (
        <div style={{ background: 'var(--bg-primary)', borderRadius: 10, padding: 10, marginBottom: 12, maxHeight: 240, overflow: 'auto' }}>
          <input
            value={pickerSearch}
            onChange={e => setPickerSearch(e.target.value)}
            placeholder="Search workouts..."
            style={{ ...inputStyle, marginBottom: 8 }}
            autoFocus
          />
          {filteredWorkouts.slice(0, 50).map(w => (
            <button
              key={w.id}
              onClick={() => addWorkout(w)}
              style={{
                display: 'block', width: '100%', padding: '8px 10px', borderRadius: 6,
                border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer',
                fontSize: 12, color: 'var(--text-primary)',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--bg-card)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              {w.title} <span style={{ color: 'var(--text-tertiary)' }}>-- {w.duration_mins} min</span>
            </button>
          ))}
        </div>
      )}

      {/* Level list */}
      {levels.map((l, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          background: 'var(--bg-primary)', borderRadius: 8, marginBottom: 6,
        }}>
          <span style={{
            width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)',
            color: '#fff', fontSize: 11, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              value={l.level_label}
              onChange={e => updateLabel(i, e.target.value)}
              style={{
                width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary)',
                fontSize: 12, fontWeight: 700, outline: 'none', padding: 0,
              }}
            />
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {l.title}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            <button onClick={() => moveLevel(i, -1)} disabled={i === 0} style={iconBtnStyle}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button onClick={() => moveLevel(i, 1)} disabled={i === levels.length - 1} style={iconBtnStyle}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button onClick={() => removeLevel(i)} style={{ ...iconBtnStyle, color: '#FF453A' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>
      ))}

      {/* Participants - per-client progress through the challenge levels */}
      {!isNew && (
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--divider)' }}>
          <label style={{ ...labelStyle, marginBottom: 10, display: 'block' }}>
            Participants ({participants.length})
          </label>
          {participants.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              No clients have started this challenge yet.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {participants.map((p) => {
                const done = !!p.completed_at;
                return (
                  <div key={p.enrollment_id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    background: 'var(--bg-primary)', borderRadius: 8,
                  }}>
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.name}
                        style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800, color: '#fff',
                      }}>{p.name?.charAt(0) || '?'}</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--divider)', overflow: 'hidden' }}>
                          <div style={{
                            width: `${p.pct_complete}%`, height: '100%',
                            background: done ? 'var(--accent-mint)' : 'var(--accent)',
                          }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', minWidth: 50, textAlign: 'right' }}>
                          {p.completed_count}/{p.total_levels}
                        </span>
                      </div>
                    </div>
                    {done && (
                      <span style={{
                        padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 800,
                        background: 'rgba(133,255,186,0.18)', color: 'var(--accent-mint)',
                      }}>DONE</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button onClick={save} disabled={saving || !form.title} style={{
          flex: 1, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          opacity: (saving || !form.title) ? 0.5 : 1,
        }}>
          {saving ? 'Saving...' : 'Save Challenge'}
        </button>
        {!isNew && (
          <button onClick={remove} style={{
            background: 'rgba(255,69,58,0.15)', color: '#FF453A', border: 'none', borderRadius: 8,
            padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Delete</button>
        )}
      </div>
      {msg && <p style={{ fontSize: 11, marginTop: 8, color: 'var(--text-secondary)' }}>{msg}</p>}
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

const iconBtnStyle = {
  width: 24, height: 24, borderRadius: 4, border: 'none', background: 'transparent',
  color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};
