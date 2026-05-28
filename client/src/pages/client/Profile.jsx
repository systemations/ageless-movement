import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ChevronRight } from '../../components/Icons';
import { EATING_STYLES, calculateTargets } from '../../lib/nutritionTargets';

export default function Profile({ onBack }) {
  const { user, token, profile, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [appearance, setAppearance] = useState(theme);
  // ?section=nutrition deep-links the user from Home's DailyTargetsCard
  // straight into the My Profile sub-page, scrolled to the nutrition
  // block. Any other ?section value is ignored.
  const [searchParams] = useSearchParams();
  const initialSection = searchParams.get('section');
  const [showSubPage, setShowSubPage] = useState(initialSection === 'nutrition' ? 'profile' : null);
  const [scrollTarget, setScrollTarget] = useState(initialSection === 'nutrition' ? 'nutrition' : null);
  const [unitSystem, setUnitSystem] = useState({ weight: 'kg', height: 'cm' });
  // Reminder preferences. Defaults are ON so every surface (water card,
  // meal logging, daily check-in popup, etc.) renders out of the box.
  // Toggling OFF hides / silences that surface. Stored on
  // client_profiles.reminder_preferences JSON.
  const [reminders, setReminders] = useState({
    workout_reminder: true,
    meal_logging: true,
    water_intake: true,
    daily_checkin: true,
    weekly_checkin: true,
    supplement_reminder: true,
  });
  const [remindersLoaded, setRemindersLoaded] = useState(false);
  // Get Started checklist state - lets clients re-enable the Home card
  // after they X'd it out. Hidden in the reminders list once everything's
  // already done (no point toggling something that auto-hides).
  const [checklistState, setChecklistState] = useState({ dismissed: false, all_done: true });
  const [password, setPassword] = useState({ current: '', newPw: '', confirm: '' });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState(null); // { kind: 'error'|'success', text }
  const [profileImage, setProfileImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [ratingModal, setRatingModal] = useState(null); // { rating, message, submitting, submitted }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const uploadRes = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const { url } = await uploadRes.json();
      const saveRes = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_image_url: url }),
      });
      if (!saveRes.ok) throw new Error('Save failed');
      setProfileImage(url);
    } catch (err) {
      console.error('Photo upload error:', err);
      alert('Failed to upload photo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setProfileImage(data.profile?.profile_image_url || null);
        }
      } catch (err) { console.error(err); }
    };
    fetchProfile();
    // Load reminder preferences
    const fetchPrefs = async () => {
      try {
        const res = await fetch('/api/athlete/preferences', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          if (data.preferences && Object.keys(data.preferences).length > 0) {
            setReminders(prev => ({ ...prev, ...data.preferences }));
          }
          setRemindersLoaded(true);
        }
      } catch (err) { console.error(err); }
    };
    fetchPrefs();
    // Onboarding checklist - to decide whether the "Get Started checklist"
    // toggle is meaningful (only when there are still incomplete steps).
    fetch('/api/onboarding/checklist', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setChecklistState({ dismissed: !!d.dismissed, all_done: !!d.all_done }))
      .catch(() => {});
  }, []);

  // Sub-pages
  if (showSubPage === 'profile') {
    return (
      <MyProfilePage
        onBack={() => setShowSubPage(null)}
        token={token}
        user={user}
        initialProfile={profile}
        scrollTarget={scrollTarget}
        onScrollHandled={() => setScrollTarget(null)}
      />
    );
  }

  if (showSubPage === 'reminders') {
    // ON (toggle lit) means the surface is visible. For the synthetic
    // get-started key that maps to dismissed=false; everything else maps
    // to reminder_preferences[key]=true.
    const isOn = (key) => key === '__get_started__'
      ? !checklistState.dismissed
      : !!reminders[key];

    const toggleReminder = async (key) => {
      if (key === '__get_started__') {
        const dismissed = !checklistState.dismissed; // flip
        setChecklistState(prev => ({ ...prev, dismissed }));
        try {
          await fetch('/api/onboarding/checklist/dismiss', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ dismissed }),
          });
        } catch (err) { console.error('Failed to update checklist visibility:', err); }
        return;
      }
      const updated = { ...reminders, [key]: !reminders[key] };
      setReminders(updated);
      try {
        await fetch('/api/athlete/preferences', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ preferences: updated }),
        });
      } catch (err) { console.error('Failed to save preference:', err); }
    };

    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowSubPage(null)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Reminders</h1>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          Choose which notifications and check-ins you'd like to receive.
        </p>

        {[
          { key: 'water_intake',       label: 'Water Intake',        desc: 'Show the water tracker on Home', icon: '💧' },
          { key: 'meal_logging',       label: 'Meal Logging',        desc: 'Show today\'s meals on Home', icon: '🍖' },
          { key: 'daily_checkin',      label: 'Daily Check-in',      desc: 'Pop-up to log sleep, energy, soreness & mood', icon: '📋' },
          { key: 'weekly_checkin',     label: 'Weekly Check-in',     desc: 'Sunday 10am notification to submit progress photos', icon: '📊' },
          { key: 'supplement_reminder',label: 'Supplement Reminder', desc: 'Daily reminder to take your supplements', icon: '💊' },
          { key: 'workout_reminder',   label: 'Workout Reminders',   desc: 'Allow your coach to send a nudge on workout days', icon: '🏋️' },
          // Synthetic "reminder" - lives on client_profiles.onboarding_checklist_dismissed_at
          // rather than reminder_preferences JSON, so it gets its own toggle handler below.
          // Hidden when the checklist is already fully done (auto-hides anyway).
          ...(!checklistState.all_done ? [{ key: '__get_started__', label: 'Get Started Checklist', desc: 'Show the 5-step setup card on Home', icon: '🚀' }] : []),
        ].map(({ key, label, desc, icon }) => (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 0', borderBottom: '1px solid var(--divider)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600 }}>{label}</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{desc}</p>
              </div>
            </div>
            <button onClick={() => toggleReminder(key)} style={{
              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
              background: isOn(key) ? 'var(--accent-mint)' : 'var(--divider)', transition: 'background 0.2s',
              flexShrink: 0, marginLeft: 12,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 2, left: isOn(key) ? 22 : 2, transition: 'left 0.2s',
              }} />
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (showSubPage === 'units') {
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowSubPage(null)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Unit System</h1>
        </div>
        {[{ key: 'weight', label: 'Weight', options: ['kg', 'lbs'] }, { key: 'height', label: 'Height', options: ['cm', 'ft/in'] }].map(({ key, label, options }) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{label}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {options.map(opt => (
                <button key={opt} onClick={() => setUnitSystem({ ...unitSystem, [key]: opt })} style={{
                  flex: 1, padding: 12, borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 600,
                  background: unitSystem[key] === opt ? 'var(--accent-mint)' : 'var(--bg-card)',
                  color: unitSystem[key] === opt ? '#000' : 'var(--text-primary)',
                }}>{opt}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (showSubPage === 'password') {
    const submitPassword = async () => {
      setPasswordMsg(null);
      const { current, newPw, confirm } = password;
      if (!current || !newPw || !confirm) return setPasswordMsg({ kind: 'error', text: 'All fields are required.' });
      if (newPw.length < 8) return setPasswordMsg({ kind: 'error', text: 'New password must be at least 8 characters.' });
      if (newPw !== confirm) return setPasswordMsg({ kind: 'error', text: 'New password and confirmation do not match.' });
      setPasswordBusy(true);
      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_password: current, new_password: newPw }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPasswordMsg({ kind: 'error', text: data.error || 'Could not update password.' });
        } else {
          setPassword({ current: '', newPw: '', confirm: '' });
          setPasswordMsg({ kind: 'success', text: 'Password updated.' });
        }
      } catch (err) {
        setPasswordMsg({ kind: 'error', text: 'Network error. Try again.' });
      }
      setPasswordBusy(false);
    };
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => { setShowSubPage(null); setPasswordMsg(null); }} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Change Password</h1>
        </div>
        <div className="input-group"><label>Current Password</label><input type="password" className="input-field" value={password.current} onChange={e => setPassword({...password, current: e.target.value})} /></div>
        <div className="input-group"><label>New Password</label><input type="password" className="input-field" value={password.newPw} onChange={e => setPassword({...password, newPw: e.target.value})} /></div>
        <div className="input-group"><label>Confirm Password</label><input type="password" className="input-field" value={password.confirm} onChange={e => setPassword({...password, confirm: e.target.value})} /></div>
        {passwordMsg && (
          <p style={{
            fontSize: 13, fontWeight: 600, textAlign: 'center', marginBottom: 12,
            color: passwordMsg.kind === 'error' ? 'var(--error)' : 'var(--accent-mint-ink, #0E8A4F)',
          }}>{passwordMsg.text}</p>
        )}
        <button
          className="btn-primary"
          onClick={submitPassword}
          disabled={passwordBusy}
          style={{ opacity: passwordBusy ? 0.5 : 1 }}
        >{passwordBusy ? 'Updating...' : 'Update Password'}</button>
      </div>
    );
  }

  if (showSubPage === 'appearance') {
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowSubPage(null)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Appearance</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Light', 'Dark'].map(mode => (
            <button key={mode} onClick={() => { setAppearance(mode.toLowerCase()); setTheme(mode.toLowerCase()); }} style={{
              flex: 1, padding: '16px 12px', borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 600, textAlign: 'center',
              background: appearance === mode.toLowerCase() ? 'var(--accent)' : 'var(--bg-card)',
              color: appearance === mode.toLowerCase() ? '#fff' : 'var(--text-primary)',
            }}>{mode}</button>
          ))}
        </div>
      </div>
    );
  }

  if (showSubPage === 'connected') {
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowSubPage(null)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Connected Apps</h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>
          Automatic syncing of steps, heart rate and workouts is on the way. These will connect once the app launches on iOS and Android.
        </p>
        {[{ name: 'Apple Health', icon: '❤️' }, { name: 'Apple Watch', icon: '⌚' }, { name: 'Google Fit', icon: '💚' }, { name: 'Garmin', icon: '⌚' }, { name: 'Fitbit', icon: '⌚' }].map(app => (
          <div key={app.name} className="card-sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, opacity: 0.7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>{app.icon}</span>
              <div>
                <p style={{ fontSize: 15, fontWeight: 500 }}>{app.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Coming soon</p>
              </div>
            </div>
            <span style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)' }}>
              Coming soon
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(-1)} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </div>

      {/* Profile */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          style={{
            width: 80, height: 80, borderRadius: '50%',
            background: profileImage ? 'transparent' : 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', fontSize: 32, fontWeight: 700, color: '#fff',
            overflow: 'hidden', position: 'relative', cursor: 'pointer',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {profileImage ? (
            <>
              <img src={profileImage} alt="" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
              <div style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 26, height: 26, borderRadius: '50%',
                background: 'var(--accent)', border: '2px solid var(--bg-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            </>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          )}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>{user?.name}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{user?.email}</p>
      </div>

      {/* Active Plan - pulls from client_profiles.plan_title / plan_cycle / plan_next_renewal_at
          which the coach sets via the admin ClientProfile Membership card. */}
      <ActivePlanCard profile={profile} />

      {/* Settings Group 1 */}
      <div className="card" style={{ marginBottom: 12 }}>
        {[
          { icon: '👤', label: 'My Profile', action: () => setShowSubPage('profile') },
          { icon: '🔔', label: 'Reminders', action: () => setShowSubPage('reminders') },
          { icon: '⌚', label: 'Connected Apps', action: () => setShowSubPage('connected') },
          { icon: '🔄', label: 'Unit System', action: () => setShowSubPage('units') },
          { icon: '📱', label: 'Install on Your Phone', action: () => navigate('/install') },
        ].map(({ icon, label, action }, i, arr) => (
          <div key={label} onClick={action} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--divider)' : 'none',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
            </div>
            <ChevronRight />
          </div>
        ))}
      </div>

      {/* Settings Group 2 */}
      <div className="card" style={{ marginBottom: 12 }}>
        {[
          { icon: '👥', label: 'About Dan', action: () => navigate('/explore') },
          { icon: '📋', label: 'Explore Plans', action: () => navigate('/plans') },
        ].map(({ icon, label, action }, i) => (
          <div key={label} onClick={action} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 0', borderBottom: i < 1 ? '1px solid var(--divider)' : 'none',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
            </div>
            <ChevronRight />
          </div>
        ))}
      </div>

      {/* Settings Group 3 */}
      <div className="card" style={{ marginBottom: 12 }}>
        {[
          { icon: '⭐', label: 'Rate App', action: () => setRatingModal({ rating: 0, message: '', submitting: false, submitted: false }) },
          { icon: '🎁', label: 'Tell a Friend', action: () => { if (navigator.share) navigator.share({ title: 'Ageless Movement', text: 'Check out this mobility coaching app!', url: window.location.origin }); else alert('Share this link: ' + window.location.origin); } },
        ].map(({ icon, label, action }, i) => (
          <div key={label} onClick={action} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 0', borderBottom: i < 1 ? '1px solid var(--divider)' : 'none',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
            </div>
            <ChevronRight />
          </div>
        ))}
      </div>

      {/* Settings Group 5 */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div onClick={() => setShowSubPage('appearance')} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', borderBottom: '1px solid var(--divider)', cursor: 'pointer',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>🎨</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>Appearance</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, background: 'var(--bg-card)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--divider)' }}>
            {appearance.toUpperCase()}
          </span>
        </div>
        <div onClick={() => setShowSubPage('password')} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', borderBottom: '1px solid var(--divider)', cursor: 'pointer',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>🔒</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>Change Password</span>
          </div>
          <ChevronRight />
        </div>
        <button onClick={logout} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
          background: 'none', border: 'none', color: 'var(--accent)', fontSize: 15, fontWeight: 500, width: '100%',
        }}>
          <span style={{ fontSize: 18 }}>↩️</span>
          Logout
        </button>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0' }}>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Powered by Ageless Movement</p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>ver. 1.0.0</p>
      </div>

      {ratingModal && (
        <RatingModal
          state={ratingModal}
          setState={setRatingModal}
          token={token}
          onClose={() => setRatingModal(null)}
        />
      )}
    </div>
  );
}

function RatingModal({ state, setState, token, onClose }) {
  const setRating = (n) => setState(s => ({ ...s, rating: n }));
  const setMessage = (m) => setState(s => ({ ...s, message: m }));

  const submit = async () => {
    if (!state.rating || state.submitting) return;
    setState(s => ({ ...s, submitting: true }));
    try {
      const res = await fetch('/api/athlete/feedback', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: state.rating, message: state.message }),
      });
      if (!res.ok) throw new Error('Save failed');
      setState(s => ({ ...s, submitting: false, submitted: true }));
    } catch (err) {
      console.error(err);
      setState(s => ({ ...s, submitting: false }));
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2500,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)', borderRadius: 18, width: '100%', maxWidth: 420,
          border: '1px solid var(--divider)', padding: 20,
        }}
      >
        {state.submitted ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🙌</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Thanks!</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Your feedback goes straight to the coach. We read every one.
            </p>
            <button
              onClick={onClose}
              className="btn-primary"
              style={{ fontSize: 14 }}
            >Close</button>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Rate the app</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
              How is Ageless Movement working for you?
            </p>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 14 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 32, padding: 4,
                    color: n <= state.rating ? '#FFD60A' : 'var(--divider)',
                    transition: 'color 0.1s',
                  }}
                  aria-label={`${n} stars`}
                >★</button>
              ))}
            </div>
            <textarea
              value={state.message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Anything specific you want the coach to know? (optional)"
              rows={4}
              className="input-field"
              style={{ fontSize: 14, resize: 'vertical', fontFamily: 'inherit', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                disabled={state.submitting}
                style={{
                  background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)',
                  border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 14,
                  fontWeight: 600, cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={submit}
                disabled={!state.rating || state.submitting}
                className="btn-primary"
                style={{ fontSize: 14, opacity: state.rating && !state.submitting ? 1 : 0.5 }}
              >{state.submitting ? 'Sending...' : 'Send feedback'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Shows the client their active membership plan + next renewal date, both set
// by the coach in admin. If coach hasn't set any plan yet, show a neutral "no plan".
function ActivePlanCard({ profile }) {
  const title = profile?.plan_title;
  const cycle = profile?.plan_cycle;
  const next = profile?.plan_next_renewal_at;
  const started = profile?.plan_started_at;

  // Format a date range: started - next renewal
  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const range = started || next
    ? [fmt(started), fmt(next)].filter(Boolean).join(' - ')
    : null;

  const renewalLabel = next ? renewalStatus(next) : null;

  if (!title && !cycle && !next) {
    // No paid plan yet - fall back to showing the client's tier (Free /
    // Starter / Prime / Elite) so the membership card is never blank.
    // Every new signup has tier_id=1 (Free) so this path always renders.
    const tierName = profile?.tier_name || 'Free';
    const isFree = (profile?.tier_level || 0) === 0;
    return (
      <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 0.5 }}>MEMBERSHIP</p>
          <p style={{ fontSize: 16, fontWeight: 700 }}>
            {isFree ? `${tierName} trial` : tierName}
          </p>
          {profile?.tier_price_label && !isFree && (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{profile.tier_price_label}</p>
          )}
        </div>
        {isFree && (
          <span style={{
            fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 12,
            background: 'rgba(61,255,210,0.15)', color: 'var(--accent-mint-ink, #0E8A4F)',
            letterSpacing: 0.4, flexShrink: 0,
          }}>ACTIVE</span>
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 0.5 }}>ACTIVE PLAN</p>
        <p style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title || 'Membership'}
        </p>
        {cycle && (
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, textTransform: 'capitalize' }}>
            {cycle} billing
          </p>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {range && (
          <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{range}</p>
        )}
        {renewalLabel && (
          <p style={{ fontSize: 12, fontWeight: 700, color: renewalLabel.color, marginTop: 2 }}>
            {renewalLabel.text}
          </p>
        )}
      </div>
    </div>
  );
}

// Human-friendly renewal timing. Overdue = red, within 7 days = orange, else subtle.
function renewalStatus(dateStr) {
  const days = Math.floor((new Date(dateStr) - new Date()) / 86400000);
  if (days < 0) return { text: `Overdue ${Math.abs(days)}d`, color: '#FF5E5E' };
  if (days === 0) return { text: 'Renews today', color: 'var(--accent)' };
  if (days === 1) return { text: 'Renews tomorrow', color: 'var(--accent)' };
  if (days <= 7) return { text: `Renews in ${days}d`, color: 'var(--accent)' };
  if (days <= 30) return { text: `Renews in ${days}d`, color: 'var(--text-secondary)' };
  return { text: `Renews ${new Date(dateStr).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}`, color: 'var(--text-secondary)' };
}

// ── Nutrition Targets - merged into MyProfile bottom 2026-04-28 ────
// Used to be its own sub-page that re-collected sex/age/height/weight/
// activity/eating_style. Those fields now live in MyProfile's question
// rows and PATCH /api/onboarding/answers auto-recomputes the targets
// server-side. This section just shows the live preview + lets the
// user toggle to manual override values.
// ─────────────────────────────────────────────────────────────────────
// My Profile - view + edit onboarding answers
// ─────────────────────────────────────────────────────────────────────
// Header: avatar, name, age (M/F), height, weight, BMI badge.
// Body:   12 onboarding questions, each tappable to edit. BMR-relevant
//         changes (sex/height/weight/age/activity/eating_style) trigger
//         a server-side target recompute so the Daily Targets card
//         on Home updates next mount.

// Vitals - edited inline from the top header card via tap-to-edit.
// Kept off PROFILE_QUESTIONS so they don't render twice on the page.
const VITAL_QUESTIONS = [
  { key: 'sex',       label: 'Biological sex', type: 'single', options: [
      { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' },
  ]},
  { key: 'age',       label: 'Age',    type: 'number', min: 18, max: 110, suffix: 'years' },
  { key: 'height_cm', label: 'Height', type: 'number', min: 100, max: 230, suffix: 'cm' },
  { key: 'weight_kg', label: 'Weight', type: 'number', min: 30,  max: 250, suffix: 'kg', step: 0.1 },
];

const PROFILE_QUESTIONS = [
  { key: 'activity_level', label: 'Activity outside training', type: 'single', options: [
      { value: 'sedentary', label: 'Sedentary' },
      { value: 'light',     label: 'Lightly active' },
      { value: 'moderate',  label: 'Moderately active' },
      { value: 'very',      label: 'Very active' },
      { value: 'extreme',   label: 'Extremely active' },
  ]},
  { key: 'eating_style',   label: 'Eating style',              type: 'single', options: [
      { value: 'balanced',     label: 'Balanced' },
      { value: 'high_protein', label: 'High protein' },
      { value: 'mediterranean',label: 'Mediterranean' },
      { value: 'low_carb',     label: 'Low carb' },
      { value: 'keto',         label: 'Keto' },
      { value: 'carnivore',    label: 'Carnivore' },
      { value: 'plant_based',  label: 'Plant-based' },
  ]},
  { key: 'goal',           label: 'Primary goal',              type: 'single', options: [
      { value: 'move_pain_free', label: 'Move without pain' },
      { value: 'mobility',       label: 'Get more mobile' },
      { value: 'strength',       label: 'Build strength' },
      { value: 'sport',          label: 'Improve at my sport' },
      { value: 'active_healthy', label: 'Stay active + healthy' },
  ]},
  { key: 'sport',          label: 'Sport',                     type: 'single', options: [
      { value: 'none',       label: 'No sport' },
      { value: 'pickleball', label: 'Pickleball' },
      { value: 'tennis',     label: 'Tennis' },
      { value: 'golf',       label: 'Golf' },
      { value: 'running',    label: 'Running' },
      { value: 'other',      label: 'Other' },
  ]},
  { key: 'experience',     label: 'Training experience',       type: 'single', options: [
      { value: 'just_starting', label: 'Just starting out' },
      { value: 'occasional',    label: 'Occasionally active' },
      { value: 'consistent',    label: 'Training consistently' },
      { value: 'advanced',      label: 'Advanced / athletic' },
  ]},
  { key: 'equipment',      label: 'Where you train',           type: 'single', options: [
      { value: 'home_bodyweight', label: 'Home (bodyweight)' },
      { value: 'home_basics',     label: 'Home (basics)' },
      { value: 'home_gym',        label: 'Home gym' },
      { value: 'full_gym',        label: 'Full commercial gym' },
  ]},
  { key: 'days',           label: 'Training days / week',      type: 'single', options: [
      { value: 1, label: '1 day' }, { value: 2, label: '2 days' }, { value: 3, label: '3 days' },
      { value: 4, label: '4 days' }, { value: 5, label: '5 days' }, { value: 6, label: '6 days' },
      { value: 7, label: 'Every day' },
  ]},
  { key: 'injuries',       label: 'Injuries / areas to mind',  type: 'multi', options: [
      { value: 'none',     label: 'None' },
      { value: 'knee',     label: 'Knee' },
      { value: 'back',     label: 'Back' },
      { value: 'shoulder', label: 'Shoulder' },
      { value: 'hip',      label: 'Hip' },
      { value: 'neck',     label: 'Neck' },
      { value: 'wrist',    label: 'Wrist' },
  ]},
];

// BMI number is shown but no judgement label - "Overweight" / "Obese"
// pills triggered clients. Coach can still read the number; client
// gets factual data without the chip telling them how to feel.

const renderAnswer = (q, value) => {
  if (value == null || (Array.isArray(value) && value.length === 0)) return null;
  if (q.type === 'multi') {
    return value.map(v => q.options.find(o => o.value === v)?.label || v).join(', ');
  }
  if (q.type === 'single') {
    return q.options.find(o => o.value === value)?.label || String(value);
  }
  if (q.type === 'number') {
    return q.suffix ? `${value} ${q.suffix}` : String(value);
  }
  return String(value);
};

function MyProfilePage({ onBack, token, user, initialProfile, scrollTarget, onScrollHandled }) {
  const [answers, setAnswers] = useState(null);
  const [profile, setProfile] = useState(initialProfile || null);
  const [editing, setEditing] = useState(null); // question key being edited
  const nutritionRef = useRef(null);

  const fetchAnswers = () => {
    fetch('/api/onboarding/answers', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : {})
      .then(setAnswers)
      .catch(() => {});
  };
  const fetchProfile = () => {
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : {})
      .then(d => { if (d?.profile) setProfile(d.profile); })
      .catch(() => {});
  };
  useEffect(fetchAnswers, [token]);
  useEffect(() => { if (!initialProfile) fetchProfile(); }, [token]);

  // Deep-link scroll: when entered via /profile?section=nutrition, jump
  // to the nutrition block once it has rendered (waits for profile +
  // answers to load so the ref is mounted).
  useEffect(() => {
    if (scrollTarget !== 'nutrition' || !profile || !answers) return;
    const t = setTimeout(() => {
      nutritionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      onScrollHandled?.();
    }, 80);
    return () => clearTimeout(t);
  }, [scrollTarget, profile, answers, onScrollHandled]);

  if (!answers) return <div className="page-content"><p style={{ color: 'var(--text-tertiary)', padding: 24 }}>Loading…</p></div>;

  const bmi = answers.bmi;
  const editingQ =
    PROFILE_QUESTIONS.find(q => q.key === editing)
    || VITAL_QUESTIONS.find(q => q.key === editing);

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>My Profile</h1>
      </div>

      {/* Header card. Each vital metric (age + sex pill, height, weight)
          is a tap target that opens the same ProfileFieldEditor used by
          the lifestyle rows below. Sex toggles between M/F via the (M)/(F)
          pill - tapping that opens the sex editor. The pencil icon in the
          top-right is decorative; the metrics themselves are the click
          surface. */}
      <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '24px 20px', position: 'relative' }}>
        <button
          onClick={() => setEditing('weight_kg')}
          aria-label="Edit vitals"
          style={{
            position: 'absolute', top: 14, right: 14,
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>

        <div style={{
          width: 96, height: 96, borderRadius: '50%', margin: '0 auto 14px',
          background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, fontWeight: 800, color: '#fff',
        }}>
          {user?.name?.[0]?.toUpperCase() || '?'}
        </div>
        <p style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>{user?.name || 'You'}</p>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 14, fontSize: 13, color: 'var(--text-secondary)', marginBottom: bmi != null ? 12 : 0 }}>
          {(answers.age != null || answers.sex != null) && (
            <button onClick={() => setEditing('age')} style={vitalBtn}>
              {answers.age != null ? <strong style={vitalNum}>{answers.age}</strong> : <span style={vitalEmpty}>Add age</span>}
              {answers.sex && (
                <span
                  onClick={(e) => { e.stopPropagation(); setEditing('sex'); }}
                  style={{ color: 'var(--text-tertiary)' }}
                > ({answers.sex === 'female' ? 'F' : 'M'})</span>
              )}
            </button>
          )}
          {answers.height_cm != null ? (
            <button onClick={() => setEditing('height_cm')} style={vitalBtn}>
              <strong style={vitalNum}>{answers.height_cm}</strong> cm
            </button>
          ) : (
            <button onClick={() => setEditing('height_cm')} style={vitalBtn}>
              <span style={vitalEmpty}>Add height</span>
            </button>
          )}
          {answers.weight_kg != null ? (
            <button onClick={() => setEditing('weight_kg')} style={vitalBtn}>
              <strong style={vitalNum}>{answers.weight_kg}</strong> kg
            </button>
          ) : (
            <button onClick={() => setEditing('weight_kg')} style={vitalBtn}>
              <span style={vitalEmpty}>Add weight</span>
            </button>
          )}
        </div>

        {bmi != null && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            BMI <strong style={{ color: 'var(--text-primary)' }}>{bmi}</strong>
          </p>
        )}
      </div>

      {/* Question rows */}
      <div className="card" style={{ padding: 0 }}>
        {PROFILE_QUESTIONS.map((q, i) => {
          const answer = renderAnswer(q, answers[q.key]);
          return (
            <div
              key={q.key}
              onClick={() => setEditing(q.key)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '14px 16px', cursor: 'pointer',
                borderBottom: i < PROFILE_QUESTIONS.length - 1 ? '1px solid var(--divider)' : 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{q.label}</p>
                <p style={{ fontSize: 15, fontWeight: answer ? 600 : 500, color: answer ? 'var(--text-primary)' : 'var(--accent-mint)' }}>
                  {answer || 'Add Answer'}
                </p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 4 }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          );
        })}
      </div>

      {/* Nutrition Targets - merged in 2026-04-28. Inputs (sex/age/height/
          weight in the top card; activity/eating in the question rows)
          drive PATCH /api/onboarding/answers which auto-recomputes the
          targets server-side. This section just shows the live result
          + lets the user override manually via targets_custom. The ref
          is the deep-link scroll target from Home's DailyTargetsCard. */}
      {profile && (
        <div ref={nutritionRef}>
          <NutritionTargetsSection
            profile={profile}
            token={token}
            onSaved={() => { fetchProfile(); fetchAnswers(); }}
          />
        </div>
      )}

      {/* Edit modal */}
      {editingQ && (
        <ProfileFieldEditor
          question={editingQ}
          currentValue={answers[editing]}
          token={token}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchAnswers(); fetchProfile(); }}
        />
      )}
    </div>
  );
}

