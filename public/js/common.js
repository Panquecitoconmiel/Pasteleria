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

  // ---------- Cuenta del cliente (Google) ----------
  let userPromise;
  const getUser = (fresh = false) => {
    if (fresh || !userPromise) userPromise = api('/api/auth/me').then((r) => r.user).catch(() => null);
    return userPromise;
  };

  let gsiPromise;
  function loadGoogle() {
    return (gsiPromise ||= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar Google'));
      document.head.appendChild(s);
    }));
  }

  // Pinta el botón oficial "Continuar con Google" dentro de `el`
  async function renderGoogleButton(el) {
    const cfg = await getConfig();
    if (!cfg.googleClientId) {
      el.innerHTML = '<p class="notice">El inicio de sesión no está configurado. Agrega <code>GOOGLE_CLIENT_ID</code> en tu <code>.env</code> y reinicia el servidor.</p>';
      return;
    }
    try {
      await loadGoogle();
      google.accounts.id.initialize({
        client_id: cfg.googleClientId,
        callback: async ({ credential }) => {
          try {
            await api('/api/auth/google', { method: 'POST', body: { credential } });
            location.reload();
          } catch (e) { toast(`⚠️ ${e.message}`); }
        }
      });
      el.innerHTML = '';
      google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'es' });
    } catch (e) {
      el.innerHTML = `<p class="notice notice--error">${esc(e.message)}. Revisa tu conexión.</p>`;
    }
  }

  function openLogin() {
    let modal = $('[data-login-modal]');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal';
      modal.dataset.loginModal = '';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.innerHTML = `
        <div class="modal__box login-box">
          <button class="icon-btn modal__close" data-close-login aria-label="Cerrar">✕</button>
          <div class="modal__content">
            <img src="/img/logo.png" alt="" class="login-box__logo">
            <h2>Inicia sesión</h2>
            <p class="muted">Para cuidar tus pagos y que puedas ver tus pedidos, entra con tu cuenta de Google.</p>
            <div class="login-box__btn" data-google-btn></div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      const close = () => modal.classList.remove('is-open');
      modal.addEventListener('click', (e) => (e.target === modal || e.target.closest('[data-close-login]')) && close());
      document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
      renderGoogleButton($('[data-google-btn]', modal));
    }
    modal.classList.add('is-open');
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    try { google.accounts.id.disableAutoSelect(); } catch { /* sin script */ }
    location.href = '/';
  }

  async function renderAccount() {
    const actions = $('.header__actions');
    if (!actions) return;
    const box = document.createElement('div');
    box.className = 'account';
    actions.prepend(box);
    const user = await getUser();
    if (!user) {
      box.innerHTML = '<button class="btn btn--sm" data-open-login>Iniciar sesión</button>';
      return;
    }
    const first = esc(user.name.split(' ')[0]);
    box.innerHTML = `
      <button class="account__btn" data-account-toggle aria-haspopup="true" aria-expanded="false">
        ${user.picture ? `<img src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer">` : `<span>${first[0]}</span>`}
        <span class="account__name">${first}</span>
      </button>
      <div class="account__menu" data-account-menu hidden>
        <div class="account__who"><strong>${esc(user.name)}</strong><small>${esc(user.email)}</small></div>
        <a href="/pedido.html">🧾 Mis pedidos</a>
        <button data-logout-user>↩ Cerrar sesión</button>
      </div>`;
  }

  // ---------- UI compartida ----------
  function initShell() {
    renderAccount();
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-open-login]')) openLogin();
      if (e.target.closest('[data-logout-user]')) logout();
      const toggle = e.target.closest('[data-account-toggle]');
      const menu = $('[data-account-menu]');
      if (menu) {
        if (toggle) { menu.hidden = !menu.hidden; toggle.setAttribute('aria-expanded', String(!menu.hidden)); }
        else if (!e.target.closest('[data-account-menu]')) menu.hidden = true;
      }
    });

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

  window.Mafer = { $, $$, money, esc, api, cart, toast, getConfig, initShell, getUser, openLogin, renderGoogleButton };
  document.addEventListener('DOMContentLoaded', initShell);
})();
