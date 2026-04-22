#!/usr/bin/env python3
"""
One-off importer: load weekly meal planners from Exceed Nutrition
white-label recipe packs into ageless.db.

Policy:
- NEVER inserts into `recipes`. Every meal cell must match an existing recipe
  row (by exact / substring / fuzzy / progressive-prefix). Unmatched cells
  are logged and skipped.
- Inserts into `meal_plans`, `meal_plan_days`, `meal_plan_items` only.
- Skips the Vegetarian pack (recipe set is not in DB).
- Skips 'Meal Out - Enjoy!' placeholder cells.
- Snack column cells are split on commas and each alternative inserted as a
  separate sort_order item with meal_type='snack'.

Usage:
  python3 import_meal_plans.py --dry-run
  python3 import_meal_plans.py          # actually writes
"""
import sys, os, re, html, zipfile, sqlite3, unicodedata, argparse
from difflib import get_close_matches

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ageless.db")
PACK_ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "..", "nutrition", "whitelabel-recipes")

# name, pack path relative to PACK_ROOT, category tag, coach-facing title prefix
PACKS = [
    ("2403 Recipe Pack",  "2403-recipe-pack/2403 Recipe Pack.pptx",        "general",      "2403 Recipe Pack"),
    ("5-Ingredient",      "5-ingredient-pack-ppt/5-INGREDIENT RECIPE PACK.pptx", "5-ingredient", "5-Ingredient"),
    ("Gluten Free",       "Gluten Free Recipe Pack/Gluten Free Recipe Pack.pptx", "gluten-free", "Gluten Free"),
    ("High Protein",      "high-protein-ppt/HIGH PROTEIN.pptx",            "high-protein", "High Protein"),
    ("Low Carb",          "low-carb-ppt/LOW CARB.pptx",                    "low-carb",     "Low Carb"),
    ("Vegan",             "vegan-pack-ppt/vegan.pptx",                     "vegan",        "Vegan"),
    # Vegetarian intentionally skipped — recipe set not in DB.
]

# ---------- matching ----------
def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.lower().replace("&", "and")
    s = re.sub(r"^leftover\s+", "", s)
    s = re.sub(r"\s+served\s+with.*$", "", s)  # 'X Served With Rice & Veg' -> 'X'
    s = re.sub(r"\s+with\s+side\s+of\s+choice$", "", s)
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def build_matcher(conn):
    rows = list(conn.execute("SELECT id, title FROM recipes"))
    entries = [(rid, title, norm(title)) for rid, title in rows]
    norms = [e[2] for e in entries]

    def scan(cell: str):
        """For 'E.g. A, B, C' snack cells: return every recipe whose
        normalized title appears as a substring of the cell text. Longer
        titles are preferred so we don't mis-match short prefixes."""
        n = norm(re.sub(r"^e\.?g\.?\s*", "", cell, flags=re.I))
        if not n: return []
        hits = []
        # Sort by descending length so the longest recipe title gets a chance first
        for rid, title, nm in sorted(entries, key=lambda e: -len(e[2])):
            if len(nm) < 5: continue
            if nm in n:
                hits.append((rid, title, nm))
                # Remove matched span so we don't double-count substrings
                n = n.replace(nm, " ", 1)
                n = re.sub(r"\s+", " ", n).strip()
        # Preserve original order by sort_order = insertion order (already done)
        return [(h[0], h[1], "scan") for h in hits]

    def match(cell: str):
        n = norm(cell)
        if not n: return None
        if n.startswith("e g") or "meal out" in n: return None
        # 1. exact
        for rid, title, nm in entries:
            if nm == n: return (rid, title, "exact")
        # 2. substring (prefer shorter db title contained in cell, or vice versa)
        best = None
        for rid, title, nm in entries:
            if n == nm: continue
            if nm in n or n in nm:
                diff = abs(len(n) - len(nm))
                if best is None or diff < best[0]:
                    best = (diff, rid, title)
        if best and best[0] < 15:
            return (best[1], best[2], "substring")
        # 3. fuzzy
        m = get_close_matches(n, norms, n=1, cutoff=0.80)
        if m:
            for rid, title, nm in entries:
                if nm == m[0]: return (rid, title, "fuzzy")
        # 4. progressive prefix: strip trailing words
        words = n.split()
        for k in range(len(words) - 1, 2, -1):
            prefix = " ".join(words[:k])
            for rid, title, nm in entries:
                if nm == prefix: return (rid, title, f"prefix[{k}]")
            m = get_close_matches(prefix, norms, n=1, cutoff=0.85)
            if m:
                for rid, title, nm in entries:
                    if nm == m[0]: return (rid, title, f"prefix-fuzzy[{k}]")
        return None

    return match, scan

