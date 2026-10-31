// Actualiza la base de datos de quien ya la tenía creada (se ejecuta al arrancar el servidor)
const db = require('./db');

async function columnExists(table, column) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, column]);
  return row.n > 0;
}

async function migrate() {
  await db.query(`CREATE TABLE IF NOT EXISTS settings (
    \`key\` VARCHAR(60) PRIMARY KEY, value VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);

  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    google_id  VARCHAR(64) NOT NULL UNIQUE,
    email      VARCHAR(150) NOT NULL,
    name       VARCHAR(120) NOT NULL,
    picture    VARCHAR(500),
    phone      VARCHAR(30),
    address    VARCHAR(255),
    address_notes VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

  if (!(await columnExists('orders', 'user_id'))) {
    await db.query('ALTER TABLE orders ADD COLUMN user_id INT NULL AFTER code, ADD INDEX idx_orders_user (user_id)');
    await db.query('ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL');
  }
}

module.exports = migrate;
