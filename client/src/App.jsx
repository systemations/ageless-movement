import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import BottomNav from './components/BottomNav';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Home from './pages/client/Home';
import Events from './pages/client/Events';
import Explore from './pages/client/Explore';
import Messages from './pages/client/Messages';
import Progress from './pages/client/Progress';
import OnboardingQuestionnaire from './pages/client/OnboardingQuestionnaire';
import NutritionHub from './pages/client/NutritionHub';
import Profile from './pages/client/Profile';
import CoachMessages from './pages/coach/CoachMessages';
import CoachGroups from './pages/coach/CoachGroups';
import CoachCheckins from './pages/coach/CoachCheckins';
import CoachLive from './pages/coach/CoachLive';
import CoachMore from './pages/coach/CoachMore';
import { FavouritesProvider } from './context/FavouritesContext';
import FavouritesPage from './pages/client/FavouritesPage';
import AdminLayout from './pages/admin/AdminLayout';

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
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/logo.png" alt="AM" style={{ width: 64, height: 64, borderRadius: '50%' }} />
        <div className="spinner" />
      </div>
    );
  }

  const defaultRoute = user?.role === 'coach' ? '/coach/messages' : '/home';

  return (
    <div className="app-shell">
      <Routes>
        {/* Auth */}
        <Route path="/login" element={user ? <Navigate to={defaultRoute} replace /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to={defaultRoute} replace /> : <Register />} />

        {/* Onboarding */}
        <Route path="/onboarding" element={
          <ProtectedRoute>
            <OnboardingQuestionnaire onComplete={(answers) => {
              localStorage.setItem('am_onboarded', 'true');
              window.location.href = '/home';
            }} />
          </ProtectedRoute>
        } />

        {/* Client Routes */}
        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/events" element={<ProtectedRoute><Events /></ProtectedRoute>} />
        <Route path="/explore" element={<ProtectedRoute><Explore /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
        <Route path="/progress" element={<ProtectedRoute><Progress /></ProtectedRoute>} />
        <Route path="/nutrition" element={<ProtectedRoute><NutritionHub /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile onBack={() => window.history.back()} /></ProtectedRoute>} />
        <Route path="/favourites" element={<ProtectedRoute><FavouritesPage /></ProtectedRoute>} />

        {/* Admin Panel (desktop) */}
        <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>} />

        {/* Coach Routes */}
        <Route path="/coach/messages" element={<ProtectedRoute><CoachMessages /></ProtectedRoute>} />
        <Route path="/coach/groups" element={<ProtectedRoute><CoachGroups /></ProtectedRoute>} />
        <Route path="/coach/checkins" element={<ProtectedRoute><CoachCheckins /></ProtectedRoute>} />
        <Route path="/coach/live" element={<ProtectedRoute><CoachLive /></ProtectedRoute>} />
        <Route path="/coach/more" element={<ProtectedRoute><CoachMore /></ProtectedRoute>} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to={user ? defaultRoute : '/login'} replace />} />
      </Routes>

      {user && <BottomNav />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FavouritesProvider>
          <AppRoutes />
        </FavouritesProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
