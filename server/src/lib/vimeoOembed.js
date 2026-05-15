// Shared Vimeo oEmbed helpers. Used by:
//  - fetch-vimeo-thumbnails.js (one-shot batch backfill of exercises +
//     workouts on first ingest)
//  - PUT /api/content/course-lessons/:id (auto-populate the
//     video_thumbnail when a coach pastes a Vimeo URL in the lesson
//     editor - fires after the save responds, fire-and-forget)
//
// Vimeo's oEmbed endpoint is public and doesn't require auth even for
// unlisted videos as long as the URL includes the privacy hash. It
// returns thumbnail_url + duration + title alongside the embed iframe.

import https from 'https';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Extracts video ID + optional privacy hash from any of the URL shapes
// Vimeo hands out: vimeo.com/123, vimeo.com/123/abc, vimeo.com/manage/
// videos/123, player.vimeo.com/video/123. Streaming/external URLs
// aren't supported by oEmbed and short-circuit to null.
export async function fetchVimeoThumbnail(vimeoUrl) {
  if (!vimeoUrl) return null;
  if (vimeoUrl.includes('player.vimeo.com/external/')) return null;

  const cleanUrl = vimeoUrl.replace('/manage/videos/', '/');
  const match = cleanUrl.match(/vimeo\.com\/(\d+)(?:\/([a-f0-9]+))?/);
  if (!match) return null;

  const videoId = match[1];
  const hash = match[2];
  const embedTarget = hash
    ? `https://vimeo.com/${videoId}/${hash}`
    : `https://vimeo.com/${videoId}`;
  const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(embedTarget)}&width=1280`;

  try {
    const data = await fetchJSON(oembedUrl);
    return data?.thumbnail_url || null;
  } catch (err) {
    return null;
  }
}

// Same as above but also returns title + duration (seconds) so save
// endpoints can pre-fill the duration field on lessons + workouts when
// the field is blank.
export async function fetchVimeoMeta(vimeoUrl) {
  if (!vimeoUrl) return null;
  if (vimeoUrl.includes('player.vimeo.com/external/')) return null;

  const cleanUrl = vimeoUrl.replace('/manage/videos/', '/');
  const match = cleanUrl.match(/vimeo\.com\/(\d+)(?:\/([a-f0-9]+))?/);
  if (!match) return null;

  const videoId = match[1];
  const hash = match[2];
  const embedTarget = hash
    ? `https://vimeo.com/${videoId}/${hash}`
    : `https://vimeo.com/${videoId}`;
  const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(embedTarget)}&width=1280`;

  try {
    const data = await fetchJSON(oembedUrl);
    if (!data) return null;
    return {
      thumbnail_url: data.thumbnail_url || null,
      title: data.title || null,
      duration_seconds: data.duration || null,
    };
  } catch (err) {
    return null;
  }
}
