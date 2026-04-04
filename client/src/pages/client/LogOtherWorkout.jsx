import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const workoutTypes = [
  { icon: '🏃', label: 'HIIT Cardio' },
  { icon: '🚶', label: 'LISS Cardio' },
  { icon: '🏃‍♂️', label: 'Running' },
  { icon: '🚴', label: 'Cycling' },
  { icon: '🚣', label: 'Rowing Machine' },
  { icon: '🧘', label: 'Yoga' },
  { icon: '🤸', label: 'Mobility' },
  { icon: '💪', label: 'Strength' },
  { icon: '🏊', label: 'Swimming' },
  { icon: '🥊', label: 'Boxing' },
  { icon: '🕺', label: 'Dancing' },
  { icon: '🧗', label: 'Functional Training' },
  { icon: '🏔️', label: 'Hiking' },
  { icon: '⬆️', label: 'Stair Stepper' },
  { icon: '🤾', label: 'Pilates' },
  { icon: '🧘‍♂️', label: 'Stretching' },
  { icon: '🏋️', label: 'Core' },
  { icon: '❄️', label: 'Cooldown' },
  { icon: '🤾‍♂️', label: 'Skipping' },
  { icon: '🚶‍♂️', label: 'Walk' },
  { icon: '⚡', label: 'Other' },
];

export default function LogOtherWorkout({ onClose }) {
  const { token } = useAuth();
  const [selectedType, setSelectedType] = useState(null);
  const [duration, setDuration] = useState('');
  const [calories, setCalories] = useState('');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    try {
      await fetch('/api/explore/workouts/0/log', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_mins: parseInt(duration) || 0, notes: `${selectedType}: ${notes}` }),
      });
      setSaved(true);
      setTimeout(() => onClose(), 1500);
    } catch (err) { console.error(err); }
  };

  if (saved) {
    return (
      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Workout Logged!</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{selectedType} · {duration} mins</p>
      </div>
    );
  }

  if (selectedType) {
    return (
      <div className="page-content" style={{ paddingBottom: 120 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setSelectedType(null)} style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Log {selectedType}</h1>
        </div>

        <div className="input-group">
          <label>Duration (minutes)</label>
          <input type="number" className="input-field" value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g. 30" style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }} />
        </div>

        <div className="input-group">
          <label>Calories Burned (optional)</label>
          <input type="number" className="input-field" value={calories} onChange={e => setCalories(e.target.value)} placeholder="e.g. 250" />
        </div>

        <div className="input-group">
          <label>Notes (optional)</label>
          <textarea className="input-field" value={notes} onChange={e => setNotes(e.target.value)} placeholder="How did it go?" style={{ minHeight: 80, resize: 'vertical' }} />
        </div>

        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 480, width: 'calc(100% - 32px)', padding: '12px 0',
          background: 'linear-gradient(to top, var(--bg-primary) 70%, transparent)',
        }}>
          <button className="btn-primary" onClick={handleSave} disabled={!duration}>Save Workout</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onClose} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Select Workout</h1>
      </div>

      {workoutTypes.map(wt => (
        <div key={wt.label} onClick={() => setSelectedType(wt.label)} style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
          borderBottom: '1px solid var(--divider)', cursor: 'pointer',
        }}>
          <span style={{ fontSize: 22, width: 32, textAlign: 'center' }}>{wt.icon}</span>
          <span style={{ fontSize: 15, fontWeight: 500, flex: 1 }}>{wt.label}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      ))}
    </div>
  );
}
