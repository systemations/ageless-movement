// Carla Phase 1 import data. Extracted from "handsdan - Clients Data.xlsx"
// (FitBudd export 2026-05-29), using the MOST RECENT recorded instance of
// each of Carla's three Phase-1 sessions so the structure reflects what she
// was actually doing last:
//   Session 1 from 2025-03-14, Session 2 from 2025-04-16, Session 3 from 2025-03-19.
//
// Exercise IDs are AM library IDs from server/data/ageless.db (verified
// case-insensitive name match). null id => exercise needs to be created
// (Wall Glute Stretch + Inverted Row - Chin Up don't exist in the seed yet);
// the migration upserts those with NULL demo_video_url so Dan can attach
// the right Vimeo clip in admin afterwards.
//
// Numeric heuristic for time-vs-reps: values > 30 with no associated
// weight read as seconds (most stretches/holds in Carla's sessions are
// 60s); everything else is treated as reps. Weight in kg.
export const CARLA = {
  email: 'carlarachelwhyte@hotmail.com',
  name: 'Carla Whyte',
  timezone: 'Europe/London',
};

// All exercises in Carla's Phase 1 now map to existing AM library entries -
// no new rows to insert. The two originally flagged as "missing" were
// remapped: Wall Glute Stretch -> Glute Stretch (394), Inverted Row -
// Chin Up -> Inverted Barbell Chin Up (1263). Kept the export for the
// migration's API stability; future seeds can re-introduce entries here.
export const NEW_EXERCISES = [];

// Session 1, 2, 3 — each item:
//   exercise_id  AM exercises.id (already-mapped). null => look up by name.
//   name         only used when exercise_id is null (NEW_EXERCISES lookup).
//   sets         total set count
//   reps         null when time-based
//   duration_secs null when reps-based
//   rest_secs    rest after exercise (default 30 for Carla's programme)
export const SESSIONS = [
  {
    title: 'Carla Phase 1 - Session 1',
    day_number: 1,
    exercises: [
      { exercise_id: 318, sets: 1, reps: '15',                                  },
      { exercise_id: 396, sets: 3, duration_secs: 60, time_based: true,         },
      { exercise_id: 269, sets: 3, reps: '10',                                  },
      { exercise_id: 282, sets: 3, reps: '6',                                   },
      { exercise_id: 320, sets: 1, duration_secs: 60, time_based: true,         },
      { exercise_id: 394, sets: 3, duration_secs: 60, time_based: true }, // Wall Glute Stretch -> Glute Stretch
      { exercise_id: 41,  sets: 3, reps: '10',                                  },
      { exercise_id: 5,   sets: 1, reps: '5',                                   },
      { exercise_id: 63,  sets: 2, reps: '10',                                  },
      { exercise_id: 217, sets: 1, duration_secs: 60, time_based: true,         },
      { exercise_id: 215, sets: 3, reps: '12',                                  },
    ],
  },
  {
    title: 'Carla Phase 1 - Session 2',
    day_number: 2,
    exercises: [
      { exercise_id: 259, sets: 2, duration_secs: 60, time_based: true },
      { exercise_id: 1263, sets: 3, reps: '10-15' }, // Inverted Row - Chin Up -> Inverted Barbell Chin Up
      { exercise_id: 225, sets: 2, reps: '12' },
      { exercise_id: 361, sets: 1, reps: '1' },
      { exercise_id: 324, sets: 3, reps: '10' },
      { exercise_id: 294, sets: 1, reps: '5' },
      { exercise_id: 360, sets: 1, reps: '15' },
      { exercise_id: 219, sets: 1, reps: '15' },
      { exercise_id: 351, sets: 2, reps: '8' },
      { exercise_id: 9,   sets: 3, reps: '10' },
      { exercise_id: 359, sets: 1, reps: '15' },
      { exercise_id: 80,  sets: 1, reps: '50' },
      { exercise_id: 239, sets: 2, reps: '8' },
      { exercise_id: 101, sets: 3, reps: '10' },
    ],
  },
  {
    title: 'Carla Phase 1 - Session 3',
    day_number: 3,
    exercises: [
      { exercise_id: 165, sets: 2, reps: '10' },
      { exercise_id: 215, sets: 3, reps: '12' },
      { exercise_id: 283, sets: 3, duration_secs: 120, time_based: true },
      { exercise_id: 294, sets: 1, reps: '5' },
      { exercise_id: 371, sets: 1, reps: '3' },
      { exercise_id: 313, sets: 1, duration_secs: 60, time_based: true },
      { exercise_id: 374, sets: 1, reps: '20' },
      { exercise_id: 376, sets: 2, duration_secs: 60, time_based: true },
      { exercise_id: 149, sets: 2, duration_secs: 60, time_based: true },
      { exercise_id: 47,  sets: 3, duration_secs: 60, time_based: true },
      { exercise_id: 174, sets: 2, reps: '15' },
      { exercise_id: 284, sets: 2, reps: '15' },
      { exercise_id: 381, sets: 2, duration_secs: 70, time_based: true },
      { exercise_id: 314, sets: 2, reps: '10' },
    ],
  },
];
