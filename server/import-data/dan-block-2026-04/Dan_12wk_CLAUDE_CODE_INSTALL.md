# Claude Code — Install Guide for Dan's 12-Week Program

> **Purpose:** This file tells Claude Code how to add a new 12-week program + meal plan **to Dan's existing user record** inside his health/training app. The app already has programs, sessions, exercises, and meal plans for other users — this install reuses the existing schema and assigns all new records to Dan (`athlete_id = 'dan-osullivan'` or whatever his actual user id is in the DB).

---

## ⚡ TL;DR — Install Flow (existing app, existing schema)

1. Claude Code finds Dan's user/athlete record in the DB.
2. Claude Code reads the existing schema (programs, sessions, exercises, meal_plans, etc.).
3. For each entity in `Dan_12wk_Program.json` and `Dan_12wk_MealPlan.json`:
   - **Exercises:** match against the existing exercise library by name + pattern. Reuse existing IDs. Only insert exercises that don't already exist.
   - **Program / block / phases / sessions / meals / supplements / protocols:** insert as **new records scoped to Dan's user_id**.
4. Run validation queries to confirm rowcounts.
5. Return a summary of what was inserted, what was reused, and anything that didn't map cleanly.

**No schema changes. No migrations. No overwriting other users' data.**

---

## The Prompt to Give Claude Code (copy this)

> "I'm adding a new 12-week program block + meal plan to an existing user ('Dan O'Sullivan') in this app. The schema already exists — other users have programs and meal plans in the DB.
>
> Read the files in `/seed/dan-block-2026-04/` (`Dan_12wk_Program.json`, `Dan_12wk_MealPlan.json`, and this install guide).
>
> Steps:
> 1. Locate Dan's user record (look up by name/email; if multiple matches, ask me before proceeding).
> 2. Inspect the existing schema — identify the tables for programs/blocks, phases, sessions, exercises, meal plans, supplements, etc. Map them to the JSON structure described below.
> 3. For exercises: **match against existing library first** using name + movement pattern. Only insert ones that don't already exist. Log which were reused vs. newly created.
> 4. Insert the block, phases, session templates, session exercises, weekly schedule, supplements, tendon protocol, wellness protocols, metrics, tests, scan/blood schedules, and emergency protocols — all scoped to Dan's user_id.
> 5. Insert the meal framework, phase calorie targets, meal templates, weekly meal plan rows, and swap options — scoped to Dan's user_id.
> 6. Run validation queries and report rowcounts.
> 7. Surface any JSON fields that didn't map cleanly to the existing schema — do not silently drop them. If a field doesn't fit, propose an adaptation and wait for my confirmation before committing.
> 8. Do not modify or touch any other user's data.
> 9. Use a transaction for the whole insert — rollback if validation fails."

---

---

## Files in this install package

| File | Purpose | Consumes-into |
|---|---|---|
| `Dan_12wk_Program.json` | Training program — phases, sessions, exercises, supplements, protocols, metrics, tests | Primary training DB tables |
| `Dan_12wk_MealPlan.json` | Nutrition — daily templates, weekly rotations, shopping lists | Nutrition DB tables |
| `Dan_12wk_Program_Apr2026.md` | Human-readable training plan (reference for Dan) | Static asset / docs |
| `Dan_12wk_MealPlan.md` | Human-readable meal plan (reference for Dan) | Static asset / docs |
| `Dan_12wk_CLAUDE_CODE_INSTALL.md` | This file | Install instructions only |

---

## Target Data Model (for reference — map to your actual schema)

> **Note:** The app already has these (or equivalent) tables. Use this as a semantic reference for what each JSON field means. Map fields to whatever column names your app already uses.

### Core tables

```
athletes
  - id (pk), name, dob_approx_age, height_cm, baseline_weight_kg, location, goals (jsonb), genetic_flags (jsonb), dietary_frame

blocks
  - id (pk), athlete_id (fk), name, start_date, end_date, duration_weeks

phases
  - id (pk), block_id (fk), name, weeks (int[]), theme,
    intensity_pct_min, intensity_pct_max, volume_rating,
    plyo_allowance, progression_notes, scan_required, bloods_required

exercises
  - id (pk), name, pattern, equipment, source_library, tendon_category

session_templates
  - id (pk), label, day_of_week, time_slot, duration_min

session_exercises
  - id (pk), session_template_id (fk), phase_id (fk), block_letter ('A','B','C1',...),
    exercise_id (fk), sets, reps (string — supports "8/leg"), tempo, load_pct_1rm,
    load_text (e.g. "BW+5kg"), rest_sec, pairing ('tri_set','superset','contrast',null),
    paired_with_exercise_id (fk nullable), duration_sec (for holds), notes

weekly_schedule
  - id (pk), block_id (fk), day_of_week, time, session_type, session_ref (fk to session_templates), duration_min

pickleball_sessions (optional subclass)
  - linked to session_templates where type='sport'

street_session_exercises
  - linked to session_templates where type='circuit'; stores ad-hoc circuits
```

