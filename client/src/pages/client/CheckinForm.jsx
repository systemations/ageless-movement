import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const questions = [
  'How do you feel / overall well being',
  'What has been your biggest challenge this week?',
  'What is your biggest win this week?',
  'Any concerns with the program?',
  'Anything else?',
];

export default function CheckinForm({ onClose, onSuccess }) {
  const { token } = useAuth();
  const [photos, setPhotos] = useState({ front: null, side: null, back: null });
  const [measurements, setMeasurements] = useState({
    weight: '', body_fat: '', recovery_score: '', sleep_hours: '', stress_level: '', waist: '',
  });
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);

  const handlePhotoChange = (position, e) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotos({ ...photos, [position]: URL.createObjectURL(file) });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/coach/checkins', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weight: measurements.weight ? parseFloat(measurements.weight) : null,
          body_fat: measurements.body_fat ? parseFloat(measurements.body_fat) : null,
          recovery_score: measurements.recovery_score ? parseFloat(measurements.recovery_score) : null,
          sleep_hours: measurements.sleep_hours ? parseFloat(measurements.sleep_hours) : null,
          stress_level: measurements.stress_level ? parseInt(measurements.stress_level) : null,
          waist: measurements.waist ? parseFloat(measurements.waist) : null,
          answers,
        }),
      });
      onSuccess?.();
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onClose} style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1, textAlign: 'center' }}>Add Check-in</h1>
        <div style={{ width: 32 }} />
      </div>

      {/* Photos */}
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Photos</h3>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {['front', 'side', 'back'].map(pos => (
          <label key={pos} style={{
            flex: 1, aspectRatio: '3/4', borderRadius: 12, background: 'var(--bg-card)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', overflow: 'hidden', position: 'relative',
          }}>
            {photos[pos] ? (
              <img src={photos[pos]} alt={pos} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <>
                <img src="/logo.png" alt="" style={{ width: 32, height: 32, borderRadius: '50%', opacity: 0.2, marginBottom: 4 }} />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2" style={{ position: 'absolute', bottom: 28 }}>
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </>
            )}
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', position: 'absolute', bottom: 8, textTransform: 'capitalize' }}>{pos}</p>
            <input type="file" accept="image/*" capture="environment" onChange={e => handlePhotoChange(pos, e)} style={{ display: 'none' }} />
          </label>
        ))}
      </div>

      {/* Measurements */}
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Measurements</h3>
      <div className="card" style={{ marginBottom: 24 }}>
        {[
          { key: 'body_fat', label: 'Body Fat', unit: '%' },
          { key: 'recovery_score', label: 'Recovery Score', unit: '' },
          { key: 'sleep_hours', label: 'Sleep Hours', unit: '' },
          { key: 'stress_level', label: 'Stress Level', unit: '' },
          { key: 'waist', label: 'Waist', unit: 'cm' },
          { key: 'weight', label: 'Weight', unit: 'kg' },
        ].map(({ key, label, unit }, i) => (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 0', borderBottom: i < 5 ? '1px solid var(--divider)' : 'none',
          }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="number"
                value={measurements[key]}
                onChange={e => setMeasurements({ ...measurements, [key]: e.target.value })}
                placeholder="-"
                style={{
                  width: 60, background: 'transparent', border: 'none', color: 'var(--text-primary)',
                  fontSize: 15, fontWeight: 600, textAlign: 'right', outline: 'none',
                }}
              />
              {unit && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Questions */}
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Questions</h3>
      <div className="card" style={{ marginBottom: 24 }}>
        {questions.map((q, i) => (
          <div key={i} style={{
            padding: '12px 0', borderBottom: i < questions.length - 1 ? '1px solid var(--divider)' : 'none',
          }}>
            <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{q}</p>
            {answers[i] !== undefined ? (
              <textarea
                value={answers[i]}
                onChange={e => setAnswers({ ...answers, [i]: e.target.value })}
                className="input-field"
                style={{ minHeight: 60, fontSize: 13, resize: 'vertical' }}
              />
            ) : (
              <button
                onClick={() => setAnswers({ ...answers, [i]: '' })}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}
              >
                Add Answer &gt;
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Save */}
      <div style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        maxWidth: 480, width: 'calc(100% - 32px)', padding: '12px 0',
        background: 'linear-gradient(to top, var(--bg-primary) 70%, transparent)',
      }}>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
