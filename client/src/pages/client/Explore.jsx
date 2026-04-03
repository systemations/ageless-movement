import { useState, useEffect } from 'react';
import { BookmarkIcon, SearchIcon } from '../../components/Icons';
import FavButton from '../../components/FavButton';
import { useAuth } from '../../context/AuthContext';
import CourseDetail from './CourseDetail';
import ProgramDetail from './ProgramDetail';
import WorkoutOverview from './WorkoutOverview';

const tabs = ['Workouts', 'Nutrition', 'Resources'];

const courses = [
  {
    id: 1,
    title: 'Mobility Fundamentals',
    subtitle: 'Your starting point for pain-free movement',
    modules: 5,
    lessons: 18,
    duration: '2 hrs 30 mins',
    difficulty: 'Beginner',
    tier: 'free',
    progress: 0,
    image: null,
    description: 'Learn the foundations of mobility training. This course covers joint health basics, daily movement routines, and how to assess your own range of motion. Perfect for beginners or anyone returning to movement after a break.',
    moduleList: [
      { title: 'Welcome & Assessment', lessons: 3, duration: '25 mins', completed: false },
      { title: 'Hip Mobility Basics', lessons: 4, duration: '35 mins', completed: false },
      { title: 'Spine & Thoracic Health', lessons: 4, duration: '30 mins', completed: false },
      { title: 'Shoulder Freedom', lessons: 4, duration: '35 mins', completed: false },
      { title: 'Building Your Daily Routine', lessons: 3, duration: '25 mins', completed: false },
    ],
  },
  {
    id: 2,
    title: 'Ground Zero Program',
    subtitle: 'The complete 8-week mobility overhaul',
    modules: 8,
    lessons: 48,
    duration: '12 hrs',
    difficulty: 'All Levels',
    tier: 'paid',
    progress: 0,
    image: null,
    description: 'Our flagship program. 8 weeks of progressive mobility training that takes you through every plane of motion. Built over two 28-day phases with follow-along workouts you can do at your own pace.',
    moduleList: [
      { title: 'Phase 1: Week 1 - Foundations', lessons: 6, duration: '1 hr 30 mins', completed: false },
      { title: 'Phase 1: Week 2 - Hip Focus', lessons: 6, duration: '1 hr 30 mins', completed: false },
      { title: 'Phase 1: Week 3 - Spine & Shoulders', lessons: 6, duration: '1 hr 30 mins', completed: false },
      { title: 'Phase 1: Week 4 - Integration', lessons: 6, duration: '1 hr 30 mins', completed: false },
      { title: 'Phase 2: Week 5 - Advanced Mobility', lessons: 6, duration: '1 hr 30 mins', completed: false },
      { title: 'Phase 2: Week 6 - Strength + Mobility', lessons: 6, duration: '1 hr 30 mins', completed: false },
      { title: 'Phase 2: Week 7 - Flow States', lessons: 6, duration: '1 hr 30 mins', completed: false },
      { title: 'Phase 2: Week 8 - Mastery', lessons: 6, duration: '1 hr 30 mins', completed: false },
    ],
  },
  {
    id: 3,
    title: '30-Day Movement Reset',
    subtitle: 'Daily 15-min routines to transform how you move',
    modules: 4,
    lessons: 30,
    duration: '7 hrs 30 mins',
    difficulty: 'Beginner',
    tier: 'paid',
    progress: 0,
    image: null,
    description: 'Commit to 15 minutes a day for 30 days and feel the difference. Each day builds on the last with progressive mobility drills, stretches, and movement flows.',
    moduleList: [
      { title: 'Week 1: Wake Up Your Body', lessons: 7, duration: '1 hr 45 mins', completed: false },
      { title: 'Week 2: Build Range', lessons: 7, duration: '1 hr 45 mins', completed: false },
      { title: 'Week 3: Add Strength', lessons: 7, duration: '1 hr 45 mins', completed: false },
      { title: 'Week 4: Flow & Integrate', lessons: 9, duration: '2 hrs 15 mins', completed: false },
    ],
  },
  {
    id: 4,
    title: 'Desk Worker Recovery',
    subtitle: 'Undo the damage of sitting all day',
    modules: 3,
    lessons: 12,
    duration: '1 hr 30 mins',
    difficulty: 'Beginner',
    tier: 'free',
    image: null,
    progress: 0,
    description: 'Designed for anyone who spends hours at a desk. Quick, targeted routines to open your hips, decompress your spine, and restore shoulder mobility.',
    moduleList: [
      { title: 'Understanding Desk Posture', lessons: 4, duration: '30 mins', completed: false },
      { title: 'Mid-Day Movement Breaks', lessons: 4, duration: '30 mins', completed: false },
      { title: 'End-of-Day Recovery', lessons: 4, duration: '30 mins', completed: false },
    ],
  },
];

