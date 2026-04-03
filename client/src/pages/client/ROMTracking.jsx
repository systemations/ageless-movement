import { useState } from 'react';

const joints = [
  { name: 'Hips', icon: '🦴', measurements: [
    { label: 'Flexion', unit: '°', current: 120, target: 135, history: [110, 112, 115, 118, 120] },
    { label: 'Extension', unit: '°', current: 20, target: 30, history: [12, 14, 16, 18, 20] },
    { label: 'Internal Rotation', unit: '°', current: 35, target: 45, history: [25, 28, 30, 33, 35] },
    { label: 'External Rotation', unit: '°', current: 40, target: 50, history: [30, 33, 35, 38, 40] },
  ]},
  { name: 'Shoulders', icon: '💪', measurements: [
    { label: 'Flexion', unit: '°', current: 170, target: 180, history: [155, 160, 163, 167, 170] },
    { label: 'External Rotation', unit: '°', current: 80, target: 90, history: [65, 70, 73, 76, 80] },
    { label: 'Internal Rotation', unit: '°', current: 60, target: 70, history: [45, 50, 53, 56, 60] },
  ]},
  { name: 'Spine', icon: '🔄', measurements: [
    { label: 'Flexion (Toe Touch)', unit: 'cm', current: 5, target: 0, history: [15, 12, 9, 7, 5] },
    { label: 'Rotation L', unit: '°', current: 55, target: 70, history: [40, 44, 48, 52, 55] },
    { label: 'Rotation R', unit: '°', current: 50, target: 70, history: [38, 42, 45, 48, 50] },
  ]},
  { name: 'Ankles', icon: '🦶', measurements: [
    { label: 'Dorsiflexion', unit: '°', current: 25, target: 35, history: [15, 18, 20, 23, 25] },
  ]},
];

export default function ROMTracking({ onBack }) {
  const [selectedJoint, setSelectedJoint] = useState(null);
  const [addingTo, setAddingTo] = useState(null);
  const [newValue, setNewValue] = useState('');

  if (selectedJoint) {
    const joint = joints.find(j => j.name === selectedJoint);
    return (
      <div className="page-content" style={{ paddingBottom: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setSelectedJoint(null)} style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-mint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span style={{ fontSize: 28 }}>{joint.icon}</span>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>{joint.name} ROM</h1>
        </div>

        {joint.measurements.map((m, mi) => {
          const pct = m.target > 0 ? Math.min(100, (m.current / m.target) * 100) : 100;
          const improving = m.history.length > 1 && m.history[m.history.length - 1] > m.history[m.history.length - 2];
          return (
            <div key={mi} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{m.label}</h4>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-mint)' }}>{m.current}</span>
                    <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{m.unit}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>/ {m.target}{m.unit}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {improving ? (
                    <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>↑ Improving</span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>→ Stable</span>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 6, background: 'var(--divider)', borderRadius: 3, marginBottom: 12 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent-mint)', borderRadius: 3, transition: 'width 0.3s' }} />
              </div>

              {/* Mini chart (sparkline) */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40, marginBottom: 8 }}>
                {m.history.map((v, i) => {
                  const max = Math.max(...m.history);
                  const min = Math.min(...m.history);
                  const range = max - min || 1;
                  const h = ((v - min) / range) * 30 + 10;
                  return (
                    <div key={i} style={{
                      flex: 1, height: h, borderRadius: 3,
                      background: i === m.history.length - 1 ? 'var(--accent-mint)' : 'rgba(61,255,210,0.2)',
                    }} />
                  );
                })}
              </div>

              {/* Add measurement */}
              {addingTo === `${selectedJoint}-${mi}` ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="number" value={newValue} onChange={e => setNewValue(e.target.value)} placeholder={`${m.unit}`}
                    className="input-field" style={{ flex: 1, fontSize: 14, padding: 10 }} autoFocus />
                  <button onClick={() => { setAddingTo(null); setNewValue(''); }} className="btn-primary" style={{ padding: '10px 16px', width: 'auto', fontSize: 13 }}>Save</button>
                </div>
              ) : (
                <button onClick={() => setAddingTo(`${selectedJoint}-${mi}`)} style={{
                  background: 'rgba(61,255,210,0.1)', border: 'none', borderRadius: 8, padding: '8px 0',
                  width: '100%', color: 'var(--accent-mint)', fontSize: 13, fontWeight: 600,
                }}>
                  + Log New Measurement
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Joint selection
  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-mint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Range of Motion</h1>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
        Track your joint mobility over time. Select a body area to log and view your range of motion progress.
      </p>

      {joints.map((joint) => {
        const avgPct = Math.round(joint.measurements.reduce((acc, m) => acc + (m.target > 0 ? (m.current / m.target) * 100 : 100), 0) / joint.measurements.length);
        return (
          <div key={joint.name} onClick={() => setSelectedJoint(joint.name)} className="card" style={{
            display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', marginBottom: 8,
          }}>
            <span style={{ fontSize: 36 }}>{joint.icon}</span>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{joint.name}</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{joint.measurements.length} measurements tracked</p>
            </div>
            <div style={{ position: 'relative', width: 44, height: 44 }}>
              <svg width="44" height="44" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                <circle cx="22" cy="22" r="18" fill="none" stroke="var(--accent-mint)" strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 18}`} strokeDashoffset={`${2 * Math.PI * 18 * (1 - avgPct / 100)}`}
                  strokeLinecap="round" transform="rotate(-90 22 22)" />
              </svg>
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{avgPct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
