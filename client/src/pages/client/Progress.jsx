import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import CheckinForm from './CheckinForm';
import ROMTracking from './ROMTracking';
import PainLogging from './PainLogging';
import ExerciseProgress from '../../components/ExerciseProgress';

// Per-letter colour for the movement-assessment dots/pills. A is the
// gold-star pick, B is the wobble, C is the "we need to work on this".
// Same scale the coach sees on ClientProfile so the read is consistent.
const ASSESSMENT_COLORS = {
  A: 'var(--accent-mint)',
  B: '#FFC152',
  C: '#FF6B6B',
  D: '#FF6B6B',
};

// Short label shown on the goal card for auto-tracked goals.
function autoBadgeLabel(goal) {
  switch (goal.metric_type) {
    case 'workouts_per_week': return `Auto · ${goal.target_value}/wk`;
    case 'streak_days':       return `Auto · ${goal.target_value}-day streak`;
    case 'workouts_total':    return `Auto · ${goal.target_value} workouts`;
    case 'course_completion': return `Auto · course`;
    default:                  return 'Auto';
  }
}

// One-line explainer shown when an auto-tracked goal is expanded.
function autoExplainer(goal, courseOptions) {
  switch (goal.metric_type) {
    case 'workouts_per_week':
      return 'Tracked from completed workouts in the last 7 days.';
    case 'streak_days':
      return 'Counts consecutive days with at least one completed workout.';
    case 'workouts_total':
      return 'Lifetime count of completed workouts toward your milestone.';
    case 'course_completion': {
      const c = courseOptions.find(c => c.id === parseInt(goal.target_value, 10));
      return `Tracks lessons completed in ${c?.title || 'the chosen course'}.`;
    }
    default:
      return 'Auto-tracked.';
  }
}

// Starter goals shown on the Goals section when the client has no
// goals yet. Tap-to-add - each maps to a POST /api/goals payload so
// the existing goal flow handles persistence + auto-tracking. Mix of
// auto-tracked (workouts/streak/course) and manual targets so the
// client sees both kinds of goal up front. Empty-state UX from Dan
// 2026-05-06: clients struggle to author goals from scratch.
const SUGGESTED_GOALS = [
  {
    icon: '💪',
    title: 'Train 3x this week',
    target: 'Three sessions in a 7 day window',
    category: 'Consistency',
    metric_type: 'workouts_per_week',
    target_value: 3,
  },
  {
    icon: '🧘',
    title: 'Pain-free squat',
    target: 'Full depth bodyweight squat with no discomfort',
    category: 'Mobility',
    metric_type: 'manual',
  },
  {
    icon: '🤸',
    title: 'Touch your toes',
    target: 'Standing forward fold, palms flat on floor',
    category: 'Flexibility',
    metric_type: 'manual',
  },
  {
    icon: '🔥',
    title: '7-day training streak',
    target: 'Move every day for a week',
    category: 'Consistency',
    metric_type: 'streak_days',
    target_value: 7,
  },
  {
    icon: '🎯',
    title: 'Finish AMS Getting Started',
    target: 'Complete every lesson in the assessment course',
    category: 'Program',
    metric_type: 'course_completion',
    target_value: 5,
  },
  {
    icon: '🪑',
    title: 'Sit cross-legged for 10 mins',
    target: 'Comfortably, no aching hips',
    category: 'Mobility',
    metric_type: 'manual',
  },
];

const categoryColors = {
  Mobility: '#3DFFD2',
  Flexibility: '#64D2FF',
  Consistency: '#FF9500',
  'Body Comp': '#FF6B9D',
  Program: '#BF5AF2',
  Milestone: '#FFD60A',
  Nutrition: '#30D158',
};

