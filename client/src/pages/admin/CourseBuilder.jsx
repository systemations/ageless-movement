import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../components/ImageUpload';

export default function CourseBuilder({ courseId, onBack }) {
  const { token } = useAuth();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedModules, setExpandedModules] = useState({});
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tiers, setTiers] = useState([]);
  const [search, setSearch] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchCourse = useCallback(async () => {
    const [courseRes, tierRes] = await Promise.all([
      fetch(`/api/content/courses/${courseId}`, { headers }).then(r => r.json()),
      fetch('/api/content/tiers', { headers }).then(r => r.json()),
    ]);
    setCourse(courseRes.course);
    setTiers(tierRes.tiers || []);
    setLoading(false);
    // Auto-expand all modules on first load
    if (courseRes.course?.moduleList) {
      setExpandedModules(prev => {
        if (Object.keys(prev).length > 0) return prev;
        const exp = {};
        courseRes.course.moduleList.forEach(m => { exp[m.id] = true; });
        return exp;
      });
    }
  }, [courseId]);

  useEffect(() => { fetchCourse(); }, [fetchCourse]);

  // Module operations
  const addModule = async () => {
    const res = await fetch(`/api/content/courses/${courseId}/modules`, {
      method: 'POST', headers, body: JSON.stringify({ title: 'New Module' }),
    });
    const data = await res.json();
    setExpandedModules(prev => ({ ...prev, [data.module.id]: true }));
    fetchCourse();
  };

  const updateModule = async (moduleId, updates) => {
    await fetch(`/api/content/course-modules/${moduleId}`, { method: 'PUT', headers, body: JSON.stringify(updates) });
    fetchCourse();
  };

  const deleteModule = async (moduleId) => {
    if (!confirm('Delete this module and all its lessons?')) return;
    await fetch(`/api/content/course-modules/${moduleId}`, { method: 'DELETE', headers });
    if (selectedLesson?.module_id === moduleId) setSelectedLesson(null);
    fetchCourse();
  };

  const moveModule = async (moduleId, direction) => {
    if (!course?.moduleList) return;
    const order = course.moduleList.map(m => m.id);
    const idx = order.indexOf(moduleId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= order.length) return;
    [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
    await fetch(`/api/content/courses/${courseId}/modules/reorder`, { method: 'PUT', headers, body: JSON.stringify({ order }) });
    fetchCourse();
  };

  // Lesson operations
  const addLesson = async (moduleId) => {
    const res = await fetch(`/api/content/course-modules/${moduleId}/lessons`, {
      method: 'POST', headers, body: JSON.stringify({ title: 'New Lesson' }),
    });
    const data = await res.json();
    setExpandedModules(prev => ({ ...prev, [moduleId]: true }));
    setSelectedLesson(data.lesson);
    fetchCourse();
  };

  const deleteLesson = async (lessonId) => {
    if (!confirm('Delete this lesson?')) return;
    await fetch(`/api/content/course-lessons/${lessonId}`, { method: 'DELETE', headers });
    if (selectedLesson?.id === lessonId) setSelectedLesson(null);
    fetchCourse();
  };

  const moveLesson = async (moduleId, lessonId, direction) => {
    const mod = course.moduleList.find(m => m.id === moduleId);
    if (!mod) return;
    const order = mod.lessonList.map(l => l.id);
    const idx = order.indexOf(lessonId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= order.length) return;
    [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
    await fetch(`/api/content/course-modules/${moduleId}/lessons/reorder`, { method: 'PUT', headers, body: JSON.stringify({ order }) });
    fetchCourse();
  };

  const saveLesson = async (lessonId, updates) => {
    await fetch(`/api/content/course-lessons/${lessonId}`, { method: 'PUT', headers, body: JSON.stringify(updates) });
    fetchCourse();
  };

  const saveCourseSettings = async (updates) => {
    await fetch(`/api/content/courses/${courseId}`, { method: 'PUT', headers, body: JSON.stringify(updates) });
    setShowSettings(false);
    fetchCourse();
  };

  // Find parent module for breadcrumb
  const getParentModule = (lessonId) => {
    if (!course?.moduleList) return null;
    for (const mod of course.moduleList) {
      if (mod.lessonList?.some(l => l.id === lessonId)) return mod;
    }
    return null;
  };

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  );

  if (!course) return null;

  // Filter modules/lessons by search
  const filteredModules = course.moduleList?.map(mod => {
    if (!search) return mod;
    const q = search.toLowerCase();
    const matchingLessons = mod.lessonList?.filter(l => l.title.toLowerCase().includes(q)) || [];
    const moduleMatches = mod.title.toLowerCase().includes(q);
    if (moduleMatches || matchingLessons.length > 0) {
      return { ...mod, lessonList: moduleMatches ? mod.lessonList : matchingLessons };
    }
    return null;
  }).filter(Boolean) || [];

  const parentMod = selectedLesson ? getParentModule(selectedLesson.id) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* ══════ TOP BAR ══════ */}
      <div style={{
        height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16,
        padding: '0 20px', borderBottom: '1px solid var(--divider)', background: 'var(--bg-card)',
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Courses
        </button>
        <div style={{ width: 1, height: 24, background: 'var(--divider)' }} />
        <h1 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{course.title}</h1>
        <button onClick={() => setShowSettings(true)} style={{
          padding: '7px 14px', borderRadius: 8, border: '1px solid var(--divider)',
          background: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 600,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4, verticalAlign: -2 }}>
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          Course Settings
        </button>
      </div>

      {/* ══════ MAIN CONTENT ══════ */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* ──── LEFT SIDEBAR ──── */}
        <div style={{
          width: 340, flexShrink: 0, borderRight: '1px solid var(--divider)',
          display: 'flex', flexDirection: 'column', background: 'var(--bg-card)',
        }}>
          {/* Search + Add Module */}
          <div style={{ padding: 12, borderBottom: '1px solid var(--divider)' }}>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" style={{ position: 'absolute', left: 10, top: 9 }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                placeholder="Search Module or Lesson"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: '1px solid var(--divider)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{course.moduleList?.length || 0} Modules</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => {
                  const allExpanded = filteredModules.every(m => expandedModules[m.id]);
                  const next = {};
                  filteredModules.forEach(m => { next[m.id] = !allExpanded; });
                  setExpandedModules(next);
                }} style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                  {filteredModules.every(m => expandedModules[m.id]) ? 'Collapse All' : 'Expand All'}
                </button>
              </div>
            </div>
          </div>

          {/* Module Tree */}
          <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
            {filteredModules.map((mod, modIdx) => (
              <div key={mod.id} style={{ marginBottom: 2 }}>
                {/* Module Header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
                  cursor: 'pointer', fontSize: 13,
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <button onClick={() => setExpandedModules(prev => ({ ...prev, [mod.id]: !prev[mod.id] }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-tertiary)', display: 'flex' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: expandedModules[mod.id] ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                  <ModuleTitle module={mod} onUpdate={updateModule} />
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <StatusBadge status={mod.status} onChange={(s) => updateModule(mod.id, { title: mod.title, status: s })} />
                    <IconBtn onClick={() => moveModule(mod.id, 'up')} disabled={modIdx === 0} title="Move up">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                    </IconBtn>
                    <IconBtn onClick={() => moveModule(mod.id, 'down')} disabled={modIdx === filteredModules.length - 1} title="Move down">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                    </IconBtn>
                    <IconBtn onClick={() => deleteModule(mod.id)} className="danger" title="Delete module">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </IconBtn>
                  </div>
                </div>

                {/* Lessons */}
                {expandedModules[mod.id] && (
                  <div style={{ paddingLeft: 20 }}>
                    {mod.lessonList?.map((lesson, lesIdx) => (
                      <div
                        key={lesson.id}
                        onClick={() => setSelectedLesson(lesson)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 6px 16px',
                          cursor: 'pointer', borderRadius: 6, fontSize: 12,
                          background: selectedLesson?.id === lesson.id ? 'rgba(61,255,210,0.08)' : 'transparent',
                          borderLeft: selectedLesson?.id === lesson.id ? '3px solid var(--accent)' : '3px solid transparent',
                          color: selectedLesson?.id === lesson.id ? 'var(--accent)' : 'var(--text-primary)',
                          fontWeight: selectedLesson?.id === lesson.id ? 600 : 400,
                        }}
                        onMouseEnter={e => { if (selectedLesson?.id !== lesson.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                        onMouseLeave={e => { if (selectedLesson?.id !== lesson.id) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={lesson.video_url ? 'var(--accent)' : 'var(--text-tertiary)'} strokeWidth="1.5" style={{ flexShrink: 0 }}>
                          {lesson.video_url
                            ? <><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill={lesson.video_url ? 'var(--accent)' : 'var(--text-tertiary)'}/></>
                            : <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>
                          }
                        </svg>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lesson.title}</span>
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <StatusBadge status={lesson.status} onChange={(s) => saveLesson(lesson.id, { status: s })} small />
                          <IconBtn onClick={() => moveLesson(mod.id, lesson.id, 'up')} disabled={lesIdx === 0} small>
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="18 15 12 9 6 15"/></svg>
                          </IconBtn>
                          <IconBtn onClick={() => moveLesson(mod.id, lesson.id, 'down')} disabled={lesIdx === mod.lessonList.length - 1} small>
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
                          </IconBtn>
                          <IconBtn onClick={() => deleteLesson(lesson.id)} className="danger" small>
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </IconBtn>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => addLesson(mod.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px 6px 16px',
                      fontSize: 11, color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                    }}>+ Add Lesson</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bottom: Add Module */}
          <div style={{ padding: 12, borderTop: '1px solid var(--divider)' }}>
            <button onClick={addModule} style={{
              width: '100%', padding: '10px', borderRadius: 8, border: '2px dashed var(--divider)',
              background: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>+ Add Module</button>
          </div>
        </div>

        {/* ──── RIGHT PANEL ──── */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)' }}>
          {selectedLesson ? (
            <LessonEditor
              key={selectedLesson.id}
              lesson={selectedLesson}
              parentModule={parentMod}
              onSave={saveLesson}
              onDelete={() => deleteLesson(selectedLesson.id)}
              headers={headers}
              token={token}
            />
          ) : (
            <CourseParticipantsPanel courseId={courseId} token={token} />
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && <CourseSettingsModal course={course} tiers={tiers} onSave={saveCourseSettings} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// LESSON EDITOR
// ═══════════════════════════════════════════════════
function LessonEditor({ lesson, parentModule, onSave, onDelete, headers, token }) {
  const [form, setForm] = useState({
    title: lesson.title || '',
    description: lesson.description || '',
    video_url: lesson.video_url || '',
    thumbnail_url: lesson.thumbnail_url || '',
    duration: lesson.duration || '',
    status: lesson.status || 'published',
  });
  const [resources, setResources] = useState(lesson.resources || []);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editorElRef = useRef(null);

  const update = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  const handleSave = async (publish) => {
    setSaving(true);
    const desc = editorElRef.current ? editorElRef.current.innerHTML : form.description;
    const status = publish ? 'published' : (form.status || 'draft');
    await onSave(lesson.id, { ...form, description: desc, status });
    setDirty(false);
    setSaving(false);
  };

  const getVimeoEmbed = (url) => {
    if (!url) return null;
    const match = url.match(/vimeo\.com\/(\d+)/);
    if (match) return `https://player.vimeo.com/video/${match[1]}`;
    if (url.includes('player.vimeo.com')) return url;
    return null;
  };

  // Resource management
  const uploadResource = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const uploadData = await uploadRes.json();
    if (uploadData.url) {
      const res = await fetch(`/api/content/course-lessons/${lesson.id}/resources`, {
        method: 'POST', headers,
        body: JSON.stringify({
          filename: uploadData.filename,
          original_name: uploadData.originalName || file.name,
          url: uploadData.url,
          file_type: file.type,
          file_size: file.size,
        }),
      });
      const data = await res.json();
      if (data.resource) setResources(prev => [...prev, data.resource]);
    }
  };

  const removeResource = async (resourceId) => {
    await fetch(`/api/content/lesson-resources/${resourceId}`, { method: 'DELETE', headers });
    setResources(prev => prev.filter(r => r.id !== resourceId));
  };

  const vimeoEmbed = getVimeoEmbed(form.video_url);
  const modIdx = parentModule ? (parentModule.sort_order || 1) : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Breadcrumb */}
      <div style={{
        padding: '12px 24px', borderBottom: '1px solid var(--divider)', fontSize: 12,
        color: 'var(--text-tertiary)', background: 'var(--bg-card)',
      }}>
        {parentModule && (
          <span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ verticalAlign: -1, marginRight: 4 }}>
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            <span style={{ color: 'var(--text-secondary)' }}>{parentModule.title}</span>
            <span style={{ margin: '0 8px' }}>&rsaquo;</span>
          </span>
        )}
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{form.title || 'Untitled Lesson'}</span>
      </div>

      {/* Editor Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {/* Video Preview */}
          {vimeoEmbed && (
            <div style={{ marginBottom: 24, borderRadius: 12, overflow: 'hidden', background: '#000', aspectRatio: '16/9', maxHeight: 400 }}>
              <iframe
                src={`${vimeoEmbed}?badge=0&autopause=0`}
                width="100%" height="100%" frameBorder="0"
                allow="autoplay; fullscreen; picture-in-picture" allowFullScreen
                style={{ display: 'block' }}
              />
            </div>
          )}

          {/* Lesson Name */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Lesson Name</label>
            <input
              style={{ ...inputStyle, fontSize: 18, fontWeight: 700, padding: '12px 14px' }}
              value={form.title}
              onChange={e => update('title', e.target.value)}
              placeholder="Name this lesson"
            />
          </div>

          {/* Video URL + Duration row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Video URL (Vimeo)</label>
              <input style={inputStyle} value={form.video_url} onChange={e => update('video_url', e.target.value)} placeholder="https://vimeo.com/..." />
            </div>
            <div>
              <label style={labelStyle}>Duration</label>
              <input style={inputStyle} value={form.duration} onChange={e => update('duration', e.target.value)} placeholder="e.g. 5 min" />
            </div>
          </div>

          {/* Thumbnails row */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
            <ImageUpload value={form.thumbnail_url} onChange={(url) => update('thumbnail_url', url)} width={180} height={110} label="Lesson Thumbnail" />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Lesson Description</label>
            <RichTextEditor editorElRef={editorElRef} initialValue={form.description} onChange={() => setDirty(true)} />
          </div>

          {/* Downloadable Resources */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Downloadable Resources</label>
            <ResourceUploader
              resources={resources}
              onUpload={uploadResource}
              onRemove={removeResource}
            />
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div style={{
        padding: '12px 24px', borderTop: '1px solid var(--divider)', background: 'var(--bg-card)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <button onClick={onDelete} style={{
          padding: '10px 18px', borderRadius: 8, border: 'none', fontSize: 13,
          background: 'rgba(255,59,48,0.1)', color: '#FF3B30', fontWeight: 600, cursor: 'pointer',
        }}>Delete</button>
        <div style={{ flex: 1 }} />
        {dirty && <span style={{ fontSize: 11, color: 'var(--accent)', fontStyle: 'italic', marginRight: 8 }}>Unsaved changes</span>}
        <button onClick={() => handleSave(false)} disabled={saving} style={{
          padding: '10px 18px', borderRadius: 8, border: '1px solid var(--divider)',
          background: 'none', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>{saving ? 'Saving...' : 'Save'}</button>
        <button onClick={() => handleSave(true)} disabled={saving} style={{
          padding: '10px 18px', borderRadius: 8, border: 'none', fontSize: 13,
          background: '#4A90D9', color: '#fff', fontWeight: 600, cursor: 'pointer',
        }}>Save & Publish</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// RESOURCE UPLOADER
// ═══════════════════════════════════════════════════
function ResourceUploader({ resources, onUpload, onRemove }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files) => {
    setUploading(true);
    for (const file of files) {
      await onUpload(file);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = 'var(--divider)';
    if (e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files));
  };

  const getFileIcon = (type) => {
    if (type?.includes('pdf')) return '📄';
    if (type?.includes('spreadsheet') || type?.includes('excel') || type?.includes('csv')) return '📊';
    if (type?.includes('word') || type?.includes('document')) return '📝';
    if (type?.includes('zip')) return '📦';
    return '📎';
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div>
      {/* Existing resources */}
      {resources.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {resources.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              background: 'var(--bg-card)', borderRadius: 8, marginBottom: 4,
              border: '1px solid var(--divider)',
            }}>
              <span style={{ fontSize: 18 }}>{getFileIcon(r.file_type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.original_name}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatSize(r.file_size)}</p>
              </div>
              <button onClick={() => onRemove(r.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#FF3B30', fontSize: 11, fontWeight: 600,
              }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; }}
        onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--divider)'; }}
        onDrop={handleDrop}
        style={{
          border: '2px dashed var(--divider)', borderRadius: 10, padding: '20px',
          textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s',
        }}
      >
        {uploading ? (
          <div className="spinner" style={{ margin: '0 auto' }} />
        ) : (
          <>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" style={{ marginBottom: 6 }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Click to upload or drag and drop</p>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>Supported: PDF, DOC, XLS, CSV, TXT, ZIP</p>
          </>
        )}
      </div>
      <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" onChange={e => handleFiles(Array.from(e.target.files))} style={{ display: 'none' }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════
// RICH TEXT EDITOR
// ═══════════════════════════════════════════════════
function RichTextEditor({ initialValue, onChange, editorElRef }) {
  const editorRef = useRef(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (editorRef.current && !initialized.current) {
      editorRef.current.innerHTML = initialValue || '';
      initialized.current = true;
    }
  }, [initialValue]);

  const exec = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
    onChange?.();
  };

  const insertLink = () => {
    const url = prompt('Enter URL:');
    if (url) exec('createLink', url);
  };

  const tbBtn = { background: 'none', border: 'none', cursor: 'pointer', padding: '5px 8px', borderRadius: 4, color: 'var(--text-primary)', fontSize: 13, display: 'flex', alignItems: 'center' };
  const sep = { width: 1, height: 18, background: 'var(--divider)', margin: '0 4px', flexShrink: 0 };

  return (
    <div style={{ border: '1px solid var(--divider)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 1, padding: '6px 8px', borderBottom: '1px solid var(--divider)', background: 'var(--bg-card)', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => exec('bold')} style={tbBtn} title="Bold"><strong>B</strong></button>
        <button onClick={() => exec('italic')} style={tbBtn} title="Italic"><em>I</em></button>
        <button onClick={() => exec('underline')} style={tbBtn} title="Underline"><u>U</u></button>
        <div style={sep} />
        <button onClick={() => exec('insertUnorderedList')} style={tbBtn} title="Bullet list">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>
        </button>
        <button onClick={() => exec('insertOrderedList')} style={tbBtn} title="Numbered list">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div style={sep} />
        <button onClick={insertLink} style={tbBtn} title="Insert link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        </button>
      </div>
      <div
        ref={(el) => {
          editorRef.current = el;
          if (editorElRef) editorElRef.current = el;
        }}
        contentEditable
        onInput={onChange}
        style={{
          minHeight: 200, padding: '14px 16px', outline: 'none',
          fontSize: 14, lineHeight: 1.7, color: 'var(--text-primary)', background: 'var(--bg-primary)',
        }}
        suppressContentEditableWarning
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SMALL COMPONENTS
// ═══════════════════════════════════════════════════
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'var(--bg-primary)', border: '1px solid var(--divider)',
  color: 'var(--text-primary)', fontSize: 14, outline: 'none',
};

const labelStyle = { fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' };

function IconBtn({ onClick, disabled, children, className, small, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
        padding: small ? 2 : 3, display: 'flex', alignItems: 'center',
        color: className === 'danger' ? '#FF3B30' : 'var(--text-tertiary)',
        opacity: disabled ? 0.25 : 1, transition: 'opacity 0.15s',
      }}
    >{children}</button>
  );
}

function StatusBadge({ status, onChange, small }) {
  const [open, setOpen] = useState(false);
  const colors = { published: '#34C759', draft: '#FF9500' };
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
          padding: small ? '1px 6px' : '2px 8px', borderRadius: 10, border: 'none',
          fontSize: small ? 9 : 10, fontWeight: 600, cursor: 'pointer',
          color: '#fff', background: colors[status] || colors.published,
        }}
      >{status || 'published'}</button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--bg-card)',
          border: '1px solid var(--divider)', borderRadius: 8, overflow: 'hidden', zIndex: 20,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)', minWidth: 100,
        }}>
          {['published', 'draft'].map(s => (
            <button key={s} onClick={(e) => { e.stopPropagation(); onChange(s); setOpen(false); }} style={{
              display: 'block', width: '100%', padding: '8px 14px', border: 'none', background: 'none',
              cursor: 'pointer', fontSize: 12, color: colors[s], textAlign: 'left', fontWeight: 600,
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{s.charAt(0).toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModuleTitle({ module, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(module.title);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const save = () => {
    if (title.trim() && title !== module.title) {
      onUpdate(module.id, { title: title.trim(), status: module.status });
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef} value={title}
        onChange={e => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setTitle(module.title); setEditing(false); } }}
        onClick={e => e.stopPropagation()}
        style={{ ...inputStyle, padding: '3px 6px', fontSize: 12, fontWeight: 600, flex: 1 }}
        autoFocus
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
      title="Double-click to rename"
    >{module.title}</span>
  );
}

// ═══════════════════════════════════════════════════
// COURSE SETTINGS MODAL
// ═══════════════════════════════════════════════════
function CourseSettingsModal({ course, tiers, onSave, onClose }) {
  const [form, setForm] = useState({
    title: course.title || '', subtitle: course.subtitle || '', description: course.description || '',
    image_url: course.image_url || '', difficulty: course.difficulty || 'All Levels',
    duration: course.duration || '', tier_id: course.tier_id || 1,
    visible: course.visible ?? 1, featured: course.featured ?? 0,
    modules: course.modules || 0, lessons: course.lessons || 0,
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 28, maxWidth: 700, width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Course Settings</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={labelStyle}>Title</label><input style={inputStyle} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div><label style={labelStyle}>Subtitle</label><input style={inputStyle} value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} /></div>
          <div><label style={labelStyle}>Difficulty</label>
            <select style={inputStyle} value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}>
              {['Beginner', 'Intermediate', 'Advanced', 'All Levels'].map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Duration</label><input style={inputStyle} value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="e.g. 8 weeks" /></div>
          <div><label style={labelStyle}>Tier</label>
            <select style={inputStyle} value={form.tier_id} onChange={e => setForm({ ...form, tier_id: Number(e.target.value) })}>
              {tiers.map(t => <option key={t.id} value={t.id}>{t.name} - {t.price_label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.visible === 1} onChange={e => setForm({ ...form, visible: e.target.checked ? 1 : 0 })} /> Visible
            </label>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.featured === 1} onChange={e => setForm({ ...form, featured: e.target.checked ? 1 : 0 })} /> Featured
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
          <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} width={200} height={130} label="Course Thumbnail" />
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 130 }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onSave(form)} disabled={!form.title} style={{
            padding: '10px 20px', borderRadius: 8, border: 'none', fontSize: 13,
            background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer',
            opacity: form.title ? 1 : 0.5,
          }}>Save</button>
          <button onClick={onClose} style={{
            padding: '10px 20px', borderRadius: 8, border: '1px solid var(--divider)',
            background: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// COURSE PARTICIPANTS PANEL
// Shown in the right-hand pane when no lesson is selected. Lists every
// client who has completed any lesson in this course with a progress bar.
// Uses GET /api/content/courses/:id/participants (coach-only).
// ═══════════════════════════════════════════════════
function CourseParticipantsPanel({ courseId, token }) {
  const [state, setState] = useState({ loading: true, participants: [], total: 0 });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/content/courses/${courseId}/participants`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setState({
            loading: false,
            participants: d.participants || [],
            total: d.total_lessons || 0,
          });
        }
      })
      .catch(() => { if (!cancelled) setState({ loading: false, participants: [], total: 0 }); });
    return () => { cancelled = true; };
  }, [courseId, token]);

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Participants</h2>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 18 }}>
        Clients who have completed at least one lesson. Select a lesson from the outline to edit it.
      </p>

      {state.loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : state.participants.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)', background: 'var(--bg-card)', borderRadius: 12 }}>
          <p style={{ fontSize: 13, marginBottom: 4 }}>No one has started this course yet.</p>
          <p style={{ fontSize: 11 }}>Clients appear here once they complete a lesson.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {state.participants.map((p) => (
            <div key={p.user_id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              background: 'var(--bg-card)', borderRadius: 10,
            }}>
              {p.photo_url ? (
                <img src={p.photo_url} alt={p.name}
                  style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: '#fff',
                }}>{p.name?.charAt(0) || '?'}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</p>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)' }}>
                    {p.completed_count}/{p.total_lessons}
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'var(--divider)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${p.pct_complete}%`, height: '100%',
                    background: p.finished ? 'var(--accent-mint)' : 'var(--accent)',
                  }} />
                </div>
              </div>
              {p.finished && (
                <span style={{
                  padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 800,
                  background: 'rgba(133,255,186,0.18)', color: 'var(--accent-mint)', flexShrink: 0,
                }}>DONE</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
