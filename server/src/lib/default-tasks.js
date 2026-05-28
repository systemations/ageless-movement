// Default daily tasks pre-populated for every new client.
// Shown on Home in the "Today's Tasks" card. Clients can delete any they
// don't want; coaches can assign their own. Same list is used by:
//   - register (server/src/routes/auth.js) for new signups
//   - the dev seed (server/src/db/seed.js) for test accounts
//   - the backfill migration for clients that pre-date this seeding
export const DEFAULT_CLIENT_TASKS = [
  '10 min morning mobility',
  'Drink 3L water',
  '8 hours sleep',
  'Log all meals',
  '15 min walk',
];
