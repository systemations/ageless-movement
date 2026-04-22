#!/usr/bin/env node
/**
 * Seed Pickleball Performance Programs (Gym Edition)
 *
 * Mirrors the Home program (seed-pickleball.cjs) with the same 16 weeks /
 * 4 phases / S1+S2+S3 session templates, but swaps in gym equipment for
 * the movements that have a clear barbell/cable/dumbbell progression.
 *
 * Creates two programs:
 *   - Pickleball Performance | Gym (3x/Week)
 *   - Pickleball Performance | Gym (2x/Week)
 *
 * Mobility drills that have no gym counterpart (e.g. shoulder dislocates,
 * 90/90, tailor pose) keep the same bodyweight IDs as the Home program.
 * That's on purpose — gym doesn't mean "load everything".
 *
 * Safe to re-run: deletes existing gym programs by exact title first.
 */

const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data', 'ageless.db'));

const COACH_ID = 2; // Coach Dan

// ─── Gym Exercise Slots ────────────────────────────────────────────
// Same keys as Home program, but each slot promotes gym equipment as
// primary where it makes sense. Format: [primary, alt1, alt2, alt3]
// (easiest → hardest, with home/bodyweight fallbacks).

const EX = {
  // ── HIP EXTENSION / FLEXION ── (swap glute bridge → hip thrust, deadlift in)
  hipFlexorStretch:    [430, 66, 174, 175],
  gluteBridge:         [145, 102, 103, 395],    // Barbell Hip Thrust primary → BW Glute Bridge progressions
  hipExtension:        [311, 5, 108, 263],
  elephantWalks:       [301, 69, 113, 271],     // Stiff-Leg KB Deadlift → KB Deadlift → Hamstring Stretch → SL Deadlift
  longLunge:           [174, 386, 175, 284],
  hamstringStretch:    [113, 234, 298, 177],

  // ── HIP ADDUCTION / ABDUCTION ── (Copenhagen stays, rest mobility)
  adductorLifts:       [63, 425, 426, 289],     // Copenhagen Plank primary (hardest) → BW progressions
  tailorPose:          [316, 418, 92, 149],
  frogStretch:         [93, 107, 188, 152],
  fireHydrants:        [86, 87, 195, 163],
  ninetyNinety:        [376, 22, 23, 24],
  sidePancake:         [261, 297, 292, 302],

  // ── HIP ROTATION ── (mobility-first, gym has no clean rotation loaders)
  figFourRotations:    [85, 371, 313, 392],
  kneelingIR:          [402, 400, 308, 372],
  ninetyNinetyRear:    [27, 25, 26, 376],
  pigeonGM:            [414, 378, 96, 394],     // Weighted Pigeon GMs primary
  corkScrews:          [64, 100, 366, 382],

  // ── SHOULDER FLEXION (OVERHEAD) ── (swap in DB/BB press)
  shoulderFlexChild:   [242, 243, 37, 315],
  cactusUp:            [295, 230, 57, 56],      // Standing DB Press → Seated DB Press → Cactus Contractions → BW
  shoulderSeries:      [421, 249, 45, 267],     // Lu Raises primary → BW series → banded
  shoulderDislocates:  [239, 244, 277, 387],    // Mobility drill, no gym version

  // ── SHOULDER ROTATION ── (weighted ER/IR with DB)
  cactusDown:          [225, 257, 55, 54],      // Seated DB ER → Side Lying DB ER → Cactus Weighted → BW
  sleeperStretch:      [259, 258, 373, 202],    // Sleeper Stretch → Weighted Negatives
  shoulderInlocates:   [245, 246, 44, 379],
  chickenWing:         [377, 44, 308, 381],
  shoulderCapsule:     [237, 238, 422, 432],

  // ── THORACIC SPINE ── (mobility, keep home IDs)
  thoracicExt:         [435, 318, 317, 319],
  spinalSegmentation:  [282, 283, 281, 310],    // Jefferson Curls (DB) primary
  spinalRotation:      [279, 280, 381, 382],
  catCow:              [415, 342, 164, 165],
  sideBody:            [255, 229, 291, 375],
  twistingBear:        [366, 278, 100, 358],

  // ── CORE / ANTI-ROTATION ── (cable Pallof, weighted obliques)
  hollowBody:          [146, 147, 148, 409],
  archBody:            [408, 35, 36, 38],
  sidePlank:           [1309, 187, 262, 79],    // Pallof Press (cable) primary → BW
  frontSupport:        [98, 77, 253, 155],
  obliques:            [416, 411, 412, 109],

  // ── ANKLE / LOWER LEG ──
  ankleDorsi:          [32, 33, 6, 274],
  calfWork:            [58, 269, 59, 270],
  tibWork:             [34, 201, 369, 370],
  toeMobility:         [320, 47, 88, 236],

  // ── WRIST / FOREARM ── (DB primary)
  wristSeries:         [359, 360, 90, 361],     // DB Wrist Ext → DB Wrist Flex → Forearm Roll Outs → BW Series

  // ── BALANCE / INTEGRATION ──
  balance:             [42, 142, 170, 65],
  rearLunge:           [41, 97, 284, 285],      // Back Squat BB → Front Squat BB → Split Squat IR → Split Squat
};