export default function Progress() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [assessmentSummary, setAssessmentSummary] = useState(null);
  const [statsSummary, setStatsSummary] = useState(null);
  const [showAchieved, setShowAchieved] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [showROM, setShowROM] = useState(false);
  const [showPain, setShowPain] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showExerciseProgress, setShowExerciseProgress] = useState(null); // exercise_id
  const [exerciseList, setExerciseList] = useState([]);
  const [newGoal, setNewGoal] = useState({
    title: '', target: '', category: 'General',
    metric_type: 'manual', target_value: '',
  });
  const [goals, setGoals] = useState([]);
  const [achievedGoals, setAchievedGoals] = useState([]);
  const [expandedGoalId, setExpandedGoalId] = useState(null);
  const [courseOptions, setCourseOptions] = useState([]);

  const fetchGoals = () => {
    fetch('/api/goals', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { active: [], achieved: [] })
      .then(d => { setGoals(d.active || []); setAchievedGoals(d.achieved || []); })
      .catch(() => {});
  };

  // Pull course list for the course_completion metric picker. Coach
  // edits to course visibility/title flow through here on next mount.
  const fetchCourses = () => {
    fetch('/api/content/courses', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { courses: [] })
      .then(d => setCourseOptions(d.courses || []))
      .catch(() => {});
  };
  const [myCheckins, setMyCheckins] = useState([]);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState([]); // [checkinId, checkinId]
  const [compareView, setCompareView] = useState(null); // { left, right }

  useEffect(() => { fetchGoals(); fetchCourses(); }, [token]);

  // Roll-up of the AMS Getting Started movement assessments. Powers
  // the "Movement Assessments" card up top so the client can see their
  // last A/B/C per region without diving into the course.
  useEffect(() => {
    if (!token) return;
    fetch('/api/content/assessment-summary', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => setAssessmentSummary(d))
      .catch(() => { /* non-blocking */ });
  }, [token]);

  // Body comp + activity averages for the Stats section. Weekly
  // averages are computed server-side from raw daily logs.
  useEffect(() => {
    if (!token) return;
    fetch('/api/athlete/stats-summary', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => setStatsSummary(d))
      .catch(() => { /* non-blocking */ });
  }, [token]);

  useEffect(() => {
    fetch('/api/explore/progress/exercises', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setExerciseList(d.exercises || []))
      .catch(console.error);

    fetch('/api/coach/checkins/me/list', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setMyCheckins(d.checkins || []))
      .catch(console.error);
  }, []);

  const photoCheckins = myCheckins.filter(c => c.photo_front_url || c.photo_side_url || c.photo_back_url);

  const toggleCompareSelection = (checkinId) => {
    setCompareSelection(prev => {
      if (prev.includes(checkinId)) return prev.filter(id => id !== checkinId);
      if (prev.length >= 2) return [prev[1], checkinId]; // rolling window
      return [...prev, checkinId];
    });
  };

  const openComparison = () => {
    if (compareSelection.length !== 2) return;
    const [a, b] = compareSelection.map(id => photoCheckins.find(c => c.id === id));
    if (!a || !b) return;
    // Older on the left, newer on the right for a natural progression read.
    const [left, right] = a.date <= b.date ? [a, b] : [b, a];
    setCompareView({ left, right });
  };

  // Auto-compare the very first check-in photo (baseline) against the latest.
  // This is the primary "Before & After" flow - no manual picking needed.
  const openBeforeAfter = () => {
    if (photoCheckins.length < 2) return;
    const sorted = [...photoCheckins].sort((a, b) => new Date(a.date) - new Date(b.date));
    setCompareView({ left: sorted[0], right: sorted[sorted.length - 1] });
  };

  // Tap-to-add starter goal. Posts the preset to the same /api/goals
  // endpoint the manual + Add Goal flow uses, then refreshes the list
  // so the new goal renders immediately and the suggestion grid
  // disappears.
  const addSuggestedGoal = async (s) => {
    try {
      await fetch('/api/goals', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: s.title,
          target: s.target,
          category: s.category,
          metric_type: s.metric_type || 'manual',
          target_value: s.target_value ?? null,
        }),
      });
      fetchGoals();
    } catch (err) { /* swallow - user can retry */ }
  };

  const handleAddGoal = async () => {
    if (!newGoal.title.trim()) return;
    if (newGoal.metric_type !== 'manual' && !newGoal.target_value) return;
    try {
      await fetch('/api/goals', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newGoal.title,
          target: newGoal.target,
          category: newGoal.category,
          metric_type: newGoal.metric_type,
          target_value: newGoal.metric_type === 'manual' ? null : parseFloat(newGoal.target_value),
        }),
      });
      setNewGoal({ title: '', target: '', category: 'General', metric_type: 'manual', target_value: '' });
      setShowAddGoal(false);
      fetchGoals();
    } catch (err) { /* swallow */ }
  };

  const updateGoalProgress = async (goalId, pct) => {
    try {
      await fetch(`/api/goals/${goalId}/progress`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: pct }),
      });
      // Optimistic local update so the slider feels instant
      setGoals(gs => gs.map(g => g.id === goalId ? { ...g, progress: pct } : g));
    } catch (err) { /* swallow */ }
  };

  const achieveGoal = async (goalId) => {
    await fetch(`/api/goals/${goalId}/achieve`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    setExpandedGoalId(null);
    fetchGoals();
  };

  const deleteGoal = async (goalId) => {
    if (!confirm('Delete this goal? This can\'t be undone.')) return;
    await fetch(`/api/goals/${goalId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    setExpandedGoalId(null);
    fetchGoals();
  };

  if (showCheckin) return <CheckinForm onClose={() => setShowCheckin(false)} onSuccess={() => setShowCheckin(false)} />;
  if (showROM) return <ROMTracking onBack={() => setShowROM(false)} />;
  if (showPain) return <PainLogging onBack={() => setShowPain(false)} />;
  if (showExerciseProgress) return <ExerciseProgress exerciseId={showExerciseProgress} onBack={() => setShowExerciseProgress(null)} />;
  if (compareView) return <PhotoCompareView view={compareView} onBack={() => { setCompareView(null); setCompareMode(false); setCompareSelection([]); }} />;

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Progress</h1>
      </div>

      <>
          {/* Photos - hoisted to the top so the before/after surface is
              the first thing the client sees on Progress. The photo
              strip itself is the visual progress; the standalone
              Before-and-After / Share cards used to live here but
              are gone now per Dan 2026-05-06 (the strip says it). */}
          <CollapsibleSection
            title="Progress Photos"
            subtitle={photoCheckins.length === 0 ? 'No progress photos yet' : `${photoCheckins.length} on file - swipe to compare`}
            accent="#2BB5A3"
            action={
              photoCheckins.length >= 2 && !compareMode ? (
                <button onClick={() => { setCompareMode(true); setCompareSelection([]); }} style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 8 }}>Compare</button>
              ) : compareMode ? (
                <button onClick={() => { setCompareMode(false); setCompareSelection([]); }} style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 8 }}>Cancel</button>
              ) : null
            }
          >
            {photoCheckins.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" style={{ margin: '0 auto 12px' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No progress photos yet</p>
                <p style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Complete a check-in to add photos</p>
              </div>
            ) : (
              <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -16px', padding: '0 16px 4px' }}>
                {photoCheckins.map(c => {
                  const thumb = c.photo_front_url || c.photo_side_url || c.photo_back_url;
                  const selected = compareSelection.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => compareMode && toggleCompareSelection(c.id)}
                      style={{
                        minWidth: 110, cursor: compareMode ? 'pointer' : 'default',
                        borderRadius: 12, overflow: 'hidden', position: 'relative',
                        border: selected ? '2px solid var(--accent-mint)' : '2px solid transparent',
                      }}
                    >
                      <img src={thumb} alt="" style={{ width: 110, height: 140, objectFit: 'cover', display: 'block' }} />
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        padding: '6px 8px',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
                        color: '#fff', fontSize: 11, fontWeight: 700,
                      }}>{new Date(c.date).toLocaleDateString('en-IE', { day: '2-digit', month: 'short' })}</div>
                      {selected && (
                        <div style={{
                          position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%',
                          background: 'var(--accent-mint)', color: '#000',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 800,
                        }}>{compareSelection.indexOf(c.id) + 1}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {compareMode && (
              <button
                className="btn-primary"
                onClick={openComparison}
                disabled={compareSelection.length !== 2}
                style={{ fontSize: 14, opacity: compareSelection.length === 2 ? 1 : 0.5, marginTop: 12 }}
              >
                {compareSelection.length === 2 ? 'Show side-by-side' : `Pick ${2 - compareSelection.length} more photo${2 - compareSelection.length === 1 ? '' : 's'}`}
              </button>
            )}
          </CollapsibleSection>

          {/* Check-in Prompt */}
          <CollapsibleSection
            title="Check Ins"
            subtitle="Due in 2 days"
            accent="#4A8AB8"
          >
            <div className="card" onClick={() => setShowCheckin(true)} style={{ textAlign: 'center', cursor: 'pointer' }}>
              <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Check in Now</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Due in 2 days</p>
            </div>
          </CollapsibleSection>

          {/* Stats - body comp from latest check-in + 7-day averages
              for water / steps / calories / workouts. Replaces the old
              Measurements stub with real data plumbing. Only the cards
              with data render so empties don't pad the strip. */}
          <CollapsibleSection
            title="Stats"
            subtitle={statsSummary?.latest_checkin?.date
              ? `Last check-in ${new Date(statsSummary.latest_checkin.date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}`
              : 'Body comp + this week\'s averages'}
            accent="#FF6B9D"
            defaultOpen={false}
          >
          <StatsRow stats={statsSummary} />
          </CollapsibleSection>

          {/* Goals Section */}
          <CollapsibleSection
            title="Goals"
            subtitle={goals.length === 0 ? 'No goals yet' : `${goals.length} active${achievedGoals.length ? ` · ${achievedGoals.length} achieved` : ''}`}
            accent="#7C5BCE"
            action={<button onClick={() => setShowAddGoal(!showAddGoal)} style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 8 }}>+ Add</button>}
          >

          {/* Active Goals - empty state shows tap-to-add starter
              suggestions because cold-starting a goal from a blank
              form is the friction point Dan flagged. */}
          {goals.length === 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '4px 4px 12px', lineHeight: 1.5 }}>
                Pick one to get going. Tap any of these to add it to your list, or use + Add for your own.
              </p>
              {SUGGESTED_GOALS.map(s => {
                const color = categoryColors[s.category] || 'var(--accent-mint)';
                return (
                  <div
                    key={s.title}
                    className="card"
                    onClick={() => addSuggestedGoal(s)}
                    style={{
                      marginBottom: 8, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                      background: `${color}25`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20,
                    }}>{s.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700 }}>{s.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{s.target}</p>
                    </div>
                    <div style={{
                      flexShrink: 0,
                      background: 'var(--accent)', color: '#fff',
                      borderRadius: 8, padding: '6px 12px',
                      fontSize: 12, fontWeight: 800,
                      letterSpacing: 0.3,
                    }}>+ Add</div>
                  </div>
                );
              })}
            </div>
          )}
          {goals.map((goal) => {
            const expanded = expandedGoalId === goal.id;
            const color = categoryColors[goal.category] || 'var(--accent-mint)';
            return (
              <div
                key={goal.id}
                className="card"
                style={{ marginBottom: 8, cursor: 'pointer' }}
                onClick={() => setExpandedGoalId(expanded ? null : goal.id)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* Progress Ring */}
                  <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
                    <svg width="48" height="48" viewBox="0 0 48 48">
                      <circle cx="24" cy="24" r="19" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                      <circle
                        cx="24" cy="24" r="19" fill="none"
                        stroke={color}
                        strokeWidth="4"
                        strokeDasharray={`${2 * Math.PI * 19}`}
                        strokeDashoffset={`${2 * Math.PI * 19 * (1 - goal.progress / 100)}`}
                        strokeLinecap="round" transform="rotate(-90 24 24)"
                      />
                    </svg>
                    <span style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700,
                    }}>
                      {goal.progress}%
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <h4 style={{ fontSize: 15, fontWeight: 700 }}>{goal.title}</h4>
                    </div>
                    {goal.target && (
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.4 }}>{goal.target}</p>
                    )}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                        background: `${color}20`, color,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                      }}>
                        {goal.category}
                      </span>
                      {goal.is_auto && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                          background: 'rgba(133,255,186,0.18)', color: 'var(--accent-mint)',
                          textTransform: 'uppercase', letterSpacing: 0.5,
                        }}>
                          {autoBadgeLabel(goal)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded controls */}
                {expanded && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--divider)' }} onClick={e => e.stopPropagation()}>
                    {goal.is_auto ? (
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                        {autoExplainer(goal, courseOptions)}
                      </p>
                    ) : (
                      <>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                          Update progress
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                          <input
                            type="range" min="0" max="100" value={goal.progress}
                            onChange={e => updateGoalProgress(goal.id, parseInt(e.target.value, 10))}
                            style={{ flex: 1, height: 4, accentColor: color }}
                          />
                          <span style={{ fontSize: 14, fontWeight: 800, color, minWidth: 42, textAlign: 'right' }}>
                            {goal.progress}%
                          </span>
                        </div>
                      </>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => achieveGoal(goal.id)}
                        style={{
                          flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                          background: 'var(--accent-mint)', color: '#000',
                          fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        }}
                      >✓ Mark achieved</button>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        style={{
                          padding: '10px 14px', borderRadius: 8,
                          border: '1px solid var(--divider)', background: 'transparent',
                          color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}
                      >Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Achieved Goals */}
          <button
            onClick={() => setShowAchieved(!showAchieved)}
            style={{
              background: 'none', border: 'none', color: 'var(--accent)',
              fontSize: 14, fontWeight: 600, padding: '12px 0', width: '100%', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: showAchieved ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            Achieved Goals ({achievedGoals.length})
          </button>

          {showAchieved && (
            <div style={{ marginBottom: 16 }}>
              {achievedGoals.map((goal) => (
                <div key={goal.id} className="card-sm" style={{
                  display: 'flex', alignItems: 'center', gap: 12, opacity: 0.85,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: `${categoryColors[goal.category] || 'var(--accent-mint)'}25`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={categoryColors[goal.category] || 'var(--accent-mint)'} strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, textDecoration: 'line-through', color: 'var(--text-secondary)' }}>{goal.title}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      Achieved {goal.achieved_date ? new Date(goal.achieved_date + 'Z').toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    </p>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                    background: `${categoryColors[goal.category]}20`,
                    color: categoryColors[goal.category],
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    {goal.category}
                  </span>
                </div>
              ))}
            </div>
          )}

          </CollapsibleSection>

          {/* Exercises */}
          <CollapsibleSection
            title="Exercises"
            subtitle={`${exerciseList.length} tracked`}
            accent="#3DA876"
            defaultOpen={false}
          >
          {exerciseList.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 24 }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No exercise data yet</p>
              <p style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Complete workouts to track exercise progress</p>
            </div>
          ) : (
            exerciseList.map(ex => (
              <div
                key={ex.exercise_id}
                className="card"
                onClick={() => setShowExerciseProgress(ex.exercise_id)}
                style={{ marginBottom: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
              >
                {ex.thumbnail_url ? (
                  <img src={ex.thumbnail_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--bg-primary)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{ex.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {ex.session_count} session{ex.session_count !== 1 ? 's' : ''} -- {ex.total_sets} sets
                    {ex.max_weight > 0 ? ` -- ${ex.max_weight}kg max` : ''}
                  </p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            ))
          )}
          </CollapsibleSection>

          {/* Pain Tracking */}
          {/* ROM tile hidden - phase 2 build (see VALD HumanTrak inspiration
              in /movement screening/). Will return as a numeric L/R degree
              entry surface with norm bands + trend lines. The ROMTracking
              component is left in place so flipping ROM_ENABLED back on
              restores the row. */}
          <CollapsibleSection
            title="Pain Log"
            subtitle="Track discomfort"
            accent="#DC4444"
            defaultOpen={false}
          >
            <div onClick={() => setShowPain(true)} className="card" style={{ textAlign: 'center', cursor: 'pointer', padding: '20px 12px' }}>
              <span style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>🩹</span>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Open the pain log</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Note where + how much it's bothering you</p>
            </div>
          </CollapsibleSection>

          {/* Movement Assessment - roll-up of the AMS Getting Started
              tap-to-pick lessons. Wrapped in CollapsibleSection so the
              title is a drop-down (not a navigation), with the orange
              CTA inside the card carrying the deep-link to the course. */}
          {assessmentSummary && assessmentSummary.total_lessons > 0 && (
            <CollapsibleSection
              title="Movement Assessment"
              subtitle={assessmentSummary.total_logged === 0
                ? 'Start your first assessment'
                : `${assessmentSummary.total_logged} of ${assessmentSummary.total_lessons} logged`}
              accent="#FF8C00"
              defaultOpen={false}
            >
              <MovementAssessmentsCard
                summary={assessmentSummary}
                onOpenCourse={() => navigate(assessmentSummary.course_id ? `/explore?course=${assessmentSummary.course_id}` : '/explore')}
              />
            </CollapsibleSection>
          )}
      </>

      {/* Add Goal bottom sheet */}
      {showAddGoal && (
        <div
          onClick={() => setShowAddGoal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
              width: '100%', maxWidth: 480, margin: '0 auto', padding: '16px 16px 32px',
              maxHeight: '80vh', overflow: 'auto',
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Set a Goal</h3>

            {/* Goal type picker - drives whether the user updates progress
                manually or it's auto-tracked from data we already capture. */}
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
              How do you want this tracked?
            </p>
            <select
              value={newGoal.metric_type}
              onChange={e => setNewGoal({ ...newGoal, metric_type: e.target.value, target_value: '' })}
              className="input-field"
              style={{ marginBottom: 4, fontSize: 14 }}
            >
              <option value="manual">Manual - I update the % myself</option>
              <option value="workouts_per_week">Workouts / week (auto)</option>
              <option value="streak_days">Workout streak (auto)</option>
              <option value="workouts_total">Total workouts (auto)</option>
              <option value="course_completion">Finish a course (auto)</option>
            </select>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.5 }}>
              {newGoal.metric_type === 'manual' && 'You set the percentage yourself with a slider on the goal card.'}
              {newGoal.metric_type === 'workouts_per_week' && 'Tracked from completed workouts in the last 7 days.'}
              {newGoal.metric_type === 'streak_days' && 'Counts consecutive days with at least one completed workout.'}
              {newGoal.metric_type === 'workouts_total' && 'Lifetime count of completed workouts toward your milestone.'}
              {newGoal.metric_type === 'course_completion' && 'Tracks lessons completed in the chosen course.'}
            </p>

            <input
              placeholder={
                newGoal.metric_type === 'workouts_per_week' ? 'Goal title (e.g. Train 5x per week)' :
                newGoal.metric_type === 'streak_days' ? 'Goal title (e.g. 30-day streak)' :
                newGoal.metric_type === 'workouts_total' ? 'Goal title (e.g. 100 workouts)' :
                newGoal.metric_type === 'course_completion' ? 'Goal title (e.g. Finish AMS Getting Started)' :
                'Goal title (e.g. Touch toes)'
              }
              value={newGoal.title}
              onChange={e => setNewGoal({ ...newGoal, title: e.target.value })}
              className="input-field"
              style={{ marginBottom: 10, fontSize: 14 }}
              autoFocus
            />
            <input
              placeholder="Description (optional)"
              value={newGoal.target}
              onChange={e => setNewGoal({ ...newGoal, target: e.target.value })}
              className="input-field"
              style={{ marginBottom: 10, fontSize: 14 }}
            />
            {newGoal.metric_type === 'workouts_per_week' && (
              <input
                type="number" min="1" max="14"
                placeholder="Workouts per week (e.g. 5)"
                value={newGoal.target_value}
                onChange={e => setNewGoal({ ...newGoal, target_value: e.target.value })}
                className="input-field"
                style={{ marginBottom: 10, fontSize: 14 }}
              />
            )}
            {newGoal.metric_type === 'streak_days' && (
              <input
                type="number" min="1" max="365"
                placeholder="Streak length in days (e.g. 30)"
                value={newGoal.target_value}
                onChange={e => setNewGoal({ ...newGoal, target_value: e.target.value })}
                className="input-field"
                style={{ marginBottom: 10, fontSize: 14 }}
              />
            )}
            {newGoal.metric_type === 'workouts_total' && (
              <input
                type="number" min="1"
                placeholder="Total workouts target (e.g. 100)"
                value={newGoal.target_value}
                onChange={e => setNewGoal({ ...newGoal, target_value: e.target.value })}
                className="input-field"
                style={{ marginBottom: 10, fontSize: 14 }}
              />
            )}
            {newGoal.metric_type === 'course_completion' && (
              <select
                value={newGoal.target_value}
                onChange={e => setNewGoal({ ...newGoal, target_value: e.target.value })}
                className="input-field"
                style={{ marginBottom: 10, fontSize: 14 }}
              >
                <option value="">Pick a course…</option>
                {courseOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            )}
            <select
              value={newGoal.category}
              onChange={e => setNewGoal({ ...newGoal, category: e.target.value })}
              className="input-field"
              style={{ marginBottom: 16, fontSize: 14 }}
            >
              {['Mobility', 'Flexibility', 'Consistency', 'Body Comp', 'Strength', 'Nutrition', 'General'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-secondary"
                onClick={() => setShowAddGoal(false)}
                style={{ flex: 1, fontSize: 14 }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleAddGoal}
                disabled={!newGoal.title.trim() || (newGoal.metric_type !== 'manual' && !newGoal.target_value)}
                style={{ flex: 2, fontSize: 14 }}
              >
                Add Goal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Side-by-side photo comparison. Older date on the left, newer on the right;
// angle tabs let the user pivot through front/side/back if both check-ins
// captured the same angle.
// Convert a hex color to an rgba string. Handles 3-digit and 6-digit
// hex values; falls back to a transparent value if the input is junk.
function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Collapsible section wrapper. Optional `accent` prop renders the
// header as a coloured gradient block (same visual language as the
// Exercise Library / Challenges tiles on Explore); without it, falls
// back to a plain text section header. State lives in the component.
function CollapsibleSection({ title, subtitle, action, accent, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const headerInner = (
    <>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 18, fontWeight: 800, color: '#fff',
          letterSpacing: -0.3, lineHeight: 1.15,
          textShadow: '0 1px 2px rgba(0,0,0,0.18)',
        }}>{title}</p>
        {subtitle && (
          <p style={{
            fontSize: 12, color: 'rgba(255,255,255,0.85)',
            marginTop: 4, fontWeight: 500,
          }}>{subtitle}</p>
        )}
      </div>
      {action && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginRight: 8 }}>
          {action}
        </div>
      )}
      <svg
        width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="#fff" strokeWidth="2.5"
        style={{
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.18s ease',
          flexShrink: 0,
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
        }}
      >
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </>
  );
  return (
    <div style={{ marginBottom: open ? 16 : 10 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={accent ? {
          cursor: 'pointer', userSelect: 'none',
          background: `linear-gradient(135deg, ${accent}, ${hexToRgba(accent, 0.72)})`,
          borderRadius: 14, padding: '16px 18px',
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: open ? 14 : 0,
          boxShadow: `0 6px 18px ${hexToRgba(accent, 0.20)}`,
        } : {
          cursor: 'pointer', userSelect: 'none',
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: open ? 12 : 0, padding: '4px 0',
        }}
      >
        {accent ? headerInner : (
          <>
            <h2 style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>{title}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.18s ease', opacity: 0.6 }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </h2>
            {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
          </>
        )}
      </div>
      {open && children}
    </div>
  );
}

// Stats row - horizontal scroll of metric cards. Pulls body comp
// from the latest check-in plus 7-day activity averages from the
// stats-summary endpoint. Only renders cards with data so an empty
// account doesn't show a row of dashes.
function StatsRow({ stats }) {
  if (!stats) return (
    <div className="card" style={{ textAlign: 'center', padding: 24 }}>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading your stats...</p>
    </div>
  );
  const c = stats.latest_checkin;
  const w = stats.week || {};
  const t = stats.targets || {};
  const cards = [];
  if (c?.weight != null)         cards.push({ label: 'Weight',     value: `${c.weight}`, suffix: ' kg', sub: 'Latest check-in' });
  if (c?.body_fat != null)       cards.push({ label: 'Body Fat',   value: `${c.body_fat}`, suffix: ' %', sub: 'Latest check-in' });
  if (c?.recovery_score != null) cards.push({ label: 'Recovery',   value: `${c.recovery_score}`, suffix: ' / 10', sub: 'Latest check-in' });
  if (c?.sleep_hours != null)    cards.push({ label: 'Sleep',      value: `${c.sleep_hours}`, suffix: ' h', sub: 'Latest check-in' });
  if (w.water_ml_avg != null)    cards.push({ label: 'Water',      value: `${(w.water_ml_avg / 1000).toFixed(1)}`, suffix: ` / ${(t.water_ml || 0) / 1000}L`, sub: '7-day avg' });
  if (w.steps_avg != null)       cards.push({ label: 'Steps',      value: `${w.steps_avg.toLocaleString()}`, suffix: t.steps ? ` / ${t.steps.toLocaleString()}` : '', sub: '7-day avg' });
  if (w.calories_avg != null)    cards.push({ label: 'Calories',   value: `${w.calories_avg.toLocaleString()}`, suffix: t.calories ? ` / ${t.calories.toLocaleString()}` : '', sub: '7-day avg' });
  cards.push({ label: 'Workouts', value: `${w.workouts_completed || 0}`, suffix: '', sub: 'This week' });

  if (cards.length === 1 && cards[0].label === 'Workouts' && (w.workouts_completed || 0) === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 24 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No data yet</p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
          Log a check-in, water, or a workout to see your stats land here.
        </p>
      </div>
    );
  }

  return (
    <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
      {cards.map(card => (
        <div key={card.label} className="card" style={{ minWidth: 150, flexShrink: 0 }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>{card.label}</p>
          <p style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>
            {card.value}
            {card.suffix && <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{card.suffix}</span>}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>{card.sub}</p>
        </div>
      ))}
    </div>
  );
}

// "Movement Assessments" card on the Progress tab. Renders a compact
// per-region scoreboard of the AMS Getting Started tap-to-pick lessons
// (Spine / Hips / Shoulders) so the client can see their last A/B/C
// without opening the course. Source data comes from
// /api/content/assessment-summary - see content.js for the shape.
function MovementAssessmentsCard({ summary, onOpenCourse }) {
  const { regions, total_logged, total_lessons, latest_overall_at } = summary;
  const pct = total_lessons > 0 ? Math.round((total_logged / total_lessons) * 100) : 0;
  const noneYet = total_logged === 0;
  const allLogged = total_lessons > 0 && total_logged >= total_lessons;
  const ctaLabel = noneYet
    ? 'Start the assessment'
    : allLogged
      ? 'Re-take the assessment'
      : 'Continue the assessment';

  // For each region, render Y total dots so empty slots show too. A
  // dot uses the letter colour if the lesson is logged; otherwise a
  // neutral grey so progress is obvious at a glance.
  const dotsFor = (region) => region.lessons.map(l => ({
    color: l.latest_pick ? ASSESSMENT_COLORS[l.latest_pick] : 'var(--divider)',
    title: l.latest_pick ? `${l.lesson_title}: ${l.latest_pick}` : `${l.lesson_title}: not logged yet`,
  }));

  return (
    <>
      <div className="card" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
            <svg width="48" height="48" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="19" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
              <circle
                cx="24" cy="24" r="19" fill="none"
                stroke="var(--accent-mint)"
                strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 19}`}
                strokeDashoffset={`${2 * Math.PI * 19 * (1 - pct / 100)}`}
                strokeLinecap="round" transform="rotate(-90 24 24)"
              />
            </svg>
            <span style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
            }}>{pct}%</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>
              {total_logged} of {total_lessons} logged
            </h4>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {latest_overall_at
                ? `Last update ${new Date(latest_overall_at + 'Z').toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : 'No attempts yet'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {regions.map(r => (
            <div key={r.module_id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ minWidth: 80 }}>
                <p style={{ fontSize: 13, fontWeight: 700 }}>{r.module_title}</p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.logged}/{r.total} logged</p>
              </div>
              <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                {dotsFor(r).map((d, i) => (
                  <div
                    key={i}
                    title={d.title}
                    style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: d.color,
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onOpenCourse}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 12,
            border: 'none', background: 'var(--accent)', color: '#fff',
            fontSize: 14, fontWeight: 800, cursor: 'pointer',
          }}
        >{ctaLabel}</button>
      </div>
    </>
  );
}

function PhotoCompareView({ view, onBack }) {
  const angles = [
    { key: 'photo_front_url', label: 'Front' },
    { key: 'photo_side_url', label: 'Side' },
    { key: 'photo_back_url', label: 'Back' },
  ].filter(a => view.left[a.key] && view.right[a.key]);
  const [angle, setAngle] = useState(angles[0]?.key || 'photo_front_url');
  const fmt = (d) => new Date(d).toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
        <button onClick={onBack} style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Compare</h2>
      </div>

      {angles.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            These check-ins don't share a common angle. Try two check-ins where the same angle was photographed.
          </p>
        </div>
      ) : (
        <>
          {angles.length > 1 && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--divider)' }}>
              {angles.map(a => (
                <button
                  key={a.key}
                  onClick={() => setAngle(a.key)}
                  style={{
                    padding: '6px 14px', borderRadius: 16, border: 'none',
                    background: angle === a.key ? 'var(--accent-mint)' : 'var(--bg-card)',
                    color: angle === a.key ? '#000' : 'var(--text-primary)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >{a.label}</button>
              ))}
            </div>
          )}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 4, minHeight: 0 }}>
            {[{ side: view.left, label: fmt(view.left.date), weight: view.left.weight },
              { side: view.right, label: fmt(view.right.date), weight: view.right.weight }].map((col, i) => (
              <div key={i} style={{ position: 'relative', background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' }}>
                <img src={col.side[angle]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  padding: '10px 12px',
                  background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                  color: '#fff',
                }}>
                  <p style={{ fontSize: 13, fontWeight: 700 }}>{col.label}</p>
                  {col.weight != null && <p style={{ fontSize: 11, opacity: 0.8 }}>{col.weight} kg</p>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
