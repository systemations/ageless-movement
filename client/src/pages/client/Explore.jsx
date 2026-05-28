import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { BookmarkIcon, SearchIcon } from '../../components/Icons';
import FavButton from '../../components/FavButton';
import { useAuth } from '../../context/AuthContext';
import CourseDetail from './CourseDetail';
import ProgramDetail from './ProgramDetail';
import WorkoutOverview from './WorkoutOverview';
import RecipeBrowser from './RecipeBrowser';
import WorkoutThumb, { MiniThumb } from '../../components/WorkoutThumb';
import ExerciseDetailModal from '../../components/ExerciseDetailModal';
import ExerciseBrowser from './ExerciseBrowser';
import ChallengeDetail from './ChallengeDetail';
import MealPlanView from './MealPlanView';
import PlansModal from '../../components/PlansModal';

// Opaque gradient veil + lock silhouette over a locked thumbnail. The
// gradient darkens toward the bottom so any title baked into the image stays
// faintly visible while reading unambiguously as "locked, tap to unlock".
function LockOverlay({ tierName, compact }) {
  const size = compact ? 30 : 42;
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'linear-gradient(180deg, rgba(8,16,32,0.55) 0%, rgba(6,12,24,0.82) 60%, rgba(4,9,18,0.94) 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 8, color: '#fff',
    }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="rgba(255,255,255,0.92)" aria-hidden="true">
        <path d="M12 1.5a5 5 0 0 0-5 5V10H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V6.5a5 5 0 0 0-5-5zm-3 5a3 3 0 0 1 6 0V10H9V6.5zM12 14a1.6 1.6 0 0 1 .8 3v1.6a.8.8 0 0 1-1.6 0V17A1.6 1.6 0 0 1 12 14z"/>
      </svg>
      {tierName && (
        <div style={{
          fontSize: compact ? 9 : 10.5, fontWeight: 800, letterSpacing: 0.8,
          padding: '3px 9px', borderRadius: 10, background: 'var(--accent)', color: '#fff',
          textTransform: 'uppercase',
        }}>{tierName}</div>
      )}
    </div>
  );
}

// 'Resources' hidden for now - will return as the home for past recordings.
// Its render block + parent_tab='resources' sections are left intact below.
const tabs = ['Workouts', 'Nutrition'];

