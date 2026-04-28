// One-shot idempotent seeder for the AMS Getting Started assessment
// course (course id 5). Populates lesson descriptions for the 13
// movement-based assessment lessons with PDF-derived instructions +
// embedded reference photos that ship in /public/assessments/.
//
// Idempotent: only writes a description if the lesson currently has
// none (or only the placeholder length we know about). Safe to run on
// every server start — a coach editing a lesson via the admin TipTap
// editor won't be overwritten because the next start sees a populated
// description and skips the lesson.

import pool from './pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper: build a centred image tag. The 480px max keeps photos sized
// reasonably even on desktop where the lesson body is wider; on mobile
// CSS max-width:100% in rich-text.css does the rest.
const img = (file, alt) =>
  `<p style="text-align:center;margin:14px 0"><img src="/assessments/${file}" alt="${alt}" style="max-width:480px;width:100%;border-radius:12px" /></p>`;

// Common closing block - tells the client to capture a baseline photo.
// Ties into the upcoming assessment_responses feature (planned for next
// session) so the copy reads consistently once that ships.
const captureBaseline = `<p>Capture a side or front photo of yourself in this end position. Save it somewhere named "mobility progress" so you can compare against your re-test in 4 weeks.</p>`;

// Each entry: id, expected title, html. The seeder asserts the title
// matches before writing — so if a coach renames a lesson the seeder
// won't overwrite the wrong record.
const LESSONS = [
  {
    id: 15, title: 'Thoracic Extension',
    html: `<p>This one looks at how well your upper back extends. We test two positions, prone (Cobra) and kneeling, so we see your true thoracic range with hips locked out.</p>
<h3>Cobra (Prone)</h3>
<ol><li>Lie on your stomach with hands under shoulders.</li><li>Gently press your chest up while keeping hips on the floor.</li><li>Keep shoulders down, focusing on extending only the upper back.</li><li>Stop if you feel any pain or discomfort in the lower back.</li></ol>
${img('thoracic-extension-prone.webp', 'Cobra prone thoracic extension')}
<h3>Half-Kneeling Extension</h3>
<p>Same idea from a half-kneeling position so the lower back can't compensate. Feel the extension stay in your upper back.</p>
${img('thoracic-extension-kneeling.webp', 'Half-kneeling thoracic extension')}
${captureBaseline}`,
  },
  {
    id: 16, title: 'Standing Pike',
    html: `<p>The standing pike shows hamstring length + how the back rounds when you fold forward. Don't bounce, just settle into your end range.</p>
<ol><li>Stand with feet together, knees straight, and fold forward, reaching toward your toes.</li><li>Try to bring your chest close to your thighs.</li><li>Hold for a few breaths, observing flexibility in hamstrings.</li></ol>
${img('standing-pike-1.webp', 'Standing pike position 1')}
${img('standing-pike-2.webp', 'Standing pike position 2')}
${img('standing-pike-3.webp', 'Standing pike position 3')}
${captureBaseline}`,
  },
  {
    id: 17, title: 'Seated Pike',
    html: `<p>Same hamstring + spine assessment as Standing Pike but seated removes the balance component, so you see your true range.</p>
<ol><li>Sit with legs straight in front of you and reach forward.</li><li>Keep your back as straight as possible while reaching for toes.</li><li>Note any restriction or discomfort.</li></ol>
${img('seated-pike-1.webp', 'Seated pike position 1')}
${img('seated-pike-2.webp', 'Seated pike position 2')}
${img('seated-pike-3.webp', 'Seated pike position 3')}
${captureBaseline}`,
  },
  {
    id: 18, title: 'Cross Legged',
    html: `<p>Cross-legged sitting tells us a lot about hip external rotation, knee tolerance, and lower back posture. If this position isn't comfortable, that's data.</p>
<ol><li>Sit cross-legged, allowing knees to relax down.</li><li>Check if your hips and lower back are comfortable.</li><li>Adjust if needed to sit upright comfortably.</li></ol>
${img('cross-legged-1.webp', 'Cross-legged position 1')}
${img('cross-legged-2.webp', 'Cross-legged position 2')}
${img('cross-legged-3.webp', 'Cross-legged position 3')}
${captureBaseline}`,
  },
  {
    id: 19, title: 'Hip Extension',
    html: `<p>Two assessments here: the Couch Stretch (gentler) and Front Splits (full hip extension). Pick whichever you can access and capture both sides.</p>
<h3>Couch Stretch</h3>
<ol><li>Place one knee on the floor with foot up on a couch or wall, other leg forward in a lunge.</li><li>Stay upright, keeping hips squared.</li></ol>
${img('hip-extension-1.webp', 'Couch stretch 1')}
${img('hip-extension-2.webp', 'Couch stretch 2')}
<h3>Front Splits</h3>
<p>If you've got the range, slide one leg forward and the other back to your comfort. Keep hips square.</p>
${img('hip-extension-front-splits.webp', 'Front splits')}
${captureBaseline}`,
  },
  {
    id: 20, title: 'Heel Sits',
    html: `<p>Heel sits (seiza) check ankle dorsiflexion + knee flexion + quad length all at once. If you can't sit on your heels comfortably, one of those three is the bottleneck.</p>
<ol><li>Kneel down with toes untucked, sitting back onto your heels.</li><li>Check for any discomfort in your knees or ankles.</li></ol>
${img('heel-sits-1.webp', 'Heel sits position 1')}
${img('heel-sits-2.webp', 'Heel sits position 2')}
${captureBaseline}`,
  },
  {
    id: 21, title: '90/90',
    html: `<p>The 90/90 position assesses internal rotation in your front hip + external rotation in your back hip simultaneously. Test both sides — they're often very different.</p>
<ol><li>Sit with front leg bent at 90 degrees and back leg bent at 90 degrees.</li><li>Maintain an upright posture; switch sides.</li></ol>
${img('ninety-ninety-1.webp', '90/90 right side')}
${img('ninety-ninety-2.webp', '90/90 left side')}
${captureBaseline}`,
  },
  {
    id: 22, title: 'Half Middle Split',
    html: `<p>One leg straight out to the side, the other bent in. This isolates how much abduction one side has at a time.</p>
<ol><li>Sit with one leg extended to the side, the other bent in.</li><li>Keep your spine tall and lean gently toward the straight leg.</li><li>Switch sides and note the difference.</li></ol>
${img('half-middle-split-1.webp', 'Half middle split position 1')}
${img('half-middle-split-2.webp', 'Half middle split position 2')}
${img('half-middle-split-3.webp', 'Half middle split position 3')}
${captureBaseline}`,
  },
  {
    id: 23, title: 'Straddle Pancake',
    html: `<p>Both legs out wide at the same time. Tests adductor length + the spine's ability to fold forward in a wide stance.</p>
<ol><li>Sit with legs out wide, knees pointing up.</li><li>Keep your spine long and fold forward from the hips.</li><li>Don't round the upper back to fake range — sit tall and only go where the hips allow.</li></ol>
${img('straddle-pancake-1.webp', 'Straddle pancake position 1')}
${img('straddle-pancake-2.webp', 'Straddle pancake position 2')}
${img('straddle-pancake-3.webp', 'Straddle pancake position 3')}
${img('straddle-pancake-4.webp', 'Straddle pancake position 4')}
${captureBaseline}`,
  },
  {
    id: 24, title: 'Shoulder Flexion',
    html: `<p>How far overhead you can reach with shoulders working properly (not faking it with the lower back). Lie on the floor with your lower back pressed flat — anything you reach past that is real shoulder flexion.</p>
<ol><li>Lie flat on the floor with knees bent, lower back pressed into the floor.</li><li>Reach both arms overhead, keeping arms straight and palms facing each other.</li><li>Stop where the lower back wants to lift off the floor — don't let it.</li></ol>
${img('shoulder-flexion-1.webp', 'Shoulder flexion position 1')}
${img('shoulder-flexion-2.webp', 'Shoulder flexion position 2')}
${img('shoulder-flexion-3.webp', 'Shoulder flexion position 3')}
${captureBaseline}`,
  },
  {
    id: 25, title: 'Shoulder Extension',
    html: `<p>Reaching behind you. Often very limited in desk workers and anyone who pushes a lot but rarely pulls behind the body.</p>
<ol><li>Stand or sit upright. Arms by your sides.</li><li>Without leaning forward, reach both arms back behind you, palms facing in.</li><li>Note the end range and any side-to-side difference.</li></ol>
${img('shoulder-extension-1.webp', 'Shoulder extension position 1')}
${img('shoulder-extension-2.webp', 'Shoulder extension position 2')}
${img('shoulder-extension-3.webp', 'Shoulder extension position 3')}
${captureBaseline}`,
  },
  {
    id: 26, title: 'Shoulder External Rotation',
    html: `<h3>Cactus Up</h3>
<ol><li>Sit yourself against a wall.</li><li>Make sure your butt and your shoulders are touching the wall.</li><li>Pull your shoulders against the wall and build tension in your arms.</li><li>Try to rotate through your arms to allow your forearms toward the wall above your head.</li><li>Stop at the point at which you feel your shoulders trying to roll forward off the wall.</li></ol>
${img('shoulder-external-rotation-1.webp', 'Cactus up starting position')}
${img('shoulder-external-rotation-2.webp', 'Cactus up target position')}
${captureBaseline}`,
  },
  {
    id: 27, title: 'Shoulder Internal Rotation',
    html: `<h3>Cactus Down</h3>
<ol><li>Sit yourself against a wall.</li><li>Make sure your butt and your shoulders are touching the wall.</li><li>Pull your shoulders against the wall and build tension in your arms.</li><li>Try to rotate through your arms to allow your forearms toward the floor.</li><li>Stop at the point at which you feel your shoulders trying to roll forward off the wall.</li></ol>
${img('shoulder-internal-rotation-1.webp', 'Cactus down starting position')}
${img('shoulder-internal-rotation-2.webp', 'Cactus down target position')}
${captureBaseline}`,
  },
];

