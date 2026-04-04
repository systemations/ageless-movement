import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFavourites } from '../../context/FavouritesContext';
import FavButton from '../../components/FavButton';

export default function FavouritesPage() {
  const navigate = useNavigate();
  const { favourites } = useFavourites();
  const [activeTab, setActiveTab] = useState('Workouts');

  const workoutFavs = favourites.filter(f => f.item_type === 'workout' || f.item_type === 'program');
  const recipeFavs = favourites.filter(f => f.item_type === 'recipe');
  const filtered = activeTab === 'Workouts' ? workoutFavs : recipeFavs;

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
        filtered.map((fav) => (
          <div key={`${fav.item_type}-${fav.item_id}`} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0',
            borderBottom: '1px solid var(--divider)',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--divider)',
            }}>
              <span style={{ fontSize: 22, opacity: 0.3 }}>{activeTab === 'Workouts' ? '🏋️' : '🍽️'}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fav.item_title || `${fav.item_type} #${fav.item_id}`}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fav.item_meta || fav.item_type}</p>
            </div>
            <FavButton itemType={fav.item_type} itemId={fav.item_id} itemTitle={fav.item_title} itemMeta={fav.item_meta} />
          </div>
        ))
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
