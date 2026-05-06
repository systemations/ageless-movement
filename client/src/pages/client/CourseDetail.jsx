import { useEffect, useRef, useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import VimeoEmbed from '../../components/VimeoEmbed';
import '../../components/rich-text.css';

// Client-facing course view. Fetches the full course (modules + lessons +
// per-lesson completion state for this user) from /api/content/courses/:id
// and lets the client tick lessons complete.
//
// Two display modes:
//   1. Course overview (default): hero, progress ring, expandable module
//      list. Tapping a lesson opens the lesson player.
//   2. Lesson player: video + description + attachments + Mark Complete +
//      Next/Prev navigation. Sidebar with the full module/lesson list on
//      desktop, hidden on mobile. Closely mirrors the FitBudd layout
//      that's our content reference.
//
// `course` prop can be either a bare list-row (just id/title/modules count)
// or a full loaded course; either way we (re)fetch by id so we always have
// the completion state. Falls back gracefully if course can't be loaded.
export default function CourseDetail({ course, onBack }) {
  const { token } = useAuth();
  // Set of module ids currently expanded. Modules can nest one level
  // (e.g. STEP 2 → Feet/Spine/Hips/Shoulders), so a single index won't
  // do. The first top-level module starts open; everything else closed.
  const [expandedModules, setExpandedModules] = useState(() => new Set());
  const [full, setFull] = useState(null); // loaded course with moduleList + progress
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(null); // lesson_id being toggled
  const [activeLessonId, setActiveLessonId] = useState(null);

  const toggleModule = (id) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const courseId = course?.id;

  useEffect(() => {
    if (!courseId) return;
    fetch(`/api/content/courses/${courseId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((d) => setFull(d.course))
      .catch(() => setError('Failed to load course.'));
  }, [courseId, token]);

  const toggleLesson = async (lesson) => {
    if (toggling != null) return;
    setToggling(lesson.id);
    const endpoint = lesson.completed ? 'uncomplete' : 'complete';
    try {
      await fetch(`/api/content/lessons/${lesson.id}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      // Refetch for authoritative progress numbers
      const res = await fetch(`/api/content/courses/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setFull(d.course);
    } catch (e) {
      console.error('Toggle lesson error', e);
    }
    setToggling(null);
  };

  if (error) {
    return (
      <div className="page-content" style={{ padding: 24, textAlign: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Course unavailable</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>{error}</p>
        <button onClick={onBack} className="btn-primary">Back</button>
      </div>
    );
  }

  if (!full) {
    return (
      <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  const progressPct = full.progress?.pct ?? 0;
  const completedCount = full.progress?.completed_lessons ?? 0;
  const totalLessons = full.progress?.total_lessons ?? 0;
  const moduleList = full.moduleList || [];
  const isFree = full.tier_name === 'Free';
  const durationParts = (full.duration || '').split(' ');

  // Lesson player mode — overrides the rest of the render.
  if (activeLessonId) {
    return (
      <LessonPlayer
        course={full}
        lessonId={activeLessonId}
        onBack={() => setActiveLessonId(null)}
        onPickLesson={setActiveLessonId}
        onToggleComplete={toggleLesson}
        toggling={toggling}
      />
    );
  }

  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
            flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>{full.title}</h1>
      </div>

      {/* Hero */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 16, padding: '24px 20px', marginBottom: 20, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -30, right: -30, width: 140, height: 140,
          borderRadius: '50%', border: '1px solid rgba(61,255,210,0.08)',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            background: isFree ? 'var(--accent-mint)' : 'var(--accent-orange)',
            color: '#000', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20,
          }}>
            {isFree ? 'FREE' : 'PRO'}
          </div>
          {full.difficulty && (
            <div style={{
              background: 'rgba(255,255,255,0.1)', fontSize: 11, fontWeight: 600,
              padding: '3px 10px', borderRadius: 20, color: 'var(--text-secondary)',
            }}>
              {full.difficulty}
            </div>
          )}
        </div>

        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6, lineHeight: 1.2 }}>{full.title}</h2>
        {full.subtitle && (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.5, fontStyle: 'italic' }}>
            {full.subtitle}
          </p>
        )}
        {full.description && (
          <div
            className="lesson-description"
            style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}
            dangerouslySetInnerHTML={{ __html: full.description }}
          />
        )}

        <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 20, fontWeight: 700 }}>{moduleList.length}</p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Modules</p>
          </div>
          <div>
            <p style={{ fontSize: 20, fontWeight: 700 }}>{totalLessons}</p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Lessons</p>
          </div>
          {full.duration && (
            <div>
              <p style={{ fontSize: 20, fontWeight: 700 }}>{durationParts[0]}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{durationParts.slice(1).join(' ')}</p>
            </div>
          )}
        </div>

        {/* Progress ring */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', width: 44, height: 44 }}>
            <svg width="44" height="44" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
              <circle
                cx="22" cy="22" r="18" fill="none" stroke="var(--accent-mint)" strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 18}`}
                strokeDashoffset={`${2 * Math.PI * 18 * (1 - progressPct / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 22 22)"
              />
            </svg>
            <span style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
            }}>
              {progressPct}%
            </span>
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600 }}>{completedCount} of {totalLessons} lessons complete</p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {progressPct === 0 ? 'Start your journey' : progressPct === 100 ? 'Course complete!' : 'Keep going!'}
            </p>
          </div>
        </div>
      </div>

      {/* Module list */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Course Content</h3>

        {moduleList.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>
            <p style={{ fontSize: 13 }}>No modules yet. Check back soon.</p>
          </div>
        )}

        {moduleList.map((mod, i) => (
          <ModuleRow
            key={mod.id || i}
            mod={mod}
            depth={0}
            number={i + 1}
            expandedModules={expandedModules}
            toggleModule={toggleModule}
            onPickLesson={setActiveLessonId}
            onToggleLesson={toggleLesson}
            toggling={toggling}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Module row — recursive
// ─────────────────────────────────────────────────────────────────────
// Renders a single module's collapsible card. When expanded, renders
// its lessons followed by any nested sub-modules (which recurse using
// the same component). Top-level modules show a numbered circle; sub-
// modules drop the number and indent slightly so the hierarchy reads.
function ModuleRow({ mod, depth, number, expandedModules, toggleModule, onPickLesson, onToggleLesson, toggling }) {
  const isOpen = expandedModules.has(mod.id);
  const lessons = (mod.lessonList || []).filter(l => l.status !== 'draft');
  const subModules = mod.subModuleList || [];
  const hasSubs = subModules.length > 0;
  const hasContent = lessons.length > 0 || hasSubs;
  // Rolled-up totals come from the API; fall back to direct lessons if
  // a stale client somehow gets a flat module shape.
  const total = mod.total_lessons ?? lessons.length;
  const done = mod.completed_count ?? 0;

  return (
    <div style={{ marginBottom: depth === 0 ? 8 : 0 }}>
      <div
        onClick={() => toggleModule(mod.id)}
        style={{
          background: depth === 0 ? 'var(--bg-card)' : 'transparent',
          borderRadius: depth === 0 ? (isOpen ? '12px 12px 0 0' : 12) : 0,
          padding: depth === 0 ? '14px 16px' : '12px 0',
          borderBottom: depth > 0 ? '1px solid var(--divider)' : 'none',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        {depth === 0 ? (
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: mod.completed ? 'var(--accent-mint)' : 'var(--divider)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: mod.completed ? '#000' : 'var(--text-secondary)',
          }}>
            {mod.completed ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            ) : number}
          </div>
        ) : (
          <div style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: mod.completed ? 'var(--accent-mint)' : 'var(--text-tertiary)',
          }} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: depth === 0 ? 14 : 13, fontWeight: depth === 0 ? 600 : 500, marginBottom: 2 }}>
            {mod.title}
          </p>
          {total > 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {total} lesson{total === 1 ? '' : 's'} · {done}/{total} done
            </p>
          )}
        </div>

        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {isOpen && hasContent && (
        <div style={{
          background: depth === 0 ? 'var(--bg-card)' : 'transparent',
          borderRadius: depth === 0 ? '0 0 12px 12px' : 0,
          padding: depth === 0 ? '4px 16px 8px' : '0 0 8px 16px',
          borderTop: depth === 0 ? '1px solid var(--divider)' : 'none',
        }}>
          {lessons.map((lesson, j) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              isLast={j === lessons.length - 1 && !hasSubs}
              onPick={() => onPickLesson(lesson.id)}
              onToggle={() => onToggleLesson(lesson)}
              toggling={toggling}
            />
          ))}
          {subModules.map(sub => (
            <ModuleRow
              key={sub.id}
              mod={sub}
              depth={depth + 1}
              expandedModules={expandedModules}
              toggleModule={toggleModule}
              onPickLesson={onPickLesson}
              onToggleLesson={onToggleLesson}
              toggling={toggling}
            />
          ))}
        </div>
      )}
      {isOpen && !hasContent && (
        <div style={{
          background: depth === 0 ? 'var(--bg-card)' : 'transparent',
          borderRadius: depth === 0 ? '0 0 12px 12px' : 0,
          padding: '10px 16px', borderTop: depth === 0 ? '1px solid var(--divider)' : 'none',
        }}>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>No lessons yet</p>
        </div>
      )}
    </div>
  );
}

function LessonRow({ lesson, isLast, onPick, onToggle, toggling }) {
  const locked = lesson.quiz_locked;
  return (
    <div
      onClick={onPick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
        borderBottom: isLast ? 'none' : '1px solid var(--divider)',
        cursor: 'pointer',
        opacity: locked ? 0.65 : 1,
      }}
    >
      {locked ? (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--divider)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          disabled={toggling === lesson.id}
          title={lesson.completed ? 'Mark incomplete' : 'Mark complete'}
          style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: lesson.completed ? 'var(--accent-mint)' : 'rgba(255,255,255,0.06)',
            border: lesson.completed ? 'none' : '1px solid var(--divider)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', opacity: toggling === lesson.id ? 0.5 : 1, padding: 0,
          }}
        >
          {lesson.completed ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
          ) : lesson.video_url ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--accent-mint)"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          ) : null}
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13, fontWeight: 500,
          textDecoration: lesson.completed ? 'line-through' : 'none',
          color: locked ? 'var(--text-tertiary)' : (lesson.completed ? 'var(--text-secondary)' : 'var(--text-primary)'),
        }}>{lesson.title}</p>
        {locked && lesson.quiz_prerequisite?.title && (
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Pass {lesson.quiz_prerequisite.title} first
          </p>
        )}
        {!locked && lesson.resources?.length > 0 && (
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {lesson.resources.length} attachment{lesson.resources.length === 1 ? '' : 's'}
          </p>
        )}
      </div>
      {lesson.duration && (
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{lesson.duration}</p>
      )}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" style={{ flexShrink: 0 }}>
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  );
}

// Lesson player sidebar — flat list grouped by module/sub-module
// header. Recurses on subModuleList so the hierarchy is preserved.
function SidebarModule({ mod, depth, activeLessonId, onPickLesson }) {
  const lessons = (mod.lessonList || []).filter(l => l.status !== 'draft');
  return (
    <div style={{ marginBottom: 8, marginLeft: depth * 8 }}>
      <p style={{
        fontSize: depth === 0 ? 11 : 10,
        fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6,
        color: 'var(--text-secondary)', padding: '8px 6px 4px',
      }}>{mod.title}</p>
      {lessons.map(l => {
        const active = l.id === activeLessonId;
        // Locked quiz lessons stay clickable so the user can land on
        // the gate (which explains the prereq) instead of silently
        // doing nothing — the body view shows the lock state.
        const locked = l.quiz_locked;
        return (
          <button
            key={l.id}
            onClick={() => onPickLesson(l.id)}
            style={{
              width: '100%', textAlign: 'left',
              padding: '8px 10px', borderRadius: 8, border: 'none',
              background: active ? 'rgba(255,140,0,0.14)' : 'transparent',
              color: active ? 'var(--accent)' : (locked ? 'var(--text-tertiary)' : 'var(--text-primary)'),
              fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              opacity: locked && !active ? 0.65 : 1,
            }}
          >
            {locked ? (
              <span style={{ width: 16, height: 16, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
            ) : l.completed ? (
              <span style={{
                width: 16, height: 16, borderRadius: '50%', background: 'var(--accent-mint)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
            ) : (
              <span style={{ width: 16, height: 16, flexShrink: 0 }} />
            )}
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {l.title}
            </span>
          </button>
        );
      })}
      {(mod.subModuleList || []).map(sub => (
        <SidebarModule
          key={sub.id}
          mod={sub}
          depth={depth + 1}
          activeLessonId={activeLessonId}
          onPickLesson={onPickLesson}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Lesson player
// ─────────────────────────────────────────────────────────────────────
// Per-lesson view: video on top, description + attachments below, sticky
// footer with Mark Complete + Next. Sidebar with the full module/lesson
// list shows on screens wider than 768px (matching the Memberstack-style
// reference screenshots Dan shared).
//
// Description is stored as HTML (rich-text editor in admin) so we render
// via dangerouslySetInnerHTML. Trust comes from the fact that only
// authenticated coaches can write it via the /api/content/lessons PUT
// route — same trust model as workout descriptions and exercise notes.
function LessonPlayer({ course, lessonId, onBack, onPickLesson, onToggleComplete, toggling }) {
  // Flatten the moduleList (recursing into sub-modules) into an ordered
  // lesson array so Next/Prev can walk across module + sub-module
  // boundaries without the player needing to know hierarchy.
  const flatLessons = useMemo(() => {
    const out = [];
    const walk = (mod) => {
      (mod.lessonList || [])
        .filter(l => l.status !== 'draft')
        .forEach(l => out.push({ ...l, _moduleTitle: mod.title, _moduleId: mod.id }));
      (mod.subModuleList || []).forEach(walk);
    };
    (course.moduleList || []).forEach(walk);
    return out;
  }, [course.moduleList]);

  const idx = flatLessons.findIndex(l => l.id === lessonId);
  const lesson = idx >= 0 ? flatLessons[idx] : null;
  const next = idx >= 0 && idx < flatLessons.length - 1 ? flatLessons[idx + 1] : null;
  const prev = idx > 0 ? flatLessons[idx - 1] : null;
  const navProps = { prev, next, onPickLesson };

  if (!lesson) {
    return (
      <div className="page-content" style={{ padding: 24, textAlign: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Lesson not found</h2>
        <button onClick={onBack} className="btn-primary">Back to course</button>
      </div>
    );
  }

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      <style>{`
        .lesson-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
        .lesson-sidebar { display: none; }
        @media (min-width: 900px) {
          .lesson-grid { grid-template-columns: 280px 1fr; }
          .lesson-sidebar { display: block; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button
          onClick={onBack}
          aria-label="Back to course"
          style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
            flexShrink: 0, cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {lesson._moduleTitle}
          </p>
          <h1 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{lesson.title}</h1>
        </div>
      </div>

      <div className="lesson-grid">
        {/* Sidebar — only visible at >= 900px wide. On mobile the user
            scrolls back via the header button. */}
        <aside className="lesson-sidebar" style={{
          background: 'var(--bg-card)', borderRadius: 12, padding: '8px 10px',
          alignSelf: 'flex-start', maxHeight: 'calc(100vh - 140px)', overflow: 'auto',
        }}>
          {/* Sidebar walks the module tree recursively so nested
              sub-modules (e.g. Feet/Spine/Hips/Shoulders) all show. */}
          {(course.moduleList || []).map(mod => (
            <SidebarModule key={mod.id} mod={mod} depth={0} activeLessonId={lesson.id} onPickLesson={onPickLesson} />
          ))}
        </aside>

        {/* Main lesson body */}
        <div>
          {/* Quiz lesson: replaces the standard video + description
              layout entirely. The renderer handles its own state,
              scoring, and pass/fail routing. */}
          {lesson.quiz && lesson.quiz_locked ? (
            <QuizLockGate
              prerequisite={lesson.quiz_prerequisite}
              onPickLesson={onPickLesson}
              onBack={onBack}
              nav={navProps}
            />
          ) : lesson.quiz ? (
            <QuizPlayer
              quiz={lesson.quiz}
              description={lesson.description}
              flatLessons={flatLessons}
              onPickLesson={onPickLesson}
              onBack={onBack}
              lessonId={lesson.id}
              nav={navProps}
            />
          ) : !lesson.quiz ? (
            // Coach-profile-style layout for every non-quiz lesson:
            // movement assessments (interactive tap-to-pick), video
            // lessons, and reading lessons. Quiz lessons keep the
            // dedicated QuizPlayer / QuizLockGate above.
            <StyledLessonBody
              lesson={lesson}
              prev={prev}
              next={next}
              onPickLesson={onPickLesson}
              onToggleComplete={onToggleComplete}
              toggling={toggling}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// MOCK: coach-profile-style lesson body. Currently wired for one lesson
// only (Standing Pike, id 16) so Dan can react before we apply it to
// all 26. Mirrors CoachProfileView in Events.jsx — tinted hero band
// with UPPERCASE title + accent tagline + pills, then the description
// body, then a fat gradient Mark As Complete CTA above prev/next nav.
function StyledLessonBody({ lesson, prev, next, onPickLesson, onToggleComplete, toggling }) {
  const accent = '#FF8C00';
  const accentRgba = (a) => `rgba(255, 140, 0, ${a})`;
  const mintRgba = (a) => `rgba(133, 255, 186, ${a})`;
  const moduleTagline = `${lesson._moduleTitle?.toUpperCase()}${lesson.is_movement_assessment ? ' · MOVEMENT ASSESSMENT' : ''}`;
  const pills = [];
  if (lesson.is_movement_assessment) pills.push('Tap-to-pick assessment');
  if (lesson.video_url) pills.push('Video');
  if (lesson.duration) pills.push(lesson.duration);
  if (!lesson.video_url && !lesson.is_movement_assessment) pills.push('Reading');

  const completed = lesson.completed;

  // Lock forward nav on assessment lessons until the client has both
  // logged a pick AND marked the lesson complete. `loggedNow` covers
  // the in-session confirm (server flag is stale until the parent
  // refetches the course); `lesson.completed` flips after Mark Complete.
  const [loggedNow, setLoggedNow] = useState(false);
  const requiresLog = !!lesson.is_movement_assessment;
  const hasLogged = !!lesson.has_assessment_response || loggedNow;
  const nextDisabled = requiresLog && (!hasLogged || !completed);
  const nextDisabledReason = !nextDisabled
    ? null
    : !hasLogged && !completed ? 'Log your answer + mark complete to continue'
      : !hasLogged ? 'Log your answer to continue'
      : 'Mark as complete to continue';

  return (
    <>
      <div style={{
        background: `linear-gradient(180deg, ${accentRgba(0.16)} 0%, transparent 100%)`,
        borderRadius: 16, padding: '26px 22px 22px', marginBottom: 22,
        border: `1px solid ${accentRgba(0.20)}`,
      }}>
        <p style={{
          fontSize: 11, fontWeight: 800, color: accent,
          letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8,
        }}>{moduleTagline}</p>
        <h1 style={{
          fontSize: 34, fontWeight: 900, lineHeight: 1.05, margin: '0 0 14px',
          textTransform: 'uppercase', letterSpacing: -0.6,
        }}>{lesson.title}</h1>
        {pills.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pills.map(p => (
              <span key={p} style={{
                padding: '5px 12px', borderRadius: 14,
                background: accentRgba(0.15), color: accent,
                fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
              }}>{p}</span>
            ))}
          </div>
        )}
      </div>

      {lesson.video_url && (
        <div style={{
          position: 'relative', aspectRatio: '16 / 9',
          borderRadius: 14, overflow: 'hidden', marginBottom: 18, background: '#000',
          boxShadow: `0 12px 32px ${accentRgba(0.18)}`,
        }}>
          <VimeoEmbed
            url={lesson.video_url}
            width="100%" height="100%"
            style={{ position: 'absolute', inset: 0, borderRadius: 0 }}
          />
        </div>
      )}

      {lesson.description && (
        <LessonDescription
          html={lesson.description}
          lessonId={lesson.id}
          interactive={!!lesson.is_movement_assessment}
          onLogged={() => setLoggedNow(true)}
        />
      )}

      {lesson.resources?.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <p style={{
            fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
            color: 'var(--text-secondary)', marginBottom: 8,
          }}>Attached files</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lesson.resources.map(r => (
              <a
                key={r.id}
                href={r.url}
                download={r.original_name}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--divider)',
                  color: 'var(--text-primary)', textDecoration: 'none',
                  fontSize: 13,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.original_name || 'Download'}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </a>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => onToggleComplete(lesson)}
        disabled={toggling === lesson.id}
        style={{
          width: '100%', cursor: 'pointer', border: 'none', borderRadius: 14,
          padding: '18px 20px', marginTop: 8, marginBottom: 6,
          background: completed
            ? `linear-gradient(135deg, var(--accent-mint), ${mintRgba(0.6)})`
            : `linear-gradient(135deg, ${accent}, ${accentRgba(0.7)})`,
          color: '#000', fontSize: 18, fontWeight: 900, letterSpacing: 0.4,
          textTransform: 'uppercase',
          boxShadow: completed
            ? `0 6px 20px ${mintRgba(0.28)}`
            : `0 6px 20px ${accentRgba(0.28)}`,
          opacity: toggling === lesson.id ? 0.6 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {completed ? (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Completed
          </>
        ) : 'Mark as Complete'}
      </button>

      <LessonNavFooter
        prev={prev}
        next={next}
        onPickLesson={onPickLesson}
        nextDisabled={nextDisabled}
        nextDisabledReason={nextDisabledReason}
      />
    </>
  );
}

// Shared Prev/Next footer for lesson views (regular, quiz, locked).
// Without this, quiz/locked lessons trapped users with no walk-through
// nav — they could only use the back-arrow to return to the overview.
// `nextDisabled` blocks forward nav (e.g. on assessment lessons until
// the client has logged a pick); the disabled reason renders inline.
function LessonNavFooter({ prev, next, onPickLesson, nextDisabled, nextDisabledReason }) {
  if (!prev && !next) return null;
  return (
    <div style={{ marginTop: 16 }}>
      {nextDisabled && nextDisabledReason && (
        <p style={{
          fontSize: 12, color: 'var(--text-tertiary)',
          padding: '0 4px 10px', textAlign: 'right',
        }}>{nextDisabledReason}</p>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, padding: '14px 0',
        borderTop: '1px solid var(--divider)',
      }}>
        <div>
          {prev && (
            <button
              onClick={() => onPickLesson(prev.id)}
              style={{
                padding: '10px 16px', borderRadius: 10, border: '1px solid var(--divider)',
                background: 'transparent', color: 'var(--text-primary)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >← Prev</button>
          )}
        </div>
        <div>
          {next && (
            <button
              onClick={() => !nextDisabled && onPickLesson(next.id)}
              disabled={nextDisabled}
              title={nextDisabled ? nextDisabledReason : undefined}
              style={{
                padding: '10px 16px', borderRadius: 10, border: '1px solid var(--divider)',
                background: 'transparent', color: 'var(--text-primary)',
                fontSize: 13, fontWeight: 600,
                cursor: nextDisabled ? 'not-allowed' : 'pointer',
                opacity: nextDisabled ? 0.4 : 1,
              }}
            >Next Lesson →</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Quiz lock gate — replaces the QuizPlayer when a prerequisite quiz
// has not been passed yet. Stops users from starting (or even seeing)
// the next quiz in the chain, e.g. ReBuild before Ground Zero.
// ─────────────────────────────────────────────────────────────────────
function QuizLockGate({ prerequisite, onPickLesson, onBack, nav }) {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 4px' }}>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', color: 'var(--text-tertiary)',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0,
          marginBottom: 18, display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back
      </button>

      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: '32px 24px',
        textAlign: 'center', border: '1px solid var(--divider)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(255,140,0,0.12)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Quiz Locked</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 22 }}>
          {prerequisite?.title
            ? <>Pass <strong style={{ color: 'var(--text-primary)' }}>{prerequisite.title}</strong> first to unlock this assessment.</>
            : <>Complete the previous quiz first to unlock this assessment.</>}
        </p>
        {prerequisite?.id && (
          <button
            onClick={() => onPickLesson(prerequisite.id)}
            style={{
              background: 'var(--accent)', color: '#000', border: 'none',
              borderRadius: 12, padding: '12px 22px', fontSize: 15, fontWeight: 800,
              cursor: 'pointer',
            }}
          >Take {prerequisite.title} →</button>
        )}
      </div>

      {nav && <LessonNavFooter {...nav} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Quiz player — assessment with A/B/C answers + scoring + routing
// ─────────────────────────────────────────────────────────────────────
// Lesson.quiz schema (defined in server/src/db/pool.js comment, seeded
// directly via SQL for now). Renders the question list with optional
// per-question Vimeo videos, collects A/B/C selections, computes score
// (sum of option.score / question count), and shows a pass or fail
// result screen with routing CTAs (next quiz / program enrolment).
function QuizPlayer({ quiz, description, flatLessons, onPickLesson, onBack, lessonId, nav }) {
  const { token } = useAuth();
  const [selections, setSelections] = useState({});
  const [submitted, setSubmitted] = useState(false);

  // Persist the attempt server-side on submit so the coach + client
  // both have a history record. Fire-and-forget — UX moves on
  // immediately; the server recomputes the score from canonical
  // quiz_data so a network hiccup doesn't block the result screen.
  const persistAttempt = (sel) => {
    if (!lessonId) return;
    fetch(`/api/content/lessons/${lessonId}/quiz-attempt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ selections: sel }),
    }).catch(() => { /* non-blocking */ });
  };

  const allAnswered = quiz.questions.every(q => selections[q.id]);
  const score = quiz.questions.reduce((sum, q) => {
    const sel = selections[q.id];
    const opt = q.options.find(o => o.label === sel);
    return sum + (opt?.score || 0);
  }, 0);
  const pct = quiz.questions.length > 0
    ? Math.round((score / quiz.questions.length) * 100)
    : 0;
  // Any single C answer is an automatic fail regardless of total score.
  // The threshold check is a belt-and-braces backstop on top of that.
  const hasCAnswer = quiz.questions.some(q => selections[q.id] === 'C');
  const passed = !hasCAnswer && pct >= (quiz.pass_pct || 66);

  if (submitted) {
    return (
      <QuizResult
        quiz={quiz}
        passed={passed}
        pct={pct}
        flatLessons={flatLessons}
        onPickLesson={onPickLesson}
        onRetry={() => { setSelections({}); setSubmitted(false); }}
        onBack={onBack}
      />
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--accent)', marginBottom: 4 }}>
          Assessment Quiz
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{quiz.level_label}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {quiz.questions.length} questions
        </p>
      </div>

      {description && (
        <div
          className="lesson-description"
          style={{ marginBottom: 18 }}
          dangerouslySetInnerHTML={{ __html: description }}
        />
      )}

      {quiz.questions.map((q, i) => (
        <div
          key={q.id}
          style={{
            background: 'var(--bg-card)', borderRadius: 14, padding: 16, marginBottom: 16,
          }}
        >
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Question {i + 1} of {quiz.questions.length}
          </p>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{q.title}</h3>
          {q.video_url && (
            <div style={{
              position: 'relative', aspectRatio: '16 / 9',
              borderRadius: 10, overflow: 'hidden', marginBottom: 12, background: '#000',
            }}>
              <VimeoEmbed
                url={q.video_url}
                width="100%" height="100%"
                style={{ position: 'absolute', inset: 0, borderRadius: 0 }}
              />
            </div>
          )}
          {q.instructions && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.55 }}>
              {q.instructions}
            </p>
          )}
          {q.prompt && (
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{q.prompt}</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {q.options.map(opt => {
              const selected = selections[q.id] === opt.label;
              return (
                <button
                  key={opt.label}
                  onClick={() => setSelections(s => ({ ...s, [q.id]: opt.label }))}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 14px', borderRadius: 10,
                    border: selected ? '2px solid var(--accent)' : '1px solid var(--divider)',
                    background: selected ? 'rgba(255,140,0,0.08)' : 'transparent',
                    color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.5,
                    textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <span style={{
                    flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                    background: selected ? 'var(--accent)' : 'var(--divider)',
                    color: selected ? '#fff' : 'var(--text-secondary)',
                    fontWeight: 700, fontSize: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{opt.label}</span>
                  <span style={{ flex: 1 }}>{opt.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 24px' }}>
        <button
          onClick={() => { persistAttempt(selections); setSubmitted(true); }}
          disabled={!allAnswered}
          style={{
            padding: '14px 32px', borderRadius: 12, border: 'none',
            background: allAnswered ? 'var(--accent)' : 'var(--divider)',
            color: allAnswered ? '#000' : 'var(--text-secondary)', fontSize: 15, fontWeight: 800,
            cursor: allAnswered ? 'pointer' : 'not-allowed',
            opacity: allAnswered ? 1 : 0.6,
          }}
        >
          {allAnswered ? 'Submit Quiz' : `Answer all ${quiz.questions.length} questions to submit`}
        </button>
      </div>

      {nav && <LessonNavFooter {...nav} />}
    </div>
  );
}

function QuizResult({ quiz, passed, pct, flatLessons, onPickLesson, onRetry, onBack }) {
  const { token } = useAuth();
  const result = passed ? quiz.pass : quiz.fail;
  const nextQuiz = passed && quiz.pass_next_quiz_lesson_id
    ? flatLessons.find(l => l.id === quiz.pass_next_quiz_lesson_id)
    : null;
  const programId = !passed ? quiz.fail_program_id : null;
  // Enrolment state: idle / enrolling / replace_prompt / done / error.
  // Replace prompt covers the 409 case where the user is already on a
  // different program — they confirm to overwrite.
  const [enrol, setEnrol] = useState({ status: 'idle' });

  const doEnrol = async (force = false) => {
    setEnrol({ status: 'enrolling' });
    try {
      const res = await fetch(`/api/explore/programs/${programId}/enroll`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      if (res.status === 409) {
        const data = await res.json();
        setEnrol({ status: 'replace_prompt', current: data.current_program });
        return;
      }
      if (!res.ok) throw new Error('Enrol failed');
      setEnrol({ status: 'done' });
    } catch (err) {
      setEnrol({ status: 'error', message: 'Could not add to schedule. Try again from the Explore tab.' });
    }
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: '28px 22px',
        marginBottom: 18, border: passed ? '1.5px solid var(--accent-mint)' : '1.5px solid var(--accent-orange)',
      }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
          Score: {pct}%
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.25, marginBottom: 12 }}>
          {result.title}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {result.body}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Pass: drive forward to the next quiz */}
        {nextQuiz && (
          <button
            onClick={() => onPickLesson(nextQuiz.id)}
            style={{
              padding: '14px 18px', borderRadius: 12, border: 'none',
              background: 'var(--accent)', color: '#000', fontSize: 15, fontWeight: 800, cursor: 'pointer',
            }}
          >
            Try the {nextQuiz.title} quiz next →
          </button>
        )}

        {/* Fail: one-tap enrolment in the recommended program. The
            5-step "find this program in Explore" explainer is gone —
            this button does it for them so they don't get lost. */}
        {!passed && programId && enrol.status === 'idle' && (
          <button
            onClick={() => doEnrol(false)}
            style={{
              padding: '14px 18px', borderRadius: 12, border: 'none',
              background: 'var(--accent)', color: '#000', fontSize: 15, fontWeight: 800, cursor: 'pointer',
            }}
          >
            Add {quiz.level_label} to my schedule
          </button>
        )}

        {enrol.status === 'enrolling' && (
          <button disabled style={{
            padding: '14px 18px', borderRadius: 12, border: 'none',
            background: 'var(--divider)', color: 'var(--text-secondary)',
            fontSize: 15, fontWeight: 700, cursor: 'wait',
          }}>Adding to schedule…</button>
        )}

        {enrol.status === 'replace_prompt' && (
          <div style={{
            background: 'var(--bg-card)', borderRadius: 14, padding: 16,
            border: '1px solid var(--accent-orange)',
          }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              You're currently on <strong>{enrol.current?.title || 'another program'}</strong>.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Switching to {quiz.level_label} will replace it. Your history stays saved.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => doEnrol(true)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                  background: 'var(--accent)', color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                }}
              >Replace</button>
              <button
                onClick={() => setEnrol({ status: 'idle' })}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  border: '1px solid var(--divider)', background: 'transparent',
                  color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >Keep current</button>
            </div>
          </div>
        )}

        {enrol.status === 'done' && (
          <div style={{
            background: 'rgba(133, 255, 186, 0.08)', borderRadius: 14, padding: 16,
            border: '1px solid var(--accent-mint)',
          }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-mint)', marginBottom: 4 }}>
              ✓ Added to your schedule
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Find {quiz.level_label} on the calendar in your <strong>Home</strong> tab.
            </p>
          </div>
        )}

        {enrol.status === 'error' && (
          <p style={{ fontSize: 13, color: 'var(--accent-orange)', textAlign: 'center', padding: '8px 0' }}>
            {enrol.message}
          </p>
        )}

        <button
          onClick={onRetry}
          style={{
            padding: '12px 18px', borderRadius: 12,
            border: '1px solid var(--divider)', background: 'transparent',
            color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Retake quiz
        </button>
        <button
          onClick={onBack}
          style={{
            padding: '12px 18px', borderRadius: 12,
            border: 'none', background: 'transparent',
            color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Back to course
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Lesson description — HTML with optional {{coaches}} token expansion
// ─────────────────────────────────────────────────────────────────────
// Most lessons are pure HTML from the TipTap editor. The "meet the
// support coaches" lesson uses a {{coaches}} token that's replaced
// inline by the public coach roster. That keeps coach bios + photos
// editable in one place (Team admin) instead of duplicated into the
// lesson HTML.
function LessonDescription({ html, lessonId, interactive, onLogged }) {
  const TOKEN = '{{coaches}}';
  if (interactive) {
    return <InteractiveAssessmentDescription html={html} lessonId={lessonId} onLogged={onLogged} />;
  }
  if (!html.includes(TOKEN)) {
    return (
      <div
        className="lesson-description"
        style={{ marginBottom: 18 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  const [before, after] = html.split(TOKEN);
  return (
    <div className="lesson-description" style={{ marginBottom: 18 }}>
      {before && <div dangerouslySetInnerHTML={{ __html: before }} />}
      <CoachesRoster />
      {after && <div dangerouslySetInnerHTML={{ __html: after }} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Interactive assessment description
// ─────────────────────────────────────────────────────────────────────
// For the 13 movement-based assessment lessons. The reference photos
// embedded in the description become tappable inputs — the client
// picks the photo that best matches their body in the position. The
// selection POSTs to /api/content/lessons/:id/assessment-response and
// is visible to the coach on ClientProfile (and to the client across
// re-tests).
//
// We render the description HTML as-is, then walk the DOM after mount
// to upgrade each <img> into a tap-to-select button. State stays in
// React; clicks trigger an effect-driven re-render to update visuals.
function InteractiveAssessmentDescription({ html, lessonId, onLogged }) {
  const { token } = useAuth();
  const containerRef = useRef(null);
  // Two slots: the last *saved* pick (from history) and the current
  // *pending* tap. Saving is now opt-in via Confirm so a casual tap
  // doesn't pollute the history. Pending overrides saved visually.
  const [savedIndex, setSavedIndex] = useState(null);
  const [pendingIndex, setPendingIndex] = useState(null);
  const [previousAttempts, setPreviousAttempts] = useState([]);
  const [saving, setSaving] = useState(false);
  const effectiveIndex = pendingIndex ?? savedIndex;
  const letter = (n) => String.fromCharCode(64 + n);

  // Load any previous selection so the client sees their last answer
  // when they revisit the lesson. Most-recent first.
  useEffect(() => {
    if (!lessonId || !token) return;
    fetch(`/api/content/lessons/${lessonId}/assessment-responses`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { responses: [] })
      .then(d => {
        const responses = d.responses || [];
        setPreviousAttempts(responses);
        if (responses[0]) setSavedIndex(responses[0].selected_photo_index);
      })
      .catch(() => { /* non-blocking */ });
  }, [lessonId, token]);

  // Walk the rendered DOM and turn each <img> into a tap target.
  // Re-runs whenever the effective selection changes so the visual
  // state (ring + dim) reflects the live pick. Also upgrades the
  // "Capture a side or front photo..." paragraph into an illuminated
  // callout so the photo reminder reads as a prompt, not body text.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const imgs = container.querySelectorAll('img');
    imgs.forEach((img, i) => {
      const idx = i + 1; // 1-based
      img.style.cursor = 'pointer';
      img.style.transition = 'all 0.15s ease';
      const isSelected = effectiveIndex === idx;
      img.style.boxShadow = isSelected ? '0 0 0 4px var(--accent-mint), 0 8px 24px rgba(0,0,0,0.4)' : 'none';
      img.style.opacity = (effectiveIndex && !isSelected) ? '0.55' : '1';
      // Top-left A/B/C badge on each photo so the client knows which
      // option they're picking. Mirrors the quiz answer pills.
      const parent = img.parentElement;
      if (parent && !parent.dataset.tapWrapped) {
        parent.dataset.tapWrapped = 'true';
        parent.style.position = 'relative';
        parent.style.display = 'inline-block';
        const badge = document.createElement('div');
        badge.textContent = letter(idx);
        badge.style.cssText = 'position:absolute;top:18px;left:18px;width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,0.78);color:#fff;font-size:16px;font-weight:800;display:flex;align-items:center;justify-content:center;letter-spacing:0;pointer-events:none;border:2px solid rgba(255,255,255,0.92);box-shadow:0 2px 8px rgba(0,0,0,0.35)';
        badge.dataset.photoBadge = String(idx);
        parent.appendChild(badge);
      }
      img.onclick = () => setPendingIndex(idx);
    });
    // Photo-reminder callout. The seed always ends each assessment
    // lesson with the same "Capture a side or front photo…" line; we
    // detect it by prefix and replace the <p> with a styled card so
    // the prompt isn't mistaken for body copy.
    const paragraphs = container.querySelectorAll('p');
    paragraphs.forEach(p => {
      const text = p.textContent.trim();
      if (!text.startsWith('Capture a side or front photo')) return;
      const card = document.createElement('div');
      card.dataset.captureCard = 'true';
      card.style.cssText = 'background:linear-gradient(135deg,rgba(255,156,51,0.18),rgba(255,156,51,0.06));border:1.5px solid rgba(255,156,51,0.55);border-radius:14px;padding:14px 16px;margin:22px 0;box-shadow:0 4px 18px rgba(255,156,51,0.20);display:flex;gap:12px;align-items:flex-start';
      card.innerHTML = `
        <div style="flex-shrink:0;width:38px;height:38px;border-radius:10px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:20px">📸</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px">Photo reminder</div>
          <div style="font-size:14px;line-height:1.55;color:var(--text-primary)">${p.innerHTML}</div>
        </div>
      `;
      p.replaceWith(card);
    });
  }, [effectiveIndex, html]);

  const confirmPick = async () => {
    if (saving || pendingIndex == null) return;
    const imgs = containerRef.current?.querySelectorAll('img') || [];
    const url = imgs[pendingIndex - 1]?.getAttribute('src') || '';
    const idx = pendingIndex;
    setSaving(true);
    try {
      await fetch(`/api/content/lessons/${lessonId}/assessment-response`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_photo_index: idx, selected_photo_url: url }),
      });
      const r = await fetch(`/api/content/lessons/${lessonId}/assessment-responses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const d = await r.json();
        setPreviousAttempts(d.responses || []);
      }
      setSavedIndex(idx);
      setPendingIndex(null);
      onLogged?.();
    } catch (e) { /* swallow — user can retry */ }
    setSaving(false);
  };

  const clearPending = () => setPendingIndex(null);
  const isPending = pendingIndex != null;
  const dirtyVsSaved = isPending && pendingIndex !== savedIndex;

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Status hint at the top — display only. The actual Confirm /
          Clear buttons live next to the History block below so the
          client commits to a pick after they've scrolled through all
          the photos. */}
      <div style={{
        background: 'rgba(133,255,186,0.10)',
        border: '1px solid rgba(133,255,186,0.35)',
        borderRadius: 12, padding: '12px 14px', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: effectiveIndex ? 'var(--accent-mint)' : 'rgba(133,255,186,0.25)',
          color: effectiveIndex ? '#000' : 'var(--accent-mint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 14,
        }}>{effectiveIndex ? letter(effectiveIndex) : '?'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {isPending
              ? (dirtyVsSaved ? `Selected: ${letter(pendingIndex)} — confirm below` : `Same as your last answer: ${letter(pendingIndex)}`)
              : savedIndex
                ? `Your last answer: ${letter(savedIndex)}`
                : 'Tap the photo that best matches your position'}
          </p>
          {previousAttempts.length > 1 && !isPending && (
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              {previousAttempts.length} attempts on file
            </p>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="lesson-description"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Confirm + history block. Confirm/Clear buttons sit on top of
          the history list because the user lands here after scrolling
          past the photos — close to the Mark As Complete CTA. */}
      {(isPending || previousAttempts.length > 0) && (
        <div style={{
          marginTop: 14, padding: '14px 16px',
          background: 'var(--bg-card)', borderRadius: 12,
          border: '1px solid var(--divider)',
        }}>
          {isPending && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              paddingBottom: 12, marginBottom: 12,
              borderBottom: previousAttempts.length > 0 ? '1px solid var(--divider)' : 'none',
            }}>
              <p style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {dirtyVsSaved
                  ? <>Confirm <strong>{letter(pendingIndex)}</strong> as your answer?</>
                  : <>This matches your last answer.</>}
              </p>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button
                  type="button"
                  onClick={clearPending}
                  disabled={saving}
                  style={{
                    padding: '10px 16px', borderRadius: 10,
                    border: '1px solid var(--divider)', background: 'transparent',
                    color: 'var(--text-primary)', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >Clear</button>
                <button
                  type="button"
                  onClick={confirmPick}
                  disabled={saving || !dirtyVsSaved}
                  style={{
                    padding: '10px 18px', borderRadius: 10, border: 'none',
                    background: dirtyVsSaved ? 'var(--accent-mint)' : 'var(--divider)',
                    color: '#000', fontSize: 13, fontWeight: 800,
                    cursor: dirtyVsSaved ? 'pointer' : 'not-allowed',
                    opacity: saving ? 0.6 : 1,
                  }}
                >{saving ? 'Saving…' : 'Confirm'}</button>
              </div>
            </div>
          )}
          {previousAttempts.length > 0 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Your history
              </p>
              {previousAttempts.slice(0, 5).map(a => (
                <p key={a.id} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{letter(a.selected_photo_index)}</strong>
                  {' · '}
                  {new Date(a.created_at + 'Z').toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CoachesRoster() {
  const { token } = useAuth();
  const [coaches, setCoaches] = useState(null);

  useEffect(() => {
    fetch('/api/coaches/', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => setCoaches(d.coaches || []))
      .catch(() => setCoaches([]));
  }, [token]);

  if (coaches === null) return null;
  // Only render coaches who have both a bio and a photo — anyone half-
  // configured in the admin shouldn't show up on a public roster.
  const visible = coaches.filter(c => c.bio && (c.photo_url || c.avatar_url));
  if (visible.length === 0) return null;

  return (
    <div>
      {visible.map((c, i) => (
        <div key={c.id}>
          {i > 0 && <hr />}
          <h3 style={{ textAlign: 'center', marginBottom: 0 }}>{c.name}</h3>
          {(c.tagline || c.headline) && (
            <p style={{
              textAlign: 'center', color: 'var(--text-secondary)',
              fontSize: 13, marginTop: 2, marginBottom: 8,
            }}>
              {c.tagline || c.headline}
            </p>
          )}
          <p style={{ textAlign: 'center', margin: 0 }}>
            <img
              src={c.photo_url || c.avatar_url}
              alt={c.name}
              style={{ width: 240, height: 'auto', margin: '0 auto', display: 'block' }}
            />
          </p>
          <p style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>{c.bio}</p>
        </div>
      ))}
    </div>
  );
}
