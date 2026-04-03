import { useState } from 'react';

const bodyAreas = [
  { name: 'Neck', x: 50, y: 8 },
  { name: 'Left Shoulder', x: 28, y: 16 },
  { name: 'Right Shoulder', x: 72, y: 16 },
  { name: 'Upper Back', x: 50, y: 22 },
  { name: 'Lower Back', x: 50, y: 35 },
  { name: 'Left Hip', x: 35, y: 45 },
  { name: 'Right Hip', x: 65, y: 45 },
  { name: 'Left Knee', x: 38, y: 65 },
  { name: 'Right Knee', x: 62, y: 65 },
  { name: 'Left Ankle', x: 38, y: 85 },
  { name: 'Right Ankle', x: 62, y: 85 },
];

const sampleLogs = [
  { id: 1, area: 'Lower Back', intensity: 4, notes: 'Tight after sitting all day. Eased after mobility routine.', date: '2026-04-02', trend: 'improving' },
  { id: 2, area: 'Left Hip', intensity: 3, notes: 'Mild ache during hip flexion. Better than last week.', date: '2026-04-01', trend: 'improving' },
  { id: 3, area: 'Right Knee', intensity: 2, notes: 'Slight discomfort going downstairs. No pain during training.', date: '2026-03-30', trend: 'stable' },
  { id: 4, area: 'Neck', intensity: 5, notes: 'Stiff from sleeping position. Resolved by midday.', date: '2026-03-28', trend: 'worsening' },
];

