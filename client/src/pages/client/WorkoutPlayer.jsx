import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getVimeoEmbedUrl } from '../../components/VimeoEmbed';
import ExerciseDetailModal from '../../components/ExerciseDetailModal';
import ExerciseThumb, { getExerciseLabel } from '../../components/ExerciseThumb';

// Block colour palette must match WorkoutBuilder admin and WorkoutOverview
const BLOCK_COLORS = {
  warmup: '#FFD60A',
  superset: '#0A84FF',
  triset: '#30D158',
  circuit: '#FF9500',
  amrap: '#FF453A',
  tabata: '#FF375F',
  emom: '#BF5AF2',
  notes: '#8E8E93',
};
const STANDARD_BLOCK_COLOR = '#FF8C00';

// Build a lookup: exercise.id → { label, color } based on the workout's
// block grouping. Lets the player flat list show A / B1 / C... thumbs
// without re-grouping at every render.
function buildBlockMap(exercises) {
  const groups = [];
  let cur = null;
  exercises.forEach((ex) => {
    const key = ex.group_label || null;
    if (key && key === cur?.key) {
      cur.items.push(ex);
    } else {
      if (cur) groups.push(cur);
      cur = { key, type: ex.group_type, items: [ex] };
    }
  });
  if (cur) groups.push(cur);

  const map = {};
  groups.forEach((g, gi) => {
    const color = g.type ? (BLOCK_COLORS[g.type] || STANDARD_BLOCK_COLOR) : STANDARD_BLOCK_COLOR;
    g.items.forEach((ex, ei) => {
      map[ex.id] = { label: getExerciseLabel(gi, ei, g.items.length), color };
    });
  });
  return map;
}

// Web Audio API tone generator -- no external files needed
function playTone(type = 'beep') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === 'whistle') {
      // Rising two-tone whistle
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.15);
      osc.frequency.linearRampToValueAtTime(1600, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'tick') {
      // Short tick for prep countdown
      osc.type = 'square';
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } else {
      // Standard beep for transitions
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
    setTimeout(() => ctx.close(), 500);
  } catch (e) { /* Audio not available */ }
}

// Matches the PhaseEditor intensity palette.
const INTENSITY_COLORS = {
  easy:     '#30D158',
  moderate: '#FFD60A',
  hard:     '#FF9500',
  max:      '#FF453A',
  rest:     '#64D2FF',
};
const phaseColor = (intensity) => INTENSITY_COLORS[intensity] || '#94a3b8';