// Run the seeder. Returns a count of lessons updated. Skips lessons
// where the current description is non-empty (assume the coach has
// edited it). Skips lessons where the title doesn't match the seed
// (defensive: the lesson list should be stable but if a row got
// renamed/replaced, do nothing rather than overwrite the wrong row).
export function seedAssessmentLessons() {
  const updated = [];
  const skipped = [];
  for (const seed of LESSONS) {
    const row = pool.query('SELECT id, title, description FROM course_lessons WHERE id = ?', [seed.id]).rows[0];
    if (!row) { skipped.push({ id: seed.id, reason: 'not found' }); continue; }
    if (row.title !== seed.title) { skipped.push({ id: seed.id, reason: `title mismatch (got '${row.title}')` }); continue; }
    if (row.description && row.description.trim().length > 50) { skipped.push({ id: seed.id, reason: 'already populated' }); continue; }
    pool.query('UPDATE course_lessons SET description = ? WHERE id = ?', [seed.html, seed.id]);
    updated.push(seed.id);
  }
  // Idempotent cleanup: lesson id 28 ("What do I do Now?") was the
  // original placeholder wrap-up at the end of the Shoulders sub-
  // module. Dan dropped it 2026-04-28 — Shoulder Internal Rotation is
  // a clean stopping point. We delete by both id AND title so we
  // never accidentally remove a re-used row. ON DELETE CASCADE on
  // related response tables keeps things clean.
  const wrapUp = pool.query("SELECT id FROM course_lessons WHERE id = 28 AND title = 'What do I do Now?'").rows[0];
  if (wrapUp) {
    pool.query('DELETE FROM course_lessons WHERE id = 28');
    console.log('[assessment-seed] removed legacy lesson 28 (What do I do Now?)');
  }

  // Quiz JSON for the 3 STEP 3 lessons. Idempotent: only writes when
  // quiz_data is currently NULL so a coach editing the quiz via SQL
  // later won't be clobbered. Files live alongside this script so the
  // seed can be diffed in version control.
  const QUIZZES = [
    { id: 29, title: 'AMS | Ground Zero™', file: 'seed-quiz-data/ground-zero.json' },
    { id: 30, title: 'AMS | Re-Build™',    file: 'seed-quiz-data/rebuild.json' },
    { id: 31, title: 'AMS | Prime™',       file: 'seed-quiz-data/prime.json' },
  ];
  const quizUpdated = [];
  for (const q of QUIZZES) {
    const row = pool.query('SELECT id, title, quiz_data FROM course_lessons WHERE id = ?', [q.id]).rows[0];
    if (!row) continue;
    if (row.title !== q.title) continue;
    if (row.quiz_data && row.quiz_data.length > 100) continue; // already populated
    try {
      const json = fs.readFileSync(path.join(__dirname, q.file), 'utf8').trim();
      if (!json) continue;
      JSON.parse(json); // bail if malformed
      pool.query('UPDATE course_lessons SET quiz_data = ? WHERE id = ?', [json, q.id]);
      quizUpdated.push(q.id);
    } catch (err) {
      console.error('[assessment-seed] failed to seed quiz for lesson', q.id, err.message);
    }
  }
  if (quizUpdated.length) {
    console.log(`[assessment-seed] seeded quiz_data for lessons: ${quizUpdated.join(', ')}`);
  }

  // Re-sync the denormalised modules + lessons counts on course id 5.
  // These columns get out of date when lessons are added/removed via
  // SQL or the seeder; the UI shows them on the explore course card so
  // a stale count looks like a content gap. Recompute live each run.
  const counts = pool.query(
    `SELECT
       (SELECT COUNT(*) FROM course_modules WHERE course_id = 5) AS modules,
       (SELECT COUNT(*) FROM course_lessons cl
          JOIN course_modules cm ON cm.id = cl.module_id
         WHERE cm.course_id = 5) AS lessons`,
  ).rows[0];
  if (counts) {
    pool.query('UPDATE courses SET modules = ?, lessons = ? WHERE id = 5', [counts.modules, counts.lessons]);
  }

  if (updated.length || skipped.length) {
    console.log(`[assessment-seed] updated=${updated.length} skipped=${skipped.length}`);
  }
  return { updated, skipped };
}
