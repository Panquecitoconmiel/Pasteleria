const toNum = (v, d) => (v === undefined || v === '' ? d : Number(v));

const stripeKey = process.env.STRIPE_SECRET_KEY || '';
// Seguridad: este proyecto está pensado para PRUEBAS. Rechazamos llaves live.
const stripeEnabled = stripeKey.startsWith('sk_test_') && !stripeKey.includes('xxxx');
if (stripeKey.startsWith('sk_live_')) {
  console.warn('⚠️  Se detectó una llave LIVE de Stripe. Este proyecto sólo acepta llaves de prueba (sk_test_). Stripe queda desactivado.');
}

module.exports = {
  port: toNum(process.env.PORT, 3000),
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-cambialo',
  currency: (process.env.CURRENCY || 'mxn').toLowerCase(),
  deliveryFee: toNum(process.env.DELIVERY_FEE, 45),
  freeDeliveryFrom: toNum(process.env.FREE_DELIVERY_FROM, 600),
  stripe: {
    enabled: stripeEnabled,
    secretKey: stripeEnabled ? stripeKey : null,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ''
  }
};
