#!/usr/bin/env python3
"""Import AMS ReBuild and Prime programs from PDFs."""

import pdfplumber
import sqlite3
import os
import re
import warnings
warnings.filterwarnings('ignore')

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'ageless.db')
BASE_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', '..')

db = sqlite3.connect(DB_PATH)
db.row_factory = sqlite3.Row

exercises_db = {row['name'].lower().strip(): dict(row) for row in db.execute('SELECT * FROM exercises').fetchall()}

def find_or_create_exercise(name):
    name = name.strip()
    if not name or len(name) < 3:
        return None
    key = name.lower()
    if key in exercises_db:
        return exercises_db[key]['id']
    for k, ex in exercises_db.items():
        if key in k or k in key:
            return ex['id']
    words = [w for w in key.split() if len(w) > 3]
    if words:
        for k, ex in exercises_db.items():
            if all(w in k for w in words):
                return ex['id']
    cur = db.execute('INSERT INTO exercises (name) VALUES (?)', (name,))
    db.commit()
    exercises_db[key] = {'id': cur.lastrowid, 'name': name}
    return cur.lastrowid

def get_or_create_program(title, desc='', weeks=12):
    row = db.execute('SELECT id FROM programs WHERE title = ?', (title,)).fetchone()
    if row:
        return row['id']
    cur = db.execute('INSERT INTO programs (coach_id, title, description, duration_weeks, workouts_per_week) VALUES (1,?,?,?,3)',
                     (title, desc, weeks))
    db.commit()
    return cur.lastrowid

def parse_ams_pdf(filepath, program_id, session_num, week_start, week_end):
    """Parse an AMS structured workout PDF."""
    if not os.path.exists(filepath):
        print(f"  Not found: {os.path.basename(filepath)}")
        return 0, 0

    with pdfplumber.open(filepath) as pdf:
        full_text = ''
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                full_text += text + '\n'

    # Extract workout metadata
    duration_match = re.search(r'(\d+)\s*mins?', full_text)
    duration = int(duration_match.group(1)) if duration_match else 30

    intensity = 'Medium'
    if 'Moderate' in full_text:
        intensity = 'Medium'
    elif 'High' in full_text:
        intensity = 'High'
    elif 'Low' in full_text:
        intensity = 'Low'

    # Extract body parts
    body_parts = ''
    for bp in ['Upper Body', 'Lower Body', 'Hips', 'Core', 'Full Body', 'Back', 'Shoulders']:
        if bp in full_text:
            body_parts += bp + ', '
    body_parts = body_parts.rstrip(', ')

    # Create workouts for each week in the range
    workout_count = 0
    exercise_count = 0

    for week in range(week_start, week_end + 1):
        w_id = db.execute('SELECT id FROM workouts WHERE program_id=? AND week_number=? AND day_number=?',
                         (program_id, week, session_num)).fetchone()
        if w_id:
            w_id = w_id['id']
        else:
            cur = db.execute(
                'INSERT INTO workouts (program_id, week_number, day_number, title, duration_mins, intensity, body_parts, workout_type) VALUES (?,?,?,?,?,?,?,?)',
                (program_id, week, session_num,
                 f'Session {session_num} - Week {week}',
                 duration, intensity, body_parts, 'mobility'))
            db.commit()
            w_id = cur.lastrowid
            workout_count += 1

        # Parse exercises
        lines = full_text.split('\n')
        order = 0
        current_group = None
        sets = 1

        for line in lines:
            line = line.strip()

            # Detect set groups
            set_match = re.match(r'(\d+)\s+Sets?\s+(REGULAR|SUPERSET|TRISET)', line, re.IGNORECASE)
            if set_match:
                sets = int(set_match.group(1))
                group = set_match.group(2).lower()
                current_group = group if group != 'regular' else None
                continue

            # Skip metadata lines
            if any(line.startswith(x) for x in ['Session', 'AMS', 'TYPE', 'Workout', 'Not Specified', 'TARGET', 'Exercises', 'Rest', 'R t']):
                continue
            if not line or line.startswith('Upper Body') or line.startswith('Hips') or line.startswith('Lower'):
                continue

            # Detect exercise lines - they have reps/duration info on next lines
            # Exercise names are typically lines that don't start with numbers and aren't reps
            if re.match(r'^[A-Z]', line) and not re.match(r'^\d', line) and len(line) > 5:
                # This could be an exercise name
                # Check it's not a reps line
                if not any(x in line.lower() for x in ['alt•', 'duration', 'reps', 'per arm', 'per leg', 'per side', '0:', '1:']):
                    # Clean the name
                    ex_name = re.sub(r':\s*\d+.*$', '', line).strip()
                    ex_name = re.sub(r'\s+#\d+$', '', ex_name).strip()

                    if ex_name and len(ex_name) > 3:
                        ex_id = find_or_create_exercise(ex_name)
                        if ex_id:
                            # Check if already linked for this week
                            exists = db.execute('SELECT id FROM workout_exercises WHERE workout_id=? AND exercise_id=?', (w_id, ex_id)).fetchone()
                            if not exists:
                                # Find reps from nearby lines
                                reps = '10'
                                db.execute(
                                    'INSERT INTO workout_exercises (workout_id, exercise_id, order_index, sets, reps, group_type) VALUES (?,?,?,?,?,?)',
                                    (w_id, ex_id, order, sets, reps, current_group))
                                order += 1
                                exercise_count += 1

    db.commit()
    return workout_count, exercise_count

