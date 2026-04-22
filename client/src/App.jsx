import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Component } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';

// Error boundary that prevents a blank screen when a route component throws.
// Shows the error message + a Back/Reload pair instead of dying silently.
class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('Route error boundary caught:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="page-content" style={{ padding: 24, textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            {String(this.state.error?.message || this.state.error)}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={() => window.history.back()}
              style={{
                padding: '10px 20px', borderRadius: 10, border: 'none',
                background: 'var(--accent)', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >Back</button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px', borderRadius: 10,
                border: '1px solid var(--divider)', background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import BottomNav from './components/BottomNav';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Welcome from './pages/auth/Welcome';
// RolePicker removed — login handles coach-vs-client routing by the role
// on the account, no need to ask the user which they are.
import Privacy from './pages/legal/Privacy';
import Terms from './pages/legal/Terms';
import Home from './pages/client/Home';
import Events from './pages/client/Events';
import Explore from './pages/client/Explore';
import Messages from './pages/client/Messages';
import Progress from './pages/client/Progress';
import Challenges from './pages/client/Challenges';
import BenchmarkDetail from './pages/client/BenchmarkDetail';
import OnboardingQuestionnaire from './pages/client/OnboardingQuestionnaire';
import NutritionHub from './pages/client/NutritionHub';
import Profile from './pages/client/Profile';
import LogOtherWorkout from './pages/client/LogOtherWorkout';
import WorkoutPlanner from './pages/client/WorkoutPlanner';
import CoachMobileHome from './pages/coach/CoachHome';
import CoachMessages from './pages/coach/CoachMessages';
import CoachGroups from './pages/coach/CoachGroups';
import CoachCheckins from './pages/coach/CoachCheckins';
import CoachLive from './pages/coach/CoachLive';
import CoachMore from './pages/coach/CoachMore';
import { FavouritesProvider } from './context/FavouritesContext';
import { ThemeProvider } from './context/ThemeContext';
import FavouritesPage from './pages/client/FavouritesPage';
import AdminLayout from './pages/admin/AdminLayout';

// Banner shown above client routes when a coach has paused or archived the account.
// Status lives on profile.status (loaded in AuthContext via /auth/me).
function ClientStatusBanner() {
  const { user, profile } = useAuth();
  if (user?.role !== 'client' || !profile) return null;
  const status = profile.status || 'active';
  if (status === 'active') return null;

  const copy = status === 'paused'
    ? {
        title: 'Your coaching is paused',
        body: profile.status_note || 'Your coach has paused your subscription. Reach out to them to resume.',
        bg: 'rgba(255,156,51,0.15)', accent: 'var(--accent)', border: 'var(--accent)',
      }
    : {
        title: 'Coaching has ended',
        body: profile.status_note || 'Your coaching relationship has ended. Your history is preserved if you return.',
        bg: 'rgba(255,69,58,0.12)', accent: '#FF5E5E', border: '#FF5E5E',
      };

  return (
    <div style={{
      background: copy.bg, borderLeft: `3px solid ${copy.border}`,
      padding: '10px 14px', margin: '8px 8px 0 8px', borderRadius: 8,
    }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: copy.accent, marginBottom: 2 }}>{copy.title}</p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{copy.body}</p>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/logo.png" alt="AM" style={{ width: 64, height: 64, borderRadius: '50%' }} />
        <div className="spinner" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <ClientStatusBanner />
      {children}
    </>
  );
}

// Coach-only route guard. Redirects non-coach users back to /home.
// Used to lock the /admin surface so a client account can't land on it
// and see broken screens where role-gated API calls silently return 403.
function CoachRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/logo.png" alt="AM" style={{ width: 64, height: 64, borderRadius: '50%' }} />
        <div className="spinner" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'coach') return <Navigate to="/home" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/logo.png" alt="AM" style={{ width: 64, height: 64, borderRadius: '50%' }} />
        <div className="spinner" />
      </div>
    );
  }

  // Coaches land on desktop admin when on a wide screen, otherwise the mobile
  // Home dashboard. Width threshold matches the app-shell max (480px).
  const isNarrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  const defaultRoute = user?.role === 'coach'
    ? (isNarrow ? '/coach/home' : '/admin')
    : '/home';

  return (
    <div className="app-shell">
      <RouteErrorBoundary key={location.pathname}>
      <Routes>
        {/* Auth */}
        <Route path="/" element={user ? <Navigate to={defaultRoute} replace /> : <Welcome />} />
        <Route path="/welcome" element={user ? <Navigate to={defaultRoute} replace /> : <Welcome />} />
        {/* /welcome/role redirect — role picker removed. Login handles
            coach-vs-client routing via the role on the account. */}
        <Route path="/welcome/role" element={<Navigate to="/onboarding" replace />} />
        <Route path="/login" element={user ? <Navigate to={defaultRoute} replace /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to={defaultRoute} replace /> : <Register />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        {/* Onboarding — anonymous. Runs BEFORE signup so new users get a
            matched program before creating an account. Answers are held in
            localStorage and sent to the server as part of /register. */}
        <Route path="/onboarding" element={user ? <Navigate to={defaultRoute} replace /> : <OnboardingQuestionnaire />} />

        {/* Client Routes */}
        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/events" element={<ProtectedRoute><Events /></ProtectedRoute>} />
        <Route path="/explore" element={<ProtectedRoute><Explore /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
        <Route path="/progress" element={<ProtectedRoute><Progress /></ProtectedRoute>} />
        <Route path="/challenges" element={<ProtectedRoute><Challenges /></ProtectedRoute>} />
        <Route path="/challenges/:slug" element={<ProtectedRoute><BenchmarkDetail /></ProtectedRoute>} />
        <Route path="/nutrition" element={<ProtectedRoute><NutritionHub /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile onBack={() => window.history.back()} /></ProtectedRoute>} />
        <Route path="/favourites" element={<ProtectedRoute><FavouritesPage /></ProtectedRoute>} />
        <Route path="/log-workout" element={<ProtectedRoute><LogOtherWorkout onClose={() => window.history.back()} /></ProtectedRoute>} />
        <Route path="/workout-planner" element={<ProtectedRoute><WorkoutPlanner onBack={() => window.history.back()} /></ProtectedRoute>} />

        {/* Admin Panel (desktop) */}
        <Route path="/admin" element={<CoachRoute><AdminLayout /></CoachRoute>} />

        {/* Coach Routes */}
        <Route path="/coach/home" element={<ProtectedRoute><CoachMobileHome /></ProtectedRoute>} />
        <Route path="/coach/messages" element={<ProtectedRoute><CoachMessages /></ProtectedRoute>} />
        <Route path="/coach/groups" element={<ProtectedRoute><CoachGroups /></ProtectedRoute>} />
        <Route path="/coach/checkins" element={<ProtectedRoute><CoachCheckins /></ProtectedRoute>} />
        <Route path="/coach/live" element={<ProtectedRoute><CoachLive /></ProtectedRoute>} />
        <Route path="/coach/more" element={<ProtectedRoute><CoachMore /></ProtectedRoute>} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to={user ? defaultRoute : '/welcome'} replace />} />
      </Routes>
      </RouteErrorBoundary>

      {user && !location.pathname.startsWith('/admin') && <BottomNav />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <FavouritesProvider>
            <AppRoutes />
          </FavouritesProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
