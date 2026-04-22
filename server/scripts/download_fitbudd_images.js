// Downloads all recipe images currently hosted on FitBudd CDN/BFF
// and saves them locally to client/public/food/.
// Updates recipes.thumbnail_url to point to the local path.
//
// Run: node scripts/download_fitbudd_images.js

import db from '../src/db/pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOOD_DIR = path.resolve(__dirname, '..', '..', 'client', 'public', 'food');
fs.mkdirSync(FOOD_DIR, { recursive: true });

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[()&,.'"/!?:;]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function download(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const attempt = (u, hops) => {
      if (hops <= 0) return reject(new Error('too many redirects'));
      let parsed;
      try { parsed = new URL(u); } catch { return reject(new Error(`bad url: ${u}`)); }

      const client = parsed.protocol === 'https:' ? https : http;
      client.get(parsed, { headers: { 'User-Agent': 'AgelessMovement/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, parsed).toString();
          return attempt(next, hops - 1);
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
    attempt(url, maxRedirects);
  });
}

function getExtension(url, buffer) {
  // Check URL for extension hint
  const urlLower = url.toLowerCase();
  if (urlLower.includes('.png')) return '.png';
  if (urlLower.includes('.webp')) return '.webp';
  // Check magic bytes
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return '.png';
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return '.webp';
  // Default to jpg (most common for photos)
  return '.jpg';
}

async function run() {
  const recipes = db.query(
    `SELECT id, title, thumbnail_url FROM recipes
     WHERE thumbnail_url LIKE 'https://bff.fitbudd%'
        OR thumbnail_url LIKE 'https://cdn-images.fitbudd%'
     ORDER BY id`
  ).rows;

  console.log(`[download] ${recipes.length} recipes with FitBudd images to download\n`);
  if (recipes.length === 0) return;

  let ok = 0;
  let fail = 0;
  const failures = [];

  for (const r of recipes) {
    const slug = slugify(r.title) || `recipe-${r.id}`;
    try {
      const buf = await download(r.thumbnail_url);
      if (buf.length < 500) throw new Error(`tiny response (${buf.length}b)`);

      const ext = getExtension(r.thumbnail_url, buf);
      // Use slug-id to guarantee uniqueness
      const filename = `${slug}-${r.id}${ext}`;
      const filePath = path.join(FOOD_DIR, filename);
      const webPath = `/food/${filename}`;

      fs.writeFileSync(filePath, buf);
      db.query('UPDATE recipes SET thumbnail_url = ? WHERE id = ?', [webPath, r.id]);

      ok++;
      const sizeKB = (buf.length / 1024).toFixed(1);
      console.log(`  OK  #${r.id.toString().padStart(3)} ${r.title.slice(0, 45).padEnd(45)} ${sizeKB}KB`);
    } catch (err) {
      fail++;
      failures.push({ id: r.id, title: r.title, error: err.message });
      console.log(`  ERR #${r.id.toString().padStart(3)} ${r.title.slice(0, 45).padEnd(45)} ${err.message}`);
    }

    // Small delay to avoid hammering the CDN
    await new Promise((res) => setTimeout(res, 150));
  }

  console.log(`\n[download] Done: ${ok} downloaded, ${fail} failed`);
  if (failures.length > 0) {
    console.log('\nFailed recipes:');
    failures.forEach((f) => console.log(`  #${f.id} ${f.title} -- ${f.error}`));
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
