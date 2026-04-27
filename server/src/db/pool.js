import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'data', 'ageless.db');

// Ensure data directory exists
import fs from 'fs';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('coach', 'client')),
    avatar_url TEXT,
    coach_id INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS client_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    active_program_id INTEGER,
    active_meal_plan_id INTEGER,
    calorie_target INTEGER DEFAULT 2200,
    protein_target INTEGER DEFAULT 163,
    fat_target INTEGER DEFAULT 167,
    carbs_target INTEGER DEFAULT 10,
    water_target INTEGER DEFAULT 2500,
    step_target INTEGER DEFAULT 6000,
    weight_unit TEXT DEFAULT 'kg',
    height_unit TEXT DEFAULT 'cm',
    appearance TEXT DEFAULT 'dark',
    profile_image_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS coach_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    membership_tier TEXT DEFAULT 'Elite',
    company_name TEXT,
    bio TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_id INTEGER REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    duration_weeks INTEGER DEFAULT 8,
    workouts_per_week INTEGER DEFAULT 6,
    min_duration TEXT DEFAULT '13 mins',
    max_duration TEXT DEFAULT '28 mins',
    image_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS program_phases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
    phase_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    weeks INTEGER DEFAULT 4
  );

  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER REFERENCES programs(id),
    phase_id INTEGER REFERENCES program_phases(id),
    week_number INTEGER DEFAULT 1,
    day_number INTEGER DEFAULT 1,
    title TEXT NOT NULL,
    description TEXT,
    duration_mins INTEGER,
    intensity TEXT DEFAULT 'Medium',
    body_parts TEXT,
    equipment TEXT,
    workout_type TEXT DEFAULT 'strength',
    image_url TEXT,
    video_url TEXT,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    display_name TEXT,
    description TEXT,
    demo_video_url TEXT,
    thumbnail_url TEXT,
    exercise_type TEXT DEFAULT 'Strength',
    tracking_fields TEXT DEFAULT 'Repetitions with Weight',
    per_side TEXT DEFAULT 'None',
    body_part TEXT,
    equipment TEXT,
    target_area TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workout_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id INTEGER REFERENCES workouts(id) ON DELETE CASCADE,
    exercise_id INTEGER REFERENCES exercises(id),
    order_index INTEGER DEFAULT 0,
    sets INTEGER DEFAULT 3,
    reps TEXT DEFAULT '10',
    duration_secs INTEGER,
    rest_secs INTEGER DEFAULT 30,
    group_type TEXT,
    group_label TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS workout_exercise_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_exercise_id INTEGER UNIQUE REFERENCES workout_exercises(id) ON DELETE CASCADE,
    tempo TEXT,
    rir INTEGER,
    rpe INTEGER,
    per_side INTEGER DEFAULT 0,
    modality TEXT,
    training_type TEXT,
    time_based INTEGER DEFAULT 0,
    duration_secs INTEGER
  );

  CREATE TABLE IF NOT EXISTS exercise_alternatives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER REFERENCES exercises(id),
    alternative_id INTEGER REFERENCES exercises(id),
    reps TEXT
  );

  CREATE TABLE IF NOT EXISTS workout_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    workout_id INTEGER REFERENCES workouts(id),
    date TEXT NOT NULL,
    duration_mins INTEGER,
    completed INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exercise_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_log_id INTEGER REFERENCES workout_logs(id) ON DELETE CASCADE,
    exercise_id INTEGER REFERENCES exercises(id),
    set_number INTEGER,
    reps INTEGER,
    weight REAL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS nutrition_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    date TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    food_name TEXT NOT NULL,
    calories INTEGER DEFAULT 0,
    protein REAL DEFAULT 0,
    fat REAL DEFAULT 0,
    carbs REAL DEFAULT 0,
    serving_size TEXT,
    photo_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS water_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    date TEXT NOT NULL,
    amount_ml INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS step_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    date TEXT NOT NULL,
    steps INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_id INTEGER REFERENCES users(id),
    client_id INTEGER REFERENCES users(id),
    label TEXT NOT NULL,
    recurring INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(task_id, user_id, date)
  );

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    title TEXT NOT NULL,
    target TEXT,
    category TEXT DEFAULT 'General',
    progress INTEGER DEFAULT 0,
    achieved INTEGER DEFAULT 0,
    achieved_date TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS streaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE REFERENCES users(id),
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    last_activity_date TEXT
  );

  CREATE TABLE IF NOT EXISTS client_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    program_id INTEGER REFERENCES programs(id),
    current_week INTEGER DEFAULT 1,
    current_day INTEGER DEFAULT 1,
    started_at TEXT DEFAULT (datetime('now')),
    completed_workouts INTEGER DEFAULT 0,
    total_workouts INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
    title TEXT,
    icon TEXT,
    icon_bg TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversation_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    joined_at TEXT DEFAULT (datetime('now')),
    UNIQUE(conversation_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES users(id),
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    attachment_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    coach_id INTEGER REFERENCES users(id),
    date TEXT NOT NULL,
    photo_front_url TEXT,
    photo_side_url TEXT,
    photo_back_url TEXT,
    weight REAL,
    body_fat REAL,
    recovery_score REAL,
    sleep_hours REAL,
    stress_level INTEGER,
    waist REAL,
    notes TEXT,
    answers TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action_type TEXT NOT NULL,
    description TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    ref_name TEXT,
    description TEXT,
    category TEXT DEFAULT 'General',
    thumbnail_url TEXT,
    calories INTEGER DEFAULT 0,
    protein REAL DEFAULT 0,
    fat REAL DEFAULT 0,
    carbs REAL DEFAULT 0,
    serving_size TEXT,
    serving_unit TEXT,
    ingredients TEXT,
    instructions TEXT,
    tags TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    price_label TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS explore_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    section_type TEXT DEFAULT 'carousel' CHECK (section_type IN ('carousel', 'featured', 'grid')),
    layout TEXT DEFAULT 'square' CHECK (layout IN ('square', 'wide', 'tall', 'circular')),
    tile_size TEXT DEFAULT 'medium',
    sort_order INTEGER DEFAULT 0,
    visible INTEGER DEFAULT 1,
    min_tier_id INTEGER DEFAULT 1 REFERENCES tiers(id),
    parent_tab TEXT DEFAULT 'fitness' CHECK (parent_tab IN ('fitness', 'nutrition', 'resources')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS explore_section_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER REFERENCES explore_sections(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('program', 'workout', 'course')),
    item_id INTEGER NOT NULL,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    image_url TEXT,
    difficulty TEXT DEFAULT 'All Levels',
    duration TEXT,
    modules INTEGER DEFAULT 0,
    lessons INTEGER DEFAULT 0,
    tier_id INTEGER DEFAULT 1 REFERENCES tiers(id),
    visible INTEGER DEFAULT 1,
    featured INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS course_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    lessons INTEGER DEFAULT 0,
    duration TEXT,
    status TEXT DEFAULT 'published',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS course_lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_id INTEGER NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    video_url TEXT,
    video_thumbnail TEXT,
    thumbnail_url TEXT,
    duration TEXT,
    status TEXT DEFAULT 'published',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lesson_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id INTEGER NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    url TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS favourites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    item_type TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    item_title TEXT,
    item_meta TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, item_type, item_id)
  );

  -- Coach "Meet the Team" + 1:1 booking ---------------------------------------
  CREATE TABLE IF NOT EXISTS coach_session_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS coach_availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weekday INTEGER NOT NULL,  -- 0=Sun, 6=Sat
    start_time TEXT NOT NULL,  -- HH:MM 24h
    end_time TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Pricing tiers for 1:1 coaching (Standard / Premium / Elite).
  -- Each coach is assigned to one tier, and tier changes cascade to their
  -- 30/60 minute session_types prices. Distinct from the content tiers table.
  CREATE TABLE IF NOT EXISTS coach_pricing_tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price_30min_cents INTEGER NOT NULL DEFAULT 5500,
    price_60min_cents INTEGER NOT NULL DEFAULT 9700,
    currency TEXT NOT NULL DEFAULT 'USD',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS coach_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_type_id INTEGER REFERENCES coach_session_types(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    event_format TEXT NOT NULL DEFAULT 'masterclass'
      CHECK (event_format IN ('webinar','masterclass','follow_along','in_person','workshop')),
    scheduled_at TEXT NOT NULL,
    end_at TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    location TEXT,
    meeting_url TEXT,
    capacity INTEGER,
    price_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    thumbnail_url TEXT,
    status TEXT NOT NULL DEFAULT 'published'
      CHECK (status IN ('draft','published','cancelled','completed')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS coach_event_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES coach_events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'registered'
      CHECK (status IN ('registered','cancelled','attended')),
    registered_at TEXT DEFAULT (datetime('now')),
    UNIQUE(event_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS coach_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_type_id INTEGER REFERENCES coach_session_types(id) ON DELETE SET NULL,
    scheduled_at TEXT NOT NULL,       -- ISO timestamp
    duration_minutes INTEGER NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','confirmed','completed','cancelled','no_show')),
    payment_status TEXT NOT NULL DEFAULT 'unpaid'
      CHECK (payment_status IN ('unpaid','paid','refunded','free','stub')),
    payment_ref TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Coach-authored in-app notifications. One row per notification definition;
  -- the client Home polls for ones that are currently within [starts_at,
  -- ends_at], haven't been dismissed by this user, and match the audience
  -- filter. kind=daily_checkin pops a habit form whose submit writes a
  -- habit_entries row and marks notification_reads.completed_at.
  CREATE TABLE IF NOT EXISTS in_app_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'announcement'
      CHECK (kind IN ('announcement','offer','challenge','daily_checkin','custom')),
    title TEXT NOT NULL,
    body TEXT,
    cta_label TEXT,
    cta_url TEXT,
    audience TEXT NOT NULL DEFAULT 'all'
      CHECK (audience IN ('all','tier')),
    audience_tier_id INTEGER,
    starts_at TEXT,
    ends_at TEXT,
    recurrence TEXT NOT NULL DEFAULT 'none'
      CHECK (recurrence IN ('none','daily','weekly')),
    active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Per-user, per-notification read state. For recurring (daily) notifications
  -- we key the read row by notification_id + user_id + occurrence_date so the
  -- popup re-fires each day even after a dismiss.
  CREATE TABLE IF NOT EXISTS notification_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notification_id INTEGER NOT NULL REFERENCES in_app_notifications(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    occurrence_date TEXT,  -- YYYY-MM-DD for recurring; NULL for one-shot
    seen_at TEXT,
    dismissed_at TEXT,
    completed_at TEXT,
    UNIQUE(notification_id, user_id, occurrence_date)
  );

  -- Daily habit entries written by the daily_checkin popup.
  CREATE TABLE IF NOT EXISTS habit_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    sleep_hours REAL,
    alcohol_units REAL,
    meditation_minutes INTEGER,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, date)
  );

  CREATE TABLE IF NOT EXISTS app_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rating INTEGER,
    message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS message_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(message_id, user_id, emoji)
  );
  CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);

  -- Benchmarks / Levels: users test against category benchmarks (Creature-style
  -- level ladders). Some benchmarks require a coach-reviewed video before
  -- the attempt counts on leaderboards. Separate from the social challenges
  -- table (which is for coach-created team challenges).
  CREATE TABLE IF NOT EXISTS benchmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,                  -- 'BURN','FLEX','LIFT','MOVE','NUTRITION','SLEEP'
    subcategory TEXT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    unit TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'higher'
      CHECK (direction IN ('higher','lower')),
    type TEXT NOT NULL DEFAULT 'numeric'     -- 'numeric' or 'skill_ladder'
      CHECK (type IN ('numeric','skill_ladder')),
    requires_video INTEGER NOT NULL DEFAULT 0,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    visible INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_benchmarks_category ON benchmarks(category, sort_order);

  CREATE TABLE IF NOT EXISTS benchmark_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    benchmark_id INTEGER NOT NULL REFERENCES benchmarks(id) ON DELETE CASCADE,
    level_number INTEGER NOT NULL,
    title TEXT,
    description TEXT,
    male_threshold REAL,
    female_threshold REAL,
    UNIQUE(benchmark_id, level_number)
  );

  CREATE TABLE IF NOT EXISTS benchmark_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    benchmark_id INTEGER NOT NULL REFERENCES benchmarks(id) ON DELETE CASCADE,
    value REAL NOT NULL,
    notes TEXT,
    video_url TEXT,
    status TEXT NOT NULL DEFAULT 'self_reported'
      CHECK (status IN ('self_reported','pending_review','verified','rejected')),
    reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TEXT,
    review_note TEXT,
    submitted_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_benchmark_attempts_status ON benchmark_attempts(benchmark_id, status);
  CREATE INDEX IF NOT EXISTS idx_benchmark_attempts_user ON benchmark_attempts(user_id, benchmark_id);

  -- One row per (supplement, date) when the client marks it taken.
  CREATE TABLE IF NOT EXISTS supplement_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    supplement_id INTEGER NOT NULL REFERENCES supplements(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    taken_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, supplement_id, date)
  );
  CREATE INDEX IF NOT EXISTS idx_supplement_logs_user_date ON supplement_logs(user_id, date);
