import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../components/ImageUpload';

// Single admin surface for the Meet the Team / 1:1 coaching feature.
// Tabs: Profile (photo/bio/specialties), Session Types, Availability, Bookings.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Supported event formats for coach_session_types. The same Events surface
// covers 1:1 calls, webinars, masterclasses, follow-along classes, and
// in-person events - so the booking flow, admin UI, and future payment
// integration can all branch off a single field.
const EVENT_FORMATS = [
  { value: 'one_on_one',   label: '1:1 Session',        icon: '👤' },
  { value: 'webinar',      label: 'Webinar',            icon: '🎥' },
  { value: 'masterclass',  label: 'Masterclass',        icon: '🎓' },
  { value: 'follow_along', label: 'Follow-along Class', icon: '🧘' },
  { value: 'in_person',    label: 'In-person Event',    icon: '📍' },
];
const formatMeta = (slug) =>
  EVENT_FORMATS.find((f) => f.value === slug) || EVENT_FORMATS[0];

const centsToDollars = (c) => (c == null ? '' : (c / 100).toFixed(2));
const dollarsToCents = (d) => {
  const n = parseFloat(d);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const formatMoney = (cents, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents || 0) / 100);

const formatDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

// Append ?coach_id= to a URL when we're editing a coach other than self
const withCoach = (url, coachId) => {
  if (!coachId) return url;
  return url + (url.includes('?') ? '&' : '?') + `coach_id=${coachId}`;
};

// This component is mounted twice from AdminLayout with different variants:
//   variant="team"   -> Trainers surface: profile, per-coach availability, tiers
//   variant="events" -> Events surface:   session types + bookings
//
// Both share the same team strip so you can quickly jump between coaches,
// but the tab set is scoped to each surface.
const TEAM_TABS = [
  { id: 'profile',      label: 'Profile' },
  { id: 'availability', label: 'Availability' },
  { id: 'tiers',        label: 'Coach Tiers' },
];
const EVENT_TABS = [
  { id: 'sessions', label: 'Event Types' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'bookings', label: 'Bookings' },
];