### Nutrition tables

```
nutrition_frameworks
  - id (pk), athlete_id, style, constraints (jsonb), protein_g_per_kg_min, protein_g_per_kg_max,
    fish_meals_per_week_min, fibre_daily_requirement, hydration_l_min, sodium_g_range (int[]),
    potassium_g_range (int[]), alcohol_policy

phase_calorie_targets
  - id (pk), phase_id (fk), training_day_kcal, rest_day_kcal

meal_templates
  - id (pk), day_type (e.g. 'monday_gym_and_pickleball'), kcal_target, protein_g_target

meals
  - id (pk), meal_template_id (fk), meal_name, time_of_day, items (string[]),
    protein_g, fat_g, carbs_g

weekly_meal_plan
  - id (pk), block_id (fk), week_number, phase_id (fk), rotation ('A' | 'B' | 'deload' | 'test'),
    meat_focus (string[]), fish_days (string[]), liver_day (string),
    kcal_adjustment, honey_pre_lift_g, notes, shopping_list (jsonb)

swap_options
  - id (pk), original_item, replacements (string[])
```

### Supplements / Wellness / Monitoring

```
supplements
  - id (pk), athlete_id, name, dose, timing, rationale, conditional_trigger (nullable), double_on_days (string[])

tendon_protocols
  - id (pk), athlete_id, cadence (daily/3x/2x), exercises (jsonb), red_flag_triggers (string[]), red_flag_response

wellness_protocols
  - id (pk), athlete_id, category (sleep/hrv/sauna/cold/breathwork/concussion), config (jsonb)

metrics
  - id (pk), athlete_id, name, cadence, type

metric_values
  - id (pk), metric_id (fk), logged_at, value_numeric, value_text

tests
  - id (pk), athlete_id, name, cadence, type, protocol

test_results
  - id (pk), test_id (fk), logged_at, value_kg, value_numeric, notes

scan_schedule
  - id (pk), block_id (fk), week_number, scan_type, status, rule, completed_at (nullable)

bloods_schedule
  - id (pk), block_id (fk), week_number, panel (string[]), status, completed_at (nullable), results_url (nullable)

emergency_protocols
  - id (pk), athlete_id, trigger, action
```

---

## Install Steps for Claude Code

**Step 1 — Locate Dan's user record.**
Query the users/athletes table for Dan O'Sullivan. If no match, ask the operator before proceeding. If multiple matches, list them and ask.

**Step 2 — Match exercises against existing library.**
For each exercise in `exercise_library` in the JSON, query the existing exercises table by name (fuzzy match: case-insensitive, trim, normalise e.g. "Trap Bar Deadlift" ≈ "trap_bar_dl"). Log each match as REUSED or NEW. Only insert NEW ones.

**Step 3 — Insert block + program in this order (foreign key dependencies):**

1. `athletes` (insert Dan)
2. `blocks` → `phases` → `exercises`
3. `session_templates` → `session_exercises` (expand `phase_variants` in the JSON into one row per phase × block)
4. `weekly_schedule` (expand `weekly_schedule_template` into 7 rows)
5. `supplements` + `supplements_conditional` (flag the conditional ones in the same table with a `conditional_trigger` column)
6. `tendon_protocols` (one row per cadence bucket, exercises as jsonb)
7. `wellness_protocols` (one row per category)
8. `metrics` + `tests`
9. `scan_schedule` + `bloods_schedule`
10. `emergency_protocols`
11. `nutrition_frameworks` → `phase_calorie_targets` → `meal_templates` → `meals`
12. `weekly_meal_plan` (12 rows from `weekly_meal_plan_12_weeks`)
13. `swap_options` (from `default_swap_options`)

