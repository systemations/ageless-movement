#!/usr/bin/env python3
"""Parser for AMS structured-workout PDFs (ReBuild / Prime).

Reconstructs true reading order from word coordinates, then segments into
groups (REGULAR / SUPERSET / TRISET blocks) and exercises, capturing:
  - group_label letter (A, B, C ...) so each block renders as a separate superset
  - sets per group, rest after the group
  - per-side (arm/side/leg), tempo (e.g. 3-1-2-1)
  - duration vs reps, with duration_secs
  - hold notes embedded after a colon in the exercise name

Run with --dump <file.pdf> to print parsed structure without writing to the DB.
"""

import re
import sys
import logging
import warnings

warnings.filterwarnings('ignore')
logging.disable(logging.CRITICAL)

import pdfplumber


def ordered_lines(filepath, tol=6):
    """Return the PDF's text as lines in true reading order (top-to-bottom,
    left-to-right), concatenating all pages. Words whose vertical position is
    within `tol` px are clustered onto the same line (the PDF places some
    same-row tokens a few px apart, e.g. 'Rest' + '0:30')."""
    lines = []
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            words = sorted(page.extract_words(use_text_flow=False), key=lambda w: (w['top'], w['x0']))
            cur, anchor = [], None
            for w in words:
                if anchor is None or abs(w['top'] - anchor) <= tol:
                    cur.append(w)
                    if anchor is None:
                        anchor = w['top']
                else:
                    text = ' '.join(t['text'] for t in sorted(cur, key=lambda p: p['x0']))
                    lines.append(text.strip())
                    cur, anchor = [w], w['top']
            if cur:
                text = ' '.join(t['text'] for t in sorted(cur, key=lambda p: p['x0']))
                lines.append(text.strip())
    return [ln for ln in lines if ln]


def parse_time_to_secs(s):
    """'1:00' -> 60, '0:45' -> 45, '6:00' -> 360."""
    m = re.match(r'(\d+):(\d{2})', s)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    return None


GROUP_HEADER_RE = re.compile(r'^(\d+)\s*Sets?\s*(REGULAR|SUPERSET|TRISET|TRI-SET|CIRCUIT)?', re.IGNORECASE)
ALT_LINE_RE = re.compile(r'^(\d+)\s*ALT\b(.*)$', re.IGNORECASE)
REST_RE = re.compile(r'^Rest\s*(\d+:\d{2})', re.IGNORECASE)
TEMPO_RE = re.compile(r'\d-\d-\d-\d')

METADATA_PREFIXES = (
    'Session', 'AMS', 'TYPE', 'DURATION', 'INTENSITY', 'TARGET', 'Not Specified',
    'Exercises', 'Workout',
)
BODY_PART_LINES = ('Upper Body', 'Lower Body', 'Hips', 'Core', 'Full Body', 'Back', 'Shoulders')


