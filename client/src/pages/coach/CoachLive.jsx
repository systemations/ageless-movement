export default function CoachLive() {
  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Live</h1>
      </div>

      <div className="section-header">
        <h2>Upcoming Bookings</h2>
      </div>

      <div className="placeholder-page">
        <div className="placeholder-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2">
            <polygon points="23 7 16 12 23 17 23 7"/>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>
        </div>
        <h2>No Upcoming Bookings</h2>
        <p>There are no upcoming bookings.</p>
      </div>
    </div>
  );
}
