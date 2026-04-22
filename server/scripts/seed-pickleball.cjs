#!/usr/bin/env node
/**
 * Seed Pickleball Performance Programs (Home Edition)
 * - 2x/week program (16 weeks, 4 phases)
 * - 3x/week program (16 weeks, 4 phases)
 * Uses existing exercises with videos from the library.
 */

const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data', 'ageless.db'));

const COACH_ID = 2; // Coach Dan

// ─── Exercise Selection ────────────────────────────────────────────
// Organized by movement pattern, each slot has [primary, alt1, alt2, alt3] (easiest → hardest)

const EX = {
  // ── HIP EXTENSION / FLEXION ──
  hipFlexorStretch:    [430, 66, 174, 175],   // Hip Flexor Stretch Passive → Couch Stretch → Long Lunge Hip Ext → Long Lunge Weighted
  gluteBridge:         [102, 103, 395, 414],   // Glute Bridge Hold → Reps → SL Deadlift Cross Body → Pigeon GMs Weighted
  hipExtension:        [311, 5, 108, 263],     // Supine Hip Extensions → Standing Hip Circles → Half Middle Split Leg Lift Standing → Side Step Overs
  elephantWalks:       [80, 113, 271, 301],    // Elephant Walks → Hamstring Stretch → Single Leg Deadlift → Stiff-leg DL KB
  longLunge:           [174, 386, 175, 284],   // Long Lunge Hip Ext → Long Lunge w Block → Weighted → Split Squat IR Focus
  hamstringStretch:    [113, 234, 298, 177],   // Hamstring Stretch → Seated Straddle Reaches → Standing Straddle Reaches → Middle Split GMs

  // ── HIP ADDUCTION / ABDUCTION ──
  adductorLifts:       [425, 426, 63, 289],    // Adductor Leg Lifts → Overcoming ISO → Copenhagen Plank → Standing Half Middle Split Lifts
  tailorPose:          [316, 418, 92, 149],    // Tailor Pose → Tailor Knee Raises → Frog Ankle Lifts → Horse Stance Hold
  frogStretch:         [93, 107, 188, 152],    // Frog Stretch → Half Middle Split Leg Lift → Pancake GMs → Horse Stance to Middle Splits
  fireHydrants:        [86, 87, 195, 163],     // Fire Hydrants → w Extensions → Pissing Dog → Lateral Banded Walks
  ninetyNinety:        [376, 22, 23, 24],      // 90/90 IR Stretch → 90/90 GMs → 90/90 Rear Leg Lift → 90/90 Rear Leg Lift Contrast
  sidePancake:         [261, 297, 292, 302],   // Side Pancake Reps → Standing Straddle GMs → Standing Middle Split Side Bends → Straddle Get Ups

  // ── HIP ROTATION ──
  figFourRotations:    [85, 371, 313, 392],    // Fig 4 Rotations → Side Lying Hip Circles → Swivel Hips → Swivel Hips TRX
  kneelingIR:          [402, 400, 308, 372],   // Kneeling Hip IR → Side Lying Knee to Knee → Supine Banded IR → Hawaiian Squats
  ninetyNinetyRear:    [27, 25, 26, 376],      // 90/90 Rear Leg Stretch → w Abduction → Passive Range Hold → 90/90 IR Stretch w Contractions
  pigeonGM:            [378, 414, 96, 394],    // Inclined Pigeon GMs → Pigeon GMs Weighted → Front Split GMs → Glute Stretch
  corkScrews:          [64, 100, 366, 382],    // Cork Screws → Front Support Hip Twist → Twisting Bear → Thoracic Rotations Lunge Wall

  // ── SHOULDER FLEXION (OVERHEAD) ──
  shoulderFlexChild:   [242, 243, 37, 315],    // Shoulder Flexion Childs Pose → Single Arm → Arm Raises Childs Pose → Table Top Shoulder Flexion
  cactusUp:            [56, 57, 240, 241],     // Cactus Up Stretch → w Contractions → Shoulder Extension Arm Raises → Shoulder Ext Standing Pike
  shoulderSeries:      [249, 248, 45, 267],    // Shoulder Series → Shoulder Retractions Banded → Banded Single Arm Raises → Single Arm Rotations Banded
  shoulderDislocates:  [239, 244, 277, 387],   // Shoulder Dislocates → Shoulder Flossing → SOTS Press Broomstick → Standing Pike w Shoulder Ext

  // ── SHOULDER ROTATION ──
  cactusDown:          [54, 55, 225, 257],     // Cactus Down → Cactus Down Weighted → Seated DB Ext Rotations → Side Lying DB Ext Rotations
  sleeperStretch:      [259, 258, 373, 202],   // Sleeper Stretch → Sleeper Negatives Weighted → Shoulder ER Stretch w Contractions → Powel Raise
  shoulderInlocates:   [245, 246, 44, 379],    // Shoulder Inlocates → Shoulder IR Banded → Banded Chicken Wing → Cuban Rotations
  chickenWing:         [377, 44, 308, 381],    // Chicken Wing Stretch → Banded Chicken Wing → Supine Banded IR → Side Lying Spine Rotation
  shoulderCapsule:     [237, 238, 422, 432],   // Shoulder Capsule Stretch → Sitting → Shoulder Rolls Rings → Shoulder Ext Roll Outs Barbell

  // ── THORACIC SPINE ──
  thoracicExt:         [435, 318, 317, 319],   // Thoracic Ext Standing → over roller → on Bench → over roller and step
  spinalSegmentation:  [281, 283, 282, 310],   // Spinal Segmentation → Supine Weighted → Jefferson Curls → Supine Curl Ups
  spinalRotation:      [279, 280, 381, 382],   // Spinal Rotation Stretch → Weighted → Side Lying Spine Rotation → Thoracic Rotations Lunge Wall
  catCow:              [415, 342, 164, 165],   // Segmental Cat-Cow → TRX Spinal Seg → Lateral Flexion Seated → Lateral Flexion Standing
  sideBody:            [255, 229, 291, 375],   // Side Body Stretch → Seated QL Stretch → Standing Lat Stretch → Floor Lat Stretch
  twistingBear:        [366, 278, 100, 358],   // Twisting Bear → Spinal Rotation Lunge → Front Support Hip Twist → Woodchoppers

  // ── CORE / ANTI-ROTATION ──
  hollowBody:          [146, 147, 148, 409],   // Hollow Body Hold → w Arm Circles → Series → Hollow Body Rocks
  archBody:            [408, 35, 36, 38],      // Arch Body Rocks → Y to W → Arch Body Series → Back Extensions
  sidePlank:           [262, 79, 187, 384],    // Side Plank → Elbow Side Plank Twist → Paloff Press → Side V-Snaps
  frontSupport:        [98, 77, 253, 155],     // Front Support → Elbow Plank → Shoulder Taps Plank → Inch Worm
  obliques:            [416, 411, 412, 109],   // Around the Worlds → Russian Twists → Sonego Twists → Halos

  // ── ANKLE / LOWER LEG ──
  ankleDorsi:          [32, 33, 6, 274],       // Ankle Dorsiflexion w Contractions → Ankle Flow → Calf Stretch → SL Tib Raises Banded
  calfWork:            [58, 269, 59, 270],     // Calf Raises → Single Leg Calf Raises → Calf Roll Outs → Single Leg Calf Stretch
  tibWork:             [34, 201, 369, 370],    // Ant Tib Raises → Posterior Tib Reps → Tibial Rotations External → Internal
  toeMobility:         [320, 47, 88, 236],     // Toega → Big Toe Extension w Contractions → Fire Toes → Seiza Squat

  // ── WRIST / FOREARM ──
  wristSeries:         [361, 90, 359, 360],    // Wrist Series → Forearm Roll Outs → Wrist Extension DB → Wrist Flexion DB

  // ── BALANCE / INTEGRATION ──
  balance:             [42, 142, 170, 65],     // Balancing on One Leg → Hip Airplanes → Leg Lifts Pistol Squat → Cossack Squat
  rearLunge:           [368, 354, 285, 284],   // Rear Lunge IR Focus → Walking Lunge → Split Squats → Split Squat IR Focus
};

