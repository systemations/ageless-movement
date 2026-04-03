import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ChevronRight } from '../../components/Icons';

export default function Profile({ onBack }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [appearance, setAppearance] = useState(theme);
  const [showSubPage, setShowSubPage] = useState(null);
  const [unitSystem, setUnitSystem] = useState({ weight: 'kg', height: 'cm' });
  const [reminders, setReminders] = useState({ workout: true, meals: true, water: false, checkin: true });
  const [password, setPassword] = useState({ current: '', newPw: '', confirm: '' });

  // Sub-pages
  if (showSubPage === 'reminders') {
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowSubPage(null)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-mint)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Reminders</h1>
        </div>
        {[
          { key: 'workout', label: 'Workout Reminders', desc: 'Daily reminder to complete your workout' },
          { key: 'meals', label: 'Meal Logging', desc: 'Remind to log your meals' },
          { key: 'water', label: 'Water Intake', desc: 'Hourly water reminders' },
          { key: 'checkin', label: 'Weekly Check-in', desc: 'Reminder to submit check-in' },
        ].map(({ key, label, desc }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--divider)' }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 500 }}>{label}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{desc}</p>
            </div>
            <button onClick={() => setReminders({ ...reminders, [key]: !reminders[key] })} style={{
              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
              background: reminders[key] ? 'var(--accent-mint)' : 'var(--divider)', transition: 'background 0.2s',
            }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: reminders[key] ? 22 : 2, transition: 'left 0.2s' }} />
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (showSubPage === 'units') {
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowSubPage(null)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-mint)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Unit System</h1>
        </div>
        {[{ key: 'weight', label: 'Weight', options: ['kg', 'lbs'] }, { key: 'height', label: 'Height', options: ['cm', 'ft/in'] }].map(({ key, label, options }) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{label}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {options.map(opt => (
                <button key={opt} onClick={() => setUnitSystem({ ...unitSystem, [key]: opt })} style={{
                  flex: 1, padding: 12, borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 600,
                  background: unitSystem[key] === opt ? 'var(--accent-mint)' : 'var(--bg-card)',
                  color: unitSystem[key] === opt ? '#000' : 'var(--text-primary)',
                }}>{opt}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (showSubPage === 'password') {
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowSubPage(null)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-mint)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Change Password</h1>
        </div>
        <div className="input-group"><label>Current Password</label><input type="password" className="input-field" value={password.current} onChange={e => setPassword({...password, current: e.target.value})} /></div>
        <div className="input-group"><label>New Password</label><input type="password" className="input-field" value={password.newPw} onChange={e => setPassword({...password, newPw: e.target.value})} /></div>
        <div className="input-group"><label>Confirm Password</label><input type="password" className="input-field" value={password.confirm} onChange={e => setPassword({...password, confirm: e.target.value})} /></div>
        <button className="btn-primary" onClick={() => { alert('Password updated!'); setShowSubPage(null); }}>Update Password</button>
      </div>
    );
  }

  if (showSubPage === 'appearance') {
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowSubPage(null)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-mint)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Appearance</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Light', 'Dark'].map(mode => (
            <button key={mode} onClick={() => { setAppearance(mode.toLowerCase()); setTheme(mode.toLowerCase()); }} style={{
              flex: 1, padding: '16px 12px', borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 600, textAlign: 'center',
              background: appearance === mode.toLowerCase() ? 'var(--accent)' : 'var(--bg-card)',
              color: appearance === mode.toLowerCase() ? '#fff' : 'var(--text-primary)',
            }}>{mode}</button>
          ))}
        </div>
      </div>
    );
  }

  if (showSubPage === 'connected') {
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowSubPage(null)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-mint)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Connected Apps</h1>
        </div>
        {[{ name: 'Apple Health', icon: '❤️', connected: false }, { name: 'Apple Watch', icon: '⌚', connected: false }, { name: 'Google Fit', icon: '💚', connected: false }].map(app => (
          <div key={app.name} className="card-sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>{app.icon}</span>
              <div>
                <p style={{ fontSize: 15, fontWeight: 500 }}>{app.name}</p>
                <p style={{ fontSize: 12, color: app.connected ? 'var(--success)' : 'var(--text-tertiary)' }}>{app.connected ? 'Connected' : 'Not connected'}</p>
              </div>
            </div>
            <button style={{ background: app.connected ? 'var(--bg-card)' : 'var(--accent-mint)', border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: app.connected ? 'var(--text-secondary)' : '#000' }}>
              {app.connected ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(-1)} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-mint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </div>

      {/* Profile */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', background: 'var(--accent-mint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px', fontSize: 32, fontWeight: 700, color: '#000',
        }}>
          {user?.name?.charAt(0)?.toUpperCase() || 'U'}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>{user?.name}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{user?.email}</p>
      </div>

      {/* Active Plan */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 0.5 }}>ACTIVE PLAN</p>
          <p style={{ fontSize: 16, fontWeight: 700 }}>COACHES</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>26 Jun - 05 Jun 2029</p>
          <p style={{ fontSize: 13, fontWeight: 600 }}>258 Weeks</p>
        </div>
      </div>

      {/* Settings Group 1 */}
      <div className="card" style={{ marginBottom: 12 }}>
        {[
          { icon: '👤', label: 'My Profile', action: () => setShowSubPage('profile') },
          { icon: '🔔', label: 'Reminders', action: () => setShowSubPage('reminders') },
          { icon: '📏', label: 'Measurement Goals', action: () => navigate('/progress') },
          { icon: '⌚', label: 'Connected Apps', action: () => setShowSubPage('connected') },
          { icon: '🔄', label: 'Unit System', action: () => setShowSubPage('units') },
        ].map(({ icon, label, action }, i) => (
          <div key={label} onClick={action} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 0', borderBottom: i < 4 ? '1px solid var(--divider)' : 'none',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
            </div>
            <ChevronRight />
          </div>
        ))}
      </div>

      {/* Settings Group 2 */}
      <div className="card" style={{ marginBottom: 12 }}>
        {[
          { icon: '👥', label: 'About Dan', action: () => navigate('/explore') },
          { icon: '📋', label: 'Explore Plans', action: () => navigate('/explore') },
        ].map(({ icon, label, action }, i) => (
          <div key={label} onClick={action} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 0', borderBottom: i < 1 ? '1px solid var(--divider)' : 'none',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
            </div>
            <ChevronRight />
          </div>
        ))}
      </div>

      {/* Settings Group 3 */}
      <div className="card" style={{ marginBottom: 12 }}>
        {[
          { icon: '⭐', label: 'Rate App', action: () => alert('Rating feature coming soon!') },
          { icon: '🎁', label: 'Tell a Friend', action: () => { if (navigator.share) navigator.share({ title: 'Ageless Movement', text: 'Check out this mobility coaching app!', url: window.location.origin }); else alert('Share this link: ' + window.location.origin); } },
        ].map(({ icon, label, action }, i) => (
          <div key={label} onClick={action} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 0', borderBottom: i < 1 ? '1px solid var(--divider)' : 'none',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
            </div>
            <ChevronRight />
          </div>
        ))}
      </div>

      {/* References */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div onClick={() => alert('Health recommendation sources: WHO, ACSM, NHS guidelines')} style={{ padding: '14px 0', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>🔗</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>References</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, marginLeft: 30 }}>
            Learn more about sources of health recommendations
          </p>
        </div>
      </div>

      {/* Settings Group 5 */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div onClick={() => setShowSubPage('appearance')} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', borderBottom: '1px solid var(--divider)', cursor: 'pointer',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>🎨</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>Appearance</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, background: 'var(--bg-card)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--divider)' }}>
            {appearance.toUpperCase()}
          </span>
        </div>
        <div onClick={() => setShowSubPage('password')} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', borderBottom: '1px solid var(--divider)', cursor: 'pointer',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>🔒</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>Change Password</span>
          </div>
          <ChevronRight />
        </div>
        <button onClick={logout} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
          background: 'none', border: 'none', color: 'var(--accent-mint)', fontSize: 15, fontWeight: 500, width: '100%',
        }}>
          <span style={{ fontSize: 18 }}>↩️</span>
          Logout
        </button>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0' }}>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Powered by Ageless Movement</p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>ver. 1.0.0</p>
      </div>
    </div>
  );
}
