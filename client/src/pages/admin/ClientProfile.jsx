import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import MessageThread from '../client/MessageThread';
import WorkoutBuilder from './WorkoutBuilder';

// ClientProfile — tabbed workspace shown when a coach clicks a client from
// the ClientManager list. Tabs: Overview, Check-ins, Chats, Habits,
// Workout, Nutrition, Gallery, Notes, Calendar, Settings.
//
// Rendering modes:
//   - Standalone (from ClientManager): tabs + full-width content, no rail
//   - Embedded in CoachWorkspace: `showRail` = right-side client info rail
//     always visible; `conversationId` + `clientName` = Chats tab renders
//     the MessageThread inline in the center pane (FitBudd-style 3-column)

const TABS = ['Overview', 'Check-ins', 'Chats', 'Habits', 'Workout', 'Nutrition', 'Levels', 'Gallery', 'Notes', 'Calendar', 'Settings'];

export default function ClientProfile({
  clientId,
  onBack,
  onOpenChat,
  showRail = false,
  conversationId = null,
  initialTab = 'Overview',
}) {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);

  // When the parent switches client, snap back to the default tab so we
  // don't persist e.g. "Nutrition" for a client we're viewing for the first time.
  useEffect(() => { setActiveTab(initialTab); }, [clientId, initialTab]);

  // Scroll every scrolling ancestor back to the top whenever we switch
  // client or tab. Runs on the next frame so React has painted the new
  // content first — without that, resetting scroll here and then adding
  // new tall content can leave the browser somewhere mid-page.
  const rootRef = useRef(null);
  useEffect(() => {
    const reset = () => {
      rootRef.current?.scrollTo?.({ top: 0, left: 0 });
      let el = rootRef.current?.parentElement;
      while (el) {
        const cs = window.getComputedStyle(el);
        if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
          el.scrollTop = 0;
        }
        el = el.parentElement;
      }
      window.scrollTo(0, 0);
    };
    // Reset immediately and again next frame — covers layout shifts caused
    // by the new tab's content loading in.
    reset();
    const raf = requestAnimationFrame(reset);
    return () => cancelAnimationFrame(raf);
  }, [clientId, activeTab]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/coach/clients/${clientId}/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId, token]);

  const refetch = () => {
    fetch(`/api/coach/clients/${clientId}/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setData);
  };

  if (loading) return <div style={{ padding: 40, color: 'var(--text-tertiary)' }}>Loading client...</div>;
  if (!data?.client) return <div style={{ padding: 40, color: 'var(--error)' }}>Client not found.</div>;

  const c = data.client;
  // Prefer an explicit conversationId passed in from CoachWorkspace; fall
  // back to the team inbox id returned by the profile endpoint so the Chats
  // tab still works when ClientProfile is opened from ClientManager.
  const effectiveConvoId = conversationId || data.team_conversation_id;

  return (
    <div ref={rootRef} style={{ padding: '24px 32px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.06)',
          border: '1px solid var(--divider)', color: 'var(--text-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
        }} title="Back to clients">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {c.photo_url ? (
          <div style={{
            width: 56, height: 56, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
            border: '2px solid var(--divider)',
          }}>
            <img src={c.photo_url} alt={c.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>{c.name?.charAt(0)}</div>
        )}

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>{c.name}</h1>
            {c.tier_name && <TierPill tier={c.tier_name} />}
            <StatusPill atRisk={!data.checkins.length || daysSince(data.checkins[0]?.date) > 14} />
            <MembershipPill
              planTitle={c.plan_title}
              nextRenewalAt={c.plan_next_renewal_at}
            />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {c.email}{c.age ? ` · ${c.age}` : ''}{c.gender ? ` · ${c.gender}` : ''}{c.location ? ` · ${c.location}` : ''}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: c.last_active_at && daysSince(c.last_active_at) === 0 ? '#3DFFD2' : '#94a3b8',
            }} />
            Last seen {c.last_active_at ? formatRelative(c.last_active_at) : 'never'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 2, borderBottom: '1px solid var(--divider)', marginBottom: 20, overflowX: 'auto',
      }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => {
              // Chats tab renders inline whenever we have any conversation id
              // (explicit prop or team inbox from the profile payload). Only
              // delegate upward if neither is available AND an onOpenChat
              // handler exists.
              if (t === 'Chats' && !effectiveConvoId && onOpenChat) { onOpenChat(); return; }
              setActiveTab(t);
            }}
            style={{
              padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
              color: activeTab === t ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: activeTab === t ? 700 : 500,
              borderBottom: activeTab === t ? '2px solid var(--accent)' : '2px solid transparent',
              fontSize: 13, whiteSpace: 'nowrap',
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content — wrap in 2-col grid when we need the always-visible info rail */}
      {showRail ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 16, alignItems: 'start' }}>
          <div style={{ minWidth: 0 }}>
            {activeTab === 'Overview' && <OverviewTab data={{ ...data, _refetch: refetch }} railMode />}
            {activeTab === 'Check-ins' && <CheckinsTab data={{ ...data, _refetch: refetch }} />}
            {activeTab === 'Chats' && (
              effectiveConvoId
                ? <EmbeddedChat conversationId={effectiveConvoId} clientName={c.name} />
                : <EmptyCard text="No conversation yet with this client." />
            )}
            {activeTab === 'Habits' && <HabitsTab data={data} />}
            {activeTab === 'Workout' && <WorkoutTab data={data} />}
            {activeTab === 'Nutrition' && <NutritionTab data={data} />}
            {activeTab === 'Levels' && <LevelsTab clientId={clientId} />}
            {activeTab === 'Gallery' && <GalleryTab data={data} />}
            {activeTab === 'Notes' && <NotesTab clientId={clientId} notes={data.notes} onChange={refetch} />}
            {activeTab === 'Calendar' && <CalendarTab clientId={clientId} />}
            {activeTab === 'Settings' && <SettingsTab data={{ ...data, _refetch: refetch }} />}
          </div>
          <ClientInfoRail data={data} onChange={refetch} />
        </div>
      ) : (
        <>
          {activeTab === 'Overview' && <OverviewTab data={{ ...data, _refetch: refetch }} />}
          {activeTab === 'Check-ins' && <CheckinsTab data={{ ...data, _refetch: refetch }} />}
          {activeTab === 'Chats' && (
            effectiveConvoId
              ? <EmbeddedChat conversationId={effectiveConvoId} clientName={c.name} />
              : <EmptyCard text="No conversation yet with this client." />
          )}
          {activeTab === 'Habits' && <HabitsTab data={data} />}
          {activeTab === 'Workout' && <WorkoutTab data={data} />}
          {activeTab === 'Nutrition' && <NutritionTab data={data} />}
          {activeTab === 'Levels' && <LevelsTab clientId={clientId} />}
          {activeTab === 'Gallery' && <GalleryTab data={data} />}
          {activeTab === 'Notes' && <NotesTab clientId={clientId} notes={data.notes} onChange={refetch} />}
          {activeTab === 'Calendar' && <CalendarTab clientId={clientId} />}
          {activeTab === 'Settings' && <SettingsTab data={data} />}
        </>
      )}
    </div>
  );
}

// Embedded chat — tuned for inline use inside ClientProfile. Drops the
// MessageThread's own header (we already have the client header + tabs
// above it) and sizes to a reasonable viewport so the page still scrolls
// cleanly. Renders inside a rounded bordered frame so it reads as a
// panel, not a full page takeover.
function EmbeddedChat({ conversationId, clientName }) {
  return (
    <div style={{
      height: 'calc(100vh - 220px)', minHeight: 420,
      borderRadius: 12, overflow: 'hidden', border: '1px solid var(--divider)',
      background: 'var(--bg-card)',
      display: 'flex', flexDirection: 'column',
    }}>
      <MessageThread
        conversationId={conversationId}
        title={clientName}
        subtitle="Team inbox · all coaches see this"
        hideBackButton
      />
    </div>
  );
}

// ═══ Overview ══════════════════════════════════════════════════════════
// railMode = rendered inside CoachWorkspace where the right-rail info card
// is already shown persistently next to the tab content. In that mode we
// drop the 2-column split and only render the main column so we don't
// double up on Summary/Membership/Recent logins/etc.
function OverviewTab({ data, railMode = false }) {
  const c = data.client;
  const lastCheckin = data.checkins[0];
  const adherence = computeAdherence(data);

  const mainCol = (
    <div style={{ display: 'grid', gap: 16 }}>
        {/* Tags row — freeform labels for the client */}
        <ClientTags clientId={c.id} tags={data.tags || []} />

        {/* Daily tasks — what the client set for themselves today */}
        <DailyTasksCard
          tasks={data.tasks || []}
          clientId={c.id}
          onChange={data._refetch}
        />

        {/* Weekly Trends — FitBudd-style Workout / Nutrition / Water compliance */}
        <WeeklyTrendsCard data={data} />

        {/* Goal + experience */}
        <Card title="Goal & experience">
          <Row label="Primary goal" value={c.goal} />
          <Row label="Experience" value={c.experience} />
          <Row label="Training schedule" value={c.schedule} />
          <Row label="Injuries" value={c.injuries} />
        </Card>

        {/* Measurements with trend arrows */}
        <MeasurementsCard trends={data.trends || {}} latestCheckin={lastCheckin} />

        {/* Adherence rings */}
        <Card title="Adherence (last 7 days)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Ring label="Workouts" pct={adherence.workouts} color="#FF8C00" sub={`${adherence.workoutDays}/7 days`} />
            <Ring label="Check-ins" pct={adherence.checkins} color="#3DFFD2" sub={`${adherence.checkinDays}/7 days`} />
            <Ring label="Nutrition logs" pct={adherence.nutrition} color="#38bdf8" sub={`${adherence.nutritionDays}/7 days`} />
          </div>
        </Card>

        {/* Goals list */}
        <Card title="Goals">
          {data.goals.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No goals set</p>
          ) : data.goals.map(g => (
            <div key={g.id} style={{
              padding: 10, marginBottom: 8, borderRadius: 8, background: 'rgba(255,255,255,0.03)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600 }}>{g.title}</p>
                {g.target && <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{g.target}</p>}
              </div>
              <span style={{
                fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 6,
                background: g.achieved ? 'rgba(61,255,210,0.15)' : 'rgba(255,140,0,0.15)',
                color: g.achieved ? '#3DFFD2' : 'var(--accent)',
              }}>
                {g.achieved ? 'ACHIEVED' : `${g.progress || 0}%`}
              </span>
            </div>
          ))}
        </Card>
      </div>
  );

  // In rail-mode (embedded in CoachWorkspace) the rail is rendered once
  // at the workspace level and persists across tab changes; we just return
  // the main content column here.
  if (railMode) return mainCol;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
      {mainCol}
      <ClientInfoRail data={data} onChange={data._refetch} />
    </div>
  );
}

// ClientInfoRail — the compact right-side summary rail used by CoachWorkspace
// next to the chat thread (and rendered inside the Overview tab when used
// standalone). Mirrors FitBudd's Account / Summary / Macros / Payment /
// Notes column. Recent logins intentionally omitted — it lives inside the
// Settings tab for when coaches need it, but clutters the rail.
function ClientInfoRail({ data, onChange }) {
  const c = data.client;
  const lastCheckin = data.checkins?.[0];
  return (
    <div style={{ display: 'grid', gap: 16, position: 'sticky', top: 8 }}>
      <Card title="Summary">
        <Stat label="Streak" value={`${data.streak?.current_streak || 0}🔥`} />
        <Stat label="Best streak" value={data.streak?.best_streak || 0} />
        <Stat label="Last check-in" value={lastCheckin ? formatRelative(lastCheckin.date) : '—'} />
        <Stat label="Last seen" value={c.last_active_at ? formatRelative(c.last_active_at) : '—'} />
        <Stat label="Member since" value={formatDate(c.created_at)} />
      </Card>

      <Card title="Targets">
        <Stat label="Calories" value={`${c.calorie_target || '—'} kcal`} />
        <Stat label="Protein" value={`${c.protein_target || '—'} g`} />
        <Stat label="Fat" value={`${c.fat_target || '—'} g`} />
        <Stat label="Carbs" value={`${c.carbs_target || '—'} g`} />
        <Stat label="Water" value={`${c.water_target || '—'} ml`} />
      </Card>

      {data.activeProgram && (
        <Card title="Active program">
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{data.activeProgram.program_title}</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Week {data.activeProgram.current_week} · Day {data.activeProgram.current_day}
          </p>
        </Card>
      )}

      <MembershipEditorCard client={c} onChange={onChange} />

      <NotesRailCard clientId={c.id} notes={data.notes || []} onChange={onChange} />
    </div>
  );
}

// NotesRailCard — compact notes preview for the right rail. Pinned notes
// first, then most recent. Inline "+ Add" so a coach can drop a quick note
// while they're in the middle of a chat.
function NotesRailCard({ clientId, notes, onChange }) {
  const { token } = useAuth();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', content: '', is_private: false });
  const [expandedId, setExpandedId] = useState(null);

  // Pinned first, then by created_at desc; only show 4 in the rail
  const sorted = [...notes].sort((a, b) => {
    if (!!b.is_pinned - !!a.is_pinned) return !!b.is_pinned - !!a.is_pinned;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });
  const preview = sorted.slice(0, 4);

  const submit = async () => {
    if (!draft.title.trim() || !draft.content.trim()) return;
    await fetch(`/api/coach/clients/${clientId}/notes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    setDraft({ title: '', content: '', is_private: false });
    setAdding(false);
    onChange?.();
  };

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 700 }}>Notes {notes.length > 0 && <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>· {notes.length}</span>}</p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={{
              background: 'rgba(255,140,0,0.12)', color: 'var(--accent)', border: 'none',
              borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >+ Add</button>
        )}
      </div>

      {adding && (
        <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          <input
            autoFocus
            placeholder="Title"
            value={draft.title}
            onChange={e => setDraft({ ...draft, title: e.target.value })}
            style={railInput}
          />
          <textarea
            placeholder="Quick note..."
            value={draft.content}
            onChange={e => setDraft({ ...draft, content: e.target.value })}
            rows={3}
            style={{ ...railInput, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => { setAdding(false); setDraft({ title: '', content: '', is_private: false }); }} style={railBtnSecondary}>Cancel</button>
            <button onClick={submit} disabled={!draft.title.trim() || !draft.content.trim()} style={railBtnPrimary}>Save</button>
          </div>
        </div>
      )}

      {preview.length === 0 && !adding && (
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
          No notes yet. Click + Add to drop one.
        </p>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        {preview.map(n => {
          const isOpen = expandedId === n.id;
          return (
            <div
              key={n.id}
              onClick={() => setExpandedId(isOpen ? null : n.id)}
              style={{
                padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.03)',
                borderLeft: n.is_pinned ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <p style={{ fontSize: 12, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.title}
                </p>
                {n.is_pinned && <span style={{ fontSize: 10 }}>📌</span>}
                {n.is_private && <span title="Private" style={{ fontSize: 9, color: '#ef4444', fontWeight: 800 }}>PRIVATE</span>}
              </div>
              <p style={{
                fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4,
                whiteSpace: isOpen ? 'pre-wrap' : 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
                display: isOpen ? 'block' : '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {n.content}
              </p>
              <p style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 3 }}>
                {formatDate(n.created_at)}{n.coach_name ? ` · ${n.coach_name}` : ''}
              </p>
            </div>
          );
        })}
      </div>

      {notes.length > 4 && (
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 8, textAlign: 'center', fontStyle: 'italic' }}>
          {notes.length - 4} more in the Notes tab
        </p>
      )}
    </Card>
  );
}

const railInput = {
  width: '100%', padding: '6px 10px', borderRadius: 6,
  background: 'rgba(0,0,0,0.25)', border: '1px solid var(--divider)',
  color: 'var(--text-primary)', fontSize: 12, outline: 'none',
};
const railBtnPrimary = {
  background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6,
  padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
};
const railBtnSecondary = {
  background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', border: 'none',
  borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
};

// Daily tasks — bidirectional. The client manages these from their app,
// and coaches can add / edit / remove here too. Tasks created by a coach
// are marked "SET BY COACH" so the client knows it was pushed to them.
function DailyTasksCard({ tasks, clientId, onChange }) {
  const { token } = useAuth();
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const addTask = async () => {
    const v = draft.trim();
    if (!v) return;
    await fetch(`/api/coach/clients/${clientId}/tasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: v }),
    });
    setDraft('');
    setShowAdd(false);
    onChange?.();
  };

  const saveEdit = async () => {
    if (!editingLabel.trim()) return;
    await fetch(`/api/coach/tasks/${editingId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: editingLabel.trim() }),
    });
    setEditingId(null);
    setEditingLabel('');
    onChange?.();
  };

  const deleteTask = async (id) => {
    if (!window.confirm('Remove this task from the client?')) return;
    await fetch(`/api/coach/tasks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    onChange?.();
  };

  const doneToday = tasks.filter(t => t.completed_today).length;

  return (
    <Card title={tasks.length ? `Daily tasks · ${doneToday}/${tasks.length} done today` : 'Daily tasks'}>
      {tasks.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic', marginBottom: 8 }}>
          No tasks yet. Add one below or the client can add their own from their app.
        </p>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        {tasks.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 8,
            background: t.completed_today ? 'rgba(61,255,210,0.06)' : 'rgba(255,255,255,0.03)',
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
              border: `2px solid ${t.completed_today ? '#3DFFD2' : 'var(--text-tertiary)'}`,
              background: t.completed_today ? '#3DFFD2' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {t.completed_today && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="4">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>

            {editingId === t.id ? (
              <input
                autoFocus
                value={editingLabel}
                onChange={(e) => setEditingLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') { setEditingId(null); setEditingLabel(''); }
                }}
                onBlur={saveEdit}
                style={{
                  flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--accent)',
                  color: 'var(--text-primary)', borderRadius: 6, padding: '4px 8px', fontSize: 13,
                }}
              />
            ) : (
              <>
                <p
                  onClick={() => { setEditingId(t.id); setEditingLabel(t.label); }}
                  style={{
                    flex: 1, fontSize: 13, cursor: 'text',
                    textDecoration: t.completed_today ? 'line-through' : 'none',
                    color: t.completed_today ? 'var(--text-secondary)' : 'var(--text-primary)',
                  }}
                >
                  {t.label}
                </p>
                {t.assigned_by_coach && (
                  <span title="Set by coach" style={{
                    fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 5,
                    background: 'rgba(255,140,0,0.12)', color: 'var(--accent)',
                    textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0,
                  }}>COACH</span>
                )}
                <span style={{
                  fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
                  padding: '2px 6px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.04)', flexShrink: 0,
                }} title={`${t.week_completion_rate}% of last 7 days`}>
                  {t.week_completion_rate}% · 7d
                </span>
                <button
                  onClick={() => deleteTask(t.id)}
                  title="Remove task"
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-tertiary)',
                    cursor: 'pointer', padding: 4, fontSize: 13, lineHeight: 1,
                  }}
                >×</button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add task row */}
      {showAdd ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
            placeholder="New task (e.g. 10 min morning mobility)"
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              background: 'rgba(0,0,0,0.25)', border: '1px solid var(--divider)',
              color: 'var(--text-primary)', fontSize: 13, outline: 'none',
            }}
          />
          <button onClick={addTask} style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>Add</button>
          <button onClick={() => { setShowAdd(false); setDraft(''); }} style={{
            background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', border: 'none',
            borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          style={{
            marginTop: 8, background: 'none', border: '1px dashed var(--divider)',
            color: 'var(--text-secondary)', borderRadius: 8, padding: '8px 12px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%',
          }}
        >+ Assign task to client</button>
      )}

      <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 10, fontStyle: 'italic' }}>
        Click a label to edit. Tasks you add here show up in the client's app as "Set by coach".
      </p>
    </Card>
  );
}

// Tier editor — coach-controlled. Drives Explore visibility gating (programs,
// workouts, courses, explore sections can all require min_tier_id).
// PUT /api/content/clients/:id/tier accepts {tier_id} and has no return body beyond {success:true}.
function TierEditorCard({ client, onChange }) {
  const { token } = useAuth();
  const [tiers, setTiers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/content/tiers', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setTiers(d.tiers || []))
      .catch(() => setTiers([]));
  }, [token]);

  const current = client.tier_id || 1;

  const changeTier = async (newId) => {
    if (newId === current) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/content/clients/${client.id}/tier`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier_id: newId }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Failed to update tier');
      return;
    }
    onChange?.();
  };

  const tierColors = {
    Free: 'rgba(148,163,184,0.7)',
    Starter: '#38bdf8',
    Prime: '#FF8C00',
    Elite: '#ec4899',
  };

  return (
    <Card title="Tier">
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
        Controls what programs, courses, and Explore content this client can access.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tiers.map((t) => {
          const active = t.id === current;
          const color = tierColors[t.name] || 'var(--accent)';
          return (
            <button
              key={t.id}
              onClick={() => changeTier(t.id)}
              disabled={saving}
              style={{
                padding: '5px 12px', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: active ? color : `${color}22`,
                color: active ? '#fff' : color,
                fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
                opacity: saving ? 0.5 : 1,
              }}
            >
              {t.name}
            </button>
          );
        })}
      </div>
      {tiers.find((t) => t.id === current)?.price_label && (
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 8 }}>
          Current plan: {tiers.find((t) => t.id === current).price_label}
        </p>
      )}
      {error && <p style={{ fontSize: 11, color: '#FF5E5E', marginTop: 6 }}>{error}</p>}
    </Card>
  );
}

