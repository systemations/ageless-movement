import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

const CAT = {
  bug: { label: '🐛 Bug', color: '#ff8fa0' },
  idea: { label: '💡 Idea', color: 'var(--accent)' },
  praise: { label: '⭐ Praise', color: 'var(--accent-mint)' },
  other: { label: '💬 Other', color: 'var(--text-secondary)' },
};

export default function FeedbackViewer() {
  const { token } = useAuth();
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch('/api/feedback', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setRows(d.feedback || []))
      .catch(() => setRows([]));
  }, []);

  if (rows === null) return <div style={{ padding: 40, color: 'var(--text-tertiary)' }}>Loading...</div>;

  const shown = filter === 'all' ? rows : rows.filter(r => r.category === filter);
  const counts = rows.reduce((a, r) => { a[r.category] = (a[r.category] || 0) + 1; return a; }, {});

  return (
    <div style={{ padding: '8px 0' }}>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
        {rows.length} submission{rows.length === 1 ? '' : 's'} from testers.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {['all', 'bug', 'idea', 'praise', 'other'].map(k => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              padding: '6px 12px', borderRadius: 16, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: filter === k ? '2px solid var(--accent)' : '1px solid var(--divider)',
              background: filter === k ? 'rgba(255,140,0,0.12)' : 'transparent',
              color: 'var(--text-primary)',
            }}
          >
            {k === 'all' ? `All (${rows.length})` : `${CAT[k]?.label || k} (${counts[k] || 0})`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>No feedback yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shown.map(f => (
            <div key={f.id} style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, border: '1px solid var(--divider)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: CAT[f.category]?.color || 'var(--text-secondary)' }}>
                  {CAT[f.category]?.label || f.category}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{f.user_name || 'Unknown'}</span>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{f.user_email}</span>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                  {new Date(f.created_at + 'Z').toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{f.message}</p>
              {f.user_agent && (
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 8 }}>{f.user_agent}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
