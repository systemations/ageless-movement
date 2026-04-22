// Pure rules-based allocator. Takes onboarding answers and returns a
// suggested program id + reason, or flags for coach review.
//
// Shared between client (instant preview on the suggestion screen) and
// server (authoritative save). The client's answers are re-run through
// this on /api/auth/register so a tampered client can't self-assign a
// program they wouldn't otherwise qualify for.
//
// No AI / heuristics — just if/then rules mapped to existing programs.
// When adding new programs or changing rules, update the tests too (not
// yet written — TODO when we add vitest).

// Program IDs as they exist in the seeded DB. If these IDs shift after a
// reseed, update here. Keeping them as constants makes the rules readable.
export const PROGRAM = {
  AMS_GROUND_ZERO: 1,          // 8wk, 6x/wk, 13-28 min — beginner mobility-first
  AMS_REBUILD: 38,             // 12wk, 3x/wk — intermediate strength+mobility
  AMS_PRIME: 39,               // 12wk, 3x/wk — advanced
  PICKLEBALL_DAILY: 40,        // 1wk loop, 5x/wk, 10-15 min — warm-up routines
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
  const {
    age, goal, sport, experience, equipment, days,
    injuries = [],
  } = answers;

  const bracket = ageBracket(age);
  const injured = hasAnyInjury(injuries);

  // ── Hard routes to coach review ─────────────────────────────────────
  // Anything that needs a human eye before we assign a program.
  if (injured) {
    return reviewResult('You mentioned some areas we should look at — a coach will review your answers and set you up personally.');
  }
  if (bracket === 'senior') {
    return reviewResult('To make sure your plan fits, a coach will review your answers within 24 hours.');
  }
  if (sport === 'other') {
    return reviewResult("We don't have a program for that sport yet — a coach will recommend the closest fit.");
  }
  // Obvious contradictions
  if (experience === 'advanced' && bracket === 'active_senior' && days === 2) {
    return reviewResult('Your answers look great — a coach will set up the right plan for you.');
  }

  // ── Pickleball track ───────────────────────────────────────────────
  // Sport-specific programs take priority over generic goals.
  if (sport === 'pickleball') {
    const atGym = equipment === 'full_gym' || equipment === 'home_gym';
    const threeDays = days >= 3;
    if (atGym && threeDays)  return match(PROGRAM.PICKLEBALL_GYM_3X,  'Pickleball Performance — Gym, 3x per week', 'You play pickleball and have gym access for 3+ days a week.');
    if (atGym && !threeDays) return match(PROGRAM.PICKLEBALL_GYM_2X,  'Pickleball Performance — Gym, 2x per week', 'You play pickleball and have gym access for 2 days a week.');
    if (threeDays)           return match(PROGRAM.PICKLEBALL_HOME_3X, 'Pickleball Performance — Home, 3x per week', 'You play pickleball and train from home for 3+ days a week.');
    return                          match(PROGRAM.PICKLEBALL_HOME_2X, 'Pickleball Performance — Home, 2x per week', 'You play pickleball and train from home for 2 days a week.');
  }

  // ── AMS core track — based on experience + goal ────────────────────
  // Goals:
  //   move_pain_free / mobility / active_healthy → mobility-first programs
  //   strength                                    → strength programs
  //   (sport + other tennis/golf/running)         → coach review for now
  if (sport === 'tennis' || sport === 'golf' || sport === 'running') {
    // We don't have dedicated programs for these yet — route to coach so
    // they can pick the closest fit (usually AMS Prime + sport-specific
    // notes in the coach note).
    return reviewResult(`We don't have a dedicated ${sport} program yet — a coach will pick the closest fit.`);
  }

  const mobilityGoal = goal === 'move_pain_free' || goal === 'mobility' || goal === 'active_healthy';
  const strengthGoal = goal === 'strength';

  // Beginner / returning — Ground Zero is the right starting point for
  // anyone, regardless of equipment. Short sessions, 6x/wk frequency
  // keeps consistency high.
  if (experience === 'just_starting' || experience === 'occasional') {
    return match(PROGRAM.AMS_GROUND_ZERO, 'AMS Ground Zero™', "You're returning to training — Ground Zero rebuilds the basics over 8 weeks with short daily sessions.");
  }

  // Consistent trainers
  if (experience === 'consistent') {
    if (strengthGoal && (equipment === 'full_gym' || equipment === 'home_gym')) {
      return match(PROGRAM.AMS_REBUILD, 'AMS ReBuild™', 'Strength-focused, 12 weeks, 3x/wk — uses the gym equipment you have.');
    }
    if (mobilityGoal) {
      return match(PROGRAM.AMS_REBUILD, 'AMS ReBuild™', '12-week mobility+strength rebuild — 3x/wk, any equipment.');
    }
    return match(PROGRAM.AMS_REBUILD, 'AMS ReBuild™', 'A solid 12-week foundation you can run anywhere.');
  }

  // Advanced
  if (experience === 'advanced') {
    return match(PROGRAM.AMS_PRIME, 'AMS Prime™', 'Advanced 12-week progression across mobility, strength and skill work.');
  }

  // Fallthrough — shouldn't hit, but be safe.
  return reviewResult("A coach will review your answers and set up your program.");
}

function match(program_id, title, reason) {
  return { program_id, title, reason, needs_review: false };
}

function reviewResult(reason) {
  return { program_id: null, title: null, reason, needs_review: true };
}
