import { useState } from 'react';

export default function CourseDetail({ course, onBack }) {
  const [expandedModule, setExpandedModule] = useState(0);
  const completedModules = course.moduleList.filter(m => m.completed).length;
  const progressPct = Math.round((completedModules / course.moduleList.length) * 100);

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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>{course.title}</h1>
        <button style={{ background: 'none', border: 'none', color: 'var(--accent)', padding: 4 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
        </button>
      </div>

      {/* Hero Section */}
      <div style={{
        background: 'linear-gradient(135deg, #1E1A2E 0%, #2D2640 100%)',
        borderRadius: 16, padding: '24px 20px', marginBottom: 20, position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative */}
        <div style={{
          position: 'absolute', top: -30, right: -30, width: 140, height: 140,
          borderRadius: '50%', border: '1px solid rgba(61,255,210,0.08)',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            background: course.tier === 'free' ? 'var(--accent-mint)' : 'var(--accent-orange)',
            color: '#000', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          }}>
            {course.tier === 'free' ? 'FREE' : 'PRO'}
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.1)', fontSize: 11, fontWeight: 600,
            padding: '3px 10px', borderRadius: 20, color: 'var(--text-secondary)',
          }}>
            {course.difficulty}
          </div>
        </div>

        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6, lineHeight: 1.2 }}>{course.title}</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
          {course.description}
        </p>

        <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 20, fontWeight: 700 }}>{course.modules}</p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Modules</p>
          </div>
          <div>
            <p style={{ fontSize: 20, fontWeight: 700 }}>{course.lessons}</p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Lessons</p>
          </div>
          <div>
            <p style={{ fontSize: 20, fontWeight: 700 }}>{course.duration.split(' ')[0]}</p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{course.duration.split(' ').slice(1).join(' ')}</p>
          </div>
        </div>

        {/* Progress Ring */}
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
            <p style={{ fontSize: 13, fontWeight: 600 }}>{completedModules} of {course.moduleList.length} modules complete</p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {progressPct === 0 ? 'Start your journey' : progressPct === 100 ? 'Course complete!' : 'Keep going!'}
            </p>
          </div>
        </div>
      </div>

      {/* Module List */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Course Content</h3>

        {course.moduleList.map((mod, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            {/* Module Header */}
            <div
              onClick={() => setExpandedModule(expandedModule === i ? -1 : i)}
              style={{
                background: 'var(--bg-card)', borderRadius: expandedModule === i ? '12px 12px 0 0' : 12,
                padding: '14px 16px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              {/* Module Number */}
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: mod.completed ? 'var(--accent-mint)' : 'rgba(255,255,255,0.08)',
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
                  {mod.lessons} lessons · {mod.duration}
                </p>
              </div>

              {/* Expand chevron */}
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"
                style={{ transform: expandedModule === i ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            {/* Expanded Lessons */}
            {expandedModule === i && (
              <div style={{
                background: 'rgba(28,28,30,0.7)', borderRadius: '0 0 12px 12px',
                padding: '4px 16px 8px', borderTop: '1px solid var(--divider)',
              }}>
                {Array.from({ length: mod.lessons }, (_, j) => (
                  <div key={j} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                    borderBottom: j < mod.lessons - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'rgba(61,255,210,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--accent-mint)">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 500 }}>Lesson {j + 1}</p>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {Math.floor(Math.random() * 8 + 3)} min
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Start Button */}
      <div style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        maxWidth: 480, width: 'calc(100% - 32px)', padding: '12px 0',
        background: 'linear-gradient(to top, var(--bg-primary) 70%, transparent)',
      }}>
        <button className="btn-primary" style={{ fontSize: 17 }}>
          {progressPct === 0 ? 'Start Course' : progressPct === 100 ? 'Review Course' : 'Continue Course'}
        </button>
      </div>
    </div>
  );
}
