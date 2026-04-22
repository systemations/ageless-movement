const Database = require('better-sqlite3');
const db = new Database('data/ageless.db');

const MAP = {
  1:  '/programs/ground-zero.jpg',
  2:  '/programs/hero-smile.jpg',
  3:  '/programs/mobility-hip.jpg',
  4:  '/programs/eagle-hang.jpg',
  5:  '/programs/flag.jpg',
  6:  '/programs/back-lever.jpg',
  7:  '/programs/deadlift.jpg',
  8:  '/programs/mobility-neck.jpg',
  9:  '/programs/mobility-hip.jpg',
  10: '/programs/mobility-twist.jpg',
  11: '/programs/windmill-kb.jpg',
  12: '/programs/handstand-straddle.jpg',
  13: '/programs/handstand-sunset.jpg',
  14: '/programs/handstand-straddle.jpg',
  15: '/programs/eagle-hang.jpg',
  16: '/programs/flag.jpg',
  17: '/programs/back-lever.jpg',
  18: '/programs/mobility-seated.jpg',
  19: '/programs/mobility-arms-up.jpg',
  20: '/programs/trx-squat.jpg',
  21: '/programs/handstand-outdoor.jpg',
  22: '/programs/conditioning-side.jpg',
  23: '/programs/eagle-hang.jpg',
  24: '/programs/back-lever.jpg',
  25: '/programs/handstand-sunset.jpg',
  26: '/programs/barbell-squat-a.jpg',
  27: '/programs/barbell-squat-b.jpg',
  28: '/programs/coaching-amy.jpg',
  29: '/programs/flag.jpg',
  30: '/programs/cable-pull.jpg',
  31: '/programs/hero-portrait.jpg',
  32: '/programs/cable-standing.jpg',
  33: '/programs/pike-pbars.jpg',
  34: '/programs/back-lever.jpg',
  35: '/programs/handstand-sunset.jpg',
  36: '/programs/pike-pbars.jpg',
  37: '/programs/windmill-kb.jpg',
  38: '/programs/rebuild.jpg',
  39: '/programs/prime.jpg',
  40: '/programs/pickleball-daily-routines.svg',
  41: '/programs/pickleball-home-3x.svg',
  42: '/programs/pickleball-home-2x.svg',
  43: '/programs/cable-pulldown.jpg',
  44: '/programs/cable-pulldown.jpg',
  45: '/programs/pickleball-gym-3x.svg',
  46: '/programs/pickleball-gym-2x.svg',
};

const stmt = db.prepare('UPDATE programs SET image_url = ? WHERE id = ?');
let changed = 0;
for (const [id, url] of Object.entries(MAP)) {
  if (stmt.run(url, Number(id)).changes) changed++;
}
console.log(`Applied thumbnails to ${changed} programs.`);