const workoutCarousels = [
  {
    title: 'Mobility - Follow Alongs',
    items: [
      { name: 'Mobility Routine', duration: '5 mins', tag: 'Full Body' },
      { name: 'Hip Mobility Routine', duration: '7 mins', tag: 'Hips' },
      { name: 'CAR Routine', duration: '8 mins', tag: 'Full Body' },
    ],
  },
  {
    title: 'Sweat Sessions',
    items: [
      { name: 'Sweat Session #01', duration: '1 hr', tag: 'Full Body' },
      { name: 'Sweat Session #02', duration: '1 hr', tag: 'Lower Body' },
      { name: 'Sweat Session #03', duration: '45 mins', tag: 'Upper Body' },
    ],
  },
  {
    title: 'Prehab | Preparation & Rehab',
    items: [
      { name: 'Shoulder Recovery', duration: '15 mins', tag: 'Shoulders' },
      { name: 'Hip Opening', duration: '12 mins', tag: 'Hips' },
      { name: 'Spine Decompression', duration: '10 mins', tag: 'Back' },
    ],
  },
];

const courseColors = [
  'linear-gradient(135deg, #1E1A2E 0%, #2D2640 100%)',
  'linear-gradient(135deg, #1A2E1E 0%, #243D26 100%)',
  'linear-gradient(135deg, #2E1A1A 0%, #3D2424 100%)',
  'linear-gradient(135deg, #1A1E2E 0%, #242D3D 100%)',
];

