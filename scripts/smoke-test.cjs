const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bashron-js-smoke-'));
const originalLoad = Module._load;
Module._load = function loadWithElectronStub(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        getPath: (name) => name === 'userData' ? temporaryDirectory : temporaryDirectory,
        getAppPath: () => root,
        isPackaged: false,
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const databaseModule = require('../dist/main/main/database.js');
const db = databaseModule.openDatabase();
try {
  const integrity = db.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') throw new Error(`Database integrity check failed: ${integrity}`);

  const { hasUsers, listUsers } = require('../dist/main/main/users.js');
  const { getCatalog, saveCatalog } = require('../dist/main/main/catalogs.js');
  const { getConsumptionWorkspace, getMeterReport } = require('../dist/main/main/consumptions.js');
  const { getFinance, getInstitutionDebts } = require('../dist/main/main/finances.js');
  const { getBreakerMonth } = require('../dist/main/main/breakerMonths.js');

  hasUsers(db);
  listUsers(db);
  for (const name of ['expenseItems', 'subscribers', 'counters', 'breakers', 'regions', 'boxes', 'amperePlans']) {
    getCatalog(db, name);
  }

  const counterCatalog = getCatalog(db, 'counters');
  saveCatalog(db, 'counters', counterCatalog.rows);
  const existingCounter = counterCatalog.rows[0];
  if (existingCounter) {
    const assignedSubscriber = counterCatalog.options.subscribers.find(option => option.id === existingCounter.subscriberId);
    if (!assignedSubscriber?.assigned) throw new Error('Assigned subscriber was not marked as unavailable.');
    let duplicateRejected = false;
    try {
      saveCatalog(db, 'counters', [{ counterNumber: 'SMOKE-DUPLICATE', subscriberId: existingCounter.subscriberId, active: true }]);
    } catch (error) {
      duplicateRejected = String(error?.message).includes('مرتبط بعداد');
    }
    if (!duplicateRejected) throw new Error('Duplicate subscriber meter assignment was not rejected.');
  }

  const boxId = db.prepare('SELECT id FROM boxes ORDER BY id LIMIT 1').pluck().get();
  const newSubscriberId = Number(db.prepare(`INSERT INTO subscribers(name,box_id,active) VALUES('SMOKE NEW SUBSCRIBER',?,1)`).run(boxId).lastInsertRowid);
  const refreshedCounterCatalog = getCatalog(db, 'counters');
  const newSubscriberOption = refreshedCounterCatalog.options.subscribers.find(option => option.id === newSubscriberId);
  if (!newSubscriberOption || newSubscriberOption.assigned) throw new Error('New subscriber was not available for meter assignment.');
  saveCatalog(db, 'counters', [{ counterNumber: 'SMOKE-NEW-METER', subscriberId: newSubscriberId, active: true }]);
  const newMeterCount = db.prepare('SELECT COUNT(*) FROM counters WHERE subscriber_id=?').pluck().get(newSubscriberId);
  if (newMeterCount !== 1) throw new Error('New subscriber meter assignment was not saved.');

  const subscriberCatalog = getCatalog(db, 'subscribers');
  const existingSubscriber = subscriberCatalog.rows[0];
  if (existingSubscriber) {
    saveCatalog(db, 'subscribers', [existingSubscriber]);
    let duplicateNameRejected = false;
    try {
      saveCatalog(db, 'subscribers', [{ name: existingSubscriber.name, boxId: existingSubscriber.boxId, active: true }]);
    } catch (error) {
      duplicateNameRejected = String(error?.message).includes('بالاسم نفسه');
    }
    if (!duplicateNameRejected) throw new Error('Duplicate subscriber name was not rejected.');
  }

  const consumptionId = db.prepare('SELECT id FROM consumption_periods ORDER BY id DESC LIMIT 1').pluck().get();
  if (consumptionId) {
    getConsumptionWorkspace(db, consumptionId);
    getMeterReport(db, consumptionId);
  }
  const legacyJulyId = db.prepare(`SELECT id FROM consumption_periods WHERE reference='2026071' ORDER BY id DESC LIMIT 1`).pluck().get();
  if (legacyJulyId) {
    const workspace = getConsumptionWorkspace(db, legacyJulyId);
    const report = getMeterReport(db, legacyJulyId);
    if (!workspace.details.some(row => Number(row.previousCounterValue) > 0)) throw new Error('Legacy suffixed reference did not load previous readings in registration.');
    if (!report.rows.some(row => Number(row.previousCounterValue) > 0)) throw new Error('Legacy suffixed reference did not load previous readings in report.');
  }

  const breakerMonthId = db.prepare('SELECT id FROM breaker_months ORDER BY id DESC LIMIT 1').pluck().get();
  if (breakerMonthId) getBreakerMonth(db, breakerMonthId);

  for (const kind of ['expenses', 'payments']) {
    const table = kind === 'expenses' ? 'expenses' : 'payments';
    const id = db.prepare(`SELECT id FROM ${table} ORDER BY id DESC LIMIT 1`).pluck().get();
    if (id) getFinance(db, kind, id);
  }
  getInstitutionDebts(db);

  console.log('JavaScript database and business-module smoke test passed.');
} finally {
  databaseModule.closeDatabase();
  Module._load = originalLoad;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
