import { useEffect, useState, useMemo } from 'react';
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
  const [expandedModule, setExpandedModule] = useState(0);
  const [full, setFull] = useState(null); // loaded course with moduleList + progress
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(null); // lesson_id being toggled
  const [activeLessonId, setActiveLessonId] = useState(null);

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
            color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
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
          <div key={mod.id || i} style={{ marginBottom: 8 }}>
            <div
              onClick={() => setExpandedModule(expandedModule === i ? -1 : i)}
              style={{
                background: 'var(--bg-card)', borderRadius: expandedModule === i ? '12px 12px 0 0' : 12,
                padding: '14px 16px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: mod.completed ? 'var(--accent-mint)' : 'var(--divider)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, color: mod.completed ? '#000' : 'var(--text-secondary)',
              }}>
                {mod.completed ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  i + 1
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{mod.title}</p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {(mod.lessonList || []).length} lessons{mod.duration ? ` · ${mod.duration}` : ''}
                  {mod.lessonList?.length > 0 && ` · ${mod.completed_count}/${mod.lessonList.length} done`}
                </p>
              </div>

              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"
                style={{ transform: expandedModule === i ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            {expandedModule === i && (
              <div style={{
                background: 'var(--bg-card)', borderRadius: '0 0 12px 12px',
                padding: '4px 16px 8px', borderTop: '1px solid var(--divider)',
              }}>
                {(mod.lessonList || []).filter(l => l.status !== 'draft').map((lesson, j, arr) => (
                  <div
                    key={lesson.id}
                    onClick={() => setActiveLessonId(lesson.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                      borderBottom: j < arr.length - 1 ? '1px solid var(--divider)' : 'none',
                      cursor: 'pointer',
                    }}>
                    {/* Tap-to-toggle completion checkbox (clicks here don't open the lesson) */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleLesson(lesson); }}
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
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 13, fontWeight: 500,
                        textDecoration: lesson.completed ? 'line-through' : 'none',
                        color: lesson.completed ? 'var(--text-secondary)' : 'var(--text-primary)',
                      }}>{lesson.title}</p>
                      {lesson.resources?.length > 0 && (
                        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {lesson.resources.length} attachment{lesson.resources.length === 1 ? '' : 's'}
                        </p>
                      )}
                    </div>
                    {lesson.duration && (
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {lesson.duration}
                      </p>
                    )}
                    {/* Chevron — signals tap to open */}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                ))}
                {(mod.lessonList || []).filter(l => l.status !== 'draft').length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '10px 0', textAlign: 'center' }}>No lessons yet</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
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
  // Flatten the moduleList into an ordered lesson array so Next/Prev
  // can walk across module boundaries without the player needing to
  // know which module a lesson is in.
  const flatLessons = useMemo(() => {
    const out = [];
    (course.moduleList || []).forEach(mod => {
      (mod.lessonList || [])
        .filter(l => l.status !== 'draft')
        .forEach(l => out.push({ ...l, _moduleTitle: mod.title, _moduleId: mod.id }));
    });
    return out;
  }, [course.moduleList]);

  const idx = flatLessons.findIndex(l => l.id === lessonId);
  const lesson = idx >= 0 ? flatLessons[idx] : null;
  const next = idx >= 0 && idx < flatLessons.length - 1 ? flatLessons[idx + 1] : null;
  const prev = idx > 0 ? flatLessons[idx - 1] : null;

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
          {(course.moduleList || []).map((mod, mi) => (
            <div key={mod.id} style={{ marginBottom: 8 }}>
              <p style={{
                fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6,
                color: 'var(--text-secondary)', padding: '8px 6px 4px',
              }}>{mod.title}</p>
              {(mod.lessonList || []).filter(l => l.status !== 'draft').map(l => {
                const active = l.id === lesson.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => onPickLesson(l.id)}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '8px 10px', borderRadius: 8, border: 'none',
                      background: active ? 'rgba(255,140,0,0.14)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-primary)',
                      fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    {l.completed ? (
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
            </div>
          ))}
        </aside>

        {/* Main lesson body */}
        <div>
          {/* Video — Vimeo embed if a URL is set, otherwise placeholder.
              Mint glow matches the AM logo treatment in global.css.
              16:9 aspect-ratio container so the iframe matches the actual
              video shape — fixed-height was leaving black bars top/bottom
              when the player letterboxed a 16:9 source into a taller box. */}
          {lesson.video_url ? (
            <div style={{
              position: 'relative', aspectRatio: '16 / 9',
              borderRadius: 12, overflow: 'hidden', marginBottom: 14, background: '#000',
              border: '1.5px solid rgba(255, 255, 255, 0.18)',
              boxShadow: '0 10px 32px rgba(133, 255, 186, 0.22)',
            }}>
              <VimeoEmbed
                url={lesson.video_url}
                width="100%"
                height="100%"
                style={{ position: 'absolute', inset: 0, borderRadius: 0 }}
              />
            </div>
          ) : (
            <div style={{
              borderRadius: 12, marginBottom: 14, padding: '40px 20px', textAlign: 'center',
              background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--divider)',
              color: 'var(--text-tertiary)', fontSize: 13,
            }}>
              No video for this lesson yet.
            </div>
          )}

          {/* Description — rich HTML from the admin TipTap editor.
              Typography rules live in components/rich-text.css so the
              authoring view and the rendered view stay identical. */}
          {lesson.description && (
            <div
              className="lesson-description"
              style={{ marginBottom: 18 }}
              dangerouslySetInnerHTML={{ __html: lesson.description }}
            />
          )}

          {/* Attachments */}
          {lesson.resources?.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Attached files
              </p>
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
                      background: 'rgba(255,255,255,0.04)',
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

          {/* Sticky footer — Next / Mark Complete */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '14px 0', borderTop: '1px solid var(--divider)', marginTop: 8,
          }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {prev && (
                <button
                  onClick={() => onPickLesson(prev.id)}
                  style={{
                    padding: '10px 16px', borderRadius: 10, border: '1px solid var(--divider)',
                    background: 'transparent', color: 'var(--text-primary)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  ← Prev
                </button>
              )}
              {next && (
                <button
                  onClick={() => onPickLesson(next.id)}
                  style={{
                    padding: '10px 16px', borderRadius: 10, border: '1px solid var(--divider)',
                    background: 'transparent', color: 'var(--text-primary)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Next Lesson →
                </button>
              )}
            </div>

            <button
              onClick={() => onToggleComplete(lesson)}
              disabled={toggling === lesson.id}
              style={{
                padding: '10px 18px', borderRadius: 10, border: 'none',
                background: lesson.completed ? 'rgba(133,255,186,0.18)' : 'var(--accent)',
                color: lesson.completed ? 'var(--accent-mint)' : '#fff',
                fontSize: 13, fontWeight: 800, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: toggling === lesson.id ? 0.6 : 1,
              }}
            >
              {lesson.completed ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  Completed
                </>
              ) : 'Mark As Complete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
