"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openDatabase = openDatabase;
exports.closeDatabase = closeDatabase;
exports.getDatabasePath = getDatabasePath;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
let database;
function undoReportOrderMigration(db, seedPath) {
    if (!db.prepare(`SELECT 1 FROM app_metadata WHERE key='meter_report_order_v1'`).get() || !node_fs_1.default.existsSync(seedPath))
        return;
    const seed = new better_sqlite3_1.default(seedPath, { readonly: true });
    try {
        const regions = seed.prepare(`SELECT id,display_order displayOrder FROM regions`).all();
        const boxes = seed.prepare(`SELECT id,display_order displayOrder FROM boxes`).all();
        const run = db.transaction(() => { const regionUpdate = db.prepare(`UPDATE regions SET display_order=? WHERE id=?`), boxUpdate = db.prepare(`UPDATE boxes SET display_order=? WHERE id=?`); regions.forEach(row => regionUpdate.run(row.displayOrder, row.id)); boxes.forEach(row => boxUpdate.run(row.displayOrder, row.id)); db.prepare(`DELETE FROM app_metadata WHERE key='meter_report_order_v1'`).run(); });
        run();
    }
    finally {
        seed.close();
    }
}
function openDatabase() {
    if (database)
        return database;
    const databasePath = node_path_1.default.join(electron_1.app.getPath('userData'), 'ishtirak.sqlite');
    const seedPath = electron_1.app.isPackaged
        ? node_path_1.default.join(process.resourcesPath, 'initial-data.sqlite')
        : node_path_1.default.join(electron_1.app.getAppPath(), 'seed', 'initial-data.sqlite');
    if (!node_fs_1.default.existsSync(databasePath) && node_fs_1.default.existsSync(seedPath)) {
        node_fs_1.default.copyFileSync(seedPath, databasePath);
    }
    database = new better_sqlite3_1.default(databasePath);
    database.pragma('journal_mode = WAL');
    database.pragma('synchronous = NORMAL');
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
    database.pragma('temp_store = MEMORY');
    database.pragma('cache_size = -16384');
    database.pragma('mmap_size = 67108864');
    database.pragma('journal_size_limit = 8388608');
    database.exec(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, subscription_fee_lbp INTEGER NOT NULL,
      kilo_price_lbp INTEGER NOT NULL, pricing_date TEXT NOT NULL, display_order INTEGER NOT NULL,
      kilo_price_usd REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS boxes (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, region_id INTEGER NOT NULL,
      display_order INTEGER NOT NULL, FOREIGN KEY(region_id) REFERENCES regions(id)
    );
    CREATE TABLE IF NOT EXISTS breakers (
      id INTEGER PRIMARY KEY, type TEXT NOT NULL, price_lbp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS region_breaker_prices (
      id INTEGER PRIMARY KEY, region_id INTEGER NOT NULL, breaker_id INTEGER NOT NULL, price_lbp INTEGER NOT NULL,
      FOREIGN KEY(region_id) REFERENCES regions(id), FOREIGN KEY(breaker_id) REFERENCES breakers(id)
    );
    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY, subscriber_number INTEGER, name TEXT NOT NULL, address TEXT, phone TEXT, notes TEXT,
      box_id INTEGER NOT NULL, breaker_id INTEGER, active INTEGER NOT NULL CHECK(active IN (0,1)),
      FOREIGN KEY(box_id) REFERENCES boxes(id), FOREIGN KEY(breaker_id) REFERENCES breakers(id)
    );
    CREATE TABLE IF NOT EXISTS ampere_plans (
      id INTEGER PRIMARY KEY, amperes TEXT NOT NULL, subscription_fee_lbp INTEGER NOT NULL,
      subscription_fee_usd REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS counters (
      id INTEGER PRIMARY KEY, counter_number TEXT NOT NULL, subscriber_id INTEGER NOT NULL, ampere_plan_id INTEGER,
      insurance_fee_lbp INTEGER DEFAULT 0, counter_price_lbp INTEGER DEFAULT 0,
      active INTEGER NOT NULL CHECK(active IN (0,1)),
      FOREIGN KEY(subscriber_id) REFERENCES subscribers(id), FOREIGN KEY(ampere_plan_id) REFERENCES ampere_plans(id)
    );
    CREATE TABLE IF NOT EXISTS collectors (
      id INTEGER PRIMARY KEY, name TEXT, phone TEXT, active INTEGER CHECK(active IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS consumption_periods (
      id INTEGER PRIMARY KEY, reference TEXT NOT NULL, consumption_date TEXT NOT NULL, notes TEXT,
      dollar_rate INTEGER NOT NULL DEFAULT 1500
    );
    CREATE TABLE IF NOT EXISTS consumption_details (
      id INTEGER PRIMARY KEY, consumption_id INTEGER NOT NULL, subscriber_id INTEGER NOT NULL,
      counter_value INTEGER NOT NULL, kilo_price_lbp REAL NOT NULL DEFAULT 0, kilo_price_usd REAL DEFAULT 0,
      subscription_fee_lbp INTEGER NOT NULL DEFAULT 0, subscription_fee_usd REAL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '', paid INTEGER NOT NULL DEFAULT 0 CHECK(paid IN (0,1)),
      discount_lbp INTEGER NOT NULL DEFAULT 0, paid_value_lbp INTEGER NOT NULL DEFAULT 0,
      counter_id INTEGER NOT NULL, collector_id INTEGER NOT NULL, discount_usd REAL, paid_value_usd REAL,
      FOREIGN KEY(consumption_id) REFERENCES consumption_periods(id), FOREIGN KEY(subscriber_id) REFERENCES subscribers(id),
      FOREIGN KEY(collector_id) REFERENCES collectors(id)
    );
    CREATE TABLE IF NOT EXISTS breaker_months (
      id INTEGER PRIMARY KEY, reference TEXT NOT NULL, month_date TEXT NOT NULL, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS breaker_month_details (
      id INTEGER PRIMARY KEY, breaker_month_id INTEGER, subscriber_id INTEGER, breaker_id INTEGER,
      breaker_price_lbp INTEGER, discount_lbp INTEGER DEFAULT 0, notes TEXT,
      paid INTEGER CHECK(paid IN (0,1)), paid_value_lbp INTEGER DEFAULT 0,
      FOREIGN KEY(breaker_month_id) REFERENCES breaker_months(id), FOREIGN KEY(subscriber_id) REFERENCES subscribers(id),
      FOREIGN KEY(breaker_id) REFERENCES breakers(id)
    );
    CREATE TABLE IF NOT EXISTS expense_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY, reference TEXT NOT NULL, expense_date TEXT NOT NULL, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS expense_details (
      id INTEGER PRIMARY KEY, expense_id INTEGER NOT NULL, item_id INTEGER NOT NULL, quantity INTEGER NOT NULL, price_lbp INTEGER NOT NULL,
      FOREIGN KEY(expense_id) REFERENCES expenses(id), FOREIGN KEY(item_id) REFERENCES expense_items(id)
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY, reference TEXT NOT NULL, payment_date TEXT NOT NULL, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS payment_details (
      id INTEGER PRIMARY KEY, payment_id INTEGER NOT NULL, expense_id INTEGER NOT NULL, expense_detail_id INTEGER NOT NULL,
      paid_value_lbp INTEGER NOT NULL, notes TEXT,
      FOREIGN KEY(payment_id) REFERENCES payments(id), FOREIGN KEY(expense_id) REFERENCES expenses(id),
      FOREIGN KEY(expense_detail_id) REFERENCES expense_details(id)
    );
    CREATE TABLE IF NOT EXISTS repayments (
      id INTEGER PRIMARY KEY, reference TEXT NOT NULL, repayment_date TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS repayment_details (
      id INTEGER PRIMARY KEY, repayment_id INTEGER NOT NULL, subscriber_id INTEGER NOT NULL,
      paid_value_lbp INTEGER NOT NULL, month_date TEXT NOT NULL, notes TEXT,
      FOREIGN KEY(repayment_id) REFERENCES repayments(id), FOREIGN KEY(subscriber_id) REFERENCES subscribers(id)
    );
    CREATE TABLE IF NOT EXISTS legacy_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source_name TEXT NOT NULL, source_backup_date TEXT,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, source_fingerprint TEXT NOT NULL UNIQUE
    );

    CREATE INDEX IF NOT EXISTS idx_subscribers_number ON subscribers(subscriber_number);
    CREATE INDEX IF NOT EXISTS idx_subscribers_name ON subscribers(name);
    CREATE INDEX IF NOT EXISTS idx_subscribers_active_box ON subscribers(active,box_id);
    CREATE INDEX IF NOT EXISTS idx_subscribers_breaker ON subscribers(breaker_id);
    CREATE INDEX IF NOT EXISTS idx_boxes_region_order ON boxes(region_id,display_order,id);
    CREATE INDEX IF NOT EXISTS idx_counters_subscriber ON counters(subscriber_id);
    CREATE INDEX IF NOT EXISTS idx_counters_active_subscriber ON counters(active,subscriber_id);
    CREATE INDEX IF NOT EXISTS idx_consumption_periods_reference ON consumption_periods(reference);
    CREATE INDEX IF NOT EXISTS idx_consumption_periods_reference_latest ON consumption_periods(reference,consumption_date DESC,id DESC);
    CREATE INDEX IF NOT EXISTS idx_consumption_periods_date ON consumption_periods(consumption_date,id);
    CREATE INDEX IF NOT EXISTS idx_consumption_details_period ON consumption_details(consumption_id);
    CREATE INDEX IF NOT EXISTS idx_consumption_details_subscriber ON consumption_details(subscriber_id);
    CREATE INDEX IF NOT EXISTS idx_consumption_details_counter ON consumption_details(counter_id,consumption_id);
    CREATE INDEX IF NOT EXISTS idx_consumption_details_history ON consumption_details(subscriber_id,counter_id,consumption_id);
    CREATE INDEX IF NOT EXISTS idx_breaker_months_reference ON breaker_months(reference);
    CREATE INDEX IF NOT EXISTS idx_breaker_months_date ON breaker_months(month_date,id);
    CREATE INDEX IF NOT EXISTS idx_breaker_month_details_month ON breaker_month_details(breaker_month_id);
    CREATE INDEX IF NOT EXISTS idx_breaker_month_details_subscriber ON breaker_month_details(subscriber_id);
    CREATE INDEX IF NOT EXISTS idx_expense_details_expense ON expense_details(expense_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_reference_date ON expenses(reference,expense_date);
    CREATE INDEX IF NOT EXISTS idx_payment_details_payment ON payment_details(payment_id);
    CREATE INDEX IF NOT EXISTS idx_payment_details_expense_detail ON payment_details(expense_detail_id);
    CREATE INDEX IF NOT EXISTS idx_payments_reference_date ON payments(reference,payment_date);
    CREATE INDEX IF NOT EXISTS idx_repayment_details_repayment ON repayment_details(repayment_id);
  `);
    const ensureColumn = (table, column, declaration) => { const columns = database.pragma(`table_info(${table})`); if (!columns.some(item => item.name === column))
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`); };
    ensureColumn('breakers', 'price_usd', 'REAL NOT NULL DEFAULT 0');
    ensureColumn('breaker_month_details', 'breaker_price_usd', 'REAL NOT NULL DEFAULT 0');
    ensureColumn('breaker_month_details', 'discount_usd', 'REAL NOT NULL DEFAULT 0');
    ensureColumn('breaker_month_details', 'paid_value_usd', 'REAL NOT NULL DEFAULT 0');
    undoReportOrderMigration(database, seedPath);
    return database;
}
function closeDatabase() {
    database?.close();
    database = undefined;
}
function getDatabasePath() {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'ishtirak.sqlite');
}
