const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const DBPATH = path.join(__dirname, 'db.json');
let state = null;
let pool = null;
let writeQueue = Promise.resolve();

function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function normalizeUsers(d) {
  let n = 1;
  const used = new Set();
  for (const u of d.users) {
    u.enrollments = Array.isArray(u.enrollments) ? u.enrollments : [];
    u.purchased = Array.isArray(u.purchased) ? u.purchased : [];
    u.progress = u.progress || {};
    if (u.role === 'student') {
      let num = String(u.id || '').match(/^HSA-(\d{3,})$/i);
      if (num) { used.add(Number(num[1])); }
    }
  }
  for (const u of d.users) {
    if (u.role !== 'student') continue;
    if (!/^HSA-\d{3,}$/i.test(String(u.id || ''))) {
      while (used.has(n)) n++;
      u.id = `HSA-${String(n).padStart(3,'0')}`;
      used.add(n++);
    }
    if (!u.studentPasswordHash) u.studentPasswordHash = passwordHash(u.id);
  }
}
function readSeed() {
  const d = JSON.parse(fs.readFileSync(DBPATH, 'utf8'));
  for (const k of ['users','courses','payments','applications','materials','assignments','submissions','liveClasses','announcements','posts','notifications','receipts','certificates','teachers','messageLogs']) if (!Array.isArray(d[k])) d[k] = [];
  d.settings = d.settings || {};
  for (const c of d.courses) { c.lessons = Array.isArray(c.lessons) ? c.lessons : []; if (c.startDate === undefined) c.startDate = ''; }
  normalizeUsers(d);
  return d;
}

async function initStore() {
  if (!process.env.DATABASE_URL) {
    state = readSeed();
    return { mode: 'file' };
  }
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 30000 });
  await pool.query(`CREATE TABLE IF NOT EXISTS hsa_app_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const result = await pool.query('SELECT data FROM hsa_app_state WHERE id=1');
  if (result.rowCount === 0) {
    state = readSeed();
    await pool.query('INSERT INTO hsa_app_state (id, data) VALUES (1, $1::jsonb)', [JSON.stringify(state)]);
  } else {
    state = result.rows[0].data;
    for (const k of ['users','courses','payments','applications','materials','assignments','submissions','liveClasses','announcements','posts','notifications','receipts','certificates','teachers','messageLogs']) if (!Array.isArray(state[k])) state[k] = [];
    state.settings = state.settings || {};
    normalizeUsers(state);
    await pool.query('UPDATE hsa_app_state SET data=$1::jsonb, updated_at=NOW() WHERE id=1', [JSON.stringify(state)]);
  }
  return { mode: 'postgres' };
}

function load() {
  if (!state) throw new Error('Database is not initialized.');
  return state;
}
function save(next) {
  state = next;
  if (!pool) {
    fs.writeFileSync(DBPATH, JSON.stringify(next, null, 2));
    return Promise.resolve();
  }
  const payload = JSON.stringify(next);
  writeQueue = writeQueue.then(() => pool.query('UPDATE hsa_app_state SET data=$1::jsonb, updated_at=NOW() WHERE id=1', [payload]));
  return writeQueue;
}
async function flush() { await writeQueue; if (pool) await pool.end(); }
module.exports = { initStore, load, save, flush, passwordHash };
