import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const API = '/api';

const formatMoney = (cents, currency = 'USD') => {
  if (!cents) return 'Free';
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency + ' ';
  return `${symbol}${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
};

const formatDateLong = (iso) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

// ---------------------------------------------------------------------------
// Main Events page - list of coaches + my upcoming/past bookings
// ---------------------------------------------------------------------------
export default function Events() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bookMode = searchParams.get('book') === '1';
  const [view, setView] = useState('home'); // 'home' | 'coach' | 'book' | 'confirmed'
  const [selectedCoachId, setSelectedCoachId] = useState(null);
  const [selectedSessionType, setSelectedSessionType] = useState(null);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [scheduledEvents, setScheduledEvents] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [registeringId, setRegisteringId] = useState(null);
  // Format filter for the Upcoming Events list. 'all' shows everything.
  const [formatFilter, setFormatFilter] = useState('all');

  const fetchCoaches = async () => {
    const res = await fetch(`${API}/coaches`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setCoaches(data.coaches || []);
    }
  };

  const fetchBookings = async () => {
    const res = await fetch(`${API}/coaches/me/bookings`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setMyBookings(data.bookings || []);
    }
  };

  const fetchScheduledEvents = async () => {
    const res = await fetch(`${API}/coaches/events`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setScheduledEvents(data.events || []);
    }
  };

  const fetchMyRegistrations = async () => {
    const res = await fetch(`${API}/coaches/events/mine`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setMyRegistrations(data.events || []);
    }
  };

  const [paymentPrompt, setPaymentPrompt] = useState(null); // { eventId, title, price_cents, currency }

  const handleRegister = async (eventId) => {
    setRegisteringId(eventId);
    const res = await fetch(`${API}/coaches/events/${eventId}/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.status === 402) {
      // Paid event -- show payment info
      const data = await res.json();
      setPaymentPrompt({ eventId, title: data.title, price_cents: data.price_cents, currency: data.currency });
      setRegisteringId(null);
      return;
    }
    if (res.ok) {
      fetchScheduledEvents();
      fetchMyRegistrations();
    }
    setRegisteringId(null);
  };

  const handleCancelRegistration = async (eventId) => {
    setRegisteringId(eventId);
    const res = await fetch(`${API}/coaches/events/${eventId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      fetchScheduledEvents();
      fetchMyRegistrations();
    }
    setRegisteringId(null);
  };

  useEffect(() => {
    if (!token) return;
    fetchCoaches();
    fetchBookings();
    fetchScheduledEvents();
    fetchMyRegistrations();
  }, [token]);

  // ---- view: coach profile ------------------------------------------------
  if (view === 'coach' && selectedCoachId) {
    return (
      <CoachProfileView
        coachId={selectedCoachId}
        token={token}
        onBack={() => setView('home')}
        onBook={(sessionType) => {
          setSelectedSessionType(sessionType);
          setView('book');
        }}
      />
    );
  }

  // ---- view: booking flow -------------------------------------------------
  if (view === 'book' && selectedCoachId && selectedSessionType) {
    return (
      <BookSessionView
        coachId={selectedCoachId}
        sessionType={selectedSessionType}
        token={token}
        onBack={() => setView('coach')}
        onConfirmed={(booking) => {
          setConfirmedBooking(booking);
          setView('confirmed');
          fetchBookings();
        }}
      />
    );
  }

  // ---- view: confirmation ------------------------------------------------
  if (view === 'confirmed' && confirmedBooking) {
    return (
      <ConfirmedView
        booking={confirmedBooking}
        onBack={() => {
          setView('home');
          setSelectedSessionType(null);
        }}
      />
    );
  }

  // ---- view: home (default) -----------------------------------------------
  const upcoming = myBookings.filter((b) => new Date(b.scheduled_at) >= new Date() && b.status !== 'cancelled');
  const past = myBookings.filter((b) => new Date(b.scheduled_at) < new Date() || b.status === 'cancelled');

  return (
    <div className="page-content">
      {/* Payment prompt for paid events */}
      {paymentPrompt && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 16, padding: 24,
            maxWidth: 360, width: '100%', textAlign: 'center',
          }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>💳</p>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{paymentPrompt.title}</h3>
            <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', marginBottom: 12 }}>
              {formatMoney(paymentPrompt.price_cents, paymentPrompt.currency)}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
              This is a paid event. Payment integration is coming soon.
              Contact your coach to arrange payment and they can register you manually.
            </p>
            <button
              onClick={() => setPaymentPrompt(null)}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
                padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {bookMode ? (
        <BackBar title="Book a Session" onBack={() => navigate('/home')} />
      ) : (
        <div className="page-header">
          <h1>Events</h1>
        </div>
      )}

      {/* Meet the Team */}
      <div className="section-header">
        <h2>{bookMode ? 'Choose a Coach' : 'Meet the Team'}</h2>
      </div>
      <div
        className="hide-scrollbar"
        style={{ display: 'flex', gap: 16, overflowX: 'auto', margin: '0 -16px 24px', padding: '4px 16px 8px' }}
      >
        {coaches.length === 0 && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No coaches yet.</div>
        )}
        {coaches.map((coach) => (
          <button
            key={coach.id}
            onClick={() => {
              setSelectedCoachId(coach.id);
              setView('coach');
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              textAlign: 'center',
              minWidth: 110,
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: '50%',
                margin: '0 auto 10px',
                background: coach.photo_url || coach.avatar_url
                  ? `url(${coach.photo_url || coach.avatar_url}) center/cover`
                  : 'linear-gradient(135deg, #FF8C00, #FFB347)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--accent)',
              }}
            >
              {!coach.photo_url && !coach.avatar_url && (
                <span style={{ fontSize: 34, fontWeight: 800, color: '#000' }}>
                  {coach.name?.charAt(0) || 'C'}
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>Coach</p>
            <p style={{ fontSize: 14, fontWeight: 700 }}>{coach.name?.replace(/^Coach\s+/i, '')}</p>
          </button>
        ))}
      </div>

      {/* Scheduled Events (masterclasses, webinars, in-person) */}
      {!bookMode && scheduledEvents.length > 0 && (() => {
        // Format filter chips - only show chips for formats that actually have events
        const presentFormats = Array.from(new Set(scheduledEvents.map((e) => e.event_format).filter(Boolean)));
        const chipDefs = [
          { value: 'all',          label: 'All' },
          { value: 'webinar',      label: 'Webinar' },
          { value: 'masterclass',  label: 'Masterclass' },
          { value: 'follow_along', label: 'Follow-along' },
          { value: 'in_person',    label: 'In-person' },
          { value: 'workshop',     label: 'Workshop' },
        ].filter((c) => c.value === 'all' || presentFormats.includes(c.value));
        const visibleEvents = formatFilter === 'all'
          ? scheduledEvents
          : scheduledEvents.filter((e) => e.event_format === formatFilter);
        return (
        <>
          <div className="section-header">
            <h2>Upcoming Events</h2>
          </div>
          {chipDefs.length > 2 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 12 }}>
              {chipDefs.map((chip) => {
                const active = formatFilter === chip.value;
                return (
                  <button
                    key={chip.value}
                    onClick={() => setFormatFilter(chip.value)}
                    style={{
                      padding: '6px 14px', borderRadius: 18, border: 'none', flexShrink: 0,
                      background: active ? 'var(--accent)' : 'var(--bg-card)',
                      color: active ? '#fff' : 'var(--text-secondary)',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          )}
          {visibleEvents.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20, textAlign: 'center', padding: 16 }}>
              No {chipDefs.find((c) => c.value === formatFilter)?.label.toLowerCase()} events coming up.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {visibleEvents.map((evt) => {
              const registered = evt.is_registered;
              const full = evt.capacity && evt.registration_count >= evt.capacity;
              const formatLabels = {
                webinar: 'Webinar',
                masterclass: 'Masterclass',
                follow_along: 'Follow-along',
                in_person: 'In-person',
                workshop: 'Workshop',
              };
              const formatColors = {
                webinar: '#3DFFD2',
                masterclass: '#FFB347',
                follow_along: '#7DD3FC',
                in_person: '#C084FC',
                workshop: '#FB923C',
              };
              const fColor = formatColors[evt.event_format] || '#FFB347';
              return (
                <div
                  key={evt.id}
                  className="card"
                  style={{
                    borderLeft: `4px solid ${fColor}`,
                    overflow: 'hidden',
                    padding: 0,
                  }}
                >
                  {evt.thumbnail_url && (
                    <img
                      src={evt.thumbnail_url}
                      alt={evt.title}
                      style={{
                        width: '100%', display: 'block',
                        borderRadius: '12px 12px 0 0',
                        objectFit: 'cover',
                      }}
                    />
                  )}
                  <div style={{ padding: '12px 14px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 8,
                          background: `${fColor}22`, color: fColor,
                          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6,
                        }}>
                          {formatLabels[evt.event_format] || evt.event_format}
                        </span>
                        <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{evt.title}</p>
                      </div>
                      {evt.price_cents > 0 && (
                        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', flexShrink: 0, marginLeft: 8 }}>
                          {formatMoney(evt.price_cents, evt.currency)}
                        </span>
                      )}
                      {!evt.price_cents && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#3DFFD2', flexShrink: 0, marginLeft: 8 }}>
                          Free
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 4 }}>
                      {formatDateLong(evt.scheduled_at)} at {formatTime(evt.scheduled_at)}
                      {evt.duration_minutes ? ` (${evt.duration_minutes} min)` : ''}
                    </p>
                    {evt.location && (
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                        {evt.location}
                      </p>
                    )}
                    {evt.description && (
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4 }}>
                        {evt.description.length > 120 ? evt.description.slice(0, 120) + '...' : evt.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      {registered ? (
                        <>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '8px 14px', borderRadius: 8,
                            background: 'rgba(61,255,210,0.15)', color: '#3DFFD2',
                            fontSize: 12, fontWeight: 700,
                          }}>
                            ✓ Registered
                          </span>
                          <button
                            onClick={() => handleCancelRegistration(evt.id)}
                            disabled={registeringId === evt.id}
                            style={{
                              background: 'rgba(220,38,38,0.12)', color: '#FF5E5E',
                              border: 'none', borderRadius: 8, padding: '8px 16px',
                              fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            {registeringId === evt.id ? '...' : 'Cancel'}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleRegister(evt.id)}
                          disabled={registeringId === evt.id || full}
                          style={{
                            background: full ? 'var(--bg-card)' : 'var(--accent)',
                            color: full ? 'var(--text-tertiary)' : '#fff',
                            border: 'none', borderRadius: 8, padding: '8px 16px',
                            fontSize: 12, fontWeight: 700, cursor: full ? 'default' : 'pointer',
                          }}
                        >
                          {full
                            ? 'Sold Out'
                            : registeringId === evt.id
                            ? 'Registering...'
                            : evt.price_cents > 0
                            ? `Register - ${formatMoney(evt.price_cents, evt.currency)}`
                            : 'Register - Free'}
                        </button>
                      )}
                      {evt.capacity && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {evt.registration_count || 0}/{evt.capacity} spots
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
        );
      })()}

      {/* My Registered Events */}
      {!bookMode && myRegistrations.length > 0 && (
        <>
          <div className="section-header">
            <h2>My Events</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {myRegistrations.map((evt) => (
              <div
                key={evt.id}
                className="card"
                style={{ borderLeft: '4px solid var(--accent-mint)', marginBottom: 0 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{evt.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--accent)' }}>
                      {formatDateLong(evt.scheduled_at)} at {formatTime(evt.scheduled_at)}
                    </p>
                    {evt.location && (
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{evt.location}</p>
                    )}
                    {evt.meeting_url && new Date(evt.scheduled_at) > new Date() && (
                      <a
                        href={evt.meeting_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 12, color: '#fff', fontWeight: 700, marginTop: 6,
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          background: 'var(--accent)', borderRadius: 8, padding: '6px 12px',
                          textDecoration: 'none',
                        }}
                      >
                        {evt.meeting_url.includes('zoom') ? '🎥 Join Zoom'
                          : evt.meeting_url.includes('riverside') ? '🎙 Join Riverside'
                          : evt.meeting_url.includes('meet.google') ? '📹 Join Google Meet'
                          : '🔗 Join Event'}
                      </a>
                    )}
                  </div>
                  <div style={{
                    padding: '4px 10px', borderRadius: 12,
                    background: 'rgba(61,255,210,0.15)', color: '#3DFFD2',
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  }}>
                    Registered
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 1:1 Sessions */}
      <div className="section-header">
        <h2>Upcoming Sessions</h2>
      </div>
      {upcoming.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-tertiary)' }}
        >
          <p style={{ fontSize: 14, marginBottom: 6 }}>No upcoming sessions yet.</p>
          <p style={{ fontSize: 12 }}>Tap a coach above to book a 1:1 call.</p>
        </div>
      ) : (
        upcoming.map((b) => <BookingCard key={b.id} booking={b} token={token} onCancelled={fetchBookings} />)
      )}

      {/* Past */}
      {past.length > 0 && (
        <>
          <div className="section-header" style={{ marginTop: 24 }}>
            <h2>Past</h2>
          </div>
          {past.map((b) => <BookingCard key={b.id} booking={b} dim token={token} />)}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upcoming/past booking card
// ---------------------------------------------------------------------------
function BookingCard({ booking, dim, token, onCancelled }) {
  const [cancelling, setCancelling] = useState(false);
  const isUpcoming = !dim && booking.status !== 'cancelled' && new Date(booking.scheduled_at) > new Date();

  const cancel = async () => {
    if (!window.confirm(`Cancel ${booking.session_title || 'this session'} with ${booking.coach_name}?`)) return;
    setCancelling(true);
    try {
      const res = await fetch(`${API}/coaches/me/bookings/${booking.id}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) onCancelled?.();
    } catch (err) { console.error(err); }
    setCancelling(false);
  };

  return (
    <div
      className="card"
      style={{
        borderLeft: `4px solid ${dim ? 'var(--text-tertiary)' : 'var(--accent-mint)'}`,
        opacity: dim ? 0.6 : 1,
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
            {booking.session_title || `${booking.duration_minutes} min session`}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>
            with {booking.coach_name}
          </p>
          <p style={{ fontSize: 12, color: 'var(--accent)' }}>
            {formatDateLong(booking.scheduled_at)} at {formatTime(booking.scheduled_at)}
          </p>
        </div>
        <StatusBadge status={booking.status} paymentStatus={booking.payment_status} />
      </div>
      {isUpcoming && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={cancel}
            disabled={cancelling}
            style={{
              background: 'none', border: '1px solid var(--divider)',
              color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600,
              padding: '6px 12px', borderRadius: 6, cursor: cancelling ? 'default' : 'pointer',
              opacity: cancelling ? 0.5 : 1,
            }}
          >
            {cancelling ? 'Cancelling...' : 'Cancel booking'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-format cards used on the coach profile page
// ─────────────────────────────────────────────────────────────────────

// Standard 1:1 session card - tapping opens the slot picker
function SessionTypeCard({ st, accent, onBook }) {
  return (
    <div
      key={st.id}
      onClick={() => onBook(st)}
      className="card"
      style={{
        marginBottom: 12, cursor: 'pointer',
        border: `1px solid ${hexToRgba(accent, 0.2)}`,
        padding: 0, overflow: 'hidden',
      }}
    >
      {st.thumbnail_url && (
        <img src={st.thumbnail_url} alt={st.title}
          style={{ width: '100%', display: 'block', objectFit: 'cover', maxHeight: 180 }} />
      )}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: st.thumbnail_url ? '10px 14px' : '14px' }}>
        {!st.thumbnail_url && (
          <div style={{
            background: `linear-gradient(135deg, ${accent}, ${hexToRgba(accent, 0.7)})`,
            borderRadius: 12, padding: '18px 14px', minWidth: 88, textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#000', lineHeight: 1 }}>{st.duration_minutes}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#000' }}>mins</div>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{st.title}</p>
          {st.description && (
            <p style={{
              fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.4,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{st.description}</p>
          )}
          <p style={{ fontSize: 15, fontWeight: 800, color: accent }}>
            {st.duration_minutes} min · {formatMoney(st.price_cents, st.currency)}
          </p>
        </div>
        <span style={{ fontSize: 22, color: 'var(--text-tertiary)' }}>›</span>
      </div>
    </div>
  );
}

// Follow-along session - async content, no slot picker needed. "Watch anytime"
// CTA. If a meeting_url is set we treat it as a direct content link (Vimeo,
// YouTube unlisted, etc.), otherwise the client contacts the coach for access.
function FollowAlongCard({ st, accent }) {
  const hasLink = !!st.meeting_url;
  return (
    <div
      className="card"
      style={{
        marginBottom: 12,
        border: `1px solid ${hexToRgba(accent, 0.2)}`,
        padding: 0, overflow: 'hidden',
      }}
    >
      {st.thumbnail_url && (
        <img src={st.thumbnail_url} alt={st.title}
          style={{ width: '100%', display: 'block', objectFit: 'cover', maxHeight: 180 }} />
      )}
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
            background: hexToRgba(accent, 0.15), color: accent,
            textTransform: 'uppercase', letterSpacing: 0.4,
          }}>Follow-along · {st.duration_minutes} min</span>
        </div>
        <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{st.title}</p>
        {st.description && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.45 }}>
            {st.description}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: accent }}>
            {formatMoney(st.price_cents, st.currency)}
          </p>
          <a
            href={hasLink ? st.meeting_url : undefined}
            target="_blank" rel="noreferrer"
            onClick={(e) => { if (!hasLink) e.preventDefault(); }}
            style={{
              background: hasLink ? accent : 'rgba(255,255,255,0.08)',
              color: hasLink ? '#000' : 'var(--text-tertiary)',
              padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13,
              textDecoration: 'none',
              pointerEvents: hasLink ? 'auto' : 'none',
            }}
          >
            {hasLink ? '▶ Watch anytime' : 'Coming soon'}
          </a>
        </div>
      </div>
    </div>
  );
}

// Scheduled group event card (webinar / masterclass / in_person) - registers
// or cancels via /events/:id/register|cancel. Shows capacity and format.
function CoachEventCard({ event, accent, token }) {
  const [state, setState] = useState({
    is_registered: event.is_registered,
    spots_left: event.spots_left,
    loading: false,
    error: null,
  });
  const full = state.spots_left === 0 && !state.is_registered;

  const toggle = async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const path = state.is_registered ? 'cancel' : 'register';
      const res = await fetch(`${API}/coaches/events/${event.id}/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 402) {
        setState(s => ({ ...s, loading: false, error: 'Paid event - contact your coach to register.' }));
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState(s => ({ ...s, loading: false, error: data.error || 'Something went wrong' }));
        return;
      }
      setState(s => ({
        ...s,
        is_registered: !s.is_registered,
        spots_left: s.spots_left == null ? null : s.spots_left + (s.is_registered ? 1 : -1),
        loading: false,
      }));
    } catch {
      setState(s => ({ ...s, loading: false, error: 'Network error' }));
    }
  };

  const fmtLabel = (event.event_format || 'event').replace(/_/g, ' ');

  return (
    <div
      className="card"
      style={{
        marginBottom: 12,
        border: `1px solid ${hexToRgba(accent, 0.2)}`,
        padding: 14,
        borderLeft: state.is_registered ? `4px solid ${accent}` : `1px solid ${hexToRgba(accent, 0.2)}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
              background: hexToRgba(accent, 0.15), color: accent,
              textTransform: 'uppercase', letterSpacing: 0.4,
            }}>{fmtLabel}</span>
            {state.is_registered && (
              <span style={{
                fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                background: 'rgba(61,255,210,0.15)', color: '#3DFFD2',
                textTransform: 'uppercase', letterSpacing: 0.4,
              }}>Registered</span>
            )}
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{event.title}</p>
          <p style={{ fontSize: 12, color: accent, fontWeight: 600 }}>
            {formatDateLong(event.scheduled_at)} at {formatTime(event.scheduled_at)}
            {event.duration_minutes ? ` · ${event.duration_minutes}min` : ''}
          </p>
          {event.location && (
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              📍 {event.location}
            </p>
          )}
          {event.capacity && (
            <p style={{ fontSize: 11, color: state.spots_left === 0 ? '#ef4444' : 'var(--text-tertiary)', marginTop: 4 }}>
              {state.spots_left === 0 ? 'Full' : `${state.spots_left} of ${event.capacity} spots left`}
            </p>
          )}
        </div>
        <p style={{ fontSize: 14, fontWeight: 800, color: accent, flexShrink: 0 }}>
          {event.price_cents > 0 ? formatMoney(event.price_cents, event.currency) : 'Free'}
        </p>
      </div>
      {state.error && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{state.error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          onClick={toggle}
          disabled={state.loading || full}
          style={{
            background: state.is_registered ? 'rgba(255,255,255,0.08)'
              : full ? 'rgba(255,255,255,0.04)'
              : accent,
            color: state.is_registered ? 'var(--text-primary)'
              : full ? 'var(--text-tertiary)'
              : '#000',
            padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13,
            border: 'none', cursor: state.loading || full ? 'default' : 'pointer',
            opacity: state.loading ? 0.5 : 1,
          }}
        >
          {state.loading ? '...' : state.is_registered ? 'Cancel registration' : full ? 'Full' : 'Register'}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status, paymentStatus }) {
  const color =
    status === 'confirmed'
      ? '#3DFFD2'
      : status === 'pending'
      ? '#FFB347'
      : status === 'cancelled'
      ? '#FF5E5E'
      : '#888';
  return (
    <div style={{ textAlign: 'right' }}>
      <div
        style={{
          display: 'inline-block',
          padding: '4px 10px',
          borderRadius: 12,
          background: `${color}22`,
          color,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        {status}
      </div>
      {paymentStatus && paymentStatus !== 'free' && (
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
          {paymentStatus === 'stub' ? 'payment pending' : paymentStatus}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coach profile detail view
// ---------------------------------------------------------------------------
// Convert #RRGGBB to an rgba() string at the given alpha
const hexToRgba = (hex, alpha = 1) => {
  if (!hex) return `rgba(255,140,0,${alpha})`;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

// Social icon in the footer row
const SocialIcon = ({ type, href, color }) => {
  if (!href) return null;
  const paths = {
    instagram: <><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></>,
    facebook: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>,
    youtube: <><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></>,
    tiktok: <path d="M19.5 6.5a4.5 4.5 0 0 1-4.5-4.5h-3v14a2.5 2.5 0 1 1-2.5-2.5V11a5.5 5.5 0 1 0 5.5 5.5V9.27a7.5 7.5 0 0 0 4.5 1.48z"/>,
    website: <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
        width: 40, height: 40, borderRadius: '50%',
        border: `1.5px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {paths[type]}
      </svg>
    </a>
  );
};

// Orange/green section label pill that echoes the PDF's header blocks
const SectionLabel = ({ color, children }) => (
  <div style={{ display: 'inline-block', marginBottom: 12 }}>
    <div style={{
      display: 'inline-block', padding: '6px 16px',
      background: color, color: '#000',
      fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
      clipPath: 'polygon(0 0, 100% 0, 95% 100%, 0% 100%)',
    }}>
      {children}
    </div>
  </div>
);

function CoachProfileView({ coachId, token, onBack, onBook }) {
  const [data, setData] = useState(null);
  const [bookingOpen, setBookingOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`${API}/coaches/${coachId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setData(await res.json());
    })();
  }, [coachId, token]);

  if (!data) return <div className="page-content">Loading...</div>;

  const coach = data.coach;
  const accent = coach.accent_color || '#FF8C00';
  const firstName = coach.name?.replace(/^Coach\s+/i, '') || 'Coach';
  const socials = coach.social_links || {};

  return (
    <div className="page-content" style={{ paddingBottom: 120, padding: 0 }}>
      <div style={{ padding: '0 16px' }}>
        <BackBar title={firstName} onBack={onBack} />
      </div>

      {/* Hero - photo + name block mirroring the PDF cover */}
      <div style={{
        position: 'relative',
        margin: '0 -16px',
        background: `linear-gradient(180deg, ${hexToRgba(accent, 0.18)} 0%, transparent 100%)`,
        padding: '8px 16px 20px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 14,
        }}>
          <div
            style={{
              width: 130, height: 170, borderRadius: 16, flexShrink: 0, overflow: 'hidden',
              background: `linear-gradient(135deg, ${accent}, ${hexToRgba(accent, 0.6)})`,
              border: `3px solid ${accent}`,
              boxShadow: `0 12px 28px ${hexToRgba(accent, 0.25)}`,
            }}
          >
            {coach.photo_url || coach.avatar_url ? (
              <img
                src={coach.photo_url || coach.avatar_url}
                alt={coach.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 20%', display: 'block' }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 64, fontWeight: 900, color: '#000',
              }}>
                {coach.name?.charAt(0)}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 6 }}>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              Coach
            </p>
            <h1 style={{
              fontSize: 34, fontWeight: 900, lineHeight: 1,
              margin: '2px 0 10px', textTransform: 'uppercase', letterSpacing: -1,
            }}>
              {firstName}
            </h1>
            {coach.tagline && (
              <p style={{ fontSize: 12, color: accent, fontWeight: 700, lineHeight: 1.3, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {coach.tagline}
              </p>
            )}
            {coach.years_experience != null && (
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {coach.years_experience}+ years experience
              </p>
            )}
          </div>
        </div>

        {/* Specialties */}
        {coach.specialties?.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {coach.specialties.map((s) => (
              <span
                key={s}
                style={{
                  padding: '5px 12px', borderRadius: 14,
                  background: hexToRgba(accent, 0.15),
                  color: accent, fontSize: 11, fontWeight: 700,
                }}
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        {/* Intro / bio */}
        {coach.bio && (
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', marginBottom: 20 }}>
            {coach.bio}
          </p>
        )}

        {/* What sets me apart (origin story) */}
        {coach.origin_story && (
          <>
            <SectionLabel color={accent}>What sets me apart</SectionLabel>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', marginBottom: 20 }}>
              {coach.origin_story}
            </p>
          </>
        )}

        {/* Pull quote */}
        {coach.pull_quote && (
          <div style={{
            background: hexToRgba(accent, 0.08),
            borderLeft: `3px solid ${accent}`,
            padding: '14px 16px',
            borderRadius: 10,
            marginBottom: 22,
          }}>
            <p style={{
              fontSize: 13, fontStyle: 'italic', lineHeight: 1.55,
              color: 'var(--text-secondary)',
            }}>
              &ldquo;{coach.pull_quote}&rdquo;
            </p>
          </div>
        )}

        {/* Ways I can help bullets */}
        {coach.help_bullets?.length > 0 && (
          <>
            <SectionLabel color={accent}>Ways {firstName.split(' ')[0]} can help</SectionLabel>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px' }}>
              {coach.help_bullets.map((b, i) => (
                <li key={i} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)', marginBottom: 10,
                }}>
                  <span style={{
                    flexShrink: 0, width: 7, height: 7, borderRadius: '50%',
                    background: accent, marginTop: 8,
                  }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Qualifications */}
        {coach.qualifications && (
          <>
            <SectionLabel color={accent}>Credentials</SectionLabel>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', marginBottom: 22 }}>
              {coach.qualifications}
            </p>
          </>
        )}

        {/* Book Now CTA - tap to expand session options */}
        <button
          type="button"
          onClick={() => setBookingOpen((v) => !v)}
          aria-expanded={bookingOpen}
          style={{
            width: '100%', textAlign: 'center', cursor: 'pointer',
            background: `linear-gradient(135deg, ${accent}, ${hexToRgba(accent, 0.7)})`,
            border: 'none', borderRadius: 14,
            padding: '18px 20px',
            marginBottom: bookingOpen ? 16 : 20,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            position: 'relative',
            boxShadow: `0 6px 20px ${hexToRgba(accent, 0.25)}`,
          }}
        >
          <p style={{ fontSize: 24, fontWeight: 900, color: '#000', lineHeight: 1, letterSpacing: -0.5, margin: 0 }}>
            BOOK NOW
          </p>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#000', marginTop: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {bookingOpen ? 'Pick a session below' : 'Tap to see 1:1 options'}
          </p>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', right: 18, top: '50%',
              transform: `translateY(-50%) rotate(${bookingOpen ? 180 : 0}deg)`,
              transition: 'transform 220ms ease',
              fontSize: 18, color: '#000', fontWeight: 900, lineHeight: 1,
            }}
          >
            ▾
          </span>
        </button>

        {/* Session types - split by format.
            - one_on_one (or legacy NULL) go through the slot-picker booking flow
            - follow_along renders as a "Watch anytime" info card (async content)
            - webinar/masterclass/in_person come from coach_events, not here - hidden from this list */}
        {bookingOpen && (() => {
          const oneOnOne = data.session_types.filter(st => !st.event_format || st.event_format === 'one_on_one');
          const followAlong = data.session_types.filter(st => st.event_format === 'follow_along');

          if (oneOnOne.length === 0 && followAlong.length === 0) {
            return (
              <div className="card" style={{ color: 'var(--text-tertiary)', textAlign: 'center' }}>
                This coach is not taking bookings yet.
              </div>
            );
          }

          return (
            <>
              {oneOnOne.length > 0 && (
                <>
                  <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                    1:1 sessions
                  </p>
                  {oneOnOne.map((st) => <SessionTypeCard key={st.id} st={st} accent={accent} onBook={onBook} />)}
                </>
              )}

              {followAlong.length > 0 && (
                <>
                  <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '18px 0 10px' }}>
                    Follow-alongs · watch anytime
                  </p>
                  {followAlong.map((st) => <FollowAlongCard key={st.id} st={st} accent={accent} />)}
                </>
              )}
            </>
          );
        })()}

        {/* Upcoming group events from this coach (webinars, masterclasses, in-person).
            These come from coach_events, not session_types - separate source-of-truth. */}
        {data.events?.length > 0 && (
          <>
            <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '24px 0 10px' }}>
              Upcoming events with {firstName.split(' ')[0]}
            </p>
            {data.events.map(e => <CoachEventCard key={e.id} event={e} accent={accent} token={token} />)}
          </>
        )}

        {/* Socials footer */}
        {(socials.instagram || socials.facebook || socials.youtube || socials.tiktok || socials.website) && (
          <div style={{
            display: 'flex', gap: 12, justifyContent: 'center',
            marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--divider)',
          }}>
            <SocialIcon type="instagram" href={socials.instagram} color={accent} />
            <SocialIcon type="facebook" href={socials.facebook} color={accent} />
            <SocialIcon type="youtube" href={socials.youtube} color={accent} />
            <SocialIcon type="tiktok" href={socials.tiktok} color={accent} />
            <SocialIcon type="website" href={socials.website} color={accent} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Booking flow: pick date → time → confirm + payment
// ---------------------------------------------------------------------------
function BookSessionView({ coachId, sessionType, token, onBack, onConfirmed }) {
  const [slots, setSlots] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const res = await fetch(
        `${API}/coaches/${coachId}/slots?session_type_id=${sessionType.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots || []);
      }
    })();
  }, [coachId, sessionType.id, token]);

  // Group slots by date
  const byDate = slots.reduce((acc, s) => {
    (acc[s.date] = acc[s.date] || []).push(s);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort();

  const handleConfirm = async () => {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API}/coaches/${coachId}/bookings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_type_id: sessionType.id,
          scheduled_at: selectedSlot.iso,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');
      // If a checkout_url is returned (real Stripe), redirect to it.
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      onConfirmed({
        ...data,
        scheduled_at: selectedSlot.iso,
        duration_minutes: sessionType.duration_minutes,
        session_title: sessionType.title,
        price_cents: sessionType.price_cents,
        currency: sessionType.currency,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-content" style={{ paddingBottom: 160 }}>
      <BackBar title="Book a Session" onBack={onBack} />

      {/* Session summary */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 14, alignItems: 'center' }}>
        <div
          style={{
            background: 'linear-gradient(135deg, #3DFFD2, #2BCCAA)',
            borderRadius: 12,
            padding: '14px 12px',
            minWidth: 72,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 800, color: '#000', lineHeight: 1 }}>
            {sessionType.duration_minutes}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#000' }}>mins</div>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 700 }}>{sessionType.title}</p>
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)', marginTop: 2 }}>
            {formatMoney(sessionType.price_cents, sessionType.currency)}
          </p>
        </div>
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase' }}>
        Select a date
      </h3>
      {dates.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
          No available slots in the next 14 days.
        </div>
      ) : (
        <div
          className="hide-scrollbar"
          style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px 24px', padding: '4px 16px' }}
        >
          {dates.map((date) => {
            const d = new Date(date + 'T12:00:00');
            const active = selectedDate === date;
            return (
              <button
                key={date}
                onClick={() => {
                  setSelectedDate(date);
                  setSelectedSlot(null);
                }}
                style={{
                  minWidth: 64,
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: 'none',
                  textAlign: 'center',
                  background: active ? 'var(--accent-mint)' : 'var(--bg-card)',
                  color: active ? '#000' : 'var(--text-primary)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <p style={{ fontSize: 10, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </p>
                <p style={{ fontSize: 20, fontWeight: 800 }}>{d.getDate()}</p>
                <p style={{ fontSize: 10, fontWeight: 600, marginTop: 2 }}>
                  {d.toLocaleDateString('en-US', { month: 'short' })}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {selectedDate && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase' }}>
            Select a time
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 24 }}>
            {(byDate[selectedDate] || []).map((slot) => {
              const active = selectedSlot?.iso === slot.iso;
              return (
                <button
                  key={slot.iso}
                  onClick={() => setSelectedSlot(slot)}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 15,
                    fontWeight: 600,
                    background: active ? 'var(--accent-mint)' : 'var(--bg-card)',
                    color: active ? '#000' : 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {slot.time}
                </button>
              );
            })}
          </div>
        </>
      )}

      {error && (
        <div
          style={{
            background: 'rgba(255, 94, 94, 0.1)',
            color: '#FF5E5E',
            padding: 12,
            borderRadius: 10,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {selectedSlot && (
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: 480,
            width: 'calc(100% - 32px)',
            padding: '12px 0',
            background: 'linear-gradient(to top, var(--bg-primary) 70%, transparent)',
          }}
        >
          <div className="card" style={{ marginBottom: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {sessionType.duration_minutes} min video call
            </p>
            <p style={{ fontSize: 15, fontWeight: 700 }}>
              {formatDateLong(selectedSlot.iso)} at {selectedSlot.time}
            </p>
            <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', marginTop: 6 }}>
              {formatMoney(sessionType.price_cents, sessionType.currency)}
            </p>
          </div>
          <button className="btn-primary" onClick={handleConfirm} disabled={submitting}>
            {submitting
              ? 'Processing...'
              : sessionType.price_cents === 0
              ? 'Confirm Booking'
              : `Pay ${formatMoney(sessionType.price_cents, sessionType.currency)} and Book`}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post-booking confirmation screen
// ---------------------------------------------------------------------------
function ConfirmedView({ booking, onBack }) {
  const isPending = booking.payment_status === 'stub';
  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      <BackBar title="" onBack={onBack} />
      <div style={{ textAlign: 'center', padding: '40px 20px 20px' }}>
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: '50%',
            background: isPending ? 'rgba(255,179,71,0.15)' : 'rgba(61,255,210,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <span style={{ fontSize: 44 }}>{isPending ? '⏳' : '✓'}</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
          {isPending ? 'Booking Requested' : 'Booking Confirmed'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
          {isPending
            ? "You'll get a confirmation once payment is processed. Your coach has been notified."
            : "You're all set. We'll send a reminder before your session."}
        </p>
        <div
          className="card"
          style={{ textAlign: 'left', maxWidth: 360, margin: '0 auto' }}
        >
          <p style={{ fontSize: 14, fontWeight: 700 }}>{booking.session_title}</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {formatDateLong(booking.scheduled_at)}
          </p>
          <p style={{ fontSize: 13, color: 'var(--accent)', marginTop: 2 }}>
            {formatTime(booking.scheduled_at)} · {booking.duration_minutes} mins
          </p>
        </div>
        <button
          className="btn-primary"
          style={{ marginTop: 24, maxWidth: 360 }}
          onClick={onBack}
        >
          Back to Events
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared back-bar
// ---------------------------------------------------------------------------
function BackBar({ title, onBack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <button
        onClick={onBack}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--bg-card)',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      {title && <h1 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h1>}
    </div>
  );
}
