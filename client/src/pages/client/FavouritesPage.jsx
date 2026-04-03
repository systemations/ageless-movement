import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFavourites } from '../../context/FavouritesContext';
import FavButton from '../../components/FavButton';

const tabs = ['All', 'Workouts', 'Recipes', 'Programs'];

export default function FavouritesPage() {
  const navigate = useNavigate();
  const { favourites, getFavsByType } = useFavourites();
  const [activeTab, setActiveTab] = useState('All');

  const filtered = activeTab === 'All' ? favourites : getFavsByType(activeTab.toLowerCase().slice(0, -1));

  const typeIcons = { workout: '🏋️', recipe: '🍽️', program: '📚', course: '🎓' };
  const typeColors = { workout: 'rgba(61,255,210,0.15)', recipe: 'rgba(255,149,0,0.15)', program: 'rgba(100,210,255,0.15)', course: 'rgba(191,90,242,0.15)' };

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Favourites</h1>
      </div>

      {/* Tabs */}
      <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 16px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            background: activeTab === tab ? 'var(--accent-mint)' : 'var(--bg-card)',
            color: activeTab === tab ? '#000' : 'var(--text-secondary)',
          }}>{tab}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="placeholder-page">
          <div className="placeholder-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
          </div>
          <h2>No Favourites Yet</h2>
          <p>Tap the heart icon on workouts and recipes to save them here</p>
        </div>
      ) : (
        filtered.map((fav) => (
          <div key={`${fav.item_type}-${fav.item_id}`} className="card-sm" style={{
            display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: 4,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, flexShrink: 0,
              background: typeColors[fav.item_type] || 'var(--bg-card)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>
              {typeIcons[fav.item_type] || '⭐'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fav.item_title || `${fav.item_type} #${fav.item_id}`}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                {fav.item_meta || fav.item_type}
              </p>
            </div>
            <FavButton itemType={fav.item_type} itemId={fav.item_id} itemTitle={fav.item_title} itemMeta={fav.item_meta} />
          </div>
        ))
      )}
    </div>
  );
}
