import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

export default function ExerciseProgress({ exerciseId, onBack }) {
  const { token } = useAuth();
  const [exercise, setExercise] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);

  useEffect(() => {
    fetch(`/api/explore/progress/exercises/${exerciseId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        setExercise(d.exercise);
        setSessions(d.sessions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [exerciseId]);

  // Draw weight progression chart
  useEffect(() => {
    if (!canvasRef.current || sessions.length < 2) return;
    const ctx = canvasRef.current.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvasRef.current.clientWidth;
    const h = canvasRef.current.clientHeight;
    canvasRef.current.width = w * dpr;
    canvasRef.current.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Data: max weight per session, chronological order
    const points = [...sessions].reverse().map(s => ({
      date: s.date,
      maxWeight: Math.max(...s.sets.map(st => st.weight || 0)),
      totalVolume: s.sets.reduce((sum, st) => sum + (st.reps || 0) * (st.weight || 0), 0),
    }));

    const hasWeight = points.some(p => p.maxWeight > 0);
    const values = hasWeight ? points.map(p => p.maxWeight) : points.map(p => p.totalVolume);

    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;
    const padX = 10;
    const padY = 24;
    const chartW = w - padX * 2;
    const chartH = h - padY * 2;

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padY + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(w - padX, y);
      ctx.stroke();
    }

    // Line
    ctx.strokeStyle = '#3DFFD2';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = padX + (i / (points.length - 1)) * chartW;
      const y = padY + chartH - ((values[i] - minVal) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, padY, 0, h - padY);
    gradient.addColorStop(0, 'rgba(61,255,210,0.2)');
    gradient.addColorStop(1, 'rgba(61,255,210,0)');
    ctx.lineTo(padX + chartW, padY + chartH);
    ctx.lineTo(padX, padY + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Dots
    ctx.fillStyle = '#3DFFD2';
    points.forEach((p, i) => {
      const x = padX + (i / (points.length - 1)) * chartW;
      const y = padY + chartH - ((values[i] - minVal) / range) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Labels: first and last date
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(formatShort(points[0].date), padX, h - 4);
    ctx.textAlign = 'right';
    ctx.fillText(formatShort(points[points.length - 1].date), w - padX, h - 4);

    // Y-axis labels
    ctx.textAlign = 'left';
    ctx.fillText(hasWeight ? `${maxVal}kg` : `${maxVal}vol`, padX, padY - 4);
    ctx.fillText(hasWeight ? `${minVal}kg` : `${minVal}vol`, padX, padY + chartH + 12);
  }, [sessions]);

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  const hasWeight = sessions.some(s => s.sets.some(st => st.weight > 0));

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800 }}>{exercise?.name || 'Exercise'}</h1>
          {exercise?.body_part && <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{exercise.body_part}</p>}
        </div>
      </div>

      {/* Thumbnail */}
      {exercise?.thumbnail_url && (
        <img src={exercise.thumbnail_url} alt="" style={{
          width: '100%', height: 160, objectFit: 'cover', borderRadius: 12, marginBottom: 16,
        }} />
      )}

      {/* Stats summary */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'Sessions', value: sessions.length },
          { label: 'Total Sets', value: sessions.reduce((s, sess) => s + sess.sets.length, 0) },
          ...(hasWeight ? [{ label: 'Max Weight', value: Math.max(...sessions.flatMap(s => s.sets.map(st => st.weight || 0))) + 'kg' }] : []),
        ].map((s, i) => (
          <div key={i} className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 8px' }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent-mint)' }}>{s.value}</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      {sessions.length >= 2 && (
        <div className="card" style={{ marginBottom: 16, padding: '16px 12px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)' }}>
            {hasWeight ? 'Weight Progression' : 'Volume Progression'}
          </h3>
          <canvas ref={canvasRef} style={{ width: '100%', height: 160, display: 'block' }} />
        </div>
      )}

      {/* Session history */}
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Session History</h3>
      {sessions.map((s, si) => (
        <div key={si} className="card" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700 }}>
              {new Date(s.date + 'T00:00:00').toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
            {s.workout_title && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.workout_title}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {s.sets.map((set, setIdx) => (
              <div key={setIdx} style={{
                background: 'var(--bg-primary)', borderRadius: 8, padding: '6px 10px',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                <span style={{ color: 'var(--text-tertiary)', marginRight: 4 }}>S{set.set_number}</span>
                {set.weight > 0 && <span style={{ color: 'var(--accent-mint)' }}>{set.weight}kg </span>}
                <span>x{set.reps}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
}
