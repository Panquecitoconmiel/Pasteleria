const express = require('express');
const router = express.Router();
const config = require('../config');
const orders = require('../services/orders');
const stripe = config.stripe.enabled ? require('stripe')(config.stripe.secretKey) : null;

// Stripe necesita el cuerpo "crudo" para verificar la firma
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !config.stripe.webhookSecret) return res.status(400).send('Webhook no configurado');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripe.webhookSecret);
  } catch (err) {
    return res.status(400).send(`Firma inválida: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const s = event.data.object;
      if (s.payment_status === 'paid' && s.metadata?.order_id) await orders.markPaid(Number(s.metadata.order_id));
    }
    res.json({ received: true });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error');
  }
});

module.exports = router;
