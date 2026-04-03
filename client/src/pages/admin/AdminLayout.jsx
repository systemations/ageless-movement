import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ExerciseLibrary from './ExerciseLibrary';
import ProgramBuilder from './ProgramBuilder';
import ClientManager from './ClientManager';

const navItems = [
  { id: 'exercises', label: 'Exercise Library', icon: '💪' },
  { id: 'programs', label: 'Programs', icon: '📚' },
  { id: 'clients', label: 'Clients', icon: '👥' },
  { id: 'workouts', label: 'Workouts', icon: '🏋️' },
  { id: 'recipes', label: 'Recipes', icon: '🍽️' },
  { id: 'meals', label: 'Meal Plans', icon: '🥗' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const [activePage, setActivePage] = useState('exercises');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const renderPage = () => {
    switch (activePage) {
      case 'exercises': return <ExerciseLibrary />;
      case 'programs': return <ProgramBuilder />;
      case 'clients': return <ClientManager />;
      default: return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{navItems.find(n => n.id === activePage)?.label}</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Coming soon — select Exercise Library or Programs to get started</p>
        </div>
      );
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', position: 'fixed', inset: 0, zIndex: 1000, maxWidth: 'none' }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? 240 : 64, flexShrink: 0, background: 'var(--bg-card)',
        borderRight: '1px solid var(--divider)', transition: 'width 0.2s',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{
          padding: '16px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid var(--divider)',
        }}>
          <img src="/logo.png" alt="AM" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
          {sidebarOpen && <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>Ageless Movement</span>}
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: '8px', overflowY: 'auto' }}>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: sidebarOpen ? '12px 14px' : '12px 0', borderRadius: 10, border: 'none',
                background: activePage === item.id ? 'rgba(61,255,210,0.12)' : 'transparent',
                color: activePage === item.id ? 'var(--accent-mint)' : 'var(--text-secondary)',
                fontSize: 14, fontWeight: activePage === item.id ? 600 : 400,
                cursor: 'pointer', marginBottom: 2, textAlign: 'left',
                justifyContent: sidebarOpen ? 'flex-start' : 'center',
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
              {sidebarOpen && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
            </button>
          ))}
        </div>

        {/* User */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--divider)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-mint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: '#000', flexShrink: 0,
          }}>
            {user?.name?.charAt(0) || 'C'}
          </div>
          {sidebarOpen && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</p>
              <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 11, padding: 0, cursor: 'pointer' }}>Logout</button>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
          padding: '10px', background: 'none', border: 'none', borderTop: '1px solid var(--divider)',
          color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12,
        }}>
          {sidebarOpen ? '◀ Collapse' : '▶'}
        </button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto', maxHeight: '100vh' }}>
        {renderPage()}
      </div>
    </div>
  );
}
