import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Platform detection - good enough for the install walkthrough. We just need
// to pick which of the four flows to surface; misclassifying a desktop user
// as Android (or vice versa) still shows usable instructions.
function detectPlatform() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isAndroid = /Android/.test(ua);
  if (isIos) {
    // Chrome on iOS reports CriOS in its UA. Other browsers (Firefox -> FxiOS,
    // Edge -> EdgiOS) also can't install PWAs on iOS, so lump them with Chrome.
    const isChromeOrSimilar = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return isChromeOrSimilar ? 'ios-other' : 'ios-safari';
  }
  if (isAndroid) return 'android';
  return 'desktop';
}

function isInStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export default function InstallGuide() {
  const navigate = useNavigate();
  const platform = useMemo(detectPlatform, []);
  const standalone = useMemo(isInStandalone, []);
  const [event, setEvent] = useState(null); // BeforeInstallPromptEvent for Android one-tap

  useEffect(() => {
    if (platform !== 'android') return;
    const onBeforeInstall = (e) => { e.preventDefault(); setEvent(e); };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, [platform]);

  const oneTapInstall = async () => {
    if (!event) return;
    event.prompt();
    await event.userChoice;
    setEvent(null);
  };

  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} aria-label="Back" style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Install on your phone</h1>
      </div>

      {standalone && (
        <Banner kind="success">
          <strong>You're already installed.</strong> You're running the app from your home screen right now. Nothing more to do.
        </Banner>
      )}

      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 22 }}>
        Add Ageless Movement to your home screen so it opens with one tap, runs full-screen with no browser bars,
        and feels like a regular app. Takes about 20 seconds.
      </p>

      {platform === 'android' && <AndroidSteps event={event} onOneTap={oneTapInstall} />}
      {platform === 'ios-safari' && <IosSafariSteps />}
      {platform === 'ios-other' && <IosChromeSteps />}
      {platform === 'desktop' && <DesktopSteps />}

      <p style={{ marginTop: 30, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.5 }}>
        Once installed, you'll get all the same features. Push notifications come later when we release the native app.
      </p>
    </div>
  );
}

// Steps for Android (Chrome / Edge / Samsung Internet - all Chromium).
// If the browser already fired beforeinstallprompt we offer one-tap install;
// otherwise we walk through the manual menu path.
function AndroidSteps({ event, onOneTap }) {
  return (
    <>
      <Heading platform="Android" />
      {event && (
        <button onClick={onOneTap} className="btn-primary" style={{ width: '100%', marginBottom: 18 }}>
          Install Ageless Movement (one tap)
        </button>
      )}
      <Step n={1} title="Open the menu" body="Tap the three-dot menu in the top-right corner of Chrome." />
      <Step n={2} title="Tap 'Install app'" body="If you see 'Add to Home screen' instead, that works too - tap it." />
      <Step n={3} title="Confirm" body="Tap Install on the popup. The Ageless Movement icon will land on your home screen and in your app drawer." />
      <Step n={4} title="Open from home screen" body="Tap the icon. The app launches full-screen with no Chrome bars." done />
    </>
  );
}

// iPhone Safari - the only iOS path that creates a real standalone PWA.
function IosSafariSteps() {
  return (
    <>
      <Heading platform="iPhone (Safari)" />
      <Step n={1} title="Tap the Share button" body={<>The square-with-arrow-up icon. On most iPhones it lives in the bottom toolbar of Safari.</>} icon={<ShareIcon />} />
      <Step n={2} title="Scroll down to 'Add to Home Screen'" body="It's a few rows down in the Share sheet." />
      <Step n={3} title="Tap Add" body="The Ageless Movement icon will appear on your home screen." />
      <Step n={4} title="Open it from there" body="Tap the icon. The app opens full-screen with no Safari bars." done />
    </>
  );
}

// iPhone with Chrome / Firefox / Edge - Apple blocks non-Safari browsers from
// installing real PWAs, so we redirect them to Safari first.
function IosChromeSteps() {
  return (
    <>
      <Heading platform="iPhone (Chrome / non-Safari)" />
      <Banner kind="warn">
        <strong>Heads up:</strong> on iPhone, only Safari can install web apps to the home screen.
        Chrome's "Add to Home Screen" creates a bookmark, not a real app. Use Safari for the proper install.
      </Banner>
      <Step n={1} title="Open Safari" body="Apple only lets Safari install web apps as standalone, so we have to switch browsers for this one." />
      <Step n={2} title="Visit the same web address" body="Paste the Ageless Movement link into Safari and log in." />
      <Step n={3} title="Share -> Add to Home Screen" body="Tap the Share button, scroll down, tap Add to Home Screen, then Add." icon={<ShareIcon />} />
      <Step n={4} title="Open from home screen" body="Tap the new icon. The app launches full-screen." done />
    </>
  );
}

// Desktop fallback - this whole feature is for phones, so just point them
// there. Shows the live URL so they can type it into their phone browser.
function DesktopSteps() {
  const url = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <>
      <Heading platform="Your phone" />
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 22 }}>
        Ageless Movement is built to live on your phone's home screen. To set that up, you'll need to log in
        from your phone's browser first - this step doesn't apply to your computer.
      </p>
      <Step n={1} title="Open your phone's browser" body={<>On iPhone use <strong>Safari</strong> (Apple only lets Safari install web apps to the home screen, not Chrome). On Android, Chrome is fine.</>} />
      <Step n={2} title="Go to this address" body={<>
        <code style={{
          display: 'inline-block', padding: '4px 10px', borderRadius: 6, marginTop: 4,
          background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13,
          border: '1px solid var(--divider)',
        }}>{url || 'agelessmovement.com'}</code>
      </>} />
      <Step n={3} title="Log in" body="Use the same email and password you signed up with on this computer." />
      <Step n={4} title="Follow the install steps that appear" body="This same page on your phone will show the right Safari / Chrome instructions for your device." done />
    </>
  );
}

function Heading({ platform }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase',
      color: 'var(--accent)', marginBottom: 14,
    }}>For {platform}</p>
  );
}

function Step({ n, title, body, icon, done }) {
  return (
    <div style={{
      display: 'flex', gap: 14, marginBottom: 18, padding: '14px 16px',
      background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--divider)',
    }}>
      <div style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
        background: done ? 'var(--accent-mint)' : 'rgba(255,156,51,0.18)',
        color: done ? '#000' : 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 800,
      }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          {title}{icon}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{body}</p>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  );
}

function Banner({ kind, children }) {
  const colors = kind === 'success'
    ? { bg: 'rgba(61,255,210,0.10)', border: 'var(--accent-mint)', text: 'var(--accent-mint-ink, #0E8A4F)' }
    : kind === 'warn'
      ? { bg: 'rgba(255,156,51,0.10)', border: 'var(--accent)', text: 'var(--text-primary)' }
      : { bg: 'var(--bg-card)', border: 'var(--divider)', text: 'var(--text-primary)' };
  return (
    <div style={{
      background: colors.bg, border: `1px solid ${colors.border}`,
      borderRadius: 12, padding: '12px 14px', marginBottom: 20,
      fontSize: 13, color: colors.text, lineHeight: 1.5,
    }}>{children}</div>
  );
}
