// Shared exercise thumbnail.
//
// Rendering priority:
//   1. If `thumbnailUrl` is present → show the image
//   2. If `label` + `color` are provided (in-workout context) → show a
//      coloured square with the position label centred (e.g. "A", "B1")
//   3. Otherwise → neutral dark card with the exercise name as a last-resort
//      fallback (used in non-workout contexts like the Exercise Library)
//
// Same component used in both the coach admin and the client app so
// fallbacks look consistent across surfaces.

export default function ExerciseThumb({
  name = '',
  thumbnailUrl = null,
  label = null,
  color = null,
  size = 48,
  borderRadius = 8,
  style = {},
}) {
  const baseStyle = {
    width: size,
    height: size,
    borderRadius,
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style,
  };

  // 1. Actual image
  if (thumbnailUrl) {
    return (
      <div style={{ ...baseStyle, background: 'var(--bg-card)' }}>
        <img
          src={thumbnailUrl}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }

  // 2. In-workout fallback: coloured block square with position label
  if (label && color) {
    // Small label text scales with thumb size; keeps "B1" readable at 28px and 64px
    const fontSize = Math.max(11, Math.round(size * 0.38));
    return (
      <div
        style={{
          ...baseStyle,
          background: color,
          border: `1px solid ${color}`,
        }}
        aria-label={`${label} ${name}`}
        title={name}
      >
        <span
          style={{
            fontSize,
            fontWeight: 800,
            color: '#000',
            letterSpacing: 0.5,
            textShadow: '0 1px 1px rgba(255,255,255,0.2)',
          }}
        >
          {label}
        </span>
      </div>
    );
  }

  // 3. Non-workout fallback: neutral dark card with exercise name
  const textSize = Math.max(8, Math.round(size / 6));
  return (
    <div
      style={{
        ...baseStyle,
        background: 'linear-gradient(135deg, #1c1c1e, #2a2a2c)',
        border: '1px solid var(--divider)',
        padding: Math.max(3, Math.round(size / 12)),
      }}
      aria-label={name}
      title={name}
    >
      <span
        style={{
          fontSize: textSize,
          fontWeight: 700,
          color: '#fff',
          textAlign: 'center',
          lineHeight: 1.15,
          letterSpacing: 0.2,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}
      >
        {name || 'Exercise'}
      </span>
    </div>
  );
}

// Helper: compute the exercise's position label within a workout.
// blockIdx=0 → "A", blockIdx=1 → "B", etc.
// If the block contains more than one exercise, append the exercise number:
// blockIdx=1, exIdx=0, total=2 → "B1"; exIdx=1 → "B2".
export function getExerciseLabel(blockIdx, exIdx, totalInBlock) {
  const letter = String.fromCharCode(65 + (blockIdx % 26));
  return totalInBlock > 1 ? `${letter}${exIdx + 1}` : letter;
}
