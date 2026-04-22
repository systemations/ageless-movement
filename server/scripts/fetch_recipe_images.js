// Auto-fetches food thumbnails for every recipe with a null thumbnail_url.
//
// Strategy:
//   1. Build a search query from recipe title + category keywords
//   2. Hit Unsplash Source API (keyless, returns a 302 → jpg URL)
//   3. Download the image and save to client/public/food/{slug}.jpg
//   4. Write `/food/{slug}.jpg` into recipes.thumbnail_url
//
// Idempotent: skips recipes that already have a thumbnail_url set.
// Slug collisions are resolved by appending the recipe id.
//
// Run: node scripts/fetch_recipe_images.js

import db from '../src/db/pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOOD_DIR = path.resolve(__dirname, '..', '..', 'client', 'public', 'food');
fs.mkdirSync(FOOD_DIR, { recursive: true });

// Keywords stripped from titles so search queries stay meaningful
const STOP_WORDS = new Set([
  'with', 'and', 'the', 'a', 'an', 'of', 'for', 'on', 'in', 'to',
  'g', 'ml', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'kg',
  'large', 'small', 'medium', 'fresh',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '20', '40', '100', '150', '200', '300',
]);

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[()&,.'"/]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function buildQuery(title, category) {
  // Pull meaningful words from title, append category as context
  const words = title
    .toLowerCase()
    .replace(/[()&,./'"]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
    .slice(0, 4);
  const catWord = category ? category.toLowerCase().split(/\s+/)[0] : 'food';
  return [...words, catWord, 'food'].join(',');
}

function fetchRedirect(url, maxHops = 5) {
  return new Promise((resolve, reject) => {
    const hop = (u, n) => {
      if (n <= 0) return reject(new Error('too many redirects'));
      let parsed;
      try { parsed = new URL(u); }
      catch { return reject(new Error(`bad url: ${u}`)); }
      https.get(parsed, { headers: { 'User-Agent': 'AgelessMovement/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          // Resolve relative → absolute against current URL
          const next = new URL(res.headers.location, parsed).toString();
          return hop(next, n - 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    hop(url, maxHops);
  });
}

async function fetchOne(recipe) {
  const query = buildQuery(recipe.title, recipe.category);
  // LoremFlickr is keyless and returns a random Creative Commons Flickr
  // photo matching the given tags. Format: /width/height/tag1,tag2
  const url = `https://loremflickr.com/600/400/${encodeURIComponent(query)}`;

  const baseSlug = slugify(recipe.title) || `recipe-${recipe.id}`;
  let slug = baseSlug;
  let filePath = path.join(FOOD_DIR, `${slug}.jpg`);
  if (fs.existsSync(filePath)) {
    // Resolve collision by suffixing with id
    slug = `${baseSlug}-${recipe.id}`;
    filePath = path.join(FOOD_DIR, `${slug}.jpg`);
  }

  const buf = await fetchRedirect(url);
  if (buf.length < 1024) throw new Error(`tiny response (${buf.length}b)`);

  fs.writeFileSync(filePath, buf);
  const webPath = `/food/${slug}.jpg`;
  db.query('UPDATE recipes SET thumbnail_url = ? WHERE id = ?', [webPath, recipe.id]);
  return webPath;
}

async function run() {
  const recipes = db.query(
    `SELECT id, title, category FROM recipes
     WHERE thumbnail_url IS NULL OR thumbnail_url = ''
     ORDER BY id`,
  ).rows;

  console.log(`[images] ${recipes.length} recipes need thumbnails`);
  if (recipes.length === 0) return;

  let ok = 0;
  let fail = 0;
  for (const r of recipes) {
    try {
      const webPath = await fetchOne(r);
      ok++;
      console.log(`  ✔ ${r.id.toString().padStart(4)} ${r.title.slice(0, 50).padEnd(50)} → ${webPath}`);
    } catch (err) {
      fail++;
      console.log(`  ✗ ${r.id.toString().padStart(4)} ${r.title.slice(0, 50).padEnd(50)} → ${err.message}`);
    }
    // Small delay to be polite to source.unsplash.com
    await new Promise((res) => setTimeout(res, 250));
  }

  console.log(`\n[images] done: ${ok} ok, ${fail} failed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
