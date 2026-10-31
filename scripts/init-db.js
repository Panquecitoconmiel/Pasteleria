// Crea la base de datos, las tablas y los productos de ejemplo usando database/schema.sql
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const dbName = process.env.DB_NAME || 'mafer';
  let sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  // Permite usar otro nombre de base de datos desde .env
  sql = sql.replace(/CREATE DATABASE IF NOT EXISTS mafer/g, `CREATE DATABASE IF NOT EXISTS \`${dbName}\``)
           .replace(/USE mafer;/g, `USE \`${dbName}\`;`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });
  await conn.query(sql);
  await conn.end();
  console.log(`✅ Base de datos "${dbName}" lista. Sube tus pasteles desde /admin/`);
})().catch((e) => {
  console.error('❌ Error al inicializar la base de datos:', e.message);
  process.exit(1);
});
