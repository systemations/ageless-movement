import { useState } from 'react';

// Bottom-sheet style popup for an in-app notification. Three shapes:
// - daily_checkin: form with sleep / alcohol / meditation / notes + Skip/Submit
// - anything with cta_label + cta_url: primary CTA button + Dismiss
// - plain announcement: just message + OK button
export default function NotificationPopup({ notification, onDismiss, onCompleteCheckin }) {
  const [sleep, setSleep] = useState('');
  const [alcohol, setAlcohol] = useState('');
  const [meditation, setMeditation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const isCheckin = notification.kind === 'daily_checkin';

  const submitCheckin = async () => {
    setSaving(true);
    await onCompleteCheckin({
      sleep_hours: sleep === '' ? null : Number(sleep),
      alcohol_units: alcohol === '' ? null : Number(alcohol),
      meditation_minutes: meditation === '' ? null : Number(meditation),
      notes,
    });
    setSaving(false);
  };

  const handleCta = () => {
    if (notification.cta_url) {
      window.open(notification.cta_url, '_blank', 'noopener');
    }
    onDismiss();
  };

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 2500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 520, padding: '20px 20px 28px',
          border: '1px solid var(--divider)', borderBottom: 'none',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.4)',
          maxHeight: '85vh', overflow: 'auto',
        }}
      >
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'var(--divider)', margin: '0 auto 14px',
        }} />

        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{notification.title}</h2>
        {notification.body && (
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: isCheckin ? 16 : 18, whiteSpace: 'pre-wrap' }}>
            {notification.body}
          </p>
        )}

        {isCheckin ? (
          <>
            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              <HabitField
                icon="😴"
                label="Sleep"
                suffix="hours"
                value={sleep}
                onChange={setSleep}
                step="0.5"
                placeholder="e.g. 7.5"
              />
              <HabitField
                icon="🍷"
                label="Alcohol"
                suffix="units"
                value={alcohol}
                onChange={setAlcohol}
                step="0.5"
                placeholder="0 if none"
              />
              <HabitField
                icon="🧘"
                label="Meditation"
                suffix="minutes"
                value={meditation}
                onChange={setMeditation}
                step="1"
                placeholder="0 if skipped"
              />
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Anything to flag?
                </p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional — pain, mood, a thought for the coach…"
                  rows={2}
                  className="input-field"
                  style={{ fontSize: 14, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onDismiss}
                disabled={saving}
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)',
                  border: 'none', borderRadius: 12, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >Skip today</button>
              <button
                onClick={submitCheckin}
                disabled={saving}
                className="btn-primary"
                style={{ flex: 2, fontSize: 14, opacity: saving ? 0.5 : 1 }}
              >{saving ? 'Saving…' : 'Send to coach'}</button>
            </div>
          </>
        ) : notification.cta_label && notification.cta_url ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onDismiss}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)',
                border: 'none', borderRadius: 12, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >Dismiss</button>
            <button
              onClick={handleCta}
              className="btn-primary"
              style={{ flex: 2, fontSize: 14 }}
            >{notification.cta_label}</button>
          </div>
        ) : (
          <button
            onClick={onDismiss}
            className="btn-primary"
            style={{ width: '100%', fontSize: 14 }}
          >OK</button>
        )}
      </div>
    </div>
  );
}

function HabitField({ icon, label, suffix, value, onChange, step, placeholder }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-card)', borderRadius: 12 }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <input
            type="number"
            step={step}
            min="0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, padding: 0, minWidth: 0,
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{suffix}</span>
        </div>
      </div>
    </div>
  );
}