export default function CoachingManager({ variant = 'team' } = {}) {
  const { token, user } = useAuth();
  const tabs = variant === 'events' ? EVENT_TABS : TEAM_TABS;
  const [tab, setTab] = useState(tabs[0].id);
  const [team, setTeam] = useState([]);
  const [selectedCoachId, setSelectedCoachId] = useState(null);
  const [addingCoach, setAddingCoach] = useState(false);

  // Reset the active tab whenever the variant changes so Team nav items
  // don't try to open an Events-only tab and vice versa.
  useEffect(() => { setTab(tabs[0].id); }, [variant]);

  const fetchTeam = async () => {
    try {
      const res = await fetch('/api/coaches/admin/list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const list = data.coaches || [];
      setTeam(list);
      setSelectedCoachId((prev) => prev || user?.id || list[0]?.user_id || null);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchTeam(); }, []);

  const handleCreated = (newCoach) => {
    setAddingCoach(false);
    fetchTeam().then(() => setSelectedCoachId(newCoach.id));
  };

  const handleDelete = async (coachId) => {
    if (!confirm('Delete this coach? This removes their profile, sessions, and bookings.')) return;
    const res = await fetch(`/api/coaches/admin/coaches/${coachId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    if (selectedCoachId === coachId) setSelectedCoachId(user?.id || null);
    fetchTeam();
  };

  return (
    <div style={{ padding: '24px 40px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>
            {variant === 'events' ? 'Events' : 'Team'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {variant === 'events'
              ? 'Manage every event your team runs - 1:1s, webinars, masterclasses, follow-alongs, and in-person'
              : 'Manage your trainers, their profiles, availability, and tier classification'}
          </p>
        </div>
        {variant === 'team' && (
          <button onClick={() => setAddingCoach(true)} style={primaryBtn}>+ Add coach</button>
        )}
      </div>

      {/* Team strip */}
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 10, marginBottom: 20,
      }}>
        {team.map((c) => {
          const selected = c.user_id === selectedCoachId;
          return (
            <div
              key={c.user_id}
              onClick={() => {
                setSelectedCoachId(c.user_id);
                setAddingCoach(false);
              }}
              style={{
                flexShrink: 0, minWidth: 160, padding: 14, borderRadius: 12, cursor: 'pointer',
                background: 'var(--bg-card)',
                border: selected ? '2px solid var(--accent)' : '2px solid transparent',
                display: 'flex', alignItems: 'center', gap: 12, position: 'relative',
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                background: 'linear-gradient(135deg, #FF8C00, #FFB347)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#000', fontWeight: 800, fontSize: 18,
              }}>
                {c.photo_url || c.avatar_url ? (
                  <img
                    src={c.photo_url || c.avatar_url}
                    alt={c.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  c.name?.charAt(0) || 'C'
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.headline || c.email}
                </p>
              </div>
              {c.user_id !== user?.id && selected && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(c.user_id); }}
                  title="Delete coach"
                  style={{
                    position: 'absolute', top: 4, right: 6, width: 20, height: 20,
                    background: 'none', border: 'none', color: 'var(--text-tertiary)',
                    fontSize: 16, cursor: 'pointer', lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {addingCoach ? (
        <AddCoachPanel
          token={token}
          onCancel={() => setAddingCoach(false)}
          onCreated={handleCreated}
        />
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--divider)', marginBottom: 24 }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '12px 20px', background: 'none', border: 'none',
                  borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                  color: tab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 14, fontWeight: tab === t.id ? 700 : 500, cursor: 'pointer',
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {selectedCoachId && (
            <>
              {tab === 'profile' && <ProfileTab key={`p-${selectedCoachId}`} coachId={selectedCoachId} />}
              {tab === 'sessions' && <SessionTypesTab key={`s-${selectedCoachId}`} coachId={selectedCoachId} />}
              {tab === 'scheduled' && <ScheduledEventsTab key={`se-${selectedCoachId}`} coachId={selectedCoachId} />}
              {tab === 'availability' && <AvailabilityTab key={`a-${selectedCoachId}`} coachId={selectedCoachId} />}
              {tab === 'bookings' && <BookingsTab key={`b-${selectedCoachId}`} coachId={selectedCoachId} />}
              {tab === 'tiers' && <PricingTiersTab key={`t-${selectedCoachId}`} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function AddCoachPanel({ token, onCancel, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', password: 'welcome123', headline: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    if (!form.name || !form.email) {
      setError('Name and email are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/coaches/admin/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setSaving(false);
        return;
      }
      onCreated(data.coach);
    } catch (err) {
      setError('Failed to create coach');
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--divider)', borderRadius: 12,
      padding: 20, marginBottom: 20,
    }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Add a new coach</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Full name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Jane Smith"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="jane@ageless.com"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Temp password</label>
          <input
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Headline</label>
          <input
            type="text"
            value={form.headline}
            onChange={(e) => setForm({ ...form, headline: e.target.value })}
            placeholder="Mobility and Longevity Coach"
            style={inputStyle}
          />
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>
        Seeds default 30 min ($55) and 60 min ($97) sessions plus Mon-Fri 9 to 5 availability.
        The new coach can sign in with the temp password and update everything.
      </p>
      {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 10 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button onClick={handleSave} disabled={saving} style={primaryBtn}>
          {saving ? 'Creating...' : 'Create coach'}
        </button>
        <button onClick={onCancel} style={secondaryBtn}>Cancel</button>
      </div>
    </div>
  );
}

// =====================================================================
// Profile tab
// =====================================================================
function ProfileTab({ coachId }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tiers, setTiers] = useState([]);
  const [form, setForm] = useState({
    photo_url: '',
    headline: '',
    tagline: '',
    accent_color: '#FF8C00',
    bio: '',
    origin_story: '',
    pull_quote: '',
    help_bullets: [],
    social_links: { instagram: '', facebook: '', youtube: '', tiktok: '', website: '' },
    specialties: '',
    years_experience: '',
    qualifications: '',
    is_public: true,
    pricing_tier_id: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/coaches/admin/pricing-tiers', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setTiers(data.tiers || []);
      } catch (err) { console.error(err); }
    })();
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(withCoach('/api/coaches/admin/me', coachId), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.profile) {
          const p = data.profile;
          setForm({
            photo_url: p.photo_url || '',
            headline: p.headline || '',
            tagline: p.tagline || '',
            accent_color: p.accent_color || '#FF8C00',
            bio: p.bio || '',
            origin_story: p.origin_story || '',
            pull_quote: p.pull_quote || '',
            help_bullets: Array.isArray(p.help_bullets) ? p.help_bullets : [],
            social_links: {
              instagram: p.social_links?.instagram || '',
              facebook: p.social_links?.facebook || '',
              youtube: p.social_links?.youtube || '',
              tiktok: p.social_links?.tiktok || '',
              website: p.social_links?.website || '',
            },
            specialties: Array.isArray(p.specialties) ? p.specialties.join(', ') : '',
            years_experience: p.years_experience || '',
            qualifications: p.qualifications || '',
            is_public: p.is_public !== false,
            pricing_tier_id: p.pricing_tier_id || '',
          });
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    })();
  }, [token, coachId]);

  const addBullet = () => setForm(f => ({ ...f, help_bullets: [...f.help_bullets, ''] }));
  const updateBullet = (i, val) => setForm(f => ({
    ...f, help_bullets: f.help_bullets.map((b, idx) => idx === i ? val : b),
  }));
  const removeBullet = (i) => setForm(f => ({
    ...f, help_bullets: f.help_bullets.filter((_, idx) => idx !== i),
  }));

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(withCoach('/api/coaches/admin/me', coachId), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photo_url: form.photo_url || null,
          headline: form.headline || null,
          tagline: form.tagline || null,
          accent_color: form.accent_color || '#FF8C00',
          bio: form.bio || null,
          origin_story: form.origin_story || null,
          pull_quote: form.pull_quote || null,
          help_bullets: form.help_bullets.filter(b => b && b.trim()),
          social_links: form.social_links,
          specialties: form.specialties
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
          years_experience: form.years_experience ? parseInt(form.years_experience, 10) : null,
          qualifications: form.qualifications || null,
          is_public: form.is_public,
          pricing_tier_id: form.pricing_tier_id ? parseInt(form.pricing_tier_id, 10) : null,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 32, maxWidth: 800 }}>
      <div>
        <label style={labelStyle}>Profile photo</label>
        <ImageUpload
          value={form.photo_url}
          onChange={(url) => setForm({ ...form, photo_url: url })}
          width={220}
          height={220}
          label="Upload photo"
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
          <div>
            <label style={labelStyle}>Headline</label>
            <input
              type="text"
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              placeholder="Mobility and Longevity Coach"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Accent color</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="color"
                value={form.accent_color}
                onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                style={{ width: 42, height: 40, padding: 0, border: '1px solid var(--divider)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}
              />
              <input
                type="text"
                value={form.accent_color}
                onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                style={{ ...inputStyle, fontFamily: 'monospace' }}
              />
            </div>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Coach tier</label>
          <select
            value={form.pricing_tier_id}
            onChange={(e) => setForm({ ...form, pricing_tier_id: e.target.value })}
            style={inputStyle}
          >
            <option value="">- Not assigned -</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
            Classification only. Set prices per individual session type below.
          </p>
        </div>

        <div>
          <label style={labelStyle}>Tagline (shown in large accent text)</label>
          <input
            type="text"
            value={form.tagline}
            onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            placeholder="Move better. Feel younger. Live stronger."
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Short bio (intro paragraph)</label>
          <textarea
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            rows={4}
            placeholder="Tell clients what you help them with..."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div>
          <label style={labelStyle}>What sets me apart (origin story)</label>
          <textarea
            value={form.origin_story}
            onChange={(e) => setForm({ ...form, origin_story: e.target.value })}
            rows={5}
            placeholder="The story of how you got into coaching and what makes your approach different..."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div>
          <label style={labelStyle}>Pull quote (italic highlight)</label>
          <textarea
            value={form.pull_quote}
            onChange={(e) => setForm({ ...form, pull_quote: e.target.value })}
            rows={2}
            placeholder="A short memorable line shown in a highlighted card..."
            style={{ ...inputStyle, resize: 'vertical', fontStyle: 'italic' }}
          />
        </div>

        <div>
          <label style={labelStyle}>Ways I can help (bulleted list)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {form.help_bullets.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={b}
                  onChange={(e) => updateBullet(i, e.target.value)}
                  placeholder="e.g. Regain pain-free movement"
                  style={inputStyle}
                />
                <button
                  onClick={() => removeBullet(i)}
                  style={{ background: 'none', border: '1px solid var(--divider)', borderRadius: 8, color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 18, width: 40 }}
                >
                  ×
                </button>
              </div>
            ))}
            <button onClick={addBullet} style={{ ...secondaryBtn, alignSelf: 'flex-start', padding: '8px 14px', fontSize: 13 }}>
              + Add bullet
            </button>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Social links</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {['instagram', 'facebook', 'youtube', 'tiktok', 'website'].map((key) => (
              <div key={key}>
                <label style={{ ...labelStyle, fontSize: 11, marginBottom: 4 }}>{key}</label>
                <input
                  type="url"
                  value={form.social_links[key]}
                  onChange={(e) => setForm({
                    ...form,
                    social_links: { ...form.social_links, [key]: e.target.value },
                  })}
                  placeholder={key === 'website' ? 'https://...' : `https://${key}.com/...`}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Specialties (comma separated)</label>
          <input
            type="text"
            value={form.specialties}
            onChange={(e) => setForm({ ...form, specialties: e.target.value })}
            placeholder="Mobility, Strength, Injury Prevention"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Years experience</label>
            <input
              type="number"
              value={form.years_experience}
              onChange={(e) => setForm({ ...form, years_experience: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Qualifications</label>
            <input
              type="text"
              value={form.qualifications}
              onChange={(e) => setForm({ ...form, qualifications: e.target.value })}
              placeholder="FRCms, L3 PT"
              style={inputStyle}
            />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.is_public}
            onChange={(e) => setForm({ ...form, is_public: e.target.checked })}
          />
          <span>Show my profile in Meet the Team</span>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={primaryBtn}
          >
            {saving ? 'Saving...' : 'Save profile'}
          </button>
          {saved && <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 600 }}>✓ Saved</span>}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Session Types tab
// =====================================================================
function SessionTypesTab({ coachId }) {
  const { token } = useAuth();
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);

  const fetchList = async () => {
    const res = await fetch(withCoach('/api/coaches/admin/session-types', coachId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setList(data.session_types || []);
  };

  useEffect(() => { fetchList(); }, [coachId]);

  // Which format sections are currently expanded. Default: open the first
  // section that has items so the user sees something on load.
  const [openFormats, setOpenFormats] = useState(() => new Set(['one_on_one']));
  const toggleFormat = (slug) => {
    setOpenFormats((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  const handleSave = async (form) => {
    const capacityInt = parseInt(form.capacity, 10);
    const body = {
      title: form.title,
      description: form.description || null,
      duration_minutes: parseInt(form.duration_minutes, 10),
      price_cents: dollarsToCents(form.price_dollars),
      currency: form.currency || 'USD',
      is_active: form.is_active !== false,
      event_format: form.event_format || 'one_on_one',
      location: form.location || null,
      capacity: Number.isFinite(capacityInt) ? capacityInt : null,
      thumbnail_url: form.thumbnail_url || null,
      meeting_url: form.meeting_url || null,
    };
    if (editing?.__new) {
      await fetch(withCoach('/api/coaches/admin/session-types', coachId), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      await fetch(withCoach(`/api/coaches/admin/session-types/${editing.id}`, coachId), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    setEditing(null);
    fetchList();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this session type?')) return;
    await fetch(withCoach(`/api/coaches/admin/session-types/${id}`, coachId), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchList();
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: editing ? '1fr 420px' : '1fr', gap: 24 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={() => setEditing({ __new: true, event_format: 'one_on_one' })} style={primaryBtn}>
            + New event
          </button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {EVENT_FORMATS.map((meta) => {
            const items = list.filter((s) => (s.event_format || 'one_on_one') === meta.value);
            const open = openFormats.has(meta.value);
            return (
              <div
                key={meta.value}
                style={{
                  background: 'var(--bg-card)', borderRadius: 12,
                  border: '1px solid var(--divider)', overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => toggleFormat(meta.value)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-primary)', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 18 }}>{meta.icon}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{meta.label}</span>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(255,140,0,0.12)', color: 'var(--accent)', fontWeight: 700,
                  }}>
                    {items.length}
                  </span>
                  <span style={{
                    display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.2s', color: 'var(--text-tertiary)',
                  }}>▾</span>
                </button>
                {open && (
                  <div style={{ padding: '0 12px 12px 12px', display: 'grid', gap: 10 }}>
                    {items.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => setEditing(s)}
                        style={{
                          background: 'var(--bg-primary)', borderRadius: 10, padding: 12, cursor: 'pointer',
                          border: editing?.id === s.id ? '2px solid var(--accent)' : '2px solid transparent',
                          display: 'flex', alignItems: 'center', gap: 12,
                        }}
                      >
                        {/* Thumbnail */}
                        <div style={{
                          width: s.thumbnail_url ? 144 : 56,
                          height: s.thumbnail_url ? 81 : 56,
                          borderRadius: 8, flexShrink: 0, overflow: 'hidden',
                          background: s.thumbnail_url
                            ? 'var(--bg-card)'
                            : 'linear-gradient(135deg, rgba(255,140,0,0.25), rgba(255,179,71,0.1))',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 28,
                        }}>
                          {s.thumbnail_url ? (
                            <img
                              src={s.thumbnail_url}
                              alt={s.title}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            meta.icon
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{s.title}</p>
                          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                            {s.duration_minutes} min · {formatMoney(s.price_cents, s.currency)}
                            {s.capacity ? ` · ${s.capacity} spots` : ''}
                            {s.location ? ` · ${s.location}` : ''}
                            {!s.is_active && ' · inactive'}
                          </p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 18 }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setEditing({ __new: true, event_format: meta.value })}
                      style={{
                        ...secondaryBtn, padding: '10px', fontSize: 13,
                        border: '1px dashed var(--divider)',
                      }}
                    >
                      + Add {meta.label.toLowerCase()}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <SessionTypeEditor
          key={editing.__new ? `new-${editing.event_format}` : editing.id}
          initial={editing.__new ? { event_format: editing.event_format } : editing}
          isNew={!!editing.__new}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SessionTypeEditor({ initial, isNew, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    duration_minutes: initial?.duration_minutes || 30,
    price_dollars: (initial && initial.price_cents != null) ? centsToDollars(initial.price_cents) : '',
    currency: initial?.currency || 'USD',
    is_active: initial?.is_active != null ? !!initial.is_active : true,
    event_format: initial?.event_format || 'one_on_one',
    location: initial?.location || '',
    capacity: initial?.capacity || '',
    thumbnail_url: initial?.thumbnail_url || '',
    meeting_url: initial?.meeting_url || '',
  });

  const isMulti = form.event_format !== 'one_on_one';
  const needsLocation = form.event_format === 'in_person';

  return (
    <div style={panelStyle}>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
        {isNew ? 'New event' : 'Edit event'}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Event format</label>
          <select
            value={form.event_format}
            onChange={(e) => setForm({ ...form, event_format: e.target.value })}
            style={inputStyle}
          >
            {EVENT_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.icon} {f.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Cover image</label>
          <ImageUpload
            value={form.thumbnail_url}
            onChange={(url) => setForm({ ...form, thumbnail_url: url })}
            width="100%"
            height={160}
            label="Upload cover"
          />
        </div>
        <div>
          <label style={labelStyle}>Title</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Mobility Masterclass: Hips & Low Back"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Duration (min)</label>
            <input
              type="number"
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Price ({form.currency})</label>
            <input
              type="number"
              step="0.01"
              value={form.price_dollars}
              onChange={(e) => setForm({ ...form, price_dollars: e.target.value })}
              placeholder="0 for free"
              style={inputStyle}
            />
          </div>
        </div>

        {isMulti && (
          <div>
            <label style={labelStyle}>Capacity (max attendees)</label>
            <input
              type="number"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              placeholder="Leave blank for unlimited"
              style={inputStyle}
            />
          </div>
        )}

        {isMulti && (
          <div>
            <label style={labelStyle}>Meeting link</label>
            <input
              type="url"
              value={form.meeting_url}
              onChange={(e) => setForm({ ...form, meeting_url: e.target.value })}
              placeholder="https://zoom.us/j/... or https://riverside.fm/..."
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Zoom, Riverside.fm, Google Meet, or any link. Shown to registered clients only.
            </p>
          </div>
        )}

        {needsLocation && (
          <div>
            <label style={labelStyle}>Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Studio address or venue"
              style={inputStyle}
            />
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          <span>Active (visible to clients)</span>
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={() => onSave(form)} style={primaryBtn}>Save</button>
          <button onClick={onCancel} style={secondaryBtn}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Availability tab
// =====================================================================
function AvailabilityTab({ coachId }) {
  const { token } = useAuth();
  const [blocks, setBlocks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(withCoach('/api/coaches/admin/availability', coachId), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setBlocks(data.availability || []);
    })();
  }, [token, coachId]);

  const addBlock = () => setBlocks([...blocks, { weekday: 1, start_time: '09:00', end_time: '17:00' }]);
  const updateBlock = (i, patch) => setBlocks(blocks.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  const removeBlock = (i) => setBlocks(blocks.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await fetch(withCoach('/api/coaches/admin/availability', coachId), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
        Your weekly available windows. Clients can only book sessions that fit inside these blocks.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {blocks.map((b, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '140px 120px 120px 40px', gap: 10,
            alignItems: 'center', background: 'var(--bg-card)', padding: 12, borderRadius: 10,
          }}>
            <select
              value={b.weekday}
              onChange={(e) => updateBlock(i, { weekday: parseInt(e.target.value, 10) })}
              style={inputStyle}
            >
              {WEEKDAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
            </select>
            <input
              type="time"
              value={b.start_time}
              onChange={(e) => updateBlock(i, { start_time: e.target.value })}
              style={inputStyle}
            />
            <input
              type="time"
              value={b.end_time}
              onChange={(e) => updateBlock(i, { end_time: e.target.value })}
              style={inputStyle}
            />
            <button
              onClick={() => removeBlock(i)}
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 20 }}
            >
              ×
            </button>
          </div>
        ))}
        {blocks.length === 0 && (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: 24 }}>
            No availability blocks yet. Add one to start accepting bookings.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={addBlock} style={secondaryBtn}>+ Add block</button>
        <button onClick={handleSave} disabled={saving} style={primaryBtn}>
          {saving ? 'Saving...' : 'Save availability'}
        </button>
        {saved && <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 600 }}>✓ Saved</span>}
      </div>
    </div>
  );
}

// =====================================================================
// Bookings tab
// =====================================================================
// =====================================================================
// Scheduled Events tab - create and manage dated events
// =====================================================================
const SCHED_FORMATS = [
  { value: 'masterclass',  label: 'Masterclass' },
  { value: 'webinar',      label: 'Webinar' },
  { value: 'follow_along', label: 'Follow-along' },
  { value: 'in_person',    label: 'In-person' },
  { value: 'workshop',     label: 'Workshop' },
];

function ScheduledEventsTab({ coachId }) {
  const { token } = useAuth();
  const [events, setEvents] = useState([]);
  const [editing, setEditing] = useState(null); // null | { __new: true } | event obj
  const [regs, setRegs] = useState([]); // registrations for viewed event
  const [viewingRegsFor, setViewingRegsFor] = useState(null);

  const fetchEvents = async () => {
    const res = await fetch('/api/coaches/admin/events', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setEvents(data.events || []);
  };

  useEffect(() => { fetchEvents(); }, [coachId]);

  const fetchRegs = async (eventId) => {
    const res = await fetch(`/api/coaches/admin/events/${eventId}/registrations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setRegs(data.registrations || []);
    setViewingRegsFor(eventId);
  };

  const handleSave = async (form) => {
    const body = {
      title: form.title,
      description: form.description || null,
      event_format: form.event_format || 'masterclass',
      scheduled_at: form.scheduled_at,
      end_at: form.end_at || null,
      duration_minutes: parseInt(form.duration_minutes, 10) || 60,
      location: form.location || null,
      meeting_url: form.meeting_url || null,
      capacity: form.capacity ? parseInt(form.capacity, 10) : null,
      price_cents: dollarsToCents(form.price_dollars),
      thumbnail_url: form.thumbnail_url || null,
      status: form.status || 'published',
    };

    if (editing?.__new) {
      await fetch('/api/coaches/admin/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      await fetch(`/api/coaches/admin/events/${editing.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    setEditing(null);
    fetchEvents();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this event? Registrations will also be removed.')) return;
    await fetch(`/api/coaches/admin/events/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (editing?.id === id) setEditing(null);
    if (viewingRegsFor === id) { setViewingRegsFor(null); setRegs([]); }
    fetchEvents();
  };

  const statusColor = (s) => s === 'published' ? '#16a34a' : s === 'cancelled' ? '#dc2626' : s === 'completed' ? '#6b7280' : '#f59e0b';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: editing ? '1fr 420px' : '1fr', gap: 24 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            {events.length} event{events.length !== 1 ? 's' : ''}
          </p>
          <button onClick={() => { setEditing({ __new: true }); setViewingRegsFor(null); }} style={primaryBtn}>
            + New event
          </button>
        </div>

        {events.length === 0 && (
          <div style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: '40px 20px',
            textAlign: 'center', color: 'var(--text-tertiary)', border: '1px solid var(--divider)',
          }}>
            <p style={{ fontSize: 24, marginBottom: 8 }}>📅</p>
            <p style={{ fontSize: 14 }}>No scheduled events yet.</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>Create a masterclass, webinar, or in-person event.</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {events.map((evt) => {
            const isPast = new Date(evt.scheduled_at) < new Date();
            return (
              <div
                key={evt.id}
                onClick={() => { setEditing(evt); setViewingRegsFor(null); }}
                style={{
                  background: 'var(--bg-card)', borderRadius: 12, padding: 16, cursor: 'pointer',
                  border: editing?.id === evt.id ? '2px solid var(--accent)' : '2px solid transparent',
                  opacity: isPast ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: 16,
                }}
              >
                <div style={{
                  width: 144, height: 81, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
                  background: evt.thumbnail_url ? 'var(--bg-card)' : 'linear-gradient(135deg, rgba(255,140,0,0.25), rgba(255,179,71,0.1))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
                }}>
                  {evt.thumbnail_url ? (
                    <img src={evt.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : '📅'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{evt.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {formatDateTime(evt.scheduled_at)} · {evt.duration_minutes} min · {evt.event_format}
                  </p>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 8,
                      background: `${statusColor(evt.status)}22`, color: statusColor(evt.status),
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    }}>{evt.status}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {evt.registration_count || 0} registered{evt.capacity ? ` / ${evt.capacity}` : ''}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); fetchRegs(evt.id); setEditing(null); }}
                    title="View registrations"
                    style={{ ...smallBtn, fontSize: 11, padding: '4px 10px' }}
                  >
                    👥
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(evt.id); }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 18 }}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel: editor or registrations */}
      {editing && (
        <ScheduledEventEditor
          key={editing.__new ? 'new' : editing.id}
          initial={editing.__new ? {} : editing}
          isNew={!!editing.__new}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {viewingRegsFor && !editing && (
        <div style={panelStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
            Registrations ({regs.length})
          </h3>
          {regs.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No registrations yet.</p>
          )}
          {regs.map((r) => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
              borderBottom: '1px solid var(--divider)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 14,
              }}>
                {r.user_name?.charAt(0) || '?'}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600 }}>{r.user_name || r.user_email}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.user_email}</p>
              </div>
              <Pill text={r.status} tone={r.status === 'registered' ? 'green' : r.status === 'cancelled' ? 'red' : 'amber'} />
            </div>
          ))}
          <button onClick={() => { setViewingRegsFor(null); setRegs([]); }} style={{ ...secondaryBtn, marginTop: 14, width: '100%' }}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function ScheduledEventEditor({ initial, isNew, onSave, onCancel }) {
  // Convert scheduled_at ISO to local datetime-local value
  const toLocalDT = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 16);
  };

  const [form, setForm] = useState({
    title: initial.title || '',
    description: initial.description || '',
    event_format: initial.event_format || 'masterclass',
    scheduled_at: toLocalDT(initial.scheduled_at) || '',
    end_at: toLocalDT(initial.end_at) || '',
    duration_minutes: initial.duration_minutes || 60,
    location: initial.location || '',
    meeting_url: initial.meeting_url || '',
    capacity: initial.capacity || '',
    price_dollars: centsToDollars(initial.price_cents),
    thumbnail_url: initial.thumbnail_url || '',
    status: initial.status || 'published',
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.title || !form.scheduled_at) return;
    onSave(form);
  };

  return (
    <div style={panelStyle}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
        {isNew ? 'Create Event' : 'Edit Event'}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Title *</label>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} style={inputStyle} placeholder="Pickleball Mobility Masterclass" />
        </div>

        <div>
          <label style={labelStyle}>Format</label>
          <select value={form.event_format} onChange={(e) => set('event_format', e.target.value)} style={inputStyle}>
            {SCHED_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Date & Time *</label>
          <input type="datetime-local" value={form.scheduled_at} onChange={(e) => set('scheduled_at', e.target.value)} style={inputStyle} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Duration (min)</label>
            <input type="number" value={form.duration_minutes} onChange={(e) => set('duration_minutes', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>End Time (optional)</label>
            <input type="datetime-local" value={form.end_at} onChange={(e) => set('end_at', e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="What will participants learn or experience?" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Price ($)</label>
            <input type="number" step="0.01" value={form.price_dollars} onChange={(e) => set('price_dollars', e.target.value)} style={inputStyle} placeholder="0.00 = free" />
          </div>
          <div>
            <label style={labelStyle}>Capacity</label>
            <input type="number" value={form.capacity} onChange={(e) => set('capacity', e.target.value)} style={inputStyle} placeholder="Leave blank = unlimited" />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Location</label>
          <input value={form.location} onChange={(e) => set('location', e.target.value)} style={inputStyle} placeholder="Studio 1 / Zoom / TBD" />
        </div>

        <div>
          <label style={labelStyle}>Meeting URL</label>
          <input value={form.meeting_url} onChange={(e) => set('meeting_url', e.target.value)} style={inputStyle} placeholder="https://zoom.us/j/..." />
        </div>

        <div>
          <label style={labelStyle}>Cover image</label>
          <ImageUpload
            value={form.thumbnail_url}
            onChange={(url) => set('thumbnail_url', url)}
            width="100%"
            height={160}
            label="Upload cover"
          />
        </div>

        <div>
          <label style={labelStyle}>Status</label>
          <select value={form.status} onChange={(e) => set('status', e.target.value)} style={inputStyle}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={handleSubmit} style={primaryBtn}>
            {isNew ? 'Create Event' : 'Save Changes'}
          </button>
          <button onClick={onCancel} style={secondaryBtn}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function BookingsTab({ coachId }) {
  const { token } = useAuth();
  const [bookings, setBookings] = useState([]);

  const fetchBookings = async () => {
    const res = await fetch(withCoach('/api/coaches/admin/bookings', coachId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setBookings(data.bookings || []);
  };

  useEffect(() => { fetchBookings(); }, [coachId]);

  const updateBooking = async (id, patch) => {
    await fetch(withCoach(`/api/coaches/admin/bookings/${id}`, coachId), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    fetchBookings();
  };

  const upcoming = bookings.filter(b => new Date(b.scheduled_at) > new Date() && b.status !== 'cancelled');
  const past = bookings.filter(b => new Date(b.scheduled_at) <= new Date() || b.status === 'cancelled');

  return (
    <div style={{ maxWidth: 900 }}>
      <BookingGroup title="Upcoming" items={upcoming} onUpdate={updateBooking} />
      <BookingGroup title="Past & cancelled" items={past} onUpdate={updateBooking} muted />
    </div>
  );
}

function BookingGroup({ title, items, onUpdate, muted }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: 0.5, color: 'var(--text-tertiary)', marginBottom: 12 }}>
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(b => (
          <div key={b.id} style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: 16,
            display: 'flex', alignItems: 'center', gap: 16, opacity: muted ? 0.7 : 1,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: b.client_avatar ? `url(${b.client_avatar}) center/cover` : 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#000', fontWeight: 700, flexShrink: 0,
            }}>
              {!b.client_avatar && b.client_name?.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700 }}>{b.client_name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {b.session_title || `${b.duration_minutes} min session`} · {formatDateTime(b.scheduled_at)}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <Pill text={b.status} tone={b.status === 'confirmed' ? 'green' : b.status === 'cancelled' ? 'red' : 'amber'} />
                <Pill text={b.payment_status} tone={b.payment_status === 'paid' || b.payment_status === 'free' ? 'green' : 'amber'} />
              </div>
            </div>
            {!muted && (
              <div style={{ display: 'flex', gap: 6 }}>
                {b.status !== 'confirmed' && (
                  <button onClick={() => onUpdate(b.id, { status: 'confirmed' })} style={smallBtn}>Confirm</button>
                )}
                {b.status !== 'cancelled' && (
                  <button onClick={() => onUpdate(b.id, { status: 'cancelled' })} style={{ ...smallBtn, background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>Cancel</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Pill({ text, tone }) {
  const colors = {
    green: { bg: 'rgba(22,163,74,0.15)', fg: '#16a34a' },
    red: { bg: 'rgba(220,38,38,0.15)', fg: '#dc2626' },
    amber: { bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b' },
  };
  const c = colors[tone] || colors.amber;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 10,
      background: c.bg, color: c.fg, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    }}>{text}</span>
  );
}

// =====================================================================
// Coach Tiers tab - classification only, no prices.
// Prices live on each session type so every event (30 min, 45 min, 90 min,
// webinar, masterclass) can be individually priced.
// =====================================================================
function PricingTiersTab() {
  const { token } = useAuth();
  const [tiers, setTiers] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);

  const fetchTiers = async () => {
    const res = await fetch('/api/coaches/admin/pricing-tiers', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setTiers(data.tiers || []);
  };

  useEffect(() => { fetchTiers(); }, []);

  const updateField = (id, patch) => {
    setTiers((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t));
  };

  const saveTier = async (tier) => {
    setSavingId(tier.id);
    setSavedId(null);
    try {
      const res = await fetch(`/api/coaches/admin/pricing-tiers/${tier.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tier.name,
          description: tier.description,
        }),
      });
      const data = await res.json();
      if (data.tier) {
        setSavedId(tier.id);
        setTimeout(() => setSavedId(null), 2500);
      }
    } catch (err) {
      console.error(err);
    }
    setSavingId(null);
    fetchTiers();
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
        Three classification tiers for coaches (Standard / Premium / Elite).
        These are labels only - prices live on each individual session type so
        you can charge anything you like per event (30 min, 45 min, 90 min,
        webinar, masterclass, in-person, etc.).
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tiers.map((t) => (
          <div
            key={t.id}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--divider)',
              borderRadius: 14, padding: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
                padding: '4px 10px', borderRadius: 20,
                background: 'rgba(255,140,0,0.15)', color: 'var(--accent)',
              }}>
                {t.slug}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {t.coach_count} coach{t.coach_count === 1 ? '' : 'es'} assigned
              </span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Tier name</label>
              <input
                type="text"
                value={t.name || ''}
                onChange={(e) => updateField(t.id, { name: e.target.value })}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={t.description || ''}
                onChange={(e) => updateField(t.id, { description: e.target.value })}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Short description shown on this tier's classification"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => saveTier(t)}
                disabled={savingId === t.id}
                style={primaryBtn}
              >
                {savingId === t.id ? 'Saving...' : 'Save tier'}
              </button>
              {savedId === t.id && (
                <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 600 }}>
                  ✓ Saved
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// Shared styles
// =====================================================================
const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: 'var(--text-secondary)', marginBottom: 6,
  textTransform: 'uppercase', letterSpacing: 0.3,
};
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--divider)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit',
};
const primaryBtn = {
  background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
  padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
};
const secondaryBtn = {
  background: 'var(--bg-card)', color: 'var(--text-primary)',
  border: '1px solid var(--divider)', borderRadius: 10,
  padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const smallBtn = {
  background: 'rgba(255,140,0,0.15)', color: 'var(--accent)', border: 'none',
  borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
const panelStyle = {
  background: 'var(--bg-card)', borderRadius: 12, padding: 20,
  border: '1px solid var(--divider)', alignSelf: 'flex-start', position: 'sticky', top: 20,
};
