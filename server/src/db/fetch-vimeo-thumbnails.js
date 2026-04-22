import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'data', 'ageless.db');
const db = new Database(dbPath);

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function fetchVimeoThumbnail(vimeoUrl) {
  try {
    // Skip streaming/player URLs -- oEmbed doesn't support them
    if (vimeoUrl.includes('player.vimeo.com/external/')) return null;

    // Normalise: strip /manage/videos/ prefix
    const cleanUrl = vimeoUrl.replace('/manage/videos/', '/');

    // Extract video ID and optional privacy hash
    // Matches: vimeo.com/413798520/b09f49067f  OR  vimeo.com/768740602
    const match = cleanUrl.match(/vimeo\.com\/(\d+)(?:\/([a-f0-9]+))?/);
    if (!match) return null;

    const videoId = match[1];
    const hash = match[2];

    // Include privacy hash in oEmbed URL if present -- required for unlisted videos
    const embedTarget = hash
      ? `https://vimeo.com/${videoId}/${hash}`
      : `https://vimeo.com/${videoId}`;
    const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(embedTarget)}&width=1280`;
    const data = await fetchJSON(oembedUrl);
    return data.thumbnail_url || null;
  } catch (err) {
    return null;
  }
}

async function fetchBatch(items, urlField, thumbField, table, label) {
  console.log(`\n${label} needing thumbnails: ${items.length}`);
  let updated = 0;
  let failed = 0;
  const batchSize = 5;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (item) => {
        const thumb = await fetchVimeoThumbnail(item[urlField]);
        if (thumb) {
          db.prepare(`UPDATE ${table} SET ${thumbField} = ? WHERE id = ?`).run(thumb, item.id);
          updated++;
        } else {
          failed++;
        }
      })
    );

    if ((i + batchSize) % 50 === 0 || i + batchSize >= items.length) {
      console.log(`  ${label}: ${Math.min(i + batchSize, items.length)}/${items.length} (${updated} ok, ${failed} failed)`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`${label}: ${updated} thumbnails fetched, ${failed} failed.`);
  return { updated, failed };
}

async function main() {
  // 1. Exercises
  const exercises = db.prepare(
    "SELECT id, name, demo_video_url FROM exercises WHERE demo_video_url IS NOT NULL AND (thumbnail_url IS NULL OR thumbnail_url = '')"
  ).all();
  const exResult = await fetchBatch(exercises, 'demo_video_url', 'thumbnail_url', 'exercises', 'Exercises');

  // 2. Follow-along workouts
  const workouts = db.prepare(
    "SELECT id, title, video_url FROM workouts WHERE video_url IS NOT NULL AND (image_url IS NULL OR image_url = '')"
  ).all();
  const wkResult = await fetchBatch(workouts, 'video_url', 'image_url', 'workouts', 'Workouts');

  // Summary
  const exTotal = db.prepare("SELECT COUNT(*) as c FROM exercises WHERE thumbnail_url IS NOT NULL AND thumbnail_url != ''").get();
  const wkTotal = db.prepare("SELECT COUNT(*) as c FROM workouts WHERE image_url IS NOT NULL AND image_url != ''").get();
  console.log(`\nTotal exercises with thumbnails: ${exTotal.c}`);
  console.log(`Total workouts with thumbnails: ${wkTotal.c}`);
  console.log(`Updated: ${exResult.updated + wkResult.updated} total, ${exResult.failed + wkResult.failed} failed`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
