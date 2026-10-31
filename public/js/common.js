/* Mafer · utilidades compartidas: API, carrito, toast y cajón del carrito */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const money = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(url, opts = {}) {
    const isForm = opts.body instanceof FormData;
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...opts,
      headers: isForm ? opts.headers : { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body && !isForm && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body
    });
    let data = null;
    try { data = await res.json(); } catch { /* sin cuerpo */ }
    if (!res.ok) throw Object.assign(new Error(data?.error || 'Error de conexión'), { status: res.status });
    return data;
  }

  // ---------- Config pública ----------
  let configPromise;
  const getConfig = () => (configPromise ||= api('/api/config').catch(() => ({ deliveryFee: 45, freeDeliveryFrom: 600, stripeEnabled: false, testMode: true })));

  // ---------- Carrito en localStorage ----------
  const KEY = 'mafer_cart_v1';
  const listeners = new Set();
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  let items = read();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* almacenamiento bloqueado */ }
    listeners.forEach((fn) => fn(items));
  };
  const lineKey = (id, notes) => `${id}::${(notes || '').trim()}`;

  const cart = {
    get items() { return items; },
    get count() { return items.reduce((s, i) => s + i.quantity, 0); },
    get subtotal() { return items.reduce((s, i) => s + i.price * i.quantity, 0); },
    add(product, quantity = 1, notes = '') {
      const key = lineKey(product.id, notes);
      const found = items.find((i) => i.key === key);
      if (found) found.quantity = Math.min(found.quantity + quantity, 50);
      else items.push({ key, id: product.id, name: product.name, price: Number(product.price), image: product.image, quantity, notes: notes.trim() });
      save();
    },
    setQty(key, quantity) {
      items = quantity <= 0 ? items.filter((i) => i.key !== key) : items.map((i) => (i.key === key ? { ...i, quantity: Math.min(quantity, 50) } : i));
      save();
    },
    clear() { items = []; save(); },
    onChange(fn) { listeners.add(fn); fn(items); }
  };
  window.addEventListener('storage', (e) => { if (e.key === KEY) { items = read(); listeners.forEach((fn) => fn(items)); } });

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const el = $('[data-toast]');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-show'), 2200);
  }

  // ---------- UI compartida ----------
  function initShell() {
    $$('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));

    const header = $('[data-header]');
    if (header) addEventListener('scroll', () => header.classList.toggle('is-stuck', scrollY > 10), { passive: true });

    getConfig().then((cfg) => {
      $$('[data-free-from]').forEach((el) => (el.textContent = money(cfg.freeDeliveryFrom)));
      $$('[data-delivery-fee]').forEach((el) => (el.textContent = money(cfg.deliveryFee)));
      if (cfg.testMode) $$('[data-test-banner]').forEach((el) => (el.hidden = false));
    });

    const drawer = $('[data-drawer]');
    const openCart = () => drawer?.classList.add('is-open');
    const closeCart = () => drawer?.classList.remove('is-open');
    $$('[data-open-cart]').forEach((b) => b.addEventListener('click', openCart));
    $$('[data-close-cart]').forEach((b) => b.addEventListener('click', closeCart));
    document.addEventListener('keydown', (e) => e.key === 'Escape' && closeCart());

    cart.onChange(async () => {
      const count = cart.count;
      $$('[data-cart-count]').forEach((el) => { el.textContent = count; el.classList.toggle('has-items', count > 0); });
      const lines = $('[data-cart-lines]');
      if (!lines) return;
      const foot = $('[data-cart-foot]');
      if (!cart.items.length) {
        lines.innerHTML = '<div class="empty"><div class="empty__icon">🧁</div><p><strong>Tu carrito está vacío</strong><br>¡Agrega algo dulce!</p></div>';
        foot.hidden = true;
        return;
      }
      foot.hidden = false;
      lines.innerHTML = cart.items.map((i) => `
        <div class="cart-line">
          <img src="${esc(i.image)}" alt="">
          <div>
            <div class="cart-line__name">${esc(i.name)}</div>
            ${i.notes ? `<div class="cart-line__notes">“${esc(i.notes)}”</div>` : ''}
            <div class="muted" style="font-size:.85rem">${money(i.price)}</div>
          </div>
          <div class="cart-line__right">
            <span>${money(i.price * i.quantity)}</span>
            <div class="qty"><button data-dec="${esc(i.key)}" aria-label="Quitar uno">${i.quantity === 1 ? '🗑' : '−'}</button><span>${i.quantity}</span><button data-inc="${esc(i.key)}" aria-label="Agregar uno">+</button></div>
          </div>
        </div>`).join('');
      $('[data-cart-subtotal]').textContent = money(cart.subtotal);
      const cfg = await getConfig();
      const missing = cfg.freeDeliveryFrom - cart.subtotal;
      $('[data-cart-hint]').textContent = missing > 0 ? `Te faltan ${money(missing)} para envío gratis 🛵` : '¡Tienes envío gratis! 🎉';
    });

    document.addEventListener('click', (e) => {
      const inc = e.target.closest('[data-inc]');
      const dec = e.target.closest('[data-dec]');
      if (inc) { const i = cart.items.find((x) => x.key === inc.dataset.inc); i && cart.setQty(i.key, i.quantity + 1); }
      if (dec) { const i = cart.items.find((x) => x.key === dec.dataset.dec); i && cart.setQty(i.key, i.quantity - 1); }
    });
  }

  window.Mafer = { $, $$, money, esc, api, cart, toast, getConfig, initShell };
  document.addEventListener('DOMContentLoaded', initShell);
})();
