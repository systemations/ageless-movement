// Seed Creature-style challenges + level ladders from the 2018 PDF, plus the
// extra "open" rep/hold challenges Dan mentioned (chin-ups, dips, muscle-ups,
// handstand hold, L-sit hold).
//
// - type='numeric'      → single measurable value, leaderboard-ranked
// - type='skill_ladder' → each level is a distinct demonstrable skill; requires video
//
// Idempotent: clears existing challenges + levels first (no attempts are
// touched, but since challenge_attempts cascades on challenges, running this
// while attempts exist will wipe them — fine for dev seed).
//
// Usage: node scripts/seed-challenges.cjs

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'ageless.db');

// Row split "1:40" = 100s, "1:55" = 115s. Lower is better.
function mmss(s) { const [m, sec] = s.split(':').map(Number); return m * 60 + sec; }

// ── PDF category seeds ────────────────────────────────────────────────────
// Each entry = one challenge with 5 level thresholds (male / female).
// Descriptions come verbatim from the PDF so nothing gets lost in translation.
const NUMERIC_CHALLENGES = [
  // ── BURN ────────────────────────────────────────────────────────────────
  {
    slug: 'burn_airbike_max_watts', category: 'BURN', subcategory: 'Max Power',
    name: 'Airbike max wattage', unit: 'watts', direction: 'higher', requires_video: true,
    icon: '🚲',
    levels: [
      { level: 1, m: 800,  f: 350  },
      { level: 2, m: 1000, f: 600  },
      { level: 3, m: 1200, f: 750  },
      { level: 4, m: 1600, f: 900  },
      { level: 5, m: 1800, f: 1100 },
    ],
  },
  {
    slug: 'burn_row_min_split', category: 'BURN', subcategory: 'Max Power',
    name: 'Rowing lowest split (500m)', unit: 'seconds', direction: 'lower', requires_video: true,
    icon: '🚣',
    levels: [
      { level: 1, m: mmss('1:40'), f: mmss('1:55') },
      { level: 2, m: mmss('1:30'), f: mmss('1:45') },
      { level: 3, m: mmss('1:24'), f: mmss('1:35') },
      { level: 4, m: mmss('1:16'), f: mmss('1:30') },
      { level: 5, m: mmss('1:12'), f: mmss('1:25') },
    ],
  },
  {
    slug: 'burn_row_30s_cals', category: 'BURN', subcategory: 'Power Endurance',
    name: '30s max cals on rower', unit: 'cal', direction: 'higher', requires_video: true,
    icon: '🔥',
    levels: [
      { level: 1, m: 10, f: 6  },
      { level: 2, m: 15, f: 10 },
      { level: 3, m: 20, f: 12 },
      { level: 4, m: 22, f: 14 },
      { level: 5, m: 25, f: 16 },
    ],
  },
  {
    slug: 'burn_lactic_burpees', category: 'BURN', subcategory: 'Lactic',
    name: '3-min AMRAP burpees (after 40/30 cal row)',
    unit: 'reps', direction: 'higher', requires_video: true,
    icon: '💥',
    levels: [
      { level: 1, m: 5,  f: 5  },
      { level: 2, m: 12, f: 12 },
      { level: 3, m: 20, f: 20 },
      { level: 4, m: 28, f: 28 },
      { level: 5, m: 35, f: 35 },
    ],
  },
  {
    slug: 'burn_aerobic_bbj', category: 'BURN', subcategory: 'Aerobic Power',
    name: '7-min AMRAP burpee box jumps', unit: 'reps', direction: 'higher', requires_video: true,
    icon: '📦',
    levels: [
      { level: 1, m: 1,  f: 1  },
      { level: 2, m: 10, f: 10 },
      { level: 3, m: 20, f: 20 },
      { level: 4, m: 25, f: 25 },
      { level: 5, m: 30, f: 30 },
    ],
  },

  // ── LIFT ────────────────────────────────────────────────────────────────
  {
    slug: 'lift_front_squat_3rm', category: 'LIFT', subcategory: 'Squat',
    name: 'Front squat 3RM', unit: 'kg', direction: 'higher', requires_video: true,
    icon: '🏋️',
    levels: [
      { level: 1, m: 50,  f: 30 },
      { level: 2, m: 60,  f: 40 },
      { level: 3, m: 80,  f: 55 },
      { level: 4, m: 100, f: 75 },
      { level: 5, m: 120, f: 80 },
    ],
  },
  {
    slug: 'lift_deadlift_3rm', category: 'LIFT', subcategory: 'Hinge',
    name: 'Deadlift 3RM', unit: 'kg', direction: 'higher', requires_video: true,
    icon: '💪',
    levels: [
      { level: 1, m: 60,  f: 40  },
      { level: 2, m: 80,  f: 60  },
      { level: 3, m: 100, f: 75  },
      { level: 4, m: 140, f: 90  },
      { level: 5, m: 185, f: 120 },
    ],
  },
  {
    slug: 'lift_strict_press_3rm_per_hand', category: 'LIFT', subcategory: 'Press',
    name: 'Dual dumbbell strict press 3RM (per hand)',
    unit: 'kg', direction: 'higher', requires_video: true,
    icon: '🏋️',
    levels: [
      { level: 1, m: 10, f: 7    },
      { level: 2, m: 15, f: 10   },
      { level: 3, m: 20, f: 12.5 },
      { level: 4, m: 25, f: 15   },
      { level: 5, m: 32, f: 20   },
    ],
  },
  {
    slug: 'lift_clean_jerk_1rm', category: 'LIFT', subcategory: 'Olympic Lift',
    name: 'Barbell ground-to-overhead 1RM', unit: 'kg', direction: 'higher', requires_video: true,
    icon: '🏋️',
    levels: [
      { level: 1, m: 45,  f: 30 },
      { level: 2, m: 60,  f: 40 },
      { level: 3, m: 80,  f: 50 },
      { level: 4, m: 95,  f: 65 },
      { level: 5, m: 120, f: 80 },
    ],
  },

  {
    slug: 'lift_back_squat_3rm', category: 'LIFT', subcategory: 'Squat',
    name: 'Barbell back squat 3RM', unit: 'kg', direction: 'higher', requires_video: true,
    icon: '🦵',
    levels: [
      { level: 1, m: 60,  f: 40  },
      { level: 2, m: 80,  f: 55  },
      { level: 3, m: 110, f: 75  },
      { level: 4, m: 140, f: 100 },
      { level: 5, m: 180, f: 130 },
    ],
  },
  {
    slug: 'lift_bench_press_3rm', category: 'LIFT', subcategory: 'Press',
    name: 'Barbell bench press 3RM', unit: 'kg', direction: 'higher', requires_video: true,
    icon: '🏋️',
    levels: [
      { level: 1, m: 40,  f: 25 },
      { level: 2, m: 60,  f: 35 },
      { level: 3, m: 80,  f: 50 },
      { level: 4, m: 100, f: 65 },
      { level: 5, m: 130, f: 80 },
    ],
  },

  // ── Rowing for time ─────────────────────────────────────────────────────
  {
    slug: 'burn_row_1km_time', category: 'BURN', subcategory: 'Max Effort',
    name: '1km row for time', unit: 'seconds', direction: 'lower', requires_video: true,
    icon: '🚣',
    levels: [
      { level: 1, m: 300, f: 330 },   // 5:00 / 5:30
      { level: 2, m: 270, f: 300 },   // 4:30 / 5:00
      { level: 3, m: 240, f: 275 },   // 4:00 / 4:35
      { level: 4, m: 215, f: 250 },   // 3:35 / 4:10
      { level: 5, m: 190, f: 225 },   // 3:10 / 3:45
    ],
  },

  // ── Running (evidence URL = Strava/Garmin link or video). Strava OAuth
  //    auto-verification is a V1.x task (logged in pre-launch checklist).
  {
    slug: 'run_1km', category: 'BURN', subcategory: 'Run',
    name: '1km run for time', unit: 'seconds', direction: 'lower', requires_video: true,
    icon: '🏃',
    levels: [
      { level: 1, m: 360, f: 390 }, // 6:00 / 6:30
      { level: 2, m: 300, f: 330 }, // 5:00 / 5:30
      { level: 3, m: 255, f: 285 }, // 4:15 / 4:45
      { level: 4, m: 225, f: 255 }, // 3:45 / 4:15
      { level: 5, m: 195, f: 225 }, // 3:15 / 3:45
    ],
  },
  {
    slug: 'run_1mile', category: 'BURN', subcategory: 'Run',
    name: '1 mile run for time', unit: 'seconds', direction: 'lower', requires_video: true,
    icon: '🏃',
    levels: [
      { level: 1, m: 600, f: 660 }, // 10:00 / 11:00
      { level: 2, m: 480, f: 540 }, // 8:00 / 9:00
      { level: 3, m: 420, f: 480 }, // 7:00 / 8:00
      { level: 4, m: 360, f: 420 }, // 6:00 / 7:00
      { level: 5, m: 330, f: 390 }, // 5:30 / 6:30
    ],
  },
  {
    slug: 'run_5km', category: 'BURN', subcategory: 'Run',
    name: '5km run for time', unit: 'seconds', direction: 'lower', requires_video: true,
    icon: '🏃',
    levels: [
      { level: 1, m: 1800, f: 1920 }, // 30:00 / 32:00
      { level: 2, m: 1500, f: 1620 }, // 25:00 / 27:00
      { level: 3, m: 1320, f: 1440 }, // 22:00 / 24:00
      { level: 4, m: 1200, f: 1320 }, // 20:00 / 22:00
      { level: 5, m: 1080, f: 1200 }, // 18:00 / 20:00
    ],
  },
  {
    slug: 'run_5mile', category: 'BURN', subcategory: 'Run',
    name: '5 mile run for time', unit: 'seconds', direction: 'lower', requires_video: true,
    icon: '🏃',
    levels: [
      { level: 1, m: 3000, f: 3300 }, // 50:00 / 55:00
      { level: 2, m: 2520, f: 2820 }, // 42:00 / 47:00
      { level: 3, m: 2280, f: 2520 }, // 38:00 / 42:00
      { level: 4, m: 2040, f: 2280 }, // 34:00 / 38:00
      { level: 5, m: 1800, f: 2040 }, // 30:00 / 34:00
    ],
  },
  {
    slug: 'run_10km', category: 'BURN', subcategory: 'Run',
    name: '10km run for time', unit: 'seconds', direction: 'lower', requires_video: true,
    icon: '🏃',
    levels: [
      { level: 1, m: 3900, f: 4200 }, // 65:00 / 70:00
      { level: 2, m: 3300, f: 3600 }, // 55:00 / 60:00
      { level: 3, m: 2880, f: 3120 }, // 48:00 / 52:00
      { level: 4, m: 2580, f: 2820 }, // 43:00 / 47:00
      { level: 5, m: 2280, f: 2520 }, // 38:00 / 42:00
    ],
  },
  {
    slug: 'run_half_marathon', category: 'BURN', subcategory: 'Run',
    name: 'Half marathon (21.1km) for time', unit: 'seconds', direction: 'lower', requires_video: true,
    icon: '🏅',
    levels: [
      { level: 1, m: 9000, f: 9900 },  // 2:30 / 2:45
      { level: 2, m: 7800, f: 8400 },  // 2:10 / 2:20
      { level: 3, m: 6900, f: 7500 },  // 1:55 / 2:05
      { level: 4, m: 6000, f: 6600 },  // 1:40 / 1:50
      { level: 5, m: 5280, f: 5880 },  // 1:28 / 1:38
    ],
  },
  {
    slug: 'run_marathon', category: 'BURN', subcategory: 'Run',
    name: 'Marathon (42.2km) for time', unit: 'seconds', direction: 'lower', requires_video: true,
    icon: '🏆',
    levels: [
      { level: 1, m: 19800, f: 21600 }, // 5:30 / 6:00
      { level: 2, m: 16200, f: 17400 }, // 4:30 / 4:50
      { level: 3, m: 14400, f: 15300 }, // 4:00 / 4:15
      { level: 4, m: 12600, f: 13500 }, // 3:30 / 3:45
      { level: 5, m: 10800, f: 11700 }, // 3:00 / 3:15
    ],
  },

  // ── Coach's picks (not PDF but Dan's brief) ─────────────────────────────
  {
    slug: 'move_max_strict_chinups', category: 'MOVE', subcategory: 'Bar',
    name: 'Max strict chin-ups (one set)', unit: 'reps', direction: 'higher', requires_video: true,
    icon: '🪢',
    levels: [
      { level: 1, m: 1,  f: 1  },
      { level: 2, m: 5,  f: 3  },
      { level: 3, m: 10, f: 6  },
      { level: 4, m: 15, f: 10 },
      { level: 5, m: 20, f: 15 },
    ],
  },
  {
    slug: 'move_max_strict_dips', category: 'MOVE', subcategory: 'Bar',
    name: 'Max strict dips (one set)', unit: 'reps', direction: 'higher', requires_video: true,
    icon: '💪',
    levels: [
      { level: 1, m: 1,  f: 1  },
      { level: 2, m: 10, f: 5  },
      { level: 3, m: 20, f: 10 },
      { level: 4, m: 30, f: 18 },
      { level: 5, m: 40, f: 25 },
    ],
  },
  {
    slug: 'move_max_muscle_ups', category: 'MOVE', subcategory: 'Bar',
    name: 'Max strict muscle-ups (one set)', unit: 'reps', direction: 'higher', requires_video: true,
    icon: '🤸',
    levels: [
      { level: 1, m: 1,  f: 1 },
      { level: 2, m: 3,  f: 1 },
      { level: 3, m: 5,  f: 3 },
      { level: 4, m: 10, f: 5 },
      { level: 5, m: 15, f: 8 },
    ],
  },
  {
    slug: 'move_handstand_hold', category: 'MOVE', subcategory: 'Handstand',
    name: 'Freestanding handstand hold', unit: 'seconds', direction: 'higher', requires_video: true,
    icon: '🤸',
    levels: [
      { level: 1, m: 5,   f: 5   },
      { level: 2, m: 15,  f: 10  },
      { level: 3, m: 30,  f: 20  },
      { level: 4, m: 60,  f: 45  },
      { level: 5, m: 120, f: 90  },
    ],
  },
  {
    slug: 'move_lsit_hold', category: 'MOVE', subcategory: 'Core',
    name: 'L-sit hold on paralettes', unit: 'seconds', direction: 'higher', requires_video: true,
    icon: '🧘',
    levels: [
      { level: 1, m: 5,  f: 5  },
      { level: 2, m: 15, f: 10 },
      { level: 3, m: 30, f: 20 },
      { level: 4, m: 45, f: 30 },
      { level: 5, m: 60, f: 45 },
    ],
  },
];