`);

// Add columns to existing tables (safe - SQLite ignores if already exists)
const alterStatements = [
  // Supplements: section/display grouping + sort order + optional notes per supp.
  "ALTER TABLE supplements ADD COLUMN section TEXT",        // e.g. "Upon Waking", "After Breakfast"
  "ALTER TABLE supplements ADD COLUMN section_order INTEGER DEFAULT 0",
  "ALTER TABLE supplements ADD COLUMN sort_order INTEGER DEFAULT 0",
  "ALTER TABLE supplements ADD COLUMN notes TEXT",
  "ALTER TABLE supplements ADD COLUMN is_client_added INTEGER DEFAULT 0",
  // Group chat access control + read-only announcement mode.
  // visibility: 'invite_only' (explicit members), 'active_clients' (paid tier),
  // 'all_clients' (anyone logged in). chat_enabled=0 renders the CTA instead
  // of the message input.
  "ALTER TABLE conversations ADD COLUMN visibility TEXT DEFAULT 'invite_only'",
  "ALTER TABLE conversations ADD COLUMN chat_enabled INTEGER DEFAULT 1",
  "ALTER TABLE conversations ADD COLUMN cta_label TEXT",
  "ALTER TABLE conversations ADD COLUMN cta_url TEXT",
  // Group metadata (matches FitBudd-style group editor)
  "ALTER TABLE conversations ADD COLUMN description TEXT",
  "ALTER TABLE conversations ADD COLUMN image_url TEXT",
  "ALTER TABLE conversations ADD COLUMN reference_name TEXT",
  "ALTER TABLE conversations ADD COLUMN mute_new_members INTEGER DEFAULT 0",
  "ALTER TABLE conversations ADD COLUMN access_tier_ids TEXT",  // JSON array when visibility='specific_tiers'
  // Tier features list — one bullet per line, shown on the TiersModal
  // comparison card when a client taps a locked Explore item.
  "ALTER TABLE tiers ADD COLUMN features TEXT",
  // Tier upgrade CTA — 'message_coach' (default, routes to team inbox)
  // or 'booking_link' (opens cta_url, e.g. Systemations call-booking link
  // for the VIP tier where a call is required before onboarding).
  "ALTER TABLE tiers ADD COLUMN cta_type TEXT DEFAULT 'message_coach'",
  "ALTER TABLE tiers ADD COLUMN cta_url TEXT",
  "ALTER TABLE tiers ADD COLUMN cta_label TEXT",
  // Distinguish numeric leaderboard challenges from skill-ladder progressions
  // where each level is a distinct demonstrable skill (not a single threshold).
  "ALTER TABLE programs ADD COLUMN visible INTEGER DEFAULT 1",
  "ALTER TABLE programs ADD COLUMN tier_id INTEGER DEFAULT 1",
  "ALTER TABLE programs ADD COLUMN featured INTEGER DEFAULT 0",
  "ALTER TABLE workouts ADD COLUMN visible INTEGER DEFAULT 1",
  "ALTER TABLE workouts ADD COLUMN tier_id INTEGER DEFAULT 1",
  "ALTER TABLE client_profiles ADD COLUMN tier_id INTEGER DEFAULT 1",
  "ALTER TABLE course_modules ADD COLUMN status TEXT DEFAULT 'published'",
  "ALTER TABLE workout_exercise_meta ADD COLUMN tracking_type TEXT DEFAULT 'reps'",
  "ALTER TABLE workout_exercise_meta ADD COLUMN setwise_variation TEXT DEFAULT 'fixed'",
  "ALTER TABLE workout_exercise_meta ADD COLUMN secondary_tracking INTEGER DEFAULT 0",
  // coach_profiles — expanded for Meet the Team
  "ALTER TABLE coach_profiles ADD COLUMN photo_url TEXT",
  "ALTER TABLE coach_profiles ADD COLUMN headline TEXT",
  "ALTER TABLE coach_profiles ADD COLUMN specialties TEXT",
  "ALTER TABLE coach_profiles ADD COLUMN years_experience INTEGER",
  "ALTER TABLE coach_profiles ADD COLUMN qualifications TEXT",
  "ALTER TABLE coach_profiles ADD COLUMN is_public INTEGER DEFAULT 1",
  "ALTER TABLE coach_profiles ADD COLUMN sort_order INTEGER DEFAULT 0",
  // Expanded profile fields to match the PDF marketing collateral
  "ALTER TABLE coach_profiles ADD COLUMN tagline TEXT",
  "ALTER TABLE coach_profiles ADD COLUMN accent_color TEXT DEFAULT '#FF8C00'",
  "ALTER TABLE coach_profiles ADD COLUMN origin_story TEXT",
  "ALTER TABLE coach_profiles ADD COLUMN pull_quote TEXT",
  "ALTER TABLE coach_profiles ADD COLUMN help_bullets TEXT",   // JSON array
  "ALTER TABLE coach_profiles ADD COLUMN social_links TEXT",   // JSON object
  // 1:1 coaching pricing tier assignment
  "ALTER TABLE coach_profiles ADD COLUMN pricing_tier_id INTEGER",
  // Event format on session types so the same surface can cover 1:1s,
  // webinars, masterclasses, follow-along classes, and in-person events.
  "ALTER TABLE coach_session_types ADD COLUMN event_format TEXT DEFAULT 'one_on_one'",
  "ALTER TABLE coach_session_types ADD COLUMN location TEXT",
  "ALTER TABLE coach_session_types ADD COLUMN capacity INTEGER",
  // Cover image for group classes / events (webinars, masterclasses,
  // follow-alongs, in-person). Also usable for 1:1 cards.
  "ALTER TABLE coach_session_types ADD COLUMN thumbnail_url TEXT",
  // Meeting link (Zoom, Riverside, Google Meet) for online events
  "ALTER TABLE coach_session_types ADD COLUMN meeting_url TEXT",
  // Demographics on client_profiles so the coach client list + onboarding
  // can filter / segment by age and gender.
  "ALTER TABLE client_profiles ADD COLUMN age INTEGER",
  "ALTER TABLE client_profiles ADD COLUMN gender TEXT",
  "ALTER TABLE client_profiles ADD COLUMN location TEXT",
  // Client account lifecycle: active = normal, paused = billing/break banner,
  // archived = hidden from coach list by default, client sees "ended" message.
  // Added 2026-04-19 for the ClientProfile Settings tab.
  "ALTER TABLE client_profiles ADD COLUMN status TEXT DEFAULT 'active'",
  "ALTER TABLE client_profiles ADD COLUMN status_changed_at TEXT",
  "ALTER TABLE client_profiles ADD COLUMN status_note TEXT",
  "ALTER TABLE workouts ADD COLUMN video_url TEXT",
  // Interval/phase prescription for cardio and complex strength blocks.
  // JSON array of {label, duration_secs, intensity, zone, notes} objects.
  // NULL → fall back to simple sets/duration/rest. Non-NULL → the client
  // workout player steps through phases in order with its own timer.
  // Covers uniform intervals, pyramids, alternating intensities, fartlek,
  // and straight steady state as degenerate cases.
  "ALTER TABLE workout_exercises ADD COLUMN interval_structure TEXT",
  // Per-alternative metric overrides. When a client swaps to an alt, the
  // workout player reads these; NULL falls back to the primary's values.
  "ALTER TABLE workout_exercise_alternates ADD COLUMN sets INTEGER",
  "ALTER TABLE workout_exercise_alternates ADD COLUMN reps TEXT",
  "ALTER TABLE workout_exercise_alternates ADD COLUMN duration_secs INTEGER",
  "ALTER TABLE workout_exercise_alternates ADD COLUMN rest_secs INTEGER",
  "ALTER TABLE workout_exercise_alternates ADD COLUMN tracking_type TEXT",
  "ALTER TABLE workout_exercise_alternates ADD COLUMN notes TEXT",
  "ALTER TABLE workout_exercise_alternates ADD COLUMN interval_structure TEXT",
  // What the coach prescribed vs what the client actually did — so coach
  // can see the delta ("prescribed 40 min, client did 25"). NULL means
  // client did not customize; treat actual = prescribed.
  "ALTER TABLE workout_logs ADD COLUMN prescribed_duration_mins INTEGER",
  "ALTER TABLE workout_logs ADD COLUMN customized INTEGER DEFAULT 0",
  "ALTER TABLE workouts ADD COLUMN status TEXT DEFAULT 'draft'",
  // Free-preview flag on workouts: when set, Free-tier (tier_id=1) clients
  // can access this workout even if its parent program is tier-locked.
  // Used for the free-signup onboarding (Day 1 of Ground Zero + future
  // lead-magnet programs).
  "ALTER TABLE workouts ADD COLUMN is_free_preview INTEGER DEFAULT 0",
  // Tier the client picked during onboarding (before payment lands). The
  // active tier stays in client_profiles.tier_id; this column records intent
  // so the coach can see "chose Prime, awaiting payment" in the admin.
  "ALTER TABLE client_profiles ADD COLUMN tier_requested_id INTEGER",
  // Per-user targeting on notifications: used by the post-signup "Explore
  // Plans" nudge that fires 24h after a client registers. audience='user'
  // with audience_user_id=<client id> means only that client sees it.
  // NOTE: the table's CHECK (audience IN ('all','tier')) is relaxed below
  // via a rebuild block because SQLite can't ALTER a CHECK constraint.
  "ALTER TABLE in_app_notifications ADD COLUMN audience_user_id INTEGER",
  // Deferred post-signup tasks (welcome DM, plans nudge, etc.). A small
  // in-process scheduler polls this table every minute and dispatches tasks
  // whose due_at has passed. Persistence guarantees restarts don't lose
  // pending tasks. sent_at NULL = pending; non-null = done.
  `CREATE TABLE IF NOT EXISTS post_signup_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL,
    due_at TEXT NOT NULL,
    sent_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  "CREATE INDEX IF NOT EXISTS post_signup_tasks_due_idx ON post_signup_tasks(due_at, sent_at)",
  // Workout reschedule overrides: lets clients move program workouts to
  // different days. Two modes:
  //   permanent=0  one-off override for a specific original_date only
  //   permanent=1  all future instances of that workout move to new_day_number
  `CREATE TABLE IF NOT EXISTS workout_reschedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    original_date TEXT,
    new_date TEXT,
    new_day_number INTEGER,
    permanent INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // Rest days — user marks a day as an intentional rest day
  `CREATE TABLE IF NOT EXISTS user_rest_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, date)
  )`,

  // Password reset tokens (coach-initiated reset for a client). For local
  // dev the URL is shown back to the coach. Once SMTP is wired the send goes
  // to the client directly. See project_pre_launch_checklist.md.
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // Course lesson completions — one row per (user, lesson) once a client
  // marks a lesson complete. Module + course completion is derived from
  // counting rows. Unique constraint prevents double-counting.
  `CREATE TABLE IF NOT EXISTS user_lesson_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id INTEGER NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, lesson_id)
  )`,

  // Per-client workout overrides (personalisations). When a coach edits a
  // workout for a specific client instead of the master template, a row is
  // created here. The `exercises_json` column stores the FULL effective
  // exercise list for this client — a snapshot, not a diff. If present,
  // the client read path renders this instead of the template's exercises.
  //
  // Workout-level fields (title, duration, intensity, etc) can also be
  // overridden via the JSON blob (stored under key `meta`).
  //
  // See project_edit_scope_choice.md for the design discussion.
  `CREATE TABLE IF NOT EXISTS user_workout_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercises_json TEXT NOT NULL,
    meta_json TEXT,
    coach_note TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, workout_id)
  )`,
];

// Onboarding answers — persists the questionnaire that used to live only in
// localStorage. One row per client (user_id unique). JSON blob for flexible
// future fields, with a few first-class columns for easy querying.
db.exec(`
  CREATE TABLE IF NOT EXISTS onboarding_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    goal TEXT,
    experience TEXT,
    injuries TEXT,
    schedule TEXT,
    equipment TEXT,
    dietary TEXT,
    sleep TEXT,
    anything_else TEXT,
    answers_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
