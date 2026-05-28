import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Small banner that appears once per user, encouraging them to install the
// PWA to their home screen. Two surfaces:
//   - Android / Chrome: listens for the `beforeinstallprompt` event and
//     renders an "Install Ageless Movement" button that triggers the
//     native install flow.
//   - iOS Safari: that event never fires (Apple does not support the
//     install API), so we show a small hint - "Tap Share -> Add to Home
//     Screen" - with an arrow towards the bottom share button.
// Dismissal is sticky via localStorage so we don't nag.
const DISMISS_KEY = 'am_install_prompt_dismissed';
const SHOW_DELAY_MS = 5000; // wait until the user has actually started using the app

function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isInStandalone() {
  // iOS exposes navigator.standalone; everyone else uses the media query.
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export default function InstallPrompt() {
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);   // BeforeInstallPromptEvent (Android only)
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isInStandalone()) return;                          // already installed
    if (localStorage.getItem(DISMISS_KEY)) return;         // user said no thanks

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setEvent(e);
      // Delay so it doesn't slap users in the face on first paint.
      setTimeout(() => setShow(true), SHOW_DELAY_MS);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS gets a one-time hint after the delay since it never fires the event.
    let iosTimer = null;
    if (isIos()) iosTimer = setTimeout(() => setIosHint(true), SHOW_DELAY_MS);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
    setIosHint(false);
  };

  const install = async () => {
    if (!event) return;
    event.prompt();
    const choice = await event.userChoice;
    // 'accepted' or 'dismissed' - either way we never want to show again.
    localStorage.setItem(DISMISS_KEY, '1');
    setEvent(null);
    setShow(false);
  };

  if (show && event) {
    return (
      <Banner onDismiss={dismiss}>
        <p style={{ fontSize: 14, fontWeight: 700 }}>Install Ageless Movement</p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, marginBottom: 12 }}>
          Add it to your home screen for one-tap access.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={install} className="btn-primary" style={{ flex: 1, padding: '10px 0', fontSize: 13 }}>Install</button>
          <button onClick={dismiss} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--divider)',
            background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Not now</button>
        </div>
      </Banner>
    );
  }

  if (iosHint) {
    return (
      <Banner onDismiss={dismiss}>
        <p style={{ fontSize: 14, fontWeight: 700 }}>Add to Home Screen</p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, marginBottom: 10, lineHeight: 1.5 }}>
          Tap the <span style={{ display: 'inline-flex', verticalAlign: 'middle', margin: '0 2px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
          </span> Share button in Safari, then <strong>Add to Home Screen</strong> for one-tap access.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { dismiss(); navigate('/install'); }}
            className="btn-primary"
            style={{ flex: 1, padding: '10px 0', fontSize: 13 }}
          >Show me how</button>
          <button onClick={dismiss} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--divider)',
            background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Got it</button>
        </div>
      </Banner>
    );
  }

  return null;
}

// Bottom-anchored card. Sits above the bottom nav so it doesn't cover any
// CTAs. Auto-dismisses safely if the consumer clicks the ×.
function Banner({ children, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', left: 12, right: 12, bottom: 88, zIndex: 150,
      background: 'var(--bg-card)', borderRadius: 14, padding: 14,
      border: '1px solid var(--divider)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      maxWidth: 460, margin: '0 auto',
    }}>
      <button
        onClick={onDismiss}
        aria-label="Dismiss install prompt"
        style={{
          position: 'absolute', top: 6, right: 8, background: 'none', border: 'none',
          color: 'var(--text-tertiary)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 4,
        }}
      >×</button>
      {children}
    </div>
  );
}
