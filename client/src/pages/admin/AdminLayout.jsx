import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ExerciseLibrary from './ExerciseLibrary';
import ProgramBuilder from './ProgramBuilder';
import ClientManager from './ClientManager';

const navItems = [
  { id: 'fitness', label: 'Fitness', icon: '💪', children: [
    { id: 'exercises', label: 'Exercises' },
    { id: 'programs', label: 'Programs' },
    { id: 'workouts', label: 'Workouts' },
    { id: 'schedules', label: 'Schedules' },
  ]},
  { id: 'nutrition', label: 'Nutrition', icon: '🍽️', children: [
    { id: 'recipes', label: 'Recipes' },
    { id: 'meals', label: 'Meal Plans' },
  ]},
  { id: 'clients', label: 'Clients', icon: '👥' },
  { id: 'explore', label: 'Explore', icon: '🔍' },
  { id: 'challenges', label: 'Challenges', icon: '🏆' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const [activePage, setActivePage] = useState('exercises');
  const [expandedMenus, setExpandedMenus] = useState(['fitness']);
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
            <div key={item.id}>
              <button
                onClick={() => {
                  if (item.children) {
                    setExpandedMenus(prev => prev.includes(item.id) ? prev.filter(x => x !== item.id) : [...prev, item.id]);
                  } else {
                    setActivePage(item.id);
                  }
                }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: sidebarOpen ? '12px 14px' : '12px 0', borderRadius: 10, border: 'none',
                  background: (item.children ? item.children.some(c => c.id === activePage) : activePage === item.id) ? 'rgba(255,140,0,0.1)' : 'transparent',
                  color: (item.children ? item.children.some(c => c.id === activePage) : activePage === item.id) ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 14, fontWeight: (item.children ? item.children.some(c => c.id === activePage) : activePage === item.id) ? 600 : 400,
                  cursor: 'pointer', marginBottom: 2, textAlign: 'left',
                  justifyContent: sidebarOpen ? 'flex-start' : 'center',
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                {sidebarOpen && <span style={{ whiteSpace: 'nowrap', flex: 1 }}>{item.label}</span>}
                {sidebarOpen && item.children && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform: expandedMenus.includes(item.id) ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                )}
              </button>
              {/* Sub-items */}
              {item.children && expandedMenus.includes(item.id) && sidebarOpen && (
                <div style={{ marginLeft: 32, marginBottom: 4 }}>
                  {item.children.map(child => (
                    <button key={child.id} onClick={() => setActivePage(child.id)} style={{
                      width: '100%', display: 'block', padding: '8px 14px', borderRadius: 8, border: 'none',
                      background: activePage === child.id ? 'rgba(255,140,0,0.15)' : 'transparent',
                      color: activePage === child.id ? 'var(--accent)' : 'var(--text-tertiary)',
                      fontSize: 13, fontWeight: activePage === child.id ? 600 : 400,
                      cursor: 'pointer', textAlign: 'left', marginBottom: 1,
                    }}>
                      {child.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* User */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--divider)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
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
