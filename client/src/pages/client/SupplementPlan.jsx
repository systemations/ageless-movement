import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const todayIso = () => new Date().toISOString().split('T')[0];
const SECTION_OPTIONS = ['Upon Waking', 'After Breakfast', 'Pre-Training', 'After Lunch', 'Before Bed', 'My Supplements'];

export default function SupplementPlan() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null); // supp being edited, or { isNew: true } for add
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/nutrition/supplements', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setData(await res.json());
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggle = async (supp, nextTaken) => {
    setBusyId(supp.id);
    setData(prev => prev && ({
      ...prev,
      sections: prev.sections.map(s => ({
        ...s,
        items: s.items.map(it => it.id === supp.id ? { ...it, taken: nextTaken } : it),
      })),
    }));
    try {
      if (nextTaken) {
        await fetch('/api/nutrition/supplements/log', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ supplement_id: supp.id, date: todayIso() }),
        });
      } else {
        await fetch(`/api/nutrition/supplements/log?supplement_id=${supp.id}&date=${todayIso()}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (err) {
      console.error(err);
      fetchData();
    }
    setBusyId(null);
  };

  const saveEdit = async (form) => {
    setSaving(true);
    try {
      if (form.isNew) {
        await fetch('/api/nutrition/supplements', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            dose: form.dose,
            section: form.section,
            section_order: form.section_order,
            timing: form.timing,
            notes: form.notes,
          }),
        });
      } else {
        await fetch(`/api/nutrition/supplements/${form.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dose: form.dose,
            ...(form.is_client_added ? {
              name: form.name,
              section: form.section,
              timing: form.timing,
              notes: form.notes,
            } : {}),
          }),
        });
      }
      await fetchData();
      setEditing(null);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const removeMine = async (supp) => {
    if (!window.confirm(`Remove ${supp.name}?`)) return;
    await fetch(`/api/nutrition/supplements/${supp.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setEditing(null);
    fetchData();
  };

  if (loading) {
    return <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}><div className="spinner" /></div>;
  }

  const sections = data?.sections || [];
  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const takenCount = sections.reduce((sum, s) => sum + s.items.filter(i => i.taken).length, 0);

  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => navigate(-1)} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>{data?.title || 'Supplements'}</h1>
      </div>

      {totalItems > 0 && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: 14, padding: '14px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Today</p>
            <p style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>
              {takenCount}<span style={{ fontSize: 14, color: 'var(--text-tertiary)', fontWeight: 600 }}> / {totalItems} taken</span>
            </p>
          </div>
          <div style={{ position: 'relative', width: 44, height: 44 }}>
            <svg width="44" height="44" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
              <circle
                cx="22" cy="22" r="18" fill="none" stroke="var(--accent-mint)" strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 18}`}
                strokeDashoffset={`${2 * Math.PI * 18 * (1 - (totalItems ? takenCount / totalItems : 0))}`}
                strokeLinecap="round" transform="rotate(-90 22 22)"
                style={{ transition: 'stroke-dashoffset 0.3s ease' }}
              />
            </svg>
          </div>
        </div>
      )}

      {sections.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-tertiary)' }}>
          <p style={{ fontSize: 14 }}>No supplements prescribed yet.</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Your coach will add them here, or tap Add below.</p>
        </div>
      ) : sections.map((section, si) => (
        <div key={si} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--accent)', opacity: 0.25 }} />
            <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--accent)' }}>
              {section.time}
            </h3>
            <div style={{ flex: 1, height: 1, background: 'var(--accent)', opacity: 0.25 }} />
          </div>

          {section.items.map((item) => (
            <SupplementRow
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onToggle={() => toggle(item, !item.taken)}
              onEdit={() => setEditing({ ...item, name: item.name, dose: item.dosage })}
            />
          ))}
        </div>
      ))}

      <button
        onClick={() => setEditing({
          isNew: true, name: '', dose: '', section: 'My Supplements', section_order: 60, timing: '', notes: '',
        })}
        style={{
          width: '100%', padding: '14px', borderRadius: 12, border: '1.5px dashed var(--accent)',
          background: 'transparent', color: 'var(--accent)', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', marginTop: 12,
        }}
      >
        + Add your own supplement
      </button>

      {editing && (
        <EditSupplementModal
          initial={editing}
          saving={saving}
          onSave={saveEdit}
          onDelete={editing.is_client_added ? () => removeMine(editing) : null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SupplementRow({ item, busy, onToggle, onEdit }) {
  const muted = item.is_conditional && !item.is_double_day;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        borderRadius: 12, marginBottom: 8,
        background: item.taken ? 'rgba(133,255,186,0.08)' : 'var(--bg-card)',
        border: item.taken ? '1px solid rgba(133,255,186,0.3)' : '1px solid transparent',
        opacity: muted ? 0.65 : 1, transition: 'background 0.2s, border 0.2s',
      }}
    >
      <div
        onClick={busy ? undefined : onToggle}
        style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0, cursor: busy ? 'default' : 'pointer',
          background: item.taken ? 'var(--accent-mint)' : 'transparent',
          border: item.taken ? 'none' : '2px solid var(--text-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {item.taken && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <div onClick={busy ? undefined : onToggle} style={{ flex: 1, minWidth: 0, cursor: busy ? 'default' : 'pointer' }}>
        <p style={{
          fontSize: 14, fontWeight: 700,
          textDecoration: item.taken ? 'line-through' : 'none',
          color: item.taken ? 'var(--text-secondary)' : 'var(--text-primary)',
        }}>
          {item.name}
          {item.is_double_day && (
            <span style={{
              marginLeft: 8, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 8,
              background: 'rgba(255,149,0,0.15)', color: 'var(--accent-orange)',
              textTransform: 'uppercase', letterSpacing: 0.5, verticalAlign: 'middle',
            }}>2x</span>
          )}
          {item.is_conditional && (
            <span style={{
              marginLeft: 6, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 8,
              background: 'rgba(142,142,147,0.15)', color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: 0.5, verticalAlign: 'middle',
            }}>as needed</span>
          )}
          {item.is_client_added && (
            <span style={{
              marginLeft: 6, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 8,
              background: 'rgba(61,255,210,0.15)', color: 'var(--accent-mint)',
              textTransform: 'uppercase', letterSpacing: 0.5, verticalAlign: 'middle',
            }}>mine</span>
          )}
        </p>
        {(item.dosage || item.rationale) && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {[item.dosage, item.rationale?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
          </p>
        )}
        {item.notes && (
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{item.notes}</p>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        aria-label="Edit"
        style={{
          width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'transparent', color: 'var(--text-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
    </div>
  );
}

function EditSupplementModal({ initial, saving, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(initial);
  const editableAll = form.isNew || form.is_client_added;
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480, margin: '0 auto', padding: '20px 20px 32px',
          maxHeight: '82vh', overflow: 'auto',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          {form.isNew ? 'Add supplement' : editableAll ? 'Edit supplement' : 'Adjust dose'}
        </h3>
        {!editableAll && (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>
            Your coach prescribed this one - you can update the dose you actually take.
          </p>
        )}

        <Field label="Name">
          <input
            value={form.name || ''} onChange={e => set('name', e.target.value)}
            disabled={!editableAll}
            style={{ ...inp, opacity: editableAll ? 1 : 0.6 }}
            placeholder="e.g. Creatine Monohydrate"
          />
        </Field>
        <Field label="Dose">
          <input
            value={form.dose || ''} onChange={e => set('dose', e.target.value)}
            style={inp}
            placeholder="5g"
          />
        </Field>
        {editableAll && (
          <>
            <Field label="Section">
              <select
                value={form.section || 'My Supplements'}
                onChange={e => set('section', e.target.value)}
                style={inp}
              >
                {SECTION_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Timing / instructions">
              <input
                value={form.timing || ''} onChange={e => set('timing', e.target.value)}
                style={inp}
                placeholder="with food"
              />
            </Field>
            <Field label="Notes">
              <input
                value={form.notes || ''} onChange={e => set('notes', e.target.value)}
                style={inp}
                placeholder="optional"
              />
            </Field>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {onDelete && (
            <button onClick={onDelete} disabled={saving} style={{
              padding: '12px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'rgba(220,38,38,0.12)', color: '#FF5E5E', fontSize: 13, fontWeight: 700,
            }}>Delete</button>
          )}
          <button onClick={onClose} disabled={saving} style={{
            flex: 1, padding: '12px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700,
          }}>Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !(form.name || '').trim()}
            style={{
              flex: 1, padding: '12px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700,
              opacity: (form.name || '').trim() ? 1 : 0.5,
            }}
          >
            {saving ? 'Saving...' : form.isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' }}>{label}</label>
      {children}
    </div>
  );
}

const inp = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.25)',
  color: 'var(--text-primary)', fontSize: 14,
};
