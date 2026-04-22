import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFavourites } from '../../context/FavouritesContext';
import { useAuth } from '../../context/AuthContext';
import FavButton from '../../components/FavButton';
import { MiniThumb } from '../../components/WorkoutThumb';
import { invalidateTodayCache } from '../../components/EnhancedToday';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const todayIso = () => new Date().toISOString().split('T')[0];

export default function FavouritesPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { favourites } = useFavourites();
  const [activeTab, setActiveTab] = useState('Workouts');
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);
  const [recipePicker, setRecipePicker] = useState(null); // fav being added

  const workoutFavs = favourites.filter(f => f.item_type === 'workout' || f.item_type === 'program');
  const recipeFavs = favourites.filter(f => f.item_type === 'recipe');
  const filtered = activeTab === 'Workouts' ? workoutFavs : recipeFavs;

  const showToast = (msg, kind = 'success') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2200);
  };

  const addWorkoutToToday = async (fav) => {
    if (fav.item_type !== 'workout') {
      // Programs aren't date-schedulable directly — send the user to the program page.
      navigate(`/explore?program=${fav.item_id}`);
      return;
    }
    const key = `${fav.item_type}-${fav.item_id}`;
    setBusyId(key);
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workout_id: fav.item_id, scheduled_date: todayIso() }),
      });
      if (res.status === 409) {
        showToast('Already on today\u2019s calendar.', 'warn');
      } else if (res.ok) {
        invalidateTodayCache();
        showToast('Added to today.');
      } else {
        showToast('Could not add. Try again.', 'error');
      }
    } catch (err) {
      showToast('Network error.', 'error');
    }
    setBusyId(null);
  };

  const addRecipeToToday = async (fav, mealType) => {
    const key = `${fav.item_type}-${fav.item_id}`;
    setBusyId(key);
    try {
      // Fetch full recipe so macros log correctly
      const r = await fetch(`/api/nutrition/recipes/${fav.item_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const recipe = r.ok ? await r.json() : null;
      const payload = {
        date: todayIso(),
        meal_type: mealType,
        food_name: recipe?.name || fav.item_title,
        calories: recipe?.calories || 0,
        protein: recipe?.protein || 0,
        fat: recipe?.fat || 0,
        carbs: recipe?.carbs || 0,
        serving_size: recipe?.serving_size || '',
      };
      const res = await fetch('/api/nutrition/diary', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast(`Added to ${mealType}.`);
      } else {
        showToast('Could not log recipe.', 'error');
      }
    } catch (err) {
      showToast('Network error.', 'error');
    }
    setBusyId(null);
    setRecipePicker(null);
  };

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1, textAlign: 'center' }}>Favourites</h1>
        <div style={{ width: 36 }} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" style={{ margin: '0 auto 12px' }}>
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
          </svg>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>No {activeTab.toLowerCase()} favourited</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Tap the heart icon on {activeTab.toLowerCase()} to save them here</p>
        </div>
      ) : (
        filtered.map((fav) => {
          const key = `${fav.item_type}-${fav.item_id}`;
          const busy = busyId === key;
          return (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0',
            borderBottom: '1px solid var(--divider)',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
              background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--divider)',
            }}>
              {fav.image_url ? (
                <img src={fav.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <MiniThumb title={fav.item_title || 'Item'} size={56} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fav.item_title || `${fav.item_type} #${fav.item_id}`}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fav.item_meta || fav.item_type}</p>
            </div>
            <button
              onClick={() => fav.item_type === 'recipe' ? setRecipePicker(fav) : addWorkoutToToday(fav)}
              disabled={busy}
              style={{
                padding: '6px 12px', borderRadius: 16, border: 'none',
                background: 'var(--accent-mint)', color: '#000',
                fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap',
              }}
            >
              {busy ? '...' : '+ Today'}
            </button>
            <FavButton itemType={fav.item_type} itemId={fav.item_id} itemTitle={fav.item_title} itemMeta={fav.item_meta} />
          </div>
        );})
      )}

      {/* Meal-type picker for recipes */}
      {recipePicker && (
        <div
          onClick={() => setRecipePicker(null)}
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
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--divider)', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Log to today as</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {recipePicker.item_title}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MEAL_TYPES.map(mt => (
                <button
                  key={mt}
                  onClick={() => addRecipeToToday(recipePicker, mt)}
                  style={{
                    padding: '14px 16px', borderRadius: 12, border: 'none', textAlign: 'left',
                    background: 'var(--bg-hover, rgba(255,255,255,0.04))', color: 'var(--text-primary)',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                  }}
                >
                  {mt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 140, left: '50%', transform: 'translateX(-50%)',
          background: toast.kind === 'error' ? '#FF453A' : toast.kind === 'warn' ? '#FF9500' : 'var(--accent-mint)',
          color: toast.kind === 'success' ? '#000' : '#fff',
          fontSize: 13, fontWeight: 700, padding: '10px 16px', borderRadius: 20,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 250, whiteSpace: 'nowrap',
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 0, background: 'var(--bg-card)', borderRadius: 50,
        padding: 4, maxWidth: 240, width: 'calc(100% - 32px)',
      }}>
        {['Workouts', 'Recipes'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            flex: 1, padding: '10px 0', borderRadius: 50, fontSize: 13, fontWeight: 600,
            background: activeTab === tab ? 'var(--accent)' : 'transparent',
            color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
            border: 'none',
          }}>{tab}</button>
        ))}
      </div>
    </div>
  );
}