# ---------- pptx parsing ----------
def extract_tables(xml: str):
    tables = []
    for tbl_m in re.finditer(r"<a:tbl>(.*?)</a:tbl>", xml, re.DOTALL):
        tbl = tbl_m.group(1)
        rows = []
        for tr_m in re.finditer(r"<a:tr[^>]*>(.*?)</a:tr>", tbl, re.DOTALL):
            tr = tr_m.group(1)
            cells = []
            for tc_m in re.finditer(r"<a:tc[^>]*>(.*?)</a:tc>", tr, re.DOTALL):
                tc = tc_m.group(1)
                runs = re.findall(r"<a:t[^>]*>([^<]*)</a:t>", tc)
                txt = " ".join(html.unescape(r) for r in runs)
                txt = re.sub(r"\s+", " ", txt).strip()
                cells.append(txt)
            if cells: rows.append(cells)
        if rows: tables.append(rows)
    return tables

def slide_title_guess(xml: str) -> str:
    runs = re.findall(r"<a:t[^>]*>([^<]*)</a:t>", xml)
    for r in runs:
        t = html.unescape(r).strip()
        if "meal plan" in t.lower() and len(t) < 60:
            return t
    return ""

DAY_ORDER = ["mon","tue","wed","thu","fri","sat","sun"]
DAY_LABEL = {"mon":"Monday","tue":"Tuesday","wed":"Wednesday","thu":"Thursday","fri":"Friday","sat":"Saturday","sun":"Sunday"}