export default function Explore() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('Workouts');
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [selectedMealPlanId, setSelectedMealPlanId] = useState(null);
  const [apiData, setApiData] = useState(null);
  const [challenges, setChallenges] = useState([]);
  // Locked-tap triggers the tier comparison modal. We pass the item title
  // and required tier level so the modal can frame the upgrade nudge.
  const [tiersModal, setTiersModal] = useState(null);
  const openTiersModal = (item) => {
    setTiersModal({
      itemTitle: item.title || item.name,
      requiredTierLevel: item.tier_level ?? null,
    });
  };
  const [mealSchedules, setMealSchedules] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [exerciseBrowserSection, setExerciseBrowserSection] = useState(null);
  const [showChallengesList, setShowChallengesList] = useState(false);
  const [seeAllSection, setSeeAllSection] = useState(null);
  // Top-of-Explore search across workouts, programs, courses, exercises, recipes.
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [recipeSearchSeed, setRecipeSearchSeed] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Debounced search fetch. Clears results when the box is emptied.
  useEffect(() => {
    const q = searchTerm.trim();
    if (q.length < 2) { setSearchResults(null); return; }
    const t = setTimeout(() => {
      fetch(`/api/explore/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => setSearchResults(d))
        .catch(() => { /* non-blocking */ });
    }, 250);
    return () => clearTimeout(t);
  }, [searchTerm, token]);

  const openSearchResult = (type, item) => {
    setSearchTerm('');
    setSearchResults(null);
    if (type === 'workout') navigate(`/explore?workout=${item.id}`);
    else if (type === 'program') navigate(`/explore?program=${item.id}`);
    else if (type === 'course') navigate(`/explore?course=${item.id}`);
    else if (type === 'exercise') setSelectedExercise(item);
    else if (type === 'recipe') { setActiveTab('Nutrition'); setRecipeSearchSeed(item.title); }
  };

  useEffect(() => {
    if (!token) return;
    // Skip empty/non-2xx bodies so an interrupted fetch (page navigated away
    // mid-flight, auth rehydrating, etc.) doesn't spam the console with
    // "Unexpected end of JSON input" - those errors aren't user-facing but
    // they'll generate noise once Sentry is wired.
    const safeJson = (r) => (r.ok ? r.json().catch(() => null) : null);
    fetch('/api/explore/content', { headers: { Authorization: `Bearer ${token}` } })
      .then(safeJson)
      .then(d => { if (d) setApiData(d); })
      .catch(console.error);

    fetch('/api/challenges', { headers: { Authorization: `Bearer ${token}` } })
      .then(safeJson)
      .then(d => { if (d) setChallenges(d.challenges || []); })
      .catch(console.error);

    fetch('/api/nutrition/meal-schedules', { headers: { Authorization: `Bearer ${token}` } })
      .then(safeJson)
      .then(d => { if (d) setMealSchedules(d.schedules || []); })
      .catch(console.error);
  }, [token]);

  // Open a specific program / workout / course when navigated with
  // ?program=<id>, ?workout=<id> or ?course=<id>. CourseDetail refetches
  // by id so passing a stub object is enough.
  useEffect(() => {
    const programId = searchParams.get('program');
    const workoutId = searchParams.get('workout');
    const courseId = searchParams.get('course');
    if (programId) setSelectedProgram(Number(programId));
    if (workoutId) setSelectedWorkout(Number(workoutId));
    if (courseId) setSelectedCourse({ id: Number(courseId) });
  }, [searchParams]);

  const closeProgram = () => {
    setSelectedProgram(null);
    if (searchParams.get('program')) {
      searchParams.delete('program');
      setSearchParams(searchParams, { replace: true });
    }
  };

  const closeWorkout = () => {
    if (searchParams.get('workout')) {
      // User came via deep link (e.g. from Home page) -- go back to where they were
      navigate(-1);
    } else {
      setSelectedWorkout(null);
    }
  };

  if (selectedWorkout) {
    const from = searchParams.get('from');
    const prefillDate = searchParams.get('date');
    return (
      <WorkoutOverview
        workoutId={selectedWorkout}
        onBack={closeWorkout}
        previewMode={from === 'calendar'}
        prefillScheduleDate={prefillDate}
      />
    );
  }

  if (selectedProgram) {
    // PlansModal must mount in this branch too: tapping a locked session
    // inside ProgramDetail sets the modal state, but the main render below
    // never runs while a program is open.
    return (
      <>
        <ProgramDetail
          programId={selectedProgram}
          onBack={closeProgram}
          onSelectWorkout={setSelectedWorkout}
          onLocked={(w, prog) => openTiersModal({ title: prog?.title || w.title })}
        />
        <PlansModal
          open={!!tiersModal}
          onClose={() => setTiersModal(null)}
          itemTitle={tiersModal?.itemTitle}
        />
      </>
    );
  }

  if (selectedCourse) {
    return <CourseDetail course={selectedCourse} onBack={() => {
      setSelectedCourse(null);
      if (searchParams.get('course')) {
        searchParams.delete('course');
        setSearchParams(searchParams, { replace: true });
      }
    }} />;
  }

  if (selectedChallenge) {
    return <ChallengeDetail challengeId={selectedChallenge} onBack={() => setSelectedChallenge(null)} />;
  }

  if (exerciseBrowserSection) {
    return <ExerciseBrowser initialFilter={exerciseBrowserSection} onBack={() => setExerciseBrowserSection(null)} />;
  }
  if (seeAllSection) {
    return (
      <SeeAllGrid
        section={seeAllSection}
        onBack={() => setSeeAllSection(null)}
        onOpenProgram={(id) => { setSeeAllSection(null); setSelectedProgram(id); }}
        onOpenWorkout={(id) => { setSeeAllSection(null); setSelectedWorkout(id); }}
        onLocked={(item) => openTiersModal(item)}
      />
    );
  }

  if (showChallengesList) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', paddingBottom: 100 }}>
        <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setShowChallengesList(false)} style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>Challenges</h1>
        </div>
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {challenges.map(ch => {
            const progressPct = ch.level_count > 0 && ch.completed_levels
              ? Math.round((JSON.parse(ch.completed_levels || '[]').length / ch.level_count) * 100)
              : 0;
            const isEnrolled = !!ch.enrolled_at;
            return (
              <div
                key={ch.id}
                onClick={() => { setShowChallengesList(false); setSelectedChallenge(ch.id); }}
                style={{
                  cursor: 'pointer', borderRadius: 14, overflow: 'hidden',
                  background: 'var(--bg-card)', position: 'relative',
                }}
              >
                <div style={{
                  height: 160,
                  background: ch.image_url ? `url(${ch.image_url}) center/cover` : 'linear-gradient(135deg, #1a1a2e, #16213e)',
                  position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute', top: 10, left: 10,
                    fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 10,
                    background: 'rgba(0,0,0,0.6)', color: '#fff', letterSpacing: 0.5,
                  }}>CHALLENGE</div>
                  {isEnrolled && progressPct > 0 && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(0,0,0,0.3)' }}>
                      <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--accent-mint)' }} />
                    </div>
                  )}
                </div>
                <div style={{ padding: '12px 14px 14px' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{ch.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {ch.level_count} levels{isEnrolled ? ` - ${progressPct}% done` : ''}
                  </p>
                  {ch.description && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{ch.description}</p>}
                </div>
              </div>
            );
          })}
          {challenges.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>No challenges yet</div>
          )}
        </div>
      </div>
    );
  }

  if (selectedMealPlanId) {
    // MealPlanView is designed as a standalone view; for Explore we just render it
    // (it'll fetch and show the plan + let user enrol). We pass a special prop so
    // it knows to pre-select that plan id. For now it'll find it via the list fetch.
    return (
      <div>
        <div style={{ padding: '16px 16px 0' }}>
          <button
            onClick={() => setSelectedMealPlanId(null)}
            style={{
              width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-card)',
              border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        </div>
        <MealPlanView initialScheduleId={selectedMealPlanId} />
      </div>
    );
  }

  const fitnessSections = apiData?.sections?.filter(s => s.parent_tab === 'fitness') || [];
  const nutritionSections = apiData?.sections?.filter(s => s.parent_tab === 'nutrition') || [];
  const resourcesSections = apiData?.sections?.filter(s => s.parent_tab === 'resources') || [];
  const courses = apiData?.courses || [];

  // Find featured course
  const featuredCourse = courses.find(c => c.featured === 1) || courses[0];

  return (
    <>
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Ageless Movement On-Demand</h1>
        {/* Search toggle - searches all content (workouts + nutrition) */}
        <button
          onClick={() => { const next = !showSearch; setShowSearch(next); if (!next) setSearchTerm(''); }}
          aria-label="Search"
          style={{
            background: 'none', border: 'none', padding: 6, cursor: 'pointer', display: 'flex', flexShrink: 0,
            color: showSearch ? 'var(--accent)' : 'var(--text-primary)',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
      </div>

      {/* Search bar - revealed by the search icon. Searches workouts, programs,
          courses, exercises, recipes. */}
      {showSearch && (
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
            placeholder="Search workouts, programs, recipes..."
            style={{
              width: '100%', padding: '12px 38px 12px 38px', borderRadius: 12,
              background: 'var(--bg-card)', border: '1px solid var(--divider)',
              color: 'var(--text-primary)', fontSize: 14, outline: 'none',
            }}
          />
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}>
            <SearchIcon />
          </span>
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', padding: 6,
            }}>×</button>
          )}
        </div>
      )}

      {searchResults ? (
        <SearchResults results={searchResults} onOpen={openSearchResult} />
      ) : (
      <>
      {/* Sub-tabs - pinned at the top, under the header */}
      <div style={{
        display: 'flex', gap: 0, background: 'var(--bg-card)', borderRadius: 50,
        padding: 4, maxWidth: 360, width: '100%', margin: '0 auto 20px',
      }}>
        {tabs.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            flex: 1, padding: '10px 0', borderRadius: 50, fontSize: 13, fontWeight: 600,
            background: activeTab === tab ? 'rgba(61,255,210,0.15)' : 'transparent',
            color: activeTab === tab ? 'var(--accent-mint-ink)' : 'var(--text-secondary)',
            border: 'none',
          }}>{tab}</button>
        ))}
      </div>

      {activeTab === 'Workouts' && (
        <>
          {/* Build-your-own entry - scoped to the Workouts tab so it reads
              clearly (no "build a workout" CTA over Nutrition). */}
          <button onClick={() => navigate('/build-workout')} className="card" style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            border: '1px solid var(--divider)', background: 'var(--bg-card)', color: 'var(--text-primary)',
            textAlign: 'left', marginBottom: 20,
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 700 }}>Build a workout</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Create your own from the exercise library</p>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>

          {/* ===== DYNAMIC SECTIONS ===== */}
          {fitnessSections.map((section) => {
            // Prefer the explicit content_type set by the coach; fall back to item inspection.
            const sectionType = section.content_type
              || (section.items?.[0]?.item_type ?? null);
            const isCoursesSection = sectionType === 'course';
            const isProgramSection = sectionType === 'program';
            // Both 'workout' and 'follow_along' sections render as horizontal
            // workout carousels. 'follow_along' is a sub-filter of workouts
            // (workouts.workout_type='follow_along'). The section's render
            // code uses section.items which already carries only the workouts
            // the coach explicitly added, so no extra filter is needed here.
            const isWorkoutSection = sectionType === 'workout' || sectionType === 'follow_along';

            // Courses section - show only the courses linked to this section,
            // looked up from the global courses list. Featured first, then sort_order.
            if (isCoursesSection) {
              // Preserve item_locked / tier_name from section.items since the
              // `courses` global array doesn't carry viewer-specific flags.
              const itemsByCourseId = new Map(
                (section.items || [])
                  .filter(i => i.item_type === 'course')
                  .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                  .map(i => [i.item_id, i])
              );
              const sortedCourses = [...itemsByCourseId.keys()]
                .map(id => {
                  const c = courses.find(x => x.id === id);
                  if (!c) return null;
                  const sectionItem = itemsByCourseId.get(id);
                  return { ...c, item_locked: sectionItem.item_locked, tier_name: c.tier_name || sectionItem.tier_name, tier_level: sectionItem.tier_level };
                })
                .filter(Boolean)
                .sort((a, b) => (b.featured || 0) - (a.featured || 0));
              if (sortedCourses.length === 0) return null;
              return (
                <div key={section.id} style={{ marginBottom: 28 }}>
                  <div className="section-header" style={{ marginTop: 0 }}>
                    <h2 style={{ fontSize: 18 }}>{section.title}</h2>
                    {/* Only show See All when there's actually more than one item worth paginating into */}
                    {sortedCourses.length > 1 && (
                      <button style={{ background: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, border: 'none' }}>See All &gt;</button>
                    )}
                  </div>

                  {/* Full-width stacked cards - one course per row.
                      16:9 poster on top, title + meta below. Much more
                      presence than the old 220px cramped carousel. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {sortedCourses.map((course) => {
                      const isFeatured = course.featured === 1;
                      const isFree = course.tier_name === 'Free';
                      return (
                        <div
                          key={course.id}
                          onClick={() => course.item_locked ? openTiersModal(course) : setSelectedCourse(course)}
                          style={{
                            width: '100%', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
                            background: 'var(--bg-card)', display: 'flex', flexDirection: 'column',
                          }}
                        >
                          {/* Poster - full-width 16:9 */}
                          <div style={{
                            width: '100%', aspectRatio: '16/9',
                            background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                            position: 'relative', overflow: 'hidden',
                          }}>
                            {course.image_url ? (
                              <img src={course.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: 40, opacity: 0.4 }}>📚</span>
                              </div>
                            )}
                            {/* Tier badge */}
                            <div style={{
                              position: 'absolute', top: 10, right: 10,
                              background: isFree ? 'var(--accent)' : 'rgba(0,0,0,0.6)',
                              color: '#fff', fontSize: 10, fontWeight: 700,
                              padding: '4px 10px', borderRadius: 12, letterSpacing: 0.5,
                            }}>
                              {isFree ? 'FREE' : course.tier_name?.toUpperCase()}
                            </div>
                            {isFeatured && (
                              <div style={{
                                position: 'absolute', top: 10, left: 10,
                                background: 'var(--accent)', color: '#fff',
                                fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 12,
                              }}>FEATURED</div>
                            )}
                            {course.item_locked && <LockOverlay tierName={course.tier_name} />}
                          </div>

                          {/* Info - comfortable padding, larger type */}
                          <div style={{ padding: '14px 16px 16px' }}>
                            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }}>{course.title}</h4>
                            {course.subtitle && (
                              <p style={{
                                fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4,
                                overflow: 'hidden', textOverflow: 'ellipsis',
                                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                              }}>{course.subtitle}</p>
                            )}
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                              {course.modules} modules · {course.lessons} lessons
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            // Programs section
            if (isProgramSection) {
              const itemCount = section.items?.length || 0;
              return (
                <div key={section.id} style={{ marginBottom: 24 }}>
                  <div className="section-header">
                    <h2
                      style={{ fontSize: 16, cursor: itemCount > 4 ? 'pointer' : 'default' }}
                      onClick={() => { if (itemCount > 4) setSeeAllSection(section); }}
                    >
                      {section.title}
                    </h2>
                    {itemCount > 4 && (
                      <button
                        onClick={() => setSeeAllSection(section)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >
                        See all
                      </button>
                    )}
                  </div>
                  <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
                    {section.items.map((item) => {
                      // Square thumbnails - matches the AMS placeholder images
                      // (1300x1289, ~1:1) so nothing is cropped.
                      const CARD_W = 200;
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedProgram(item.item_id)}
                          style={{
                            width: CARD_W, minWidth: CARD_W, maxWidth: CARD_W, borderRadius: 14, overflow: 'hidden', cursor: 'pointer', background: 'var(--bg-card)',
                            position: 'relative', display: 'flex', flexDirection: 'column', flexShrink: 0,
                          }}
                        >
                          <div style={{
                            width: CARD_W, height: CARD_W,
                            position: 'relative', overflow: 'hidden', flexShrink: 0,
                          }}>
                            <WorkoutThumb
                              title={item.title}
                              thumbnailUrl={item.image_url}
                              aspectRatio="1/1"
                              borderRadius={0}
                              titleFontSize={16}
                            />
                          </div>
                          <div style={{ padding: '12px 14px 14px' }}>
                            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{item.title}</h4>
                            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.duration_weeks} weeks · {item.workouts_per_week} workouts/wk</p>
                            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{item.min_duration} - {item.max_duration}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            // Workout carousel section
            if (isWorkoutSection) {
              const itemCount = section.items?.length || 0;
              return (
                <div key={section.id} style={{ marginBottom: 24 }}>
                  <div className="section-header">
                    <h2
                      style={{ fontSize: 16, cursor: itemCount > 4 ? 'pointer' : 'default' }}
                      onClick={() => { if (itemCount > 4) setSeeAllSection(section); }}
                    >
                      {section.title}
                    </h2>
                    {itemCount > 4 && (
                      <button
                        onClick={() => setSeeAllSection(section)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >
                        See all
                      </button>
                    )}
                  </div>
                  {itemCount === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                      Coming soon
                    </div>
                  ) : (
                  <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, margin: '0 -16px', padding: '0 16px' }}>
                    {section.items.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => item.item_locked ? openTiersModal(item) : setSelectedWorkout(item.item_id)}
                        style={{ width: 150, minWidth: 150, maxWidth: 150, flexShrink: 0, cursor: 'pointer', position: 'relative' }}
                      >
                        <div style={{ width: 150, marginBottom: 8, position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
                          <WorkoutThumb
                            title={item.title}
                            thumbnailUrl={item.image_url}
                            aspectRatio="1/1"
                            borderRadius={12}
                            titleFontSize={13}
                          />
                          {!item.item_locked && (
                            <div style={{ position: 'absolute', top: 4, right: 4 }}>
                              <FavButton itemType="workout" itemId={item.item_id} itemTitle={item.title} itemMeta={`${item.duration || ''} · ${item.body_parts || ''}`} />
                            </div>
                          )}
                          {item.item_locked && <LockOverlay tierName={item.tier_name} compact />}
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, lineHeight: 1.3 }}>{item.title}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.duration ? `${item.duration} mins` : ''} · {item.body_parts || ''}</p>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              );
            }

            // Exercise Library -- single tappable card that opens the full browser
            if (sectionType === 'exercise') {
              return (
                <div key={section.id} style={{ marginBottom: 24 }}>
                  <div
                    onClick={() => setExerciseBrowserSection('All')}
                    style={{
                      background: 'linear-gradient(135deg, #1B6B3A, #0D9488)',
                      borderRadius: 14, padding: '24px 20px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{section.title}</h2>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Browse 447 exercises with video demos</p>
                    </div>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </div>
              );
            }

            return null;
          })}

          {/* Challenges */}
          {challenges.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div
                onClick={() => setShowChallengesList(true)}
                style={{
                  background: 'linear-gradient(135deg, #7C3AED, #4338CA)',
                  borderRadius: 14, padding: '24px 20px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Challenges</h2>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{challenges.length} challenge{challenges.length !== 1 ? 's' : ''} available</p>
                </div>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </div>
          )}

        </>
      )}

      {activeTab === 'Nutrition' && (
        <>
          {/* Meal Schedules carousel */}
          {mealSchedules.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="section-header" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 16 }}>Meal Schedules</h2>
              </div>
              <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
                {mealSchedules.map(sched => (
                  <div
                    key={sched.id}
                    onClick={() => sched.locked ? openTiersModal({ title: 'Meal Schedules' }) : setSelectedMealPlanId(sched.id)}
                    style={{
                      minWidth: 240, maxWidth: 240, cursor: 'pointer',
                      borderRadius: 14, overflow: 'hidden', background: 'var(--bg-card)', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      height: 130, position: 'relative',
                      background: sched.image_url
                        ? `url(${sched.image_url}) center/cover`
                        : 'linear-gradient(135deg, #1A2E1E, #243D26)',
                    }}>
                      {sched.locked && <LockOverlay />}
                    </div>
                    <div style={{ padding: '10px 12px 12px' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{sched.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {sched.duration_weeks ? `${sched.duration_weeks}w` : ''}{sched.duration_days ? ` ${sched.duration_days} days` : ''}
                        {sched.calorie_target_min && sched.calorie_target_max ? ` - ${sched.calorie_target_min}-${sched.calorie_target_max} kcal` : ''}
                      </p>
                      {sched.category && (
                        <span style={{
                          display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 600,
                          padding: '2px 8px', borderRadius: 6,
                          background: 'rgba(255,149,0,0.12)', color: 'var(--accent)',
                        }}>{sched.category}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dynamic nutrition sections (recipes, etc.) */}
          {nutritionSections.map(section => {
            const sectionType = section.content_type || section.items?.[0]?.item_type;
            if (section.items?.length === 0) return null;

            // Skip meal_plan sections -- replaced by Meal Schedules above
            if (sectionType === 'meal_plan') return null;

            // Recipe carousel
            if (sectionType === 'recipe') {
              return (
                <div key={section.id} style={{ marginBottom: 24 }}>
                  <div className="section-header" style={{ marginTop: 0 }}>
                    <h2 style={{ fontSize: 16 }}>{section.title}</h2>
                  </div>
                  <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
                    {section.items.map(item => (
                      <div
                        key={item.id}
                        onClick={() => item.item_locked ? openTiersModal({ title: 'Recipes' }) : null}
                        style={{
                          minWidth: 150, cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        <div style={{
                          width: 150, height: 150, borderRadius: 12, overflow: 'hidden',
                          background: item.image_url
                            ? `url(${item.image_url}) center/cover`
                            : 'var(--bg-card)',
                          marginBottom: 6, position: 'relative',
                        }}>
                          {item.item_locked && <LockOverlay compact />}
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, lineHeight: 1.3 }}>{item.title}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {item.calories ? `${item.calories} cal` : ''}
                          {item.category ? ` - ${item.category}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            return null;
          })}

          {/* Full recipe browser below */}
          <RecipeBrowser onLocked={() => openTiersModal({ title: 'Recipes' })} initialSearch={recipeSearchSeed} />
        </>
      )}

      {activeTab === 'Resources' && (
        <>
          <div style={{ marginBottom: 28 }}>
            <div className="section-header" style={{ marginTop: 0 }}>
              <h2 style={{ fontSize: 18 }}>Resources</h2>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
              <div className="card" style={{ flex: 1, textAlign: 'center', cursor: 'pointer', padding: '24px 16px' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 10px', background: 'linear-gradient(135deg, rgba(61,255,210,0.15), rgba(61,255,210,0.05))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>Vault</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Guides & PDFs</p>
              </div>
              <div className="card" style={{ flex: 1, textAlign: 'center', cursor: 'pointer', padding: '24px 16px' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 10px', background: 'linear-gradient(135deg, rgba(61,255,210,0.15), rgba(61,255,210,0.05))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12h.01"/><path d="M17 12h.01"/><path d="M7 12h.01"/></svg>
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>Collections</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Video playlists</p>
              </div>
            </div>

            <div className="section-header">
              <h2 style={{ fontSize: 16 }}>Collections &gt;</h2>
            </div>
            <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
              {[
                { name: 'Mobility 101', items: 8, icon: '🧘' },
                { name: 'Nutrition Guides', items: 5, icon: '🥗' },
                { name: 'Recovery Protocols', items: 6, icon: '💆' },
                { name: 'Training Science', items: 4, icon: '🧬' },
              ].map((col) => (
                <div key={col.name} style={{ minWidth: 160, borderRadius: 14, overflow: 'hidden', cursor: 'pointer', background: 'var(--bg-card)' }}>
                  <div style={{ padding: '20px 16px' }}>
                    <span style={{ fontSize: 32, display: 'block', marginBottom: 10 }}>{col.icon}</span>
                    <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{col.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{col.items} resources</p>
                  </div>
                </div>
              ))}
            </div>

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
              <div key={item.name} className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  background: item.type === 'PDF' ? 'rgba(255,149,0,0.15)' : 'rgba(61,255,210,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                }}>{item.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.type} · {item.size || item.duration}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            ))}
          </div>
        </>
      )}
      </>
      )}

    </div>

    {/* Exercise detail modal */}
    {selectedExercise && (
      <ExerciseDetailModal exercise={selectedExercise} onClose={() => setSelectedExercise(null)} />
    )}

    {/* Pricing modal - mirrors the first-login plan screen, opens when
        tapping a locked Explore item. */}
    <PlansModal
      open={!!tiersModal}
      onClose={() => setTiersModal(null)}
      itemTitle={tiersModal?.itemTitle}
    />
    </>
  );
}

// Grouped search results. Each group only renders if it has hits.
function SearchResults({ results, onOpen }) {
  const groups = [
    { key: 'workouts', type: 'workout', label: 'Workouts', title: w => w.title, sub: w => w.body_parts || 'Workout', img: w => w.image_url },
    { key: 'programs', type: 'program', label: 'Programs', title: p => p.title, sub: () => 'Program', img: p => p.image_url },
    { key: 'courses', type: 'course', label: 'Courses', title: c => c.title, sub: () => 'Course', img: c => c.image_url },
    { key: 'exercises', type: 'exercise', label: 'Exercises', title: e => e.name, sub: e => e.body_part || 'Exercise', img: e => e.thumbnail_url },
    { key: 'recipes', type: 'recipe', label: 'Recipes', title: r => r.title, sub: r => r.category || 'Recipe', img: r => r.thumbnail_url },
  ];
  const total = groups.reduce((n, g) => n + (results[g.key]?.length || 0), 0);
  if (total === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No matches found</p>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>Try a different word.</p>
      </div>
    );
  }
  return (
    <div>
      {groups.map(g => {
        const items = results[g.key] || [];
        if (items.length === 0) return null;
        return (
          <div key={g.key} style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>{g.label}</p>
            {items.map(item => (
              <div key={`${g.key}-${item.id}`} onClick={() => onOpen(g.type, item)} className="card-sm" style={{
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
              }}>
                <div style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-card-hover)' }}>
                  {g.img(item) && <img src={g.img(item)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title(item)}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.sub(item)}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Full-grid "See all" view for a section, opened from a tappable section
// title / "See all" link. Renders every item in the group as a wrapping
// grid (vs the inline horizontal carousel). Reuses WorkoutThumb + the same
// tap-through targets (program detail / workout overview).
function SeeAllGrid({ section, onBack, onOpenProgram, onOpenWorkout, onLocked }) {
  const isProgram = section.content_type === 'program'
    || (section.items?.[0]?.item_type === 'program');
  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button
          onClick={onBack}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          ← Back
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 800, flex: 1 }}>{section.title}</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {(section.items || []).map((item) => (
          <div
            key={item.id}
            onClick={() => isProgram
              ? onOpenProgram(item.item_id)
              : (item.item_locked ? onLocked(item) : onOpenWorkout(item.item_id))}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ width: '100%', position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
              <WorkoutThumb
                title={item.title}
                thumbnailUrl={item.image_url}
                aspectRatio="1/1"
                borderRadius={12}
                titleFontSize={14}
              />
              {item.item_locked && !isProgram && <LockOverlay tierName={item.tier_name} compact />}
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 2 }}>{item.title}</p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {isProgram
                ? `${item.duration_weeks || ''} weeks · ${item.workouts_per_week || ''} workouts/wk`
                : `${item.duration ? item.duration + ' mins' : ''}${item.body_parts ? ' · ' + item.body_parts : ''}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
