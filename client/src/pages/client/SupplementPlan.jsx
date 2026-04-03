import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function SupplementPlan() {
  const { token } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/nutrition/supplements', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data) return <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}><div className="spinner" /></div>;

  return (
    <div className="page-content" style={{ paddingBottom: 140 }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1E1A2E, #2D2640)', borderRadius: 16,
        padding: '24px 20px', marginBottom: 24, textAlign: 'center',
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', margin: '0 auto 12px',
          background: 'var(--logo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src="/logo.png" alt="" style={{ width: 52, height: 52, borderRadius: '50%' }} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>{data.title}</h2>
      </div>

      {/* Time-based sections */}
      {data.sections.map((section, si) => (
        <div key={si} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--accent)', opacity: 0.3 }} />
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>{section.time}</h3>
            <div style={{ flex: 1, height: 1, background: 'var(--accent)', opacity: 0.3 }} />
          </div>

          {section.items.map((item, ii) => (
            <div key={ii} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
              borderBottom: ii < section.items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: 'var(--logo-bg)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img src="/logo.png" alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.dosage}</p>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
