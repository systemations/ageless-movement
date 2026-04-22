import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import WorkoutThumb from './WorkoutThumb';

/* ─── Phase theme config ─── */
const phaseThemes = {
  base_building: { accent: '#85FFBA', gradient: 'linear-gradient(135deg, #0A3D2F 0%, #0D1F1A 100%)', icon: '🏗', label: 'Base Building' },
  recovery:      { accent: '#FF9500', gradient: 'linear-gradient(135deg, #3D2A0A 0%, #1F1A0D 100%)', icon: '🔄', label: 'Recovery' },
  deload:        { accent: '#FF9500', gradient: 'linear-gradient(135deg, #3D2A0A 0%, #1F1A0D 100%)', icon: '⏸', label: 'Deload' },
  intensification: { accent: '#007AFF', gradient: 'linear-gradient(135deg, #0A1E3D 0%, #0D1520 100%)', icon: '⚡', label: 'Intensification' },
  expression:    { accent: '#AF52DE', gradient: 'linear-gradient(135deg, #2A0A3D 0%, #1A0D20 100%)', icon: '🔥', label: 'Expression' },
  retest:        { accent: '#FF3B30', gradient: 'linear-gradient(135deg, #3D0A0A 0%, #200D0D 100%)', icon: '📊', label: 'Test Week' },
};

// Module-level cache: on tab remount seed from cache to avoid blank-flash.
const todayCache = { today: null };

// Fire this when something changes today's sessions (e.g. user adds a workout)
// so the Home phase card refetches instead of showing stale data.
export function invalidateTodayCache() {
  todayCache.today = null;
  window.dispatchEvent(new CustomEvent('athlete-today-invalidate'));
}

const sessionIcons = {
  gym: '🏋️',
  sport: '🏓',
  cardio: '🏃',
  run: '🏃',
  circuit: '💪',
  recovery: '🧘',
};

/* ─── Shared animation keyframes ─── */
const fadeSlideStyle = {
  animation: 'fadeSlideIn 0.3s ease-out forwards',
};

