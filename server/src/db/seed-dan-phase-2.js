// Dan Phase 2 import data. Extracted from "handsdan - Clients Data.xlsx"
// (FitBudd export, 'Client Workouts' sheet, danny@handsdan.com), following
// the Carla Phase 1 precedent: each session's structure comes from the most
// recent COMPLETE logged instance (several later instances are empty or
// partial logs):
//   Session 1 from 2024-12-02, Session 2 from 2025-04-29,
//   Session 3 (#3 - Full Body) from 2024-08-28,
//   Session 4 from 2024-09-05, Session 5 from 2024-09-01.
// Exercises that appeared with zero logged sets on the chosen day were
// backfilled from the nearest earlier instance of the same session.
//
// Exercise IDs are AM library IDs from server/data/ageless.db. 64 of 76
// slots were case-insensitive EXACT name matches; the remaining 9 were
// mapped with Dan's explicit sign-off on 2026-07-12:
//   Assault Bike Run -> Assault Bike (1248)
//   Kettlebell Swing -> Kettlebell Swings (617)
//   Hanging Straight Leg Raise -> Hanging Straight Leg Raise (M) (1262)
//   Lever Leg Extension -> Lever Leg Extension (M) (1268)
//   Ski Ergometer -> Ski Erg (1284)
//   Cable Wide Grip Lat Pulldown -> Cable Wide Grip Lat Pulldown (F) (1252)
//   Dumbbell Arnold Press -> Arnold Press (1829)
//   Chest Flys - Dumbbells -> DB Pec Flys (1839)
//   Front Lever -> Body Levers (547)
//
// The export logs weights per set but workout_exercises has no prescribed-
// weight column; last-logged weights are kept in `notes` for reference.
// Cardio durations in the logs are noisy (180 vs "1"/"3"/"23"); all cardio
// slots standardised to 1 x 180s per Dan's sign-off.
export const DAN_PHASE_2 = {
  programTitle: 'Dan - Phase 2',
};

