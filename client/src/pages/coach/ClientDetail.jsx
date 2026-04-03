import { useState } from 'react';

const sampleNotes = [
  { id: 1, title: 'Goal', date: '16 Nov 2024', content: 'Wants to improve hip mobility and reduce lower back pain. Target: pain-free squat by March.', private: false },
  { id: 2, title: 'Injuries', date: '16 Nov 2024', content: 'Dislocated left shoulder last year, does not feel pain but stretching is important before each exercise. History of lower back issues from desk work.', private: true },
  { id: 3, title: 'Sleeping', date: '16 Nov 2024', content: '- Tends to wake up around 7am\n- Roughly gets 6-7 hours sleep\n- Wants to improve sleep quality', private: false },
  { id: 4, title: 'Workout History', date: '16 Nov 2024', content: 'Has been training alone for 2 years. Some progress but inconsistent. Most knowledge from YouTube. Never worked with an online coach before.', private: false },
  { id: 5, title: 'Dietary Requirements', date: '16 Nov 2024', content: 'No allergies. Prefers meat-heavy meals. Open to trying carnivore approach. Currently eats too many processed foods.', private: false },
];

export default function ClientDetail({ client, onBack }) {
  const [activeTab, setActiveTab] = useState('Overview');
  const [notes, setNotes] = useState(sampleNotes);
  const [editingNote, setEditingNote] = useState(null);
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNote, setNewNote] = useState({ title: '', content: '', private: false });
  const tabs = ['Overview', 'Profile', 'Settings'];

  const handleSaveNote = () => {
    if (!newNote.title.trim() || !newNote.content.trim()) return;
    const note = {
      id: Date.now(),
      title: newNote.title,
      date: new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }),
      content: newNote.content,
      private: newNote.private,
    };
    setNotes([note, ...notes]);
    setNewNote({ title: '', content: '', private: false });
    setShowAddNote(false);
  };

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>{client.name}</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{client.name.toLowerCase().replace(' ', '')}@email.com</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ background: 'none', border: 'none', color: 'var(--accent)', padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          </button>
          <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0, background: 'var(--bg-card)', borderRadius: 50,
        padding: 4, marginBottom: 20,
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

      {/* OVERVIEW TAB */}
      {activeTab === 'Overview' && (
        <>
          {/* Quick stats */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Weight</p>
              <p style={{ fontSize: 22, fontWeight: 700 }}>93 <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>kg</span></p>
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>16 Jun</p>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Body Fat</p>
              <p style={{ fontSize: 22, fontWeight: 700 }}>--- <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>%</span></p>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Steps</p>
              <p style={{ fontSize: 22, fontWeight: 700 }}>---</p>
            </div>
          </div>

          {/* Gallery */}
          <div className="section-header">
            <h2 style={{ fontSize: 16 }}>Gallery</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>VIEW ALL</button>
              <button style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16 }}>+</button>
            </div>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No photos yet</p>
          </div>

          {/* Notes */}
          <div className="section-header">
            <h2 style={{ fontSize: 16 }}>Notes</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>VIEW ALL</button>
              <button
                onClick={() => setShowAddNote(true)}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16 }}
              >+</button>
            </div>
          </div>

          {/* Add Note Modal */}
          {showAddNote && (
            <div className="card" style={{ marginBottom: 12, border: '1px solid var(--accent-mint)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>New Note</h3>
                <button
                  onClick={handleSaveNote}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14, fontWeight: 700 }}
                >Save</button>
              </div>
              <input
                type="text"
                placeholder="Title (e.g. Goal, Injuries, Dietary)"
                value={newNote.title}
                onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                className="input-field"
                style={{ marginBottom: 8, fontSize: 14 }}
              />
              <textarea
                placeholder="Write your note..."
                value={newNote.content}
                onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                className="input-field"
                style={{ minHeight: 80, resize: 'vertical', fontSize: 14 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => setNewNote({ ...newNote, private: !newNote.private })}
                  style={{
                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: newNote.private ? 'var(--accent-mint)' : 'var(--divider)',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 2, transition: 'left 0.2s',
                    left: newNote.private ? 20 : 2,
                  }} />
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Private Note <span style={{ fontSize: 10 }}>(only you can view)</span></span>
              </div>
            </div>
          )}

          {/* Note Cards */}
          {notes.map((note) => (
            <div key={note.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 700 }}>{note.title}</h4>
                    {note.private && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                      </svg>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{note.date}</p>
                </div>
                <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: 2 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                {note.content}
              </p>
            </div>
          ))}
        </>
      )}

      {/* PROFILE TAB */}
      {activeTab === 'Profile' && (
        <>
          {[
            { icon: '🍽️', label: 'Logged Nutrition' },
            { icon: '🏋️', label: 'Workout History' },
            { icon: '💪', label: 'Exercise History' },
            { icon: '✅', label: 'Habits Overview' },
            { icon: '📋', label: 'Check-Ins Submitted' },
            { icon: '📝', label: 'Questionnaires Submitted' },
            { icon: '📊', label: 'Activity Timeline' },
          ].map(({ icon, label }) => (
            <div key={label} className="card-sm" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          ))}
        </>
      )}

      {/* SETTINGS TAB */}
      {activeTab === 'Settings' && (
        <>
          {[
            { label: 'Unit', value: 'cm' },
            { label: 'Weight', value: 'kg' },
            { label: 'Timezone', value: 'Europe/Dublin' },
          ].map(({ label, value }) => (
            <div key={label} className="card-sm" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
              </div>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{value}</span>
            </div>
          ))}
          <div className="card-sm" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
              <span style={{ fontSize: 15, fontWeight: 500 }}>Feature Control</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </>
      )}
    </div>
  );
}
