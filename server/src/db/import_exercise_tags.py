#!/usr/bin/env python3
"""Import coach-side reference metadata onto exercises from the Video Database CSV.

Adds (idempotently) tags / exercise_type / tracking_field / per_side_info columns
to the exercises table and populates them by matching CSV rows to exercises by
normalized name. Also backfills body_part / equipment only when currently empty.

Coach-side reference only - nothing client-facing changes.

Usage:  python3 import_exercise_tags.py            (import)
        python3 import_exercise_tags.py --dry       (report match rate, no writes)
"""
import csv, sqlite3, re, sys, os, shutil, time

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
DB = os.path.join(ROOT, 'data', 'ageless.db')
CSV = os.path.join(ROOT, '..', '..', 'Video Database - Exercise Database (2).csv')
DRY = '--dry' in sys.argv

def norm(s):
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', (s or '').lower())).strip()

# ---- load CSV ----
csvmap = {}
with open(CSV) as f:
    for r in csv.DictReader(f):
        nm = norm(r.get('Exercise Display / Reference Name ', ''))
        if not nm:
            continue
        clean = lambda v: (v or '').strip() if (v or '').strip().lower() not in ('', 'none') else None
        # column names match what the coach ExerciseLibrary UI already reads
        csvmap[nm] = {
            'target_area': clean(r.get('Tags / Target Areas')),
            'exercise_type': clean(r.get('Type')),
            'tracking_fields': clean(r.get('Tracking Fields')),
            'per_side': clean(r.get('Per Side Info')),
            'muscles': clean(r.get('Muscle Groups')),
            'equip': clean(r.get('Equipment')),
        }

db = sqlite3.connect(DB)
cols = {c[1] for c in db.execute('PRAGMA table_info(exercises)').fetchall()}
# drop any wrongly-named columns from an earlier run (SQLite >= 3.35)
for bad in ('tags', 'tracking_field', 'per_side_info'):
    if bad in cols and not DRY:
        try:
            db.execute(f'ALTER TABLE exercises DROP COLUMN {bad}')
            cols.discard(bad)
        except Exception as e:
            print(f'(could not drop {bad}: {e})')
for col in ('target_area', 'exercise_type', 'tracking_fields', 'per_side'):
    if col not in cols:
        if DRY:
            print(f'[dry] would ADD COLUMN {col}')
        else:
            db.execute(f'ALTER TABLE exercises ADD COLUMN {col} TEXT')

if not DRY:
    db.commit()
    bak = DB + '.reliable-' + str(int(time.time()))
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    shutil.copyfile(DB, bak)
    print('backup:', os.path.basename(bak))

ex = db.execute('SELECT id, name, body_part, equipment FROM exercises').fetchall()
matched = updated = backfill_bp = backfill_eq = 0
for eid, name, bp, eq in ex:
    m = csvmap.get(norm(name))
    if not m:
        continue
    matched += 1
    if DRY:
        continue
    db.execute(
        'UPDATE exercises SET target_area=?, exercise_type=?, tracking_fields=?, per_side=? WHERE id=?',
        (m['target_area'], m['exercise_type'], m['tracking_fields'], m['per_side'], eid),
    )
    if (not bp or not bp.strip()) and m['muscles']:
        db.execute('UPDATE exercises SET body_part=? WHERE id=?', (m['muscles'], eid)); backfill_bp += 1
    if (not eq or not eq.strip()) and m['equip']:
        db.execute('UPDATE exercises SET equipment=? WHERE id=?', (m['equip'], eid)); backfill_eq += 1
    updated += 1

if not DRY:
    db.commit()
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
print(f'CSV rows: {len(csvmap)} | DB exercises: {len(ex)} | matched: {matched} | '
      f'{"(dry run)" if DRY else f"updated: {updated}, body_part backfilled: {backfill_bp}, equipment backfilled: {backfill_eq}"}')
db.close()
