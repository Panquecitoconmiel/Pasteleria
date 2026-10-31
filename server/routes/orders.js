const router = require('express').Router();
const db = require('../db');
const config = require('../config');
const orders = require('../services/orders');
const { requireUser } = require('../middleware/customer');
const stripe = config.stripe.enabled ? require('stripe')(config.stripe.secretKey) : null;

// Cotizar carrito (subtotal, envío, total) sin crear pedido
router.post('/quote', async (req, res, next) => {
  try {
    const { items, deliveryType, tip } = req.body;
    const q = await orders.priceCart(items, deliveryType, tip);
    res.json({ subtotal: q.subtotal, deliveryFee: q.deliveryFee, tip: q.tip, total: q.total });
  } catch (e) { next(e); }
});

// Crear pedido. Si es con tarjeta, abre una sesión de Stripe Checkout (modo prueba)
router.post('/', requireUser, async (req, res, next) => {
  try {
    const { paymentMethod = 'card' } = req.body;
    if (paymentMethod === 'card' && !stripe) {
      return res.status(400).json({ error: 'El pago con tarjeta no está configurado. Agrega tus llaves sk_test_ de Stripe en .env' });
    }
    const order = await orders.createOrder({ ...req.body, userId: req.userId });

    if (paymentMethod === 'cash') {
      return res.json({ code: order.code, redirect: `/pedido.html?code=${order.code}` });
    }

    const line_items = order.lines.map((l) => ({
      quantity: l.quantity,
      price_data: {
        currency: config.currency,
        unit_amount: Math.round(l.unit_price * 100),
        product_data: { name: l.product_name, ...(l.notes ? { description: l.notes } : {}) }
      }
    }));
    if (order.deliveryFee > 0) {
      line_items.push({ quantity: 1, price_data: { currency: config.currency, unit_amount: Math.round(order.deliveryFee * 100), product_data: { name: 'Envío a domicilio' } } });
    }
    if (order.tip > 0) {
      line_items.push({ quantity: 1, price_data: { currency: config.currency, unit_amount: Math.round(order.tip * 100), product_data: { name: 'Propina para el repartidor' } } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      customer_email: order.email || undefined,
      client_reference_id: String(order.id),
      metadata: { order_id: String(order.id), order_code: order.code },
      success_url: `${config.baseUrl}/pedido.html?code=${order.code}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.baseUrl}/checkout.html?cancelled=${order.code}`
    });

    await db.query('UPDATE orders SET stripe_session_id = ? WHERE id = ?', [session.id, order.id]);
    res.json({ code: order.code, redirect: session.url });
  } catch (e) { next(e); }
});

// Confirmar pago al volver de Stripe (respaldo por si el webhook no está configurado)
router.get('/confirm', async (req, res, next) => {
  try {
    if (!stripe) return res.status(400).json({ error: 'Stripe no configurado' });
    const session = await stripe.checkout.sessions.retrieve(String(req.query.session_id || ''));
    const [[order]] = await db.query('SELECT id, code FROM orders WHERE stripe_session_id = ?', [session.id]);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (session.payment_status === 'paid') await orders.markPaid(order.id);
    res.json({ code: order.code, paid: session.payment_status === 'paid' });
  } catch (e) { next(e); }
});

// Seguimiento del pedido
router.get('/:code', async (req, res, next) => {
  try {
    const order = await orders.getOrderByCode(String(req.params.code).toUpperCase());
    if (!order) return res.status(404).json({ error: 'No encontramos ese pedido' });
    // No exponemos el id interno ni la sesión de Stripe
    const { id, stripe_session_id, customer_phone, customer_email, ...publicOrder } = order;
    res.json(publicOrder);
  } catch (e) { next(e); }
});

module.exports = router;