for (const sql of alterStatements) {
  try { db.exec(sql); } catch (e) { /* column already exists */ }
}

// Relax the in_app_notifications.audience CHECK constraint so it accepts
// 'user' (per-user nudges like the 24h post-signup plans banner). SQLite
// can't ALTER a CHECK, so we detect the old constraint by inspecting
// sqlite_master and rebuild the table only when needed. Idempotent:
// subsequent boots see the relaxed CHECK and skip the block.
try {
  const notifSql = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='in_app_notifications'"
  ).get()?.sql || '';
  const needsRebuild = notifSql.includes("CHECK (audience IN ('all','tier'))");
  if (needsRebuild) {
    db.exec('BEGIN');
    db.exec(`
      CREATE TABLE in_app_notifications_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL DEFAULT 'announcement'
          CHECK (kind IN ('announcement','offer','challenge','daily_checkin','custom')),
        title TEXT NOT NULL,
        body TEXT,
        cta_label TEXT,
        cta_url TEXT,
        audience TEXT NOT NULL DEFAULT 'all'
          CHECK (audience IN ('all','tier','user')),
        audience_tier_id INTEGER,
        audience_user_id INTEGER,
        starts_at TEXT,
        ends_at TEXT,
        recurrence TEXT NOT NULL DEFAULT 'none'
          CHECK (recurrence IN ('none','daily','weekly')),
        active INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
    db.exec(`
      INSERT INTO in_app_notifications_new
        (id, kind, title, body, cta_label, cta_url, audience, audience_tier_id,
         audience_user_id, starts_at, ends_at, recurrence, active, created_by,
         created_at, updated_at)
      SELECT id, kind, title, body, cta_label, cta_url, audience, audience_tier_id,
             audience_user_id, starts_at, ends_at, recurrence, active, created_by,
             created_at, updated_at
      FROM in_app_notifications
    `);
    db.exec('DROP TABLE in_app_notifications');
    db.exec('ALTER TABLE in_app_notifications_new RENAME TO in_app_notifications');
    db.exec('COMMIT');
    console.log("Relaxed in_app_notifications.audience CHECK to allow 'user'");
  }
} catch (e) {
  try { db.exec('ROLLBACK'); } catch {}
  console.warn('in_app_notifications rebuild skipped:', e.message);
}

// =====================================================================
// Recipe → MealPlan → MealSchedule three-tier refactor
// =====================================================================
// Terminology:
//   Recipe        = one meal (atomic, 329 rows already seeded)
//   Meal Plan     = one structured day (breakfast / lunch / dinner / snack),
//                   reusable across schedules, with OR alternatives per slot
//   Meal Schedule = an ordered timeline of meal plans (1 week repeating,
//                   or a 12-week program), assignable to clients with a
//                   per-client calorie target override
//
// This block runs ONCE, gated by the presence of the `meal_schedules` table.
// It takes the flat meal_plans / meal_plan_days / meal_plan_items structure
// and lifts each day into a reusable meal_plans row, repointing items and
// creating a meal_schedule_entries join.
try {
  const alreadyMigrated = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='meal_schedules'",
  ).get();

  if (!alreadyMigrated) {
    console.log('Running three-tier meal plan migration...');
    db.pragma('foreign_keys = OFF');

    const migrate = db.transaction(() => {
      // 1. New meal_schedules table — the timeline wrapper (renamed from old meal_plans)
      db.exec(`
        CREATE TABLE meal_schedules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          coach_id INTEGER REFERENCES users(id),
          title TEXT NOT NULL,
          description TEXT,
          image_url TEXT,
          category TEXT,
          schedule_type TEXT DEFAULT 'recipe_pack',
          duration_weeks INTEGER DEFAULT 1,
          duration_days INTEGER DEFAULT 7,
          repeating INTEGER DEFAULT 0,
          calorie_target_min INTEGER,
          calorie_target_max INTEGER,
          protein_target INTEGER,
          fat_target INTEGER,
          carbs_target INTEGER,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // 2. Copy existing meal_plans rows into meal_schedules
      const oldPlans = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meal_plans'").get();
      if (oldPlans) {
        db.exec(`
          INSERT INTO meal_schedules
            (id, coach_id, title, description, image_url, category,
             duration_days, calorie_target_min, protein_target, fat_target, carbs_target, created_at)
          SELECT id, coach_id, title, description, image_url, category,
                 duration_days, calorie_target, protein_target, fat_target, carbs_target, created_at
          FROM meal_plans
        `);
      }

      // 3. New reusable meal_plans table (one structured day per row)
      db.exec(`
        CREATE TABLE meal_plans_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          coach_id INTEGER REFERENCES users(id),
          title TEXT NOT NULL,
          description TEXT,
          thumbnail_url TEXT,
          category TEXT,
          target_calories INTEGER,
          target_protein INTEGER,
          target_fat INTEGER,
          target_carbs INTEGER,
          tags TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // 4. Create schedule → meal_plan join table
      db.exec(`
        CREATE TABLE meal_schedule_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          schedule_id INTEGER NOT NULL REFERENCES meal_schedules(id) ON DELETE CASCADE,
          week_number INTEGER NOT NULL DEFAULT 1,
          day_number INTEGER NOT NULL,
          meal_plan_id INTEGER REFERENCES meal_plans_new(id) ON DELETE SET NULL,
          UNIQUE(schedule_id, week_number, day_number)
        )
      `);

      // 5. New meal_plan_items table with alternative_group support
      db.exec(`
        CREATE TABLE meal_plan_items_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          meal_plan_id INTEGER NOT NULL REFERENCES meal_plans_new(id) ON DELETE CASCADE,
          meal_type TEXT NOT NULL,
          sort_order INTEGER DEFAULT 0,
          alternative_group INTEGER DEFAULT 0,
          recipe_id INTEGER REFERENCES recipes(id),
          custom_name TEXT,
          calories INTEGER DEFAULT 0,
          protein REAL DEFAULT 0,
          fat REAL DEFAULT 0,
          carbs REAL DEFAULT 0,
          serving_qty REAL DEFAULT 1,
          serving_unit TEXT
        )
      `);

      // 6. Migrate old meal_plan_days → each day becomes a reusable meal_plans_new row
      const oldDays = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meal_plan_days'").get();
      const dayMap = {}; // old day_id -> new meal_plan_id
      if (oldDays) {
        const days = db.prepare(`
          SELECT d.id as day_id, d.meal_plan_id as schedule_id, d.day_number, d.label,
                 s.title as schedule_title, s.coach_id, s.category
          FROM meal_plan_days d
          LEFT JOIN meal_schedules s ON s.id = d.meal_plan_id
          ORDER BY d.meal_plan_id, d.day_number
        `).all();

        const insertMealPlan = db.prepare(`
          INSERT INTO meal_plans_new
            (coach_id, title, description, category, target_calories, target_protein, target_fat, target_carbs)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertEntry = db.prepare(`
          INSERT INTO meal_schedule_entries (schedule_id, week_number, day_number, meal_plan_id)
          VALUES (?, 1, ?, ?)
        `);

        for (const d of days) {
          // Roll up macros from the existing items on this day
          const totals = db.prepare(`
            SELECT COALESCE(SUM(calories), 0) as cal,
                   COALESCE(SUM(protein), 0) as p,
                   COALESCE(SUM(fat), 0) as f,
                   COALESCE(SUM(carbs), 0) as c
            FROM meal_plan_items WHERE day_id = ?
          `).get(d.day_id);

          const title = d.label || `${d.schedule_title || 'Day'} - Day ${d.day_number}`;
          const info = insertMealPlan.run(
            d.coach_id || null,
            title,
            null,
            d.category || null,
            Math.round(totals.cal || 0),
            Math.round(totals.p || 0),
            Math.round(totals.f || 0),
            Math.round(totals.c || 0),
          );
          dayMap[d.day_id] = info.lastInsertRowid;
          if (d.schedule_id) {
            insertEntry.run(d.schedule_id, d.day_number, info.lastInsertRowid);
          }
        }

        // 7. Migrate meal_plan_items → meal_plan_items_new with repointed meal_plan_id
        const items = db.prepare('SELECT * FROM meal_plan_items').all();
        const insertItem = db.prepare(`
          INSERT INTO meal_plan_items_new
            (meal_plan_id, meal_type, sort_order, alternative_group,
             recipe_id, custom_name, calories, protein, fat, carbs, serving_qty)
          VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const it of items) {
          const newId = dayMap[it.day_id];
          if (newId) {
            insertItem.run(
              newId, it.meal_type, it.sort_order || 0,
              it.recipe_id, it.custom_name,
              it.calories || 0, it.protein || 0, it.fat || 0, it.carbs || 0,
              it.serving_qty || 1,
            );
          }
        }
        console.log(`  migrated ${days.length} days + ${items.length} items`);

        // 7b. Roll up macros from the JOINED recipes. The legacy items table had
        //     per-item calorie/protein/etc columns but they were mostly empty —
        //     the real data lives on recipes. Summing via JOIN gives us accurate
        //     meal_plans.target_* values we can use for calorie scaling.
        const planIds = db.prepare('SELECT id FROM meal_plans_new').all();
        const rollupUpdate = db.prepare(
          'UPDATE meal_plans_new SET target_calories = ?, target_protein = ?, target_fat = ?, target_carbs = ? WHERE id = ?'
        );
        const rollupSelect = db.prepare(`
          SELECT
            COALESCE(SUM(r.calories * COALESCE(mpi.serving_qty, 1)), 0) AS cals,
            COALESCE(SUM(r.protein  * COALESCE(mpi.serving_qty, 1)), 0) AS prot,
            COALESCE(SUM(r.fat      * COALESCE(mpi.serving_qty, 1)), 0) AS fat,
            COALESCE(SUM(r.carbs    * COALESCE(mpi.serving_qty, 1)), 0) AS carbs
          FROM meal_plan_items_new mpi
          LEFT JOIN recipes r ON r.id = mpi.recipe_id
          WHERE mpi.meal_plan_id = ? AND mpi.alternative_group = 0
        `);
        for (const p of planIds) {
          const a = rollupSelect.get(p.id);
          rollupUpdate.run(Math.round(a.cals), Math.round(a.prot), Math.round(a.fat), Math.round(a.carbs), p.id);
        }
        console.log(`  recomputed macro rollups for ${planIds.length} meal_plans`);
      }

      // 8. client_meal_plans → client_meal_schedules with a per-assignment calorie override
      db.exec(`
        CREATE TABLE client_meal_schedules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          meal_schedule_id INTEGER NOT NULL REFERENCES meal_schedules(id) ON DELETE CASCADE,
          started_at TEXT DEFAULT (datetime('now')),
          calorie_override INTEGER,
          UNIQUE(user_id, meal_schedule_id)
        )
      `);
      const oldClient = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='client_meal_plans'").get();
      if (oldClient) {
        db.exec(`
          INSERT INTO client_meal_schedules (user_id, meal_schedule_id, started_at)
          SELECT user_id, meal_plan_id, started_at FROM client_meal_plans
        `);
        db.exec('DROP TABLE client_meal_plans');
      }

      // 9. Drop old tables and rename the _new ones into place
      if (db.prepare("SELECT name FROM sqlite_master WHERE name='meal_plan_items'").get()) {
        db.exec('DROP TABLE meal_plan_items');
      }
      db.exec('ALTER TABLE meal_plan_items_new RENAME TO meal_plan_items');

      if (oldDays) db.exec('DROP TABLE meal_plan_days');
      if (oldPlans) db.exec('DROP TABLE meal_plans');
      db.exec('ALTER TABLE meal_plans_new RENAME TO meal_plans');

      // 10. client_profiles.active_meal_plan_id was a pointer to the OLD meal_plans
      //     (which is now meal_schedules). Rename the column so the semantics match.
      try { db.exec('ALTER TABLE client_profiles RENAME COLUMN active_meal_plan_id TO active_meal_schedule_id'); }
      catch (e) { /* older sqlite — leave column, we'll add a new one */ }
      try { db.exec('ALTER TABLE client_profiles ADD COLUMN active_meal_schedule_id INTEGER'); }
      catch (e) { /* already renamed above */ }
    });

    try {
      migrate();
      db.pragma('foreign_keys = ON');
      console.log('Three-tier meal migration complete.');
    } catch (e) {
      db.pragma('foreign_keys = ON');
      console.error('Meal migration failed:', e.message);
      throw e;
    }
  }
} catch (e) {
  console.error('Meal migration block failed:', e.message);
}

// Add reminder_preferences column to client_profiles
try {
  db.exec("ALTER TABLE client_profiles ADD COLUMN reminder_preferences TEXT DEFAULT '{}'");
} catch (e) { /* already exists */ }

// Add distance tracking columns to workout_logs
try {
  db.exec('ALTER TABLE workout_logs ADD COLUMN distance REAL');
} catch (e) { /* already exists */ }
try {
  db.exec("ALTER TABLE workout_logs ADD COLUMN distance_unit TEXT DEFAULT 'km'");
} catch (e) { /* already exists */ }

// Suppressed workouts — records a one-off delete of a prescribed workout for
// a specific date. Filtered out in getScheduledForDate. Distinct from rest
// days (which hide everything) and one-off reschedules (which move).
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workout_suppressions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      workout_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, workout_id, date)
    )
  `);
} catch (e) { /* already exists */ }