// Skill ladders: no single numeric threshold; each level description is the
// standard, coach verifies via video that the client met it.
const SKILL_LADDERS = [
  {
    slug: 'move_pullup_progression', category: 'MOVE', subcategory: 'Bar',
    name: 'Pull-up progression', icon: '🪢', requires_video: true,
    levels: [
      { level: 1, title: 'Bar hang',        description: '30 sec hang' },
      { level: 2, title: 'Strict pull-ups', description: '3 (M) / 1 (F) strict pull-ups' },
      { level: 3, title: 'Kipping pull-ups',description: '5 (M) / 3 (F) kipping pull-ups' },
      { level: 4, title: 'Chest to bar',    description: '10 kipping chest-to-bar pull-ups' },
      { level: 5, title: 'Muscle-up',       description: '5 (M) / 3 (F) bar muscle-ups' },
    ],
  },
  {
    slug: 'move_handstand_progression', category: 'MOVE', subcategory: 'Handstand',
    name: 'Handstand progression', icon: '🤸', requires_video: true,
    levels: [
      { level: 1, title: 'Chest to wall',       description: '20 sec 45° chest-to-wall hold' },
      { level: 2, title: 'Wall walk hold',      description: 'Wall walk into 20 sec chest-to-wall hold (toes only on wall)' },
      { level: 3, title: 'Kick-up hold',        description: 'Kick up to wall into 30 sec back-to-wall hold (feet only on wall)' },
      { level: 4, title: 'Strict HSPU',         description: '3 (M) / 1 (F) strict handstand push-ups + 60 sec chest-to-wall hold' },
      { level: 5, title: 'HSPU + walk',         description: '10 (M) / 5 (F) strict HSPU + 10m unbroken handstand walk' },
    ],
  },
  {
    slug: 'move_core_progression', category: 'MOVE', subcategory: 'Core',
    name: 'Core progression', icon: '🧘', requires_video: true,
    levels: [
      { level: 1, title: 'Hollow tuck hang',    description: '15 sec hollow tuck hang on bar' },
      { level: 2, title: 'Hollow hold',         description: '30 sec hollow hold on floor, arms and legs straight overhead' },
      { level: 3, title: 'Hanging L-sit',       description: '10 sec hanging L-sit' },
      { level: 4, title: 'Strict toes to bar',  description: '5 strict toes to bar + 20 sec L-sit on paralettes' },
      { level: 5, title: 'Advanced L-sit',      description: '10 strict toes to bar + 60 sec L-sit on paralettes' },
    ],
  },
];

