import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

const PLATFORM_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'web', label: 'Web' },
  { value: 'android', label: 'Android' },
  { value: 'ios', label: 'iOS' },
];

const BILLING_TYPES = [
  { value: 'one_time', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const ACTION_TYPES = [
  { value: 'set_tier', label: 'Set tier', desc: 'Grant the buyer access to a tier' },
  { value: 'enroll_program', label: 'Enrol in program', desc: 'Auto-enrol in a program' },
  { value: 'send_message', label: 'Send message', desc: 'DM from coach to client' },
  { value: 'add_to_group', label: 'Add to group', desc: 'Join a group conversation' },
  { value: 'notify_coach', label: 'Notify coach', desc: 'In-app notification to client\'s coach' },
  { value: 'schedule_checkin', label: 'Schedule check-in', desc: 'Reminder N days later' },
];

const emptyForm = () => ({
  slug: '',
  name: '',
  description: '',
  image_url: '',
  platform: 'all',
  hidden: false,
  billing_type: 'one_time',
  price_cents: 0,
  free_trial_days: 0,
  tier_id: null,
  stripe_price_id: '',
  apple_iap_product_id: '',
  sort_order: 0,
  active: true,
});

const slugify = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);

export default function PaymentPlansManager() {
  const { token } = useAuth();
  const auth = { Authorization: `Bearer ${token}` };
  const json = { 'Content-Type': 'application/json', ...auth };

  const [plans, setPlans] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [groups, setGroups] = useState([]);
  const [editing, setEditing] = useState(null); // plan object | 'new' | null
  const [form, setForm] = useState(emptyForm());
  const [automations, setAutomations] = useState([]);
  const [saving, setSaving] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    fetchAll();
    fetch('/api/content/tiers', { headers: auth })
      .then((r) => (r.ok ? r.json() : { tiers: [] }))
      .then((d) => setTiers(d.tiers || []))
      .catch(() => {});
    fetch('/api/content/programs', { headers: auth })
      .then((r) => (r.ok ? r.json() : { programs: [] }))
      .then((d) => setPrograms(d.programs || []))
      .catch(() => {});
    fetch('/api/messages/conversations?type=group', { headers: auth })
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d) => setGroups((d.conversations || []).filter((c) => c.type === 'group')))
      .catch(() => {});
  }, []);

  const fetchAll = async () => {
    const res = await fetch('/api/plans/admin', { headers: auth });
    const d = await res.json();
    setPlans(d.plans || []);
  };

  const openNew = () => {
    setEditing('new');
    setForm(emptyForm());
    setAutomations([]);
    setLinkCopied(false);
  };

  const openEdit = async (p) => {
    setEditing(p);
    setForm({
      slug: p.slug,
      name: p.name,
      description: p.description || '',
      image_url: p.image_url || '',
      platform: p.platform,
      hidden: !!p.hidden,
      billing_type: p.billing_type,
      price_cents: p.price_cents,
      free_trial_days: p.free_trial_days,
      tier_id: p.tier_id,
      stripe_price_id: p.stripe_price_id || '',
      apple_iap_product_id: p.apple_iap_product_id || '',
      sort_order: p.sort_order,
      active: !!p.active,
    });
    setLinkCopied(false);
    const res = await fetch(`/api/plans/admin/${p.id}/automations`, { headers: auth });
    const d = await res.json();
    setAutomations(
      (d.automations || []).map((a) => ({
        action_type: a.action_type,
        action_config: a.action_config || {},
      })),
    );
  };

  const save = async () => {
    if (!form.name.trim() || !form.slug.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      price_cents: Number(form.price_cents) || 0,
      free_trial_days: Number(form.free_trial_days) || 0,
      sort_order: Number(form.sort_order) || 0,
      tier_id: form.tier_id || null,
      stripe_price_id: form.stripe_price_id || null,
      apple_iap_product_id: form.apple_iap_product_id || null,
      image_url: form.image_url || null,
      description: form.description || null,
    };
    const isNew = editing === 'new';
    const url = isNew ? '/api/plans/admin' : `/api/plans/admin/${editing.id}`;
    const method = isNew ? 'POST' : 'PATCH';
    const res = await fetch(url, { method, headers: json, body: JSON.stringify(payload) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Save failed');
      setSaving(false);
      return;
    }
    const { plan } = await res.json();

    // Replace automations chain
    await fetch(`/api/plans/admin/${plan.id}/automations`, {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ automations }),
    });

    setSaving(false);
    setEditing(plan);
    fetchAll();
  };

  const remove = async () => {
    if (editing === 'new' || !editing) return;
    if (!confirm(`Delete "${editing.name}"? Plans with purchases will be deactivated rather than removed.`)) return;
    await fetch(`/api/plans/admin/${editing.id}`, { method: 'DELETE', headers: auth });
    setEditing(null);
    fetchAll();
  };

  const toggleActive = async (p) => {
    await fetch(`/api/plans/admin/${p.id}`, {
      method: 'PATCH', headers: json,
      body: JSON.stringify({ active: !p.active }),
    });
    fetchAll();
  };

  const copyShareLink = () => {
    if (editing === 'new' || !editing) return;
    const link = `${window.location.origin}/plans/${editing.slug}`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const moveAutomation = (idx, dir) => {
    const next = [...automations];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setAutomations(next);
  };

  const addAutomation = (type) => {
    setAutomations([...automations, { action_type: type, action_config: defaultConfigFor(type) }]);
  };

  const removeAutomation = (idx) => {
    setAutomations(automations.filter((_, i) => i !== idx));
  };

  const updateAutomationConfig = (idx, patch) => {
    const next = [...automations];
    next[idx] = { ...next[idx], action_config: { ...next[idx].action_config, ...patch } };
    setAutomations(next);
  };

  return (
    <div style={{ padding: '24px 40px', display: 'grid', gridTemplateColumns: editing ? '1fr 560px' : '1fr', gap: 24 }}>
      {/* LIST */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800 }}>Packages</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              {plans.length} plan{plans.length !== 1 ? 's' : ''} · sets what clients see in onboarding + Stripe / IAP routing
            </p>
          </div>
          <button onClick={openNew} style={primaryBtn}>+ New Plan</button>
        </div>

        {plans.length === 0 ? (
          <EmptyHint />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {plans.map((p) => (
              <PlanRow
                key={p.id}
                plan={p}
                selected={editing?.id === p.id}
                onClick={() => openEdit(p)}
                onToggleActive={(e) => { e.stopPropagation(); toggleActive(p); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* EDITOR */}
      {editing && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, alignSelf: 'start', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>{editing === 'new' ? 'New plan' : 'Edit plan'}</h2>
            <button onClick={() => setEditing(null)} style={closeBtn}>✕</button>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({ ...f, name, slug: editing === 'new' && !f.slug ? slugify(name) : f.slug }));
                }}
                placeholder="Ageless Movement Membership - Weekly"
                style={inputStyle}
              />
            </Field>

            <Field label="Slug" hint="Used in /plans/<slug> share links. Lowercase, hyphens.">
              <input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                placeholder="membership-weekly-web"
                style={inputStyle}
              />
            </Field>

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </Field>

            <Field label="Image URL (optional)">
              <input
                value={form.image_url}
                onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                placeholder="/uploads/..."
                style={inputStyle}
              />
            </Field>

            <Field label="Platform" hint="Where this plan appears. Same product can have a Web/Android plan + iOS twin marked up 30% for IAP.">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PLATFORM_CHIPS.map((p) => (
                  <Chip
                    key={p.value}
                    active={form.platform === p.value}
                    onClick={() => setForm((f) => ({ ...f, platform: p.value }))}
                  >{p.label}</Chip>
                ))}
              </div>
            </Field>

            <Field label="Billing">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <select value={form.billing_type} onChange={(e) => setForm((f) => ({ ...f, billing_type: e.target.value }))} style={inputStyle}>
                  {BILLING_TYPES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
                <PriceInput
                  cents={form.price_cents}
                  onChange={(cents) => setForm((f) => ({ ...f, price_cents: cents }))}
                />
              </div>
            </Field>

            {form.billing_type !== 'one_time' && (
              <Field label="Free trial days">
                <input
                  type="number" min="0" max="90"
                  value={form.free_trial_days}
                  onChange={(e) => setForm((f) => ({ ...f, free_trial_days: Number(e.target.value) || 0 }))}
                  style={{ ...inputStyle, width: 120 }}
                />
              </Field>
            )}

            <Field label="Tier granted on purchase">
              <select
                value={form.tier_id || ''}
                onChange={(e) => setForm((f) => ({ ...f, tier_id: Number(e.target.value) || null }))}
                style={inputStyle}
              >
                <option value="">No tier change</option>
                {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Hidden">
                <Toggle
                  checked={form.hidden}
                  onChange={(v) => setForm((f) => ({ ...f, hidden: v }))}
                  label={form.hidden ? 'Share-link only' : 'Listed publicly'}
                />
              </Field>
              <Field label="Active">
                <Toggle
                  checked={form.active}
                  onChange={(v) => setForm((f) => ({ ...f, active: v }))}
                  label={form.active ? 'On sale' : 'Paused'}
                />
              </Field>
            </div>

            {form.hidden && editing !== 'new' && (
              <button onClick={copyShareLink} style={{ ...secondaryBtn, justifySelf: 'start' }}>
                {linkCopied ? '✓ Copied' : '🔗 Copy share link'}
              </button>
            )}

            <details style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
              <summary style={{ fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Payment provider IDs (set when wired)
              </summary>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                <Field label="Stripe price ID">
                  <input
                    value={form.stripe_price_id}
                    onChange={(e) => setForm((f) => ({ ...f, stripe_price_id: e.target.value }))}
                    placeholder="price_..."
                    style={inputStyle}
                  />
                </Field>
                <Field label="Apple IAP product ID">
                  <input
                    value={form.apple_iap_product_id}
                    onChange={(e) => setForm((f) => ({ ...f, apple_iap_product_id: e.target.value }))}
                    placeholder="com.agelessmovement.weekly"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Sort order">
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
                    style={{ ...inputStyle, width: 120 }}
                  />
                </Field>
              </div>
            </details>

            {/* AUTOMATIONS */}
            <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 16, marginTop: 4 }}>
              <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Automation chain</p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                Steps run in order on every successful purchase.
              </p>

              {automations.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic', marginBottom: 12 }}>
                  No automations yet. Add your first step below.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                  {automations.map((a, idx) => (
                    <AutomationStep
                      key={idx}
                      step={a}
                      idx={idx}
                      total={automations.length}
                      tiers={tiers}
                      programs={programs}
                      groups={groups}
                      onChange={(patch) => updateAutomationConfig(idx, patch)}
                      onMove={(dir) => moveAutomation(idx, dir)}
                      onRemove={() => removeAutomation(idx)}
                    />
                  ))}
                </div>
              )}

              <AutomationPicker onPick={addAutomation} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6 }}>
              {editing !== 'new' ? (
                <button onClick={remove} style={dangerBtn}>Delete</button>
              ) : <div />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setEditing(null)} style={secondaryBtn}>Cancel</button>
                <button
                  onClick={save}
                  disabled={saving || !form.name.trim() || !form.slug.trim()}
                  style={{ ...primaryBtn, opacity: saving || !form.name.trim() || !form.slug.trim() ? 0.5 : 1 }}
                >{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Sub-components
// =====================================================================

function PlanRow({ plan, selected, onClick, onToggleActive }) {
  const price = plan.price_cents === 0 ? 'Free' : formatPrice(plan.price_cents, plan.currency);
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
        display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 14, alignItems: 'center',
        border: selected ? '2px solid var(--accent)' : '2px solid transparent',
        opacity: plan.active ? 1 : 0.55,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <PlatformBadge platform={plan.platform} />
          {plan.hidden ? <SmallTag color="#94a3b8">Hidden</SmallTag> : null}
          {plan.tier_id ? <SmallTag color="#FF8C00">Tier {plan.tier_id}</SmallTag> : null}
        </div>
        <p style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.name}</p>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{plan.slug}</p>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
        {plan.billing_type !== 'one_time' ? plan.billing_type : 'one-off'}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>{price}</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
        {plan.free_trial_days > 0 ? `${plan.free_trial_days}d free` : '-'}
      </div>
      <button onClick={onToggleActive} style={{
        background: plan.active ? 'rgba(48,209,88,0.15)' : 'rgba(148,163,184,0.15)',
        color: plan.active ? '#30D158' : '#94a3b8',
        border: 'none', borderRadius: 8, padding: '6px 12px',
        fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
      }}>{plan.active ? 'Pause' : 'Resume'}</button>
    </div>
  );
}

function PlatformBadge({ platform }) {
  const colors = { all: '#94a3b8', web: '#38bdf8', android: '#30D158', ios: '#FF8C00' };
  const c = colors[platform] || '#94a3b8';
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
      background: c + '22', color: c, textTransform: 'uppercase', letterSpacing: 0.4,
    }}>{platform === 'all' ? 'All' : platform}</span>
  );
}