// Seed coach profile defaults + session types + availability for every coach
// that doesn't yet have them. Idempotent — runs on every boot but only inserts
// the first time.
try {
  const coaches = db.prepare("SELECT id, name FROM users WHERE role = 'coach'").all();
  for (const coach of coaches) {
    // Ensure coach_profiles row exists with sensible defaults
    const existing = db.prepare('SELECT id, headline, photo_url FROM coach_profiles WHERE user_id = ?').get(coach.id);
    if (!existing) {
      db.prepare(`
        INSERT INTO coach_profiles (user_id, membership_tier, headline, bio, specialties, years_experience, qualifications, is_public, sort_order)
        VALUES (?, 'Elite', ?, ?, ?, ?, ?, 1, 0)
      `).run(
        coach.id,
        'Mobility and Longevity Coach',
        'Helping people move better, feel younger, and train for the long game. Over a decade working with clients from all walks of life, specialising in mobility, strength, and injury-free training.',
        'Mobility,Strength,Injury Prevention,Longevity',
        10,
        'Certified Functional Range Conditioning Mobility Specialist (FRCms), Kinstretch Instructor, Level 3 Personal Trainer',
      );
    } else if (!existing.headline) {
      db.prepare('UPDATE coach_profiles SET headline = ?, specialties = COALESCE(specialties, ?) WHERE user_id = ?')
        .run('Mobility and Longevity Coach', 'Mobility,Strength,Longevity', coach.id);
    }

    // Seed default session types if none exist for this coach
    const stCount = db.prepare('SELECT COUNT(*) as c FROM coach_session_types WHERE coach_user_id = ?').get(coach.id);
    if (stCount.c === 0) {
      const insertSt = db.prepare(`
        INSERT INTO coach_session_types (coach_user_id, title, description, duration_minutes, price_cents, currency, sort_order)
        VALUES (?, ?, ?, ?, ?, 'USD', ?)
      `);
      insertSt.run(coach.id, '30 Minute 1:1 Session', 'A focused video call to review your movement, ask questions, or unpack a specific issue. Great for a quick tune-up.', 30, 5500, 0);
      insertSt.run(coach.id, '60 Minute 1:1 Session', 'A full-length video call for in-depth coaching, full programming review, and detailed technique work.', 60, 9700, 1);
    }

    // Seed default weekday availability if none exists (Mon-Fri 09:00-17:00)
    const avCount = db.prepare('SELECT COUNT(*) as c FROM coach_availability WHERE coach_user_id = ?').get(coach.id);
    if (avCount.c === 0) {
      const insertAv = db.prepare('INSERT INTO coach_availability (coach_user_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)');
      for (const wd of [1, 2, 3, 4, 5]) {
        insertAv.run(coach.id, wd, '09:00', '17:00');
      }
    }
  }
} catch (e) {
  console.error('Coach profile seed failed:', e.message);
}

