import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

// Coach Live - mobile/coach-app view of upcoming 1:1 bookings + group event
// registrations. Replaces the old hardcoded placeholder. Pulls from the
// existing admin endpoints so coaches see the same events the client
// surface surfaces to clients. Status badges make it obvious whether a
// session is confirmed, pending, cancelled, etc.

export default function CoachLive() {
  const { token } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bRes, eRes] = await Promise.all([
          fetch('/api/coaches/admin/bookings', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/coaches/admin/events', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const bData = bRes.ok ? await bRes.json() : { bookings: [] };
        const eData = eRes.ok ? await eRes.json() : { events: [] };
        if (!cancelled) {
          setBookings(bData.bookings || []);
          setEvents(eData.events || []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return <div className="page-content"><div className="page-header"><h1>Live</h1></div><p style={{ color: 'var(--text-tertiary)' }}>Loading...</p></div>;
  }

  const now = Date.now();
  const upcomingBookings = bookings
    .filter(b => new Date(b.scheduled_at).getTime() > now && b.status !== 'cancelled')
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const pastBookings = bookings
    .filter(b => new Date(b.scheduled_at).getTime() <= now || b.status === 'cancelled')
    .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at))
    .slice(0, 10);
  const upcomingEvents = events
    .filter(e => new Date(e.scheduled_at).getTime() > now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  const hasAny = upcomingBookings.length || upcomingEvents.length || pastBookings.length;

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Live</h1>
      </div>

      {!hasAny && (
        <div className="placeholder-page">
          <div className="placeholder-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
          <h2>Nothing scheduled</h2>
          <p>No upcoming bookings or events. Set up session types and availability in the admin to start taking bookings.</p>
        </div>
      )}

      {upcomingBookings.length > 0 && (
        <>
          <div className="section-header">
            <h2>Upcoming 1:1 sessions</h2>
          </div>
          {upcomingBookings.map(b => (
            <CoachBookingCard key={b.id} booking={b} />
          ))}
        </>
      )}

      {upcomingEvents.length > 0 && (
        <>
          <div className="section-header" style={{ marginTop: 18 }}>
            <h2>Upcoming events</h2>
          </div>
          {upcomingEvents.map(e => (
            <CoachEventRow key={e.id} event={e} />
          ))}
        </>
      )}

      {pastBookings.length > 0 && (
        <>
          <div className="section-header" style={{ marginTop: 18 }}>
            <h2>Recent</h2>
          </div>
          {pastBookings.map(b => (
            <CoachBookingCard key={b.id} booking={b} dim />
          ))}
        </>
      )}
    </div>
  );
}

function CoachBookingCard({ booking, dim }) {
  const statusColor = booking.status === 'confirmed' ? '#3DFFD2'
    : booking.status === 'cancelled' ? '#ef4444'
    : booking.status === 'pending' ? '#f59e0b'
    : 'var(--text-tertiary)';
  return (
    <div
      className="card"
      style={{
        borderLeft: `4px solid ${dim ? 'var(--text-tertiary)' : statusColor}`,
        opacity: dim ? 0.6 : 1,
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
            {booking.session_title || `${booking.duration_minutes} min session`}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>
            {booking.client_name || `Client #${booking.client_user_id}`}
          </p>
          <p style={{ fontSize: 12, color: 'var(--accent)' }}>
            {new Date(booking.scheduled_at).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' })}
            {' · '}
            {new Date(booking.scheduled_at).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
          background: `${statusColor}22`, color: statusColor,
          textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0,
        }}>
          {booking.status}
        </span>
      </div>
    </div>
  );
}

function CoachEventRow({ event }) {
  const d = new Date(event.scheduled_at);
  const count = event.registration_count ?? 0;
  const capacityLabel = event.capacity ? `${count}/${event.capacity}` : `${count} registered`;
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{
          minWidth: 48, textAlign: 'center',
          background: 'rgba(255,140,0,0.12)', borderRadius: 8, padding: '6px 8px',
        }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {d.toLocaleDateString('en-IE', { month: 'short' })}
          </p>
          <p style={{ fontSize: 18, fontWeight: 800 }}>{d.getDate()}</p>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
              background: 'rgba(255,140,0,0.15)', color: 'var(--accent)',
              textTransform: 'uppercase', letterSpacing: 0.4,
            }}>
              {(event.event_format || 'event').replace(/_/g, ' ')}
            </span>
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{event.title}</p>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}
            {event.duration_minutes ? ` · ${event.duration_minutes}min` : ''}
            {' · '}{capacityLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
