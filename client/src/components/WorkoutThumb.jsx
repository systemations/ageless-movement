// Shared workout thumbnail component.
//
// Rendering priority:
//   1. If `thumbnailUrl` is present → show the image
//   2. Otherwise → show the workout title as bold white text on a rich
//      solid colour (Sweat Session style — deterministic by title hash)
//
// Used anywhere a workout cover needs to appear: ProgramDetail workout list,
// WorkoutOverview hero, Explore workout carousels, Home hero card, Favourites.

// Rich solid colours matching the Sweat Session brand style. Deterministic
// by title hash so the same workout always gets the same colour.
const SOLID_COLORS = [
  '#1B6B3A', // forest green
  '#2563EB', // royal blue
  '#7C3AED', // violet
  '#DC2626', // crimson
  '#D97706', // amber
  '#0D9488', // teal
  '#4338CA', // indigo
  '#BE185D', // magenta
  '#0369A1', // ocean blue
  '#9333EA', // purple
  '#B45309', // burnt orange
  '#047857', // emerald
];

function hashIndex(str = '', mod) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

// Mini fallback for small list tiles (48-56px). Shows initials on a solid
// colour derived from the title, matching the Sweat Session brand palette.
export function MiniThumb({ title = '', size = 56, borderRadius = 10 }) {
  const bg = SOLID_COLORS[hashIndex(title, SOLID_COLORS.length)];
  const initials = title.split(/[\s|]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'W';
  return (
    <div style={{
      width: size, height: size, borderRadius, flexShrink: 0,
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{
        color: '#fff', fontWeight: 900, fontSize: size * 0.35,
        letterSpacing: 1, textShadow: '1px 1px 0 rgba(0,0,0,0.2)',
        fontFamily: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
      }}>
        {initials}
      </span>
    </div>
  );
}

export default function WorkoutThumb({
  title = '',
  thumbnailUrl = null,
  aspectRatio = '16/9',
  borderRadius = 14,
  style = {},
  titleFontSize,
}) {
  const baseStyle = {
    width: '100%',
    aspectRatio,
    borderRadius,
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style,
  };

  if (thumbnailUrl) {
    return (
      <div style={{ ...baseStyle, background: 'var(--bg-card)' }}>
        <img
          src={thumbnailUrl}
          alt={title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius }}
        />
      </div>
    );
  }

  const bg = SOLID_COLORS[hashIndex(title, SOLID_COLORS.length)];
  const resolvedFontSize = titleFontSize ?? 22;

  return (
    <div
      style={{
        ...baseStyle,
        background: bg,
        padding: 16,
      }}
      aria-label={title}
      title={title}
    >
      <span
        style={{
          fontSize: resolvedFontSize,
          fontWeight: 900,
          color: '#fff',
          textAlign: 'center',
          lineHeight: 1.1,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          textShadow: '2px 2px 0 rgba(0,0,0,0.25), 0 4px 8px rgba(0,0,0,0.15)',
          fontFamily: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}
      >
        {title || 'Workout'}
      </span>
    </div>
  );
}