function ProfileFieldEditor({ question, currentValue, token, onClose, onSaved }) {
  const [value, setValue] = useState(currentValue ?? (question.type === 'multi' ? [] : ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setSaving(true); setError(null);
    let payloadValue = value;
    if (question.type === 'number') {
      const n = parseFloat(value);
      if (Number.isNaN(n)) { setError('Enter a number'); setSaving(false); return; }
      if (question.min != null && n < question.min) { setError(`Min: ${question.min}`); setSaving(false); return; }
      if (question.max != null && n > question.max) { setError(`Max: ${question.max}`); setSaving(false); return; }
      payloadValue = n;
    }
    try {
      const r = await fetch('/api/onboarding/answers', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: question.key, value: payloadValue }),
      });
      if (!r.ok) throw new Error('save');
      onSaved();
    } catch (e) { setError('Could not save. Try again.'); setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 480, margin: '0 auto', padding: '16px 16px 32px',
        maxHeight: '80vh', overflow: 'auto',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{question.label}</h3>

        {question.type === 'number' && (
          <input
            type="number"
            min={question.min}
            max={question.max}
            step={question.step || 1}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={question.suffix}
            className="input-field"
            style={{ marginBottom: 12, fontSize: 16 }}
            autoFocus
          />
        )}

        {question.type === 'single' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {question.options.map(opt => {
              const selected = value === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setValue(opt.value)}
                  style={{
                    padding: '12px 14px', borderRadius: 10,
                    border: selected ? '2px solid var(--accent)' : '1px solid var(--divider)',
                    background: selected ? 'rgba(255,140,0,0.10)' : 'transparent',
                    color: 'var(--text-primary)', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >{opt.label}</button>
              );
            })}
          </div>
        )}

        {question.type === 'multi' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {question.options.map(opt => {
              const selected = Array.isArray(value) && value.includes(opt.value);
              const toggle = () => {
                const arr = Array.isArray(value) ? value : [];
                if (opt.value === 'none') { setValue(['none']); return; }
                const without = arr.filter(v => v !== 'none');
                if (without.includes(opt.value)) setValue(without.filter(v => v !== opt.value));
                else setValue([...without, opt.value]);
              };
              return (
                <button
                  key={opt.value}
                  onClick={toggle}
                  style={{
                    padding: '12px 14px', borderRadius: 10,
                    border: selected ? '2px solid var(--accent)' : '1px solid var(--divider)',
                    background: selected ? 'rgba(255,140,0,0.10)' : 'transparent',
                    color: 'var(--text-primary)', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >{opt.label}</button>
              );
            })}
          </div>
        )}

        {error && <p style={{ color: 'var(--accent-orange)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary" style={{ flex: 2 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NutritionTargetsSection({ profile, token, onSaved }) {
  const [targetsCustom, setTargetsCustom] = useState(profile.targets_custom ? 1 : 0);
  const [overrides, setOverrides] = useState({
    calorie_target: profile.calorie_target || '',
    protein_target: profile.protein_target || '',
    fat_target: profile.fat_target || '',
    carbs_target: profile.carbs_target || '',
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  // Sync local state when the upstream profile refreshes (after a
  // BMR-input change in the question rows above).
  useEffect(() => {
    setTargetsCustom(profile.targets_custom ? 1 : 0);
    setOverrides({
      calorie_target: profile.calorie_target || '',
      protein_target: profile.protein_target || '',
      fat_target: profile.fat_target || '',
      carbs_target: profile.carbs_target || '',
    });
  }, [profile.targets_custom, profile.calorie_target, profile.protein_target, profile.fat_target, profile.carbs_target]);

  // Live preview. In auto mode, recompute from the profile's current
  // BMR inputs. In custom mode, mirror the override fields the user is
  // typing into so the number moves under their input.
  const preview = useMemo(() => {
    if (targetsCustom) {
      return {
        calorie_target: Number(overrides.calorie_target) || 0,
        protein_target: Number(overrides.protein_target) || 0,
        fat_target: Number(overrides.fat_target) || 0,
        carbs_target: Number(overrides.carbs_target) || 0,
        bmr: null, tdee: null,
        style: EATING_STYLES.find(s => s.value === profile.eating_style) || EATING_STYLES[0],
      };
    }
    return calculateTargets({
      sex: profile.sex,
      weight_kg: Number(profile.weight_kg),
      height_cm: Number(profile.height_cm),
      age: Number(profile.age),
      activity_level: profile.activity_level,
      eating_style: profile.eating_style,
    });
  }, [targetsCustom, overrides, profile.sex, profile.weight_kg, profile.height_cm, profile.age, profile.activity_level, profile.eating_style]);

  const setOverride = (k, v) => setOverrides(prev => ({ ...prev, [k]: v }));

  // Save the toggle + override values. The biology/lifestyle fields are
  // edited via the question rows above (which PATCH onboarding/answers
  // and auto-recompute server-side) so this only sends targets_custom +
  // the four override numbers when custom is on.
  const save = async () => {
    setSaving(true); setSavedAt(null);
    try {
      const body = { targets_custom: targetsCustom };
      if (targetsCustom) {
        body.calorie_target = Number(overrides.calorie_target) || null;
        body.protein_target = Number(overrides.protein_target) || null;
        body.fat_target = Number(overrides.fat_target) || null;
        body.carbs_target = Number(overrides.carbs_target) || null;
      }
      const res = await fetch('/api/nutrition/targets', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      setSavedAt(Date.now());
      onSaved?.();
    } catch (err) {
      console.error('Nutrition save error:', err);
      alert('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  // Detect unsaved changes so the Save button only highlights when
  // there's something to save (the toggle moved or an override differs
  // from the profile snapshot).
  const dirty =
    targetsCustom !== (profile.targets_custom ? 1 : 0)
    || (targetsCustom && (
      Number(overrides.calorie_target) !== (profile.calorie_target || 0)
      || Number(overrides.protein_target) !== (profile.protein_target || 0)
      || Number(overrides.fat_target) !== (profile.fat_target || 0)
      || Number(overrides.carbs_target) !== (profile.carbs_target || 0)
    ));

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 }}>
        Nutrition Targets
      </p>

      {/* Live preview */}
      <div className="card" style={{ marginBottom: 12, padding: 18, textAlign: 'center', background: 'rgba(133,255,186,0.06)', border: '1px solid rgba(133,255,186,0.22)' }}>
        <p style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(133,255,186,0.85)', fontWeight: 800 }}>YOUR DAILY TARGETS</p>
        {preview.calorie_target ? (
          <>
            <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-primary)', marginTop: 6, lineHeight: 1 }}>
              {preview.calorie_target.toLocaleString()} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)' }}>kcal</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 14, gap: 8 }}>
              <NutritionMacroPill label="Protein" grams={preview.protein_target} color="#FF6B9D" />
              <NutritionMacroPill label="Fat"     grams={preview.fat_target}     color="#FFD166" />
              <NutritionMacroPill label="Carbs"   grams={preview.carbs_target}   color="#85FFBA" />
            </div>
            {preview.bmr != null && !targetsCustom && (
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12 }}>
                BMR {preview.bmr} kcal · TDEE {preview.tdee} kcal · {preview.style.label} split
              </p>
            )}
            {Boolean(targetsCustom) && (
              <p style={{ fontSize: 11, color: 'var(--accent)', marginTop: 12, fontWeight: 700 }}>
                Custom override - auto-recompute is OFF
              </p>
            )}
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>
            Fill in sex, age, height and weight above to see your targets.
          </p>
        )}
      </div>

      {/* Auto / Custom toggle */}
      <div className="card" style={{ marginBottom: 12, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 700 }}>Use custom targets</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            Off = auto-calculate from your stats above. On = enter your own kcal & macros.
          </p>
        </div>
        <button
          onClick={() => setTargetsCustom(targetsCustom ? 0 : 1)}
          style={{
            width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
            background: targetsCustom ? 'var(--accent)' : 'var(--divider)', transition: 'background 0.2s',
            flexShrink: 0,
          }}
        >
          <div style={{
            width: 20, height: 20, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 2, left: targetsCustom ? 22 : 2, transition: 'left 0.2s',
          }} />
        </button>
      </div>

      {/* Custom override inputs (only when toggle is on) */}
      {targetsCustom === 1 ? (
        <div className="card" style={{ marginBottom: 12, padding: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 1, marginBottom: 12 }}>CUSTOM TARGETS</p>
          <FieldRow label="Calories (kcal)">
            <input type="number" min={0} max={6000} inputMode="numeric" value={overrides.calorie_target} onChange={e => setOverride('calorie_target', e.target.value)} style={ntFieldStyle} />
          </FieldRow>
          <FieldRow label="Protein (g)">
            <input type="number" min={0} max={500} inputMode="numeric" value={overrides.protein_target} onChange={e => setOverride('protein_target', e.target.value)} style={ntFieldStyle} />
          </FieldRow>
          <FieldRow label="Fat (g)">
            <input type="number" min={0} max={400} inputMode="numeric" value={overrides.fat_target} onChange={e => setOverride('fat_target', e.target.value)} style={ntFieldStyle} />
          </FieldRow>
          <FieldRow label="Carbs (g)">
            <input type="number" min={0} max={700} inputMode="numeric" value={overrides.carbs_target} onChange={e => setOverride('carbs_target', e.target.value)} style={ntFieldStyle} />
          </FieldRow>
        </div>
      ) : null}

      {Boolean(dirty || savedAt) && (
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="btn-primary"
          style={{ width: '100%', marginTop: 4, opacity: saving || !dirty ? 0.6 : 1 }}
        >
          {saving ? 'Saving...' : savedAt && !dirty ? 'Saved ✓' : 'Save targets'}
        </button>
      )}

      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
        Calculated using the Mifflin-St Jeor formula. Update sex / age / height / weight / activity above to recompute automatically.
      </p>
    </div>
  );
}

function NutritionMacroPill({ label, grams, color }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{grams}g</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function FieldRow({ label, right, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</label>
        {right}
      </div>
      {children}
    </div>
  );
}

const vitalBtn = {
  background: 'transparent', border: 'none', padding: '6px 4px',
  fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'baseline', gap: 4,
  borderRadius: 6,
};

const vitalNum = { color: 'var(--text-primary)', fontSize: 16, fontWeight: 800 };

const vitalEmpty = { color: 'var(--accent-mint)', fontWeight: 700 };

const ntFieldStyle = {
  width: '100%',
  padding: '12px 14px',
  fontSize: 18,
  fontWeight: 700,
  background: 'rgba(255,255,255,0.05)',
  border: '1.5px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  outline: 'none',
};