def parse_pdf(filepath):
    """Return (meta, groups). groups is a list of dicts:
       {label, type, sets, rest_secs, exercises:[...]}.
    """
    lines = ordered_lines(filepath)

    # ---- metadata ----
    full = '\n'.join(lines)
    dm = re.search(r'(\d+)\s*mins?', full)
    duration = int(dm.group(1)) if dm else 30
    intensity = 'Medium'
    if 'High' in full:
        intensity = 'High'
    elif 'Low' in full:
        intensity = 'Low'
    body = ', '.join(bp for bp in BODY_PART_LINES if bp in full)
    meta = {'duration': duration, 'intensity': intensity, 'body_parts': body}

    # ---- find where the exercise list starts ----
    try:
        start = lines.index('Exercises') + 1
    except ValueError:
        start = 0
    body_lines = lines[start:]

    groups = []
    cur = None
    letters = iter('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    pending_ex = None  # exercise dict awaiting its attribute / value lines

    def is_attr_line(s):
        return bool(ALT_LINE_RE.match(s) or re.match(r'^(duration|reps)\b', s, re.IGNORECASE))

    def flush_ex():
        nonlocal pending_ex
        if pending_ex and cur is not None:
            cur['exercises'].append(pending_ex)
        pending_ex = None

    def is_metadata(ln):
        if any(ln.startswith(p) for p in METADATA_PREFIXES):
            return True
        # standalone body-part header line (e.g. "Upper Body Hips Lower Body")
        if ln in BODY_PART_LINES or all(tok in ' '.join(BODY_PART_LINES) for tok in [ln]):
            pass
        return False

    i = 0
    n = len(body_lines)
    while i < n:
        raw = body_lines[i]
        ln = raw.strip()
        i += 1
        if not ln:
            continue

        # --- group header (may be split: "2 Sets" then "SUPERSET") ---
        gh = GROUP_HEADER_RE.match(ln)
        if gh:
            flush_ex()
            sets = int(gh.group(1))
            gtype = (gh.group(2) or '').upper()
            if not gtype and i < n:
                nxt = body_lines[i].strip().upper()
                if nxt in ('REGULAR', 'SUPERSET', 'TRISET', 'TRI-SET', 'CIRCUIT'):
                    gtype = nxt
                    i += 1
            type_map = {
                'REGULAR': 'regular', 'SUPERSET': 'superset',
                'TRISET': 'triset', 'TRI-SET': 'triset', 'CIRCUIT': 'circuit',
            }
            cur = {
                'label': next(letters),
                'type': type_map.get(gtype, 'regular'),
                'sets': sets,
                'rest_secs': 30,
                'exercises': [],
            }
            groups.append(cur)
            continue

        # --- rest line: belongs to the group just completed ---
        rm = REST_RE.match(ln)
        if rm:
            flush_ex()
            secs = parse_time_to_secs(rm.group(1))
            if cur is not None and secs is not None:
                cur['rest_secs'] = secs
            continue

        # --- attribute line: "3 ALT•duration•weights•per arm•3-1-2-1•" ---
        am = ALT_LINE_RE.match(ln)
        if am and pending_ex is not None:
            attrs = am.group(2)
            tokens = [t.strip().lower() for t in re.split(r'[•·]', attrs) if t.strip()]
            joined = ' '.join(tokens)
            if 'per arm' in joined:
                pending_ex['per_side'] = 'arm'
            elif 'per side' in joined:
                pending_ex['per_side'] = 'side'
            elif 'per leg' in joined:
                pending_ex['per_side'] = 'leg'
            if 'duration' in joined:
                pending_ex['time_based'] = 1
                pending_ex['tracking_type'] = 'Duration'
            elif 'reps' in joined:
                pending_ex['tracking_type'] = 'Repetitions'
            tm = TEMPO_RE.search(attrs)
            if tm:
                pending_ex['tempo'] = tm.group(0)
            pending_ex['_alt_count'] = int(am.group(1))
            pending_ex['_awaiting_value'] = True
            continue

        # --- bare attribute line (warm-ups have "duration"/"reps" with no ALT prefix) ---
        if pending_ex is not None and not pending_ex.get('_awaiting_value') \
                and re.match(r'^(duration|reps)\b', ln, re.IGNORECASE):
            if ln.lower().startswith('duration'):
                pending_ex['time_based'] = 1
                pending_ex['tracking_type'] = 'Duration'
            else:
                pending_ex['tracking_type'] = 'Repetitions'
            pending_ex['_awaiting_value'] = True
            continue

        # --- skip metadata / body part lines ---
        if is_metadata(ln):
            continue

        # --- stray per-side suffix fragment on its own line ---
        if re.match(r'^/?\s*(arm|side|leg)s?$', ln, re.IGNORECASE):
            continue

        # --- value line for the pending exercise: "0:45/ arm", "10reps / leg",
        #     "8 - 10reps / side", "1:00", "0:15" ---
        if pending_ex is not None and pending_ex.get('_awaiting_value'):
            time_val = re.match(r'^(\d+:\d{2})', ln)
            reps_val = re.match(r'^(\d+(?:\s*[-–]\s*\d+)?)\s*reps?\b', ln, re.IGNORECASE)
            bare_num = re.match(r'^(\d+(?:\s*[-–]\s*\d+)?)\s*$', ln)
            if time_val:
                secs = parse_time_to_secs(time_val.group(1))
                pending_ex['duration_secs'] = secs
                pending_ex['reps'] = time_val.group(1)
                if pending_ex.get('tracking_type') is None:
                    pending_ex['tracking_type'] = 'Duration'
                    pending_ex['time_based'] = 1
                pending_ex['_awaiting_value'] = False
                continue
            if reps_val:
                pending_ex['reps'] = re.sub(r'\s*', '', reps_val.group(1))
                pending_ex['tracking_type'] = pending_ex.get('tracking_type') or 'Repetitions'
                pending_ex['_awaiting_value'] = False
                continue
            if bare_num:
                pending_ex['reps'] = re.sub(r'\s*', '', bare_num.group(1))
                pending_ex['_awaiting_value'] = False
                continue
            # trailing "/ arm" "/ leg" "arm" "side" "leg" — side suffix only, ignore
            if re.match(r'^/?\s*(arm|side|leg)s?$', ln, re.IGNORECASE):
                continue

        # --- otherwise: this is an exercise name line ---
        # ignore obvious garbage / stray rest fragments
        if re.match(r'^R\s*t\b', ln) or re.match(r'^\d{2,3}$', ln):
            continue
        if len(ln) < 3:
            continue
        # A real exercise row is always followed by an attribute line
        # (N ALT… or bare duration/reps). If the next line isn't, this is a
        # coaching-note paragraph printed above the rows — divert to notes.
        nxt = body_lines[i].strip() if i < n else ''
        if not is_attr_line(nxt):
            if cur is not None:
                cur.setdefault('notes_acc', []).append(ln)
            continue
        flush_ex()
        # hold note after a colon -> notes; keep clean-ish name
        note = None
        name = ln
        cm = re.match(r'^(.*?):\s*(.*hold.*|.*second.*|.*rep.*)$', ln, re.IGNORECASE)
        if cm:
            name = cm.group(1).strip()
            note = cm.group(2).strip()
        # strip trailing "#01" warm-up index
        name = re.sub(r'\s*#\d+\s*$', '', name).strip()
        pending_ex = {
            'name': name, 'notes': note, 'per_side': None, 'tempo': None,
            'time_based': 0, 'tracking_type': None, 'reps': None, 'duration_secs': None,
            '_awaiting_value': False,
        }
    flush_ex()

    # drop empty groups
    groups = [g for g in groups if g['exercises']]
    return meta, groups


def _dump(filepath):
    meta, groups = parse_pdf(filepath)
    print(f"META: {meta}")
    for g in groups:
        print(f"\n[{g['label']}] {g['type'].upper()}  x{g['sets']} sets  rest {g['rest_secs']}s")
        for ex in g['exercises']:
            bits = []
            if ex['tracking_type'] == 'Duration' and ex['duration_secs']:
                bits.append(f"{ex['duration_secs']}s")
            elif ex['reps']:
                bits.append(f"{ex['reps']} reps")
            if ex['per_side']:
                bits.append(f"/{ex['per_side']}")
            if ex['tempo']:
                bits.append(f"tempo {ex['tempo']}")
            note = f"  ~ {ex['notes']}" if ex['notes'] else ''
            print(f"    - {ex['name']}  ({', '.join(bits)}){note}")


import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'ageless.db')
PDF_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'import-data')

