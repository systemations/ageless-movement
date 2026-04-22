import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getVimeoEmbedUrl } from '../../components/VimeoEmbed';

// Fullscreen video player for follow-along workouts.
// Vimeo handles scrubbing/volume/fullscreen via its native controls inside
// the iframe. We layer our own chrome on top: close X, title, and a
// pause-triggered bottom sheet (Resume / Complete Later / Mark Complete / Quit).
//
// Note: we can't read playback state from a cross-origin Vimeo iframe
// without the Vimeo Player.js SDK. For MVP the "pause" sheet is opened
// by tapping a button; the actual video pause/resume is done by the user
// via Vimeo's native controls. Hooking it up to the SDK is a later polish.
export default function FollowAlongPlayer({ workout, onBack }) {
  const { token } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [logging, setLogging] = useState(false);
  const elapsedRef = useRef(0);
  const startTimeRef = useRef(Date.now());

  // Crude elapsed tracking so Mark Complete logs a reasonable duration
  useEffect(() => {
    const t = setInterval(() => {
      elapsedRef.current = Math.round((Date.now() - startTimeRef.current) / 1000);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const embedUrl = workout?.video_url
    ? getVimeoEmbedUrl(workout.video_url, { autoplay: true, muted: false })
    : null;

  const logComplete = async () => {
    setLogging(true);
    try {
      const duration = Math.max(1, Math.round(elapsedRef.current / 60));
      await fetch(`/api/explore/workouts/${workout.id}/log`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_mins: duration, exercise_logs: [] }),
      });
    } catch (err) {
      console.error('Log error:', err);
    }
    setLogging(false);
    onBack();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000', zIndex: 200,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', color: '#fff',
      }}>
        <button
          onClick={onBack}
          style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', flex: 1, textAlign: 'center', margin: '0 12px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {workout.title}
        </p>
        <button
          onClick={() => setShowMenu(true)}
          title="Options"
          style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" color="#fff">
            <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
          </svg>
        </button>
      </div>

      {/* Video */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {embedUrl ? (
          <div style={{ width: '100%', position: 'relative', paddingTop: '56.25%' }}>
            <iframe
              src={embedUrl}
              title={workout.title}
              frameBorder="0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        ) : (
          <div style={{ color: '#fff', textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No video URL set</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
              Ask your coach to add the video for this workout.
            </p>
          </div>
        )}
      </div>

      {/* Bottom mark-complete bar */}
      <div style={{ padding: '16px 20px 32px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          onClick={logComplete}
          disabled={logging}
          style={{
            width: '100%', padding: '14px 20px', borderRadius: 12,
            background: 'var(--accent-mint)', color: '#000', fontSize: 16, fontWeight: 700,
            border: 'none', cursor: 'pointer', opacity: logging ? 0.5 : 1,
          }}
        >
          {logging ? 'Saving…' : 'Mark Complete'}
        </button>
      </div>

      {/* Session Paused bottom sheet */}
      {showMenu && (
        <div
          onClick={() => setShowMenu(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10,
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
              width: '100%', padding: '20px 16px 32px',
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto 20px' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', marginBottom: 20 }}>
              Session Paused
            </h3>
            <button
              onClick={() => setShowMenu(false)}
              style={{
                width: '100%', padding: '14px', borderRadius: 50,
                background: 'var(--accent-mint)', color: '#000',
                border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                marginBottom: 8,
              }}
            >
              Resume
            </button>
            <button
              onClick={onBack}
              style={{
                width: '100%', padding: '14px', borderRadius: 50,
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                border: '1px solid var(--divider)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                marginBottom: 8,
              }}
            >
              Complete Later
            </button>
            <button
              onClick={logComplete}
              disabled={logging}
              style={{
                width: '100%', padding: '14px', borderRadius: 50,
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                border: '1px solid var(--divider)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                marginBottom: 8, opacity: logging ? 0.5 : 1,
              }}
            >
              {logging ? 'Saving…' : 'Mark Complete'}
            </button>
            <button
              onClick={onBack}
              style={{
                width: '100%', padding: '14px', borderRadius: 50,
                background: 'var(--bg-primary)', color: '#FF453A',
                border: '1px solid var(--divider)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Quit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