// Seed default 1:1 coaching pricing tiers
try {
  const ctCount = db.prepare('SELECT COUNT(*) as c FROM coach_pricing_tiers').get();
  if (ctCount.c === 0) {
    const insertCt = db.prepare(`
      INSERT INTO coach_pricing_tiers (slug, name, description, price_30min_cents, price_60min_cents, currency, sort_order)
      VALUES (?, ?, ?, ?, ?, 'USD', ?)
    `);
    insertCt.run('standard', 'Standard', 'Entry-level 1:1 coaching with certified team members.', 5500, 9700, 0);
    insertCt.run('premium',  'Premium',  'Premium 1:1 coaching with senior coaches and specialists.', 8500, 14900, 1);
    insertCt.run('elite',    'Elite Transformation', 'Elite transformation coaching with lead coaches.', 12500, 22500, 2);
  }

  // Default any coach without a pricing tier to Standard
  const standardRow = db.prepare("SELECT id FROM coach_pricing_tiers WHERE slug = 'standard'").get();
  if (standardRow) {
    db.prepare('UPDATE coach_profiles SET pricing_tier_id = ? WHERE pricing_tier_id IS NULL').run(standardRow.id);
  }
} catch (e) {
  console.error('coach_pricing_tiers seed failed:', e.message);
}

