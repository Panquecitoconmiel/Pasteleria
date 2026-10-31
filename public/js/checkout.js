/* Mafer · checkout: datos de entrega, propina, cotización en servidor y pago */
(() => {
  const { $, $$, money, esc, api, cart, getConfig } = window.Mafer;
  const form = $('[data-form]');
  let tip = 0;
  let cfg = {};

  const params = new URLSearchParams(location.search);
  if (params.get('cancelled')) $('[data-cancelled]').hidden = false;

  const deliveryType = () => form.deliveryType.value;
  const paymentMethod = () => form.paymentMethod.value;
  const payload = () => ({
    items: cart.items.map((i) => ({ id: i.id, quantity: i.quantity, notes: i.notes })),
    deliveryType: deliveryType(),
    tip: deliveryType() === 'delivery' ? tip : 0
  });

  function renderLines() {
    $('[data-summary-lines]').innerHTML = cart.items.map((i) => `
      <div class="receipt-line">
        <span><strong>${i.quantity}×</strong> ${esc(i.name)}${i.notes ? `<br><small class="muted">“${esc(i.notes)}”</small>` : ''}</span>
        <span>${money(i.price * i.quantity)}</span>
      </div>`).join('');
  }

  // Los totales siempre se calculan en el servidor con los precios de MySQL
  async function quote() {
    if (!cart.items.length) return;
    try {
      const q = await api('/api/orders/quote', { method: 'POST', body: payload() });
      $('[data-s-subtotal]').textContent = money(q.subtotal);
      $('[data-s-delivery]').textContent = deliveryType() === 'pickup' ? 'Recoges tú' : q.deliveryFee === 0 ? '¡Gratis!' : money(q.deliveryFee);
      $('[data-s-tip]').textContent = money(q.tip);
      $('[data-s-tip-row]').hidden = q.tip === 0;
      $('[data-s-total]').textContent = money(q.total);
      $('[data-submit]').textContent = `Hacer pedido · ${money(q.total)}`;
    } catch (e) {
      showError(e.message);
    }
  }

  function syncMode() {
    const isDelivery = deliveryType() === 'delivery';
    $('[data-address-fields]').hidden = !isDelivery;
    $('[data-tip-card]').hidden = !isDelivery;
    form.address.required = isDelivery;
    const cardSelected = paymentMethod() === 'card';
    $('[data-stripe-off]').hidden = !(cardSelected && !cfg.stripeEnabled);
    quote();
  }

  function showError(msg) {
    const el = $('[data-error]');
    el.textContent = msg;
    el.hidden = !msg;
  }

  form.addEventListener('change', (e) => {
    if (['deliveryType', 'paymentMethod'].includes(e.target.name)) syncMode();
  });

  $('[data-tips]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tip]');
    if (!b) return;
    tip = Number(b.dataset.tip);
    $$('[data-tip]').forEach((x) => x.classList.toggle('is-active', x === b));
    quote();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const f = form.elements;
    const missing = [];
    if (!f.name.value.trim()) missing.push('nombre');
    if (!f.phone.value.trim()) missing.push('teléfono');
    if (deliveryType() === 'delivery' && !f.address.value.trim()) missing.push('dirección');
    if (missing.length) return showError(`Falta: ${missing.join(', ')}.`);
    if (paymentMethod() === 'card' && !cfg.stripeEnabled) return showError('El pago con tarjeta no está configurado. Elige efectivo.');

    const btn = $('[data-submit]');
    btn.disabled = true;
    btn.textContent = paymentMethod() === 'card' ? 'Abriendo Stripe…' : 'Enviando pedido…';
    try {
      const res = await api('/api/orders', {
        method: 'POST',
        body: {
          ...payload(),
          paymentMethod: paymentMethod(),
          customer: {
            name: f.name.value, phone: f.phone.value, email: f.email.value,
            address: f.address.value, addressNotes: f.addressNotes.value
          }
        }
      });
      try { localStorage.setItem('mafer_last_order', res.code); } catch {}
      if (paymentMethod() === 'cash') cart.clear();
      location.href = res.redirect;
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      quote();
    }
  });

  // Inicio
  getConfig().then((c) => {
    cfg = c;
    if (!c.stripeEnabled) form.querySelector('input[value="cash"]').checked = true;
    syncMode();
  });

  cart.onChange(() => {
    const empty = cart.items.length === 0;
    $('[data-empty]').hidden = !empty;
    form.hidden = empty;
    if (!empty) { renderLines(); quote(); }
  });
})();
