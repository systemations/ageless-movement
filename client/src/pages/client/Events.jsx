import { useState } from 'react';

export default function Events() {
  const [showBooking, setShowBooking] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [booked, setBooked] = useState(false);

  const availableTimes = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

  const getNextDays = () => {
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i + 1);
      return {
        date: d.toISOString().split('T')[0],
        label: d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' }),
        dayName: d.toLocaleDateString('en-IE', { weekday: 'short' }),
        dayNum: d.getDate(),
      };
    });
  };

  if (showBooking) {
    const days = getNextDays();
    return (
      <div className="page-content" style={{ paddingBottom: 120 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => { setShowBooking(false); setSelectedDate(''); setSelectedTime(''); }} style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Book a Session</h1>
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>SELECT A DATE</h3>
        <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 24, margin: '0 -16px', padding: '0 16px' }}>
          {days.map(day => (
            <button key={day.date} onClick={() => setSelectedDate(day.date)} style={{
              minWidth: 60, padding: '12px 8px', borderRadius: 12, border: 'none', textAlign: 'center',
              background: selectedDate === day.date ? 'var(--accent-mint)' : 'var(--bg-card)',
              color: selectedDate === day.date ? '#000' : 'var(--text-primary)',
            }}>
              <p style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{day.dayName}</p>
              <p style={{ fontSize: 18, fontWeight: 700 }}>{day.dayNum}</p>
            </button>
          ))}
        </div>

        {selectedDate && (
          <>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>SELECT A TIME</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 24 }}>
              {availableTimes.map(time => (
                <button key={time} onClick={() => setSelectedTime(time)} style={{
                  padding: 14, borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 600,
                  background: selectedTime === time ? 'var(--accent-mint)' : 'var(--bg-card)',
                  color: selectedTime === time ? '#000' : 'var(--text-primary)',
                }}>{time}</button>
              ))}
            </div>
          </>
        )}

        {selectedDate && selectedTime && (
          <div style={{
            position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            maxWidth: 480, width: 'calc(100% - 32px)', padding: '12px 0',
            background: 'linear-gradient(to top, var(--bg-primary) 70%, transparent)',
          }}>
            <div className="card" style={{ marginBottom: 12, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Video Call · 15 mins · Online</p>
              <p style={{ fontSize: 16, fontWeight: 700 }}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })} at {selectedTime}
              </p>
            </div>
            <button className="btn-primary" onClick={() => { setBooked(true); setShowBooking(false); }}>Confirm Booking</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Live</h1>
      </div>

      <div className="section-header">
        <h2>1 on 1 Sessions</h2>
      </div>

      {/* Session Card */}
      <div onClick={() => setShowBooking(true)} style={{
        display: 'flex', borderRadius: 16, overflow: 'hidden', marginBottom: 12, cursor: 'pointer',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #3DFFD2, #2BCCAA)',
          padding: '24px 20px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', minWidth: 100,
        }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#000' }}>15</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#000' }}>mins</span>
        </div>
        <div style={{
          background: 'var(--bg-card)', padding: '20px 16px', flex: 1,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Video Call</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>15 mins · Online</p>
        </div>
      </div>

      {/* Booked session */}
      {booked && (
        <>
          <div className="section-header">
            <h2>Upcoming</h2>
          </div>
          <div className="card" style={{ borderLeft: '4px solid var(--accent-mint)' }}>
            <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Video Call with Coach Dan</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Upcoming'} at {selectedTime || 'TBD'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 8 }}>15 mins · Online</p>
          </div>
        </>
      )}
    </div>
  );
}
