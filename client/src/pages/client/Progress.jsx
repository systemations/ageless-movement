import { useState } from 'react';
import CheckinForm from './CheckinForm';
import ROMTracking from './ROMTracking';
import PainLogging from './PainLogging';

const tabs = ['Progress', 'Trends'];

const activeGoals = [
  { id: 1, title: 'Pain-free squat', target: 'Full depth bodyweight squat with no discomfort', progress: 65, category: 'Mobility' },
  { id: 2, title: 'Touch toes', target: 'Standing forward fold, palms flat on floor', progress: 40, category: 'Flexibility' },
  { id: 3, title: 'Train 5x per week', target: 'Consistent 5 sessions per week for 4 weeks', progress: 75, category: 'Consistency' },
  { id: 4, title: 'Reach 90kg', target: 'Body weight goal of 90kg', progress: 50, category: 'Body Comp' },
];

const achievedGoals = [
  { id: 10, title: 'Complete Ground Zero Phase 1', achievedDate: '15 Feb 2026', category: 'Program' },
  { id: 11, title: '7-day training streak', achievedDate: '02 Mar 2026', category: 'Consistency' },
  { id: 12, title: 'First check-in submitted', achievedDate: '20 Jan 2026', category: 'Milestone' },
  { id: 13, title: 'Log meals for 7 days straight', achievedDate: '28 Feb 2026', category: 'Nutrition' },
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
  const [activeTab, setActiveTab] = useState('Progress');
  const [showAchieved, setShowAchieved] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [showROM, setShowROM] = useState(false);
  const [showPain, setShowPain] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: '', target: '', category: 'General' });
  const [goals, setGoals] = useState(activeGoals);

  const handleAddGoal = () => {
    if (!newGoal.title.trim()) return;
    setGoals([...goals, { id: Date.now(), ...newGoal, progress: 0 }]);
    setNewGoal({ title: '', target: '', category: 'General' });
    setShowAddGoal(false);
  };

  if (showCheckin) return <CheckinForm onClose={() => setShowCheckin(false)} onSuccess={() => setShowCheckin(false)} />;
  if (showROM) return <ROMTracking onBack={() => setShowROM(false)} />;
  if (showPain) return <PainLogging onBack={() => setShowPain(false)} />;

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Progress</h1>
      </div>

      {activeTab === 'Progress' && (
        <>
          {/* Goals Section */}
          <div className="section-header" style={{ marginTop: 0 }}>
            <h2>Goals</h2>
            <button onClick={() => setShowAddGoal(!showAddGoal)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>+ Add Goal</button>
          </div>

          {/* Add Goal Form */}
          {showAddGoal && (
            <div className="card" style={{ marginBottom: 12, border: '1px solid var(--accent-mint)' }}>
              <input placeholder="Goal title (e.g. Touch toes)" value={newGoal.title} onChange={e => setNewGoal({...newGoal, title: e.target.value})} className="input-field" style={{ marginBottom: 8, fontSize: 14 }} />
              <input placeholder="Target description" value={newGoal.target} onChange={e => setNewGoal({...newGoal, target: e.target.value})} className="input-field" style={{ marginBottom: 8, fontSize: 14 }} />
              <select value={newGoal.category} onChange={e => setNewGoal({...newGoal, category: e.target.value})} className="input-field" style={{ marginBottom: 12, fontSize: 14 }}>
                {['Mobility', 'Flexibility', 'Consistency', 'Body Comp', 'Strength', 'Nutrition', 'General'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="btn-primary" onClick={handleAddGoal} style={{ fontSize: 14 }}>Add Goal</button>
            </div>
          )}

          {/* Active Goals */}
          {goals.map((goal) => (
            <div key={goal.id} className="card" style={{ marginBottom: 8, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {/* Progress Ring */}
                <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
                  <svg width="48" height="48" viewBox="0 0 48 48">
                    <circle cx="24" cy="24" r="19" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                    <circle
                      cx="24" cy="24" r="19" fill="none"
                      stroke={categoryColors[goal.category] || 'var(--accent-mint)'}
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
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.4 }}>{goal.target}</p>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                    background: `${categoryColors[goal.category] || 'var(--accent-mint)'}20`,
                    color: categoryColors[goal.category] || 'var(--accent-mint)',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    {goal.category}
                  </span>
                </div>
              </div>
            </div>
          ))}

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
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Achieved {goal.achievedDate}</p>
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

          <div className="divider" />

          {/* Check-in Prompt */}
          <div className="section-header">
            <h2>Check-ins &gt;</h2>
          </div>
          <div className="card" onClick={() => setShowCheckin(true)} style={{ textAlign: 'center', cursor: 'pointer' }}>
            <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Check in Now</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Due in 2 days</p>
          </div>

          {/* Progress Photos */}
          <div className="section-header">
            <h2>Photos</h2>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" style={{ margin: '0 auto 12px' }}>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No progress photos yet</p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Complete a check-in to add photos</p>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="card" onClick={() => alert('Compare feature coming soon — complete check-ins with photos to enable side-by-side comparison')} style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2" style={{ margin: '0 auto 8px' }}>
                <rect x="1" y="3" width="9" height="18" rx="1"/><rect x="14" y="3" width="9" height="18" rx="1"/>
              </svg>
              <p style={{ fontSize: 13, fontWeight: 600 }}>Compare</p>
            </div>
            <div className="card" onClick={() => { if (navigator.share) navigator.share({ title: 'My Ageless Movement Progress', text: 'Check out my progress!' }); else alert('Share your progress via screenshot or social media'); }} style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2" style={{ margin: '0 auto 8px' }}>
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              <p style={{ fontSize: 13, fontWeight: 600 }}>Share</p>
            </div>
          </div>

          {/* Measurements */}
          <div className="section-header">
            <h2>Measurements &gt;</h2>
          </div>
          <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
            {['Body Fat', 'Recovery', 'Weight'].map((m) => (
              <div key={m} className="card" style={{ minWidth: 160 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{m}</p>
                <p style={{ fontSize: 24, fontWeight: 700 }}>--</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No data yet</p>
              </div>
            ))}
          </div>

          {/* Set Goals & Add New */}
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button className="btn-secondary" onClick={() => setShowAddGoal(true)} style={{ flex: 1, fontSize: 14, padding: 12 }}>Set Goals</button>
            <button className="btn-secondary" onClick={() => setShowCheckin(true)} style={{ flex: 1, fontSize: 14, padding: 12 }}>+ Add New</button>
          </div>

          {/* Exercises */}
          <div className="section-header">
            <h2>Exercises &gt;</h2>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No exercise data yet</p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Complete workouts to track exercise progress</p>
          </div>

          {/* ROM & Pain Tracking */}
          <div className="divider" />
          <div style={{ display: 'flex', gap: 12 }}>
            <div onClick={() => setShowROM(true)} className="card" style={{ flex: 1, textAlign: 'center', cursor: 'pointer', padding: '20px 12px' }}>
              <span style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>🦴</span>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>ROM Tracking</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Range of Motion</p>
            </div>
            <div onClick={() => setShowPain(true)} className="card" style={{ flex: 1, textAlign: 'center', cursor: 'pointer', padding: '20px 12px' }}>
              <span style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>🩹</span>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Pain Log</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Track Discomfort</p>
            </div>
          </div>
        </>
      )}

      {activeTab === 'Trends' && (
        <>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
            Weekly · {new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })} - {new Date(Date.now() + 6*86400000).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>

          {[
            { title: 'Workout', value: '- / 4', label: 'Completed' },
            { title: 'Nutrition', value: '- / 2,113', label: 'cals Daily Avg' },
            { title: 'Water', value: '- / 2,500', label: 'ml Daily Avg' },
            { title: 'Steps', value: '- / 6,000', label: 'Daily Avg' },
          ].map((trend) => (
            <div key={trend.title} className="card" style={{ marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{trend.title}</h3>
              <p style={{ fontSize: 20, fontWeight: 700 }}>{trend.value} <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 400 }}>{trend.label}</span></p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Success Days: -</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Max. Streak: -</p>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Sub-tabs */}
      <div style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 0, background: 'var(--bg-card)', borderRadius: 50,
        padding: 4, maxWidth: 240, width: 'calc(100% - 32px)',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 50, fontSize: 13, fontWeight: 600,
              background: activeTab === tab ? 'rgba(61,255,210,0.15)' : 'transparent',
              color: activeTab === tab ? 'var(--accent-mint)' : 'var(--text-secondary)',
              border: 'none',
            }}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}
