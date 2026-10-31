const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('../db');
const orders = require('../services/orders');
const { signAdmin, requireAdmin, COOKIE } = require('../middleware/auth');

// ---------- Subida de imágenes ----------
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(path.extname(file.originalname).toLowerCase())
      && file.mimetype.startsWith('image/');
    cb(ok ? null : Object.assign(new Error('Sólo imágenes JPG, PNG, WEBP o GIF (máx. 5 MB)'), { status: 400 }), ok);
  }
});

function removeUpload(imagePath) {
  if (imagePath && imagePath.startsWith('/uploads/')) {
    fs.unlink(path.join(uploadDir, path.basename(imagePath)), () => {});
  }
}

// ---------- Sesión ----------
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const [[admin]] = await db.query('SELECT * FROM admins WHERE email = ?', [String(email || '').trim().toLowerCase()]);
    if (!admin || !(await bcrypt.compare(String(password || ''), admin.password_hash))) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    signAdmin(res, admin);
    res.json({ name: admin.name, email: admin.email });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

router.use(requireAdmin);

router.get('/me', (req, res) => res.json(req.admin));

// ---------- Resumen ----------
router.get('/stats', async (req, res, next) => {
  try {
    const [[today]] = await db.query(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders
        WHERE DATE(created_at) = CURDATE() AND (payment_status = 'paid' OR payment_method = 'cash') AND status <> 'cancelled'`);
    const [[active]] = await db.query(
      "SELECT COUNT(*) AS n FROM orders WHERE status IN ('received','preparing','ready','on_the_way')");
    const [[products]] = await db.query('SELECT COUNT(*) AS n FROM products');
    res.json({ todayOrders: today.orders, todayRevenue: Number(today.revenue), activeOrders: active.n, products: products.n });
  } catch (e) { next(e); }
});

// ---------- Categorías ----------
router.get('/categories', async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM categories ORDER BY sort_order, name');
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/categories', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const [r] = await db.query('INSERT INTO categories (name, slug, emoji, sort_order) VALUES (?,?,?,?)',
      [name, slug, req.body.emoji || '🍰', Number(req.body.sort_order) || 0]);
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Esa categoría ya existe' });
    next(e);
  }
});

router.delete('/categories/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- Productos (pasteles) ----------
router.get('/products', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.created_at DESC`);
    res.json(rows);
  } catch (e) { next(e); }
});

function productFields(body) {
  const name = String(body.name || '').trim();
  const price = Number(body.price);
  if (!name) throw orders.httpError(400, 'El nombre es obligatorio');
  if (!(price > 0)) throw orders.httpError(400, 'El precio debe ser mayor a 0');
  return {
    name,
    description: String(body.description || '').trim(),
    price,
    category_id: body.category_id ? Number(body.category_id) : null,
    prep_minutes: Number(body.prep_minutes) || 30,
    featured: body.featured === 'true' || body.featured === '1' || body.featured === 'on' ? 1 : 0,
    available: body.available === 'false' || body.available === '0' ? 0 : 1
  };
}

router.post('/products', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) throw orders.httpError(400, 'Agrega la foto del pastel');
    const f = productFields(req.body);
    const image = `/uploads/${req.file.filename}`;
    const [r] = await db.query(
      `INSERT INTO products (name, description, price, category_id, prep_minutes, featured, available, image)
       VALUES (?,?,?,?,?,?,?,?)`,
      [f.name, f.description, f.price, f.category_id, f.prep_minutes, f.featured, f.available, image]);
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    next(e);
  }
});

router.put('/products/:id', upload.single('image'), async (req, res, next) => {
  try {
    const [[current]] = await db.query('SELECT image FROM products WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'No existe' });
    const f = productFields(req.body);
    const image = req.file ? `/uploads/${req.file.filename}` : current.image;
    await db.query(
      `UPDATE products SET name=?, description=?, price=?, category_id=?, prep_minutes=?, featured=?, available=?, image=? WHERE id=?`,
      [f.name, f.description, f.price, f.category_id, f.prep_minutes, f.featured, f.available, image, req.params.id]);
    if (req.file) removeUpload(current.image);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.patch('/products/:id/availability', async (req, res, next) => {
  try {
    await db.query('UPDATE products SET available = ? WHERE id = ?', [req.body.available ? 1 : 0, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    const [[p]] = await db.query('SELECT image FROM products WHERE id = ?', [req.params.id]);
    await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (p) removeUpload(p.image);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- Pedidos ----------
router.get('/orders', async (req, res, next) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = "WHERE NOT (o.payment_method = 'card' AND o.payment_status = 'pending' AND o.created_at < NOW() - INTERVAL 1 DAY)";
    if (status === 'active') where += " AND o.status IN ('received','preparing','ready','on_the_way')";
    else if (status) { where += ' AND o.status = ?'; params.push(status); }
    const [rows] = await db.query(
      `SELECT o.id, o.code, o.customer_name, o.customer_phone, o.delivery_type, o.address, o.address_notes,
              o.payment_method, o.payment_status, o.status, o.total, o.created_at,
              (SELECT GROUP_CONCAT(CONCAT(quantity, '× ', product_name, IFNULL(CONCAT(' (', notes, ')'), '')) SEPARATOR '\n')
                 FROM order_items WHERE order_id = o.id) AS items
         FROM orders o ${where} ORDER BY o.created_at DESC LIMIT 200`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

router.patch('/orders/:id/status', async (req, res, next) => {
  try {
    await orders.setStatus(Number(req.params.id), req.body.status);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
