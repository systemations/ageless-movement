import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

// Shopping list display. Items are grouped by category, check off to mark done.
// "Add item" adds a free-text entry. Swipe / tap trash to remove.
export default function ShoppingListView({ listId, onBack }) {
  const { token } = useAuth();
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState('');

  useEffect(() => { fetchList(); }, [listId]);

  const fetchList = async () => {
    const res = await fetch(`/api/nutrition/shopping-lists/${listId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setList(data.list);
    setItems(data.items || []);
  };

  const toggleChecked = async (item) => {
    const checked = !item.checked;
    // Optimistic
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: checked ? 1 : 0 } : i));
    await fetch(`/api/nutrition/shopping-lists/items/${item.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked }),
    });
  };

  const addItem = async () => {
    if (!newItem.trim()) return;
    await fetch(`/api/nutrition/shopping-lists/${listId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newItem.trim(), category: 'Manual' }),
    });
    setNewItem('');
    fetchList();
  };

  const removeItem = async (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    await fetch(`/api/nutrition/shopping-lists/items/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  // Group by category
  const byCategory = {};
  items.forEach(i => {
    const cat = i.category || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(i);
  });
  const categories = Object.keys(byCategory).sort();

  const checkedCount = items.filter(i => i.checked).length;

  if (!list) {
    return <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
      <div className="spinner" />
    </div>;
  }

  return (
    <div className="page-content" style={{ paddingBottom: 140 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-card)',
          border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {list.title}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {checkedCount} / {items.length} checked
          </p>
        </div>
      </div>

      {/* Progress bar */}
      {items.length > 0 && (
        <div style={{ height: 6, borderRadius: 3, background: 'var(--divider)', marginBottom: 20, overflow: 'hidden' }}>
          <div style={{
            width: `${(checkedCount / items.length) * 100}%`, height: '100%',
            background: 'var(--accent-mint)', transition: 'width 0.3s',
          }} />
        </div>
      )}

      {/* Add item */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder="Add an item..."
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 10,
            border: '1px solid var(--divider)', background: 'var(--bg-card)',
            color: 'var(--text-primary)', fontSize: 14, outline: 'none',
          }}
        />
        <button
          onClick={addItem}
          style={{
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Add
        </button>
      </div>

      {/* Grouped items */}
      {items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ color: 'var(--text-secondary)' }}>Empty shopping list</p>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Add items above or generate from a meal plan</p>
        </div>
      ) : (
        categories.map(cat => (
          <div key={cat} style={{ marginBottom: 20 }}>
            <h3 style={{
              fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
            }}>{cat}</h3>
            {byCategory[cat].map(item => (
              <div
                key={item.id}
                className="card"
                onClick={() => toggleChecked(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, cursor: 'pointer',
                  opacity: item.checked ? 0.5 : 1,
                }}
              >
                {/* Checkbox */}
                <div style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  border: item.checked ? 'none' : '2px solid var(--divider)',
                  background: item.checked ? 'var(--accent-mint)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {item.checked ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : null}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 14, fontWeight: 600,
                    textDecoration: item.checked ? 'line-through' : 'none',
                  }}>{item.name}</p>
                  {item.quantity && (
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{item.quantity}</p>
                  )}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                  style={{
                    background: 'transparent', border: 'none', color: '#FF453A', cursor: 'pointer', padding: 4,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
