import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

const KIND_OPTIONS = [
  { value: 'announcement', label: 'Announcement', desc: 'General news / update' },
  { value: 'offer', label: 'Offer', desc: 'Promo or discount' },
  { value: 'challenge', label: 'Challenge', desc: 'New challenge launch' },
  { value: 'daily_checkin', label: 'Daily check-in', desc: 'Sleep / alcohol / meditation popup' },
  { value: 'custom', label: 'Custom', desc: 'Blank slate' },
];

const KIND_COLORS = {
  announcement: '#38bdf8',
  offer: '#FF9500',
  challenge: '#BF5AF2',
  daily_checkin: '#30D158',
  custom: '#94a3b8',
};

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'One-off' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Weekly (same day as start date)' },
];

const emptyForm = () => ({
  kind: 'announcement',
  title: '',
  body: '',
  cta_label: '',
  cta_url: '',
  audience: 'all',
  audience_tier_id: null,
  starts_at: '',
  ends_at: '',
  recurrence: 'none',
  active: 1,
});

export default function NotificationManager() {
  const { token } = useAuth();
  const [list, setList] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [editing, setEditing] = useState(null); // object or 'new'
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAll();
    fetch('/api/content/tiers', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { tiers: [] })
      .then(d => setTiers(d.tiers || []))
      .catch(() => {});
  }, []);

  const fetchAll = async () => {
    const res = await fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } });
    const d = await res.json();
    setList(d.notifications || []);
  };

  const openNew = () => {
    setEditing('new');
    setForm(emptyForm());
  };

  const openEdit = (n) => {
    setEditing(n);
    setForm({
      kind: n.kind,
      title: n.title || '',
      body: n.body || '',
      cta_label: n.cta_label || '',
      cta_url: n.cta_url || '',
      audience: n.audience,
      audience_tier_id: n.audience_tier_id,
      starts_at: n.starts_at ? n.starts_at.replace(' ', 'T').slice(0, 16) : '',
      ends_at: n.ends_at ? n.ends_at.replace(' ', 'T').slice(0, 16) : '',
      recurrence: n.recurrence,
      active: n.active,
    });
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      starts_at: form.starts_at ? form.starts_at.replace('T', ' ') + ':00' : null,
      ends_at: form.ends_at ? form.ends_at.replace('T', ' ') + ':00' : null,
    };
    const isNew = editing === 'new';
    const url = isNew ? '/api/notifications' : `/api/notifications/${editing.id}`;
    const method = isNew ? 'POST' : 'PATCH';
    await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    setEditing(null);
    fetchAll();
  };

  const remove = async () => {
    if (editing === 'new' || !editing) return;
    if (!confirm('Delete this notification?')) return;
    await fetch(`/api/notifications/${editing.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setEditing(null);
    fetchAll();
  };

  const toggleActive = async (n) => {
    await fetch(`/api/notifications/${n.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: n.active ? 0 : 1 }),
    });
    fetchAll();
  };

  const statusOf = (n) => {
    const now = new Date();
    const s = n.starts_at ? new Date(n.starts_at) : null;
    const e = n.ends_at ? new Date(n.ends_at) : null;
    if (!n.active) return { label: 'Paused', color: '#94a3b8' };
    if (s && now < s) return { label: 'Upcoming', color: '#38bdf8' };
    if (e && now > e) return { label: 'Expired', color: '#FF5E5E' };
    return { label: 'Live', color: '#30D158' };
  };

  return (
    <div style={{ padding: '24px 40px', display: 'grid', gridTemplateColumns: editing ? '1fr 520px' : '1fr', gap: 24 }}>
      {/* LIST */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800 }}>Notifications</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              {list.length} notification{list.length !== 1 ? 's' : ''} · in-app popups clients see on Home
            </p>
          </div>
          <button onClick={openNew} style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
            padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>+ New Notification</button>
        </div>

        {list.length === 0 ? (
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 40, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>No notifications yet.</p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Create a daily check-in, an offer, or a challenge launch.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {list.map(n => {
              const status = statusOf(n);
              const kindColor = KIND_COLORS[n.kind] || '#94a3b8';
              return (
                <div
                  key={n.id}
                  onClick={() => openEdit(n)}
                  style={{
                    background: 'var(--bg-card)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
                    display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 14, alignItems: 'center',
                    border: editing?.id === n.id ? '2px solid var(--accent)' : '2px solid transparent',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                        background: kindColor + '22', color: kindColor,
                        textTransform: 'uppercase', letterSpacing: 0.4,
                      }}>{KIND_OPTIONS.find(k => k.value === n.kind)?.label || n.kind}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                        background: status.color + '22', color: status.color,
                        textTransform: 'uppercase', letterSpacing: 0.4,
                      }}>{status.label}</span>
                      {n.recurrence !== 'none' && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          · {n.recurrence}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</p>
                    {n.body && (
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</p>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {n.audience === 'all' ? 'All clients' : `Tier ${n.audience_tier_id || '?'}`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 10, whiteSpace: 'nowrap' }}>
                    <span>👀 {n.seen_count || 0}</span>
                    <span>✓ {n.completed_count || 0}</span>
                    <span>✗ {n.dismissed_count || 0}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleActive(n); }}
                    style={{
                      background: n.active ? 'rgba(48,209,88,0.15)' : 'rgba(148,163,184,0.15)',
                      color: n.active ? '#30D158' : '#94a3b8',
                      border: 'none', borderRadius: 8, padding: '6px 12px',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >{n.active ? 'Pause' : 'Resume'}</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* EDITOR */}
      {editing && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, alignSelf: 'start' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>{editing === 'new' ? 'New notification' : 'Edit notification'}</h2>
            <button
              onClick={() => setEditing(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 20, cursor: 'pointer' }}
            >✕</button>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <Field label="Kind">
              <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))} style={inputStyle}>
                {KIND_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label} - {k.desc}</option>)}
              </select>
            </Field>

            <Field label="Title">
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder={form.kind === 'daily_checkin' ? 'Your daily check-in' : 'What should the popup say?'}
                style={inputStyle}
              />
            </Field>

            <Field label={form.kind === 'daily_checkin' ? 'Intro copy (optional)' : 'Body'}>
              <textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder={form.kind === 'daily_checkin' ? 'How did you sleep? How was last night?' : 'The main message.'}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </Field>

            {form.kind !== 'daily_checkin' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                <Field label="CTA label">
                  <input
                    value={form.cta_label}
                    onChange={e => setForm(f => ({ ...f, cta_label: e.target.value }))}
                    placeholder="Learn more"
                    style={inputStyle}
                  />
                </Field>
                <Field label="CTA link">
                  <input
                    value={form.cta_url}
                    onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))}
                    placeholder="https://..."
                    style={inputStyle}
                  />
                </Field>
              </div>
            )}

            <Field label="Audience">
              <div style={{ display: 'flex', gap: 8 }}>
                <AudienceChip active={form.audience === 'all'} onClick={() => setForm(f => ({ ...f, audience: 'all', audience_tier_id: null }))}>All clients</AudienceChip>
                <AudienceChip active={form.audience === 'tier'} onClick={() => setForm(f => ({ ...f, audience: 'tier' }))}>Specific tier</AudienceChip>
              </div>
            </Field>

            {form.audience === 'tier' && (
              <Field label="Which tier">
                <select
                  value={form.audience_tier_id || ''}
                  onChange={e => setForm(f => ({ ...f, audience_tier_id: Number(e.target.value) || null }))}
                  style={inputStyle}
                >
                  <option value="">Select a tier…</option>
                  {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Starts">
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                  style={inputStyle}
                />
              </Field>
              <Field label="Ends">
                <input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label="Recurrence">
              <select value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))} style={inputStyle}>
                {RECURRENCE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>

            {form.kind === 'daily_checkin' && (
              <div style={{ background: 'rgba(48,209,88,0.08)', border: '1px solid rgba(48,209,88,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
                The popup auto-shows sleep / alcohol / meditation fields. Clients can skip any field. Usually paired with <b>Every day</b> recurrence.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6 }}>
              {editing !== 'new' ? (
                <button
                  onClick={remove}
                  style={{ background: 'none', border: 'none', color: '#FF5E5E', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >Delete</button>
              ) : <div />}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setEditing(null)}
                  style={{
                    background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)',
                    border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >Cancel</button>
                <button
                  onClick={save}
                  disabled={saving || !form.title.trim()}
                  style={{
                    background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
                    padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    opacity: saving || !form.title.trim() ? 0.5 : 1,
                  }}
                >{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--divider)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
};

function Field({ label, children }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</p>
      {children}
    </div>
  );
}

function AudienceChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', borderRadius: 16, border: 'none',
        background: active ? 'var(--accent-mint)' : 'var(--bg-primary)',
        color: active ? '#000' : 'var(--text-primary)',
        fontSize: 12, fontWeight: 700, cursor: 'pointer',
      }}
    >{children}</button>
  );
}