export default function EnhancedToday({ features, onNavigateWorkout, onNavigateNutrition, onActiveBlock }) {
  const { token } = useAuth();
  const [today, setToday] = useState(todayCache.today);
  const [loading, setLoading] = useState(!todayCache.today);
  const [checkinData, setCheckinData] = useState({});
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [checkinSaved, setCheckinSaved] = useState(false);
  const [expandedSection, setExpandedSection] = useState(null); // 'meals' | 'supplements' | null
  const [completedSupps, setCompletedSupps] = useState(new Set());

  // If we have cached data, signal the parent immediately so its layout
  // (e.g. hasEnhancedToday) doesn't flash the non-enhanced branch on remount.
  useEffect(() => {
    if (todayCache.today && onActiveBlock) {
      const c = todayCache.today;
      onActiveBlock(!!c.block || (c.workouts?.length > 0));
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const fetchToday = async () => {
      try {
        const res = await fetch('/api/athlete/today', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          todayCache.today = data;
          setToday(data);
          if (onActiveBlock) onActiveBlock(!!data?.block || (data?.workouts?.length > 0));
        }
      } catch (err) { console.error('Today fetch error:', err); }
      setLoading(false);
    };
    const fetchCheckin = async () => {
      const todayDate = new Date().toISOString().split('T')[0];
      try {
        const res = await fetch(`/api/athlete/checkin?date=${todayDate}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCheckinData(data.metrics || {});
        }
      } catch (err) { /* ignore */ }
    };
    fetchToday();
    fetchCheckin();
    const onInvalidate = () => fetchToday();
    window.addEventListener('athlete-today-invalidate', onInvalidate);
    return () => window.removeEventListener('athlete-today-invalidate', onInvalidate);
  }, [token]);

  if (loading) return null;
  // Render Sessions card even when there's no training block (e.g. client
  // self-enrolled in a program via Explore) as long as we have workouts.
  if (!today?.block && (!today?.workouts || today.workouts.length === 0)) return null;

  const theme = phaseThemes[today.phase?.theme] || phaseThemes.base_building;
  const isDeload = today.phase?.theme === 'deload' || today.phase?.theme === 'recovery';
  const progressPct = today.block?.duration_weeks
    ? Math.round((today.week_number / today.block.duration_weeks) * 100)
    : 0;

  const saveCheckin = async () => {
    setCheckinSaving(true);
    try {
      await fetch('/api/athlete/checkin', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today.date, metrics: checkinData }),
      });
      setCheckinSaved(true);
      setTimeout(() => setCheckinSaved(false), 2000);
    } catch (err) { console.error(err); }
    setCheckinSaving(false);
  };

  const removeSession = async (entry) => {
    if (!entry?.workout_id && !entry?.schedule_id) return;
    const label = entry.workout?.title || entry.session_ref?.replace(/_/g, ' ') || 'this session';
    if (!window.confirm(`Remove "${label}" from today?`)) return;
    try {
      if (entry.source === 'user_added' && entry.schedule_id) {
        await fetch(`/api/schedule/${entry.schedule_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } else if (entry.workout_id) {
        // Program/block session -> suppress for this date instead of deleting.
        await fetch('/api/schedule/suppress', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ workout_id: entry.workout_id, date: today.date }),
        });
      }
      // Optimistic local removal, then refetch to pick up server state.
      setToday(prev => prev ? { ...prev, workouts: prev.workouts.filter(w => w !== entry) } : prev);
      todayCache.today = null;
      window.dispatchEvent(new CustomEvent('athlete-today-invalidate'));
    } catch (err) { console.error('Remove session error:', err); }
  };

  const toggleSupp = (name) => {
    setCompletedSupps(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <>
      {/* Inject keyframe animation */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(61,255,210,0.3); }
          50% { box-shadow: 0 0 12px 4px rgba(61,255,210,0.15); }
        }
        @keyframes progressFill {
          from { width: 0%; }
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════════
          1. PHASE HERO BANNER
          ═══════════════════════════════════════════════════════ */}
      {today?.phase && features?.phase_banners?.unlocked && (
        <div style={{
          background: theme.gradient,
          borderRadius: 14,
          padding: '12px 14px',
          marginBottom: 12,
          border: `1px solid ${theme.accent}22`,
          position: 'relative',
          overflow: 'hidden',
          ...fadeSlideStyle,
        }}>
          {/* Top row: theme chip + phase name + week counter */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, marginBottom: 8,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{
                  fontSize: 9, fontWeight: 800,
                  padding: '2px 7px', borderRadius: 5,
                  background: `${theme.accent}25`,
                  color: theme.accent,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  {theme.icon} {theme.label}
                </span>
              </div>
              <p style={{
                fontSize: 15, fontWeight: 800, color: '#fff',
                letterSpacing: -0.3, lineHeight: 1.2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {today.phase.name}
              </p>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '4px 10px',
              textAlign: 'center', flexShrink: 0,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
                Wk
              </span>
              <span style={{ fontSize: 16, fontWeight: 900, color: theme.accent, marginLeft: 4 }}>
                {today.week_number}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>
                /{today.block.duration_weeks}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{
            height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
            marginBottom: isDeload ? 8 : 0,
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${progressPct}%`,
              background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent}88)`,
            }} />
          </div>

          {/* Deload banner - kept but compact */}
          {isDeload && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 8,
              background: 'rgba(255,149,0,0.12)',
              border: '1px solid rgba(255,149,0,0.2)',
            }}>
              <span style={{ fontSize: 13 }}>⏸</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#FF9500' }}>
                Deload Week — Volume -40% / Intensity -15%
              </span>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          2. ALERTS
          ═══════════════════════════════════════════════════════ */}
      {today?.alerts?.length > 0 && today.alerts.map((alert, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', borderRadius: 12, marginBottom: 10,
          background: alert.severity === 'warning'
            ? 'linear-gradient(135deg, rgba(255,149,0,0.12), rgba(255,149,0,0.04))'
            : 'linear-gradient(135deg, rgba(61,255,210,0.08), rgba(61,255,210,0.02))',
          border: `1px solid ${alert.severity === 'warning' ? 'rgba(255,149,0,0.2)' : 'rgba(61,255,210,0.15)'}`,
          ...fadeSlideStyle,
          animationDelay: `${i * 0.1}s`,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: alert.severity === 'warning' ? 'rgba(255,149,0,0.15)' : 'rgba(61,255,210,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>
            {alert.type === 'scan_reminder' ? '📊' : '🩸'}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
            {alert.message}
          </span>
        </div>
      ))}

      {/* ═══════════════════════════════════════════════════════
          3. TODAY'S SESSIONS
          ═══════════════════════════════════════════════════════ */}
      {today?.workouts?.length > 0 && (
        <div style={{
          borderRadius: 16, overflow: 'hidden', marginBottom: 14,
          background: 'var(--bg-card)',
          ...fadeSlideStyle,
          animationDelay: '0.1s',
        }}>
          <div style={{ padding: '16px 18px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>Today's Sessions</h3>
              <span style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)',
              }}>
                {today.workouts.length} session{today.workouts.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Single session: render stacked. Multiple: render as swipeable row. */}
          {today.workouts.length === 1 ? (
            <SessionCard
              entry={today.workouts[0]}
              theme={theme}
              onNavigateWorkout={onNavigateWorkout}
              onRemove={removeSession}
              date={today.date}
              stacked
            />
          ) : (
            <div
              className="hide-scrollbar"
              style={{
                display: 'flex', gap: 10,
                overflowX: 'auto', scrollSnapType: 'x mandatory',
                padding: '12px 14px',
                borderTop: '1px solid var(--divider)',
              }}
            >
              {today.workouts.map((entry, i) => (
                <div
                  key={i}
                  style={{ flex: '0 0 86%', scrollSnapAlign: 'start' }}
                >
                  <SessionCard
                    entry={entry}
                    theme={theme}
                    onNavigateWorkout={onNavigateWorkout}
                    onRemove={removeSession}
                    date={today.date}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Multi-session reminder */}
          {today.workouts.length >= 2 && today.workouts.some(w => w.session_type === 'sport') && (
            <div style={{
              padding: '10px 18px 14px',
              borderTop: '1px solid var(--divider)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 14 }}>💡</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                Gym session is leg-free by design. Save your legs for pickleball.
              </span>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          4. MACRO TARGETS
          ═══════════════════════════════════════════════════════ */}
      {features?.smart_targets?.unlocked && today?.calorie_targets && (
        <div style={{
          borderRadius: 16, overflow: 'hidden', marginBottom: 14,
          background: 'var(--bg-card)',
          ...fadeSlideStyle,
          animationDelay: '0.15s',
        }}>
          <div style={{ padding: '16px 18px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>Targets</h3>
              <span style={{
                fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 8,
                letterSpacing: 0.8, textTransform: 'uppercase',
                background: today.is_training_day
                  ? 'linear-gradient(135deg, rgba(61,255,210,0.15), rgba(61,255,210,0.05))'
                  : 'rgba(142,142,147,0.12)',
                color: today.is_training_day ? '#85FFBA' : 'var(--text-tertiary)',
                border: `1px solid ${today.is_training_day ? 'rgba(61,255,210,0.2)' : 'transparent'}`,
              }}>
                {today.is_training_day ? 'Training Day' : 'Rest Day'}
              </span>
            </div>

            {/* Big calorie number */}
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <span style={{
                fontSize: 42, fontWeight: 900, letterSpacing: -2,
                color: 'var(--accent-orange)',
                lineHeight: 1,
              }}>
                {today.calorie_targets.calories}
              </span>
              <span style={{
                fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)',
                marginLeft: 4,
              }}>kcal</span>
            </div>

            {/* Macro pills */}
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'Protein', value: today.calorie_targets.protein, unit: 'g', color: '#85FFBA', bg: 'rgba(61,255,210,0.1)' },
                { label: 'Fat', value: today.calorie_targets.fat, unit: 'g', color: '#FF6B6B', bg: 'rgba(255,107,107,0.1)' },
                { label: 'Carbs', value: today.calorie_targets.carbs, unit: 'g', color: '#007AFF', bg: 'rgba(0,122,255,0.1)' },
              ].map(m => (
                <div key={m.label} style={{
                  flex: 1, textAlign: 'center', padding: '12px 8px',
                  borderRadius: 12, background: m.bg,
                }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: m.color, letterSpacing: -1 }}>
                    {m.value}<span style={{ fontSize: 12, fontWeight: 600 }}>{m.unit}</span>
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
                    marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>{m.label}</div>
                </div>
              ))}
            </div>

            {/* ── Next Meal quickview + Log buttons ── */}
            {(() => {
              const hasMeals = features?.meal_templates?.unlocked && today?.meal_template?.meals?.length > 0;
              const hasSupps = features?.supplement_tracker?.unlocked && today?.supplements?.length > 0;
              if (!hasMeals && !hasSupps) return null;

              // Find next upcoming meal based on current time-of-day
              let nextMeal = null;
              if (hasMeals) {
                const now = new Date();
                const nowMins = now.getHours() * 60 + now.getMinutes();
                for (const m of today.meal_template.meals) {
                  if (!m.time) continue;
                  const match = m.time.match(/^(\d{1,2}):(\d{2})/);
                  if (match) {
                    const mealMins = parseInt(match[1]) * 60 + parseInt(match[2]);
                    if (mealMins >= nowMins) { nextMeal = m; break; }
                  }
                }
                if (!nextMeal) nextMeal = today.meal_template.meals[0]; // fallback: first meal tomorrow
              }

              return (
                <div style={{
                  marginTop: 14, paddingTop: 12,
                  borderTop: '1px solid var(--divider)',
                }}>
                  {/* Next Meal quickview */}
                  {nextMeal && (
                    <div
                      onClick={() => onNavigateNutrition && onNavigateNutrition('Food Diary')}
                      style={{
                        background: 'rgba(255,255,255,0.025)',
                        borderRadius: 12, padding: '10px 12px', marginBottom: 8,
                        borderLeft: `3px solid ${theme.accent}66`, cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginBottom: 4,
                      }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800, color: theme.accent,
                          textTransform: 'uppercase', letterSpacing: 0.5,
                        }}>
                          Next Meal
                        </span>
                        {nextMeal.time && (
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                            {nextMeal.time.match(/^\d{1,2}:\d{2}/) ? nextMeal.time : (nextMeal.meal || '').replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <p style={{
                        fontSize: 13, color: 'var(--text-secondary)',
                        lineHeight: 1.4, margin: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {(nextMeal.items || []).slice(0, 3).join(' · ')}
                        {(nextMeal.items || []).length > 3 ? ' ...' : ''}
                      </p>
                    </div>
                  )}

                  {/* Log Meals / Log Supps buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {hasMeals && (
                      <div
                        onClick={() => onNavigateNutrition && onNavigateNutrition('Food Diary')}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          gap: 6, padding: '12px', borderRadius: 10, cursor: 'pointer',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid transparent',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{ fontSize: 14 }}>🍖</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: -0.2 }}>
                          Log Meals
                        </span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </div>
                    )}
                    {hasSupps && (
                      <div
                        onClick={() => onNavigateNutrition && onNavigateNutrition('Supplements')}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          gap: 6, padding: '12px', borderRadius: 10, cursor: 'pointer',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid transparent',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{ fontSize: 14 }}>💊</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: -0.2 }}>
                          Log Supps
                        </span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Daily check-in removed from homepage — will be notification-driven */}
    </>
  );
}

function SessionCard({ entry, theme, onNavigateWorkout, onRemove, stacked = false }) {
  return (
    <div
      onClick={() => entry.workout && onNavigateWorkout(entry.workout.id)}
      style={{
        padding: stacked ? '12px 14px' : 0,
        borderTop: stacked ? '1px solid var(--divider)' : 'none',
        cursor: entry.workout ? 'pointer' : 'default',
        position: 'relative',
      }}
    >
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(entry); }}
          aria-label="Remove from today"
          style={{
            position: 'absolute', top: stacked ? 20 : 8, right: stacked ? 22 : 8,
            width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2, backdropFilter: 'blur(4px)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
      <WorkoutThumb
        title={entry.workout?.title || entry.session_ref?.replace(/_/g, ' ') || ''}
        thumbnailUrl={entry.workout?.image_url}
        aspectRatio="16/9"
        borderRadius={12}
        titleFontSize={18}
      />
      <div style={{ padding: '10px 2px 2px' }}>
        <p style={{
          fontSize: 16, fontWeight: 800, marginBottom: 6,
          letterSpacing: -0.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {entry.workout?.title || entry.session_ref?.replace(/_/g, ' ')}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
            background: `${theme.accent}15`,
            color: theme.accent,
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            {entry.session_type}
          </span>
          {entry.time_slot && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {entry.time_slot}
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {entry.duration_min} min
          </span>
        </div>
      </div>
    </div>
  );
}
