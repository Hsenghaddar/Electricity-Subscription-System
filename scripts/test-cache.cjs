const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createMeterCache } = require('../src/main/meterCache');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bashron-cache-test-'));
const file = path.join(temporary, 'test.sqlite');
const db = new Database(file);
db.pragma('journal_mode=WAL');
db.exec('CREATE TABLE marker(value INTEGER); INSERT INTO marker VALUES(1)');
const external = new Database(file);
let loads = 0;
const loader = (connection, id) => { loads++; return { id, value: connection.prepare('SELECT value FROM marker').get().value }; };
const cache = createMeterCache(db, {
  getConsumptionWorkspace: loader,
  getMeterReport: loader,
  getRecentConsumptionPeriods: () => [{ id: 10 }, { id: 11 }],
}, 2);
try {
  cache.getWorkspace(1); cache.getWorkspace(1);
  assert.equal(loads, 1, 'repeated requests reuse results');
  cache.getWorkspace(2); cache.getWorkspace(1); cache.getWorkspace(3); cache.getWorkspace(2);
  assert.equal(loads, 4, 'least-recently-used entries are evicted');
  cache.getReport(1);
  external.exec('UPDATE marker SET value=2');
  assert.equal(cache.getWorkspace(2).value, 2, 'external commits invalidate workspaces');
  assert.equal(cache.getReport(1).value, 2, 'external commits invalidate reports');
  const beforeInvalidation = loads;
  cache.invalidate(); cache.getWorkspace(2); cache.getReport(1);
  assert.equal(loads, beforeInvalidation + 2, 'explicit invalidation clears both caches');
  const beforeNew = loads;
  cache.getWorkspace(); cache.getWorkspace();
  assert.equal(loads, beforeNew + 2, 'new workspaces are never stale');
  cache.warmRecent();
  const beforeWarmHits = loads;
  cache.getWorkspace(10); cache.getReport(10); cache.getWorkspace(11); cache.getReport(11);
  assert.equal(loads, beforeWarmHits, 'recent periods are warmed');
  console.log('Cache regression tests passed.');
} finally {
  external.close(); db.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
