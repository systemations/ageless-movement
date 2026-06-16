import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { modal } from '../../components/Modal';
import { getVimeoEmbedUrl } from '../../components/VimeoEmbed';
import { invalidateTodayCache } from '../../components/EnhancedToday';
import { invalidate } from '../../lib/apiCache';

// Fullscreen video player for follow-along workouts.
// Vimeo handles scrubbing/volume/fullscreen via its native controls inside
// the iframe. We layer our own chrome on top: close X, title, and a
// pause-triggered bottom sheet (Resume / Complete Later / Mark Complete / Quit).
//
// Note: we can't read playback state from a cross-origin Vimeo iframe
// without the Vimeo Player.js SDK. For MVP the "pause" sheet is opened
// by tapping a button; the actual video pause/resume is done by the user
// via Vimeo's native controls. Hooking it up to the SDK is a later polish.
export default function FollowAlongPlayer({ workout, onBack, completed = false }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [logging, setLogging] = useState(false);
  const [done, setDone] = useState(false);
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
    let ok = false;
    try {
      const duration = Math.max(1, Math.round(elapsedRef.current / 60));
      const res = await fetch(`/api/explore/workouts/${workout.id}/log`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_mins: duration, exercise_logs: [] }),
      });
      ok = res.ok;
    } catch (err) {
      console.error('Log error:', err);
    }
    setLogging(false);
    if (!ok) {
      // Couldn't save — don't pretend it worked; just close back to the overview.
      onBack();
      return;
    }
    // Refresh the surfaces the log just changed: Home's "Today's Session" card
    // (now shows completed) and any cached dashboard (streak / program count).
    invalidateTodayCache();
    invalidate('/api/dashboard');
    // Show a brief confirmation, then drop the athlete back on Home so they see
    // the session ticked off rather than landing silently on the overview.
    setDone(true);
    setTimeout(() => navigate('/home'), 1100);
  };

  // Re-opening an already-completed session shows a "Completed" button; tapping
  // it confirms before logging again so the count isn't bumped by accident.
  const handleCompleteClick = async () => {
    if (completed) {
      const again = await modal.confirm("You've already logged this session today. Log it again?");
      if (!again) return;
    }
    logComplete();
  };

  if (done) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#000', zIndex: 200,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 14, color: '#fff', padding: 32, textAlign: 'center',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%', background: 'var(--accent-mint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p style={{ fontSize: 20, fontWeight: 800 }}>Session complete!</p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>Nice work — logged to your progress.</p>
      </div>
    );
  }

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

      {/* Video — fills the area between the top bar and the action bar. The
          embedded player letterboxes the clip, so the full video stays visible
          in portrait AND landscape (no cropping when the screen is rotated). */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title={workout.title}
            frameBorder="0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', textAlign: 'center', padding: 40 }}>
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
          onClick={handleCompleteClick}
          disabled={logging}
          style={{
            width: '100%', padding: '14px 20px', borderRadius: 12,
            background: completed ? 'rgba(16,185,129,0.18)' : 'var(--accent-mint)',
            color: completed ? '#34d399' : '#000',
            border: completed ? '1px solid rgba(16,185,129,0.55)' : 'none',
            fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: logging ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {logging ? 'Saving…' : completed ? (
            <>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Completed today
            </>
          ) : 'Mark Complete'}
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
