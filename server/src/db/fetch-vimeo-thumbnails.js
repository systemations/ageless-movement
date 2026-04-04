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
    // Use Vimeo oEmbed to get thumbnail
    const cleanUrl = vimeoUrl.replace('/manage/videos/', '/');
    const match = cleanUrl.match(/vimeo\.com\/(\d+)/);
    if (!match) return null;

    const videoId = match[1];
    const oembedUrl = `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`;
    const data = await fetchJSON(oembedUrl);
    return data.thumbnail_url || null;
  } catch (err) {
    return null;
  }
}

async function main() {
  const exercises = db.prepare(
    "SELECT id, name, demo_video_url FROM exercises WHERE demo_video_url IS NOT NULL AND (thumbnail_url IS NULL OR thumbnail_url = '')"
  ).all();

  console.log(`Exercises needing thumbnails: ${exercises.length}`);

  let updated = 0;
  let failed = 0;
  const batchSize = 5; // Fetch 5 at a time to be polite to Vimeo

  for (let i = 0; i < exercises.length; i += batchSize) {
    const batch = exercises.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (ex) => {
        const thumb = await fetchVimeoThumbnail(ex.demo_video_url);
        if (thumb) {
          db.prepare('UPDATE exercises SET thumbnail_url = ? WHERE id = ?').run(thumb, ex.id);
          updated++;
          return true;
        }
        failed++;
        return false;
      })
    );

    if ((i + batchSize) % 50 === 0 || i + batchSize >= exercises.length) {
      console.log(`  Progress: ${Math.min(i + batchSize, exercises.length)}/${exercises.length} (${updated} thumbnails, ${failed} failed)`);
    }

    // Small delay between batches
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone! Updated ${updated} thumbnails, ${failed} failed.`);
  const total = db.prepare("SELECT COUNT(*) as c FROM exercises WHERE thumbnail_url IS NOT NULL AND thumbnail_url != ''").get();
  console.log(`Total exercises with thumbnails: ${total.c}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
