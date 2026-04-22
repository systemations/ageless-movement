import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

// Client-facing course view. Fetches the full course (modules + lessons +
// per-lesson completion state for this user) from /api/content/courses/:id
// and lets the client tick lessons complete.
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
        {full.description && (
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
            {full.description}
          </p>
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
                  <div key={lesson.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                    borderBottom: j < arr.length - 1 ? '1px solid var(--divider)' : 'none',
                  }}>
                    {/* Tap-to-toggle completion checkbox */}
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
                    <div style={{ flex: 1 }}>
                      <p style={{
                        fontSize: 13, fontWeight: 500,
                        textDecoration: lesson.completed ? 'line-through' : 'none',
                        color: lesson.completed ? 'var(--text-secondary)' : 'var(--text-primary)',
                      }}>{lesson.title}</p>
                      {lesson.resources?.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          {lesson.resources.map(r => (
                            <a key={r.id} href={r.url} download={r.original_name} onClick={(e) => e.stopPropagation()} style={{
                              fontSize: 10, color: 'var(--accent)', textDecoration: 'none',
                              padding: '2px 8px', borderRadius: 10, background: 'rgba(61,255,210,0.1)',
                              display: 'flex', alignItems: 'center', gap: 3,
                            }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              {r.original_name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    {lesson.duration && (
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {lesson.duration}
                      </p>
                    )}
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
