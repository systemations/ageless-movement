export function getVimeoEmbedUrl(url) {
  if (!url) return null;
  // Handle formats:
  // https://vimeo.com/768740602
  // https://vimeo.com/765466375/97c494bfc0
  // https://vimeo.com/manage/videos/413798400/77518b9cf2
  const cleaned = url.replace('/manage/videos/', '/');
  const match = cleaned.match(/vimeo\.com\/(\d+)(?:\/([a-f0-9]+))?/);
  if (!match) return null;
  const videoId = match[1];
  const hash = match[2];
  return hash
    ? `https://player.vimeo.com/video/${videoId}?h=${hash}&autoplay=1&loop=1&muted=1&background=1`
    : `https://player.vimeo.com/video/${videoId}?autoplay=1&loop=1&muted=1&background=1`;
}

export function getVimeoThumbnailUrl(url) {
  // Vimeo doesn't have a simple thumbnail URL scheme — we'd need the API
  // For now return null and use the uploaded thumbnail or placeholder
  return null;
}

export default function VimeoEmbed({ url, width = '100%', height = 220, autoplay = true, muted = true, style = {} }) {
  const embedUrl = getVimeoEmbedUrl(url);
  if (!embedUrl) return null;

  return (
    <iframe
      src={embedUrl}
      width={width}
      height={height}
      frameBorder="0"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      style={{
        border: 'none', borderRadius: 12, background: '#111',
        ...style,
      }}
    />
  );
}