function main() {
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  const tx = db.transaction(() => {
    // Clear existing (cascades to levels + attempts)
    db.prepare('DELETE FROM benchmarks').run();

    const insC = db.prepare(`
      INSERT INTO benchmarks
        (category, subcategory, slug, name, description, unit, direction,
         requires_video, icon, sort_order, type)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
    `);
    const insL = db.prepare(`
      INSERT INTO benchmark_levels
        (benchmark_id, level_number, title, description, male_threshold, female_threshold)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let order = 0;
    for (const c of NUMERIC_CHALLENGES) {
      const r = insC.run(
        c.category, c.subcategory || null, c.slug, c.name,
        c.unit, c.direction, c.requires_video ? 1 : 0, c.icon || null, order++, 'numeric'
      );
      for (const l of c.levels) {
        insL.run(r.lastInsertRowid, l.level, l.title || null, null, l.m, l.f);
      }
    }
    for (const c of SKILL_LADDERS) {
      const r = insC.run(
        c.category, c.subcategory || null, c.slug, c.name,
        'level', 'higher', c.requires_video ? 1 : 0, c.icon || null, order++, 'skill_ladder'
      );
      for (const l of c.levels) {
        insL.run(r.lastInsertRowid, l.level, l.title, l.description, null, null);
      }
    }

    const total = db.prepare('SELECT COUNT(*) c FROM benchmarks').get().c;
    const tl    = db.prepare('SELECT COUNT(*) c FROM benchmark_levels').get().c;
    console.log(`seeded ${total} benchmarks, ${tl} levels`);
  });

  tx();
  db.close();
}

main();
