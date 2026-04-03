import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ChevronRight } from '../../components/Icons';

export default function Profile({ onBack }) {
  const { user, logout } = useAuth();
  const [appearance, setAppearance] = useState('dark');

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{
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
          { icon: '👤', label: 'My Profile' },
          { icon: '🔔', label: 'Reminders' },
          { icon: '📏', label: 'Measurement Goals' },
          { icon: '⌚', label: 'Connected Apps' },
          { icon: '🔄', label: 'Unit System' },
        ].map(({ icon, label }, i) => (
          <div key={label} style={{
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
          { icon: '👥', label: 'About Dan' },
          { icon: '📋', label: 'Explore Plans' },
        ].map(({ icon, label }, i) => (
          <div key={label} style={{
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
          { icon: '⭐', label: 'Rate App' },
          { icon: '🎁', label: 'Tell a Friend' },
        ].map(({ icon, label }, i) => (
          <div key={label} style={{
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

      {/* Settings Group 4 */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--divider)', cursor: 'pointer' }}>
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
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', borderBottom: '1px solid var(--divider)', cursor: 'pointer',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>🎨</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>Appearance</span>
          </div>
          <span style={{
            fontSize: 12, fontWeight: 600, background: 'var(--bg-card)', padding: '4px 10px',
            borderRadius: 8, border: '1px solid var(--divider)',
          }}>
            {appearance.toUpperCase()}
          </span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', borderBottom: '1px solid var(--divider)', cursor: 'pointer',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>🔒</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>Change Password</span>
          </div>
          <ChevronRight />
        </div>
        <button
          onClick={logout}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
            background: 'none', border: 'none', color: 'var(--accent-mint)', fontSize: 15, fontWeight: 500,
            width: '100%',
          }}
        >
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
