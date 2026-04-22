import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../components/ImageUpload';

// Inline group editor panel. Opens in CoachWorkspace's right pane when the
// coach clicks "+ New Group" or the edit icon on a group row.
//
// group = null → create mode; group = {...} → edit mode.
// onSaved(group) called after successful create/update.
// onDeleted() called after successful delete.

const BLANK = {
  title: '',
  reference_name: '',
  description: '',
  image_url: '',
  icon: '👥',
  icon_bg: '#E8E8E8',
  visibility: 'active_clients',
  chat_enabled: true,
  cta_label: '',
  cta_url: '',
  mute_new_members: false,
  access_tier_ids: [],
};

const VISIBILITY_OPTIONS = [
  { value: 'all_clients', label: 'All clients', hint: 'Visible to every client in the app' },
  { value: 'active_clients', label: 'Active clients only', hint: 'Hidden from inactive / paused clients' },
  { value: 'specific_tiers', label: 'Specific tiers', hint: 'Only clients in the tiers you pick' },
  { value: 'invite_only', label: 'Invite only', hint: 'Only explicit members (manage after save)' },
];

export default function GroupEditor({ group, onSaved, onDeleted, onCancel }) {
  const { token } = useAuth();
  const [form, setForm] = useState(group ? hydrate(group) : BLANK);
  const [tiers, setTiers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const isEdit = !!group;

  useEffect(() => {
    setForm(group ? hydrate(group) : BLANK);
  }, [group?.id]);

  useEffect(() => {
    fetch('/api/content/tiers', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { tiers: [] })
      .then(d => setTiers(d.tiers || []))
      .catch(() => setTiers([]));
  }, [token]);

  const update = (patch) => setForm(f => ({ ...f, ...patch }));

  const toggleTier = (id) => {
    const has = form.access_tier_ids.includes(id);
    update({
      access_tier_ids: has
        ? form.access_tier_ids.filter(t => t !== id)
        : [...form.access_tier_ids, id],
    });
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = isEdit ? `/api/messages/groups/${group.id}` : '/api/messages/groups';
      const method = isEdit ? 'PATCH' : 'POST';
      const payload = {
        ...form,
        access_tier_ids: form.visibility === 'specific_tiers' ? form.access_tier_ids : [],
        cta_label: form.chat_enabled ? null : (form.cta_label || null),
        cta_url: form.chat_enabled ? null : (form.cta_url || null),
      };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      onSaved?.(data.group);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!confirm(`Delete "${group.title}"? This removes the group for everyone.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/messages/groups/${group.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      onDeleted?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 28px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>
          {isEdit ? 'Edit Group' : 'New Group'}
        </h2>
        <button onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>

      {/* Cover image + preview badge */}
      <Section label="Group Image" hint="Upload a branded badge (circular works best). Falls back to an emoji if empty.">
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <ImageUpload
            value={form.image_url}
            onChange={v => update({ image_url: v })}
            width={140} height={140}
            label={null}
          />
          <div style={{ flex: 1 }}>
            <label style={labelSm}>Fallback emoji</label>
            <input
              value={form.icon}
              onChange={e => update({ icon: e.target.value })}
              style={{ ...input, width: 70, textAlign: 'center', fontSize: 22 }}
              maxLength={4}
            />
            <label style={{ ...labelSm, marginTop: 12 }}>Fallback background</label>
            <input
              type="color"
              value={form.icon_bg || '#E8E8E8'}
              onChange={e => update({ icon_bg: e.target.value })}
              style={{ width: 70, height: 36, borderRadius: 8, border: '1px solid var(--divider)', background: 'none', cursor: 'pointer' }}
            />
          </div>
        </div>
      </Section>

      <Section label="Group Title">
        <input
          value={form.title}
          onChange={e => update({ title: e.target.value })}
          placeholder="e.g. Weekly Wins"
          style={input}
        />
      </Section>

      <Section label="Reference Name" hint="Internal slug. Not shown to clients.">
        <input
          value={form.reference_name || ''}
          onChange={e => update({ reference_name: e.target.value })}
          placeholder="weekly-wins"
          style={input}
        />
      </Section>

      <Section label="Description">
        <textarea
          value={form.description || ''}
          onChange={e => update({ description: e.target.value })}
          placeholder="Short description shown at the top of the group"
          rows={3}
          style={{ ...input, resize: 'vertical', minHeight: 72 }}
        />
      </Section>

      <Section label="Who can access">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {VISIBILITY_OPTIONS.map(opt => (
            <label key={opt.value} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10,
              borderRadius: 10, border: `1.5px solid ${form.visibility === opt.value ? 'var(--accent)' : 'var(--divider)'}`,
              background: form.visibility === opt.value ? 'rgba(255,140,0,0.06)' : 'transparent',
              cursor: 'pointer',
            }}>
              <input
                type="radio"
                checked={form.visibility === opt.value}
                onChange={() => update({ visibility: opt.value })}
                style={{ marginTop: 2 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{opt.hint}</div>
              </div>
            </label>
          ))}
        </div>

        {form.visibility === 'specific_tiers' && (
          <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-card)', borderRadius: 10 }}>
            <div style={{ ...labelSm, marginBottom: 8 }}>Pick tiers</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tiers.map(t => {
                const active = form.access_tier_ids.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTier(t.id)}
                    style={{
                      padding: '6px 12px', borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: active ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                      color: active ? '#000' : 'var(--text-secondary)',
                      fontSize: 12, fontWeight: 700,
                    }}
                  >
                    {t.name}
                  </button>
                );
              })}
              {tiers.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No tiers configured.</span>}
            </div>
          </div>
        )}
      </Section>

      <Section label="Chat settings">
        <Toggle
          label="Clients can post messages"
          hint="Turn off to make this a read-only announcement group."
          value={form.chat_enabled}
          onChange={v => update({ chat_enabled: v })}
        />
        {!form.chat_enabled && (
          <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-card)', borderRadius: 10 }}>
            <div style={{ ...labelSm, marginBottom: 4 }}>Call-to-action button label</div>
            <input
              value={form.cta_label || ''}
              onChange={e => update({ cta_label: e.target.value })}
              placeholder="e.g. Feedback Form"
              style={input}
            />
            <div style={{ ...labelSm, marginTop: 10, marginBottom: 4 }}>CTA URL</div>
            <input
              value={form.cta_url || ''}
              onChange={e => update({ cta_url: e.target.value })}
              placeholder="https://..."
              style={input}
            />
          </div>
        )}
        <div style={{ height: 10 }} />
        <Toggle
          label="Mute new members by default"
          hint="Clients joining won't get notified until they unmute."
          value={form.mute_new_members}
          onChange={v => update({ mute_new_members: v })}
        />
      </Section>

      {error && (
        <div style={{
          padding: 10, borderRadius: 8, background: 'rgba(255,59,48,0.1)',
          color: '#ff453a', fontSize: 13, marginBottom: 16,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 28 }}>
        {isEdit ? (
          <button onClick={handleDelete} disabled={saving} style={btnDanger}>Delete group</button>
        ) : <span />}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} disabled={saving} style={btnGhost}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving...' : (isEdit ? 'Save changes' : 'Create group')}
          </button>
        </div>
      </div>
    </div>
  );
}

function hydrate(g) {
  return {
    title: g.title || '',
    reference_name: g.reference_name || '',
    description: g.description || '',
    image_url: g.image_url || '',
    icon: g.icon || '👥',
    icon_bg: g.icon_bg || '#E8E8E8',
    visibility: g.visibility || 'invite_only',
    chat_enabled: g.chat_enabled !== false && g.chat_enabled !== 0,
    cta_label: g.cta_label || '',
    cta_url: g.cta_url || '',
    mute_new_members: g.mute_new_members === true || g.mute_new_members === 1,
    access_tier_ids: Array.isArray(g.access_tier_ids) ? g.access_tier_ids : [],
  };
}

function Section({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, hint, value, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
      borderRadius: 10, border: '1px solid var(--divider)', cursor: 'pointer',
      background: value ? 'rgba(255,140,0,0.04)' : 'transparent',
    }}>
      <input
        type="checkbox"
        checked={!!value}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{hint}</div>}
      </div>
    </label>
  );
}

const input = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  background: 'var(--bg-card)', border: '1px solid var(--divider)',
  color: 'var(--text-primary)', fontSize: 13,
};
const labelSm = { fontSize: 11, color: 'var(--text-secondary)', display: 'block', fontWeight: 600 };
const btnPrimary = {
  padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'var(--accent)', color: '#000', fontSize: 13, fontWeight: 700,
};
const btnGhost = {
  padding: '10px 16px', borderRadius: 10, border: '1px solid var(--divider)',
  background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnDanger = {
  padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,59,48,0.3)',
  background: 'rgba(255,59,48,0.08)', color: '#ff453a', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
