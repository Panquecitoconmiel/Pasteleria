// Sesión de clientes (iniciada con Google)
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');

const COOKIE = 'mafer_user';

function signUser(res, user) {
  const token = jwt.sign({ uid: user.id, kind: 'customer' }, jwtSecret, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

function readUserId(req) {
  const token = req.cookies[COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, jwtSecret);
    return p.kind === 'customer' ? p.uid : null;
  } catch {
    return null;
  }
}

function requireUser(req, res, next) {
  const uid = readUserId(req);
  if (!uid) return res.status(401).json({ error: 'Inicia sesión con Google para hacer tu pedido', needLogin: true });
  req.userId = uid;
  next();
}

module.exports = { signUser, readUserId, requireUser, COOKIE };
