import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'data', 'ageless.db');
const db = new Database(dbPath);

// Import pool to ensure tables exist
await import('./pool.js');

const seedData = () => {
  // Check if already seeded
  const existing = db.prepare('SELECT COUNT(*) as count FROM programs').get();
  if (existing.count > 0) {
    console.log('Database already seeded, skipping.');
    process.exit(0);
  }

  // Create program
  const prog = db.prepare(`
    INSERT INTO programs (coach_id, title, description, duration_weeks, workouts_per_week, min_duration, max_duration)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    2, 'AMS | Ground Zero™',
    'The hardest part about mobility training is just starting. You being here is already a massive step on your journey. This program is built over two 28-day phases to put your body through all planes of motion.',
    8, 6, '13 mins', '28 mins'
  );
  const programId = prog.lastInsertRowid;

  // Phases
  const phase1 = db.prepare('INSERT INTO program_phases (program_id, phase_number, title, weeks) VALUES (?, ?, ?, ?)').run(programId, 1, 'Phase 1: Foundations', 4);
  const phase2 = db.prepare('INSERT INTO program_phases (program_id, phase_number, title, weeks) VALUES (?, ?, ?, ?)').run(programId, 2, 'Phase 2: Progression', 4);

  // Exercises
  const exercises = [
    ['Tib Raises', 'Strengthen the tibialis anterior', null, null, 'Lower Body', 'Body Weight'],
    ['Standing Seiza Stretch', 'Deep quad and ankle stretch', null, null, 'Lower Body', 'Body Weight'],
    ['Single Knee Raises', 'Hip flexor activation', null, null, 'Hips', 'Body Weight'],
    ['Straddle Good Mornings', 'Hamstring and adductor stretch', null, null, 'Lower Body', 'Body Weight'],
    ['Standing Hip Circles', 'Full range hip mobilisation', null, null, 'Hips', 'Body Weight'],
    ['Calf Stretch', 'Gastrocnemius and soleus stretch', null, null, 'Lower Body', 'Body Weight'],
    ['Jefferson Curl', 'Spinal segmental flexion', null, null, 'Back', 'Body Weight'],
    ['Warm Up', 'General warm up routine', null, null, 'Full Body', 'Body Weight'],
    ['Bench Press - Dumbbells', 'Flat bench dumbbell press', null, null, 'Chest', 'Dumbbell'],
    ['Chest Flys - Cables', 'Standing cable chest fly', null, null, 'Chest', 'Cable Station'],
    ['Reverse Crunch', 'Core anti-extension exercise', null, null, 'Core', 'Body Weight'],
    ['Incline Bench Press - Dumbbells', 'Incline dumbbell press', null, null, 'Chest', 'Dumbbell'],
    ['Alternating Supinated Biceps Curl', 'Bicep isolation curl', null, null, 'Arms', 'Dumbbell'],
    ['Mountain Climbers', 'Core and cardio exercise', null, null, 'Core', 'Body Weight'],
    ['Barbell Bench Press', 'Flat barbell bench press', null, null, 'Chest', 'Barbell'],
    ['Hip Mobility Routine', 'Follow-along hip mobility', null, null, 'Hips', 'Body Weight'],
    ['CAR Routine', 'Controlled articular rotations', null, null, 'Full Body', 'Body Weight'],
    ['Goblet Squat', 'Front-loaded squat pattern', null, null, 'Lower Body', 'Kettlebell'],
    ['TRX Chest Press', 'Suspension trainer chest press', null, null, 'Chest', 'TRX'],
    ['Floor Press - Dumbbells', 'Floor dumbbell press', null, null, 'Chest', 'Dumbbell'],
  ];

  const insertExercise = db.prepare('INSERT INTO exercises (name, description, demo_video_url, thumbnail_url, body_part, equipment) VALUES (?, ?, ?, ?, ?, ?)');
  const exerciseIds = {};
  for (const ex of exercises) {
    const r = insertExercise.run(...ex);
    exerciseIds[ex[0]] = r.lastInsertRowid;
  }

  // Exercise alternatives
  const insertAlt = db.prepare('INSERT INTO exercise_alternatives (exercise_id, alternative_id, reps) VALUES (?, ?, ?)');
  insertAlt.run(exerciseIds['Bench Press - Dumbbells'], exerciseIds['Barbell Bench Press'], '10');
  insertAlt.run(exerciseIds['Bench Press - Dumbbells'], exerciseIds['Floor Press - Dumbbells'], '10');
  insertAlt.run(exerciseIds['Incline Bench Press - Dumbbells'], exerciseIds['Barbell Bench Press'], '15');
  insertAlt.run(exerciseIds['Incline Bench Press - Dumbbells'], exerciseIds['TRX Chest Press'], '15');

  // Mobility workout (Day 1)
  const w1 = db.prepare(`INSERT INTO workouts (program_id, phase_id, week_number, day_number, title, description, duration_mins, intensity, body_parts, equipment, workout_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    programId, phase1.lastInsertRowid, 1, 1, '1. Hips | Flexion & Rotation',
    'Discover The Secrets To Unlocking Pain Free Living!', 21, 'Low', 'Full Body', 'Aerobics Stepper', 'mobility'
  );

  // Add exercises to mobility workout
  const insertWE = db.prepare('INSERT INTO workout_exercises (workout_id, exercise_id, order_index, sets, reps, group_type) VALUES (?, ?, ?, ?, ?, ?)');
  insertWE.run(w1.lastInsertRowid, exerciseIds['Tib Raises'], 0, 1, '10', null);
  insertWE.run(w1.lastInsertRowid, exerciseIds['Standing Seiza Stretch'], 1, 1, '30s', null);
  insertWE.run(w1.lastInsertRowid, exerciseIds['Single Knee Raises'], 2, 1, '10/side', null);
  insertWE.run(w1.lastInsertRowid, exerciseIds['Straddle Good Mornings'], 3, 1, '10', null);
  insertWE.run(w1.lastInsertRowid, exerciseIds['Standing Hip Circles'], 4, 1, '5/side', null);
  insertWE.run(w1.lastInsertRowid, exerciseIds['Calf Stretch'], 5, 1, '30s/side', null);
  insertWE.run(w1.lastInsertRowid, exerciseIds['Jefferson Curl'], 6, 1, '10', null);

  // More mobility workouts
  const mobilityDays = [
    [1, 2, '2. Hips Extension & Shoulders Rotation', 21, 'Hips'],
    [1, 3, '3. Spine – Extension & Shoulders – Flexion', 22, 'Back'],
    [1, 4, '4. Hips | Adduction, Abduction & Rotation', 20, 'Hips'],
    [1, 5, '5. Shoulders – External Rotation | Spine – Rotation', 25, 'Shoulders'],
    [1, 6, '6. Foot Mobility Routine', 18, 'Lower Body'],
  ];
  for (const [week, day, title, dur, parts] of mobilityDays) {
    db.prepare(`INSERT INTO workouts (program_id, phase_id, week_number, day_number, title, duration_mins, intensity, body_parts, equipment, workout_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      programId, phase1.lastInsertRowid, week, day, title, dur, 'Low', parts, 'Body Weight', 'mobility'
    );
  }

  // Strength workout (separate program)
  const prog2 = db.prepare(`INSERT INTO programs (coach_id, title, description, duration_weeks, workouts_per_week, min_duration, max_duration)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    2, 'Dan - Phase 2', 'Personalised strength and mobility program', 12, 5, '45 mins', '75 mins'
  );

  const strengthPhase = db.prepare('INSERT INTO program_phases (program_id, phase_number, title, weeks) VALUES (?, ?, ?, ?)').run(prog2.lastInsertRowid, 1, 'Phase 2: Strength', 4);

  const sw1 = db.prepare(`INSERT INTO workouts (program_id, phase_id, week_number, day_number, title, description, duration_mins, intensity, body_parts, equipment, workout_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    prog2.lastInsertRowid, strengthPhase.lastInsertRowid, 3, 5, '#2 Chest/Biceps/Hips',
    'Upper body push with bicep and hip work', 71, 'High', 'Upper Body, Core',
    'Dumbbell, Cable Station, Body Weight, Circular Agility Rings, Landmine', 'strength'
  );

  // Add triset exercises
  insertWE.run(sw1.lastInsertRowid, exerciseIds['Warm Up'], 0, 1, '6:00', 'warmup');
  insertWE.run(sw1.lastInsertRowid, exerciseIds['Bench Press - Dumbbells'], 1, 3, '10', 'triset');
  insertWE.run(sw1.lastInsertRowid, exerciseIds['Chest Flys - Cables'], 2, 3, '10', 'triset');
  insertWE.run(sw1.lastInsertRowid, exerciseIds['Reverse Crunch'], 3, 3, '15', 'triset');
  insertWE.run(sw1.lastInsertRowid, exerciseIds['Incline Bench Press - Dumbbells'], 4, 3, '15', 'triset');
  insertWE.run(sw1.lastInsertRowid, exerciseIds['Alternating Supinated Biceps Curl'], 5, 3, '20', 'triset');
  insertWE.run(sw1.lastInsertRowid, exerciseIds['Mountain Climbers'], 6, 3, '20', 'triset');

  // Assign programs to demo client (user_id=3 = demo@ageless.com)
  // Check for demo user
  const demoUsers = db.prepare('SELECT id FROM users WHERE role = ?').all('client');
  for (const u of demoUsers) {
    db.prepare('INSERT OR IGNORE INTO client_programs (user_id, program_id, current_week, current_day, total_workouts) VALUES (?, ?, ?, ?, ?)')
      .run(u.id, prog2.lastInsertRowid, 3, 5, 30);

    // Streak
    db.prepare('INSERT OR IGNORE INTO streaks (user_id, current_streak, best_streak, last_activity_date) VALUES (?, ?, ?, ?)')
      .run(u.id, 12, 21, new Date().toISOString().split('T')[0]);

    // Goals
    const insertGoal = db.prepare('INSERT INTO goals (user_id, title, target, category, progress) VALUES (?, ?, ?, ?, ?)');
    insertGoal.run(u.id, 'Pain-free squat', 'Full depth bodyweight squat with no discomfort', 'Mobility', 65);
    insertGoal.run(u.id, 'Touch toes', 'Standing forward fold, palms flat on floor', 'Flexibility', 40);
    insertGoal.run(u.id, 'Train 5x per week', 'Consistent 5 sessions per week for 4 weeks', 'Consistency', 75);
    insertGoal.run(u.id, 'Reach 90kg', 'Body weight goal of 90kg', 'Body Comp', 50);

    // Achieved goals
    const insertAchieved = db.prepare('INSERT INTO goals (user_id, title, target, category, progress, achieved, achieved_date) VALUES (?, ?, ?, ?, ?, ?, ?)');
    insertAchieved.run(u.id, 'Complete Ground Zero Phase 1', 'Finish all Phase 1 workouts', 'Program', 100, 1, '2026-02-15');
    insertAchieved.run(u.id, '7-day training streak', 'Train every day for a week', 'Consistency', 100, 1, '2026-03-02');

    // Tasks
    const insertTask = db.prepare('INSERT INTO tasks (coach_id, client_id, label) VALUES (?, ?, ?)');
    insertTask.run(2, u.id, '10 min morning mobility');
    insertTask.run(2, u.id, 'Drink 3L water');
    insertTask.run(2, u.id, '8 hours sleep');
    insertTask.run(2, u.id, 'Log all meals');
    insertTask.run(2, u.id, '15 min walk');

    // Some nutrition logs for today
    const today = new Date().toISOString().split('T')[0];
    const insertNutrition = db.prepare('INSERT INTO nutrition_logs (user_id, date, meal_type, food_name, calories, protein, fat, carbs, serving_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    insertNutrition.run(u.id, today, 'Early Morning', 'Coffee (Homemade)', 26, 1, 0, 5, '240 g');
    insertNutrition.run(u.id, today, 'Early Morning', 'Salted Butter', 104, 0, 12, 0, '14 g');
    insertNutrition.run(u.id, today, 'Early Morning', 'Collagen Hydrolysate', 40, 10, 0, 0, '10 g');

    // Water and steps
    db.prepare('INSERT INTO water_logs (user_id, date, amount_ml) VALUES (?, ?, ?)').run(u.id, today, 750);
    db.prepare('INSERT INTO step_logs (user_id, date, steps) VALUES (?, ?, ?)').run(u.id, today, 2835);
  }

  console.log('Seed data inserted successfully!');
  process.exit(0);
};

seedData();
