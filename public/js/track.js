/* Mafer · seguimiento del pedido estilo app de reparto */
(() => {
  const { $, money, esc, api, cart } = window.Mafer;
  const params = new URLSearchParams(location.search);
  let code = (params.get('code') || '').toUpperCase();
  let timer;

  const DELIVERY_FLOW = [
    ['received', '📝', 'Pedido recibido', 'La pastelería ya tiene tu pedido'],
    ['preparing', '👩‍🍳', 'En el horno', 'Estamos preparando tus postres'],
    ['on_the_way', '🛵', 'En camino', 'Tu repartidor va hacia ti'],
    ['delivered', '🎉', 'Entregado', '¡Buen provecho!']
  ];
  const PICKUP_FLOW = [
    ['received', '📝', 'Pedido recibido', 'La pastelería ya tiene tu pedido'],
    ['preparing', '👩‍🍳', 'En el horno', 'Estamos preparando tus postres'],
    ['ready', '🛍', 'Listo para recoger', 'Pasa por él a la tienda'],
    ['delivered', '🎉', 'Entregado', '¡Buen provecho!']
  ];

  const showError = (msg) => { const el = $('[data-error]'); el.textContent = msg; el.hidden = !msg; };
  const time = (d) => new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  function render(o) {
    $('[data-tracker]').hidden = false;
    $('[data-lookup]').hidden = true;
    const flow = o.delivery_type === 'pickup' ? PICKUP_FLOW : DELIVERY_FLOW;
    const idx = flow.findIndex(([s]) => s === o.status);
    const when = Object.fromEntries(o.history.map((h) => [h.status, h.created_at]));

    $('[data-t-code]').textContent = o.code;
    let title, sub;
    if (o.status === 'pending') { title = 'Esperando pago'; sub = 'En cuanto se confirme el pago empezamos a hornear.'; }
    else if (o.status === 'cancelled') { title = 'Pedido cancelado'; sub = 'Si tienes dudas, llámanos.'; }
    else { title = flow[idx]?.[2] || o.status_label; sub = flow[idx]?.[3] || ''; }
    $('[data-t-title]').textContent = title;
    $('[data-t-sub]').textContent = sub;

    const progress = o.status === 'pending' ? 0 : Math.max(idx, 0) / (flow.length - 1);
    $('[data-t-rider]').style.left = `${6 + progress * 88}%`;
    $('[data-t-rider]').textContent = o.delivery_type === 'pickup' ? '🧁' : '🛵';

    $('[data-t-steps]').innerHTML = flow.map(([s, icon, label], i) => {
      const cls = o.status === 'cancelled' ? '' : i < idx || (i === idx && s === 'delivered') ? 'is-done' : i === idx ? 'is-current' : '';
      return `<li class="${cls}"><span class="dot">${icon}</span><span><strong>${label}</strong><small>${when[s] ? time(when[s]) : '—'}</small></span></li>`;
    }).join('');

    $('[data-t-items]').innerHTML = o.items.map((i) => `
      <div class="receipt-line"><span><strong>${i.quantity}×</strong> ${esc(i.product_name)}${i.notes ? `<br><small class="muted">“${esc(i.notes)}”</small>` : ''}</span><span>${money(i.unit_price * i.quantity)}</span></div>`).join('');
    $('[data-t-subtotal]').textContent = money(o.subtotal);
    $('[data-t-delivery]').textContent = o.delivery_type === 'pickup' ? 'Recoger en tienda' : Number(o.delivery_fee) === 0 ? 'Gratis' : money(o.delivery_fee);
    $('[data-t-tip]').textContent = money(o.tip);
    $('[data-t-tip-row]').hidden = Number(o.tip) === 0;
    $('[data-t-total]').textContent = money(o.total);
    const payText = o.payment_method === 'cash'
      ? '💵 Pago en efectivo al recibir'
      : { paid: '💳 Pagado con tarjeta', pending: '💳 Pago con tarjeta pendiente', failed: '💳 Pago rechazado', refunded: '💳 Reembolsado' }[o.payment_status];
    $('[data-t-payment]').textContent = `${payText} · ${o.delivery_type === 'pickup' ? 'Recoger en tienda' : esc(o.address || '')}`;

    clearTimeout(timer);
    if (!['delivered', 'cancelled'].includes(o.status)) timer = setTimeout(load, 8000);
  }

  async function load() {
    try {
      render(await api(`/api/orders/${encodeURIComponent(code)}`));
      showError('');
    } catch (e) {
      showError(e.message);
      $('[data-lookup]').hidden = false;
    }
  }

  async function start() {
    const sessionId = params.get('session_id');
    if (sessionId) {
      try {
        const r = await api(`/api/orders/confirm?session_id=${encodeURIComponent(sessionId)}`);
        if (r.paid) cart.clear();
        code = r.code;
        history.replaceState(null, '', `/pedido.html?code=${r.code}`);
      } catch (e) { showError(e.message); }
    }
    if (!code) {
      let last = '';
      try { last = localStorage.getItem('mafer_last_order') || ''; } catch {}
      $('[data-lookup]').hidden = false;
      $('#code').value = last;
      return;
    }
    load();
  }

  $('[data-lookup]').addEventListener('submit', (e) => {
    e.preventDefault();
    code = $('#code').value.trim().toUpperCase();
    history.replaceState(null, '', `/pedido.html?code=${code}`);
    load();
  });

  start();
})();