function SmallTag({ color, children }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
      background: color + '22', color, textTransform: 'uppercase', letterSpacing: 0.4,
    }}>{children}</span>
  );
}

function EmptyHint() {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 40, textAlign: 'center' }}>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>No plans yet.</p>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
        Start with a Free tier, then add a low-ticket entry and your subscription cycles.
      </p>
    </div>
  );
}

function AutomationStep({ step, idx, total, tiers, programs, groups, onChange, onMove, onRemove }) {
  const meta = ACTION_TYPES.find((a) => a.value === step.action_type);
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
          background: 'rgba(255,140,0,0.2)', color: 'var(--accent)',
        }}>STEP {idx + 1}</span>
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{meta?.label || step.action_type}</span>
        <button onClick={() => onMove(-1)} disabled={idx === 0} style={iconBtn(idx === 0)}>↑</button>
        <button onClick={() => onMove(1)} disabled={idx === total - 1} style={iconBtn(idx === total - 1)}>↓</button>
        <button onClick={onRemove} style={{ ...iconBtn(false), color: '#FF5E5E' }}>✕</button>
      </div>
      <ActionConfigForm
        type={step.action_type}
        config={step.action_config || {}}
        tiers={tiers}
        programs={programs}
        groups={groups}
        onChange={onChange}
      />
    </div>
  );
}

