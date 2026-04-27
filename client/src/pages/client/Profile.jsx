import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ChevronRight } from '../../components/Icons';
import {
  ACTIVITY_LEVELS,
  EATING_STYLES,
  SEX_OPTIONS,
  calculateTargets,
  cmToFtIn,
  ftInToCm,
  kgToLbs,
  lbsToKg,
} from '../../lib/nutritionTargets';

export default function Profile({ onBack }) {
  const { user, token, profile, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [appearance, setAppearance] = useState(theme);
  const [showSubPage, setShowSubPage] = useState(null);
  const [unitSystem, setUnitSystem] = useState({ weight: 'kg', height: 'cm' });
  const [reminders, setReminders] = useState({
    workout_reminder: true,
    meal_logging: true,
    water_intake: false,
    daily_checkin: false,
    weekly_checkin: true,
    supplement_reminder: true,
  });
  const [remindersLoaded, setRemindersLoaded] = useState(false);
  const [password, setPassword] = useState({ current: '', newPw: '', confirm: '' });
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
  }, []);

  // Sub-pages
  if (showSubPage === 'nutrition') {
    return <NutritionTargetsPage onBack={() => setShowSubPage(null)} token={token} initialProfile={profile} />;
  }

  if (showSubPage === 'reminders') {
    const toggleReminder = async (key) => {
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Reminders</h1>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          Choose which notifications and check-ins you'd like to receive.
        </p>

        {[
          { key: 'workout_reminder', label: 'Workout Reminder', desc: 'Daily nudge to complete your session', icon: '🏋️' },
          { key: 'meal_logging', label: 'Meal Logging', desc: 'Remind to log your meals', icon: '🍖' },
          { key: 'supplement_reminder', label: 'Supplement Reminder', desc: 'Daily reminder to take your supps', icon: '💊' },
          { key: 'water_intake', label: 'Water Intake', desc: 'Periodic water intake reminders', icon: '💧' },
          { key: 'daily_checkin', label: 'Daily Check-in', desc: 'Log sleep, energy, soreness & mood each day', icon: '📋' },
          { key: 'weekly_checkin', label: 'Weekly Check-in', desc: 'Submit progress photos & measurements weekly', icon: '📊' },
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
              background: reminders[key] ? 'var(--accent-mint)' : 'var(--divider)', transition: 'background 0.2s',
              flexShrink: 0, marginLeft: 12,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 2, left: reminders[key] ? 22 : 2, transition: 'left 0.2s',
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
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
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowSubPage(null)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Change Password</h1>
        </div>
        <div className="input-group"><label>Current Password</label><input type="password" className="input-field" value={password.current} onChange={e => setPassword({...password, current: e.target.value})} /></div>
        <div className="input-group"><label>New Password</label><input type="password" className="input-field" value={password.newPw} onChange={e => setPassword({...password, newPw: e.target.value})} /></div>
        <div className="input-group"><label>Confirm Password</label><input type="password" className="input-field" value={password.confirm} onChange={e => setPassword({...password, confirm: e.target.value})} /></div>
        <button className="btn-primary" onClick={() => { alert('Password updated!'); setShowSubPage(null); }}>Update Password</button>
      </div>
    );
  }

  if (showSubPage === 'appearance') {
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowSubPage(null)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Connected Apps</h1>
        </div>
        {[{ name: 'Apple Health', icon: '❤️', connected: false }, { name: 'Apple Watch', icon: '⌚', connected: false }, { name: 'Google Fit', icon: '💚', connected: false }].map(app => (
          <div key={app.name} className="card-sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>{app.icon}</span>
              <div>
                <p style={{ fontSize: 15, fontWeight: 500 }}>{app.name}</p>
                <p style={{ fontSize: 12, color: app.connected ? 'var(--success)' : 'var(--text-tertiary)' }}>{app.connected ? 'Connected' : 'Not connected'}</p>
              </div>
            </div>
            <button style={{ background: app.connected ? 'var(--bg-card)' : 'var(--accent-mint)', border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: app.connected ? 'var(--text-secondary)' : '#000' }}>
              {app.connected ? 'Disconnect' : 'Connect'}
            </button>
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
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
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            </>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          { icon: '🥗', label: 'Nutrition Targets', action: () => setShowSubPage('nutrition') },
          { icon: '🔔', label: 'Reminders', action: () => setShowSubPage('reminders') },
          { icon: '📏', label: 'Measurement Goals', action: () => navigate('/progress') },
          { icon: '⌚', label: 'Connected Apps', action: () => setShowSubPage('connected') },
          { icon: '🔄', label: 'Unit System', action: () => setShowSubPage('units') },
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

      {/* References */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div onClick={() => alert('Health recommendation sources: WHO, ACSM, NHS guidelines')} style={{ padding: '14px 0', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>🔗</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>References</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, marginLeft: 30 }}>
            Learn more about sources of health recommendations
          </p>
        </div>
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
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 0.5, marginBottom: 4 }}>
          MEMBERSHIP
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          No plan on file yet. Your coach will set this up.
        </p>
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

// ── Nutrition Targets sub-page ─────────────────────────────────────
// Lets the client review + edit the inputs that drive their daily
// calorie / macro targets. Live recompute as fields change so the
// numbers move under the input (no surprise on save). Custom toggle
// switches off auto-recompute for clients on coach-prescribed plans.
//
// Storage: cm + kg always. The unit toggles only flip what the
// inputs accept, conversion happens before commit. Server runs the
// same calc + writes the same fields, so a tampered request can't
// underwrite calories without underwriting the inputs too.
function NutritionTargetsPage({ onBack, token, initialProfile }) {
  const [profile, setProfile] = useState(initialProfile || null);
  const [loading, setLoading] = useState(!initialProfile);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [heightUnit, setHeightUnit] = useState('cm');
  const [weightUnit, setWeightUnit] = useState('kg');

  // Local edit state — committed on Save. Pulled from profile on mount
  // and on each refresh after save so manual overrides land back here.
  const [form, setForm] = useState({
    sex: '', age: '', height_cm: '', weight_kg: '',
    activity_level: 'moderate', eating_style: 'balanced',
    targets_custom: 0,
    calorie_target: '', protein_target: '', fat_target: '', carbs_target: '',
  });

  // Hydrate form from profile.
  useEffect(() => {
    if (!profile) return;
    setForm({
      sex: profile.sex || '',
      age: profile.age || '',
      height_cm: profile.height_cm || '',
      weight_kg: profile.weight_kg || '',
      activity_level: profile.activity_level || 'moderate',
      eating_style: profile.eating_style || 'balanced',
      targets_custom: profile.targets_custom ? 1 : 0,
      calorie_target: profile.calorie_target || '',
      protein_target: profile.protein_target || '',
      fat_target: profile.fat_target || '',
      carbs_target: profile.carbs_target || '',
    });
  }, [profile]);

  // If we didn't get the profile from auth context (race or stale),
  // fetch it on mount so the form has fresh data.
  useEffect(() => {
    if (initialProfile) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setProfile(d.profile); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token, initialProfile]);

  // Live preview of computed targets — overrides the form's manual
  // values whenever auto mode is on. Keeps the visible number in sync
  // with the inputs without waiting for a save.
  const preview = useMemo(() => {
    if (form.targets_custom) {
      return {
        calorie_target: Number(form.calorie_target) || 0,
        protein_target: Number(form.protein_target) || 0,
        fat_target: Number(form.fat_target) || 0,
        carbs_target: Number(form.carbs_target) || 0,
        bmr: null, tdee: null,
        style: EATING_STYLES.find(s => s.value === form.eating_style) || EATING_STYLES[0],
      };
    }
    return calculateTargets({
      sex: form.sex,
      weight_kg: Number(form.weight_kg),
      height_cm: Number(form.height_cm),
      age: Number(form.age),
      activity_level: form.activity_level,
      eating_style: form.eating_style,
    });
  }, [form]);

  const ftIn = cmToFtIn(Number(form.height_cm));
  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    setSavedAt(null);
    try {
      const body = {
        sex: form.sex || null,
        age: form.age ? Number(form.age) : null,
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        activity_level: form.activity_level,
        eating_style: form.eating_style,
        targets_custom: form.targets_custom ? 1 : 0,
      };
      if (form.targets_custom) {
        body.calorie_target = Number(form.calorie_target) || null;
        body.protein_target = Number(form.protein_target) || null;
        body.fat_target = Number(form.fat_target) || null;
        body.carbs_target = Number(form.carbs_target) || null;
      }
      const res = await fetch('/api/nutrition/targets', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      if (data.profile) setProfile(data.profile);
      setSavedAt(Date.now());
    } catch (err) {
      console.error('Nutrition save error:', err);
      alert('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-content">
        <p style={{ color: 'var(--text-tertiary)' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Nutrition Targets</h1>
      </div>

      {/* Daily total card — live preview */}
      <div className="card" style={{ marginBottom: 16, padding: 18, textAlign: 'center', background: 'rgba(133,255,186,0.06)', border: '1px solid rgba(133,255,186,0.22)' }}>
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
            {preview.bmr != null && !form.targets_custom && (
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12 }}>
                BMR {preview.bmr} kcal · TDEE {preview.tdee} kcal · {preview.style.label} split
              </p>
            )}
            {form.targets_custom && (
              <p style={{ fontSize: 11, color: 'var(--accent)', marginTop: 12, fontWeight: 700 }}>
                Custom override — auto-recompute is OFF
              </p>
            )}
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>
            Fill in your sex, age, height and weight below to see your targets.
          </p>
        )}
      </div>

      {/* Auto / Custom mode toggle */}
      <div className="card" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 700 }}>Use custom targets</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            Off = auto-calculate from your stats. On = enter your own kcal & macros.
          </p>
        </div>
        <button
          onClick={() => setField('targets_custom', form.targets_custom ? 0 : 1)}
          style={{
            width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
            background: form.targets_custom ? 'var(--accent)' : 'var(--divider)', transition: 'background 0.2s',
            flexShrink: 0,
          }}
        >
          <div style={{
            width: 20, height: 20, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 2, left: form.targets_custom ? 22 : 2, transition: 'left 0.2s',
          }} />
        </button>
      </div>

      {/* Inputs that feed BMR */}
      <div className="card" style={{ marginBottom: 12, padding: 16 }}>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 1, marginBottom: 12 }}>BIOLOGY</p>

        <FieldRow label="Biological sex">
          <SelectPills
            options={SEX_OPTIONS}
            value={form.sex}
            onChange={v => setField('sex', v)}
          />
        </FieldRow>

        <FieldRow label="Age">
          <input
            type="number" min={18} max={110} inputMode="numeric"
            value={form.age}
            onChange={e => setField('age', e.target.value)}
            style={ntFieldStyle}
          />
        </FieldRow>

        <FieldRow label="Height" right={
          <UnitPills options={['cm', 'ft/in']} value={heightUnit} onChange={setHeightUnit} />
        }>
          {heightUnit === 'cm' ? (
            <input
              type="number" min={100} max={230} inputMode="numeric"
              value={form.height_cm}
              onChange={e => setField('height_cm', e.target.value)}
              style={ntFieldStyle}
            />
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number" min={3} max={7} inputMode="numeric"
                placeholder="ft"
                value={ftIn.ft ?? ''}
                onChange={e => {
                  const f = parseInt(e.target.value, 10);
                  if (!Number.isFinite(f)) { setField('height_cm', ''); return; }
                  setField('height_cm', ftInToCm(f, ftIn.in || 0));
                }}
                style={{ ...ntFieldStyle, flex: 1 }}
              />
              <input
                type="number" min={0} max={11} inputMode="numeric"
                placeholder="in"
                value={ftIn.in ?? ''}
                onChange={e => {
                  const i = parseInt(e.target.value, 10);
                  if (!Number.isFinite(i)) { setField('height_cm', ''); return; }
                  setField('height_cm', ftInToCm(ftIn.ft || 0, i));
                }}
                style={{ ...ntFieldStyle, flex: 1 }}
              />
            </div>
          )}
        </FieldRow>

        <FieldRow label="Weight" right={
          <UnitPills options={['kg', 'lbs']} value={weightUnit} onChange={setWeightUnit} />
        }>
          <input
            type="number" min={30} max={250} step={0.1} inputMode="decimal"
            value={
              weightUnit === 'kg'
                ? form.weight_kg
                : (form.weight_kg ? kgToLbs(Number(form.weight_kg)) : '')
            }
            onChange={e => {
              const n = parseFloat(e.target.value);
              if (!Number.isFinite(n)) { setField('weight_kg', ''); return; }
              setField('weight_kg', weightUnit === 'kg' ? n : lbsToKg(n));
            }}
            style={ntFieldStyle}
          />
        </FieldRow>
      </div>

      {/* Lifestyle inputs */}
      <div className="card" style={{ marginBottom: 12, padding: 16 }}>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 1, marginBottom: 12 }}>LIFESTYLE</p>

        <FieldRow label="Daily activity (outside training)">
          <RadioList
            options={ACTIVITY_LEVELS}
            value={form.activity_level}
            onChange={v => setField('activity_level', v)}
          />
        </FieldRow>

        <FieldRow label="Eating style">
          <RadioList
            options={EATING_STYLES}
            value={form.eating_style}
            onChange={v => setField('eating_style', v)}
          />
        </FieldRow>
      </div>

      {/* Custom override grams (only when toggle is on) */}
      {form.targets_custom ? (
        <div className="card" style={{ marginBottom: 12, padding: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 1, marginBottom: 12 }}>CUSTOM TARGETS</p>
          <FieldRow label="Calories (kcal)">
            <input type="number" min={0} max={6000} inputMode="numeric" value={form.calorie_target} onChange={e => setField('calorie_target', e.target.value)} style={ntFieldStyle} />
          </FieldRow>
          <FieldRow label="Protein (g)">
            <input type="number" min={0} max={500} inputMode="numeric" value={form.protein_target} onChange={e => setField('protein_target', e.target.value)} style={ntFieldStyle} />
          </FieldRow>
          <FieldRow label="Fat (g)">
            <input type="number" min={0} max={400} inputMode="numeric" value={form.fat_target} onChange={e => setField('fat_target', e.target.value)} style={ntFieldStyle} />
          </FieldRow>
          <FieldRow label="Carbs (g)">
            <input type="number" min={0} max={700} inputMode="numeric" value={form.carbs_target} onChange={e => setField('carbs_target', e.target.value)} style={ntFieldStyle} />
          </FieldRow>
        </div>
      ) : null}

      <button
        onClick={save}
        disabled={saving}
        className="btn-primary"
        style={{ width: '100%', marginTop: 8, opacity: saving ? 0.6 : 1 }}
      >
        {saving ? 'Saving...' : savedAt ? 'Saved ✓' : 'Save targets'}
      </button>

      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
        Calculated using the Mifflin-St Jeor formula. Your daily target updates automatically when you change weight, activity, or eating style.
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

function SelectPills({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1, padding: '12px 14px', borderRadius: 12, fontSize: 14, fontWeight: 600, border: 'none',
            background: value === opt.value ? 'var(--accent)' : 'var(--bg-card-hover, rgba(255,255,255,0.05))',
            color: value === opt.value ? '#fff' : 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >{opt.label}</button>
      ))}
    </div>
  );
}

function UnitPills({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 2 }}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: value === opt ? 'var(--accent)' : 'transparent',
            color: value === opt ? '#fff' : 'var(--text-tertiary)',
          }}
        >{opt}</button>
      ))}
    </div>
  );
}

function RadioList({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map(opt => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 10,
              background: selected ? 'rgba(255,140,0,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1.5px solid ${selected ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>{opt.label}</div>
            {opt.hint && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.4 }}>{opt.hint}</div>}
          </button>
        );
      })}
    </div>
  );
}

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
