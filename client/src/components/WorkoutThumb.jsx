// Shared workout thumbnail component.
//
// Rendering priority:
//   1. If `thumbnailUrl` is present → show the image
//   2. Otherwise → show the workout title as bold white text on a rich
//      solid colour (Sweat Session style - deterministic by title hash)
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

// Per-session badge palette. The session number maps directly to its colour
// (S1 -> [0], S2 -> [1] ...) so a given session is the same colour across every
// week and every program. 14 distinct hues cover up to 14 sessions in a week;
// ordered so consecutive sessions (usually shown together) contrast strongly.
const SESSION_COLORS = [
  '#4338CA', // 1 indigo
  '#BE185D', // 2 magenta
  '#0369A1', // 3 ocean blue
  '#047857', // 4 emerald
  '#B45309', // 5 bronze
  '#7C3AED', // 6 violet
  '#0D9488', // 7 teal
  '#DC2626', // 8 crimson
  '#15803D', // 9 forest green
  '#2563EB', // 10 royal blue
  '#C2410C', // 11 burnt orange
  '#9333EA', // 12 purple
  '#DB2777', // 13 pink
  '#475569', // 14 slate
];

function hashIndex(str, mod) {
  const s = str || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

// Mini fallback for small list tiles (48-56px). Shows initials on a solid
// colour derived from the title, matching the Sweat Session brand palette.
export function MiniThumb({ title = '', size = 56, borderRadius = 10 }) {
  const safeTitle = title || '';
  const bg = SOLID_COLORS[hashIndex(safeTitle, SOLID_COLORS.length)];
  const initials = safeTitle.split(/[\s|]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'W';
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
  label = null, // short badge (e.g. "S1") shown instead of the wrapping full title on small tiles
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

  // Short-label mode: a compact badge (e.g. "S1") for small tiles where the
  // full title would wrap into an unreadable block.
  if (label) {
    // Colour keys off the session number so the same badge (S1/S2/S3...) is the
    // same colour across every week and every program. Falls back to a hash for
    // non-numbered labels.
    const num = parseInt(String(label).match(/\d+/)?.[0] ?? '', 10);
    const labelBg = Number.isFinite(num)
      ? SESSION_COLORS[(num - 1) % SESSION_COLORS.length]
      : SOLID_COLORS[hashIndex(label, SOLID_COLORS.length)];
    return (
      <div style={{ ...baseStyle, background: labelBg, containerType: 'inline-size' }} aria-label={title || label} title={title || label}>
        <span style={{
          fontSize: '34cqw', fontWeight: 900, color: '#fff', letterSpacing: 1,
          textShadow: '1px 1px 0 rgba(0,0,0,0.25)',
          fontFamily: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
        }}>
          {label}
        </span>
      </div>
    );
  }

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