export default function WorkoutPlayer({ workout, exercises, onBack }) {
  const { token } = useAuth();
  const [phase, setPhase] = useState('countdown'); // countdown, active, paused, settings, log, prep, complete
  const [countdown, setCountdown] = useState(3);
  const [prepCountdown, setPrepCountdown] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLog, setShowLog] = useState(null);
  const [showQuit, setShowQuit] = useState(false);
  const [showExDetail, setShowExDetail] = useState(null);
  const [loggedSets, setLoggedSets] = useState({});
  // Cardio interval stepping. When the current exercise has an
  // interval_structure phase list, the player breaks it into per-phase
  // countdowns. `intervalPhaseIdx` is the active phase within the current
  // exercise; `intervalPhaseSecsLeft` is the countdown for that phase.
  const [intervalPhaseIdx, setIntervalPhaseIdx] = useState(0);
  const [intervalPhaseSecsLeft, setIntervalPhaseSecsLeft] = useState(0);
  const timerRef = useRef(null);
  const intervalTimerRef = useRef(null);

  const [settings, setSettings] = useState({
    mode: 'guided',
    autoForward: false,
    logRepsWeight: true,
    showVideo: true,
    muteVideo: false,
    audioCues: false,
    completeWhistle: true,
    prepTime: true,
  });

  // Initial countdown
  useEffect(() => {
    if (phase === 'countdown' && countdown > 0) {
      if (settings.audioCues) playTone('tick');
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    }
    if (phase === 'countdown' && countdown === 0) {
      if (settings.audioCues) playTone('beep');
      setPhase('active');
    }
  }, [phase, countdown]);

  // Prep countdown between exercises
  useEffect(() => {
    if (phase === 'prep' && prepCountdown > 0) {
      if (settings.audioCues) playTone('tick');
      const t = setTimeout(() => setPrepCountdown(prepCountdown - 1), 1000);
      return () => clearTimeout(t);
    }
    if (phase === 'prep' && prepCountdown === 0) {
      if (settings.audioCues) playTone('beep');
      setPhase('active');
    }
  }, [phase, prepCountdown]);

  // Elapsed timer
  useEffect(() => {
    if (phase === 'active' && !isPaused) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
      return () => clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [phase, isPaused]);

  const formatTime = (secs) => `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;
  const formatExValue = (ex) => {
    const tt = ex?.meta_tracking_type || ex?.tracking_type || 'Repetitions';
    const val = ex?.reps || '';
    const looksLikeTime = val.includes(':') || val.endsWith('s') || val.endsWith('m');
    if (tt === 'Duration' || tt === 'duration' || looksLikeTime) return val;
    if (tt === 'Calories' || tt === 'calories') return val + ' cal';
    if (tt === 'Distance' || tt === 'Meters') return val + 'm';
    return val + ' reps';
  };
  const currentEx = exercises[currentIdx];
  const currentPhases = Array.isArray(currentEx?.interval_structure) && currentEx.interval_structure.length > 0
    ? currentEx.interval_structure
    : null;
  const currentPhase = currentPhases ? currentPhases[intervalPhaseIdx] : null;

  // Reset phase index + remaining secs when the active exercise changes.
  useEffect(() => {
    setIntervalPhaseIdx(0);
    if (currentPhases) {
      setIntervalPhaseSecsLeft(Number(currentPhases[0]?.duration_secs) || 0);
    } else {
      setIntervalPhaseSecsLeft(0);
    }
  }, [currentIdx]);

  // Per-phase countdown. Ticks only while the workout is active + not paused
  // + the current exercise has phases. When a phase hits 0, we advance
  // automatically to the next phase or the next exercise.
  useEffect(() => {
    clearInterval(intervalTimerRef.current);
    if (phase !== 'active' || isPaused || !currentPhases) return;
    intervalTimerRef.current = setInterval(() => {
      setIntervalPhaseSecsLeft(prev => {
        if (prev <= 1) {
          // End of phase - advance.
          if (intervalPhaseIdx < currentPhases.length - 1) {
            const nextIdx = intervalPhaseIdx + 1;
            setIntervalPhaseIdx(nextIdx);
            if (settings.audioCues) playTone('beep');
            return Number(currentPhases[nextIdx]?.duration_secs) || 0;
          }
          // End of last phase - move to next exercise via handleNext.
          // Defer the state transition so React can finish this tick first.
          setTimeout(() => handleNext(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalTimerRef.current);
  }, [phase, isPaused, currentPhases, intervalPhaseIdx]);

  // Skip/back within the current exercise's phase list. Used by the phase
  // navigation buttons when the workout is in interval mode.
  const advancePhase = () => {
    if (!currentPhases) return;
    if (intervalPhaseIdx < currentPhases.length - 1) {
      const nextIdx = intervalPhaseIdx + 1;
      setIntervalPhaseIdx(nextIdx);
      setIntervalPhaseSecsLeft(Number(currentPhases[nextIdx]?.duration_secs) || 0);
    } else {
      handleNext();
    }
  };
  const rewindPhase = () => {
    if (!currentPhases) return;
    if (intervalPhaseIdx > 0) {
      const prevIdx = intervalPhaseIdx - 1;
      setIntervalPhaseIdx(prevIdx);
      setIntervalPhaseSecsLeft(Number(currentPhases[prevIdx]?.duration_secs) || 0);
    }
  };
  const progressPct = exercises.length > 0 ? ((currentIdx + 1) / exercises.length) * 100 : 0;
  const blockMap = buildBlockMap(exercises);
  const currentBlockInfo = blockMap[currentEx?.id] || {};

  const handleNext = () => {
    if (settings.completeWhistle) playTone('whistle');
    if (currentIdx < exercises.length - 1) {
      setCurrentIdx(currentIdx + 1);
      if (settings.prepTime) {
        setPrepCountdown(5);
        setPhase('prep');
      }
    } else {
      setPhase('complete');
    }
  };
  const handlePrev = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  };

  const handleLogSave = (exerciseId, sets) => {
    setLoggedSets({ ...loggedSets, [exerciseId]: sets });
    setShowLog(null);
    if (settings.autoForward) {
      handleNext();
    }
  };

  const handleComplete = async () => {
    try {
      const exerciseLogs = [];
      Object.entries(loggedSets).forEach(([exId, sets]) => {
        sets.forEach((s, i) => {
          exerciseLogs.push({ exercise_id: parseInt(exId), set_number: i + 1, reps: s.reps, weight: s.weight });
        });
      });
      // If the client applied a duration override on any exercise, stamp
      // the log as customized and record what the coach had prescribed so
      // the coach-side view can show the delta.
      const customized = exercises.some(ex => ex._client_duration_override || ex._swapped_to);
      const prescribedMins = workout.duration_mins || null;
      await fetch(`/api/explore/workouts/${workout.id}/log`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration_mins: Math.round(elapsed / 60),
          exercise_logs: exerciseLogs,
          prescribed_duration_mins: prescribedMins,
          customized,
        }),
      });
    } catch (err) {
      console.error(err);
    }
    onBack();
  };

  // ===== COUNTDOWN SCREEN =====
  if (phase === 'countdown') {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'var(--bg-primary)', zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
      }}>
        <div style={{
          width: 140, height: 140, borderRadius: '50%', border: '4px solid var(--divider)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 64, fontWeight: 800, color: 'var(--text-primary)' }}>{countdown}</span>
        </div>
      </div>
    );
  }

  // ===== PREP COUNTDOWN SCREEN =====
  if (phase === 'prep') {
    const nextEx = exercises[currentIdx];
    const nextBlockInfo = blockMap[nextEx?.id] || {};
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'var(--bg-primary)', zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 32,
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-mint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
          Get Ready
        </p>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, textAlign: 'center' }}>{nextEx?.name}</h2>
        <div style={{
          width: 100, height: 100, borderRadius: '50%', border: '4px solid var(--accent-mint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
        }}>
          <span style={{ fontSize: 48, fontWeight: 800, color: 'var(--accent-mint)' }}>{prepCountdown}</span>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          {formatExValue(nextEx)}
        </p>
        <button
          onClick={() => { setPrepCountdown(0); setPhase('active'); }}
          style={{
            marginTop: 24, padding: '10px 32px', borderRadius: 50, border: '1px solid var(--divider)',
            background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Skip
        </button>
      </div>
    );
  }

  // ===== COMPLETE SCREEN =====
  if (phase === 'complete') {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'var(--bg-primary)', zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 32,
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Workout Complete!</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 8 }}>{workout.title}</p>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 32 }}>{formatTime(elapsed)} - {Object.keys(loggedSets).length} exercises logged</p>
        <button className="btn-primary" onClick={handleComplete} style={{ maxWidth: 300 }}>Save & Exit</button>
      </div>
    );
  }

  // ===== ACTIVE WORKOUT SCREEN =====
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-primary)', zIndex: 300, display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', flexShrink: 0 }}>
        <button onClick={() => { setIsPaused(!isPaused); if (!isPaused) setShowQuit(false); }} style={{
          width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          {isPaused ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          )}
        </button>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{formatTime(elapsed)}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ background: 'none', border: 'none', color: 'var(--accent)', padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 16.1A5 5 0 0115.9 6L10 16.1"/><path d="M22 16.1A5 5 0 008.1 6L14 16.1"/></svg>
          </button>
          <button onClick={() => setShowSettings(true)} style={{ background: 'none', border: 'none', color: 'var(--accent)', padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--divider)', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--accent-orange)', transition: 'width 0.3s' }} />
      </div>

      {/* Video area */}
      {settings.showVideo && (
        <div
          style={{
            flex: '0 0 220px', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden',
          }}
        >
          {currentEx?.demo_video_url && getVimeoEmbedUrl(currentEx.demo_video_url, { autoplay: true, loop: true, muted: settings.muteVideo }) ? (
            <iframe
              key={`${currentEx.exercise_id}-${settings.muteVideo}`}
              src={getVimeoEmbedUrl(currentEx.demo_video_url, { autoplay: true, loop: true, muted: settings.muteVideo })}
              width="100%" height="100%"
              frameBorder="0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              style={{ border: 'none', position: 'absolute', inset: 0 }}
            />
          ) : (
            <div style={{
              position: 'absolute', inset: 0,
              background: currentBlockInfo.color || STANDARD_BLOCK_COLOR,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: 24, gap: 12,
            }}>
              {currentBlockInfo.label && (
                <span style={{ fontSize: 64, fontWeight: 900, color: '#000', letterSpacing: 1, lineHeight: 1 }}>
                  {currentBlockInfo.label}
                </span>
              )}
              <span style={{
                fontSize: 18, fontWeight: 600, color: '#000',
                textAlign: 'center', lineHeight: 1.2, maxWidth: '90%', opacity: 0.85,
              }}>{currentEx?.name || 'Exercise'}</span>
            </div>
          )}
        </div>
      )}

      {/* Exercise info */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 100px' }}>
        {/* Current exercise */}
        <div style={{ marginBottom: 4 }}>
          <p style={{ fontSize: 12, color: 'var(--accent-orange)', fontWeight: 600, marginBottom: 4 }}>
            {currentPhases
              ? `Phase ${intervalPhaseIdx + 1} of ${currentPhases.length}`
              : currentEx?.group_type
                ? `${currentEx.group_type.charAt(0).toUpperCase() + currentEx.group_type.slice(1)} ${Math.floor(currentIdx / 3) + 1} / ${currentEx.sets}`
                : `Set 1 / ${currentEx?.sets || 1}`}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>{currentEx?.name}</h3>
          </div>
          {currentPhases ? (
            <>
              {/* Big phase countdown */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <p style={{ fontSize: 40, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                  {Math.floor(intervalPhaseSecsLeft / 60)}:{String(intervalPhaseSecsLeft % 60).padStart(2, '0')}
                </p>
                <span style={{
                  fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6,
                  padding: '3px 10px', borderRadius: 14,
                  background: phaseColor(currentPhase?.intensity) + '22',
                  color: phaseColor(currentPhase?.intensity),
                }}>
                  {currentPhase?.intensity || 'easy'}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                {currentPhase?.label || 'Phase'}
                {currentPhase?.zone ? ` · Z${currentPhase.zone}` : ''}
                {currentPhase?.notes ? ` · ${currentPhase.notes}` : ''}
              </p>
              {/* Phase chip strip - dots for each phase, current highlighted */}
              <div style={{ display: 'flex', gap: 3, marginTop: 10, flexWrap: 'wrap' }}>
                {currentPhases.map((p, i) => (
                  <span
                    key={i}
                    title={`${p.label || 'Phase ' + (i + 1)} - ${Math.round((p.duration_secs || 0) / 60 * 10) / 10} min, ${p.intensity}`}
                    style={{
                      height: 6, flex: `${Math.max(1, p.duration_secs || 1)} 0 0`,
                      minWidth: 8, borderRadius: 3,
                      background: i < intervalPhaseIdx
                        ? phaseColor(p.intensity)
                        : i === intervalPhaseIdx
                          ? phaseColor(p.intensity)
                          : phaseColor(p.intensity) + '44',
                      opacity: i <= intervalPhaseIdx ? 1 : 0.6,
                    }}
                  />
                ))}
              </div>
              {/* Phase prev/next controls */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={rewindPhase}
                  disabled={intervalPhaseIdx === 0}
                  style={{
                    flex: 1, padding: '8px 0', background: 'rgba(255,255,255,0.06)',
                    color: 'var(--text-primary)', border: 'none', borderRadius: 10,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    opacity: intervalPhaseIdx === 0 ? 0.4 : 1,
                  }}
                >← Prev phase</button>
                <button
                  onClick={advancePhase}
                  style={{
                    flex: 1, padding: '8px 0', background: 'var(--accent)',
                    color: '#fff', border: 'none', borderRadius: 10,
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >Next phase →</button>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>
              {formatExValue(currentEx)}
            </p>
          )}
        </div>

        {/* Logged sets for current exercise */}
        {loggedSets[currentEx?.exercise_id]?.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            <span>{i + 1}.</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.reps}</span> {(() => { const tt = currentEx?.meta_tracking_type || currentEx?.tracking_type || 'Repetitions'; return tt === 'Duration' || tt === 'duration' ? '' : tt === 'Calories' ? 'cal' : 'reps'; })()} {s.weight ? <><span> - </span><span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.weight}</span> kg</> : ''}
          </div>
        ))}

        {/* Upcoming exercises */}
        <div style={{ marginTop: 16 }}>
          {exercises.slice(currentIdx + 1, currentIdx + 4).map((ex) => {
            const info = blockMap[ex.id] || {};
            return (
              <div
                key={ex.id}
                onClick={() => setShowExDetail(ex)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
                  borderTop: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer',
                }}
              >
                <ExerciseThumb
                  name={ex.name}
                  label={info.label}
                  color={info.color}
                  size={36}
                  borderRadius={6}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{ex.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatExValue(ex)}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowLog(ex); }}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', flexShrink: 0,
                    cursor: 'pointer',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '12px 24px 32px',
        background: 'var(--bg-primary)', flexShrink: 0,
      }}>
        <button onClick={handlePrev} disabled={currentIdx === 0} style={{
          width: 48, height: 48, borderRadius: '50%', border: '2px solid var(--accent-mint)',
          background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: currentIdx === 0 ? 0.3 : 1,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>

        <button onClick={() => setShowLog(currentEx)} style={{
          width: 48, height: 48, borderRadius: '50%', background: 'none', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--accent)',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        </button>

        <button onClick={handleNext} style={{
          width: 48, height: 48, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      {/* ===== PAUSED OVERLAY ===== */}
      {isPaused && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32,
        }}>
          {showQuit ? (
            <div className="card" style={{ maxWidth: 300, textAlign: 'center' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Quit Session</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>You can take a break and resume when you are ready. Do you still want to quit?</p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setShowQuit(false)} className="btn-secondary" style={{ flex: 1, padding: 12, fontSize: 14 }}>No</button>
                <button onClick={onBack} className="btn-primary" style={{ flex: 1, padding: 12, fontSize: 14 }}>Yes</button>
              </div>
            </div>
          ) : (
            <>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Session Paused</h3>
              <button onClick={() => setIsPaused(false)} className="btn-primary" style={{ maxWidth: 280, marginBottom: 4 }}>Resume</button>
              <button className="btn-secondary" style={{ maxWidth: 280, marginBottom: 4 }}>Complete Later</button>
              <button onClick={() => setPhase('complete')} className="btn-secondary" style={{ maxWidth: 280, marginBottom: 4 }}>Mark Complete</button>
              <button onClick={() => setShowQuit(true)} className="btn-secondary" style={{ maxWidth: 280 }}>Quit</button>
            </>
          )}
        </div>
      )}

      {/* ===== SESSION SETTINGS ===== */}
      {showSettings && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 20, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowSettings(false)}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%',
            padding: '12px 16px 32px', maxHeight: '70vh', overflow: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 16 }}>Session Settings</h3>

            {/* Mode toggle */}
            <div style={{ display: 'flex', background: 'var(--bg-primary)', borderRadius: 50, padding: 3, marginBottom: 16 }}>
              {['guided', 'advanced'].map(m => (
                <button key={m} onClick={() => setSettings({ ...settings, mode: m })} style={{
                  flex: 1, padding: '10px 0', borderRadius: 50, fontSize: 13, fontWeight: 600, border: 'none',
                  background: settings.mode === m ? 'rgba(61,255,210,0.15)' : 'transparent',
                  color: settings.mode === m ? 'var(--accent-mint)' : 'var(--text-secondary)',
                  textTransform: 'capitalize',
                }}>
                  {m}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.4 }}>
              Follow the workout exercise by exercise. Personalise your experience using the options below.
            </p>

            {[
              ['autoForward', 'Auto Forward'],
              ['logRepsWeight', 'Log Reps & Weight'],
              ['showVideo', 'Show Video'],
              ['muteVideo', 'Mute Video'],
              ['audioCues', 'Audio Cues'],
              ['completeWhistle', 'Exercise Complete Whistle'],
              ['prepTime', 'Exercise Prep Time'],
            ].map(([key, label]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
                <span style={{ fontSize: 14 }}>{label}</span>
                <button onClick={() => setSettings({ ...settings, [key]: !settings[key] })} style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
                  background: settings[key] ? 'var(--accent-mint)' : 'var(--divider)', transition: 'background 0.2s',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2,
                    left: settings[key] ? 22 : 2, transition: 'left 0.2s',
                  }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== LOG EXERCISE MODAL ===== */}
      {showLog && (
        <LogExerciseModal exercise={showLog} onSave={handleLogSave} onClose={() => setShowLog(null)} existing={loggedSets[showLog.exercise_id]} />
      )}

      {/* ===== EXERCISE DETAIL MODAL ===== */}
      {showExDetail && (
        <ExerciseDetailModal exercise={showExDetail} onClose={() => setShowExDetail(null)} />
      )}
    </div>
  );
}

function LogExerciseModal({ exercise, onSave, onClose, existing }) {
  const [sets, setSets] = useState(existing || Array.from({ length: exercise.sets || 3 }, () => ({ reps: parseInt(exercise.reps) || 10, weight: 0 })));
  const [notes, setNotes] = useState('');

  const addSet = () => setSets([...sets, { reps: parseInt(exercise.reps) || 10, weight: 0 }]);
  const removeSet = (i) => {
    if (sets.length <= 1) return;
    setSets(sets.filter((_, idx) => idx !== i));
  };
  const updateSet = (i, field, val) => {
    const updated = [...sets];
    updated[i] = { ...updated[i], [field]: parseFloat(val) || 0 };
    setSets(updated);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%',
        padding: '12px 16px 32px', maxHeight: '80vh', overflow: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>Log Exercise</h3>
          <div style={{ width: 32 }} />
        </div>

        <div className="card-sm" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Exercise</p>
          <p style={{ fontSize: 15, fontWeight: 600 }}>{exercise.name}</p>
        </div>

        {/* Sets */}
        <div className="card" style={{ marginBottom: 16 }}>
          {sets.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
              borderBottom: i < sets.length - 1 ? '1px solid var(--divider)' : 'none',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', width: 40 }}>Set {i + 1}</span>
              <input
                type="number" value={s.reps} onChange={e => updateSet(i, 'reps', e.target.value)}
                style={{ width: 60, background: 'var(--bg-primary)', border: '1px solid var(--divider)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, textAlign: 'center' }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>reps</span>
              <input
                type="number" value={s.weight} onChange={e => updateSet(i, 'weight', e.target.value)}
                style={{ width: 60, background: 'var(--bg-primary)', border: '1px solid var(--divider)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, textAlign: 'center' }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>kg</span>
              <button
                onClick={() => removeSet(i)}
                style={{
                  width: 28, height: 28, borderRadius: '50%', border: 'none', flexShrink: 0,
                  background: sets.length <= 1 ? 'transparent' : 'rgba(255,69,58,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: sets.length <= 1 ? 0.2 : 1, cursor: sets.length <= 1 ? 'default' : 'pointer',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={sets.length <= 1 ? 'var(--text-tertiary)' : '#FF453A'} strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        <button onClick={addSet} style={{
          width: '100%', padding: '12px', background: 'var(--bg-card)', border: 'none', borderRadius: 12,
          color: 'var(--accent)', fontSize: 14, fontWeight: 600, marginBottom: 16,
        }}>
          + Add More
        </button>

        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Notes</p>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Add notes..."
            className="input-field" style={{ minHeight: 60, fontSize: 14, resize: 'vertical' }}
          />
        </div>

        <button className="btn-primary" onClick={() => onSave(exercise.exercise_id, sets)}>Save</button>
      </div>
    </div>
  );
}
