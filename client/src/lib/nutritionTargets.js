// Mirror of server/src/lib/nutritionTargets.js — KEEP IN SYNC.
//
// Used on the client for:
//   - Onboarding live preview (so the user sees their target form as
//     they answer height/weight/etc questions)
//   - Profile page editable BMR card (recompute on change without a
//     round-trip until they commit)
//
// The server runs the same calc on register + profile updates so a
// tampered client request can't poison the saved targets.

export const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary',           hint: 'Desk job, little or no exercise',                       factor: 1.2   },
  { value: 'light',     label: 'Lightly active',      hint: 'Light exercise / walks 1–3 days a week',                factor: 1.375 },
  { value: 'moderate',  label: 'Moderately active',   hint: 'Moderate exercise 3–5 days a week',                     factor: 1.55  },
  { value: 'very',      label: 'Very active',         hint: 'Hard exercise 6–7 days a week',                         factor: 1.725 },
  { value: 'extreme',   label: 'Extremely active',    hint: 'Hard daily training + physical job, or 2-a-days',       factor: 1.9   },
];

export const EATING_STYLES = [
  { value: 'balanced',      label: 'Balanced',                hint: 'A bit of everything — no foods restricted',             p: 30, f: 30, c: 40 },
  { value: 'high_protein',  label: 'High protein / cutting',  hint: 'Lean focus: more protein, less fat',                    p: 40, f: 25, c: 35 },
  { value: 'mediterranean', label: 'Mediterranean / endurance', hint: 'Higher carbs for runners, cyclists, court sports',    p: 25, f: 30, c: 45 },
  { value: 'low_carb',      label: 'Low carb',                hint: 'Reduced grains and sugars — not full keto',             p: 35, f: 40, c: 25 },
  { value: 'keto',          label: 'Keto',                    hint: 'Very low carb (~25 g/day), high fat',                   p: 25, f: 70, c: 5  },
  { value: 'carnivore',     label: 'Carnivore',               hint: 'Animal foods only — minimal carbs, high fat + protein', p: 35, f: 60, c: 5  },
  { value: 'plant_based',   label: 'Plant-based',             hint: 'Vegetarian or vegan — higher carb, moderate fat',       p: 20, f: 30, c: 50 },
];

export const SEX_OPTIONS = [
  { value: 'male',   label: 'Male' },
  { value: 'female', label: 'Female' },
];

const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_FAT     = 9;
const KCAL_PER_G_CARBS   = 4;

export function calculateBMR({ sex, weight_kg, height_cm, age }) {
  if (!weight_kg || !height_cm || !age) return null;
  const base = (10 * weight_kg) + (6.25 * height_cm) - (5 * age);
  return Math.round(base + (sex === 'male' ? 5 : -161));
}

export function activityFactor(level) {
  const a = ACTIVITY_LEVELS.find(x => x.value === level);
  return a ? a.factor : 1.55;
}

export function eatingStyle(value) {
  return EATING_STYLES.find(x => x.value === value) || EATING_STYLES[0];
}

export function calculateTargets({ sex, weight_kg, height_cm, age, activity_level, eating_style: styleKey }) {
  const bmr = calculateBMR({ sex, weight_kg, height_cm, age });
  if (bmr == null) {
    return { bmr: null, tdee: null, calorie_target: null, protein_target: null, fat_target: null, carbs_target: null, style: eatingStyle(styleKey) };
  }
  const factor = activityFactor(activity_level);
  const tdee = Math.round(bmr * factor);
  const style = eatingStyle(styleKey);

  const calorie_target = tdee;
  const protein_target = Math.round((calorie_target * (style.p / 100)) / KCAL_PER_G_PROTEIN);
  const fat_target     = Math.round((calorie_target * (style.f / 100)) / KCAL_PER_G_FAT);
  const carbs_target   = Math.round((calorie_target * (style.c / 100)) / KCAL_PER_G_CARBS);

  return { bmr, tdee, calorie_target, protein_target, fat_target, carbs_target, style };
}

export function cmToFtIn(cm) {
  if (cm == null || isNaN(cm)) return { ft: null, in: null };
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inches = Math.round(totalIn - ft * 12);
  if (inches === 12) return { ft: ft + 1, in: 0 };
  return { ft, in: inches };
}

export function ftInToCm(ft, inches) {
  const f = Number(ft) || 0;
  const i = Number(inches) || 0;
  return Math.round((f * 12 + i) * 2.54 * 10) / 10;
}

export function kgToLbs(kg) {
  if (kg == null || isNaN(kg)) return null;
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbsToKg(lbs) {
  if (lbs == null || isNaN(lbs)) return null;
  return Math.round(lbs / 2.20462 * 10) / 10;
}
