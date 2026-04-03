import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SearchIcon } from '../../components/Icons';
import ClientDetail from './ClientDetail';

export default function CoachCheckins() {
  const { token } = useAuth();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientTimeline, setClientTimeline] = useState(null);

  useEffect(() => { fetchCheckins(); }, []);

  const fetchCheckins = async () => {
    try {
      const res = await fetch('/api/coach/checkins', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients);
      }
    } catch (err) { console.error(err); }
  };

  const openClient = async (client) => {
    try {
      const res = await fetch(`/api/coach/checkins/${client.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setClientTimeline(data);
      }
    } catch (err) { console.error(err); }
  };

  // Client detail view with Overview/Profile/Settings
  if (selectedClient) {
    return <ClientDetail client={selectedClient} onBack={() => setSelectedClient(null)} />;
  }

  // Check-in timeline view
  if (clientTimeline) {
    const { client, checkins, streak } = clientTimeline;
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setClientTimeline(null)} style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1, textAlign: 'center' }}>{client.name}</h1>
          <button onClick={() => setSelectedClient(client)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>
            Profile
          </button>
        </div>

        {/* Check in Now prompt */}
        <div className="card" style={{ textAlign: 'center', marginBottom: 20, border: '1px solid var(--divider)' }}>
          <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Check in Now</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Due in 2 days</p>
        </div>

        {/* Timeline */}
        {checkins.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <p style={{ color: 'var(--text-secondary)' }}>No check-ins yet</p>
          </div>
        ) : (
          checkins.map((ci, i) => (
            <div key={ci.id} style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
              {/* Timeline line + dot */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                {i < checkins.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--divider)', marginTop: 4 }} />}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>
                    {new Date(ci.date + 'T12:00:00').toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: 2 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </div>

                {/* Progress photos placeholders */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {['Front', 'Side', 'Back'].map(label => (
                    <div key={label} style={{
                      flex: 1, aspectRatio: '3/4', borderRadius: 12, background: 'var(--bg-card)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" style={{ margin: '0 auto 4px' }}>
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <p style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{label}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Weight */}
                {ci.weight && (
                  <p style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{ci.weight} kg</p>
                )}
                {ci.body_fat && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Body Fat: {ci.body_fat}%</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // Client list
  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Check-ins</h1>
        <div style={{ display: 'flex', gap: 16 }}>
          <button className="header-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          </button>
          <button className="header-icon"><SearchIcon /></button>
        </div>
      </div>

      {clients.map((client) => (
        <div
          key={client.id}
          onClick={() => openClient(client)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
            borderBottom: '1px solid var(--divider)', cursor: 'pointer',
          }}
        >
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-card)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)',
            }}>
              {client.name?.substring(0, 2).toUpperCase()}
            </div>
            <div style={{
              position: 'absolute', bottom: 0, right: 0, width: 12, height: 12,
              borderRadius: '50%', background: 'var(--success)', border: '2px solid var(--bg-primary)',
            }} />
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: 15 }}>{client.name}</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Last Check-in - {client.last_checkin || 'Never'}
            </p>
          </div>
        </div>
      ))}

      {clients.length === 0 && (
        <div className="placeholder-page"><div className="spinner" /></div>
      )}
    </div>
  );
}
