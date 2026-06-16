import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { cachedGet } from '../lib/apiCache';
import {
  HomeIcon, EventsIcon, ExploreIcon, MessagesIcon, ProgressIcon,
  GroupsIcon, CheckinsIcon, LiveIcon, MoreIcon
} from './Icons';

const clientTabs = [
  { path: '/home', label: 'Home', icon: HomeIcon },
  { path: '/events', label: 'Events', icon: EventsIcon },
  { path: '/explore', label: 'Explore', icon: ExploreIcon },
  { path: '/messages', label: 'Messages', icon: MessagesIcon, hasBadge: true },
  { path: '/progress', label: 'Progress', icon: ProgressIcon },
];

// Coach mobile: Home first so coaches land on priority dashboard.
// Groups is reachable from inside Messages + from the More tab.
const coachTabs = [
  { path: '/coach/home', label: 'Home', icon: HomeIcon },
  { path: '/coach/messages', label: 'Messages', icon: MessagesIcon, hasBadge: true },
  { path: '/coach/checkins', label: 'Check-ins', icon: CheckinsIcon },
  { path: '/coach/live', label: 'Live', icon: LiveIcon },
  { path: '/coach/more', label: 'More', icon: MoreIcon },
];

// How often the bottom nav re-checks for unread messages. 30s is the sweet
// spot - frequent enough that a new message lights the dot within a minute
// without hammering the API. We also re-check on tab focus + on navigation.
const UNREAD_POLL_MS = 30000;

export default function BottomNav() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = user?.role === 'coach' ? coachTabs : clientTabs;
  const [unread, setUnread] = useState(0);

  // Pull the unread-conversation count for the badge. Refresh on token change,
  // on each navigation (covers "user just opened messages -> badge clears"),
  // on tab focus, and on a 30s interval.
  useEffect(() => {
    if (!token) { setUnread(0); return; }
    let alive = true;
    // Navigation re-runs this effect (location.pathname dep), so the un-forced
    // call goes through the cache with a short TTL — bouncing between tabs
    // reuses the count instead of refetching each time. The poll, tab-focus,
    // and "messages read" triggers force a fresh read so the badge stays live.
    const fetchUnread = (force = false) => {
      cachedGet('/api/messages/unread-count', {
        headers: { Authorization: `Bearer ${token}` },
        force,
        ttl: 15_000,
      }).then(d => { if (alive && d) setUnread(d.count || 0); });
    };
    fetchUnread();
    const id = setInterval(() => fetchUnread(true), UNREAD_POLL_MS);
    const onFocus = () => fetchUnread(true);
    // MessageThread fires this after marking a conversation read so the
    // badge clears immediately instead of waiting for the next 30s poll.
    const onRead = () => fetchUnread(true);
    window.addEventListener('focus', onFocus);
    window.addEventListener('am:messages-read', onRead);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('am:messages-read', onRead);
    };
  }, [token, location.pathname]);

  // Reflect unread in the tab title so a backgrounded tab still shows it
  // (cheap, native, no notification permission needed).
  useEffect(() => {
    const base = 'Ageless Movement';
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
  }, [unread]);

  return (
    <nav className="bottom-nav">
      {tabs.map(({ path, label, icon: Icon, hasBadge }) => {
        const showDot = hasBadge && unread > 0;
        return (
          <button
            key={path}
            className={`nav-item ${location.pathname.startsWith(path) ? 'active' : ''}`}
            onClick={() => navigate(path)}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon />
              {showDot && (
                <span
                  aria-label={`${unread} unread`}
                  style={{
                    position: 'absolute', top: -6, right: -10,
                    minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                    background: '#FF453A', color: '#fff',
                    fontSize: 11, fontWeight: 800,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 0 2px var(--bg-primary)',
                    lineHeight: 1,
                  }}
                >{unread > 9 ? '9+' : unread}</span>
              )}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
