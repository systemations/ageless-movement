import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'data', 'ageless.db');
const db = new Database(dbPath);

// Import pool to ensure tables exist
await import('./pool.js');

const seed = () => {
  const existing = db.prepare('SELECT COUNT(*) as count FROM conversations').get();
  if (existing.count > 0) {
    console.log('Messaging already seeded, skipping.');
    process.exit(0);
  }

  // Get user IDs
  const coach = db.prepare("SELECT id FROM users WHERE role = 'coach' LIMIT 1").get();
  const clients = db.prepare("SELECT id, name FROM users WHERE role = 'client'").all();

  if (!coach || clients.length === 0) {
    console.log('No users found. Run seed.js first.');
    process.exit(1);
  }

  // Create direct conversations between coach and each client
  for (const client of clients) {
    const convo = db.prepare("INSERT INTO conversations (type) VALUES ('direct')").run();
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(convo.lastInsertRowid, coach.id);
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(convo.lastInsertRowid, client.id);

    // Add some messages
    const msgs = [
      [coach.id, `Hey ${client.name}! Welcome to Ageless Movement. I've set up your program and meal plan. Let me know if you have any questions about getting started.`],
      [client.id, `Thanks Dan! Really excited to get started. The mobility program looks great.`],
      [coach.id, `Awesome! Start with Day 1 whenever you're ready. Remember to warm up properly and listen to your body. No rush.`],
      [client.id, `Will do! Quick question - should I do the mobility routine before or after my regular gym workout?`],
      [coach.id, `Great question. Do a short 5-10 min mobility warm-up before, then the full follow-along can be done as a separate session. Doesn't have to be the same day.`],
      [client.id, `Perfect, that makes sense. I'll start tomorrow morning!`],
    ];

    const now = new Date();
    msgs.forEach((m, i) => {
      const date = new Date(now);
      date.setMinutes(date.getMinutes() - (msgs.length - i) * 15);
      db.prepare('INSERT INTO messages (conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?)').run(
        convo.lastInsertRowid, m[0], m[1], date.toISOString()
      );
    });
  }

  // Create group conversations
  const groups = [
    { title: 'Weekly Wins', icon: '🏆', icon_bg: '#FFF3CD' },
    { title: 'Active Clients', icon: '👤', icon_bg: '#D1ECF1' },
    { title: 'Q&A for the Community', icon: '❓', icon_bg: '#FFE0B2' },
    { title: 'Feedback & Testimonials', icon: '⭐', icon_bg: '#C8E6C9' },
  ];

  for (const g of groups) {
    const convo = db.prepare("INSERT INTO conversations (type, title, icon, icon_bg) VALUES ('group', ?, ?, ?)").run(g.title, g.icon, g.icon_bg);
    // Add coach and all clients
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(convo.lastInsertRowid, coach.id);
    for (const client of clients) {
      db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(convo.lastInsertRowid, client.id);
    }

    // Add some group messages
    const groupMsgs = {
      'Weekly Wins': [
        [coach.id, 'Drop your wins for the week below! No matter how small.'],
        [clients[0]?.id, 'Hit 5 training days this week for the first time!'],
        [coach.id, 'Congrats! 👏 That consistency is what builds results.'],
      ],
      'Active Clients': [
        [coach.id, 'Welcome everyone! This is our main group for updates and announcements.'],
      ],
      'Q&A for the Community': [
        [clients[0]?.id, 'What supplements do you recommend for joint health?'],
        [coach.id, 'Great question! Collagen, omega-3 fish oil, and magnesium are my top 3. Check your supplement plan for dosages.'],
        [clients[0]?.id, 'Sounds good 👍'],
      ],
      'Feedback & Testimonials': [
        [coach.id, 'Your feedback helps us shape the Ageless Movement App into the best it can be. Share your thoughts!'],
      ],
    };

    const msgs = groupMsgs[g.title] || [];
    const now = new Date();
    msgs.forEach((m, i) => {
      if (!m[0]) return;
      const date = new Date(now);
      date.setHours(date.getHours() - (msgs.length - i) * 2);
      db.prepare('INSERT INTO messages (conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?)').run(
        convo.lastInsertRowid, m[0], m[1], date.toISOString()
      );
    });
  }

  // Seed some check-ins
  for (const client of clients) {
    const dates = ['2026-03-23', '2026-03-16', '2026-03-09'];
    const weights = [96.1, 97.5, 98.2];
    dates.forEach((date, i) => {
      db.prepare(
        'INSERT INTO checkins (user_id, coach_id, date, weight, body_fat, sleep_hours, stress_level) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(client.id, coach.id, date, weights[i], i === 0 ? 15 : null, 7, 3);
    });
  }

  // Seed activity log
  const activities = [
    [clients[0]?.id, 'workout_completed', 'Completed "1. Hips | Flexion & Rotation" (21 mins)'],
    [clients[0]?.id, 'meal_logged', 'Logged 3 meals totalling 1,450 calories'],
    [clients[0]?.id, 'checkin_submitted', 'Submitted weekly check-in (96.1 kg)'],
    [clients[0]?.id, 'task_completed', 'Completed all 5 daily tasks'],
    [clients[0]?.id, 'message_sent', 'Sent a message in Q&A'],
    [clients[0]?.id, 'water_logged', 'Logged 2,500ml water (100% of target)'],
    [clients[0]?.id, 'goal_progress', 'Pain-free squat goal updated to 65%'],
  ];

  const now = new Date();
  activities.forEach((a, i) => {
    if (!a[0]) return;
    const date = new Date(now);
    date.setMinutes(date.getMinutes() - i * 45);
    db.prepare('INSERT INTO activity_log (user_id, action_type, description, created_at) VALUES (?, ?, ?, ?)').run(
      a[0], a[1], a[2], date.toISOString()
    );
  });

  console.log('Messaging & check-in seed data inserted!');
  process.exit(0);
};

seed();