function ActionConfigForm({ type, config, tiers, programs, groups, onChange }) {
  if (type === 'set_tier') {
    return (
      <select value={config.tier_id || ''} onChange={(e) => onChange({ tier_id: Number(e.target.value) || null })} style={inputStyle}>
        <option value="">Select tier…</option>
        {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    );
  }
  if (type === 'enroll_program') {
    return (
      <select value={config.program_id || ''} onChange={(e) => onChange({ program_id: Number(e.target.value) || null })} style={inputStyle}>
        <option value="">Select program…</option>
        {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select>
    );
  }
  if (type === 'send_message') {
    return (
      <textarea
        value={config.body || ''}
        onChange={(e) => onChange({ body: e.target.value })}
        rows={3}
        placeholder="Welcome message from coach. Sent in their direct chat."
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
      />
    );
  }
  if (type === 'add_to_group') {
    return (
      <select value={config.conversation_id || ''} onChange={(e) => onChange({ conversation_id: Number(e.target.value) || null })} style={inputStyle}>
        <option value="">Select group…</option>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.title || `Group #${g.id}`}</option>)}
      </select>
    );
  }
  if (type === 'notify_coach') {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <input
          value={config.title || ''}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Notification title"
          style={inputStyle}
        />
        <textarea
          value={config.body || ''}
          onChange={(e) => onChange({ body: e.target.value })}
          rows={2}
          placeholder="Optional body"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>
    );
  }
  if (type === 'schedule_checkin') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Days from purchase:</span>
        <input
          type="number" min="1" max="365"
          value={config.days_from_now ?? 7}
          onChange={(e) => onChange({ days_from_now: Number(e.target.value) || 1 })}
          style={{ ...inputStyle, width: 100 }}
        />
      </div>
    );
  }
  return null;
}