// Membership editor — inline fields in the right rail. No floating modal.
// Saves on blur (and on Enter for title). PATCH /api/coach/clients/:id/membership
// accepts partials so we can save one field at a time.
function MembershipEditorCard({ client, onChange }) {
  const { token } = useAuth();
  const [form, setForm] = useState({
    plan_title: client.plan_title || '',
    plan_cycle: client.plan_cycle || '',
    plan_next_renewal_at: client.plan_next_renewal_at || '',
  });

  useEffect(() => {
    setForm({
      plan_title: client.plan_title || '',
      plan_cycle: client.plan_cycle || '',
      plan_next_renewal_at: client.plan_next_renewal_at || '',
    });
  }, [client.id, client.plan_title, client.plan_cycle, client.plan_next_renewal_at]);

  const save = async (patch) => {
    await fetch(`/api/coach/clients/${client.id}/membership`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    onChange?.();
  };

  const onBlur = (key) => () => {
    if ((form[key] || null) !== (client[key] || null)) save({ [key]: form[key] || null });
  };

  const cycleOptions = [
    { value: '', label: '—' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'annual', label: 'Annual' },
  ];

  return (
    <Card title="Membership">
      <div style={{ display: 'grid', gap: 8 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
            Plan title
          </p>
          <input
            value={form.plan_title}
            onChange={(e) => setForm({ ...form, plan_title: e.target.value })}
            onBlur={onBlur('plan_title')}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            placeholder="e.g. Performance Plus Membership"
            style={inlineInput}
          />
        </div>

        <div>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
            Cycle
          </p>
          <select
            value={form.plan_cycle}
            onChange={(e) => {
              setForm({ ...form, plan_cycle: e.target.value });
              save({ plan_cycle: e.target.value || null });
            }}
            style={inlineInput}
          >
            {cycleOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
            Next renewal
          </p>
          <input
            type="date"
            value={form.plan_next_renewal_at ? form.plan_next_renewal_at.slice(0, 10) : ''}
            onChange={(e) => {
              setForm({ ...form, plan_next_renewal_at: e.target.value });
              save({ plan_next_renewal_at: e.target.value || null });
            }}
            style={inlineInput}
          />
        </div>

        {client.plan_next_renewal_at && (
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
            {renewalStatusLabel(client.plan_next_renewal_at)}
          </p>
        )}
      </div>
    </Card>
  );
}

function renewalStatusLabel(dateStr) {
  const days = Math.floor((new Date(dateStr) - new Date()) / 86400000);
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'Renews today';
  if (days === 1) return 'Renews tomorrow';
  if (days <= 14) return `Renews in ${days} days`;
  return `Renews ${new Date(dateStr).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

const inlineInput = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  background: 'rgba(255,255,255,0.08)', border: '1px solid var(--divider)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
  fontFamily: 'inherit',
};

function RecentLoginsCard({ logins }) {
  if (!logins.length) {
    return (
      <Card title="Recent logins">
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
          No login history recorded yet.
        </p>
      </Card>
    );
  }
  return (
    <Card title="Recent logins">
      {logins.slice(0, 5).map(l => (
        <div key={l.id} style={{
          padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)',
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <div style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
            {l.device?.includes('Phone') || l.os === 'iOS' ? '📱'
              : l.os === 'Android' ? '📱'
              : '💻'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600 }}>
              {l.browser} · {l.os}{l.device ? ` · ${l.device}` : ''}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              {formatRelative(l.created_at)}{l.ip ? ` · ${maskIp(l.ip)}` : ''}
            </p>
          </div>
        </div>
      ))}
    </Card>
  );
}

// Mask last octet of an IPv4 address so coaches see location precision
// without exposing full IP. e.g. 203.0.113.45 → 203.0.113.*
function maskIp(ip) {
  if (!ip) return '';
  const clean = ip.replace(/^::ffff:/, '');
  const parts = clean.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
  return clean;
}

// ═══ Check-ins ═════════════════════════════════════════════════════════
// Shows each check-in as a rich card reflecting exactly what the client
// submitted in CheckinForm: the three progress photos, every measurement
// they entered, and every question/answer they filled in.
const CHECKIN_QUESTIONS = [
  'How do you feel / overall well being',
  'What has been your biggest challenge this week?',
  'What is your biggest win this week?',
  'Any concerns with the program?',
  'Anything else?',
];

function CheckinsTab({ data }) {
  if (!data.checkins.length) return <EmptyCard text="No check-ins yet" />;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {data.checkins.map(c => (
        <CheckinCard
          key={c.id}
          c={c}
          clientName={data.client?.name}
          teamConversationId={data.team_conversation_id}
          onReplied={data._refetch}
        />
      ))}
    </div>
  );
}

function CheckinCard({ c, clientName, teamConversationId, onReplied }) {
  const { token } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyState, setReplyState] = useState({ sending: false, sent: false, error: null });
  let answers = {};
  try { answers = c.answers ? (typeof c.answers === 'string' ? JSON.parse(c.answers) : c.answers) : {}; }
  catch { answers = {}; }

  // Pre-fill the reply with a compact context line so the coach doesn't
  // have to restate what they're responding to. The coach can edit/delete
  // this quote line freely before sending.
  const openReply = () => {
    const bits = [formatDate(c.date)];
    if (c.weight != null) bits.push(`${c.weight}kg`);
    const feel = (answers[0] || '').trim();
    const feelShort = feel ? (feel.length > 80 ? feel.slice(0, 80) + '...' : feel) : '';
    const header = `📋 Re: Check-in · ${bits.join(' · ')}${feelShort ? `\n"${feelShort}"` : ''}\n\n`;
    setReplyDraft(header);
    setReplyOpen(true);
    setReplyState({ sending: false, sent: false, error: null });
  };

  const sendReply = async () => {
    if (!replyDraft.trim() || !teamConversationId) return;
    setReplyState({ sending: true, sent: false, error: null });
    try {
      const res = await fetch(`/api/messages/conversations/${teamConversationId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyDraft.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setReplyState({ sending: false, sent: false, error: d.error || 'Failed to send' });
        return;
      }
      setReplyState({ sending: false, sent: true, error: null });
      setReplyDraft('');
      setTimeout(() => { setReplyOpen(false); setReplyState({ sending: false, sent: false, error: null }); }, 1400);
      onReplied?.();
    } catch {
      setReplyState({ sending: false, sent: false, error: 'Network error' });
    }
  };

  const measurements = [
    { key: 'weight', label: 'Weight', val: c.weight, unit: 'kg' },
    { key: 'body_fat', label: 'Body fat', val: c.body_fat, unit: '%' },
    { key: 'waist', label: 'Waist', val: c.waist, unit: 'cm' },
    { key: 'sleep_hours', label: 'Sleep', val: c.sleep_hours, unit: 'h' },
    { key: 'recovery_score', label: 'Recovery', val: c.recovery_score, unit: '' },
    { key: 'stress_level', label: 'Stress', val: c.stress_level, unit: '' },
  ];
  const photos = [
    { key: 'front', url: c.photo_front_url },
    { key: 'side', url: c.photo_side_url },
    { key: 'back', url: c.photo_back_url },
  ].filter(p => p.url);

  const hasAnswers = CHECKIN_QUESTIONS.some((_, i) => answers[i]?.trim?.());

  return (
    <Card>
      {/* Header: date */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--divider)',
      }}>
        <p style={{ fontSize: 14, fontWeight: 700 }}>{formatDate(c.date)}</p>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {photos.length > 0 && `${photos.length} photo${photos.length === 1 ? '' : 's'}`}
          {photos.length > 0 && hasAnswers && ' · '}
          {hasAnswers && 'Answers included'}
        </p>
      </div>

      {/* Photos */}
      {photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${photos.length}, 1fr)`, gap: 8, marginBottom: 14 }}>
          {photos.map(p => (
            <div key={p.key} style={{ aspectRatio: '3/4', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
              <img src={p.url} alt={p.key} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
                padding: '12px 8px 6px', textAlign: 'center',
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {p.key}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Measurements grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: hasAnswers ? 14 : 0 }}>
        {measurements.map(m => (
          <div key={m.key} style={{
            background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px',
          }}>
            <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {m.label}
            </p>
            <p style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
              {m.val != null ? `${m.val}${m.unit}` : <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>—</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Q&A (collapsible — can be long) */}
      {hasAnswers && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'none', border: 'none', color: 'var(--accent)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 0',
            }}
          >
            {expanded ? '▾ Hide answers' : '▸ Show answers'}
          </button>
          {expanded && (
            <div style={{ marginTop: 8, display: 'grid', gap: 12 }}>
              {CHECKIN_QUESTIONS.map((q, i) => (
                answers[i]?.trim?.() && (
                  <div key={i}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 4 }}>{q}</p>
                    <p style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{answers[i]}</p>
                  </div>
                )
              ))}
            </div>
          )}
        </>
      )}

      {/* Reply-to-check-in — posts into the client's team inbox so the
          whole coach team sees the response alongside the check-in context. */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
        {!replyOpen ? (
          <button
            onClick={openReply}
            disabled={!teamConversationId}
            title={!teamConversationId ? 'No team inbox set up yet' : 'Reply to this check-in'}
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 14px', fontSize: 12, fontWeight: 700,
              cursor: teamConversationId ? 'pointer' : 'default',
              opacity: teamConversationId ? 1 : 0.4,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            💬 Reply to {clientName?.split(' ')[0] || 'client'}
          </button>
        ) : (
          <div>
            <textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              placeholder="Write your reply — this goes straight into the team inbox."
              rows={6}
              autoFocus
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.08)', border: '1px solid var(--divider)',
                color: 'var(--text-primary)', fontSize: 13, resize: 'vertical',
                fontFamily: 'inherit', lineHeight: 1.5, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)', flex: 1, fontStyle: 'italic' }}>
                Sends to {clientName?.split(' ')[0] || 'the client'}'s shared team inbox.
              </p>
              {replyState.error && (
                <p style={{ fontSize: 11, color: '#ef4444' }}>{replyState.error}</p>
              )}
              {replyState.sent && (
                <p style={{ fontSize: 11, color: '#3DFFD2', fontWeight: 700 }}>✓ Sent</p>
              )}
              <button
                onClick={() => { setReplyOpen(false); setReplyDraft(''); setReplyState({ sending: false, sent: false, error: null }); }}
                disabled={replyState.sending}
                style={{
                  background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)',
                  border: 'none', borderRadius: 8, padding: '7px 14px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={sendReply}
                disabled={replyState.sending || replyState.sent || !replyDraft.trim()}
                style={{
                  background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '7px 16px', fontSize: 12, fontWeight: 700,
                  cursor: replyState.sending || !replyDraft.trim() ? 'default' : 'pointer',
                  opacity: replyState.sending || !replyDraft.trim() ? 0.5 : 1,
                }}
              >
                {replyState.sending ? 'Sending...' : 'Send reply'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ═══ Habits ════════════════════════════════════════════════════════════
function HabitsTab({ data }) {
  // Placeholder: show 7-day compliance rings derived from logs
  const workoutDays = uniqueDays(data.workoutLogs, 'date', 7);
  const nutritionDays = uniqueDays(data.nutritionTotals, 'date', 7);
  const waterDays = uniqueDays(data.waterTotals, 'date', 7);
  const stepDays = uniqueDays(data.stepTotals, 'date', 7);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card title="Weekly habits (last 7 days)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <Ring label="Workouts" pct={Math.round((workoutDays / 7) * 100)} color="#FF8C00" sub={`${workoutDays}/7`} />
          <Ring label="Nutrition" pct={Math.round((nutritionDays / 7) * 100)} color="#3DFFD2" sub={`${nutritionDays}/7`} />
          <Ring label="Water" pct={Math.round((waterDays / 7) * 100)} color="#38bdf8" sub={`${waterDays}/7`} />
          <Ring label="Steps" pct={Math.round((stepDays / 7) * 100)} color="#a78bfa" sub={`${stepDays}/7`} />
        </div>
      </Card>
      <HabitHistoryCard clientId={data.client?.id} />
    </div>
  );
}

function HabitHistoryCard({ clientId }) {
  const { token } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/notifications/habits/${clientId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { entries: [] })
      .then(d => { setEntries(d.entries || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [clientId, token]);

  if (loading) return <EmptyCard text="Loading habit history..." />;

  if (entries.length === 0) {
    return (
      <Card title="Daily check-ins">
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          No daily check-ins yet. Schedule a daily_checkin notification from Notifications to start collecting sleep, alcohol, and meditation data.
        </p>
      </Card>
    );
  }

  const recent = entries.slice(0, 7);
  const avg = (key) => {
    const vals = recent.map(e => e[key]).filter(v => v != null);
    if (vals.length === 0) return '—';
    const n = vals.reduce((s, v) => s + v, 0) / vals.length;
    return Number.isInteger(n) ? n : n.toFixed(1);
  };

  return (
    <Card title="Daily check-ins">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        <HabitStat label="Avg sleep" value={avg('sleep_hours')} suffix="h" />
        <HabitStat label="Avg alcohol" value={avg('alcohol_units')} suffix="u" />
        <HabitStat label="Avg meditation" value={avg('meditation_minutes')} suffix="m" />
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {entries.slice(0, 14).map(e => (
          <div key={e.date} style={{
            display: 'grid', gridTemplateColumns: '90px repeat(3, 1fr) 2fr', gap: 10, alignItems: 'center',
            padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)',
          }}>
            <p style={{ fontSize: 12, fontWeight: 700 }}>
              {new Date(e.date).toLocaleDateString('en-IE', { weekday: 'short', day: '2-digit', month: 'short' })}
            </p>
            <HabitCell value={e.sleep_hours} suffix="h" />
            <HabitCell value={e.alcohol_units} suffix="u" />
            <HabitCell value={e.meditation_minutes} suffix="m" />
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {e.notes || ''}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function HabitStat({ label, value, suffix }) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 4px', background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>
        {value}<span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 2 }}>{value !== '—' ? suffix : ''}</span>
      </p>
    </div>
  );
}

function HabitCell({ value, suffix }) {
  if (value == null) {
    return <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>—</p>;
  }
  return (
    <p style={{ fontSize: 13, fontWeight: 600 }}>
      {value}<span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 2 }}>{suffix}</span>
    </p>
  );
}

// ═══ Workout ═══════════════════════════════════════════════════════════
function WorkoutTab({ data }) {
  const { token } = useAuth();
  const clientId = data.client?.id;
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingWorkout, setEditingWorkout] = useState(null); // { id, title }

  // Pull the client's assigned workouts for the current week + upcoming.
  // Uses the existing coach week endpoint which returns template workouts
  // from enrolled programs plus any ad-hoc user_scheduled_workouts rows.
  useEffect(() => {
    if (!clientId) return;
    const today = new Date();
    const mondayOffset = (today.getDay() + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - mondayOffset);
    const start = monday.toISOString().split('T')[0];

    (async () => {
      const res = await fetch(`/api/coach/schedules/${clientId}/week?start=${start}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      // Flatten { date: [workouts] } into a list with date attached
      const rows = [];
      Object.entries(d.week || {}).forEach(([date, list]) => {
        (list || []).forEach(w => rows.push({ ...w, date }));
      });
      // Dedupe by workout_id so we don't show the same template twice if it repeats
      const seen = new Set();
      const unique = [];
      rows.forEach(r => {
        const id = r.workout_id || r.id;
        if (seen.has(id)) return;
        seen.add(id);
        unique.push({ ...r, _id: id });
      });
      setAssigned(unique);
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [clientId, token]);

  if (editingWorkout) {
    // Reuse the main WorkoutBuilder in personalise mode so coaches get the
    // full block editor (supersets, AMRAP, EMOM, warmup, per-block sets/rest,
    // tempo, tracking_type, etc.) when customising for a single client.
    // WorkoutBuilder handles loading template + existing override and saves
    // to the override endpoint when overrideClientId is set.
    return (
      <WorkoutBuilder
        overrideClientId={clientId}
        overrideClientName={data.client?.name}
        initialWorkoutId={editingWorkout.id}
        onExitPersonalise={() => setEditingWorkout(null)}
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card title="Assigned workouts (this week)">
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 8 }}>Loading...</p>
        ) : assigned.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 8, fontStyle: 'italic' }}>
            No workouts scheduled this week. Assign a program from Schedules to populate.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {assigned.map(w => (
              <div
                key={w._id + w.date}
                onClick={() => setEditingWorkout({ id: w._id, title: w.title || `Workout #${w._id}` })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  background: 'rgba(255,255,255,0.04)', borderRadius: 8, cursor: 'pointer',
                  borderLeft: w.has_override ? '3px solid var(--accent-mint)' : '3px solid var(--accent)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{w.title || `Workout #${w._id}`}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {formatDate(w.date)} · {w.duration_mins ? `${w.duration_mins} min` : 'no duration'}
                    {w.source === 'program' && ' · From program'}
                  </p>
                </div>
                <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>Personalise →</span>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic', marginTop: 10 }}>
          Tap a workout to personalise it for this client. Changes only affect this client's version.
        </p>
      </Card>

      {/* Workout logs history — keep the old table below the assigned list */}
      {data.workoutLogs.length > 0 && (
        <Card title={`${data.workoutLogs.length} completed workouts (last 30 days)`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  <th style={{ padding: '8px 4px' }}>Date</th>
                  <th style={{ padding: '8px 4px' }}>Workout</th>
                  <th style={{ padding: '8px 4px' }}>Duration</th>
                  <th style={{ padding: '8px 4px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.workoutLogs.map(w => {
                  // Delta between prescribed and actual. Only show when both
                  // are known AND the client customized their session.
                  const hasDelta = w.customized && w.prescribed_duration_mins && w.duration_mins && w.prescribed_duration_mins !== w.duration_mins;
                  return (
                    <tr key={w.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 4px' }}>{formatDate(w.date)}</td>
                      <td style={{ padding: '10px 4px' }}>{w.workout_title || `Workout #${w.workout_id || w.id}`}</td>
                      <td style={{ padding: '10px 4px', whiteSpace: 'nowrap' }}>
                        {w.duration_mins ? `${w.duration_mins} min` : '—'}
                        {hasDelta && (
                          <span
                            title={`Coach prescribed ${w.prescribed_duration_mins} min. Client did ${w.duration_mins} min.`}
                            style={{
                              marginLeft: 6, fontSize: 10, fontWeight: 700,
                              padding: '2px 6px', borderRadius: 4,
                              background: 'rgba(10,132,255,0.15)', color: '#0A84FF',
                              textTransform: 'uppercase', letterSpacing: 0.3,
                            }}
                          >
                            Adjusted (was {w.prescribed_duration_mins})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 4px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                          background: w.completed ? 'rgba(61,255,210,0.15)' : 'rgba(148,163,184,0.15)',
                          color: w.completed ? '#3DFFD2' : '#94a3b8',
                        }}>
                          {w.completed ? 'COMPLETED' : 'INCOMPLETE'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}


// ═══ Nutrition ═════════════════════════════════════════════════════════
function NutritionTab({ data }) {
  const target = data.client.calorie_target;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SupplementsEditor clientId={data.client.id} />
      {data.nutritionTotals.length === 0 ? (
        <EmptyCard text="No nutrition logs yet" />
      ) : (
        <Card title="Nutrition (last 30 days)">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  <th style={{ padding: '8px 4px' }}>Date</th>
                  <th style={{ padding: '8px 4px' }}>Calories</th>
                  <th style={{ padding: '8px 4px' }}>P</th>
                  <th style={{ padding: '8px 4px' }}>F</th>
                  <th style={{ padding: '8px 4px' }}>C</th>
                  <th style={{ padding: '8px 4px' }}>vs target</th>
                </tr>
              </thead>
              <tbody>
                {data.nutritionTotals.map(n => {
                  const diff = target ? n.calories - target : null;
                  return (
                    <tr key={n.date} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 4px' }}>{formatDate(n.date)}</td>
                      <td style={{ padding: '10px 4px' }}>{Math.round(n.calories)}</td>
                      <td style={{ padding: '10px 4px' }}>{Math.round(n.protein)}g</td>
                      <td style={{ padding: '10px 4px' }}>{Math.round(n.fat)}g</td>
                      <td style={{ padding: '10px 4px' }}>{Math.round(n.carbs)}g</td>
                      <td style={{ padding: '10px 4px', color: diff == null ? 'var(--text-tertiary)' : diff > 0 ? '#f59e0b' : '#3DFFD2' }}>
                        {diff == null ? '—' : diff > 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

const DAY_SHORT = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const EMPTY_FORM = {
  name: '', dose: '', section: 'Upon Waking', section_order: 1,
  timing: '', rationale: '', notes: '',
  is_conditional: false, conditional_trigger: '', double_on_days: [],
};

function SupplementsEditor({ clientId }) {
  const { token } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // row being edited, or { isNew: true, ... }

  const fetchList = async () => {
    setLoading(true);
    const res = await fetch(`/api/coach/clients/${clientId}/supplements`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setList((await res.json()).supplements || []);
    setLoading(false);
  };

  useEffect(() => { if (clientId && token) fetchList(); }, [clientId, token]);

  const save = async (form) => {
    const isNew = !form.id;
    const url = isNew
      ? `/api/coach/clients/${clientId}/supplements`
      : `/api/coach/supplements/${form.id}`;
    const method = isNew ? 'POST' : 'PATCH';
    await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        section_order: Number(form.section_order) || 0,
      }),
    });
    setEditing(null);
    fetchList();
  };

  const del = async (id) => {
    if (!window.confirm('Delete this supplement?')) return;
    await fetch(`/api/coach/supplements/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchList();
  };

  // Group by section for display
  const grouped = {};
  for (const s of list) {
    const key = s.section || 'Supplements';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }
  const sectionEntries = Object.entries(grouped).sort(
    (a, b) => (a[1][0]?.section_order ?? 999) - (b[1][0]?.section_order ?? 999)
  );

  return (
    <Card
      title="Supplements"
      action={
        !editing && (
          <button
            onClick={() => setEditing({ ...EMPTY_FORM, isNew: true })}
            style={{
              padding: '6px 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
              background: 'var(--accent-mint)', color: '#000', fontSize: 11, fontWeight: 800,
            }}
          >+ Add</button>
        )
      }
    >
      {editing ? (
        <SupplementForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading...</div>
      ) : list.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
          No supplements yet. Click + Add to build the client's stack.
        </div>
      ) : sectionEntries.map(([section, items]) => (
        <div key={section} style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
            {section}
          </p>
          {items.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderRadius: 10, background: 'rgba(255,255,255,0.03)', marginBottom: 6,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700 }}>
                  {s.name}
                  {s.is_conditional ? (
                    <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 6, background: 'rgba(142,142,147,0.15)', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                      as needed
                    </span>
                  ) : null}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {[s.dose, s.timing, Array.isArray(s.double_on_days) && s.double_on_days.length ? `2x: ${s.double_on_days.map(d => d.slice(0,3)).join(', ')}` : null]
                    .filter(Boolean).join(' · ')}
                </p>
              </div>
              <button onClick={() => setEditing({ ...s, double_on_days: s.double_on_days || [] })} style={editBtnStyle}>Edit</button>
              <button onClick={() => del(s.id)} style={{ ...editBtnStyle, color: '#FF5E5E' }}>Delete</button>
            </div>
          ))}
        </div>
      ))}
    </Card>
  );
}

const editBtnStyle = {
  padding: '4px 10px', borderRadius: 12, border: 'none', cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
  fontSize: 11, fontWeight: 700,
};

function SupplementForm({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const toggleDay = (day) => {
    const next = new Set(form.double_on_days || []);
    if (next.has(day)) next.delete(day); else next.add(day);
    set('double_on_days', Array.from(next));
  };

  return (
    <div style={{ display: 'grid', gap: 10, padding: 8 }}>
      <Field label="Name">
        <input value={form.name} onChange={e => set('name', e.target.value)} style={suppInputStyle} placeholder="e.g. Creatine Monohydrate" />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Dose">
          <input value={form.dose || ''} onChange={e => set('dose', e.target.value)} style={suppInputStyle} placeholder="5g" />
        </Field>
        <Field label="Timing / instructions">
          <input value={form.timing || ''} onChange={e => set('timing', e.target.value)} style={suppInputStyle} placeholder="with food" />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        <Field label="Section">
          <input value={form.section || ''} onChange={e => set('section', e.target.value)} style={suppInputStyle} placeholder="Upon Waking / After Breakfast / Before Bed" />
        </Field>
        <Field label="Order">
          <input type="number" value={form.section_order ?? 0} onChange={e => set('section_order', e.target.value)} style={suppInputStyle} />
        </Field>
      </div>
      <Field label="Rationale (internal)">
        <input value={form.rationale || ''} onChange={e => set('rationale', e.target.value)} style={suppInputStyle} placeholder="e.g. tendon_synthesis" />
      </Field>
      <Field label="Notes shown to client">
        <input value={form.notes || ''} onChange={e => set('notes', e.target.value)} style={suppInputStyle} placeholder="e.g. take with 50mg Vitamin C" />
      </Field>
      <Field label="Double dose on days">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DAY_SHORT.map(d => {
            const active = (form.double_on_days || []).includes(d);
            return (
              <button type="button" key={d} onClick={() => toggleDay(d)} style={{
                padding: '6px 10px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                textTransform: 'capitalize',
                background: active ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                color: active ? '#fff' : 'var(--text-secondary)',
              }}>{d.slice(0, 3)}</button>
            );
          })}
        </div>
      </Field>
      <Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!form.is_conditional} onChange={e => set('is_conditional', e.target.checked)} />
          Conditional (only take when trigger condition is met)
        </label>
      </Field>
      {form.is_conditional && (
        <Field label="Conditional trigger">
          <input value={form.conditional_trigger || ''} onChange={e => set('conditional_trigger', e.target.value)} style={suppInputStyle} placeholder="e.g. post-late-night" />
        </Field>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={() => onSave(form)} disabled={!form.name?.trim()} style={{
          flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700,
          opacity: form.name?.trim() ? 1 : 0.5,
        }}>{form.isNew ? 'Add' : 'Save'}</button>
        <button onClick={onCancel} style={{
          padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700,
        }}>Cancel</button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      {label && <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' }}>{label}</label>}
      {children}
    </div>
  );
}

const suppInputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)',
  color: 'var(--text-primary)', fontSize: 13,
};

// ═══ Levels (client's benchmark progression seen by coach) ═══════════════
const LEVEL_CATEGORY_COLORS = {
  BURN: '#FF453A', LIFT: '#FF8C00', MOVE: '#85FFBA',
  FLEX: '#5AC8FA', NUTRITION: '#34C759', SLEEP: '#AF52DE',
};
const LEVEL_COLORS = {
  0: '#94a3b8', 1: '#fb7185', 2: '#fb923c',
  3: '#facc15', 4: '#22c55e', 5: '#8b5cf6',
};
const LEVEL_UNIT_FMT = {
  seconds: v => { const n = +v; const m = Math.floor(n / 60); const s = Math.round(n % 60); return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`; },
  kg: v => `${v}kg`, reps: v => `${v} reps`, watts: v => `${v}W`, cal: v => `${v} cal`, m: v => `${v}m`,
};
const lvlFmt = (unit, v) => (LEVEL_UNIT_FMT[unit] || (x => String(x)))(v);

function LevelsTab({ clientId }) {
  const { token } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`/api/benchmarks/coach/clients/${clientId}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(setData);
  }, [clientId, token]);

  if (!data) return <EmptyCard text="Loading benchmarks..." />;

  const am = data.ageless_mover;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Headline: Ageless Mover rank */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(255,140,0,0.25), rgba(255,69,58,0.15))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          }}>🏅</div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: 0.8, textTransform: 'uppercase' }}>
              Ageless Mover
            </p>
            <p style={{ fontSize: 22, fontWeight: 900, marginTop: 2 }}>
              {am.points} <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 600 }}>pts</span>
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {am.tested_count} test{am.tested_count === 1 ? '' : 's'} completed
              {am.rank != null && ` · ranked #${am.rank} of ${am.total_athletes}`}
            </p>
          </div>
        </div>
      </Card>

      {/* Category breakdown */}
      {data.categories.map(cat => {
        const color = LEVEL_CATEGORY_COLORS[cat.category] || 'var(--accent)';
        return (
          <Card key={cat.category}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <h3 style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color }}>{cat.category}</h3>
              <div style={{ flex: 1, height: 1, background: color, opacity: 0.2 }} />
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Avg Lv {cat.avg_level} · {cat.tested_count}/{cat.total_count} tested
              </span>
            </div>
            {cat.benchmarks.map(b => {
              const lv = b.current_level || 0;
              const pct = (lv / 5) * 100;
              const levelColor = LEVEL_COLORS[lv] || LEVEL_COLORS[0];
              return (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: `${color}20`, color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, flexShrink: 0,
                  }}>{b.icon || '⭐'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.name}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      <div style={{ flex: 1, maxWidth: 120, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: levelColor }} />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 800, color: levelColor, minWidth: 42 }}>
                        LV {lv}/5
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 100 }}>
                    {b.best_value != null ? (
                      <>
                        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                          {lvlFmt(b.unit, b.best_value)}
                        </p>
                        {b.last_submitted_at && (
                          <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                            {new Date(b.last_submitted_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}
                          </p>
                        )}
                      </>
                    ) : (
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Not tested</p>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        );
      })}
    </div>
  );
}

// ═══ Gallery ═══════════════════════════════════════════════════════════
// Two modes: "All" shows every progress photo in a grid; "Compare" picks
// the earliest and latest photo of each pose so the coach can see progress
// at a glance. Compare mode is the FitBudd-style "Weekly Check-in Jul 15
// vs Weekly Check-in Nov 18" side-by-side.
function GalleryTab({ data }) {
  const [mode, setMode] = useState('compare');

  // Index photos by pose with their date
  const poses = ['front', 'side', 'back'];
  const byPose = Object.fromEntries(poses.map(p => [p, []]));
  data.checkins.forEach(c => {
    poses.forEach(p => {
      const url = c[`photo_${p}_url`];
      if (url) byPose[p].push({ url, date: c.date, id: `${c.id}-${p}` });
    });
  });
  // Sort ascending so [0] is earliest and [-1] is latest
  poses.forEach(p => byPose[p].sort((a, b) => a.date.localeCompare(b.date)));

  const totalPhotos = Object.values(byPose).reduce((s, arr) => s + arr.length, 0);
  if (!totalPhotos) return <EmptyCard text="No progress photos uploaded yet" />;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6 }}>
        {['compare', 'all'].map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '7px 14px', borderRadius: 18, border: 'none', cursor: 'pointer',
              background: mode === m ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
              color: mode === m ? '#000' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
            }}
          >{m === 'compare' ? 'Compare (first vs latest)' : 'All photos'}</button>
        ))}
      </div>

      {mode === 'compare' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          {poses.map(pose => {
            const list = byPose[pose];
            if (list.length === 0) return null;
            const first = list[0];
            const latest = list[list.length - 1];
            const same = list.length === 1;
            return (
              <Card key={pose} title={`${pose.charAt(0).toUpperCase() + pose.slice(1)} · ${same ? '1 photo' : `${list.length} photos`}`}>
                {same ? (
                  <div style={{ textAlign: 'center' }}>
                    <ComparePhoto url={first.url} date={first.date} label="Only photo" pose={pose} />
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, fontStyle: 'italic' }}>
                      Need a second photo to compare.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <ComparePhoto url={first.url} date={first.date} label="First" pose={pose} />
                    <ComparePhoto url={latest.url} date={latest.date} label="Latest" pose={pose} />
                  </div>
                )}
                {!same && (
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, textAlign: 'center' }}>
                    {Math.floor((new Date(latest.date) - new Date(first.date)) / 86400000)} days between photos
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {poses.flatMap(pose => byPose[pose].map(p => (
            <div key={p.id} style={{
              aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden',
              border: '1px solid var(--divider)', position: 'relative',
            }}>
              <img src={p.url} alt={pose} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
                padding: '20px 8px 6px',
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>{pose}</p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)' }}>{formatDate(p.date)}</p>
              </div>
            </div>
          )))}
        </div>
      )}
    </div>
  );
}

function ComparePhoto({ url, date, label, pose }) {
  return (
    <div style={{
      aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden',
      border: '1px solid var(--divider)', position: 'relative', background: '#000',
    }}>
      <img src={url} alt={`${pose} ${label}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{
        position: 'absolute', top: 6, left: 6,
        background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '3px 8px', borderRadius: 6,
        fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        {label}
      </div>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
        padding: '20px 8px 6px',
      }}>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{formatDate(date)}</p>
      </div>
    </div>
  );
}

// ═══ Notes ═════════════════════════════════════════════════════════════
function NotesTab({ clientId, notes, onChange }) {
  const { token } = useAuth();
  const [draft, setDraft] = useState({ title: '', content: '', is_private: false });
  const [showAdd, setShowAdd] = useState(false);

  const addNote = async () => {
    if (!draft.title.trim() || !draft.content.trim()) return;
    await fetch(`/api/coach/clients/${clientId}/notes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    setDraft({ title: '', content: '', is_private: false });
    setShowAdd(false);
    onChange();
  };

  const deleteNote = async (id) => {
    if (!window.confirm('Delete this note?')) return;
    await fetch(`/api/coach/notes/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    onChange();
  };

  const togglePin = async (note) => {
    await fetch(`/api/coach/notes/${note.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_pinned: !note.is_pinned }),
    });
    onChange();
  };

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 760 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{notes.length} note{notes.length === 1 ? '' : 's'}</p>
        <button onClick={() => setShowAdd(!showAdd)} style={{
          background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>+ New note</button>
      </div>

      {showAdd && (
        <Card>
          <input
            placeholder="Title (e.g. Goal, Injuries)"
            value={draft.title}
            onChange={e => setDraft({ ...draft, title: e.target.value })}
            style={inputStyle}
          />
          <textarea
            placeholder="Note content"
            value={draft.content}
            onChange={e => setDraft({ ...draft, content: e.target.value })}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={draft.is_private} onChange={e => setDraft({ ...draft, is_private: e.target.checked })} />
              Private (coach only)
            </label>
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowAdd(false)} style={secondaryBtn}>Cancel</button>
            <button onClick={addNote} style={primaryBtn}>Save</button>
          </div>
        </Card>
      )}

      {notes.length === 0 && !showAdd && <EmptyCard text="No notes yet. Click + New note to add one." />}

      {notes.map(n => (
        <Card key={n.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <p style={{ fontSize: 14, fontWeight: 700 }}>{n.title}</p>
                {n.is_pinned ? <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 800 }}>PINNED</span> : null}
                {n.is_private ? <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 800 }}>PRIVATE</span> : null}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                {formatDate(n.created_at)}{n.coach_name ? ` · ${n.coach_name}` : ''}
              </p>
              <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{n.content}</p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => togglePin(n)} title={n.is_pinned ? 'Unpin' : 'Pin'} style={iconBtn}>
                {n.is_pinned ? '📌' : '📍'}
              </button>
              <button onClick={() => deleteNote(n.id)} title="Delete" style={iconBtn}>🗑</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ═══ Calendar ═══════════════════════════════════════════════════════════
function CalendarTab({ clientId }) {
  const { token } = useAuth();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [data, setData] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    fetch(`/api/coach/clients/${clientId}/calendar?month=${month}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(setData);
  }, [clientId, month, token]);

  if (!data) return <EmptyCard text="Loading calendar..." />;

  // Bucket events by date so the grid can render counts per day
  const byDate = {};
  data.workouts.forEach(w => {
    (byDate[w.scheduled_date] ||= { workouts: [], bookings: [], checkins: [], logged: false })
      .workouts.push(w);
  });
  data.bookings.forEach(b => {
    const d = b.scheduled_at.slice(0, 10);
    (byDate[d] ||= { workouts: [], bookings: [], checkins: [], logged: false }).bookings.push(b);
  });
  data.checkins.forEach(c => {
    (byDate[c.date] ||= { workouts: [], bookings: [], checkins: [], logged: false }).checkins.push(c);
  });
  data.completedLogDates.forEach(d => {
    (byDate[d] ||= { workouts: [], bookings: [], checkins: [], logged: false }).logged = true;
  });

  const [y, m] = month.split('-').map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // Monday-first week so Mon..Sun columns align with how coaches plan
  const firstWeekday = (firstOfMonth.getUTCDay() + 6) % 7;

  const monthLabel = firstOfMonth.toLocaleDateString('en-IE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const todayIso = new Date().toISOString().slice(0, 10);

  const shiftMonth = (delta) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
    setSelectedDay(null);
  };

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    cells.push({ d, iso, bucket: byDate[iso] });
  }
  while (cells.length % 7) cells.push(null);

  const selectedBucket = selectedDay ? byDate[selectedDay] : null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={() => shiftMonth(-1)} style={iconBtn}>‹</button>
          <h3 style={{ fontSize: 15, fontWeight: 700, flex: 1, textAlign: 'center' }}>{monthLabel}</h3>
          <button onClick={() => shiftMonth(1)} style={iconBtn}>›</button>
          <button
            onClick={() => { setMonth(new Date().toISOString().slice(0, 7)); setSelectedDay(null); }}
            style={{ ...iconBtn, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}
          >Today</button>
        </div>

        {/* Weekday header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <p key={d} style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 }}>{d}</p>
          ))}
        </div>

        {/* Day grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((cell, i) => {
            if (!cell) return <div key={i} />;
            const isToday = cell.iso === todayIso;
            const isSelected = selectedDay === cell.iso;
            const b = cell.bucket;
            const hasAny = b && (b.workouts.length || b.bookings.length || b.checkins.length || b.logged);
            return (
              <button
                key={cell.iso}
                onClick={() => setSelectedDay(isSelected ? null : cell.iso)}
                style={{
                  aspectRatio: '1/1', padding: 4, borderRadius: 8,
                  background: isSelected ? 'rgba(255,140,0,0.12)'
                    : hasAny ? 'rgba(255,255,255,0.03)' : 'transparent',
                  border: isToday ? '1px solid var(--accent)' : '1px solid transparent',
                  color: 'var(--text-primary)', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 2,
                  fontFamily: 'inherit',
                }}
              >
                <p style={{
                  fontSize: 12, fontWeight: isToday ? 800 : 500,
                  color: isToday ? 'var(--accent)' : 'var(--text-primary)',
                  textAlign: 'left',
                }}>{cell.d}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 'auto' }}>
                  {b?.workouts.map((w, j) => (
                    <span key={'w'+j} title={w.title} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: w.completed || b.logged ? '#3DFFD2' : '#FF8C00',
                    }} />
                  ))}
                  {b?.bookings.map((bk, j) => (
                    <span key={'b'+j} title={bk.session_name} style={{
                      width: 6, height: 6, borderRadius: '50%', background: '#a78bfa',
                    }} />
                  ))}
                  {b?.checkins.map((c, j) => (
                    <span key={'c'+j} title="Check-in" style={{
                      width: 6, height: 6, borderRadius: '50%', background: '#38bdf8',
                    }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 10, color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
          <LegendDot color="#FF8C00" label="Scheduled workout" />
          <LegendDot color="#3DFFD2" label="Completed" />
          <LegendDot color="#a78bfa" label="Booking" />
          <LegendDot color="#38bdf8" label="Check-in" />
        </div>
      </Card>

      {/* Selected day detail */}
      {selectedDay && (
        <Card title={new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
          {!selectedBucket ? (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Nothing scheduled.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {selectedBucket.workouts.map(w => (
                <EventRow key={'w'+w.id}
                  color="#FF8C00"
                  label={w.title || `Workout #${w.workout_id}`}
                  sub={w.completed || selectedBucket.logged ? 'Completed' : 'Scheduled'}
                  done={w.completed || selectedBucket.logged}
                />
              ))}
              {selectedBucket.bookings.map(b => (
                <EventRow key={'b'+b.id}
                  color="#a78bfa"
                  label={b.session_name || 'Booking'}
                  sub={`${new Date(b.scheduled_at).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })} · ${b.duration_minutes}min · ${b.status}`}
                />
              ))}
              {selectedBucket.checkins.map(c => (
                <EventRow key={'c'+c.id} color="#38bdf8" label="Check-in submitted" sub="View in Check-ins tab" />
              ))}
              {!selectedBucket.workouts.length && !selectedBucket.bookings.length && !selectedBucket.checkins.length && (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Nothing scheduled on this day.</p>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
}

function EventRow({ color, label, sub, done }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: 8,
      background: 'rgba(255,255,255,0.03)',
    }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
          {label}
        </p>
        {sub && <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{sub}</p>}
      </div>
    </div>
  );
}
function SettingsTab({ data }) {
  return (
    <div style={{ maxWidth: 600, display: 'grid', gap: 16 }}>
      <Card title="Client settings">
        <Row label="Email" value={data.client.email} />
        <Row label="Timezone" value="—" />
        <Row label="Check-ins enabled" value="Yes" />
        <Row label="Workout intensity" value="Use coach default" />
      </Card>

      <TierEditorCard client={data.client} onChange={data._refetch} />
      <AccountLifecycleCard client={data.client} onChange={data._refetch} />
      <ResetPasswordCard client={data.client} />

      {/* Recent logins moved here from the rail — useful context but too
          noisy to show alongside every tab. */}
      <RecentLoginsCard logins={data.recentLogins || []} />
    </div>
  );
}

// Change the client's account status: active / paused / archived.
// Active = normal relationship. Paused = on-hold banner (missed payment, break).
// Archived = coaching ended, hidden from main client list.
function AccountLifecycleCard({ client, onChange }) {
  const { token } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(null); // target status string
  const [note, setNote] = useState('');

  const current = client.status || 'active';

  const STATUSES = [
    { value: 'active', label: 'Active', desc: 'Normal coaching relationship.', color: 'var(--accent-mint)' },
    { value: 'paused', label: 'Paused', desc: 'On hold — missed payment, break, etc. Client sees a banner.', color: 'var(--accent)' },
    { value: 'archived', label: 'Archived', desc: 'Coaching ended. Hidden from your main client list; data preserved.', color: '#FF5E5E' },
  ];

  const apply = async (targetStatus) => {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/coach/clients/${client.id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: targetStatus, note: note.trim() || null }),
    });
    setSaving(false);
    setConfirming(null);
    setNote('');
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Failed to update status');
      return;
    }
    onChange?.();
  };

  return (
    <Card title="Account lifecycle">
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Current status:{' '}
        <span style={{
          padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 800,
          background: STATUSES.find(s => s.value === current)?.color + '22',
          color: STATUSES.find(s => s.value === current)?.color,
        }}>
          {current.toUpperCase()}
        </span>
      </p>

      <div style={{ display: 'grid', gap: 8 }}>
        {STATUSES.filter(s => s.value !== current).map((s) => (
          <button
            key={s.value}
            onClick={() => setConfirming(s.value)}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(255,255,255,0.04)', border: '1px solid var(--divider)',
              color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700 }}>Move to {s.label}</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {confirming && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 8,
          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--divider)',
        }}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            Confirm: move {client.name?.split(' ')[0] || 'client'} to {confirming}?
          </p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (shown on the client's banner)"
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 6,
              background: 'rgba(255,255,255,0.08)', border: '1px solid var(--divider)',
              color: 'var(--text-primary)', fontSize: 12, outline: 'none', marginBottom: 10,
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setConfirming(null); setNote(''); }}
              disabled={saving}
              style={{
                background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)',
                border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12,
                fontWeight: 600, cursor: 'pointer',
              }}
            >Cancel</button>
            <button
              onClick={() => apply(confirming)}
              disabled={saving}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
                padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                opacity: saving ? 0.5 : 1,
              }}
            >{saving ? 'Saving...' : 'Confirm'}</button>
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: 11, color: '#FF5E5E', marginTop: 8 }}>{error}</p>}
    </Card>
  );
}