// Seed default tiers if empty
const tierCount = db.prepare('SELECT COUNT(*) as c FROM tiers').get();
if (tierCount.c === 0) {
  const insertTier = db.prepare('INSERT INTO tiers (name, level, description, price_label) VALUES (?, ?, ?, ?)');
  insertTier.run('Free', 0, 'Free content available to all clients', 'Free');
  insertTier.run('Starter', 1, 'Entry-level paid content', '$19.99/mo');
  insertTier.run('Prime', 2, 'Mid-tier content with full program access', '$49/mo');
  insertTier.run('Elite', 3, 'Full access to all content and coaching', '$99/mo');
}

// Feature tier requirements -- maps feature keys to minimum tier levels.
// Meal time preferences — customisable per-day meal times
db.exec(`
  CREATE TABLE IF NOT EXISTS meal_time_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    day_type TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    preferred_time TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, day_type, meal_type)
  )
`);

// Features only appear if BOTH the tier gate is met AND the data exists for that user.
db.exec(`
  CREATE TABLE IF NOT EXISTS feature_tier_requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feature_key TEXT UNIQUE NOT NULL,
    min_tier_level INTEGER NOT NULL DEFAULT 0,
    label TEXT,
    description TEXT
  )
`);

// Coach-authored notes pinned to a client's profile. Used by the coach
// admin ClientProfile workspace (Notes tab + right-rail). Private notes are
// coach-only; non-private notes may be shown to the client later.
db.exec(`
  CREATE TABLE IF NOT EXISTS coach_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_private INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS coach_notes_client_idx ON coach_notes(client_id);
`);

