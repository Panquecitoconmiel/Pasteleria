require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const config = require('./config');
const db = require('./db');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// El webhook de Stripe va ANTES de express.json (necesita el cuerpo crudo)
app.use('/api/payments/webhook', require('./routes/webhook'));

app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

app.use('/api', require('./routes/catalog'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/admin', require('./routes/admin'));

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Manejo de errores
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Ocurrió un error en el servidor' : err.message });
});

async function ensureAdmin() {
  await require('./migrate')();
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM admins');
  if (n > 0) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@mafer.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'mafer123';
  await db.query('INSERT INTO admins (name, email, password_hash) VALUES (?,?,?)',
    ['Administradora Mafer', email, await bcrypt.hash(password, 10)]);
  console.log(`👩‍🍳 Administrador creado: ${email}`);
}

app.listen(config.port, async () => {
  console.log(`🧁 Mafer corriendo en ${config.baseUrl}`);
  console.log(config.stripe.enabled ? '💳 Stripe en MODO PRUEBA' : '💳 Stripe desactivado (agrega STRIPE_SECRET_KEY=sk_test_...)');
  console.log(config.googleClientId ? '🔐 Inicio de sesión con Google activo' : '🔐 Falta GOOGLE_CLIENT_ID: los clientes no podrán iniciar sesión ni pedir');
  try {
    await ensureAdmin();
  } catch (e) {
    console.error('❌ No se pudo conectar a MySQL. Revisa tu .env y ejecuta: npm run db:init\n  ', e.message);
  }
});
