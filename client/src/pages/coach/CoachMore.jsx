import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ChevronRight } from '../../components/Icons';

const actionIcons = {
  workout_completed: '🏋️',
  meal_logged: '🍽️',
  checkin_submitted: '📋',
  task_completed: '✅',
  message_sent: '💬',
  water_logged: '💧',
  goal_progress: '🎯',
};

export default function CoachMore() {
  const { user, token, logout } = useAuth();
  const [showActivity, setShowActivity] = useState(false);
  const [showClients, setShowClients] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [activities, setActivities] = useState([]);
  const [clients, setClients] = useState([]);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' });
  const [inviteMsg, setInviteMsg] = useState('');

  const fetchActivity = async () => {
    try {
      const res = await fetch('/api/coach/activity', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setActivities(data.activities); }
    } catch (err) { console.error(err); }
  };

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/coach/clients', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setClients(data.clients); }
    } catch (err) { console.error(err); }
  };

  const inviteClient = async () => {
    if (!inviteForm.name || !inviteForm.email) return;
    try {
      const res = await fetch('/api/coach/clients/invite', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteMsg(`${inviteForm.name} invited! Temp password: welcome123`);
        setInviteForm({ name: '', email: '' });
        fetchClients();
      } else {
        setInviteMsg(data.error);
      }
    } catch (err) { setInviteMsg('Error inviting client'); }
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const mins = Math.floor((now - d) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
  };

  // Activity Feed view
  if (showActivity) {
    if (activities.length === 0) fetchActivity();
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setShowActivity(false)} style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-mint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Activity Feed</h1>
        </div>
        {activities.length === 0 && <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}
        {activities.map((a) => (
          <div key={a.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-card)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}>
              {actionIcons[a.action_type] || '📌'}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13 }}><span style={{ fontWeight: 700 }}>{a.user_name}</span> <span style={{ color: 'var(--text-secondary)' }}>{a.description}</span></p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{formatTime(a.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Clients list view
  if (showClients) {
    if (clients.length === 0) fetchClients();
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => { setShowClients(false); setShowInvite(false); setInviteMsg(''); }} style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-mint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>Clients</h1>
          <button onClick={() => setShowInvite(!showInvite)} style={{
            background: 'var(--accent-mint)', border: 'none', borderRadius: 20,
            padding: '6px 14px', fontSize: 13, fontWeight: 600, color: '#000',
          }}>+ Invite</button>
        </div>

        {showInvite && (
          <div className="card" style={{ marginBottom: 16, border: '1px solid var(--accent-mint)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Invite New Client</h3>
            <input placeholder="Client Name" value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} className="input-field" style={{ marginBottom: 8, fontSize: 14 }} />
            <input placeholder="Client Email" type="email" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} className="input-field" style={{ marginBottom: 12, fontSize: 14 }} />
            <button className="btn-primary" onClick={inviteClient} style={{ fontSize: 14 }}>Send Invite</button>
            {inviteMsg && <p style={{ fontSize: 12, color: 'var(--accent-mint)', marginTop: 8, textAlign: 'center' }}>{inviteMsg}</p>}
          </div>
        )}

        {clients.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-card)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)',
            }}>
              {c.name?.substring(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.email} · 🔥 {c.streak || 0} day streak</p>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.workouts_completed || 0} workouts</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Coach Profile */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', background: 'var(--accent-mint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px', fontSize: 32, fontWeight: 700, color: '#000',
        }}>
          {user?.name?.charAt(0)?.toUpperCase() || 'C'}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>{user?.name || 'Coach'}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{user?.email}</p>
      </div>

      {/* Membership */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Membership</p>
          <p style={{ fontSize: 18, fontWeight: 700 }}>Elite</p>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Billed as per your contract</p>
      </div>

      {/* Clients */}
      <div onClick={() => setShowClients(true)} className="card-sm" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginTop: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Clients</span>
        </div>
        <ChevronRight />
      </div>

      {/* Activity Feed */}
      <div onClick={() => setShowActivity(true)} className="card-sm" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginTop: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Activity Feed</span>
        </div>
        <ChevronRight />
      </div>

      {/* Settings */}
      <div className="card" style={{ marginTop: 12 }}>
        {[
          { label: 'Explore', desc: 'The on-demand content available for your clients' },
          { label: 'Leads Landing Page', desc: 'The landing page shown to new users' },
          { label: 'App Launch Page', desc: 'The screen someone sees when they launch the app' },
          { label: 'About Company', desc: 'How clients see your company profile' },
        ].map(({ label, desc }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 0', borderBottom: '1px solid var(--divider)', cursor: 'pointer',
          }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 500 }}>{label}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{desc}</p>
            </div>
            <ChevronRight />
          </div>
        ))}
      </div>

      {/* Support */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', borderBottom: '1px solid var(--divider)', cursor: 'pointer',
        }}>
          <p style={{ fontSize: 15, fontWeight: 500 }}>Talk to Us</p>
          <ChevronRight />
        </div>
        <button
          onClick={logout}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0',
            background: 'none', color: 'var(--accent-mint)', fontSize: 15, fontWeight: 500,
            width: '100%',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Logout
        </button>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '24px 0', marginTop: 8 }}>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Ageless Movement Coach</p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>ver. 1.0.0</p>
      </div>
    </div>
  );
}