def find_meal_plan_tables(pptx_path):
    """Yield (slide_idx, title_guess, table_rows) for every meal-plan table."""
    with zipfile.ZipFile(pptx_path) as z:
        slides = sorted(
            [n for n in z.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml")],
            key=lambda s: int(re.search(r"slide(\d+)", s).group(1)),
        )
        for i, s in enumerate(slides):
            xml = z.read(s).decode("utf-8", "ignore")
            title = slide_title_guess(xml)
            for tbl in extract_tables(xml):
                flat = " ".join(" ".join(r) for r in tbl).lower()
                if "breakfast" in flat and any(d in flat for d in DAY_ORDER):
                    yield (i+1, title, tbl)

def parse_meal_plan_table(tbl):
    """Return dict: day -> { meal_type -> [cell_strings] } plus meal_type list."""
    header = None; hidx = -1
    for ri, row in enumerate(tbl):
        low = " ".join(c.lower() for c in row)
        if "breakfast" in low:
            header = row; hidx = ri; break
    if header is None: return None, None

    meal_types = []
    for c in header:
        cl = c.lower().strip()
        if "breakfast" in cl: meal_types.append("breakfast")
        elif "lunch" in cl:   meal_types.append("lunch")
        elif "snack" in cl:   meal_types.append("snack")
        elif "dinner" in cl:  meal_types.append("dinner")
        else:                 meal_types.append(None)

    days = {}
    for row in tbl[hidx+1:]:
        if not row: continue
        day_label = row[0].lower().strip()[:3]
        if day_label not in DAY_ORDER: continue
        meals = {}
        for ci, cell in enumerate(row):
            if ci >= len(meal_types) or meal_types[ci] is None: continue
            mt = meal_types[ci]
            if not cell.strip(): continue
            meals[mt] = [cell.strip()]  # raw cell; resolution happens later
        days[day_label] = meals
    return meal_types, days

# ---------- import ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    match_recipe, scan_recipes = build_matcher(conn)

    # Look up coach id (use first coach so meal plans show up in admin library)
    coach_row = conn.execute("SELECT id FROM users WHERE role='coach' ORDER BY id LIMIT 1").fetchone()
    coach_id = coach_row[0] if coach_row else None

    grand_matched = 0
    grand_missing = 0
    grand_plans = 0
    grand_items = 0
    missing_log = []

    for pack_name, rel, category, title_prefix in PACKS:
        full = os.path.join(PACK_ROOT, rel)
        if not os.path.exists(full):
            print(f"[skip] {pack_name}: file missing")
            continue
        print(f"\n===== {pack_name} =====")
        plan_index = 0
        for slide_idx, title_guess, tbl in find_meal_plan_tables(full):
            meal_types, days = parse_meal_plan_table(tbl)
            if not days: continue
            plan_index += 1
            # Always use a clean short title: "<Pack> Week N" (no em dashes)
            plan_title = f"{title_prefix} Week {plan_index}" if plan_index > 1 or title_guess.lower().endswith(("2","02","3","03")) else title_prefix
            # Ensure uniqueness when a pack has multiple planners
            if plan_index > 1:
                plan_title = f"{title_prefix} Week {plan_index}"
            else:
                plan_title = f"{title_prefix} Week 1"

            print(f"\n  slide {slide_idx}: {plan_title}")

            # Pre-resolve all cells
            resolved_days = {}
            local_matched = 0; local_missing = 0
            for day in DAY_ORDER:
                if day not in days: continue
                resolved_days[day] = {}
                for mt, cells in days[day].items():
                    resolved = []
                    for cell in cells:
                        if "meal out" in cell.lower():
                            continue  # skip placeholder
                        if mt == "snack":
                            hits = scan_recipes(cell)
                            if hits:
                                for rid, title, how in hits:
                                    resolved.append((cell, rid, title, how))
                                    local_matched += 1
                            else:
                                local_missing += 1
                                missing_log.append((pack_name, plan_title, day, mt, cell))
                        else:
                            m = match_recipe(cell)
                            if m:
                                resolved.append((cell, m[0], m[1], m[2]))
                                local_matched += 1
                            else:
                                local_missing += 1
                                missing_log.append((pack_name, plan_title, day, mt, cell))
                    if resolved:
                        resolved_days[day][mt] = resolved

            print(f"    matched={local_matched}  missing={local_missing}")
            grand_matched += local_matched
            grand_missing += local_missing

            if args.dry_run:
                for day in DAY_ORDER:
                    if day not in resolved_days: continue
                    for mt in ["breakfast","lunch","snack","dinner"]:
                        for cell, rid, title, how in resolved_days[day].get(mt, []):
                            print(f"      {DAY_LABEL[day]:9} {mt:9} [{how:>12}] #{rid} {title}")
                continue

            # Insert plan
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO meal_plans (title, description, category, duration_days, coach_id)
                   VALUES (?, ?, ?, 7, ?)""",
                (plan_title, f"Sample weekly planner from the {pack_name} pack.", category, coach_id),
            )
            plan_id = cur.lastrowid
            grand_plans += 1
            for day_num, day in enumerate(DAY_ORDER, start=1):
                if day not in resolved_days: continue
                cur.execute(
                    "INSERT INTO meal_plan_days (meal_plan_id, day_number, label) VALUES (?, ?, ?)",
                    (plan_id, day_num, DAY_LABEL[day]),
                )
                day_id = cur.lastrowid
                for mt in ["breakfast","lunch","snack","dinner"]:
                    for sort_idx, (cell, rid, title, how) in enumerate(resolved_days[day].get(mt, [])):
                        cur.execute(
                            """INSERT INTO meal_plan_items (day_id, meal_type, sort_order, recipe_id)
                               VALUES (?, ?, ?, ?)""",
                            (day_id, mt, sort_idx, rid),
                        )
                        grand_items += 1
            conn.commit()

    print(f"\n=========================================")
    print(f"TOTAL matched cells:  {grand_matched}")
    print(f"TOTAL unmatched:      {grand_missing}")
    if missing_log:
        print(f"\nUnmatched cells:")
        for pack_name, plan_title, day, mt, cell in missing_log:
            print(f"  [{pack_name}] {plan_title} / {day} / {mt}: {cell!r}")
    if args.dry_run:
        print(f"\n(dry-run: no rows inserted)")
    else:
        print(f"\nInserted plans: {grand_plans}")
        print(f"Inserted items: {grand_items}")

if __name__ == "__main__":
    main()
