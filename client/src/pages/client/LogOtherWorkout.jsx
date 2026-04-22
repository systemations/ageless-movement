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

// Activities where distance tracking makes sense as a primary metric.
const DISTANCE_ACTIVITIES = new Set([
  'Running', 'Cycling', 'Rowing Machine', 'Swimming', 'Walk', 'Hiking', 'Stair Stepper',
]);

export default function LogOtherWorkout({ onClose }) {
  const { token } = useAuth();
  const [selectedType, setSelectedType] = useState(null);
  const [trackBy, setTrackBy] = useState('time'); // 'time' | 'distance'
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [distanceUnit, setDistanceUnit] = useState('km');
  const [calories, setCalories] = useState('');
  const [notes, setNotes] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [saved, setSaved] = useState(false);

  // Pre-select distance as default for activities where it makes sense
  const pickType = (label) => {
    setSelectedType(label);
    setTrackBy(DISTANCE_ACTIVITIES.has(label) ? 'distance' : 'time');
  };

  const allowDistance = selectedType && (DISTANCE_ACTIVITIES.has(selectedType) || selectedType === 'HIIT Cardio' || selectedType === 'LISS Cardio' || selectedType === 'Other');

  const handleSave = async () => {
    try {
      await fetch('/api/explore/workouts/0/log', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration_mins: parseInt(duration) || 0,
          distance: distance ? parseFloat(distance) : null,
          distance_unit: distanceUnit,
          notes: `${selectedType}: ${notes}`,
          date: logDate,
        }),
      });
      setSaved(true);
      setTimeout(() => onClose(), 1500);
    } catch (err) { console.error(err); }
  };

  const canSave = trackBy === 'time' ? !!duration : !!distance;

  if (saved) {
    return (
      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Workout Logged!</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {selectedType}
          {distance ? ` · ${distance} ${distanceUnit}` : ''}
          {duration ? ` · ${duration} mins` : ''}
          {logDate !== new Date().toISOString().split('T')[0] && ` · ${new Date(logDate + 'T00:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}`}
        </p>
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

        {/* Track by toggle - only show for activities where distance is relevant */}
        {allowDistance && (
          <div className="input-group">
            <label>Track by</label>
            <div style={{
              display: 'flex', gap: 0, background: 'var(--bg-card)', borderRadius: 10,
              padding: 4,
            }}>
              <button
                onClick={() => setTrackBy('time')}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: trackBy === 'time' ? 'var(--accent)' : 'transparent',
                  color: trackBy === 'time' ? '#000' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: 700,
                }}
              >⏱ Time</button>
              <button
                onClick={() => setTrackBy('distance')}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: trackBy === 'distance' ? 'var(--accent)' : 'transparent',
                  color: trackBy === 'distance' ? '#000' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: 700,
                }}
              >📏 Distance</button>
            </div>
          </div>
        )}

        {/* Primary input swaps based on trackBy */}
        {trackBy === 'distance' && allowDistance ? (
          <>
            <div className="input-group">
              <label>Distance</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={distance}
                  onChange={e => setDistance(e.target.value)}
                  placeholder="e.g. 5.2"
                  style={{ flex: 1, fontSize: 20, fontWeight: 700, textAlign: 'center' }}
                />
                <select
                  value={distanceUnit}
                  onChange={e => setDistanceUnit(e.target.value)}
                  style={{
                    padding: '10px 12px', borderRadius: 10,
                    border: '1px solid var(--divider)', background: 'var(--bg-card)',
                    color: 'var(--text-primary)', fontSize: 14, fontWeight: 600,
                  }}
                >
                  <option value="km">km</option>
                  <option value="mi">mi</option>
                  <option value="m">m</option>
                </select>
              </div>
            </div>
            <div className="input-group">
              <label>Duration (minutes, optional)</label>
              <input
                type="number"
                className="input-field"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                placeholder="e.g. 30"
              />
            </div>
          </>
        ) : (
          <div className="input-group">
            <label>Duration (minutes)</label>
            <input
              type="number"
              className="input-field"
              value={duration}
              onChange={e => setDuration(e.target.value)}
              placeholder="e.g. 30"
              style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }}
            />
          </div>
        )}

        <div className="input-group">
          <label>Calories Burned (optional)</label>
          <input type="number" className="input-field" value={calories} onChange={e => setCalories(e.target.value)} placeholder="e.g. 250" />
        </div>

        <div className="input-group">
          <label>Notes (optional)</label>
          <textarea className="input-field" value={notes} onChange={e => setNotes(e.target.value)} placeholder="How did it go?" style={{ minHeight: 80, resize: 'vertical' }} />
        </div>

        <div className="input-group">
          <label>Date</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="date"
              className="input-field"
              value={logDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => setLogDate(e.target.value)}
              style={{ flex: 1 }}
            />
            {logDate !== new Date().toISOString().split('T')[0] && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                background: 'rgba(255,149,0,0.15)', color: 'var(--accent-orange)',
                whiteSpace: 'nowrap',
              }}>Backdated</span>
            )}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Forgot to log? Pick the date you did the workout
          </p>
        </div>

        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 480, width: 'calc(100% - 32px)', padding: '12px 0',
          background: 'linear-gradient(to top, var(--bg-primary) 70%, transparent)',
        }}>
          <button className="btn-primary" onClick={handleSave} disabled={!canSave}>Save Workout</button>
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
        <div key={wt.label} onClick={() => pickType(wt.label)} style={{
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
