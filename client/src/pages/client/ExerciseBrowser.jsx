import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import WorkoutThumb from '../../components/WorkoutThumb';
import ExerciseDetailModal from '../../components/ExerciseDetailModal';

// Broad categories that map from granular body_part values
const BODY_PART_CATEGORIES = [
  'All', 'Hips', 'Back', 'Shoulders', 'Core', 'Arms', 'Legs', 'Chest', 'Full Body',
];

function categorize(bodyPart) {
  if (!bodyPart) return 'Other';
  const bp = bodyPart.toLowerCase();
  if (bp.includes('hip') || bp.includes('glute')) return 'Hips';
  if (bp.includes('back') || bp.includes('lat') || bp.includes('rhomb') || bp.includes('erector') || bp.includes('trap')) return 'Back';
  if (bp.includes('delt') || bp.includes('shoulder') || bp.includes('rotator')) return 'Shoulders';
  if (bp.includes('abdom') || bp.includes('core') || bp.includes('obliq')) return 'Core';
  if (bp.includes('bicep') || bp.includes('tricep') || bp.includes('forearm') || bp.includes('brach') || bp.includes('arm')) return 'Arms';
  if (bp.includes('quad') || bp.includes('hamstring') || bp.includes('calf') || bp.includes('tibial') || bp.includes('lower body') || bp.includes('leg')) return 'Legs';
  if (bp.includes('pec') || bp.includes('chest')) return 'Chest';
  if (bp.includes('full body')) return 'Full Body';
  return 'Other';
}

export default function ExerciseBrowser({ initialFilter, onBack }) {
  const { token } = useAuth();
  const [exercises, setExercises] = useState([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [loading, setLoading] = useState(true);

  // Map initialFilter (section title like "Hip Exercises") to a category
  useEffect(() => {
    if (initialFilter) {
      const match = BODY_PART_CATEGORIES.find(c => initialFilter.toLowerCase().includes(c.toLowerCase()));
      if (match && match !== 'All') setActiveCategory(match);
    }
  }, [initialFilter]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    fetch(`/api/explore/exercises?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setExercises(d.exercises || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [search]);

  const filtered = activeCategory === 'All'
    ? exercises
    : exercises.filter(e => categorize(e.body_part) === activeCategory);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Exercise Library</h1>
      </div>

      {/* Search bar */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search exercises..."
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--divider)',
            background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
          }}
        />
      </div>

      {/* Category chips */}
      <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px', marginBottom: 16 }}>
        {BODY_PART_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
              whiteSpace: 'nowrap', border: 'none', cursor: 'pointer',
              background: activeCategory === cat ? 'var(--accent)' : 'var(--bg-card)',
              color: activeCategory === cat ? '#000' : 'var(--text-primary)',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{filtered.length} exercises</p>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>Loading...</div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
          padding: '0 16px',
        }}>
          {filtered.map(ex => (
            <div key={ex.id} onClick={() => setSelectedExercise(ex)} style={{ cursor: 'pointer' }}>
              <WorkoutThumb
                title={ex.name}
                thumbnailUrl={ex.thumbnail_url}
                aspectRatio="1/1"
                borderRadius={10}
                titleFontSize={10}
              />
              <p style={{ fontSize: 11, fontWeight: 600, marginTop: 4, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{ex.name}</p>
            </div>
          ))}
        </div>
      )}

      {/* Exercise detail modal */}
      {selectedExercise && (
        <ExerciseDetailModal exercise={selectedExercise} onClose={() => setSelectedExercise(null)} />
      )}
    </div>
  );
}
