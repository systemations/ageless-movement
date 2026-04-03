import { Router } from 'express';
import pool from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Get full dashboard data for client home screen
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Profile
    const profileResult = pool.query('SELECT * FROM client_profiles WHERE user_id = ?', [userId]);
    const profile = profileResult.rows[0] || {};

    // Active program
    const cpResult = pool.query(`
      SELECT cp.*, p.title as program_title, p.description as program_desc, p.image_url
      FROM client_programs cp
      JOIN programs p ON cp.program_id = p.id
      WHERE cp.user_id = ?
      ORDER BY cp.started_at DESC LIMIT 1
    `, [userId]);
    const activeProgram = cpResult.rows[0] || null;

    // Today's workout
    let todayWorkout = null;
    if (activeProgram) {
      const wResult = pool.query(`
        SELECT w.* FROM workouts w
        WHERE w.program_id = ? AND w.week_number = ? AND w.day_number = ?
        LIMIT 1
      `, [activeProgram.program_id, activeProgram.current_week, activeProgram.current_day]);
      todayWorkout = wResult.rows[0] || null;
    }

    // Streak
    const streakResult = pool.query('SELECT * FROM streaks WHERE user_id = ?', [userId]);
    const streak = streakResult.rows[0] || { current_streak: 0, best_streak: 0 };

    // Today's nutrition
    const nutritionResult = pool.query(`
      SELECT
        COALESCE(SUM(calories), 0) as total_calories,
        COALESCE(SUM(protein), 0) as total_protein,
        COALESCE(SUM(fat), 0) as total_fat,
        COALESCE(SUM(carbs), 0) as total_carbs
      FROM nutrition_logs WHERE user_id = ? AND date = ?
    `, [userId, today]);
    const nutrition = nutritionResult.rows[0];

    // Today's water
    const waterResult = pool.query(`
      SELECT COALESCE(SUM(amount_ml), 0) as total_ml
      FROM water_logs WHERE user_id = ? AND date = ?
    `, [userId, today]);
    const water = waterResult.rows[0];

    // Today's steps
    const stepsResult = pool.query(`
      SELECT COALESCE(SUM(steps), 0) as total_steps
      FROM step_logs WHERE user_id = ? AND date = ?
    `, [userId, today]);
    const steps = stepsResult.rows[0];

    // Tasks
    const tasksResult = pool.query('SELECT * FROM tasks WHERE client_id = ?', [userId]);
    const tasks = tasksResult.rows;

    // Task completions for today
    const completionsResult = pool.query(`
      SELECT task_id FROM task_completions WHERE user_id = ? AND date = ?
    `, [userId, today]);
    const completedTaskIds = new Set(completionsResult.rows.map(r => r.task_id));

    // Calculate task streaks
    const tasksWithStreaks = tasks.map(task => {
      // Count consecutive days this task was completed going back from yesterday
      let streak = 0;
      for (let i = 1; i <= 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const check = pool.query('SELECT id FROM task_completions WHERE task_id = ? AND user_id = ? AND date = ?', [task.id, userId, dateStr]);
        if (check.rows.length > 0) streak++;
        else break;
      }
      return {
        ...task,
        completed: completedTaskIds.has(task.id),
        streak,
      };
    });

    // Week activity (which days this week had workout logs)
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().split('T')[0];
    });

    const activityResult = pool.query(`
      SELECT DISTINCT date FROM workout_logs WHERE user_id = ? AND date >= ? AND date <= ? AND completed = 1
    `, [userId, weekDates[0], weekDates[6]]);
    const activeDays = new Set(activityResult.rows.map(r => r.date));

    // Goals
    const goalsResult = pool.query('SELECT * FROM goals WHERE user_id = ? ORDER BY achieved ASC, created_at DESC', [userId]);

    res.json({
      profile,
      activeProgram,
      todayWorkout,
      streak,
      nutrition: {
        calories: nutrition.total_calories,
        protein: nutrition.total_protein,
        fat: nutrition.total_fat,
        carbs: nutrition.total_carbs,
      },
      water: water.total_ml,
      steps: steps.total_steps,
      tasks: tasksWithStreaks,
      weekActivity: weekDates.map(d => activeDays.has(d)),
      goals: goalsResult.rows,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle task completion
router.post('/tasks/:taskId/toggle', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const existing = pool.query('SELECT id FROM task_completions WHERE task_id = ? AND user_id = ? AND date = ?', [taskId, userId, today]);

    if (existing.rows.length > 0) {
      pool.query('DELETE FROM task_completions WHERE task_id = ? AND user_id = ? AND date = ?', [taskId, userId, today]);
      res.json({ completed: false });
    } else {
      pool.query('INSERT INTO task_completions (task_id, user_id, date) VALUES (?, ?, ?)', [taskId, userId, today]);
      res.json({ completed: true });
    }
  } catch (err) {
    console.error('Task toggle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Log water
router.post('/water', authenticateToken, async (req, res) => {
  try {
    const { amount_ml } = req.body;
    const today = new Date().toISOString().split('T')[0];
    pool.query('INSERT INTO water_logs (user_id, date, amount_ml) VALUES (?, ?, ?)', [req.user.id, today, amount_ml]);
    const total = pool.query('SELECT COALESCE(SUM(amount_ml), 0) as total FROM water_logs WHERE user_id = ? AND date = ?', [req.user.id, today]);
    res.json({ total: total.rows[0].total });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
