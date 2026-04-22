import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import CoachHome from './CoachHome';
import CoachWorkspace from './CoachWorkspace';
import ExerciseLibrary from './ExerciseLibrary';
import ProgramBuilder from './ProgramBuilder';
import ClientManager from './ClientManager';
import WorkoutBuilder from './WorkoutBuilder';
import RecipeManager from './RecipeManager';
import ExploreManager from './ExploreManager';
import ScheduleManager from './ScheduleManager';
import ChallengeManager from './ChallengeManager';
import ChallengesAdmin from './ChallengesAdmin';
import MealPlanManager from './MealPlanManager';
import MealScheduleManager from './MealScheduleManager';
import CoachingManager from './CoachingManager';
import NotificationManager from './NotificationManager';

const navItems = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'messages', label: 'Messages', icon: '💬', children: [
    { id: 'messages-clients', label: 'Clients' },
    { id: 'messages-groups', label: 'Groups' },
    { id: 'notifications', label: 'Notifications' },
  ]},
  { id: 'clients', label: 'Clients', icon: '👥' },
  { id: 'fitness', label: 'Fitness', icon: '💪', children: [
    { id: 'exercises', label: 'Exercises' },
    { id: 'programs', label: 'Programs' },
    { id: 'workouts', label: 'Workouts' },
    { id: 'schedules', label: 'Schedules' },
  ]},
  { id: 'nutrition', label: 'Nutrition', icon: '🍽️', children: [
    { id: 'recipes', label: 'Recipes' },
    { id: 'meal-plans', label: 'Meal Plans' },
    { id: 'meal-schedules', label: 'Meal Schedules' },
  ]},
  { id: 'team', label: 'Team', icon: '🧑‍🏫' },
  { id: 'coaching', label: 'Events', icon: '📅' },
  { id: 'explore', label: 'Explore', icon: '🔍' },
  { id: 'challenges-old', label: 'Social Challenges', icon: '🎯' },
  { id: 'challenges', label: 'Levels & Leaderboards', icon: '🏆' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [activePage, setActivePage] = useState('home');
  const [expandedMenus, setExpandedMenus] = useState(['messages', 'fitness']);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editWorkoutId, setEditWorkoutId] = useState(null);
  // Deep-link into a specific client - CoachHome sets this, ClientManager consumes it
  const [pendingClientId, setPendingClientId] = useState(null);

  const handleEditWorkout = (workoutId) => {
    setEditWorkoutId(workoutId);
    setActivePage('workouts');
  };

  const handleOpenClient = (clientId) => {
    setPendingClientId(clientId);
    setActivePage('clients');
  };

  const renderPage = () => {
    switch (activePage) {
      case 'home': return <CoachHome onOpenClient={handleOpenClient} />;
      case 'messages': return <CoachWorkspace initialScope="team" />;
      case 'messages-clients': return <CoachWorkspace initialScope="team" />;
      case 'messages-groups': return <CoachWorkspace initialScope="group" />;
      case 'exercises': return <ExerciseLibrary />;
      case 'programs': return <ProgramBuilder onEditWorkout={handleEditWorkout} />;
      case 'workouts': return <WorkoutBuilder initialWorkoutId={editWorkoutId} onClearInitial={() => setEditWorkoutId(null)} />;
      case 'recipes': return <RecipeManager />;
      case 'meal-plans': return <MealPlanManager />;
      case 'meal-schedules': return <MealScheduleManager />;
      case 'schedules': return <ScheduleManager />;
      case 'explore': return <ExploreManager />;
      case 'clients': return <ClientManager openClientId={pendingClientId} onClearOpen={() => setPendingClientId(null)} />;
      case 'challenges': return <ChallengesAdmin />;
      case 'challenges-old': return <ChallengeManager />;
      case 'team': return <CoachingManager variant="team" />;
      case 'coaching': return <CoachingManager variant="events" />;
      case 'notifications': return <NotificationManager />;
      default: return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{navItems.find(n => n.id === activePage)?.label}</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Coming soon - select Exercise Library or Programs to get started</p>
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
            fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>
            {user?.name?.charAt(0) || 'C'}
          </div>
          {sidebarOpen && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</p>
              <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 11, padding: 0, cursor: 'pointer' }}>Logout</button>
            </div>
          )}
          {sidebarOpen && (
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(255,140,0,0.12)', border: '1px solid var(--divider)',
                color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, padding: 0,
              }}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
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