// ── Shared client inbox support ────────────────────────────────────────
// A conversation with client_id set is the canonical "team inbox" thread
// for that client: membership = that client + ALL coaches. Any coach can
// see/reply. Per-message sender_id preserves who replied. Existing `direct`
// conversations (2 members) remain valid as private side-threads.
try {
  const cols = db.prepare("PRAGMA table_info(conversations)").all().map(c => c.name);
  if (!cols.includes('client_id')) {
    db.exec('ALTER TABLE conversations ADD COLUMN client_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
  }
} catch (e) { /* table may not exist yet on a fresh DB */ }

// Per-user read state. Each coach tracks their own last_read timestamp per
// conversation. Unread count = messages created_at > last_read_at AND
// sender_id != this_user. Mark-as-unread rewinds last_read_at.
db.exec(`
  CREATE TABLE IF NOT EXISTS conversation_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_read_message_id INTEGER,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(conversation_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS conversation_reads_user_idx ON conversation_reads(user_id);
`);

// Per-coach starred conversations. Each coach can pin conversations they
// want to triage later without affecting other coaches' views.
db.exec(`
  CREATE TABLE IF NOT EXISTS conversation_stars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(conversation_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS conversation_stars_user_idx ON conversation_stars(user_id);
`);

// Freeform client tags — coach-applied labels like "Group Coaching", "AMS",
// "Boston", "Performer". Used on the ClientProfile Overview to surface
// context at a glance.
db.exec(`
  CREATE TABLE IF NOT EXISTS client_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(client_id, label)
  );
  CREATE INDEX IF NOT EXISTS client_tags_client_idx ON client_tags(client_id);
`);

// Membership fields on client_profiles — plan title, cycle, and next
// renewal timestamp. No Stripe integration yet, so these are coach-set
// manually. The Overview tab renders an "Upcoming Renewal" / "Renews
// today" pill computed from next_renewal_at.
try {
  const cpCols = db.prepare("PRAGMA table_info(client_profiles)").all().map(c => c.name);
  if (!cpCols.includes('plan_title')) db.exec("ALTER TABLE client_profiles ADD COLUMN plan_title TEXT");
  if (!cpCols.includes('plan_cycle')) db.exec("ALTER TABLE client_profiles ADD COLUMN plan_cycle TEXT");  // 'monthly' | 'quarterly' | 'annual'
  if (!cpCols.includes('plan_started_at')) db.exec("ALTER TABLE client_profiles ADD COLUMN plan_started_at TEXT");
  if (!cpCols.includes('plan_next_renewal_at')) db.exec("ALTER TABLE client_profiles ADD COLUMN plan_next_renewal_at TEXT");
} catch (e) { /* ignore */ }

// ── Nutrition target inputs ────────────────────────────────────────────
// Mifflin-St Jeor BMR + activity factor + eating style → calorie & macro
// targets. We store the raw inputs (height, weight, sex, activity, style)
// so the calc can be re-run server-side any time the client edits any of
// them. Targets in calorie_target / protein_target / fat_target /
// carbs_target stay the source-of-truth for diary % rings — they're what
// gets shown — but they're derived from these inputs unless the client
// manually overrides via the Profile "Custom" toggle.
//   sex            : 'male' | 'female'  (Mifflin only has these two; intersex
//                                         clients pick whichever matches their
//                                         lean mass — same convention as
//                                         every other tracking app)
//   height_cm      : stored cm always; UI toggles ft/in for display
//   weight_kg      : stored kg always; UI toggles lbs for display
//   activity_level : 'sedentary' | 'light' | 'moderate' | 'very' | 'extreme'
//                    (factors 1.2 / 1.375 / 1.55 / 1.725 / 1.9)
//   eating_style   : 'balanced' | 'high_protein' | 'mediterranean' |
//                    'low_carb' | 'keto' | 'carnivore' | 'plant_based'
//   targets_custom : 1 = user manually overrode targets in Profile, so the
//                    auto-recompute on input change is suppressed. 0 = keep
//                    targets in lockstep with derived values.
try {
  const cpCols = db.prepare("PRAGMA table_info(client_profiles)").all().map(c => c.name);
  if (!cpCols.includes('sex')) db.exec("ALTER TABLE client_profiles ADD COLUMN sex TEXT");
  if (!cpCols.includes('height_cm')) db.exec("ALTER TABLE client_profiles ADD COLUMN height_cm REAL");
  if (!cpCols.includes('weight_kg')) db.exec("ALTER TABLE client_profiles ADD COLUMN weight_kg REAL");
  if (!cpCols.includes('activity_level')) db.exec("ALTER TABLE client_profiles ADD COLUMN activity_level TEXT DEFAULT 'moderate'");
  if (!cpCols.includes('eating_style')) db.exec("ALTER TABLE client_profiles ADD COLUMN eating_style TEXT DEFAULT 'balanced'");
  if (!cpCols.includes('targets_custom')) db.exec("ALTER TABLE client_profiles ADD COLUMN targets_custom INTEGER DEFAULT 0");
} catch (e) { /* ignore */ }

// ── 1:1 booking link migration ────────────────────────────────────────
// Old admin-set value pointed at systemations.com/book. Dan moved the
// elite booking page to handsdan.com/vip-elite-coaching. Only update if
// the row is still on the old URL so we don't clobber further edits
// made through the admin Tier editor.
try {
  db.prepare(
    `UPDATE tiers
        SET cta_url = ?
      WHERE name = 'Elite'
        AND cta_url = 'https://systemations.com/book'`
  ).run('https://handsdan.com/vip-elite-coaching');
} catch (e) { /* ignore */ }

// ── Activity tracking ──────────────────────────────────────────────────
// users.last_active_at is bumped by the authenticateToken middleware on
// any authed API request, debounced to once per minute per user. The
// login_events table records each successful /api/auth/login with IP +
// User-Agent so coaches can see where a client signed in from.
try {
  const uCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!uCols.includes('last_active_at')) db.exec("ALTER TABLE users ADD COLUMN last_active_at TEXT");
} catch (e) { /* ignore */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS login_events_user_idx ON login_events(user_id);
`);

// Seed default feature requirements if empty
const ftrCount = db.prepare('SELECT COUNT(*) as c FROM feature_tier_requirements').get();
if (ftrCount.c === 0) {
  const insertFtr = db.prepare('INSERT INTO feature_tier_requirements (feature_key, min_tier_level, label, description) VALUES (?, ?, ?, ?)');
  insertFtr.run('today_screen',       0, 'Today Screen',          'Enhanced daily view with session + meals');
  insertFtr.run('weekly_schedule',    0, 'Weekly Schedule',       'Mon-Sun weekly overview');
  insertFtr.run('workout_program',    0, 'Workout Program',       'Structured training program');
  insertFtr.run('calorie_tracker',    0, 'Calorie Tracker',       'Basic manual calorie tracking');
  insertFtr.run('smart_targets',      2, 'Smart Targets',         'Phase-aware auto calorie/macro switching');
  insertFtr.run('meal_templates',     2, 'Meal Templates',        'Daily meal templates with timed meals');
  insertFtr.run('weekly_meal_plan',   2, 'Weekly Meal Plan',      'Weekly meal rotation + shopping list');
  insertFtr.run('supplement_tracker', 3, 'Supplement Tracker',    'Supplement stack with timing reminders');
  insertFtr.run('daily_checkin',      1, 'Daily Check-in',        'Daily metrics logging (sleep, energy, etc.)');
  insertFtr.run('daily_checkin_full', 2, 'Full Daily Check-in',   'All metrics including HRV, joint/tendon feel');
  insertFtr.run('wellness_protocols', 3, 'Wellness Protocols',    'Sauna, cold, breathwork protocols');
  insertFtr.run('phase_banners',      2, 'Phase Banners',         'Phase awareness + deload notifications');
  insertFtr.run('scan_reminders',     3, 'Scan Reminders',        'InBody scan + bloods schedule reminders');
  insertFtr.run('strength_tests',     2, 'Strength Tests',        '3RM tracking, jump tests, sprint tests');
  insertFtr.run('tendon_protocols',   3, 'Tendon Protocols',      'Tendon health tracking + red flag system');
  insertFtr.run('emergency_protocols',3, 'Emergency Protocols',   'Auto-deload triggers + concussion lockout');
  insertFtr.run('shopping_list',      3, 'Shopping List',         'Weekly shopping list from meal plan');
}

// ---------------------------------------------------------------------
// Mock client roster — 20 seeded clients across ages, genders, tiers,
// and full onboarding answers. Only runs on an empty client roster so
// real sign-ups are never touched. Dan uses these to map what different
// tier experiences look like in the coach client list.
// ---------------------------------------------------------------------
try {
  // Use a sentinel email to detect whether the mock roster is already seeded —
  // we don't want to block on *any* existing clients because Dan may have real
  // test accounts. If "emma.thompson@example.com" is present, assume the whole
  // roster is already in place.
  const sentinel = db.prepare("SELECT id FROM users WHERE email = 'emma.thompson@example.com'").get();
  if (!sentinel) {
    const primaryCoach = db.prepare("SELECT id FROM users WHERE role = 'coach' ORDER BY id LIMIT 1").get();
    const coachId = primaryCoach?.id || null;
    const defaultHash = bcrypt.hashSync('welcome123', 10);

    // tier_id 1=Free, 2=Starter, 3=Prime, 4=Elite
    const mockClients = [
      { name: 'Emma Thompson',    email: 'emma.thompson@example.com',   age: 52, gender: 'female', location: 'Dublin, IE',
        tier_id: 3, goal: 'Improve mobility & flexibility', experience: 'Some experience (< 1 year)',
        injuries: 'Lower back stiffness, right hip bursitis (managed)', schedule: '4-5 days',
        equipment: ['Yoga mat & foam roller', 'Resistance bands', 'Home gym (dumbbells, bands)'],
        dietary: 'No dairy, otherwise flexible', sleep: 'OK (6-7 hours, sometimes restless)',
        anything_else: 'Desk job — want to feel less stiff by 4pm every day.' },

      { name: 'James O\'Connor',   email: 'james.oconnor@example.com',   age: 64, gender: 'male',   location: 'Cork, IE',
        tier_id: 4, goal: 'General fitness & longevity', experience: 'Former athlete returning to training',
        injuries: 'Right knee replacement 2019, cleared for full activity', schedule: '4-5 days',
        equipment: ['Full gym'],
        dietary: 'Mediterranean style, 16:8 most days', sleep: 'Great (7-9 hours, restful)',
        anything_else: 'Played rugby until 45 — want to train like an athlete again without the wear and tear.' },

      { name: 'Sophia Nguyen',    email: 'sophia.nguyen@example.com',   age: 34, gender: 'female', location: 'London, UK',
        tier_id: 2, goal: 'Reduce pain & discomfort', experience: 'Complete beginner',
        injuries: 'Chronic neck and upper trap tension from laptop work', schedule: '2-3 days',
        equipment: ['Minimal (bodyweight only)', 'Yoga mat & foam roller'],
        dietary: 'Vegetarian, tracks protein loosely', sleep: 'Poor (< 6 hours or very broken)',
        anything_else: 'Just had my second child — very time-poor, need short sessions I can do at home.' },

      { name: 'Marcus Williams',  email: 'marcus.williams@example.com', age: 41, gender: 'male',   location: 'Austin, TX',
        tier_id: 4, goal: 'Build strength', experience: 'Intermediate (1-3 years)',
        injuries: 'Left shoulder impingement (rehabbing)', schedule: '6-7 days',
        equipment: ['Full gym', 'Kettlebells'],
        dietary: 'High protein, 3500 kcal target', sleep: 'Great (7-9 hours, restful)',
        anything_else: 'Want to add strength without aggravating my shoulder. Open to programming tweaks.' },

      { name: 'Priya Patel',      email: 'priya.patel@example.com',     age: 29, gender: 'female', location: 'Toronto, CA',
        tier_id: 2, goal: 'Improve athletic performance', experience: 'Advanced (3+ years)',
        injuries: 'None currently', schedule: '4-5 days',
        equipment: ['Full gym', 'Kettlebells', 'TRX / Suspension trainer'],
        dietary: 'Pescatarian, 2400 kcal', sleep: 'OK (6-7 hours, sometimes restless)',
        anything_else: 'Training for an OCR race in 6 months — grip strength and conditioning focus.' },

      { name: 'Robert Fitzgerald', email: 'robert.fitz@example.com',    age: 58, gender: 'male',   location: 'Galway, IE',
        tier_id: 3, goal: 'Reduce pain & discomfort', experience: 'Some experience (< 1 year)',
        injuries: 'Chronic lower back pain (L4/L5 disc bulge, non-surgical)', schedule: '4-5 days',
        equipment: ['Home gym (dumbbells, bands)', 'Yoga mat & foam roller'],
        dietary: 'Normal, trying to cut 5kg', sleep: 'OK (6-7 hours, sometimes restless)',
        anything_else: 'Scared of deadlifts but want to build confidence lifting again.' },

      { name: 'Aisha Rahman',     email: 'aisha.rahman@example.com',    age: 46, gender: 'female', location: 'Manchester, UK',
        tier_id: 1, goal: 'Lose weight', experience: 'Complete beginner',
        injuries: 'Plantar fasciitis flare-ups', schedule: '2-3 days',
        equipment: ['Minimal (bodyweight only)'],
        dietary: 'Halal, exploring intermittent fasting', sleep: 'Variable (shift work or inconsistent)',
        anything_else: 'Night shift nurse — energy is all over the place.' },

      { name: 'Liam Murphy',      email: 'liam.murphy@example.com',     age: 23, gender: 'male',   location: 'Dublin, IE',
        tier_id: 2, goal: 'Build strength', experience: 'Intermediate (1-3 years)',
        injuries: 'None', schedule: '6-7 days',
        equipment: ['Full gym'],
        dietary: 'Bulking, 3800 kcal', sleep: 'Great (7-9 hours, restful)',
        anything_else: 'College athlete, want to hit a 200kg deadlift by end of year.' },

      { name: 'Catherine Byrne',  email: 'catherine.byrne@example.com', age: 71, gender: 'female', location: 'Limerick, IE',
        tier_id: 4, goal: 'General fitness & longevity', experience: 'Some experience (< 1 year)',
        injuries: 'Mild osteoarthritis in both knees, left hip replacement 2021', schedule: '4-5 days',
        equipment: ['Home gym (dumbbells, bands)', 'Resistance bands'],
        dietary: 'Balanced, no restrictions', sleep: 'Great (7-9 hours, restful)',
        anything_else: 'Grandmother of 6 — want to keep up with them and travel pain-free.' },

      { name: 'Daniel Kim',       email: 'daniel.kim@example.com',      age: 37, gender: 'male',   location: 'Seattle, WA',
        tier_id: 3, goal: 'Improve mobility & flexibility', experience: 'Intermediate (1-3 years)',
        injuries: 'Tight hip flexors, old ACL repair (right)', schedule: '4-5 days',
        equipment: ['Home gym (dumbbells, bands)', 'Yoga mat & foam roller', 'Kettlebells'],
        dietary: 'Korean/whole food, 2800 kcal', sleep: 'OK (6-7 hours, sometimes restless)',
        anything_else: 'Software engineer — want to be able to sit cross-legged again without pain.' },

      { name: 'Olivia Harris',    email: 'olivia.harris@example.com',   age: 48, gender: 'female', location: 'Sydney, AU',
        tier_id: 4, goal: 'Recover from injury', experience: 'Advanced (3+ years)',
        injuries: 'Rotator cuff tear (left, 8 weeks post-op)', schedule: '4-5 days',
        equipment: ['Full gym', 'Resistance bands'],
        dietary: 'Whole30 style', sleep: 'Great (7-9 hours, restful)',
        anything_else: 'Cleared for lower-body and unaffected side. Need programming that respects rehab protocol.' },

      { name: 'Thomas Walsh',     email: 'thomas.walsh@example.com',    age: 55, gender: 'male',   location: 'Waterford, IE',
        tier_id: 2, goal: 'Lose weight', experience: 'Some experience (< 1 year)',
        injuries: 'Type 2 diabetes (well-managed)', schedule: '4-5 days',
        equipment: ['Home gym (dumbbells, bands)'],
        dietary: 'Low carb, 1900 kcal target', sleep: 'OK (6-7 hours, sometimes restless)',
        anything_else: 'Doctor recommended I add strength training. Starting from scratch.' },

      { name: 'Hannah Schmidt',   email: 'hannah.schmidt@example.com',  age: 31, gender: 'female', location: 'Berlin, DE',
        tier_id: 3, goal: 'Improve athletic performance', experience: 'Advanced (3+ years)',
        injuries: 'Mild ankle instability', schedule: '6-7 days',
        equipment: ['Full gym', 'TRX / Suspension trainer'],
        dietary: 'Flexitarian, tracks macros', sleep: 'Great (7-9 hours, restful)',
        anything_else: 'Marathoner crossing over to hybrid training — need smart volume management.' },

      { name: 'Benjamin Carter',  email: 'ben.carter@example.com',      age: 44, gender: 'male',   location: 'Denver, CO',
        tier_id: 1, goal: 'Improve mobility & flexibility', experience: 'Complete beginner',
        injuries: 'None, just feels "tight everywhere"', schedule: '2-3 days',
        equipment: ['Minimal (bodyweight only)'],
        dietary: 'Normal', sleep: 'OK (6-7 hours, sometimes restless)',
        anything_else: 'Just want to touch my toes and feel less creaky in the morning.' },

      { name: 'Isabella Rossi',   email: 'isabella.rossi@example.com',  age: 27, gender: 'female', location: 'Milan, IT',
        tier_id: 2, goal: 'Build strength', experience: 'Some experience (< 1 year)',
        injuries: 'None', schedule: '4-5 days',
        equipment: ['Full gym'],
        dietary: 'Mediterranean, 2100 kcal', sleep: 'Great (7-9 hours, restful)',
        anything_else: 'First time lifting seriously — want to feel confident in a commercial gym.' },

      { name: 'Michael O\'Brien', email: 'michael.obrien@example.com',  age: 62, gender: 'male',   location: 'Belfast, UK',
        tier_id: 3, goal: 'General fitness & longevity', experience: 'Former athlete returning to training',
        injuries: 'Bilateral knee osteoarthritis', schedule: '4-5 days',
        equipment: ['Home gym (dumbbells, bands)', 'Kettlebells'],
        dietary: 'Normal, reducing alcohol', sleep: 'OK (6-7 hours, sometimes restless)',
        anything_else: 'Ex-GAA player. Want a smart plan that respects my knees but still challenges me.' },

      { name: 'Grace Adeyemi',    email: 'grace.adeyemi@example.com',   age: 39, gender: 'female', location: 'Lagos, NG',
        tier_id: 4, goal: 'Lose weight', experience: 'Intermediate (1-3 years)',
        injuries: 'Previous c-section (2 years ago), diastasis recti (partially healed)', schedule: '4-5 days',
        equipment: ['Home gym (dumbbells, bands)', 'Resistance bands'],
        dietary: 'Whole food, tracks protein', sleep: 'Poor (< 6 hours or very broken)',
        anything_else: 'Want core-safe programming and a realistic plan around two small kids.' },

      { name: 'Noah Peterson',    email: 'noah.peterson@example.com',   age: 19, gender: 'male',   location: 'Stockholm, SE',
        tier_id: 1, goal: 'Build strength', experience: 'Complete beginner',
        injuries: 'None', schedule: '4-5 days',
        equipment: ['Minimal (bodyweight only)'],
        dietary: 'Student diet — working on it', sleep: 'Variable (shift work or inconsistent)',
        anything_else: 'Uni student, small budget, no gym access. What can I do?' },

      { name: 'Rachel Goldberg',  email: 'rachel.goldberg@example.com', age: 50, gender: 'female', location: 'New York, NY',
        tier_id: 3, goal: 'Improve mobility & flexibility', experience: 'Intermediate (1-3 years)',
        injuries: 'Peri-menopause symptoms, mild SI joint pain', schedule: '4-5 days',
        equipment: ['Home gym (dumbbells, bands)', 'Yoga mat & foam roller'],
        dietary: 'Pescatarian, 2000 kcal', sleep: 'Poor (< 6 hours or very broken)',
        anything_else: 'Hormonal shifts have changed everything — want a coach who understands female physiology 40+.' },

      { name: 'Kenji Tanaka',     email: 'kenji.tanaka@example.com',    age: 33, gender: 'male',   location: 'Tokyo, JP',
        tier_id: 2, goal: 'Reduce pain & discomfort', experience: 'Some experience (< 1 year)',
        injuries: 'Chronic wrist pain (climbing), mild forward head posture', schedule: '4-5 days',
        equipment: ['Home gym (dumbbells, bands)', 'Resistance bands'],
        dietary: 'Japanese whole food', sleep: 'OK (6-7 hours, sometimes restless)',
        anything_else: 'Climber — want to address overuse and build a more balanced body.' },
    ];

    const insertUser = db.prepare(`
      INSERT INTO users (email, password_hash, name, role, coach_id)
      VALUES (?, ?, ?, 'client', ?)
    `);
    const insertProfile = db.prepare(`
      INSERT INTO client_profiles (user_id, tier_id, age, gender, location)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertOnboarding = db.prepare(`
      INSERT INTO onboarding_answers
        (user_id, goal, experience, injuries, schedule, equipment, dietary, sleep, anything_else, answers_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const txn = db.transaction(() => {
      for (const c of mockClients) {
        const info = insertUser.run(c.email, defaultHash, c.name, coachId);
        const userId = info.lastInsertRowid;
        insertProfile.run(userId, c.tier_id, c.age, c.gender, c.location);
        const equipmentJson = JSON.stringify(c.equipment);
        insertOnboarding.run(
          userId, c.goal, c.experience, c.injuries, c.schedule,
          equipmentJson, c.dietary, c.sleep, c.anything_else,
          JSON.stringify({
            goal: c.goal, experience: c.experience, injuries: c.injuries,
            schedule: c.schedule, equipment: c.equipment, dietary: c.dietary,
            sleep: c.sleep, anything_else: c.anything_else,
          }),
        );
      }
    });
    txn();
    console.log(`Seeded ${mockClients.length} mock clients.`);
  }
} catch (e) {
  console.error('Mock client seed failed:', e.message);
}

// Helper to match pg-style query interface
const pool = {
  query: (text, params = []) => {
    const isSelect = text.trim().toUpperCase().startsWith('SELECT');
    const isInsert = text.trim().toUpperCase().startsWith('INSERT');

    // Convert $1, $2 style params to ? style
    let sqliteText = text;
    let paramIndex = 1;
    while (sqliteText.includes(`$${paramIndex}`)) {
      sqliteText = sqliteText.replace(`$${paramIndex}`, '?');
      paramIndex++;
    }

    if (isSelect) {
      const rows = db.prepare(sqliteText).all(...params);
      return { rows };
    } else if (isInsert && sqliteText.toUpperCase().includes('RETURNING')) {
      // Handle RETURNING clause - SQLite doesn't support it
      const returningMatch = sqliteText.match(/RETURNING\s+(.+)$/i);
      const columns = returningMatch ? returningMatch[1].trim() : '*';
      const insertSql = sqliteText.replace(/RETURNING\s+.+$/i, '').trim();

      const info = db.prepare(insertSql).run(...params);
      const tableName = insertSql.match(/INSERT\s+INTO\s+(\w+)/i)?.[1];
      const row = db.prepare(`SELECT ${columns} FROM ${tableName} WHERE id = ?`).get(info.lastInsertRowid);
      return { rows: [row] };
    } else {
      // Handle multiple statements (separated by ;)
      const statements = sqliteText.split(';').filter(s => s.trim());
      for (const stmt of statements) {
        if (stmt.trim()) {
          db.prepare(stmt.trim()).run(...params);
        }
      }
      return { rows: [] };
    }
  },
};

export default pool;
