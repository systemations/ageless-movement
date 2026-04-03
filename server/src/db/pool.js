import Database from 'better-sqlite3';
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
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    demo_video_url TEXT,
    thumbnail_url TEXT,
    body_part TEXT,
    equipment TEXT,
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
`);

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