// ─── Session Templates (reused verbatim from Home) ─────────────────
// These are the same training prescriptions. Only the exercise IDs each
// key resolves to changed. require()-ing the Home seed is fragile because
// it has side effects (it creates programs), so we duplicate the minimum
// needed: the `sessions3x` object and the 2x merge helper.

function mobility(exKey, hold = 30, sets = 2, notes = '') {
  return { exKey, sets, reps: null, duration: hold, rest: 15, group: 'standard', label: '', notes, perSide: true, timeBased: true };
}
function active(exKey, reps = 10, sets = 2, notes = '') {
  return { exKey, sets, reps, duration: null, rest: 15, group: 'standard', label: '', notes, perSide: false, timeBased: false };
}
function activePerSide(exKey, reps = 8, sets = 2, notes = '') {
  return { exKey, sets, reps, duration: null, rest: 15, group: 'standard', label: '', notes, perSide: true, timeBased: false };
}

const sessions3x = {
  phase1: {
    s1: {
      title: 'Hips & Shoulders | Extension & Flexion',
      description: 'Gym version of the Foundation Phase S1. Barbell/DB loading for hip hinge and overhead press paired with mobility work. Bodyweight for mobility-only drills.',
      duration: 35, intensity: 'Low-Moderate',
      bodyParts: 'Hip Flexors,Hamstrings,Deltoids,Thoracic Spine',
      exercises: [
        active('hipExtension', 10, 2, 'Gentle warm-up circles'),
        mobility('hipFlexorStretch', 30, 2, 'Breathe into the stretch, keep ribs down'),
        active('gluteBridge', 8, 3, 'Barbell hip thrust, pause at top'),
        mobility('longLunge', 30, 2, 'Sink hips forward, back knee on mat'),
        mobility('hamstringStretch', 30, 2, 'Straight leg, hinge from hips not back'),
        mobility('shoulderFlexChild', 30, 2, 'Push hands into floor, reach long'),
        active('cactusUp', 10, 3, 'DB overhead press, controlled tempo'),
        mobility('thoracicExt', 30, 2, 'Breathe into extension, keep ribs connected'),
        mobility('ankleDorsi', 30, 2, 'Drive knee over toe, heel stays down'),
      ]
    },
    s2: {
      title: 'Hips & Shoulders | Adduction & Abduction',
      description: 'Gym Foundation S2. Copenhagen plank for adductor strength, DB work for shoulder rotation. Supports lateral court movement.',
      duration: 35, intensity: 'Low-Moderate',
      bodyParts: 'Hip Adductors,Gluteus Medius,Deltoids,Rotator Cuff',
      exercises: [
        active('fireHydrants', 10, 2, 'Controlled circles, not rushing'),
        mobility('tailorPose', 30, 2, 'Sit tall, press knees gently toward floor'),
        mobility('frogStretch', 30, 2, 'Rock gently forward and back'),
        activePerSide('adductorLifts', 6, 2, 'Copenhagen plank - short lever if new'),
        mobility('ninetyNinety', 30, 2, 'Square hips, lean into front leg'),
        mobility('shoulderCapsule', 30, 2, 'Gentle stretch, no pain'),
        active('shoulderSeries', 10, 3, 'Lu raises with plates, full ROM'),
        mobility('sideBody', 30, 2, 'Reach long through fingertips'),
        active('calfWork', 12, 2, 'Full range - stretch at bottom, pause at top'),
      ]
    },
    s3: {
      title: 'Rotational Mobility | Hips & Shoulders',
      description: 'Gym Foundation S3. Cable Pallof press for anti-rotation, DB external rotation work. Rotational power is the big unlock for paddle mechanics.',
      duration: 35, intensity: 'Low-Moderate',
      bodyParts: 'Hip Flexors,Rotator Cuff,Obliques,Erector Spinae',
      exercises: [
        active('corkScrews', 8, 2, 'Smooth rotations, keep core engaged'),
        mobility('figFourRotations', 30, 2, 'Let gravity do the work'),
        mobility('kneelingIR', 30, 2, 'Sit back gently into internal rotation'),
        mobility('ninetyNinetyRear', 30, 2, 'Hold and breathe, lean forward slightly'),
        active('cactusDown', 10, 3, 'Seated DB external rotation, light weight'),
        mobility('sleeperStretch', 30, 2, 'Gentle pressure, stop if sharp pain'),
        mobility('spinalRotation', 30, 2, 'Shoulders stay on floor, rotate from mid-back'),
        activePerSide('sidePlank', 8, 3, 'Cable Pallof press - resist rotation'),
        active('tibWork', 12, 2, 'Toes up as high as possible'),
      ]
    }
  },
  phase2: {
    s1: {
      title: 'Hips & Shoulders | Extension & Flexion',
      description: 'Gym Build S1. Add loading to hinge, progress deadlift/hip thrust. DB press with heavier weight.',
      duration: 40, intensity: 'Moderate',
      bodyParts: 'Hip Flexors,Hamstrings,Deltoids,Thoracic Spine',
      exercises: [
        active('hipExtension', 10, 2, 'Bigger circles, controlled speed'),
        mobility('hipFlexorStretch', 45, 2, 'Add gentle contractions: push into floor 5s, relax deeper'),
        active('gluteBridge', 6, 4, 'Heavier hip thrust, 3s pause at top'),
        mobility('longLunge', 45, 2, 'Deeper lunge, arms overhead for extra stretch'),
        activePerSide('elephantWalks', 6, 3, 'KB stiff-leg deadlift, slow eccentric'),
        mobility('shoulderFlexChild', 45, 2, 'Add contractions: press down 5s, reach further'),
        active('cactusUp', 8, 4, 'Standing DB press, stricter tempo'),
        mobility('thoracicExt', 45, 3, 'Progress to roller if available'),
        mobility('catCow', 30, 2, 'Segmental movement - one vertebra at a time'),
        active('ankleDorsi', 12, 2, 'Add contractions at end range'),
      ]
    },
    s2: {
      title: 'Hips & Shoulders | Adduction & Abduction',
      description: 'Gym Build S2. Copenhagen progressions + cable lateral raises + weighted shoulder work.',
      duration: 40, intensity: 'Moderate',
      bodyParts: 'Hip Adductors,Gluteus Medius,Deltoids,Rotator Cuff',
      exercises: [
        activePerSide('fireHydrants', 10, 2, 'Add leg extensions at top'),
        mobility('frogStretch', 45, 2, 'Wider stance, add contractions'),
        activePerSide('adductorLifts', 8, 3, 'Long-lever Copenhagen - slow tempo'),
        mobility('sidePancake', 30, 2, 'Reach toward foot, keep chest open'),
        mobility('ninetyNinety', 45, 3, 'Add gentle rotational contractions'),
        mobility('shoulderCapsule', 45, 2, 'Deeper range with contractions'),
        active('shoulderSeries', 10, 4, 'Lu raises with plates, heavier'),
        mobility('shoulderInlocates', 30, 2, 'Controlled internal rotation work'),
        activePerSide('balance', 30, 2, 'Hold each side, eyes open then closed'),
        active('calfWork', 15, 2, 'Single leg progression if ready'),
      ]
    },
    s3: {
      title: 'Rotational Mobility | Hips & Shoulders',
      description: 'Gym Build S3. Cable Pallof with longer time under tension, heavier external rotation work. Weighted spinal rotation.',
      duration: 40, intensity: 'Moderate',
      bodyParts: 'Hip Flexors,Rotator Cuff,Obliques,Erector Spinae',
      exercises: [
        active('twistingBear', 8, 2, 'Add reach-through rotation'),
        mobility('figFourRotations', 45, 2, 'Add contractions at end range'),
        mobility('kneelingIR', 45, 2, 'Deeper range, add oscillations'),
        mobility('pigeonGM', 30, 2, 'Weighted pigeon GM, flat back'),
        active('cactusDown', 8, 4, 'DB external rotation, heavier'),
        mobility('sleeperStretch', 45, 2, 'Weighted progression if comfortable'),
        active('chickenWing', 10, 2, 'Controlled rotation with band if available'),
        mobility('spinalRotation', 45, 3, 'Weighted spinal rotation'),
        activePerSide('sidePlank', 10, 4, 'Pallof press with longer hold at end range'),
        active('tibWork', 15, 2, 'Add banded resistance if available'),
      ]
    }
  },
  phase3: {
    s1: {
      title: 'Hips & Shoulders | Extension & Flexion',
      description: 'Gym Perform S1. Sport-specific loading — back squat and front squat patterns, heavier DB press. Pickleball-specific hip power.',
      duration: 45, intensity: 'Moderate-High',
      bodyParts: 'Hip Flexors,Hamstrings,Deltoids,Thoracic Spine',
      exercises: [
        active('rearLunge', 5, 4, 'Back squat - focus on depth and drive'),
        mobility('hipFlexorStretch', 45, 3, 'Deep range with 3-position contractions'),
        active('gluteBridge', 5, 4, 'Heavy hip thrust, explosive concentric'),
        activePerSide('elephantWalks', 5, 4, 'KB stiff-leg deadlift, heavier load'),
        mobility('hamstringStretch', 45, 3, 'Active stretching with contractions'),
        mobility('shoulderDislocates', 30, 3, 'Narrow grip progression'),
        active('cactusUp', 6, 4, 'Standing DB press, heavier, strict'),
        mobility('thoracicExt', 45, 3, 'Combined with shoulder flexion'),
        active('spinalSegmentation', 6, 3, 'Jefferson curls with DB, slow tempo'),
        active('toeMobility', 10, 2, 'Full foot mobility sequence'),
      ]
    },
    s2: {
      title: 'Hips & Shoulders | Adduction & Abduction',
      description: 'Gym Perform S2. Heavy Copenhagen, loaded shoulder series. Building lateral strength for court-change speed.',
      duration: 45, intensity: 'Moderate-High',
      bodyParts: 'Hip Adductors,Gluteus Medius,Deltoids,Rotator Cuff',
      exercises: [
        activePerSide('balance', 10, 2, 'Dynamic balance with hip airplanes'),
        mobility('frogStretch', 45, 3, 'Loaded frog with contractions'),
        activePerSide('adductorLifts', 10, 4, 'Copenhagen long-lever, tempo 3-0-3'),
        mobility('sidePancake', 45, 2, 'Weighted reach-throughs'),
        mobility('ninetyNinety', 45, 3, 'Add weighted transitions'),
        mobility('shoulderCapsule', 45, 3, 'Deep range with 3-position contractions'),
        active('shoulderSeries', 8, 5, 'Lu raises - heavy, pristine form'),
        activePerSide('balance', 45, 3, 'Single leg stability with cable pull'),
        active('calfWork', 15, 3, 'Single leg, add weight in one hand'),
      ]
    },
    s3: {
      title: 'Rotational Mobility | Hips & Shoulders',
      description: 'Gym Perform S3. Peak rotational power — heavier external rotation, weighted Pallof, loaded rotational patterns.',
      duration: 45, intensity: 'Moderate-High',
      bodyParts: 'Hip Flexors,Rotator Cuff,Obliques,Erector Spinae',
      exercises: [
        activePerSide('rearLunge', 6, 3, 'Front squat - emphasize thoracic extension'),
        mobility('figFourRotations', 45, 3, 'Weighted external rotation focus'),
        activePerSide('kneelingIR', 45, 3, 'Deeper range with light load'),
        active('pigeonGM', 8, 3, 'Weighted pigeon GMs - heavier'),
        active('cactusDown', 6, 5, 'DB ER heavy, 3s eccentric'),
        mobility('sleeperStretch', 45, 3, 'Weighted sleeper stretch with holds'),
        active('chickenWing', 8, 3, 'Banded rotation, heavier tension'),
        mobility('spinalRotation', 45, 3, 'Weighted rotation, slow tempo'),
        activePerSide('sidePlank', 12, 4, 'Pallof with heavier cable, 2s hold'),
        active('obliques', 10, 4, 'Weighted oblique work, controlled tempo'),
      ]
    }
  },
  phase4: {
    s1: {
      title: 'Hips & Shoulders | Extension & Flexion',
      description: 'Gym Maintain S1. Maintenance loading — moderate weight, high quality, auto-regulated. Keep the gains without burnout.',
      duration: 40, intensity: 'Moderate',
      bodyParts: 'Hip Flexors,Hamstrings,Deltoids,Thoracic Spine',
      exercises: [
        active('rearLunge', 6, 3, 'Back squat at 70-75% of perform phase load'),
        mobility('hipFlexorStretch', 45, 3, 'Maintenance flow - keep end range'),
        active('gluteBridge', 8, 3, 'Hip thrust - maintain power'),
        activePerSide('elephantWalks', 6, 3, 'KB RDL - keep pattern, moderate weight'),
        mobility('hamstringStretch', 45, 2, 'Flow through positions'),
        active('cactusUp', 8, 3, 'DB press - maintain overhead capacity'),
        mobility('thoracicExt', 45, 2, 'Keep the mobility gains'),
        active('spinalSegmentation', 8, 2, 'Light Jefferson curls'),
        active('ankleDorsi', 12, 2, 'Maintain dorsiflexion'),
      ]
    },
    s2: {
      title: 'Hips & Shoulders | Adduction & Abduction',
      description: 'Gym Maintain S2. Keep lateral capacity with moderate Copenhagen + shoulder loading. Prevent regression.',
      duration: 40, intensity: 'Moderate',
      bodyParts: 'Hip Adductors,Gluteus Medius,Deltoids,Rotator Cuff',
      exercises: [
        activePerSide('fireHydrants', 10, 2, 'Prime the hips'),
        mobility('frogStretch', 45, 2, 'Maintain the range'),
        activePerSide('adductorLifts', 8, 3, 'Moderate Copenhagen, quality over load'),
        mobility('ninetyNinety', 45, 2, 'Flow through positions'),
        mobility('shoulderCapsule', 45, 2, 'Keep capsule mobility'),
        active('shoulderSeries', 10, 3, 'Lu raises - maintain'),
        mobility('shoulderInlocates', 30, 2, 'IR mobility stays'),
        activePerSide('balance', 45, 2, 'Single leg stability'),
        active('calfWork', 12, 2, 'Maintain capacity'),
      ]
    },
    s3: {
      title: 'Rotational Mobility | Hips & Shoulders',
      description: 'Gym Maintain S3. Hold rotational gains with moderate loading. Lower volume so you can play pickleball fresh.',
      duration: 40, intensity: 'Moderate',
      bodyParts: 'Hip Flexors,Rotator Cuff,Obliques,Erector Spinae',
      exercises: [
        active('twistingBear', 8, 2, 'Warm up rotations'),
        mobility('figFourRotations', 45, 2, 'Maintain hip rotation'),
        mobility('kneelingIR', 45, 2, 'Keep IR range'),
        active('pigeonGM', 8, 2, 'Light pigeon GMs'),
        active('cactusDown', 8, 3, 'DB ER - maintain'),
        mobility('sleeperStretch', 45, 2, 'Keep posterior capsule mobility'),
        mobility('spinalRotation', 45, 2, 'Daily rotation'),
        activePerSide('sidePlank', 10, 3, 'Pallof press - moderate'),
        active('obliques', 8, 2, 'Maintain core rotation capacity'),
      ]
    }
  }
};