export default function PainLogging({ onBack }) {
  const [logs, setLogs] = useState(sampleLogs);
  const [adding, setAdding] = useState(false);
  const [selectedArea, setSelectedArea] = useState(null);
  const [intensity, setIntensity] = useState(5);
  const [notes, setNotes] = useState('');

  const handleSave = () => {
    if (!selectedArea) return;
    const newLog = {
      id: Date.now(), area: selectedArea, intensity, notes,
      date: new Date().toISOString().split('T')[0], trend: 'new',
    };
    setLogs([newLog, ...logs]);
    setAdding(false);
    setSelectedArea(null);
    setIntensity(5);
    setNotes('');
  };

  const intensityColor = (i) => {
    if (i <= 3) return '#30D158';
    if (i <= 6) return '#FF9500';
    return '#FF453A';
  };

  const intensityLabel = (i) => {
    if (i <= 2) return 'Mild';
    if (i <= 4) return 'Moderate';
    if (i <= 6) return 'Significant';
    if (i <= 8) return 'Severe';
    return 'Extreme';
  };

  // Add pain log view
  if (adding) {
    return (
      <div className="page-content" style={{ paddingBottom: 120 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setAdding(false)} style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Log Pain / Discomfort</h1>
        </div>

        {/* Body area selector */}
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)' }}>TAP LOCATION</h3>
        <div style={{
          position: 'relative', width: '100%', maxWidth: 240, margin: '0 auto 24px',
          aspectRatio: '1/2', background: 'var(--bg-card)', borderRadius: 16,
        }}>
          {/* Body outline */}
          <div style={{ position: 'absolute', top: '5%', left: '50%', transform: 'translateX(-50%)', width: '30%', aspectRatio: '1/1', borderRadius: '50%', border: '2px solid var(--divider)' }} />
          <div style={{ position: 'absolute', top: '18%', left: '30%', width: '40%', height: '25%', border: '2px solid var(--divider)', borderRadius: '10px 10px 0 0' }} />
          <div style={{ position: 'absolute', top: '43%', left: '33%', width: '15%', height: '30%', border: '2px solid var(--divider)', borderRadius: '0 0 5px 5px' }} />
          <div style={{ position: 'absolute', top: '43%', left: '52%', width: '15%', height: '30%', border: '2px solid var(--divider)', borderRadius: '0 0 5px 5px' }} />

          {bodyAreas.map(area => (
            <button
              key={area.name}
              onClick={() => setSelectedArea(area.name)}
              style={{
                position: 'absolute', left: `${area.x}%`, top: `${area.y}%`, transform: 'translate(-50%, -50%)',
                width: 24, height: 24, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: selectedArea === area.name ? intensityColor(intensity) : 'rgba(255,255,255,0.15)',
                boxShadow: selectedArea === area.name ? `0 0 12px ${intensityColor(intensity)}50` : 'none',
                transition: 'all 0.2s',
              }}
            />
          ))}
        </div>

        {selectedArea && (
          <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--accent)' }}>
            {selectedArea}
          </p>
        )}

        {/* Intensity slider */}
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>INTENSITY</h3>
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: intensityColor(intensity) }}>{intensity}</span>
            <span style={{ fontSize: 14, color: intensityColor(intensity), fontWeight: 600, alignSelf: 'center' }}>{intensityLabel(intensity)}</span>
          </div>
          <input
            type="range" min="1" max="10" value={intensity}
            onChange={e => setIntensity(parseInt(e.target.value))}
            style={{
              width: '100%', height: 6, appearance: 'none', background: `linear-gradient(to right, #30D158, #FF9500, #FF453A)`,
              borderRadius: 3, outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>1 - Mild</span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>10 - Extreme</span>
          </div>
        </div>

        {/* Notes */}
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>NOTES</h3>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Describe the pain, when it occurs, what makes it better/worse..."
          className="input-field"
          style={{ minHeight: 80, fontSize: 14, resize: 'vertical', marginBottom: 16 }}
        />

        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 480, width: 'calc(100% - 32px)', padding: '12px 0',
          background: 'linear-gradient(to top, var(--bg-primary) 70%, transparent)',
        }}>
          <button className="btn-primary" onClick={handleSave} disabled={!selectedArea}>Save Log</button>
        </div>
      </div>
    );
  }

  // Pain log list
  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>Pain / Discomfort Log</h1>
        <button onClick={() => setAdding(true)} style={{
          background: 'var(--accent)', border: 'none', borderRadius: 20,
          padding: '6px 14px', fontSize: 13, fontWeight: 600, color: '#000',
        }}>+ Log</button>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {['Lower Back', 'Left Hip', 'Right Knee'].map(area => {
          const latest = logs.find(l => l.area === area);
          if (!latest) return null;
          return (
            <div key={area} className="card" style={{ flex: 1, textAlign: 'center', padding: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', margin: '0 auto 6px',
                background: `${intensityColor(latest.intensity)}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: intensityColor(latest.intensity) }}>{latest.intensity}</span>
              </div>
              <p style={{ fontSize: 11, fontWeight: 600 }}>{area.replace('Left ', 'L ').replace('Right ', 'R ')}</p>
              <p style={{ fontSize: 10, color: latest.trend === 'improving' ? 'var(--success)' : latest.trend === 'worsening' ? 'var(--error)' : 'var(--text-tertiary)' }}>
                {latest.trend === 'improving' ? '↓ Better' : latest.trend === 'worsening' ? '↑ Worse' : '→ Stable'}
              </p>
            </div>
          );
        })}
      </div>

      {/* Log history */}
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)' }}>HISTORY</h3>
      {logs.map(log => (
        <div key={log.id} className="card" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: `${intensityColor(log.intensity)}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: intensityColor(log.intensity) }}>{log.intensity}</span>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700 }}>{log.area}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{log.date}</p>
              </div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
              background: log.trend === 'improving' ? 'rgba(48,209,88,0.15)' : log.trend === 'worsening' ? 'rgba(255,69,58,0.15)' : 'rgba(255,255,255,0.08)',
              color: log.trend === 'improving' ? 'var(--success)' : log.trend === 'worsening' ? 'var(--error)' : 'var(--text-tertiary)',
            }}>
              {log.trend}
            </span>
          </div>
          {log.notes && <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{log.notes}</p>}
        </div>
      ))}
    </div>
  );
}
