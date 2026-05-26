#!/usr/bin/env node
// Cross-reference no-video exercises (in live Explore content) against the
// library of exercises that DO have a video, to find likely same-exercise
// matches we can merge. Read-only: prints candidates + writes a CSV.
//
//   node src/db/match_videos.cjs            # print summary + write CSV
//
// Tiers:
//   EXACT  - identical after normalization (near-certain merge)
//   STRONG - one name's tokens fully contain the other's core tokens
//   FUZZY  - high token-overlap (Dice >= 0.6); needs human eyes

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, '..', '..', 'data', 'ageless.db'), { readonly: true });

// ---- filler words that carry no exercise identity ------------------------
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'with', 'of', 'for', 'on', 'in',
  'each', 'per', 'side', 'sides', 'reps', 'rep', 'sec', 'secs', 'second',
  'seconds', 'hold', 'holds', 'x', 'both', 'alt', 'alternating', 'alternate',
  'left', 'right', 'l', 'r',
]);

function normalize(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')          // drop parentheticals
    .replace(/[>|/]/g, ' ')              // separators
    .replace(/[^a-z0-9\s-]/g, ' ')       // punctuation
    .replace(/\b\d+\b/g, ' ')            // bare numbers (rep counts)
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(name) {
  return normalize(name)
    .split(/[\s-]+/)
    .filter(t => t && !STOP.has(t));
}

function dice(a, b) {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size || 1);
}

// ---- gather live-Explore no-video exercises ------------------------------
const items = db.prepare(`
  SELECT esi.item_type, esi.item_id
  FROM explore_section_items esi
  JOIN explore_sections es ON es.id = esi.section_id
  WHERE es.visible = 1 AND esi.item_type IN ('program','workout')
`).all();

const progIds = items.filter(i => i.item_type === 'program').map(i => i.item_id);
const woIds = new Set(items.filter(i => i.item_type === 'workout').map(i => i.item_id));
if (progIds.length) {
  const ph = progIds.map(() => '?').join(',');
  for (const r of db.prepare(`SELECT id FROM workouts WHERE program_id IN (${ph})`).all(...progIds)) woIds.add(r.id);
}

const exIds = new Set();
const woArr = [...woIds];
if (woArr.length) {
  const ph = woArr.map(() => '?').join(',');
  for (const r of db.prepare(`SELECT DISTINCT exercise_id FROM workout_exercises WHERE workout_id IN (${ph})`).all(...woArr)) exIds.add(r.exercise_id);
}

const ph = [...exIds].map(() => '?').join(',');
const usedRows = db.prepare(`SELECT id, name, demo_video_url FROM exercises WHERE id IN (${ph})`).all(...exIds);
const noVideo = usedRows.filter(e => !e.demo_video_url || !e.demo_video_url.trim());

// ---- candidate pool: every exercise that HAS a video ---------------------
const videoPool = db.prepare(`
  SELECT id, name, demo_video_url FROM exercises
  WHERE demo_video_url IS NOT NULL AND TRIM(demo_video_url) != ''
`).all().map(e => ({ ...e, norm: normalize(e.name), toks: tokens(e.name) }));

// ---- match ----------------------------------------------------------------
const results = [];
for (const ex of noVideo) {
  const norm = normalize(ex.name);
  const toks = tokens(ex.name);
  if (!toks.length) continue;

  let best = null;
  for (const cand of videoPool) {
    if (!cand.toks.length) continue;
    let tier = null, score = 0;
    if (cand.norm === norm) { tier = 'EXACT'; score = 1; }
    else {
      const setA = new Set(toks), setB = new Set(cand.toks);
      const aInB = [...setA].every(t => setB.has(t));
      const bInA = [...setB].every(t => setA.has(t));
      if ((aInB || bInA) && Math.min(setA.size, setB.size) >= 2) { tier = 'STRONG'; score = 0.9; }
      else {
        const d = dice(toks, cand.toks);
        if (d >= 0.6) { tier = 'FUZZY'; score = d; }
      }
    }
    if (tier && (!best || score > best.score)) best = { cand, tier, score };
  }
  if (best) {
    results.push({
      noVideoId: ex.id, noVideoName: ex.name,
      matchId: best.cand.id, matchName: best.cand.name,
      tier: best.tier, score: best.score.toFixed(2),
      matchVideo: best.cand.demo_video_url,
    });
  }
}

const order = { EXACT: 0, STRONG: 1, FUZZY: 2 };
results.sort((a, b) => order[a.tier] - order[b.tier] || b.score - a.score);

const counts = results.reduce((m, r) => (m[r.tier] = (m[r.tier] || 0) + 1, m), {});
console.log(`No-video exercises in live Explore: ${noVideo.length}`);
console.log(`Match candidates found: ${results.length}`, counts);
console.log('');
console.log('=== EXACT (near-certain merges) ===');
for (const r of results.filter(r => r.tier === 'EXACT')) {
  console.log(`  [${r.noVideoId}] "${r.noVideoName}"  ->  [${r.matchId}] "${r.matchName}"`);
}

const csv = ['tier,score,no_video_id,no_video_name,match_id,match_name,match_video']
  .concat(results.map(r =>
    [r.tier, r.score, r.noVideoId, `"${r.noVideoName.replace(/"/g, '""')}"`,
     r.matchId, `"${r.matchName.replace(/"/g, '""')}"`, `"${r.matchVideo}"`].join(',')))
  .join('\n');
const out = path.join(__dirname, '..', '..', 'exercise-video-review.csv');
fs.writeFileSync(out, csv);
console.log(`\nFull list (incl STRONG + FUZZY) written to ${path.relative(process.cwd(), out)}`);
