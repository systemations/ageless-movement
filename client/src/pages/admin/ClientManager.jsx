import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function ClientManager() {
  const { token } = useAuth();
  const [clients, setClients] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const headers = { Authorization: `Bearer ${token}` };
    const [c, p] = await Promise.all([
      fetch('/api/coach/clients', { headers }).then(r => r.json()),
      fetch('/api/content/programs', { headers }).then(r => r.json()),
    ]);
    setClients(c.clients || []);
    setPrograms(p.programs || []);
  };

  const invite = async () => {
    if (!inviteForm.name || !inviteForm.email) return;
    const res = await fetch('/api/coach/clients/invite', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(inviteForm),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`✓ ${inviteForm.name} invited! Temp password: welcome123`);
      setInviteForm({ name: '', email: '' });
      fetchData();
    } else setMsg(data.error);
  };

  return (
    <div style={{ padding: '24px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Clients</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{clients.length} clients</p>
        </div>
        <button onClick={() => setShowInvite(!showInvite)} style={{
          background: 'var(--accent-mint)', color: '#000', border: 'none', borderRadius: 10,
          padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}>+ Invite Client</button>
      </div>

      {showInvite && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, marginBottom: 20, maxWidth: 500 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Invite New Client</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Name</label><input className="input-field" value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} /></div>
            <div><label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Email</label><input type="email" className="input-field" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button onClick={invite} style={{ background: 'var(--accent-mint)', color: '#000', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Send Invite</button>
            {msg && <p style={{ fontSize: 12, color: msg.startsWith('✓') ? 'var(--success)' : 'var(--error)' }}>{msg}</p>}
          </div>
        </div>
      )}

      {/* Client list */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 160px 100px 100px',
          padding: '10px 16px', borderBottom: '1px solid var(--divider)',
          fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
        }}>
          <span>Client</span>
          <span>Last Check-in</span>
          <span>Streak</span>
          <span>Workouts</span>
        </div>

        {clients.map(c => (
          <div key={c.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 160px 100px 100px',
            padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-mint)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: '#000',
              }}>{c.name?.charAt(0)}</div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.email}</p>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{c.last_checkin || 'Never'}</p>
            <p style={{ fontSize: 13 }}>{c.streak ? `🔥 ${c.streak}` : '—'}</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{c.workouts_completed || 0}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