// 2x/week merge: combine S1+part of S3 into Full Body A,
// and S2+rest of S3 into Full Body B (same logic as Home).
function build2xSessions(sessionData) {
  const { s1, s2, s3 } = sessionData;
  return {
    sA: {
      title: 'Full Body A | Extension, Flexion & Overhead',
      description: s1.description + ' Combined with rotational hip work.',
      duration: Math.round(s1.duration * 1.2),
      intensity: s1.intensity,
      bodyParts: 'Hip Flexors,Hamstrings,Deltoids,Thoracic Spine,Ankles',
      exercises: [
        ...s1.exercises.slice(0, 6),
        s3.exercises[1],
        ...s1.exercises.slice(6),
      ]
    },
    sB: {
      title: 'Full Body B | Lateral, Rotation & Stability',
      description: s2.description + ' Combined with rotational shoulder work and core stability.',
      duration: Math.round(s2.duration * 1.2),
      intensity: s2.intensity,
      bodyParts: 'Hip Adductors,Gluteus Medius,Rotator Cuff,Obliques,Erector Spinae',
      exercises: [
        ...s2.exercises.slice(0, 5),
        s3.exercises[4],
        s3.exercises[5],
        ...s2.exercises.slice(5, 7),
        s3.exercises[7],
        s2.exercises[s2.exercises.length - 1],
      ]
    }
  };
}

