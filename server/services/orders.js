const crypto = require('crypto');
const db = require('../db');
const config = require('../config');

const STATUS_LABELS = {
  pending: 'Esperando pago',
  received: 'Pedido recibido',
  preparing: 'En el horno',
  ready: 'Listo para recoger',
  on_the_way: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado'
};

function newCode() {
  // 8 caracteres sin confusiones (sin 0/O, 1/I)
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'MF-';
  for (const b of crypto.randomBytes(6)) out += abc[b % abc.length];
  return out;
}

const round = (n) => Math.round(n * 100) / 100;

/** Recalcula precios con la base de datos: nunca confiamos en el precio que manda el navegador. */
async function priceCart(items, deliveryType, tip = 0) {
  if (!Array.isArray(items) || items.length === 0) throw httpError(400, 'El carrito está vacío');
  const ids = [...new Set(items.map((i) => Number(i.id)).filter(Boolean))];
  const [products] = await db.query('SELECT id, name, price, available FROM products WHERE id IN (?)', [ids]);
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = items.map((i) => {
    const p = byId.get(Number(i.id));
    if (!p || !p.available) throw httpError(400, 'Un producto ya no está disponible');
    const quantity = Math.min(Math.max(parseInt(i.quantity, 10) || 1, 1), 50);
    return {
      product_id: p.id,
      product_name: p.name,
      unit_price: Number(p.price),
      quantity,
      notes: String(i.notes || '').slice(0, 255)
    };
  });

  const subtotal = round(lines.reduce((s, l) => s + l.unit_price * l.quantity, 0));
  const deliveryFee = deliveryType === 'delivery' && subtotal < config.freeDeliveryFrom ? config.deliveryFee : 0;
  const safeTip = round(Math.min(Math.max(Number(tip) || 0, 0), 1000));
  return { lines, subtotal, deliveryFee, tip: safeTip, total: round(subtotal + deliveryFee + safeTip) };
}

async function createOrder(payload) {
  const { customer = {}, items, deliveryType = 'delivery', paymentMethod = 'card', tip } = payload;
  const name = String(customer.name || '').trim();
  const phone = String(customer.phone || '').trim();
  if (!name || !phone) throw httpError(400, 'Nombre y teléfono son obligatorios');
  if (!['delivery', 'pickup'].includes(deliveryType)) throw httpError(400, 'Tipo de entrega inválido');
  if (!['card', 'cash'].includes(paymentMethod)) throw httpError(400, 'Método de pago inválido');
  if (deliveryType === 'delivery' && !String(customer.address || '').trim()) throw httpError(400, 'La dirección es obligatoria');

  const priced = await priceCart(items, deliveryType, tip);
  const code = newCode();
  const initialStatus = paymentMethod === 'cash' ? 'received' : 'pending';

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO orders (code, customer_name, customer_phone, customer_email, delivery_type, address, address_notes,
                           payment_method, status, subtotal, delivery_fee, tip, total)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [code, name, phone, customer.email || null, deliveryType,
       deliveryType === 'delivery' ? customer.address : null, customer.addressNotes || null,
       paymentMethod, initialStatus, priced.subtotal, priced.deliveryFee, priced.tip, priced.total]);
    const orderId = r.insertId;
    for (const l of priced.lines) {
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, notes) VALUES (?,?,?,?,?,?)',
        [orderId, l.product_id, l.product_name, l.unit_price, l.quantity, l.notes || null]);
    }
    await conn.query('INSERT INTO order_status_history (order_id, status) VALUES (?,?)', [orderId, initialStatus]);
    await conn.commit();
    return { id: orderId, code, ...priced };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function setStatus(orderId, status) {
  if (!STATUS_LABELS[status]) throw httpError(400, 'Estado inválido');
  await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
  await db.query('INSERT INTO order_status_history (order_id, status) VALUES (?,?)', [orderId, status]);
}

async function markPaid(orderId) {
  const [[o]] = await db.query('SELECT payment_status FROM orders WHERE id = ?', [orderId]);
  if (!o || o.payment_status === 'paid') return;
  await db.query("UPDATE orders SET payment_status = 'paid' WHERE id = ?", [orderId]);
  await setStatus(orderId, 'received');
}

async function getOrderByCode(code) {
  const [[order]] = await db.query('SELECT * FROM orders WHERE code = ?', [code]);
  if (!order) return null;
  const [items] = await db.query('SELECT product_name, unit_price, quantity, notes FROM order_items WHERE order_id = ?', [order.id]);
  const [history] = await db.query('SELECT status, created_at FROM order_status_history WHERE order_id = ? ORDER BY id', [order.id]);
  return { ...order, items, history, status_label: STATUS_LABELS[order.status] };
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = { createOrder, setStatus, markPaid, getOrderByCode, priceCart, STATUS_LABELS, httpError };
