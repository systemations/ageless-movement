import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../components/Modal';
import MessageThread from '../client/MessageThread';

const PHOTO_KEYS = ['photo_front_url', 'photo_side_url', 'photo_back_url'];

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

function statusBlurb(status, name) {
  if (status === 'paused') return `${name} will see a "membership paused" banner but keep their content. You can reactivate any time.`;
  if (status === 'archived') return `${name} will be hidden from your active client list and shown an "ended" message. You can reactivate any time.`;
  return `${name} will be set back to active and regain normal access.`;
}

const PROFILE_LINKS = [
  { key: 'nutrition', icon: '🍽️', label: 'Logged Nutrition' },
  { key: 'workouts', icon: '🏋️', label: 'Workout History' },
  { key: 'exercises', icon: '💪', label: 'Exercise History' },
  { key: 'habits', icon: '✅', label: 'Habits Overview' },
  { key: 'checkins', icon: '📋', label: 'Check-Ins Submitted' },
  { key: 'questionnaire', icon: '📝', label: 'Questionnaire' },
  { key: 'activity', icon: '📊', label: 'Activity Timeline' },
];

const SRow = ({ children }) => <div className="card-sm" style={{ marginBottom: 6 }}>{children}</div>;
const SEmpty = ({ text }) => (
  <div className="card" style={{ textAlign: 'center', padding: 24 }}>
    <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{text}</p>
  </div>
);
const rowHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 };
const subText = { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 };

// Renders one Profile-tab drill-down from the data already on the profile.
function ProfileSection({ section, profile, onBack }) {
  const link = PROFILE_LINKS.find((l) => l.key === section);
  const c = profile?.client || {};
  let body = <SEmpty text="Loading…" />;

  if (section === 'nutrition') {
    const rows = profile?.nutritionTotals || [];
    body = rows.length ? rows.map((r, i) => (
      <SRow key={i}>
        <div style={rowHead}><span style={{ fontWeight: 600 }}>{fmtDate(r.date)}</span><span>{Math.round(r.calories)} kcal</span></div>
        <p style={subText}>P {Math.round(r.protein)}g · F {Math.round(r.fat)}g · C {Math.round(r.carbs)}g</p>
      </SRow>
    )) : <SEmpty text="No nutrition logged" />;
  } else if (section === 'workouts') {
    const rows = profile?.workoutLogs || [];
    body = rows.length ? rows.map((w) => (
      <SRow key={w.id}>
        <div style={rowHead}>
          <span style={{ fontWeight: 600 }}>{fmtDate(w.date)}</span>
          <span style={{ fontSize: 12, color: w.completed ? '#34C759' : 'var(--text-tertiary)' }}>{w.completed ? 'Completed' : 'Logged'}</span>
        </div>
        {(w.duration_mins || w.notes) && <p style={subText}>{w.duration_mins ? `${w.duration_mins} mins` : ''}{w.notes ? `${w.duration_mins ? ' · ' : ''}${w.notes}` : ''}</p>}
      </SRow>
    )) : <SEmpty text="No workouts logged (last 30 days)" />;
  } else if (section === 'exercises') {
    const rows = profile?.exerciseHistory || [];
    body = rows.length ? rows.map((e, i) => (
      <SRow key={i}>
        <div style={rowHead}><span style={{ fontWeight: 600 }}>{e.exercise_name || 'Exercise'}</span><span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDate(e.date)}</span></div>
        <p style={subText}>Set {e.set_number ?? '–'} · {e.reps ?? '–'} reps{e.weight != null ? ` · ${e.weight} kg` : ''}</p>
      </SRow>
    )) : <SEmpty text="No exercise history" />;
  } else if (section === 'habits') {
    const rows = profile?.habitEntries || [];
    body = rows.length ? rows.map((h, i) => (
      <SRow key={i}>
        <div style={rowHead}><span style={{ fontWeight: 600 }}>{fmtDate(h.date)}</span></div>
        <p style={subText}>{[h.sleep_hours != null ? `Sleep ${h.sleep_hours}h` : null, h.alcohol_units != null ? `Alcohol ${h.alcohol_units}` : null, h.meditation_minutes != null ? `Meditation ${h.meditation_minutes}m` : null].filter(Boolean).join(' · ') || '—'}</p>
        {h.notes && <p style={{ ...subText, color: 'var(--text-tertiary)' }}>{h.notes}</p>}
      </SRow>
    )) : <SEmpty text="No habit entries" />;
  } else if (section === 'checkins') {
    const rows = profile?.checkins || [];
    body = rows.length ? rows.map((ci) => (
      <SRow key={ci.id}>
        <div style={rowHead}>
          <span style={{ fontWeight: 600 }}>{fmtDate(ci.date)}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ci.weight != null ? `${ci.weight} kg` : ''}{ci.body_fat != null ? ` · ${ci.body_fat}%` : ''}</span>
        </div>
        {ci.notes && <p style={subText}>{ci.notes}</p>}
      </SRow>
    )) : <SEmpty text="No check-ins submitted" />;
  } else if (section === 'questionnaire') {
    const fields = [
      ['Goal', c.goal], ['Experience', c.experience], ['Injuries', c.injuries], ['Schedule', c.schedule],
      ['Equipment', Array.isArray(c.equipment) ? c.equipment.join(', ') : c.equipment],
      ['Dietary', c.dietary], ['Sleep', c.sleep], ['Anything else', c.anything_else],
    ].filter(([, v]) => v);
    body = fields.length ? fields.map(([label, val]) => (
      <SRow key={label}>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</p>
        <p style={{ fontSize: 14, color: 'var(--text-primary)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{val}</p>
      </SRow>
    )) : <SEmpty text="No questionnaire answers on file" />;
  } else if (section === 'activity') {
    const rows = profile?.activity || [];
    body = rows.length ? rows.map((a, i) => (
      <SRow key={i}>
        <div style={rowHead}><span style={{ fontSize: 13 }}>{a.description || a.action_type}</span><span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDate(a.created_at)}</span></div>
      </SRow>
    )) : <SEmpty text="No activity yet" />;
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>← Back</button>
        <h3 style={{ fontSize: 15, fontWeight: 700 }}>{link?.label}</h3>
      </div>
      {body}
    </>
  );
}