// ─── Workout Templates ─────────────────────────────────────────────
// Each exercise entry: [exKey, sets, reps, durationSecs, restSecs, groupType, groupLabel, notes, perSide, timeBased]

function mobility(exKey, hold = 30, sets = 2, notes = '') {
  return { exKey, sets, reps: null, duration: hold, rest: 15, group: 'standard', label: '', notes, perSide: true, timeBased: true };
}
function active(exKey, reps = 10, sets = 2, notes = '') {
  return { exKey, sets, reps, duration: null, rest: 15, group: 'standard', label: '', notes, perSide: false, timeBased: false };
}
function activePerSide(exKey, reps = 8, sets = 2, notes = '') {
  return { exKey, sets, reps, duration: null, rest: 15, group: 'standard', label: '', notes, perSide: true, timeBased: false };
}

// ── 3x/WEEK SESSION TEMPLATES (per phase) ──

const sessions3x = {
  // PHASE 1 - Foundation
  phase1: {
    s1: { // Hip Ext/Flex + Shoulder Flexion
      title: 'Hips & Shoulders | Extension & Flexion',
      description: 'Hip extension and flexion mobility paired with shoulder overhead reach. Focus on breathing into each position and finding your current range of motion.',
      duration: 25, intensity: 'Low',
      bodyParts: 'Hip Flexors,Hamstrings,Deltoids,Thoracic Spine',
      exercises: [
        active('hipExtension', 10, 2, 'Gentle warm-up circles'),
        mobility('hipFlexorStretch', 30, 2, 'Breathe into the stretch, keep ribs down'),
        active('gluteBridge', 10, 2, 'Squeeze glutes at top, hold 2 seconds'),
        mobility('longLunge', 30, 2, 'Sink hips forward, back knee on mat'),
        mobility('hamstringStretch', 30, 2, 'Straight leg, hinge from hips not back'),
        mobility('shoulderFlexChild', 30, 2, 'Push hands into floor, reach long'),
        mobility('cactusUp', 30, 2, 'Keep lower back flat on floor'),
        mobility('thoracicExt', 30, 2, 'Breathe into extension, keep ribs connected'),
        mobility('ankleDorsi', 30, 2, 'Drive knee over toe, heel stays down'),
      ]
    },
    s2: { // Hip Add/Abd + Shoulder Ext/Horizontal
      title: 'Hips & Shoulders | Adduction & Abduction',
      description: 'Inner and outer hip mobility paired with shoulder opening. These patterns directly support lateral court movement in pickleball.',
      duration: 25, intensity: 'Low',
      bodyParts: 'Hip Adductors,Gluteus Medius,Deltoids,Rotator Cuff',
      exercises: [
        active('fireHydrants', 10, 2, 'Controlled circles, not rushing'),
        mobility('tailorPose', 30, 2, 'Sit tall, press knees gently toward floor'),
        mobility('frogStretch', 30, 2, 'Rock gently forward and back'),
        activePerSide('adductorLifts', 8, 2, 'Slow and controlled, squeeze at top'),
        mobility('ninetyNinety', 30, 2, 'Square hips, lean into front leg'),
        mobility('shoulderCapsule', 30, 2, 'Gentle stretch, no pain'),
        mobility('shoulderSeries', 30, 2, 'Full range each direction'),
        mobility('sideBody', 30, 2, 'Reach long through fingertips'),
        active('calfWork', 12, 2, 'Full range - stretch at bottom, pause at top'),
      ]
    },
    s3: { // Hip Rotation + Shoulder Rotation
      title: 'Rotational Mobility | Hips & Shoulders',
      description: 'Internal and external rotation for hips and shoulders. Critical for pickleball paddle mechanics and change-of-direction speed.',
      duration: 25, intensity: 'Low',
      bodyParts: 'Hip Flexors,Rotator Cuff,Obliques,Erector Spinae',
      exercises: [
        active('corkScrews', 8, 2, 'Smooth rotations, keep core engaged'),
        mobility('figFourRotations', 30, 2, 'Let gravity do the work'),
        mobility('kneelingIR', 30, 2, 'Sit back gently into internal rotation'),
        mobility('ninetyNinetyRear', 30, 2, 'Hold and breathe, lean forward slightly'),
        mobility('cactusDown', 30, 2, 'Keep elbow at 90 degrees'),
        mobility('sleeperStretch', 30, 2, 'Gentle pressure, stop if sharp pain'),
        mobility('spinalRotation', 30, 2, 'Shoulders stay on floor, rotate from mid-back'),
        active('obliques', 8, 2, 'Control the movement, dont use momentum'),
        active('tibWork', 12, 2, 'Toes up as high as possible'),
      ]
    }
  },
  // PHASE 2 - Build
  phase2: {
    s1: {
      title: 'Hips & Shoulders | Extension & Flexion',
      description: 'Progressing hip and shoulder range with added contractions and longer holds. Start using muscle activation to build strength at end range.',
      duration: 30, intensity: 'Low-Moderate',
      bodyParts: 'Hip Flexors,Hamstrings,Deltoids,Thoracic Spine',
      exercises: [
        active('hipExtension', 10, 2, 'Bigger circles, controlled speed'),
        mobility('hipFlexorStretch', 45, 2, 'Add gentle contractions: push into floor 5s, relax deeper'),
        activePerSide('gluteBridge', 8, 3, 'Progress to single leg if ready'),
        mobility('longLunge', 45, 2, 'Deeper lunge, arms overhead for extra stretch'),
        activePerSide('elephantWalks', 8, 2, 'Slow walk out, keep legs as straight as possible'),
        mobility('shoulderFlexChild', 45, 2, 'Add contractions: press down 5s, reach further'),
        mobility('cactusUp', 45, 2, 'Full range with contractions at end range'),
        mobility('thoracicExt', 45, 3, 'Progress to roller if available'),
        mobility('catCow', 30, 2, 'Segmental movement - one vertebra at a time'),
        active('ankleDorsi', 12, 2, 'Add contractions at end range'),
      ]
    },
    s2: {
      title: 'Hips & Shoulders | Adduction & Abduction',
      description: 'Building active strength in inner and outer hip range. Adding load and contractions to shoulder work.',
      duration: 30, intensity: 'Low-Moderate',
      bodyParts: 'Hip Adductors,Gluteus Medius,Deltoids,Rotator Cuff',
      exercises: [
        activePerSide('fireHydrants', 10, 2, 'Add leg extensions at top'),
        mobility('frogStretch', 45, 2, 'Wider stance, add contractions'),
        activePerSide('adductorLifts', 10, 3, 'Slow eccentric - 3 second lower'),
        mobility('sidePancake', 30, 2, 'Reach toward foot, keep chest open'),
        mobility('ninetyNinety', 45, 3, 'Add gentle rotational contractions'),
        mobility('shoulderCapsule', 45, 2, 'Deeper range with contractions'),
        active('shoulderSeries', 10, 3, 'Increase range each rep'),
        mobility('shoulderInlocates', 30, 2, 'Controlled internal rotation work'),
        activePerSide('balance', 30, 2, 'Hold each side, eyes open then closed'),
        active('calfWork', 15, 2, 'Single leg progression if ready'),
      ]
    },
    s3: {
      title: 'Rotational Mobility | Hips & Shoulders',
      description: 'Deepening rotational range with resistance and contractions. Building the rotation power that drives paddle swing and court coverage.',
      duration: 30, intensity: 'Low-Moderate',
      bodyParts: 'Hip Flexors,Rotator Cuff,Obliques,Erector Spinae',
      exercises: [
        active('twistingBear', 8, 2, 'Add reach-through rotation'),
        mobility('figFourRotations', 45, 2, 'Add contractions at end range'),
        mobility('kneelingIR', 45, 2, 'Deeper range, add oscillations'),
        mobility('pigeonGM', 30, 2, 'Lean forward with flat back'),
        mobility('cactusDown', 45, 2, 'Add contractions: resist 5s, relax deeper'),
        mobility('sleeperStretch', 45, 2, 'Weighted progression if comfortable'),
        active('chickenWing', 10, 2, 'Controlled rotation with band if available'),
        mobility('spinalRotation', 45, 3, 'Progress to weighted rotation'),
        active('obliques', 10, 3, 'Controlled tempo'),
        active('tibWork', 15, 2, 'Add banded resistance if available'),
      ]
    }
  },
  // PHASE 3 - Perform
  phase3: {
    s1: {
      title: 'Hips & Shoulders | Extension & Flexion',
      description: 'Sport-specific mobility patterns. Combining hip and shoulder movements that mirror pickleball court actions - reaching, lunging, serving.',
      duration: 35, intensity: 'Moderate',
      bodyParts: 'Hip Flexors,Hamstrings,Deltoids,Thoracic Spine',
      exercises: [
        active('rearLunge', 8, 2, 'Dynamic warm-up with rotation focus'),
        mobility('hipFlexorStretch', 45, 3, 'Deep range with 3-position contractions'),
        activePerSide('gluteBridge', 10, 3, 'Single leg, hold 3s at top'),
        activePerSide('elephantWalks', 8, 3, 'Full range, slow and controlled'),
        mobility('hamstringStretch', 45, 3, 'Active stretching with contractions'),
        mobility('shoulderDislocates', 30, 3, 'Narrow grip progression'),
        mobility('cactusUp', 45, 3, 'Full range with end-range loading'),
        mobility('thoracicExt', 45, 3, 'Combined with shoulder flexion'),
        mobility('spinalSegmentation', 30, 2, 'Weighted progression'),
        active('toeMobility', 10, 2, 'Full foot mobility sequence'),
      ]
    },
    s2: {
      title: 'Hips & Shoulders | Adduction & Abduction',
      description: 'Dynamic lateral mobility that transfers to court movement. Building strength at end range for injury resilience.',
      duration: 35, intensity: 'Moderate',
      bodyParts: 'Hip Adductors,Gluteus Medius,Deltoids,Rotator Cuff',
      exercises: [
        activePerSide('balance', 10, 2, 'Dynamic balance with hip airplanes'),
        mobility('frogStretch', 45, 3, 'Loaded frog with contractions'),
        activePerSide('adductorLifts', 12, 3, 'Tempo: 3 sec up, 3 sec down'),
        mobility('sidePancake', 45, 3, 'Active pancake with contractions'),
        active('ninetyNinety', 10, 3, 'Transition flow: front to back smoothly'),
        mobility('shoulderCapsule', 45, 3, 'Combined with rotation'),
        active('shoulderSeries', 12, 3, 'Full sequence with tempo'),
        active('shoulderInlocates', 10, 3, 'Banded with contractions'),
        active('frontSupport', 30, 2, 'Add shoulder taps for integration'),
        activePerSide('calfWork', 15, 3, 'Single leg full range'),
      ]
    },
    s3: {
      title: 'Rotational Mobility | Hips & Shoulders',
      description: 'Rotational power development. Dynamic patterns that build the speed and control needed for paddle mechanics and quick pivots.',
      duration: 35, intensity: 'Moderate',
      bodyParts: 'Hip Flexors,Rotator Cuff,Obliques,Erector Spinae',
      exercises: [
        active('twistingBear', 10, 3, 'Flow-style movement, coordinated'),
        mobility('figFourRotations', 45, 3, 'Loaded end-range contractions'),
        mobility('kneelingIR', 45, 3, 'Combined with external rotation'),
        mobility('pigeonGM', 45, 3, 'Weighted pigeon goodmornings'),
        active('cactusDown', 10, 3, 'Dynamic rotation with resistance'),
        active('sleeperStretch', 10, 3, 'Weighted negatives'),
        active('chickenWing', 12, 3, 'Banded rotations with control'),
        active('spinalRotation', 10, 3, 'Weighted spinal rotations'),
        active('sidePlank', 30, 2, 'Add rotation for integration'),
        active('wristSeries', 12, 2, 'Full wrist mobility for paddle health'),
      ]
    }
  },
  // PHASE 4 - Maintain & Progress
  phase4: {
    s1: {
      title: 'Hips & Shoulders | Extension & Flexion',
      description: 'Maintenance phase combining all hip and shoulder extension/flexion patterns. Flow-based work with sport-specific integration.',
      duration: 35, intensity: 'Moderate',
      bodyParts: 'Hip Flexors,Hamstrings,Deltoids,Thoracic Spine',
      exercises: [
        active('rearLunge', 10, 2, 'Dynamic lunge flow with arm drivers'),
        mobility('hipFlexorStretch', 60, 3, 'Deep end range with PNF contractions'),
        activePerSide('gluteBridge', 12, 3, 'Single leg with pause and pulse'),
        activePerSide('elephantWalks', 10, 3, 'Full walk-out, full range'),
        mobility('hamstringStretch', 60, 3, 'PNF stretching protocol'),
        mobility('shoulderDislocates', 30, 3, 'Narrowest comfortable grip'),
        mobility('cactusUp', 60, 3, 'Full PNF protocol'),
        mobility('thoracicExt', 60, 3, 'Combined extension and rotation'),
        active('hollowBody', 30, 3, 'Core integration'),
        active('toeMobility', 12, 2, 'Complete foot sequence'),
      ]
    },
    s2: {
      title: 'Hips & Shoulders | Adduction & Abduction',
      description: 'Maintenance phase for lateral mobility. Integration of strength and range into dynamic court-ready movement patterns.',
      duration: 35, intensity: 'Moderate',
      bodyParts: 'Hip Adductors,Gluteus Medius,Deltoids,Rotator Cuff',
      exercises: [
        activePerSide('balance', 12, 3, 'Dynamic balance flow'),
        mobility('frogStretch', 60, 3, 'Full PNF frog protocol'),
        activePerSide('adductorLifts', 15, 3, 'Slow eccentric with isometric hold'),
        mobility('sidePancake', 60, 3, 'Full active pancake flow'),
        active('ninetyNinety', 12, 3, 'Smooth transitions, no hands'),
        mobility('shoulderCapsule', 60, 3, 'Multi-angle capsule work'),
        active('shoulderSeries', 15, 3, 'Complete series with resistance'),
        active('shoulderInlocates', 12, 3, 'Banded with full range'),
        active('archBody', 30, 3, 'Posterior chain integration'),
        active('calfWork', 20, 3, 'Single leg weighted if available'),
      ]
    },
    s3: {
      title: 'Rotational Mobility | Hips & Shoulders',
      description: 'Maintenance phase for rotation. Combining all rotational patterns into fluid sequences that maintain court-ready mobility.',
      duration: 35, intensity: 'Moderate',
      bodyParts: 'Hip Flexors,Rotator Cuff,Obliques,Erector Spinae',
      exercises: [
        active('twistingBear', 12, 3, 'Fluid movement flow'),
        mobility('figFourRotations', 60, 3, 'Full PNF rotation protocol'),
        mobility('kneelingIR', 60, 3, 'Deep internal rotation with contractions'),
        mobility('pigeonGM', 60, 3, 'Weighted deep range'),
        active('cactusDown', 12, 3, 'Full rotational work with resistance'),
        active('sleeperStretch', 12, 3, 'Weighted controlled negatives'),
        active('chickenWing', 15, 3, 'Dynamic banded rotations'),
        active('spinalRotation', 12, 3, 'Dynamic weighted rotations'),
        active('obliques', 12, 3, 'Dynamic anti-rotation integration'),
        active('wristSeries', 15, 2, 'Complete wrist health protocol'),
      ]
    }
  }
};

