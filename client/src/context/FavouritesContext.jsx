import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const FavouritesContext = createContext(null);

export function FavouritesProvider({ children }) {
  const { token, user } = useAuth();
  const [favourites, setFavourites] = useState([]);

  useEffect(() => {
    if (token && user) fetchFavourites();
  }, [token, user]);

  const fetchFavourites = async () => {
    try {
      const res = await fetch('/api/favourites', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setFavourites(data.favourites);
      }
    } catch (err) { console.error(err); }
  };

  const isFavourited = (itemType, itemId) => {
    return favourites.some(f => f.item_type === itemType && f.item_id === itemId);
  };

  const toggleFavourite = async (itemType, itemId, itemTitle, itemMeta) => {
    // Optimistic update
    const wasFav = isFavourited(itemType, itemId);
    if (wasFav) {
      setFavourites(prev => prev.filter(f => !(f.item_type === itemType && f.item_id === itemId)));
    } else {
      setFavourites(prev => [...prev, { item_type: itemType, item_id: itemId, item_title: itemTitle, item_meta: itemMeta }]);
    }

    try {
      await fetch('/api/favourites/toggle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_type: itemType, item_id: itemId, item_title: itemTitle, item_meta: itemMeta }),
      });
    } catch (err) {
      // Revert on error
      fetchFavourites();
    }
  };

  const getFavsByType = (type) => favourites.filter(f => f.item_type === type);

  return (
    <FavouritesContext.Provider value={{ favourites, isFavourited, toggleFavourite, getFavsByType }}>
      {children}
    </FavouritesContext.Provider>
  );
}

export const useFavourites = () => useContext(FavouritesContext);