function MenuItem({ label, onClick, danger }) {
  return (
    <button onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px',
      background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
      color: danger ? '#FF453A' : 'var(--text-primary)',
    }}>{label}</button>
  );
}

export default function ClientDetail({ client, onBack }) {
  const { token } = useAuth();
  const { confirm, notify } = useModal();
  const [activeTab, setActiveTab] = useState('Overview');
  const [chatConvoId, setChatConvoId] = useState(null);
  const [openingChat, setOpeningChat] = useState(false);
  const [profile, setProfile] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNote, setNewNote] = useState({ title: '', content: '', private: false });
  const [section, setSection] = useState(null); // open Profile-tab drill-down

  const auth = { Authorization: `Bearer ${token}` };
  const tabs = ['Overview', 'Profile', 'Settings'];

  const loadProfile = () => fetch(`/api/coach/clients/${client.id}/profile`, { headers: auth })
    .then((r) => (r.ok ? r.json() : null)).then(setProfile).catch(() => {});
  useEffect(() => { loadProfile(); /* eslint-disable-next-line */ }, [client.id]);

  // Derived real data
  const email = profile?.client?.email || '';
  const status = profile?.client?.status || 'active';
  const checkins = profile?.checkins || [];
  const latest = checkins[0];
  const notes = profile?.notes || [];
  const steps = profile?.stepTotals?.[0]?.steps;
  const photos = checkins
    .flatMap((c) => PHOTO_KEYS.map((k) => c[k]).filter(Boolean).map((url) => ({ url, date: c.date })))
    .slice(0, 6);

  // Open the shared team-inbox thread for this client.
  const openChat = async () => {
    if (openingChat) return;
    setOpeningChat(true);
    try {
      const r = await fetch('/api/messages/conversations?scope=team', { headers: auth });
      const d = await r.json();
      const convo = (d.conversations || []).find((c) => (c.client?.id ?? c.client_id) === client.id);
      if (convo) setChatConvoId(convo.id);
    } catch (err) { console.error(err); }
    setOpeningChat(false);
  };

  const resetPassword = async () => {
    setMenuOpen(false);
    try {
      const r = await fetch(`/api/coach/clients/${client.id}/reset-password`, { method: 'POST', headers: auth });
      const d = await r.json();
      await notify({
        title: 'Password reset',
        message: d.email_sent
          ? `A reset link was emailed to ${email || 'the client'}.`
          : `Email not sent — share this link with the client:\n\n${d.reset_url}`,
      });
    } catch { notify('Could not generate a reset link.'); }
  };

  const changeStatus = async (newStatus, verb) => {
    setMenuOpen(false);
    const ok = await confirm({
      title: `${verb} ${client.name}?`,
      message: statusBlurb(newStatus, client.name),
      confirmLabel: verb,
      danger: newStatus !== 'active',
    });
    if (!ok) return;
    try {
      await fetch(`/api/coach/clients/${client.id}/status`, {
        method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setProfile((p) => (p ? { ...p, client: { ...p.client, status: newStatus } } : p));
      notify(`${client.name} ${newStatus === 'active' ? 'reactivated' : newStatus}.`);
    } catch { notify('Could not update status.'); }
  };

  const copyEmail = async () => {
    setMenuOpen(false);
    if (!email) { notify('No email on file yet.'); return; }
    try { await navigator.clipboard.writeText(email); notify('Email copied to clipboard.'); }
    catch { notify({ title: 'Email', message: email }); }
  };

  const saveNote = async () => {
    if (!newNote.title.trim() || !newNote.content.trim()) return;
    try {
      await fetch(`/api/coach/clients/${client.id}/notes`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newNote.title, content: newNote.content, is_private: newNote.private }),
      });
      setNewNote({ title: '', content: '', private: false });
      setShowAddNote(false);
      loadProfile();
    } catch { notify('Could not save note.'); }
  };

  if (chatConvoId) {
    return (
      <MessageThread
        conversationId={chatConvoId}
        title={client.name}
        subtitle="Team inbox"
        onBack={() => setChatConvoId(null)}
      />
    );
  }

  const statusPillColor = status === 'active' ? null : status === 'paused' ? '#FF9F0A' : '#FF453A';

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>{client.name}</h1>
            {statusPillColor && (
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase',
                padding: '2px 7px', borderRadius: 8, color: statusPillColor, background: `${statusPillColor}22`,
              }}>{status}</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email || ' '}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={openChat} disabled={openingChat} title="Message client" style={{ background: 'none', border: 'none', color: 'var(--accent)', padding: 4, cursor: openingChat ? 'default' : 'pointer', opacity: openingChat ? 0.5 : 1 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          </button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen((o) => !o)} title="More" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: 4, cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
            </button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                <div style={{
                  position: 'absolute', top: 32, right: 0, zIndex: 11, minWidth: 184,
                  background: 'var(--bg-card)', border: '1px solid var(--divider)', borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden',
                }}>
                  <MenuItem label="Reset password" onClick={resetPassword} />
                  <MenuItem label="Copy email" onClick={copyEmail} />
                  {status !== 'active' && <MenuItem label="Reactivate client" onClick={() => changeStatus('active', 'Reactivate')} />}
                  {status === 'active' && <MenuItem label="Pause client" onClick={() => changeStatus('paused', 'Pause')} />}
                  {status !== 'archived' && <MenuItem label="Archive client" danger onClick={() => changeStatus('archived', 'Archive')} />}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, background: 'var(--bg-card)', borderRadius: 50, padding: 4, marginBottom: 20 }}>
        {tabs.map((tab) => (
          <button key={tab} onClick={() => { setActiveTab(tab); setSection(null); }} style={{
            flex: 1, padding: '10px 0', borderRadius: 50, fontSize: 13, fontWeight: 600,
            background: activeTab === tab ? 'rgba(61,255,210,0.15)' : 'transparent',
            color: activeTab === tab ? 'var(--accent-mint)' : 'var(--text-secondary)', border: 'none',
          }}>{tab}</button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'Overview' && (
        <>
          {/* Quick stats - latest check-in */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Weight</p>
              <p style={{ fontSize: 22, fontWeight: 700 }}>{latest?.weight ?? '---'} <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>kg</span></p>
              {latest?.date && <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{fmtDate(latest.date)}</p>}
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Body Fat</p>
              <p style={{ fontSize: 22, fontWeight: 700 }}>{latest?.body_fat ?? '---'} <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>%</span></p>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Steps</p>
              <p style={{ fontSize: 22, fontWeight: 700 }}>{steps != null ? steps.toLocaleString() : '---'}</p>
            </div>
          </div>

          {/* Gallery - latest check-in photos */}
          <div className="section-header">
            <h2 style={{ fontSize: 16 }}>Gallery</h2>
          </div>
          {photos.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 24 }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No photos yet</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
              {photos.map((p, i) => (
                <a key={i} href={p.url} target="_blank" rel="noreferrer" style={{ display: 'block', aspectRatio: '1/1', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-card)' }}>
                  <img src={p.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </a>
              ))}
            </div>
          )}

          {/* Notes */}
          <div className="section-header">
            <h2 style={{ fontSize: 16 }}>Notes</h2>
            <button onClick={() => setShowAddNote(true)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16 }}>+</button>
          </div>

          {showAddNote && (
            <div className="card" style={{ marginBottom: 12, border: '1px solid var(--accent-mint)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>New Note</h3>
                <button onClick={saveNote} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14, fontWeight: 700 }}>Save</button>
              </div>
              <input type="text" placeholder="Title (e.g. Goal, Injuries, Dietary)" value={newNote.title} onChange={(e) => setNewNote({ ...newNote, title: e.target.value })} className="input-field" style={{ marginBottom: 8, fontSize: 14 }} />
              <textarea placeholder="Write your note..." value={newNote.content} onChange={(e) => setNewNote({ ...newNote, content: e.target.value })} className="input-field" style={{ minHeight: 80, resize: 'vertical', fontSize: 14 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <button onClick={() => setNewNote({ ...newNote, private: !newNote.private })} style={{
                  width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                  background: newNote.private ? 'var(--accent-mint)' : 'var(--divider)', position: 'relative',
                }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, transition: 'left 0.2s', left: newNote.private ? 20 : 2 }} />
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Private Note <span style={{ fontSize: 10 }}>(only coaches view)</span></span>
              </div>
            </div>
          )}

          {notes.length === 0 && !showAddNote ? (
            <div className="card" style={{ textAlign: 'center', padding: 24 }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No notes yet</p>
            </div>
          ) : notes.map((note) => (
            <div key={note.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 700 }}>{note.title}</h4>
                    {note.is_private ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                      </svg>
                    ) : null}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDate(note.created_at)}{note.coach_name ? ` · ${note.coach_name}` : ''}</p>
                </div>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{note.content}</p>
            </div>
          ))}
        </>
      )}

      {/* PROFILE TAB - drill into the client's real logged data */}
      {activeTab === 'Profile' && (
        section ? (
          <ProfileSection section={section} profile={profile} onBack={() => setSection(null)} />
        ) : (
          <>
            {PROFILE_LINKS.map(({ key, icon, label }) => (
              <div key={key} className="card-sm" onClick={() => setSection(key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            ))}
          </>
        )
      )}

      {/* SETTINGS TAB */}
      {activeTab === 'Settings' && (
        <>
          {[
            { label: 'Email', value: email || '—' },
            { label: 'Tier', value: profile?.client?.tier_name || '—' },
            { label: 'Timezone', value: profile?.client?.timezone || '—' },
            { label: 'Joined', value: fmtDate(profile?.client?.created_at) || '—' },
          ].map(({ label, value }) => (
            <div key={label} className="card-sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
