// Pure rules-based allocator. Takes onboarding answers and returns a
// suggested program id + reason, or flags for coach review.
//
// Shared between client (instant preview on the suggestion screen) and
// server (authoritative save). The client's answers are re-run through
// this on /api/auth/register so a tampered client can't self-assign a
// program they wouldn't otherwise qualify for.
//
// No AI / heuristics - just if/then rules mapped to existing programs.
// When adding new programs or changing rules, update the tests too (not
// yet written - TODO when we add vitest).

// Program IDs as they exist in the seeded DB. If these IDs shift after a
// reseed, update here. Keeping them as constants makes the rules readable.
export const PROGRAM = {
  AMS_GROUND_ZERO: 1,          // 8wk, 6x/wk, 13-28 min - beginner mobility-first
  AMS_REBUILD: 38,             // 12wk, 3x/wk - intermediate strength+mobility
  AMS_PRIME: 39,               // 12wk, 3x/wk - advanced
  PICKLEBALL_DAILY: 40,        // 1wk loop, 5x/wk, 10-15 min - warm-up routines
  PICKLEBALL_HOME_3X: 41,      // 16wk, 3x/wk, 25-35 min
  PICKLEBALL_HOME_2X: 42,      // 16wk, 2x/wk, 25-35 min
  PICKLEBALL_GYM_3X: 45,       // 16wk, 3x/wk, 35-45 min
  PICKLEBALL_GYM_2X: 46,       // 16wk, 2x/wk, 35-45 min
  BODYWEIGHT_FUNCTIONAL: 22,   // bodyweight fallback if someone picks home + no specific goal
};

// Helpers ----------------------------------------------------------------

function ageBracket(age) {
  const a = Number(age);
  if (!Number.isFinite(a)) return 'unknown';
  if (a < 30) return 'young_adult';
  if (a < 45) return 'adult';
  if (a < 60) return 'mid_life';
  if (a < 75) return 'active_senior';
  return 'senior';
}

function hasAnyInjury(injuries) {
  if (!Array.isArray(injuries)) return false;
  return injuries.filter(x => x && x !== 'none').length > 0;
}

// Main export ------------------------------------------------------------

/**
 * @param {Object} answers
 * @param {number} answers.age
 * @param {'move_pain_free'|'mobility'|'strength'|'sport'|'active_healthy'} answers.goal
 * @param {'none'|'pickleball'|'tennis'|'golf'|'running'|'other'} answers.sport
 * @param {'just_starting'|'occasional'|'consistent'|'advanced'} answers.experience
 * @param {'home_bodyweight'|'home_basics'|'home_gym'|'full_gym'} answers.equipment
 * @param {2|3|4} answers.days
 * @param {string[]} answers.injuries  e.g. ['knee','back'] or ['none']
 */
export function allocateProgram(answers = {}) {
  const { age, injuries = [] } = answers;

  const bracket = ageBracket(age);
  const injured = hasAnyInjury(injuries);

  // ── V1 alpha: universal default ─────────────────────────────────────
  // Every new client starts on AMS Ground Zero - the mobility-first
  // flagship. Once real signups land, Dan + Joonas can switch anyone to
  // Pickleball / ReBuild / Prime from the admin side. Keeping the rules
  // simple here means fewer wrong auto-assignments and a cleaner picture
  // of who actually signs up before we codify the real mapping.
  //
  // Two safety nets still route to coach review rather than auto-enrol:
  //   - Anyone who flagged an injury → coach reviews before prescribing
  //   - Seniors (75+) → coach assigns a suitable gentle-track plan
  if (injured) {
    return reviewResult('You mentioned some areas we should look at - a coach will review your answers and set you up personally within 24 hours.');
  }
  if (bracket === 'senior') {
    return reviewResult('To make sure your plan fits, a coach will review your answers within 24 hours.');
  }

  return match(
    PROGRAM.AMS_GROUND_ZERO,
    'AMS Ground Zero™',
    'Our mobility-first starting program. Short daily sessions that rebuild the basics over 8 weeks.',
  );
}

function match(program_id, title, reason) {
  return { program_id, title, reason, needs_review: false };
}

function reviewResult(reason) {
  return { program_id: null, title: null, reason, needs_review: true };
}