REBUILD_FILES = [
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
PRIME_FILES = [
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


def _norm(s):
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', '', s.lower())).strip()


def map_group_notes(group):
    """Best-effort: split a group's diverted coaching paragraph back onto the
    exercise each sentence refers to (sheets use 'ExerciseName: cue' format)."""
    acc = group.get('notes_acc')
    if not acc:
        return
    joined = ' '.join(acc)
    hits = []
    for ex in group['exercises']:
        m = re.search(re.escape(ex['name']), joined, re.IGNORECASE)
        if m:
            hits.append((m.start(), m.end(), ex))
    hits.sort(key=lambda h: h[0])
    for idx, (_, end, ex) in enumerate(hits):
        stop = hits[idx + 1][0] if idx + 1 < len(hits) else len(joined)
        note = joined[end:stop].lstrip(' :').strip()
        if note and not ex.get('notes'):
            ex['notes'] = note


def find_or_create_exercise(db, idx, name):
    key = _norm(name)
    if key in idx:
        return idx[key]
    cur = db.execute('INSERT INTO exercises (name) VALUES (?)', (name,))
    idx[key] = cur.lastrowid
    return cur.lastrowid


def import_program(db, idx, program_id, files):
    total_w = total_e = 0
    for filename, session, wk_start, wk_end in files:
        path = os.path.join(PDF_DIR, filename)
        if not os.path.exists(path):
            print(f"  MISSING: {filename}")
            continue
        meta, groups = parse_pdf(path)
        for g in groups:
            map_group_notes(g)
        for week in range(wk_start, wk_end + 1):
            row = db.execute(
                "SELECT id FROM workouts WHERE program_id=? AND week_number=? AND title LIKE ?",
                (program_id, week, f'Session {session} - %')).fetchone()
            if not row:
                print(f"  NO WORKOUT: prog {program_id} S{session} W{week}")
                continue
            w_id = row['id']
            db.execute("UPDATE workouts SET duration_mins=?, intensity=?, body_parts=? WHERE id=?",
                       (meta['duration'], meta['intensity'], meta['body_parts'], w_id))
            # wipe existing rows (meta cascades) and re-insert
            old = db.execute('SELECT id FROM workout_exercises WHERE workout_id=?', (w_id,)).fetchall()
            for o in old:
                db.execute('DELETE FROM workout_exercise_meta WHERE workout_exercise_id=?', (o['id'],))
            db.execute('DELETE FROM workout_exercises WHERE workout_id=?', (w_id,))
            order = 0
            for g in groups:
                gtype = 'warmup' if g['exercises'] and 'warm up' in g['exercises'][0]['name'].lower() else g['type']
                for ex in g['exercises']:
                    ex_id = find_or_create_exercise(db, idx, ex['name'])
                    reps = ex['reps'] if ex['reps'] is not None else ('' if ex['time_based'] else '10')
                    cur = db.execute(
                        """INSERT INTO workout_exercises
                           (workout_id, exercise_id, order_index, sets, reps, duration_secs,
                            rest_secs, group_type, group_label, notes)
                           VALUES (?,?,?,?,?,?,?,?,?,?)""",
                        (w_id, ex_id, order, g['sets'], reps, ex['duration_secs'],
                         g['rest_secs'], gtype, g['label'], ex.get('notes')))
                    we_id = cur.lastrowid
                    db.execute(
                        """INSERT INTO workout_exercise_meta
                           (workout_exercise_id, tempo, per_side, time_based, duration_secs, tracking_type)
                           VALUES (?,?,?,?,?,?)""",
                        (we_id, ex.get('tempo'), ex.get('per_side'), ex['time_based'],
                         ex['duration_secs'], ex.get('tracking_type')))
                    order += 1
                    total_e += 1
            total_w += 1
    db.commit()
    return total_w, total_e


def run_import():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    idx = {_norm(r['name']): r['id'] for r in db.execute('SELECT id, name FROM exercises').fetchall()}
    for title, files in [('AMS | ReBuild™', REBUILD_FILES), ('AMS | Prime™', PRIME_FILES)]:
        prog = db.execute('SELECT id FROM programs WHERE title=?', (title,)).fetchone()
        if not prog:
            print(f"PROGRAM NOT FOUND: {title}")
            continue
        w, e = import_program(db, idx, prog['id'], files)
        print(f"{title} (id={prog['id']}): updated {w} workouts, {e} exercise rows")
    db.close()


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == '--dump':
        _dump(sys.argv[2])
    elif len(sys.argv) >= 2 and sys.argv[1] == '--import':
        run_import()
    else:
        print("usage: parse_ams.py [--dump <file.pdf> | --import]")
