import { useFavourites } from '../context/FavouritesContext';

export default function FavButton({ itemType, itemId, itemTitle, itemMeta, size = 20, style = {} }) {
  const { isFavourited, toggleFavourite } = useFavourites();
  const fav = isFavourited(itemType, itemId);

  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggleFavourite(itemType, itemId, itemTitle, itemMeta); }}
      style={{
        background: 'none', border: 'none', padding: 4, cursor: 'pointer',
        color: fav ? '#FF453A' : 'var(--text-tertiary)', transition: 'color 0.2s, transform 0.2s',
        transform: fav ? 'scale(1.1)' : 'scale(1)', ...style,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24"
        fill={fav ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
      </svg>
    </button>
  );
}
