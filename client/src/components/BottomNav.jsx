import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  HomeIcon, EventsIcon, ExploreIcon, MessagesIcon, ProgressIcon,
  GroupsIcon, CheckinsIcon, LiveIcon, MoreIcon
} from './Icons';

const clientTabs = [
  { path: '/home', label: 'Home', icon: HomeIcon },
  { path: '/events', label: 'Events', icon: EventsIcon },
  { path: '/explore', label: 'Explore', icon: ExploreIcon },
  { path: '/messages', label: 'Messages', icon: MessagesIcon },
  { path: '/progress', label: 'Progress', icon: ProgressIcon },
];

// Coach mobile: Home first so coaches land on priority dashboard.
// Groups is reachable from inside Messages + from the More tab.
const coachTabs = [
  { path: '/coach/home', label: 'Home', icon: HomeIcon },
  { path: '/coach/messages', label: 'Messages', icon: MessagesIcon },
  { path: '/coach/checkins', label: 'Check-ins', icon: CheckinsIcon },
  { path: '/coach/live', label: 'Live', icon: LiveIcon },
  { path: '/coach/more', label: 'More', icon: MoreIcon },
];

export default function BottomNav() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = user?.role === 'coach' ? coachTabs : clientTabs;

  return (
    <nav className="bottom-nav">
      {tabs.map(({ path, label, icon: Icon }) => (
        <button
          key={path}
          className={`nav-item ${location.pathname.startsWith(path) ? 'active' : ''}`}
          onClick={() => navigate(path)}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
