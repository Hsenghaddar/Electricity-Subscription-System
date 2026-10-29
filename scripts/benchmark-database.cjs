// Run through `npm run benchmark`; all writes use a disposable copy of the seed.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bashron-benchmark-'));
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'electron') return { app: { getPath: () => temporary, getAppPath: () => root, isPackaged: false } };
  return originalLoad.call(this, request, parent, isMain);
};
const database = require('../src/main/database');
const consumption = require('../src/main/consumptions');
const catalogs = require('../src/main/catalogs');
const db = database.openDatabase();
function measure(fn) {
  fn();
  const samples = [];
  for (let i = 0; i < 9; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return Number(samples[4].toFixed(2));
}
try {
  const latest = db.prepare('SELECT id FROM consumption_periods ORDER BY consumption_date DESC,id DESC LIMIT 1').get()?.id;
  const results = {
    sqliteVersion: db.prepare('SELECT sqlite_version() version').get().version,
    subscribers: db.prepare('SELECT COUNT(*) count FROM subscribers').get().count,
    readings: db.prepare('SELECT COUNT(*) count FROM consumption_details').get().count,
    medianMilliseconds: {
      newMeterRegistration: measure(() => consumption.getConsumptionWorkspace(db)),
      existingMeterRegistration: measure(() => consumption.getConsumptionWorkspace(db, latest)),
      meterReport: measure(() => consumption.getMeterReport(db, latest)),
      counterCatalog: measure(() => catalogs.getCatalog(db, 'counters')),
      saveAllMeters: measure(() => catalogs.saveCatalog(db, 'counters', catalogs.getCatalog(db, 'counters').rows)),
      saveAllSubscribers: measure(() => catalogs.saveCatalog(db, 'subscribers', catalogs.getCatalog(db, 'subscribers').rows)),
    },
  };
  console.log(JSON.stringify(results, null, 2));
} finally {
  database.closeDatabase();
  Module._load = originalLoad;
  fs.rmSync(temporary, { recursive: true, force: true });
}
