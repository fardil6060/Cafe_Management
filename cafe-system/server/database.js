const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.CAFE_DB_PATH || path.join(__dirname, 'data', 'cafe.db');

let db = null;

async function initDB() {
  const SQL = await initSqlJs();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing database from disk.');
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new database.');
  }

  createSchema();
  saveDB();
  return db;
}

function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name_en   TEXT NOT NULL,
      name_bn   TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id   INTEGER NOT NULL,
      name_en       TEXT NOT NULL,
      name_bn       TEXT NOT NULL,
      description_en TEXT DEFAULT '',
      description_bn TEXT DEFAULT '',
      price         REAL NOT NULL,
      image_url     TEXT DEFAULT '',
      is_available  INTEGER DEFAULT 1,
      stock_qty     INTEGER DEFAULT 0,
      track_stock   INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tables (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      qr_token   TEXT UNIQUE NOT NULL,
      seat_count INTEGER DEFAULT 4,
      status     TEXT DEFAULT 'available',
      locked_by  INTEGER DEFAULT NULL,
      locked_by_name TEXT DEFAULT '',
      locked_by_phone TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      table_id     INTEGER NOT NULL,
      customer_id  INTEGER,
      customer_name TEXT DEFAULT '',
      customer_phone TEXT DEFAULT '',
      status       TEXT DEFAULT 'pending',
      note         TEXT DEFAULT '',
      total        REAL DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (table_id) REFERENCES tables(id)
    );
  `);

  // Migrate existing database - add missing columns
  migrateDB();

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id    INTEGER NOT NULL,
      item_id     INTEGER NOT NULL,
      item_name   TEXT NOT NULL,
      price       REAL NOT NULL,
      quantity    INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (item_id)  REFERENCES menu_items(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT DEFAULT '',
      phone      TEXT DEFAULT '',
      visit_count INTEGER DEFAULT 1,
      total_spent REAL DEFAULT 0,
      last_visit  TEXT DEFAULT (datetime('now')),
      created_at  TEXT DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sales (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id    INTEGER NOT NULL,
      customer_id INTEGER,
      total       REAL NOT NULL,
      paid_at     TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (order_id)    REFERENCES orders(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  seedDefaults();
  createIndexes();
}

function migrateDB() {
  // Add customer_id to orders if it doesn't exist
  try {
    const orderColumns = db.exec("PRAGMA table_info(orders)");
    const hasCustomerId = orderColumns[0]?.values.some(col => col[1] === 'customer_id');
    
    if (!hasCustomerId) {
      db.run('ALTER TABLE orders ADD COLUMN customer_id INTEGER');
      console.log('[DB] Migration: Added customer_id to orders table');
    }
  } catch (err) {
    console.error('[DB] Migration error (orders):', err.message);
  }

  // Add order_number to orders if it doesn't exist
  try {
    const orderColumns = db.exec("PRAGMA table_info(orders)");
    const hasOrderNumber = orderColumns[0]?.values.some(col => col[1] === 'order_number');
    
    if (!hasOrderNumber) {
      db.run('ALTER TABLE orders ADD COLUMN order_number TEXT');
      console.log('[DB] Migration: Added order_number to orders table');
    }
  } catch (err) {
    console.error('[DB] Migration error (order_number):', err.message);
  }

  // Add locked_by to tables if it doesn't exist
  try {
    const tableColumns = db.exec("PRAGMA table_info(tables)");
    const hasLockedBy = tableColumns[0]?.values.some(col => col[1] === 'locked_by');
    
    if (!hasLockedBy) {
      db.run('ALTER TABLE tables ADD COLUMN locked_by INTEGER DEFAULT NULL');
      console.log('[DB] Migration: Added locked_by to tables table');
    }
  } catch (err) {
    console.error('[DB] Migration error (tables):', err.message);
  }

  // Add locked_by_name and locked_by_phone to tables if they don't exist
  try {
    const tableColumns = db.exec("PRAGMA table_info(tables)");
    const hasLockedByName = tableColumns[0]?.values.some(col => col[1] === 'locked_by_name');
    
    if (!hasLockedByName) {
      db.run('ALTER TABLE tables ADD COLUMN locked_by_name TEXT DEFAULT ""');
      console.log('[DB] Migration: Added locked_by_name to tables table');
    }
  } catch (err) {
    console.error('[DB] Migration error (locked_by_name):', err.message);
  }
  
  try {
    const tableColumns = db.exec("PRAGMA table_info(tables)");
    const hasLockedByPhone = tableColumns[0]?.values.some(col => col[1] === 'locked_by_phone');
    
    if (!hasLockedByPhone) {
      db.run('ALTER TABLE tables ADD COLUMN locked_by_phone TEXT DEFAULT ""');
      console.log('[DB] Migration: Added locked_by_phone to tables table');
    }
  } catch (err) {
    console.error('[DB] Migration error (locked_by_phone):', err.message);
  }
}

function createIndexes() {
  db.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_orders_table_status ON orders(table_id, status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_sales_paid_at ON sales(paid_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_sales_order_id ON sales(order_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)');
}

function generateOrderNumber() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like 0, O, 1, I
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function seedDefaults() {
  const adminExists = db.exec("SELECT id FROM admin_users WHERE username = 'admin'");
  if (!adminExists[0]) {
    db.run("INSERT INTO admin_users (username, password) VALUES ('admin', 'admin123')");
    console.log('[DB] Default admin created: admin / admin123');
  }

  const tablesExist = db.exec("SELECT id FROM tables LIMIT 1");
  if (!tablesExist[0]) {
    const { v4: uuidv4 } = require('uuid');
    for (let i = 1; i <= 10; i++) {
      const token = uuidv4().replace(/-/g, '').substring(0, 12);
      db.run(
        "INSERT INTO tables (name, qr_token, seat_count) VALUES (?, ?, ?)",
        [`Table ${i}`, token, 4]
      );
    }
    console.log('[DB] 10 tables seeded with unique QR tokens.');
  }

  const catExists = db.exec("SELECT id FROM categories LIMIT 1");
  if (!catExists[0]) {
    db.run("INSERT INTO categories (name_en, name_bn, sort_order) VALUES ('Drinks', 'পানীয়', 1)");
    db.run("INSERT INTO categories (name_en, name_bn, sort_order) VALUES ('Snacks', 'নাস্তা', 2)");
    db.run("INSERT INTO categories (name_en, name_bn, sort_order) VALUES ('Main Course', 'মূল খাবার', 3)");
    db.run("INSERT INTO categories (name_en, name_bn, sort_order) VALUES ('Desserts', 'মিষ্টান্ন', 4)");

    db.run("INSERT INTO menu_items (category_id, name_en, name_bn, description_en, description_bn, price, is_available, stock_qty, track_stock) VALUES (1, 'Hot Tea', 'গরম চা', 'Classic milk tea', 'ক্লাসিক দুধ চা', 30, 1, 100, 1)");
    db.run("INSERT INTO menu_items (category_id, name_en, name_bn, description_en, description_bn, price, is_available, stock_qty, track_stock) VALUES (1, 'Cold Coffee', 'ঠান্ডা কফি', 'Chilled blended coffee', 'ঠান্ডা মিশ্রিত কফি', 80, 1, 50, 1)");
    db.run("INSERT INTO menu_items (category_id, name_en, name_bn, description_en, description_bn, price, is_available, stock_qty, track_stock) VALUES (2, 'Samosa', 'সমোসা', 'Crispy fried pastry', 'মচমচে ভাজা পেস্ট্রি', 20, 1, 60, 1)");
    db.run("INSERT INTO menu_items (category_id, name_en, name_bn, description_en, description_bn, price, is_available, stock_qty, track_stock) VALUES (3, 'Chicken Rice', 'চিকেন রাইস', 'Grilled chicken with rice', 'ভাত ও গ্রিলড চিকেন', 180, 1, 30, 1)");
    db.run("INSERT INTO menu_items (category_id, name_en, name_bn, description_en, description_bn, price, is_available, stock_qty, track_stock) VALUES (4, 'Rasgulla', 'রসগোল্লা', 'Soft cottage cheese balls in syrup', 'সিরাপে নরম ছানার বল', 40, 1, 40, 1)");
    console.log('[DB] Sample categories and menu items seeded.');
  }
}

function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function getDB() {
  return db;
}

function query(sql, params = []) {
  try {
    const result = db.exec(sql, params);
    if (!result[0]) return [];
    const { columns, values } = result[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  } catch (err) {
    console.error('[DB Query Error]', err.message, sql);
    throw err;
  }
}

function run(sql, params = []) {
  try {
    db.run(sql, params);
    // Capture last_insert_rowid BEFORE saveDB() resets it to 0
    const lastId = db.exec("SELECT last_insert_rowid() as id");
    const insertedId = lastId[0]?.values[0][0] ?? null;
    saveDB();
    return {
      lastInsertRowid: insertedId,
      changes: 1
    };
  } catch (err) {
    console.error('[DB Run Error]', err.message, sql);
    throw err;
  }
}

module.exports = { initDB, getDB, query, run, saveDB, generateOrderNumber };