export default function Explore() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('Workouts');
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [apiData, setApiData] = useState(null);

  useEffect(() => {
    fetch('/api/explore/content', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setApiData)
      .catch(console.error);
  }, []);

  if (selectedWorkout) {
    return <WorkoutOverview workoutId={selectedWorkout} onBack={() => setSelectedWorkout(null)} />;
  }

  if (selectedProgram) {
    return <ProgramDetail programId={selectedProgram} onBack={() => setSelectedProgram(null)} onSelectWorkout={setSelectedWorkout} />;
  }

  if (selectedCourse) {
    return <CourseDetail course={selectedCourse} onBack={() => setSelectedCourse(null)} />;
  }

  const featured = courses[0];

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Ageless Movement On-Demand</h1>
        <div style={{ display: 'flex', gap: 16 }}>
          <button className="header-icon"><BookmarkIcon /></button>
          <button className="header-icon"><SearchIcon /></button>
        </div>
      </div>

      {activeTab === 'Workouts' && (
        <>
          {/* ===== COURSES SECTION ===== */}
          <div style={{ marginBottom: 28 }}>
            <div className="section-header" style={{ marginTop: 0 }}>
              <h2 style={{ fontSize: 18 }}>Courses</h2>
              <button style={{ background: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, border: 'none' }}>See All &gt;</button>
            </div>

            {/* Featured Course Hero */}
            <div
              onClick={() => setSelectedCourse(featured)}
              style={{
                background: courseColors[0], borderRadius: 16, padding: 0, marginBottom: 16,
                overflow: 'hidden', cursor: 'pointer', position: 'relative',
              }}
            >
              <div style={{
                padding: '24px 20px', minHeight: 180, display: 'flex', flexDirection: 'column',
                justifyContent: 'flex-end', position: 'relative',
              }}>
                {/* Decorative circles */}
                <div style={{
                  position: 'absolute', top: -20, right: -20, width: 120, height: 120,
                  borderRadius: '50%', border: '1px solid rgba(61,255,210,0.1)',
                }} />
                <div style={{
                  position: 'absolute', top: 20, right: 20, width: 60, height: 60,
                  borderRadius: '50%', border: '1px solid rgba(61,255,210,0.08)',
                }} />

                {/* Free badge */}
                <div style={{
                  position: 'absolute', top: 16, right: 20,
                  background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700,
                  padding: '4px 12px', borderRadius: 20, letterSpacing: 0.5,
                }}>
                  FREE
                </div>

                <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, lineHeight: 1.2, marginTop: 8 }}>
                  {featured.title}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.4 }}>
                  {featured.subtitle}
                </p>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {featured.modules} modules · {featured.lessons} lessons
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {featured.duration}
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{ marginTop: 12, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${featured.progress}%`, background: 'var(--accent)', borderRadius: 2 }} />
                </div>
              </div>
            </div>

            {/* Course Carousel */}
            <div className="hide-scrollbar" style={{
              display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -16px', padding: '0 16px',
            }}>
              {courses.slice(1).map((course, i) => (
                <div
                  key={course.id}
                  onClick={() => setSelectedCourse(course)}
                  style={{
                    minWidth: 220, borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
                    background: courseColors[i + 1] || courseColors[0],
                  }}
                >
                  <div style={{ padding: '16px 16px 14px', position: 'relative' }}>
                    {/* Tier badge */}
                    <div style={{
                      position: 'absolute', top: 12, right: 12,
                      background: course.tier === 'free' ? 'var(--accent-mint)' : 'rgba(255,255,255,0.15)',
                      color: course.tier === 'free' ? '#000' : 'var(--text-primary)',
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                      letterSpacing: 0.5,
                    }}>
                      {course.tier === 'free' ? 'FREE' : 'PRO'}
                    </div>

                    {/* Difficulty badge */}
                    <div style={{
                      fontSize: 10, color: 'var(--accent)', fontWeight: 600,
                      marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>
                      {course.difficulty}
                    </div>

                    <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, lineHeight: 1.3, paddingRight: 30 }}>
                      {course.title}
                    </h4>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.3 }}>
                      {course.subtitle}
                    </p>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {course.modules} modules · {course.duration}
                    </div>

                    {/* Progress */}
                    <div style={{ marginTop: 10, height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${course.progress}%`, background: 'var(--accent)', borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--accent)', opacity: 0.2, margin: '4px 0 20px' }} />

          {/* ===== PROGRAMS ===== */}
          {apiData?.programs && apiData.programs.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="section-header">
                <h2 style={{ fontSize: 16 }}>Programs &gt;</h2>
              </div>
              <div className="hide-scrollbar" style={{
                display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -16px', padding: '0 16px',
              }}>
                {apiData.programs.map((prog) => (
                  <div
                    key={prog.id}
                    onClick={() => setSelectedProgram(prog.id)}
                    style={{
                      minWidth: 200, borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
                      background: 'linear-gradient(135deg, #1E1A2E, #2D2640)',
                    }}
                  >
                    <div style={{ padding: '16px 16px 14px' }}>
                      <img src="/logo.png" alt="" style={{ width: 28, height: 28, borderRadius: '50%', marginBottom: 8, opacity: 0.7 }} />
                      <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{prog.title}</h4>
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {prog.duration_weeks} weeks · {prog.workouts_per_week} workouts/wk
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        {prog.min_duration} - {prog.max_duration}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== WORKOUT CAROUSELS (from API + static fallback) ===== */}
          {(apiData?.carousels || workoutCarousels).map((carousel) => (
            <div key={carousel.title} style={{ marginBottom: 24 }}>
              <div className="section-header">
                <h2 style={{ fontSize: 16 }}>{carousel.title} &gt;</h2>
              </div>
              <div className="hide-scrollbar" style={{
                display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, margin: '0 -16px', padding: '0 16px',
              }}>
                {(carousel.items || []).map((item, itemIdx) => (
                  <div
                    key={item.id || item.name}
                    onClick={() => item.id && setSelectedWorkout(item.id)}
                    style={{ minWidth: 150, cursor: 'pointer' }}
                  >
                    <div style={{
                      width: 150, height: 150, borderRadius: 12, background: 'var(--bg-card)',
                      marginBottom: 8, position: 'relative', overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {item.image_url ? (
                        <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: 40, opacity: 0.3 }}>
                          {(item.workout_type || item.tag || '').includes('mobility') ? '🧘' : '🏋️'}
                        </span>
                      )}
                      <div style={{ position: 'absolute', top: 4, right: 4 }}>
                        <FavButton
                          itemType="workout"
                          itemId={item.id || itemIdx}
                          itemTitle={item.title || item.name}
                          itemMeta={`${item.duration_mins ? item.duration_mins + ' mins' : item.duration} · ${item.body_parts || item.tag}`}
                        />
                      </div>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, lineHeight: 1.3 }}>
                      {item.title || item.name}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {item.duration_mins ? `${item.duration_mins} mins` : item.duration} · {item.body_parts || item.tag}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Meet the Team */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '24px 0 16px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--accent)' }} />
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Meet the Team</h2>
            <div style={{ flex: 1, height: 1, background: 'var(--accent)' }} />
          </div>
          <div className="hide-scrollbar" style={{ display: 'flex', gap: 16, overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
            <div style={{ textAlign: 'center', minWidth: 100, cursor: 'pointer' }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%', background: 'var(--bg-card)',
                margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 32 }}>👤</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>Coach</p>
              <p style={{ fontSize: 14, fontWeight: 700 }}>Dan</p>
            </div>
          </div>
        </>
      )}

      {activeTab === 'Nutrition' && (
        <div className="placeholder-page">
          <div className="placeholder-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2"><path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/></svg>
          </div>
          <h2>Nutrition Content</h2>
          <p>Meal plans, recipes, and nutrition resources coming in Step 5</p>
        </div>
      )}

      {activeTab === 'Resources' && (
        <>
          {/* Vault & Collections */}
          <div style={{ marginBottom: 28 }}>
            <div className="section-header" style={{ marginTop: 0 }}>
              <h2 style={{ fontSize: 18 }}>Resources</h2>
            </div>

            {/* Vault + Collections cards */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
              <div className="card" style={{
                flex: 1, textAlign: 'center', cursor: 'pointer', padding: '24px 16px',
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, margin: '0 auto 10px',
                  background: 'linear-gradient(135deg, rgba(61,255,210,0.15), rgba(61,255,210,0.05))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>Vault</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Guides & PDFs</p>
              </div>
              <div className="card" style={{
                flex: 1, textAlign: 'center', cursor: 'pointer', padding: '24px 16px',
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, margin: '0 auto 10px',
                  background: 'linear-gradient(135deg, rgba(61,255,210,0.15), rgba(61,255,210,0.05))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12h.01"/><path d="M17 12h.01"/><path d="M7 12h.01"/></svg>
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>Collections</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Video playlists</p>
              </div>
            </div>

            {/* Resource Collections */}
            <div className="section-header">
              <h2 style={{ fontSize: 16 }}>Collections &gt;</h2>
            </div>
            <div className="hide-scrollbar" style={{
              display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -16px', padding: '0 16px',
            }}>
              {[
                { name: 'Mobility 101', items: 8, icon: '🧘', color: 'linear-gradient(135deg, #1E1A2E, #2D2640)' },
                { name: 'Nutrition Guides', items: 5, icon: '🥗', color: 'linear-gradient(135deg, #1A2E1E, #243D26)' },
                { name: 'Recovery Protocols', items: 6, icon: '💆', color: 'linear-gradient(135deg, #2E1A1A, #3D2424)' },
                { name: 'Training Science', items: 4, icon: '🧬', color: 'linear-gradient(135deg, #1A1E2E, #242D3D)' },
              ].map((col) => (
                <div key={col.name} style={{
                  minWidth: 160, borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
                  background: col.color,
                }}>
                  <div style={{ padding: '20px 16px' }}>
                    <span style={{ fontSize: 32, display: 'block', marginBottom: 10 }}>{col.icon}</span>
                    <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{col.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{col.items} resources</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Vault Items */}
            <div className="section-header">
              <h2 style={{ fontSize: 16 }}>Vault &gt;</h2>
            </div>
            {[
              { name: 'Beginner Mobility Guide', type: 'PDF', size: '2.4 MB', icon: '📄' },
              { name: 'Supplement Protocol', type: 'PDF', size: '1.1 MB', icon: '📄' },
              { name: 'Sleep Optimisation Checklist', type: 'PDF', size: '850 KB', icon: '📄' },
              { name: 'Joint Health: What You Need to Know', type: 'Video', duration: '12 mins', icon: '🎥' },
              { name: 'How to Foam Roll Properly', type: 'Video', duration: '8 mins', icon: '🎥' },
            ].map((item) => (
              <div key={item.name} className="card-sm" style={{
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  background: item.type === 'PDF' ? 'rgba(255,149,0,0.15)' : 'rgba(61,255,210,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                }}>
                  {item.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {item.type} · {item.size || item.duration}
                  </p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Sub-tabs */}
      <div style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 0, background: 'var(--bg-card)', borderRadius: 50,
        padding: 4, maxWidth: 360, width: 'calc(100% - 32px)',
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