// ─── Build Functions (same shape as Home seed) ─────────────────────

function createProgram(title, description, durationWeeks, workoutsPerWeek) {
  const stmt = db.prepare(
    `INSERT INTO programs (coach_id, title, description, duration_weeks, workouts_per_week, min_duration, max_duration)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(COACH_ID, title, description, durationWeeks, workoutsPerWeek, 35, 45);
  console.log(`  Created program: "${title}" (ID: ${info.lastInsertRowid})`);
  return info.lastInsertRowid;
}

function createPhase(programId, phaseNumber, title, weeks) {
  const stmt = db.prepare(
    `INSERT INTO program_phases (program_id, phase_number, title, weeks) VALUES (?, ?, ?, ?)`
  );
  const info = stmt.run(programId, phaseNumber, title, weeks);
  console.log(`    Phase ${phaseNumber}: "${title}" (ID: ${info.lastInsertRowid})`);
  return info.lastInsertRowid;
}

function createWorkout(programId, phaseId, weekNumber, dayNumber, template) {
  const stmt = db.prepare(
    `INSERT INTO workouts (program_id, phase_id, week_number, day_number, title, description, duration_mins, intensity, body_parts, equipment, workout_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'mobility')`
  );
  const info = stmt.run(programId, phaseId, weekNumber, dayNumber, template.title, template.description, template.duration, template.intensity, template.bodyParts, 'Barbell, Dumbbell, Cable');
  return info.lastInsertRowid;
}

function addExercise(workoutId, exerciseId, orderIndex, config) {
  const stmt = db.prepare(
    `INSERT INTO workout_exercises (workout_id, exercise_id, order_index, sets, reps, duration_secs, rest_secs, group_type, group_label, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  );
  const row = stmt.get(workoutId, exerciseId, orderIndex, config.sets, config.reps, config.duration, config.rest, config.group, config.label, config.notes);
  const weId = row.id;
  const metaStmt = db.prepare(
    `INSERT INTO workout_exercise_meta (workout_exercise_id, per_side, time_based) VALUES (?, ?, ?)`
  );
  metaStmt.run(weId, config.perSide ? 'Per Side' : null, config.timeBased ? 1 : 0);
  return weId;
}

function addAlternates(weId, alternateIds) {
  const stmt = db.prepare(
    `INSERT INTO workout_exercise_alternates (workout_exercise_id, alternative_id, enabled, sort_order) VALUES (?, ?, 1, ?)`
  );
  alternateIds.forEach((altId, idx) => {
    stmt.run(weId, altId, idx + 1);
  });
}

// ─── Safety: delete existing Gym programs so this is idempotent ─────
function deleteIfExists(title) {
  const row = db.prepare('SELECT id FROM programs WHERE title = ?').get(title);
  if (!row) return;
  console.log(`  Removing existing program "${title}" (ID ${row.id})`);
  db.prepare('DELETE FROM programs WHERE id = ?').run(row.id);
  // workouts / workout_exercises / workout_exercise_meta / workout_exercise_alternates / program_phases
  // should cascade delete via foreign keys (schema has ON DELETE CASCADE on most child tables).
}

// ─── Main Build ─────────────────────────────────────────────────────

const phaseNames = [
  { num: 1, title: 'Phase 1 | Foundation', weeks: 4 },
  { num: 2, title: 'Phase 2 | Build', weeks: 4 },
  { num: 3, title: 'Phase 3 | Perform', weeks: 4 },
  { num: 4, title: 'Phase 4 | Maintain & Progress', weeks: 4 },
];

const phaseKeys = ['phase1', 'phase2', 'phase3', 'phase4'];

console.log('\n=== Building Pickleball Performance Programs (Gym Edition) ===\n');

deleteIfExists('Pickleball Performance | Gym (3x/Week)');
deleteIfExists('Pickleball Performance | Gym (2x/Week)');

// ── 3x/Week Program ──
console.log('--- 3x/Week Program ---');
const prog3xId = createProgram(
  'Pickleball Performance | Gym (3x/Week)',
  'A 16-week gym-based mobility and strength program for pickleball players training 3 times per week. Same session themes as the Home edition (hip ext/flex with shoulder overhead; hip add/abd with lateral stability; full rotation), but with barbell, dumbbell, and cable progressions where it makes sense. Best for players with gym access who want to build load tolerance alongside mobility. Each phase 4 weeks, 4 alternatives per exercise.',
  16, 3
);

phaseNames.forEach((phase, pi) => {
  const phaseId = createPhase(prog3xId, phase.num, phase.title, phase.weeks);
  const sessionData = sessions3x[phaseKeys[pi]];
  const startWeek = pi * 4 + 1;

  for (let w = 0; w < 4; w++) {
    const weekNum = startWeek + w;
    let dayNum = 1;
    ['s1', 's2', 's3'].forEach(sKey => {
      const template = sessionData[sKey];
      const workoutId = createWorkout(prog3xId, phaseId, weekNum, dayNum, template);
      template.exercises.forEach((ex, idx) => {
        const exSlot = EX[ex.exKey];
        if (!exSlot) {
          console.error(`  Missing gym slot for key: ${ex.exKey}`);
          return;
        }
        const primaryId = exSlot[0];
        const altIds = exSlot.slice(1);
        const weId = addExercise(workoutId, primaryId, idx + 1, ex);
        if (altIds.length > 0) addAlternates(weId, altIds);
      });
      dayNum++;
    });
  }
  console.log(`    Weeks ${startWeek}-${startWeek + 3}: 12 workouts created`);
});

// ── 2x/Week Program ──
console.log('\n--- 2x/Week Program ---');
const prog2xId = createProgram(
  'Pickleball Performance | Gym (2x/Week)',
  'A 16-week gym-based mobility and strength program for pickleball players training 2 times per week. Two full-body sessions cover all movement patterns with barbell, dumbbell, and cable loading where appropriate. Built on the same 4-phase progression as the 3x and Home variants so clients can step up or down without losing the pattern.',
  16, 2
);

phaseNames.forEach((phase, pi) => {
  const phaseId = createPhase(prog2xId, phase.num, phase.title, phase.weeks);
  const sessionData = sessions3x[phaseKeys[pi]];
  const merged = build2xSessions(sessionData);
  const startWeek = pi * 4 + 1;

  for (let w = 0; w < 4; w++) {
    const weekNum = startWeek + w;
    let dayNum = 1;
    ['sA', 'sB'].forEach(sKey => {
      const template = merged[sKey];
      const workoutId = createWorkout(prog2xId, phaseId, weekNum, dayNum, template);
      template.exercises.forEach((ex, idx) => {
        const exSlot = EX[ex.exKey];
        if (!exSlot) {
          console.error(`  Missing gym slot for key: ${ex.exKey}`);
          return;
        }
        const primaryId = exSlot[0];
        const altIds = exSlot.slice(1);
        const weId = addExercise(workoutId, primaryId, idx + 1, ex);
        if (altIds.length > 0) addAlternates(weId, altIds);
      });
      dayNum++;
    });
  }
  console.log(`    Weeks ${startWeek}-${startWeek + 3}: 8 workouts created`);
});

// ── Summary ──
const total3x = db.prepare('SELECT COUNT(*) as c FROM workouts WHERE program_id = ?').get(prog3xId).c;
const total2x = db.prepare('SELECT COUNT(*) as c FROM workouts WHERE program_id = ?').get(prog2xId).c;
const totalWE = db.prepare(
  `SELECT COUNT(*) as c FROM workout_exercises we
   JOIN workouts w ON we.workout_id = w.id
   WHERE w.program_id IN (?, ?)`
).get(prog3xId, prog2xId).c;
const totalAlts = db.prepare(
  `SELECT COUNT(*) as c FROM workout_exercise_alternates wea
   JOIN workout_exercises we ON wea.workout_exercise_id = we.id
   JOIN workouts w ON we.workout_id = w.id
   WHERE w.program_id IN (?, ?)`
).get(prog3xId, prog2xId).c;

console.log('\n=== Summary ===');
console.log(`3x/Week Gym (ID ${prog3xId}): ${total3x} workouts`);
console.log(`2x/Week Gym (ID ${prog2xId}): ${total2x} workouts`);
console.log(`Total exercise placements: ${totalWE}`);
console.log(`Total alternatives: ${totalAlts}`);
console.log('Done!\n');

db.close();
