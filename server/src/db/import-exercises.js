import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync' ;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'data', 'ageless.db');

// Ensure pool.js runs first to create tables
await import('./pool.js');

const db = new Database(dbPath);

// Find the CSV file
const csvPath = path.join(__dirname, '..', '..', '..', '..', 'Video Database - Exercise Database (2).csv');
const csvPath2 = path.join(__dirname, '..', '..', 'exercises.csv');

let csvFile;
if (fs.existsSync(csvPath)) csvFile = csvPath;
else if (fs.existsSync(csvPath2)) csvFile = csvPath2;
else {
  // Try to find it
  const searchPaths = [
    path.join(__dirname, '..', '..', '..', '..'),
    path.join(__dirname, '..', '..'),
    '/opt/ageless-movement',
  ];
  for (const p of searchPaths) {
    const files = fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.csv')) : [];
    if (files.length > 0) { csvFile = path.join(p, files[0]); break; }
  }
}

if (!csvFile) {
  console.error('CSV file not found. Place it as exercises.csv in the server directory.');
  process.exit(1);
}

console.log(`Reading from: ${csvFile}`);

const csvContent = fs.readFileSync(csvFile, 'utf-8');
const records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });

console.log(`Total rows in CSV: ${records.length}`);

// Filter to complete exercises with names
const exercises = records.filter(r => {
  const name = (r['Exercise Display / Reference Name'] || r['Exercise Display / Reference Name '] || '').trim();
  const status = (r['Status'] || '').trim();
  const hasVideo = (r['Vimeo URL'] || '').trim() || (r['YouTube URL'] || '').trim();
  return name && (status === 'Complete' || status === 'In Handsdan App' || hasVideo);
});

console.log(`Exercises to import: ${exercises.length}`);

// Clear existing exercises (except seed data linked to workouts)
// We'll use INSERT OR IGNORE to avoid duplicates
const insert = db.prepare(`
  INSERT OR IGNORE INTO exercises (name, description, demo_video_url, thumbnail_url, body_part, equipment)
  VALUES (?, ?, ?, ?, ?, ?)
`);

let imported = 0;
let skipped = 0;

const importTransaction = db.transaction(() => {
  for (const row of exercises) {
    const name = (row['Exercise Display / Reference Name'] || row['Exercise Display / Reference Name '] || '').trim();
    if (!name) continue;

    // Check if already exists
    const existing = db.prepare('SELECT id FROM exercises WHERE name = ?').get(name);
    if (existing) {
      // Update with richer data
      const vimeo = (row['Vimeo URL'] || '').trim();
      const youtube = (row['YouTube URL'] || '').trim();
      const videoUrl = vimeo || youtube || null;
      const description = (row['Description / Instructions'] || '').trim();
      const muscleGroups = (row['Muscle Groups'] || '').trim();
      const equipment = (row['Equipment'] || '').trim();
      const tags = (row['Tags / Target Areas'] || '').trim();
      const type = (row['Type'] || '').trim();
      const perSide = (row['Per Side Info'] || '').trim();
      const trackingFields = (row['Tracking Fields'] || '').trim();

      // Build how-to instructions
      const howTo = [1,2,3,4].map(n => (row[`How To Perform ${n}`] || '').trim()).filter(Boolean).join(' | ');
      const fullDesc = [description, howTo ? `Instructions: ${howTo}` : ''].filter(Boolean).join('\n\n');

      db.prepare('UPDATE exercises SET description=?, demo_video_url=?, body_part=?, equipment=? WHERE id=?')
        .run(fullDesc || null, videoUrl, muscleGroups || tags || null, equipment === 'None' ? null : equipment, existing.id);
      skipped++;
      continue;
    }

    const vimeo = (row['Vimeo URL'] || '').trim();
    const youtube = (row['YouTube URL'] || '').trim();
    const videoUrl = vimeo || youtube || null;
    const description = (row['Description / Instructions'] || '').trim();
    const muscleGroups = (row['Muscle Groups'] || '').trim();
    const equipment = (row['Equipment'] || '').trim();
    const tags = (row['Tags / Target Areas'] || '').trim();

    // Build how-to instructions
    const howTo = [1,2,3,4].map(n => (row[`How To Perform ${n}`] || '').trim()).filter(Boolean).join(' | ');
    const fullDesc = [description, howTo ? `Instructions: ${howTo}` : ''].filter(Boolean).join('\n\n');

    try {
      insert.run(
        name,
        fullDesc || null,
        videoUrl,
        null, // thumbnail_url - will be uploaded later
        muscleGroups || tags || null,
        equipment === 'None' ? null : equipment
      );
      imported++;
    } catch (err) {
      console.error(`Error importing "${name}":`, err.message);
    }
  }
});

importTransaction();

console.log(`\nImport complete!`);
console.log(`  New exercises imported: ${imported}`);
console.log(`  Existing exercises updated: ${skipped}`);
console.log(`  Total in database: ${db.prepare('SELECT COUNT(*) as count FROM exercises').get().count}`);

process.exit(0);