# ===== MAIN =====
print(f"Exercises in DB: {len(exercises_db)}")

# AMS ReBuild
rebuild_id = get_or_create_program('AMS | ReBuild™',
    'The second level of the AMS mobility system. 3 sessions per week across 12 weeks, building on Ground Zero foundations.', weeks=12)
print(f"\n=== AMS ReBuild (program_id={rebuild_id}) ===")

rebuild_files = [
    ('AMS - ReBuild - Session 1 - Wks  1-4 structured workout.pdf', 1, 1, 4),
    ('AMS - ReBuild - Session 1 - Wks 5-8 structured workout.pdf', 1, 5, 8),
    ('AMS - ReBuild - Session 1 - Wks 9-12 structured workout.pdf', 1, 9, 12),
    ('AMS - ReBuild - Session 2 - Wks 1-4 structured workout.pdf', 2, 1, 4),
    ('AMS - ReBuild - Session 2 - Wks 5-8 structured workout.pdf', 2, 5, 8),
    ('AMS - ReBuild - Session 2 - Wks 9-12 structured workout.pdf', 2, 9, 12),
    ('AMS - ReBuild - Session 3- Wks 1-4 structured workout.pdf', 3, 1, 4),
    ('AMS - ReBuild - Session 3- Wks 5-8 structured workout.pdf', 3, 5, 8),
    ('AMS - ReBuild - Session 3- Wks 9-12 structured workout.pdf', 3, 9, 12),
]

total_w, total_e = 0, 0
for filename, session, wk_start, wk_end in rebuild_files:
    filepath = os.path.join(BASE_DIR, filename)
    wc, ec = parse_ams_pdf(filepath, rebuild_id, session, wk_start, wk_end)
    print(f"  {filename}: {wc} workouts, {ec} exercises")
    total_w += wc
    total_e += ec
print(f"  ReBuild total: {total_w} workouts, {total_e} exercises")

# AMS Prime
prime_id = get_or_create_program('AMS | Prime™',
    'The advanced level of the AMS mobility system. 3 sessions per week across 12 weeks for experienced movers.', weeks=12)
print(f"\n=== AMS Prime (program_id={prime_id}) ===")

prime_files = [
    ('AMS - Prime - Session 1 - Wks 1-4 structured workout.pdf', 1, 1, 4),
    ('AMS - Prime - Session 1 - Wks 5-9 structured workout.pdf', 1, 5, 8),
    ('AMS - Prime - Session 1 - Wks 9-12 structured workout.pdf', 1, 9, 12),
    ('AMS - Prime - Session 2 - Wks 1-4 structured workout.pdf', 2, 1, 4),
    ('AMS - Prime - Session 2 - Wks 5-8 structured workout.pdf', 2, 5, 8),
    ('AMS - Prime - Session 2 - Wks 9-12 structured workout.pdf', 2, 9, 12),
    ('AMS - Prime - Session 3 - Wks 1-4 structured workout.pdf', 3, 1, 4),
    ('AMS - Prime - Session 3 - Wks 5-8 structured workout.pdf', 3, 5, 8),
    ('AMS - Prime - Session 3 - Wks 9-12 structured workout.pdf', 3, 9, 12),
]

total_w, total_e = 0, 0
for filename, session, wk_start, wk_end in prime_files:
    filepath = os.path.join(BASE_DIR, filename)
    wc, ec = parse_ams_pdf(filepath, prime_id, session, wk_start, wk_end)
    print(f"  {filename}: {wc} workouts, {ec} exercises")
    total_w += wc
    total_e += ec
print(f"  Prime total: {total_w} workouts, {total_e} exercises")

# Final summary
pc = db.execute('SELECT COUNT(*) as c FROM programs').fetchone()['c']
wc = db.execute('SELECT COUNT(*) as c FROM workouts').fetchone()['c']
ec = db.execute('SELECT COUNT(*) as c FROM exercises').fetchone()['c']
lc = db.execute('SELECT COUNT(*) as c FROM workout_exercises').fetchone()['c']
print(f"\n=== GRAND TOTAL ===")
print(f"  Programs: {pc}")
print(f"  Workouts: {wc}")
print(f"  Exercises: {ec}")
print(f"  Exercise links: {lc}")
db.close()
