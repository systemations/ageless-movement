export default function Events() {
  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Live</h1>
      </div>

      <div className="section-header">
        <h2>1 on 1 Sessions</h2>
      </div>

      {/* Session Card */}
      <div style={{
        display: 'flex', borderRadius: 16, overflow: 'hidden', marginBottom: 12,
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
    </div>
  );
}