**Step 3 — Expand `phase_variants` in session templates.**
The JSON nests exercises per phase (`phase-1`, `phase-2`, `phase-3`). When seeding:
```
for each session_template s:
  for each phase_id p in s.phase_variants:
    for each exercise_entry e in s.phase_variants[p]:
      insert into session_exercises (session_template_id = s.id, phase_id = p, ...e)
```

**Step 4 — Create the weekly plan.**
For each of 12 weeks, create a `week_instance` that joins `block` + `phase` + `weekly_schedule` + `weekly_meal_plan` so the app can render "this week's plan" for Dan.

---

## Seed Helpers — Quick ID Conventions

If the existing app uses UUIDs, ignore these. If it uses slugs/human IDs, these are ready-to-use:

- `athlete_id = 'dan-osullivan'`
- `block_id = 'dan-block-2026-04'`
- `phase_id ∈ ['phase-1','deload-a','phase-2','deload-b','phase-3','test-week']`
- `exercise_id = kebab-case from JSON` (e.g. `trap_bar_dl`, `spanish_squat_iso`)
- `session_template_id = kebab-case` (e.g. `squat_day`, `deadlift_day`)

---

## Validation Queries (run after seed)

```sql
-- Check 6 phases
SELECT count(*) FROM phases WHERE block_id = 'dan-block-2026-04'; -- expect 6

-- Check 4 structured gym sessions + 1 pickleball + 1 run + 1 street + 1 sunday
SELECT count(*) FROM session_templates WHERE block_id = 'dan-block-2026-04'; -- expect 7+

-- Check exercises per session per phase (Squat Day Phase 1 should have ~9 entries)
SELECT st.label, p.name, count(*) AS ex_count
FROM session_exercises se
JOIN session_templates st ON st.id = se.session_template_id
JOIN phases p ON p.id = se.phase_id
GROUP BY st.label, p.name
ORDER BY st.label, p.name;

-- Check 12 weekly meal plans
SELECT count(*) FROM weekly_meal_plan WHERE block_id = 'dan-block-2026-04'; -- expect 12

-- Check supplements
SELECT count(*) FROM supplements WHERE athlete_id = 'dan-osullivan'; -- expect 9 + conditional
```

---

## App-Side UX Suggestions (for Claude Code to consider while building)

1. **"Today" screen** should read `block → current_week → phase → day_of_week` and surface the active session template + meals for that day.
2. **Mon 5am → 9:30 pickleball** is a two-session day — UX should show both cards with a reminder: "This gym session is LEG-FREE by design. Don't add extra lower body work — legs needed for pickleball."
3. **Saturday street session** needs a **"round scaling" control** — Phase 1 = 2 rounds, Phase 2+ = 3 rounds, override if legs >7/10 soreness → 1 round.
4. **Tendon red flags** should be a persistent banner if any of the triggers are active (morning stiffness, pain during eccentric, etc.).
5. **Deload weeks** should auto-scale intensity/volume — surface a banner "You're in Deload A — volume reduced 40%, intensity reduced 15%, zero plyos this week."
6. **Scan reminders** at Wk 4 / 8 / 12 should show 7 days before the due date.
7. **Pickleball RPE prompt** on Monday evening — quick 1–10 slider.
8. **Fish meal counter** on nutrition screen — running total for the week, target 4.
9. **Collagen double-dose reminder** on Wed + Fri mornings.
10. **Concussion flag** — a prominent 14-day-lockout toggle the user can activate if they get a head knock (SLC17A7 CG protocol). App should hide training cards for 14 days when active.

---

## Versioning

- **Program version:** v1.2 (2026-04-17)
- **Meal plan version:** v1.0 (2026-04-17)
- **Block ID:** `dan-block-2026-04` (start 2026-04-20, end 2026-07-12)

When the next 12-week block is planned (at Wk 12 review), generate a new block ID (`dan-block-2026-07` etc.) and a new install package. Don't overwrite this one — historical blocks are valuable training data.

---

## Prompt for Claude Code (quick reference)

Use the prompt at the top of this file (under "The Prompt to Give Claude Code"). It accounts for the existing schema + existing users.

---

## Safety rails for Claude Code

- **Use a transaction.** Wrap the entire insert in a single DB transaction; rollback on any validation failure.
- **Never modify or delete other users' records.** Every insert must be scoped to Dan's user_id.
- **Don't create duplicate exercises.** Always check the existing library first.
- **If any JSON field doesn't map to the existing schema, STOP and ask the operator.** Don't silently drop data.
- **Log a summary before committing:** rowcounts, reused vs new exercises, any skipped or ambiguous fields.