// ── 2x/WEEK: Merge sessions into 2 full-body sessions ──
function build2xSessions(phase3x) {
  // Session A: Hip Ext/Flex + Shoulder Flex (s1 core) + some rotation warm-up
  // Session B: Hip Add/Abd + Shoulder Rotation (s2 core) + rotation finishers from s3
  const s1 = phase3x.s1;
  const s2 = phase3x.s2;
  const s3 = phase3x.s3;

  return {
    sA: {
      title: 'Full Body A | Extension, Flexion & Overhead',
      description: s1.description + ' Combined with rotational warm-up and ankle mobility.',
      duration: Math.round(s1.duration * 1.2),
      intensity: s1.intensity,
      bodyParts: 'Hip Flexors,Hamstrings,Deltoids,Thoracic Spine,Ankles',
      // Take s1 exercises + top rotation exercises from s3 + thoracic
      exercises: [
        ...s1.exercises.slice(0, 6),   // Hip ext/flex + shoulder flex
        s3.exercises[1],                // Fig 4 rotations (mobility)
        ...s1.exercises.slice(6),       // Thoracic + ankles
      ]
    },
    sB: {
      title: 'Full Body B | Lateral, Rotation & Stability',
      description: s2.description + ' Combined with rotational shoulder work and core stability.',
      duration: Math.round(s2.duration * 1.2),
      intensity: s2.intensity,
      bodyParts: 'Hip Adductors,Gluteus Medius,Rotator Cuff,Obliques,Erector Spinae',
      exercises: [
        ...s2.exercises.slice(0, 5),   // Hip add/abd
        s3.exercises[4],                // Cactus down (shoulder rotation)
        s3.exercises[5],                // Sleeper stretch
        ...s2.exercises.slice(5, 7),    // Shoulder capsule + series
        s3.exercises[7],                // Spinal rotation
        s2.exercises[s2.exercises.length - 1], // Calf work
      ]
    }
  };
}