// Coach-initiated password reset. Generates a one-time URL; until SMTP
// is wired, the URL is returned to the coach to forward manually.
// See project_pre_launch_checklist.md.
function ResetPasswordCard({ client }) {
  const { token } = useAuth();
  const [state, setState] = useState({ loading: false, url: null, expires: null, error: null });

  const generate = async () => {
    setState({ loading: true, url: null, expires: null, error: null });
    const res = await fetch(`/api/coach/clients/${client.id}/reset-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await res.json();
    if (!res.ok) {
      setState({ loading: false, url: null, expires: null, error: d.error || 'Failed' });
      return;
    }
    setState({ loading: false, url: d.reset_url, expires: d.expires_at, error: null });
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(state.url); } catch { /* ignore */ }
  };

  return (
    <Card title="Reset password">
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Generate a one-time reset link for {client.name?.split(' ')[0] || 'this client'}. Valid for 1 hour.
      </p>
      {!state.url ? (
        <button
          onClick={generate}
          disabled={state.loading}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            opacity: state.loading ? 0.5 : 1,
          }}
        >{state.loading ? 'Generating...' : 'Generate reset link'}</button>
      ) : (
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>
            Send this link to the client. Expires {new Date(state.expires).toLocaleString()}.
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              readOnly
              value={state.url}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 6,
                background: 'rgba(255,255,255,0.08)', border: '1px solid var(--divider)',
                color: 'var(--text-primary)', fontSize: 11, outline: 'none',
                fontFamily: 'monospace',
              }}
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={copy}
              style={{
                background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)',
                border: 'none', borderRadius: 6, padding: '0 14px', fontSize: 12,
                fontWeight: 600, cursor: 'pointer',
              }}
            >Copy</button>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 8, fontStyle: 'italic' }}>
            SMTP not configured yet — forward this URL manually for now.
          </p>
        </div>
      )}
      {state.error && <p style={{ fontSize: 11, color: '#FF5E5E', marginTop: 8 }}>{state.error}</p>}
    </Card>
  );
}

// ─── Shared UI ──────────────────────────────────────────────────────────
function Card({ title, action, children }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12, padding: 16,
      border: '1px solid var(--divider)',
    }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          {title && <p style={{ fontSize: 13, fontWeight: 700 }}>{title}</p>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function EmptyCard({ text }) {
  return (
    <Card>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '20px 4px', textAlign: 'center' }}>{text}</p>
    </Card>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', gap: 16 }}>
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 13, textAlign: 'right', flex: 1 }}>{value || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</span>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Ring({ label, pct, color, sub }) {
  const pctClamped = Math.max(0, Math.min(100, pct || 0));
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: 80, height: 80, margin: '0 auto 8px', borderRadius: '50%',
        background: `conic-gradient(${color} ${pctClamped}%, rgba(255,255,255,0.06) ${pctClamped}%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%', background: 'var(--bg-card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <p style={{ fontSize: 15, fontWeight: 800 }}>{pctClamped}%</p>
        </div>
      </div>
      <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{sub}</p>
    </div>
  );
}

function TierPill({ tier }) {
  const colors = {
    Free: { bg: 'rgba(148,163,184,0.18)', fg: '#94a3b8' },
    Starter: { bg: 'rgba(56,189,248,0.18)', fg: '#38bdf8' },
    Prime: { bg: 'rgba(255,140,0,0.18)', fg: '#FF8C00' },
    Elite: { bg: 'rgba(236,72,153,0.18)', fg: '#ec4899' },
  }[tier] || { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
      background: colors.bg, color: colors.fg, textTransform: 'uppercase', letterSpacing: 0.4,
    }}>{tier}</span>
  );
}

function StatusPill({ atRisk }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
      background: atRisk ? 'rgba(239,68,68,0.15)' : 'rgba(61,255,210,0.15)',
      color: atRisk ? '#ef4444' : '#3DFFD2', textTransform: 'uppercase', letterSpacing: 0.4,
    }}>{atRisk ? 'AT RISK' : 'ON TRACK'}</span>
  );
}

