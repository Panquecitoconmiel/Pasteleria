// Inicio de sesión de clientes con Google
const router = require('express').Router();
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');
const config = require('../config');
const { signUser, readUserId, requireUser, COOKIE } = require('../middleware/customer');

const google = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

const publicUser = (u) => u && ({
  id: u.id, name: u.name, email: u.email, picture: u.picture,
  phone: u.phone, address: u.address, addressNotes: u.address_notes
});

// El navegador manda el "credential" que entrega el botón de Google; aquí lo verificamos con Google
router.post('/google', async (req, res, next) => {
  try {
    if (!google) return res.status(400).json({ error: 'Falta configurar GOOGLE_CLIENT_ID en el .env' });
    let payload;
    try {
      const ticket = await google.verifyIdToken({ idToken: String(req.body.credential || ''), audience: config.googleClientId });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: 'No pudimos verificar tu cuenta de Google' });
    }
    if (!payload.email_verified) return res.status(401).json({ error: 'Tu correo de Google no está verificado' });

    await db.query(
      `INSERT INTO users (google_id, email, name, picture) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name), picture = VALUES(picture), last_login = NOW()`,
      [payload.sub, payload.email, payload.name || payload.email, payload.picture || null]);
    const [[user]] = await db.query('SELECT * FROM users WHERE google_id = ?', [payload.sub]);
    signUser(res, user);
    res.json(publicUser(user));
  } catch (e) { next(e); }
});

router.get('/me', async (req, res, next) => {
  try {
    const uid = readUserId(req);
    if (!uid) return res.json({ user: null });
    const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [uid]);
    res.json({ user: publicUser(user) || null });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

// Historial de pedidos del cliente
router.get('/orders', requireUser, async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT o.code, o.status, o.total, o.delivery_type, o.payment_method, o.payment_status, o.created_at,
              (SELECT GROUP_CONCAT(CONCAT(quantity, '× ', product_name) SEPARATOR ', ') FROM order_items WHERE order_id = o.id) AS items
         FROM orders o
        WHERE o.user_id = ? AND NOT (o.payment_method = 'card' AND o.payment_status = 'pending' AND o.created_at < NOW() - INTERVAL 1 DAY)
        ORDER BY o.created_at DESC LIMIT 50`, [req.userId]);
    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;
