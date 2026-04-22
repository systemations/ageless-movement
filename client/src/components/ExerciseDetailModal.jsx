import { useState, useRef } from 'react';
import { getVimeoEmbedUrl } from './VimeoEmbed';

export default function ExerciseDetailModal({
  exercise, onClose, onSwap,
  clientDurationOverride,    // number (secs) | null — session override
  onSetDurationOverride,     // (secs | null) => void — sent to parent
}) {
  if (!exercise) return null;

  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoContainerRef = useRef(null);

  const embedUrl = exercise.demo_video_url
    ? getVimeoEmbedUrl(exercise.demo_video_url, { autoplay: true, loop: true, muted: isMuted })
    : null;

  const bodyParts = exercise.body_part?.split(',').map(p => p.trim()).filter(Boolean) || [];

  const handleFullscreen = () => {
    const container = videoContainerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      // Try standard fullscreen API
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (container.webkitEnterFullscreen) {
        container.webkitEnterFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 400,
      display: 'flex', flexDirection: 'column',
    }} onClick={onClose}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', maxHeight: '100vh',
      }} onClick={e => e.stopPropagation()}>

        {/* Video / Image area */}
        <div
          ref={videoContainerRef}
          style={{
            flex: isFullscreen ? '1' : '0 0 280px',
            background: '#000', position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}
        >
          {embedUrl ? (
            <iframe
              key={`${exercise.exercise_id || exercise.id}-${isMuted}`}
              src={embedUrl}
              width="100%" height="100%"
              frameBorder="0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              style={{ border: 'none', position: 'absolute', inset: 0 }}
            />
          ) : exercise.thumbnail_url ? (
            <img src={exercise.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: 0.3 }}>
              <span style={{ fontSize: 48 }}>🎥</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No video available</span>
            </div>
          )}

          {/* Back button — higher contrast so it's visible even when the
              video area is empty/black. */}
          <button
            onClick={onClose}
            aria-label="Back"
            style={{
              position: 'absolute', top: 12, left: 12, width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>

          {/* Video controls overlay */}
          <div style={{
            position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 8, zIndex: 2,
          }}>
            {/* Fullscreen toggle */}
            {embedUrl && (
              <button onClick={handleFullscreen} style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}>
                {isFullscreen ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2">
                    <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
                    <line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2">
                    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Exercise info */}
        {!isFullscreen && (
          <div style={{
            flex: 1, background: 'var(--bg-primary)', overflow: 'auto',
            padding: '20px 16px 32px', borderRadius: '20px 20px 0 0', marginTop: -16,
            position: 'relative',
          }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>{exercise.name}</h2>

            {/* Meta info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {exercise.body_part && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
                  <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{exercise.body_part}</span>
                </div>
              )}
              {exercise.equipment && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
                  <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{exercise.equipment}</span>
                </div>
              )}
            </div>

            {/* Tags */}
            {bodyParts.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                {bodyParts.map(p => (
                  <span key={p} style={{
                    fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                    background: 'rgba(255,140,0,0.1)', color: 'var(--accent)',
                  }}>
                    {p}
                  </span>
                ))}
              </div>
            )}

            {/* Description / How to Perform */}
            {exercise.description && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>How to Perform</h3>
                <div style={{ borderTop: '2px solid var(--accent-orange)', paddingTop: 12 }}>
                  {exercise.description.split('\n').filter(Boolean).map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-orange)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        fontSize: 12, fontWeight: 700, color: '#000',
                      }}>
                        {i + 1}
                      </div>
                      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, flex: 1 }}>
                        {step.replace(/^\d+\.\s*/, '').replace(/^\*/, '')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes from the workout */}
            {exercise.notes && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Coach Notes</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{exercise.notes}</p>
              </div>
            )}

            {/* Swap-for-alternative picker. Shows up whenever the coach has
                linked alternates to this exercise AND the parent passed an
                onSwap callback (client-side flows only). */}
            {Array.isArray(exercise.alternatives) && exercise.alternatives.length > 0 && onSwap && (
              <AlternativesPicker
                primary={exercise}
                alternatives={exercise.alternatives}
                onSwap={(alt) => { onSwap(alt); onClose(); }}
                onResetToPrimary={() => { onSwap(null); onClose(); }}
              />
            )}

            {/* Dose-only customizer. Shown when the exercise is duration-
                tracked AND has no phase plan (coach-prescribed intervals lock
                this out — modality is the coach's call). Client can shorten
                or extend today's session without picking a new modality. */}
            {(() => {
              if (!onSetDurationOverride) return null;
              const hasPhases = Array.isArray(exercise.interval_structure) && exercise.interval_structure.length > 0;
              const tt = exercise.meta_tracking_type || exercise.tracking_type;
              const isDuration = tt === 'Duration' || tt === 'duration';
              const baseSecs = exercise.meta_duration_secs || exercise.duration_secs;
              if (hasPhases || !isDuration || !baseSecs) return null;
              const currentSecs = clientDurationOverride ?? baseSecs;
              return (
                <DurationCustomizer
                  baseSecs={baseSecs}
                  currentSecs={currentSecs}
                  isOverridden={clientDurationOverride != null && clientDurationOverride !== baseSecs}
                  onChange={(secs) => onSetDurationOverride(secs === baseSecs ? null : secs)}
                  onReset={() => onSetDurationOverride(null)}
                />
              );
            })()}

            {/* Interval phase list — shown when the coach has prescribed a
                phase structure. Takes priority over simple sets/reps display. */}
            {Array.isArray(exercise.interval_structure) && exercise.interval_structure.length > 0 ? (
              <IntervalPhaseList phases={exercise.interval_structure} />
            ) : (
              /* Tracking info — classic sets/reps/rest/tempo for non-interval exercises */
              <div style={{
                background: 'var(--bg-card)', borderRadius: 12, padding: 16,
                display: 'flex', gap: 16, flexWrap: 'wrap',
              }}>
                {exercise.sets != null && (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Sets</p>
                    <p style={{ fontSize: 16, fontWeight: 700 }}>{exercise.sets}</p>
                  </div>
                )}
                {/* Hide reps when tracking is Duration and a duration_secs is present */}
                {(() => {
                  const tt = exercise.meta_tracking_type || exercise.tracking_type;
                  const isDuration = tt === 'Duration' || tt === 'duration';
                  const dur = exercise.meta_duration_secs || exercise.duration_secs;
                  if (isDuration && dur) {
                    const m = Math.floor(dur / 60);
                    const s = dur % 60;
                    const label = s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')}`;
                    return (
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Duration</p>
                        <p style={{ fontSize: 16, fontWeight: 700 }}>{label}</p>
                      </div>
                    );
                  }
                  if (exercise.reps) {
                    return (
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Reps</p>
                        <p style={{ fontSize: 16, fontWeight: 700 }}>{exercise.reps}</p>
                      </div>
                    );
                  }
                  return null;
                })()}
                {exercise.rest_secs > 0 && (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Rest</p>
                    <p style={{ fontSize: 16, fontWeight: 700 }}>{exercise.rest_secs}s</p>
                  </div>
                )}
                {exercise.tempo && (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Tempo</p>
                    <p style={{ fontSize: 16, fontWeight: 700 }}>{exercise.tempo}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Client-side dose customizer. Shows the coach's base duration, lets the
// client bump it ± in 5-min steps or type a custom value. Never overrides
// modality — that's the coach's domain. The override is session-scoped
// (parent stores it in-memory) and gets logged on workout complete so the
// coach can see what the client actually did.
function DurationCustomizer({ baseSecs, currentSecs, isOverridden, onChange, onReset }) {
  const [draft, setDraft] = useState('');
  const fmtMin = (s) => Math.round(s / 60);
  const step = (delta) => {
    const next = Math.max(60, currentSecs + delta * 60);
    onChange(next);
  };
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Change duration for today
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Coach prescribed {fmtMin(baseSecs)} min
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 12 }}>
        <button onClick={() => step(-5)} style={stepperBtn}>−5</button>
        <div style={{ textAlign: 'center', minWidth: 90 }}>
          <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{fmtMin(currentSecs)}</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>minutes</p>
        </div>
        <button onClick={() => step(5)} style={stepperBtn}>+5</button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="number"
          min="1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Custom min"
          style={{
            flex: 1, padding: '8px 10px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--divider)',
            color: 'var(--text-primary)', fontSize: 13, outline: 'none',
          }}
        />
        <button
          onClick={() => {
            const n = Math.max(1, Math.floor(Number(draft) || 0));
            if (n > 0) { onChange(n * 60); setDraft(''); }
          }}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >Set</button>
        {isOverridden && (
          <button
            onClick={onReset}
            style={{
              background: 'none', color: 'var(--text-tertiary)', border: '1px solid var(--divider)',
              borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >Reset</button>
        )}
      </div>

      {isOverridden && (
        <p style={{ fontSize: 11, color: 'var(--accent)', marginTop: 8 }}>
          Using your {fmtMin(currentSecs)}-min target for today. Coach will see this in your log.
        </p>
      )}
    </div>
  );
}

const stepperBtn = {
  width: 44, height: 44, borderRadius: '50%',
  background: 'rgba(255,140,0,0.12)', color: 'var(--accent)',
  border: '1px solid rgba(255,140,0,0.3)',
  fontSize: 15, fontWeight: 800, cursor: 'pointer',
};

// Swap-for-alternative picker rendered inside the detail modal. Ergonomic
// flow: tap exercise → see its detail + a grid of alternates → tap an alt
// to swap. Also surfaces the coach's per-alt notes + metric overrides.
function AlternativesPicker({ primary, alternatives, onSwap, onResetToPrimary }) {
  const fmtSecs = (secs) => {
    if (!secs) return '';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (s === 0) return `${m} min`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  const altSummary = (alt) => {
    if (Array.isArray(alt.interval_structure) && alt.interval_structure.length > 0) {
      const total = alt.interval_structure.reduce((s, p) => s + (Number(p.duration_secs) || 0), 0);
      return `${alt.interval_structure.length} phases · ${fmtSecs(total)}`;
    }
    const bits = [];
    if (alt.sets) bits.push(`${alt.sets} sets`);
    if (alt.duration_secs) bits.push(fmtSecs(alt.duration_secs));
    if (alt.reps && alt.tracking_type !== 'Duration') bits.push(`${alt.reps} reps`);
    if (alt.tracking_type && alt.tracking_type !== 'Duration' && alt.tracking_type !== 'Repetitions') bits.push(alt.tracking_type);
    return bits.length > 0 ? bits.join(' · ') : 'Same as primary';
  };

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Swap for an alternative
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {alternatives.length} option{alternatives.length === 1 ? '' : 's'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {alternatives.map((alt) => (
          <button
            key={alt.alternative_id || alt.id}
            onClick={() => onSwap(alt)}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--divider)',
              borderRadius: 10,
              padding: '10px 12px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              color: 'var(--text-primary)',
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 700 }}>{alt.name}</p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{altSummary(alt)}</p>
            {alt.notes && (
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, fontStyle: 'italic' }}>
                {alt.notes}
              </p>
            )}
          </button>
        ))}
      </div>

      <button
        onClick={onResetToPrimary}
        style={{
          width: '100%', marginTop: 10, padding: '8px 0',
          background: 'none', border: '1px dashed var(--divider)', borderRadius: 8,
          color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Keep original ({primary.name})
      </button>
    </div>
  );
}

// Matches the PhaseEditor intensity palette so admin-side colours carry
// through to the client-side preview.
const INTENSITY_COLORS = {
  easy:     '#30D158',
  moderate: '#FFD60A',
  hard:     '#FF9500',
  max:      '#FF453A',
  rest:     '#64D2FF',
};

function IntervalPhaseList({ phases }) {
  const total = phases.reduce((s, p) => s + (Number(p.duration_secs) || 0), 0);
  const fmt = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (s === 0) return `${m} min`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Interval plan
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {phases.length} phase{phases.length === 1 ? '' : 's'} · {fmt(total)} total
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {phases.map((p, i) => {
          const c = INTENSITY_COLORS[p.intensity] || '#94a3b8';
          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '22px 1fr auto',
              gap: 10, alignItems: 'center',
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: c + '33', color: c,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 800,
              }}>{i + 1}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label || `Phase ${i + 1}`}</p>
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
                    background: c + '22', color: c,
                    textTransform: 'uppercase', letterSpacing: 0.4,
                  }}>{p.intensity || 'easy'}{p.zone ? ` · Z${p.zone}` : ''}</span>
                </div>
                {p.notes && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{p.notes}</p>}
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(Number(p.duration_secs) || 0)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