function MembershipPill({ planTitle, nextRenewalAt }) {
  if (!planTitle && !nextRenewalAt) return null;
  let label = planTitle || 'Member';
  let bg = 'rgba(61,255,210,0.15)', fg = '#3DFFD2';
  if (nextRenewalAt) {
    const days = Math.floor((new Date(nextRenewalAt) - new Date()) / 86400000);
    if (days < 0)     { label = 'Overdue · renew';       bg = 'rgba(239,68,68,0.15)'; fg = '#ef4444'; }
    else if (days === 0) { label = 'Renews today';        bg = 'rgba(245,158,11,0.18)'; fg = '#f59e0b'; }
    else if (days <= 7)  { label = `Renews in ${days}d`;  bg = 'rgba(245,158,11,0.18)'; fg = '#f59e0b'; }
    else                 { label = `Renews ${new Date(nextRenewalAt).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}`; }
  }
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
      background: bg, color: fg, textTransform: 'uppercase', letterSpacing: 0.4,
    }} title={planTitle || ''}>{label}</span>
  );
}

// Tag editor — chip list + inline add-tag input. Tags are coach-applied
// context markers (e.g. "Boston", "AMS", "Performer"). Fires through to
// /api/coach/clients/:id/tags, which is idempotent on (client_id, label).
function ClientTags({ clientId, tags }) {
  const { token } = useAuth();
  const [list, setList] = useState(tags);
  const [draft, setDraft] = useState('');

  useEffect(() => setList(tags), [tags]);

  const add = async () => {
    const v = draft.trim();
    if (!v) return;
    await fetch(`/api/coach/clients/${clientId}/tags`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: v }),
    });
    // Optimistic refresh — re-fetch just the tags via profile endpoint
    const p = await fetch(`/api/coach/clients/${clientId}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());
    setList(p.tags || []);
    setDraft('');
  };

  const remove = async (tag) => {
    await fetch(`/api/coach/clients/${clientId}/tags/${tag.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setList(list.filter(t => t.id !== tag.id));
  };

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        {list.map(tag => (
          <span key={tag.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
            padding: '4px 8px', borderRadius: 6,
            background: 'rgba(255,140,0,0.12)', color: 'var(--accent)',
          }}>
            {tag.label}
            <button onClick={() => remove(tag)} style={{
              background: 'none', border: 'none', color: 'var(--accent)',
              cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, opacity: 0.7,
            }} title="Remove">×</button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="+ Add tag"
          style={{
            border: '1px dashed var(--divider)', background: 'transparent',
            color: 'var(--text-primary)', fontSize: 11, padding: '4px 8px', borderRadius: 6,
            minWidth: 110, outline: 'none',
          }}
        />
      </div>
    </Card>
  );
}

// Weekly trends card — last 7 days of workouts / nutrition logs / water.
// Shows compliance % in FitBudd's chunky number-over-label style.
function WeeklyTrendsCard({ data }) {
  const workoutDays = uniqueDays(data.workoutLogs.filter(w => w.completed), 'date', 7);
  const nutritionDays = uniqueDays(data.nutritionTotals, 'date', 7);
  const waterDays = uniqueDays(data.waterTotals, 'date', 7);

  // Target cals/water from client profile — used to pluralize the label
  const target = data.client;
  const latestNutrition = data.nutritionTotals.find(n => n.date) || {};
  const latestWater = data.waterTotals.find(w => w.date) || {};

  return (
    <Card title={`Weekly trends · last 7 days`}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <TrendCell
          label="Workouts"
          top={`${workoutDays}`}
          bottom="days logged"
          pct={Math.round((workoutDays / 7) * 100)}
          color="#FF8C00"
        />
        <TrendCell
          label="Nutrition"
          top={latestNutrition.calories ? `${Math.round(latestNutrition.calories)}` : '—'}
          bottom={target.calorie_target ? `of ${target.calorie_target} cals` : 'latest log'}
          pct={Math.round((nutritionDays / 7) * 100)}
          color="#3DFFD2"
        />
        <TrendCell
          label="Water"
          top={latestWater.ml ? `${latestWater.ml}` : '—'}
          bottom={target.water_target ? `of ${target.water_target} ml` : 'latest log'}
          pct={Math.round((waterDays / 7) * 100)}
          color="#38bdf8"
        />
      </div>
    </Card>
  );
}

function TrendCell({ label, top, bottom, pct, color }) {
  const pctClamped = Math.max(0, Math.min(100, pct || 0));
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12 }}>
      <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {label}
      </p>
      <p style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{top}</p>
      <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{bottom}</p>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{ width: `${pctClamped}%`, height: '100%', background: color }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>{pctClamped}%</span>
      </div>
    </div>
  );
}

