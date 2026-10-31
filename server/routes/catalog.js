const router = require('express').Router();
const db = require('../db');
const config = require('../config');

// Configuración pública para el frontend
router.get('/config', (req, res) => {
  res.json({
    currency: config.currency,
    deliveryFee: config.deliveryFee,
    freeDeliveryFrom: config.freeDeliveryFrom,
    stripeEnabled: config.stripe.enabled,
    testMode: true
  });
});

// Fotos de la portada (las sube el admin en la pestaña "Portada")
router.get('/hero', async (req, res, next) => {
  try {
    const [rows] = await db.query("SELECT `key`, value FROM settings WHERE `key` IN ('hero_left','hero_right')");
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({ left: s.hero_left || null, right: s.hero_right || null });
  } catch (e) { next(e); }
});

router.get('/categories', async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT id, name, slug, emoji FROM categories ORDER BY sort_order, name');
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/products', async (req, res, next) => {
  try {
    const { category, q, featured } = req.query;
    const where = ['p.available = 1'];
    const params = [];
    if (category) { where.push('c.slug = ?'); params.push(category); }
    if (q) { where.push('(p.name LIKE ? OR p.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    if (featured === '1') where.push('p.featured = 1');
    const [rows] = await db.query(
      `SELECT p.id, p.name, p.description, p.price, p.image, p.prep_minutes, p.featured,
              c.name AS category, c.slug AS category_slug
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${where.join(' AND ')}
        ORDER BY p.featured DESC, p.name`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/products/:id', async (req, res, next) => {
  try {
    const [[row]] = await db.query(
      `SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = ? AND p.available = 1`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(row);
  } catch (e) { next(e); }
});

module.exports = router;