export const SESSIONS = [
  {
    title: 'Session 1 - Lower Body',
    day_number: 1,
    exercises: [
      { exercise_id: 34,  sets: 3, reps: '20' },                       // Ant Tib Raises (backfilled 2024-09-02)
      { exercise_id: 269, sets: 3, reps: '10' },                       // Single Leg Calf Raises
      { exercise_id: 183, sets: 3, reps: '10', notes: 'Last logged 54-61kg' },   // Natural Leg Extensions
      { exercise_id: 189, sets: 3, reps: '10-15', notes: 'Last logged 15-25kg' }, // Peterson Step Up
      { exercise_id: 51,  sets: 2, reps: '10', notes: 'Last logged 14-14.5kg' },  // Bulgarian Split Squats
      { exercise_id: 137, sets: 2, reps: '10' },                       // Hanging Tuck Ups
      { exercise_id: 58,  sets: 3, reps: '15' },                       // Calf Raises
      { exercise_id: 1248, sets: 1, duration_secs: 180, time_based: true },      // Assault Bike
      { exercise_id: 66,  sets: 2, duration_secs: 90, time_based: true },        // Couch Stretch
      { exercise_id: 137, sets: 2, reps: '10', notes: 'Weighted, last logged 6-10kg' }, // Hanging Tuck Ups (weighted)
    ],
  },
  {
    title: 'Session 2 - Chest / Biceps / Hips',
    day_number: 2,
    exercises: [
      { exercise_id: 207, sets: 2, reps: '10' },                       // Push Ups - Rings
      { exercise_id: 70,  sets: 2, reps: '10' },                       // Dips
      { exercise_id: 1839, sets: 3, reps: '10', notes: 'Last logged 10kg' },     // DB Pec Flys (was Chest Flys - Dumbbells)
      { exercise_id: 1278, sets: 1, duration_secs: 180, time_based: true },      // Rowing Machine
      { exercise_id: 185, sets: 2, reps: '12', notes: 'Last logged 15kg' },      // Oblique Twists - Landmine
      { exercise_id: 89,  sets: 3, reps: '10-12', notes: 'Last logged 20kg' },   // Floor press with dumbbells
      { exercise_id: 31,  sets: 3, reps: '10', notes: 'Last logged 12.5-15kg' }, // Alternating Supinated Biceps Curl Dumbbells
      { exercise_id: 15,  sets: 3, reps: '10', notes: 'Last logged 70kg' },      // Barbell Bench Press
      { exercise_id: 14,  sets: 3, reps: '20' },                       // Mountain Climbers
      { exercise_id: 356, sets: 3, reps: '12', notes: 'Last logged 15-20kg' },   // Weighted Crunches
    ],
  },
  {
    title: 'Session 3 - Full Body',
    day_number: 3,
    exercises: [
      { exercise_id: 271, sets: 4, reps: '10', notes: 'Last logged 20-40kg' },   // Single Leg Deadlift
      { exercise_id: 1262, sets: 4, reps: '10' },                      // Hanging Straight Leg Raise (M)
      { exercise_id: 11,  sets: 1, reps: '20' },                       // Reverse Crunch
      { exercise_id: 289, sets: 3, reps: '10' },                       // Standing Half Middle Split Leg Lifts with Contractions
      { exercise_id: 58,  sets: 4, reps: '12-20' },                    // Calf Raises (bodyweight)
      { exercise_id: 68,  sets: 4, reps: '12', notes: 'Last logged 20kg' },      // Cyclist Squat
      { exercise_id: 29,  sets: 2, duration_secs: 60, time_based: true },        // Active Seal (backfilled)
      { exercise_id: 58,  sets: 4, reps: '10', notes: 'Weighted (machine), last logged 105-125kg' }, // Calf Raises (weighted)
      { exercise_id: 282, sets: 2, reps: '5' },                        // Spinal Segmentation - Jefferson Curls (backfilled)
      { exercise_id: 1268, sets: 4, reps: '12-15', notes: 'Last logged 54-61kg' }, // Lever Leg Extension (M)
      { exercise_id: 1248, sets: 1, duration_secs: 180, time_based: true },      // Assault Bike
      { exercise_id: 65,  sets: 3, reps: '5' },                        // Cossack Squat
      { exercise_id: 547, sets: 1, reps: '3' },                        // Body Levers (was Front Lever)
      { exercise_id: 617, sets: 4, reps: '12', notes: 'Last logged 36kg' },      // Kettlebell Swings
    ],
  },
  {
    title: 'Session 4 - Back / Triceps & Core',
    day_number: 4,
    exercises: [
      { exercise_id: 78,  sets: 3, reps: '10' },                       // Elbow Plank Razors (backfilled 2024-08-22)
      { exercise_id: 135, sets: 3, reps: '10' },                       // Hanging Shrugs
      { exercise_id: 222, sets: 3, reps: '12-15' },                    // Seated Cable Crunch (backfilled)
      { exercise_id: 1252, sets: 3, reps: '10', notes: 'Last logged 45-66kg' },  // Cable Wide Grip Lat Pulldown (F)
      { exercise_id: 52,  sets: 3, reps: '5' },                        // Burpee Box Step Over (backfilled, logged 4-5)
      { exercise_id: 302, sets: 3, reps: '10' },                       // Straddle Get Ups (backfilled)
      { exercise_id: 1284, sets: 1, duration_secs: 180, time_based: true },      // Ski Erg
      { exercise_id: 213, sets: 3, reps: '10', notes: 'Last logged 4kg' },       // Reverse Flys - Cables
      { exercise_id: 324, sets: 3, reps: '10-12', notes: 'Last logged 9-11.25kg' }, // Tricep Kick Backs - Cable
      { exercise_id: 294, sets: 3, reps: '10', notes: 'Last logged 2.5kg' },     // Standing Shoulder Circles
      { exercise_id: 212, sets: 3, reps: '10', notes: 'Last logged 15kg' },      // Renegade Rows (backfilled)
      { exercise_id: 95,  sets: 3, reps: '10', notes: 'Last logged 15kg' },      // Front Raises with Plate
    ],
  },
  {
    title: 'Session 5 - Arms & Core',
    day_number: 5,
    exercises: [
      { exercise_id: 230, sets: 3, reps: '10', notes: 'Last logged 22.5kg' },    // Seated Shoulder Press - Dumbbells
      { exercise_id: 283, sets: 3, reps: '10', notes: 'Last logged 10kg' },      // Spinal Segmentation Supine Weighted
      { exercise_id: 1248, sets: 1, duration_secs: 180, time_based: true },      // Assault Bike
      { exercise_id: 256, sets: 3, reps: '10', notes: 'Last logged 10kg' },      // Side Extensions
      { exercise_id: 358, sets: 2, reps: '10', notes: 'Last logged 11.3-13.5kg' }, // Woodchoppers
      { exercise_id: 94,  sets: 4, reps: '12', notes: 'Last logged 12.5kg' },    // Front Raise with Dumbbells
      { exercise_id: 38,  sets: 3, reps: '10', notes: 'Last logged 20kg' },      // Back Extensions
      { exercise_id: 187, sets: 2, reps: '10', notes: 'Last logged 9-11.3kg' },  // Paloff Press
      { exercise_id: 176, sets: 3, reps: '10', notes: 'Last logged 15-25kg' },   // Medicine Ball Slams
      { exercise_id: 1829, sets: 3, reps: '10', notes: 'Last logged 12.5kg' },   // Arnold Press (was Dumbbell Arnold Press)
      { exercise_id: 213, sets: 3, reps: '10', notes: 'Last logged 4.5kg' },     // Reverse Flys - Cables
      { exercise_id: 282, sets: 2, reps: '3', notes: 'Last logged 20kg' },       // Spinal Segmentation - Jefferson Curls
      { exercise_id: 109, sets: 4, reps: '10', notes: 'Last logged 15kg' },      // Halos
      { exercise_id: 227, sets: 4, reps: '15', notes: 'Last logged 4kg' },       // Seated Lateral Raises (Middle to Top)
      { exercise_id: 72,  sets: 4, reps: '20', notes: 'Last logged 22.5kg' },    // Dumbbells Shoulder Shrugs
      { exercise_id: 257, sets: 2, reps: '10', notes: 'Last logged 4kg' },       // Side Lying Dumbbell External Rotations
    ],
  },
];