// Measurements with earliest→latest deltas. For weight/body-fat/waist a
// downward delta reads as improvement (green); for sleep/recovery upward
// is better. Shows a "—" when there aren't two data points yet.
function MeasurementsCard({ trends, latestCheckin }) {
  const rows = [
    { key: 'weight', label: 'Weight', unit: 'kg', downIsGood: true },
    { key: 'body_fat', label: 'Body fat', unit: '%', downIsGood: true },
    { key: 'waist', label: 'Waist', unit: 'cm', downIsGood: true },
    { key: 'sleep_hours', label: 'Sleep', unit: 'h', downIsGood: false },
    { key: 'recovery_score', label: 'Recovery', unit: '', downIsGood: false },
    { key: 'stress_level', label: 'Stress', unit: '', downIsGood: true },
  ].filter(r => trends[r.key] != null || latestCheckin?.[r.key] != null);

  if (!rows.length) return null;

  return (
    <Card title="Measurements">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {rows.map(r => {
          const t = trends[r.key];
          const latest = t?.latest ?? latestCheckin?.[r.key];
          const delta = t?.delta ?? 0;
          const months = t?.months ?? 0;
          const improved = r.downIsGood ? delta < 0 : delta > 0;
          const arrow = delta === 0 || months === 0 ? '·' : (delta > 0 ? '↑' : '↓');
          const deltaColor = delta === 0 || months === 0 ? 'var(--text-tertiary)'
            : improved ? '#3DFFD2' : '#ef4444';
          return (
            <div key={r.key} style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10,
            }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {r.label}
              </p>
              <p style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>
                {latest != null ? `${latest}${r.unit}` : '—'}
              </p>
              {months > 0 && (
                <p style={{ fontSize: 10, color: deltaColor, fontWeight: 600, marginTop: 2 }}>
                  {arrow} {Math.abs(delta).toFixed(delta % 1 === 0 ? 0 : 1)}{r.unit} in {months}mo
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'rgba(0,0,0,0.25)', border: '1px solid var(--divider)',
  color: 'var(--text-primary)', fontSize: 13, marginBottom: 8, fontFamily: 'inherit',
};
const primaryBtn = {
  background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
  padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
const secondaryBtn = {
  background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', border: 'none', borderRadius: 8,
  padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
const iconBtn = {
  background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', border: 'none', borderRadius: 6,
  padding: 6, fontSize: 14, cursor: 'pointer', minWidth: 30,
};

// ─── Utilities ──────────────────────────────────────────────────────────
function daysSince(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
function formatDate(s) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatRelative(s) {
  if (!s) return 'never';
  const days = daysSince(s);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return formatDate(s);
}
function uniqueDays(rows, key, windowDays) {
  const cutoff = Date.now() - windowDays * 86400000;
  const set = new Set();
  rows.forEach(r => {
    const d = r[key];
    if (d && new Date(d).getTime() >= cutoff) set.add(d);
  });
  return set.size;
}
function computeAdherence(data) {
  const workoutDays = uniqueDays(data.workoutLogs.filter(w => w.completed), 'date', 7);
  const checkinDays = uniqueDays(data.checkins, 'date', 7);
  const nutritionDays = uniqueDays(data.nutritionTotals, 'date', 7);
  return {
    workouts: Math.round((workoutDays / 7) * 100),
    checkins: Math.round((checkinDays / 7) * 100),
    nutrition: Math.round((nutritionDays / 7) * 100),
    workoutDays, checkinDays, nutritionDays,
  };
}