function AutomationPicker({ onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ ...secondaryBtn, fontSize: 13 }}>+ Add automation step</button>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>Pick an action</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {ACTION_TYPES.map((a) => (
              <button
                key={a.value}
                onClick={() => { onPick(a.value); setOpen(false); }}
                style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--divider)',
                  borderRadius: 8, padding: '8px 12px', textAlign: 'left', cursor: 'pointer',
                  color: 'var(--text-primary)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>{a.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{a.desc}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setOpen(false)} style={{ ...secondaryBtn, marginTop: 8, fontSize: 12 }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function PriceInput({ cents, onChange }) {
  const [str, setStr] = useState((cents / 100).toFixed(2));
  useEffect(() => { setStr((cents / 100).toFixed(2)); }, [cents]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>USD</span>
      <input
        type="number" step="0.01" min="0"
        value={str}
        onChange={(e) => setStr(e.target.value)}
        onBlur={() => onChange(Math.round(Number(str || 0) * 100))}
        style={{ ...inputStyle, width: '100%' }}
      />
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</p>
      {children}
      {hint && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 16, border: 'none',
      background: active ? 'var(--accent-mint)' : 'var(--bg-primary)',
      color: active ? '#000' : 'var(--text-primary)',
      fontSize: 12, fontWeight: 700, cursor: 'pointer',
    }}>{children}</button>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button onClick={() => onChange(!checked)} style={{
      display: 'flex', alignItems: 'center', gap: 10, background: 'transparent',
      border: '1px solid var(--divider)', borderRadius: 10, padding: '6px 12px',
      cursor: 'pointer', color: 'var(--text-primary)',
    }}>
      <span style={{
        width: 30, height: 18, borderRadius: 10, position: 'relative',
        background: checked ? 'var(--accent)' : 'rgba(148,163,184,0.3)',
        transition: 'background 0.15s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: checked ? 14 : 2,
          width: 14, height: 14, borderRadius: '50%', background: '#fff',
          transition: 'left 0.15s',
        }} />
      </span>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

function defaultConfigFor(type) {
  switch (type) {
    case 'schedule_checkin': return { days_from_now: 7 };
    case 'notify_coach': return { title: '', body: '' };
    case 'send_message': return { body: '' };
    default: return {};
  }
}

function formatPrice(cents, currency = 'USD') {
  const dollars = cents / 100;
  return `$${dollars.toFixed(dollars >= 100 ? 0 : 2)}`;
}

// =====================================================================
// Style helpers
// =====================================================================

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--divider)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
};

const primaryBtn = {
  background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
  padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
};

const secondaryBtn = {
  background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)',
  border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const dangerBtn = {
  background: 'none', border: 'none', color: '#FF5E5E', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const closeBtn = {
  background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 20, cursor: 'pointer',
};

function iconBtn(disabled) {
  return {
    background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6,
    width: 26, height: 26, fontSize: 12, fontWeight: 700,
    color: 'var(--text-primary)', cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.3 : 1,
  };
}
