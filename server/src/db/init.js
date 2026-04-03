import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('coach', 'client')),
        avatar_url TEXT,
        coach_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS client_profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        active_program_id INTEGER,
        active_meal_plan_id INTEGER,
        calorie_target INTEGER DEFAULT 2200,
        protein_target INTEGER DEFAULT 163,
        fat_target INTEGER DEFAULT 167,
        carbs_target INTEGER DEFAULT 10,
        water_target INTEGER DEFAULT 2500,
        step_target INTEGER DEFAULT 6000,
        weight_unit VARCHAR(5) DEFAULT 'kg',
        height_unit VARCHAR(5) DEFAULT 'cm',
        appearance VARCHAR(10) DEFAULT 'dark',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS coach_profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        membership_tier VARCHAR(50) DEFAULT 'Elite',
        company_name VARCHAR(255),
        bio TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('Database tables created successfully');
    process.exit(0);
  } catch (err) {
    console.error('Database init error:', err.message);
    process.exit(1);
  }
};

initDB();
