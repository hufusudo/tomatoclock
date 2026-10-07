const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

test('Electron runtime ABI loads SQLite and preserves completed durations', t => {
  assert.ok(process.versions.electron, 'must run in the Electron runtime');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tomatoclock-runtime-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'learning.sqlite');
  let db = new Database(file);
  db.exec('CREATE TABLE durations (seconds INTEGER NOT NULL)');
  const add = db.prepare('INSERT INTO durations VALUES (?)');
  add.run(1500); add.run(3000);
  assert.equal(db.prepare('SELECT sum(seconds) AS total FROM durations').get().total, 4500);
  db.close();
  db = new Database(file);
  assert.equal(db.prepare('SELECT count(*) AS count FROM durations').get().count, 2);
  db.close();
});
