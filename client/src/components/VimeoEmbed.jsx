export function getVimeoEmbedUrl(url, options = {}) {
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

  const {
    autoplay = false,
    loop = true,
    muted = false,
    background = false,
  } = options;

  const params = new URLSearchParams();
  if (hash) params.set('h', hash);
  if (autoplay) params.set('autoplay', '1');
  if (loop) params.set('loop', '1');
  if (muted) params.set('muted', '1');
  if (background) params.set('background', '1');

  return `https://player.vimeo.com/video/${videoId}?${params.toString()}`;
}

export function getVimeoThumbnailUrl(url) {
  return null;
}

export default function VimeoEmbed({ url, width = '100%', height = 220, autoplay = false, muted = false, background = false, style = {} }) {
  const embedUrl = getVimeoEmbedUrl(url, { autoplay, muted, background, loop: true });
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
