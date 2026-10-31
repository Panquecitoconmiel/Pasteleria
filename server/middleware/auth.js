const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');

const COOKIE = 'mafer_admin';

function signAdmin(res, admin) {
  const token = jwt.sign({ id: admin.id, email: admin.email, name: admin.name }, jwtSecret, { expiresIn: '8h' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  });
}

function requireAdmin(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.admin = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión expirada' });
  }
}

module.exports = { signAdmin, requireAdmin, COOKIE };