// ─── Build Functions ────────────────────────────────────────────────

function createProgram(title, description, durationWeeks, workoutsPerWeek) {
  const stmt = db.prepare(
    `INSERT INTO programs (coach_id, title, description, duration_weeks, workouts_per_week, min_duration, max_duration)
     VALUES (?, ?, ?, ?, ?, ?, ?) `
  );
  const info = stmt.run(COACH_ID, title, description, durationWeeks, workoutsPerWeek, 25, 35);
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
  const info = stmt.run(programId, phaseId, weekNumber, dayNumber, template.title, template.description, template.duration, template.intensity, template.bodyParts, 'None');
  return info.lastInsertRowid;
}

function addExercise(workoutId, exerciseId, orderIndex, config) {
  const stmt = db.prepare(
    `INSERT INTO workout_exercises (workout_id, exercise_id, order_index, sets, reps, duration_secs, rest_secs, group_type, group_label, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  );
  const row = stmt.get(workoutId, exerciseId, orderIndex, config.sets, config.reps, config.duration, config.rest, config.group, config.label, config.notes);
  const weId = row.id;

  // Add meta
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

// ─── Main Build ─────────────────────────────────────────────────────

const phaseNames = [
  { num: 1, title: 'Phase 1 | Foundation', weeks: 4 },
  { num: 2, title: 'Phase 2 | Build', weeks: 4 },
  { num: 3, title: 'Phase 3 | Perform', weeks: 4 },
  { num: 4, title: 'Phase 4 | Maintain & Progress', weeks: 4 },
];

const phaseKeys = ['phase1', 'phase2', 'phase3', 'phase4'];

console.log('\n=== Building Pickleball Performance Programs ===\n');

// ── 3x/Week Program ──
console.log('--- 3x/Week Program ---');
const prog3xId = createProgram(
  'Pickleball Performance | Home (3x/Week)',
  'A 16-week progressive mobility program designed for pickleball players training 3 times per week. Each session targets specific movement patterns: hip extension/flexion with shoulder overhead, hip adduction/abduction with lateral stability, and full rotational mobility. Built on 4-week phases with progression gates and 4 difficulty alternatives per exercise. All exercises can be done at home with minimal equipment.',
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
        const primaryId = exSlot[0];
        const altIds = exSlot.slice(1);

        const weId = addExercise(workoutId, primaryId, idx + 1, ex);
        if (altIds.length > 0) {
          addAlternates(weId, altIds);
        }
      });

      dayNum++;
    });
  }
  console.log(`    Weeks ${startWeek}-${startWeek + 3}: 12 workouts created`);
});

// ── 2x/Week Program ──
console.log('\n--- 2x/Week Program ---');
const prog2xId = createProgram(
  'Pickleball Performance | Home (2x/Week)',
  'A 16-week progressive mobility program designed for pickleball players training 2 times per week. Two full-body sessions per week cover all movement patterns needed for court performance: extension, flexion, lateral movement, rotation, and stability. Built on 4-week phases with progression gates and 4 difficulty alternatives per exercise. All exercises can be done at home with minimal equipment.',
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
        const primaryId = exSlot[0];
        const altIds = exSlot.slice(1);

        const weId = addExercise(workoutId, primaryId, idx + 1, ex);
        if (altIds.length > 0) {
          addAlternates(weId, altIds);
        }
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
console.log(`3x/Week Program (ID ${prog3xId}): ${total3x} workouts`);
console.log(`2x/Week Program (ID ${prog2xId}): ${total2x} workouts`);
console.log(`Total exercise placements: ${totalWE}`);
console.log(`Total alternatives: ${totalAlts}`);
console.log('Done!\n');

db.close();
