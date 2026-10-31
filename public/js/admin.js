/* Mafer · panel de administrador */
(() => {
  const { $, $$, money, esc, api, toast } = window.Mafer;

  const STATUS = {
    pending: 'Esperando pago', received: 'Recibido', preparing: 'En el horno',
    ready: 'Listo p/ recoger', on_the_way: 'En camino', delivered: 'Entregado', cancelled: 'Cancelado'
  };
  // Siguiente paso sugerido (botón rápido), como en las apps de reparto
  const NEXT = {
    delivery: { received: 'preparing', preparing: 'on_the_way', on_the_way: 'delivered' },
    pickup:   { received: 'preparing', preparing: 'ready', ready: 'delivered' }
  };

  let categories = [];
  let products = [];
  let orderFilter = 'active';
  let pollTimer;
  let knownOrderIds = null;

  // ---------- Sesión ----------
  async function boot() {
    try {
      const { admin } = await api('/api/admin/session');
      if (admin) return showApp(admin);
    } catch { /* sin conexión */ }
    $('[data-login]').hidden = false;
  }

  function showApp(me) {
    $('[data-login]').hidden = true;
    $('[data-app]').hidden = false;
    $('[data-who]').textContent = me.email;
    loadCategories();
    loadOrders();
    loadStats();
  }

  $('[data-login-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('[data-login-error]');
    err.hidden = true;
    try {
      const f = e.target.elements;
      await api('/api/admin/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } });
      showApp(await api('/api/admin/me'));
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });

  $('[data-logout]').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    location.reload();
  });

  const guard = (ex) => { if (ex.status === 401) location.reload(); else toast(`⚠️ ${ex.message}`); };

  // ---------- Pestañas ----------
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-tab]').forEach((x) => x.classList.toggle('is-active', x === b));
    $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== b.dataset.tab));
    if (b.dataset.tab === 'products') loadProducts();
    if (b.dataset.tab === 'categories') renderCategories();
    if (b.dataset.tab === 'orders') loadOrders();
    if (b.dataset.tab === 'hero') loadHero();
  }));

  // ---------- Estadísticas ----------
  async function loadStats() {
    try {
      const s = await api('/api/admin/stats');
      $('[data-st-orders]').textContent = s.todayOrders;
      $('[data-st-revenue]').textContent = money(s.todayRevenue);
      $('[data-st-active]').textContent = s.activeOrders;
      $('[data-st-products]').textContent = s.products;
    } catch (ex) { guard(ex); }
  }

  // ---------- Pedidos ----------
  function beep() {
    if (!$('[data-sound]').checked) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach((f, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(.15, ctx.currentTime + i * .18);
        g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + i * .18 + .16);
        o.start(ctx.currentTime + i * .18); o.stop(ctx.currentTime + i * .18 + .17);
      });
    } catch { /* sin audio */ }
  }

  async function loadOrders() {
    clearTimeout(pollTimer);
    try {
      const list = await api(`/api/admin/orders?status=${encodeURIComponent(orderFilter)}`);
      const ids = new Set(list.map((o) => o.id));
      if (knownOrderIds && orderFilter === 'active' && [...ids].some((id) => !knownOrderIds.has(id))) {
        beep();
        toast('🔔 ¡Nuevo pedido!');
      }
      if (orderFilter === 'active') knownOrderIds = ids;
      renderOrders(list);
      loadStats();
    } catch (ex) { guard(ex); }
    pollTimer = setTimeout(loadOrders, 10000);
  }

  function renderOrders(list) {
    const el = $('[data-orders]');
    if (!list.length) { el.innerHTML = '<div class="card empty" style="grid-column:1/-1"><div class="empty__icon">🧁</div><p>No hay pedidos aquí todavía.</p></div>'; return; }
    el.innerHTML = list.map((o) => {
      const next = NEXT[o.delivery_type][o.status];
      const pay = o.payment_method === 'cash' ? '💵 Efectivo' : o.payment_status === 'paid' ? '💳 Pagado' : '💳 Pendiente';
      return `
      <article class="order" data-status="${o.status}">
        <div class="order__top">
          <div><div class="order__code">${esc(o.code)}</div><small class="muted">${new Date(o.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</small></div>
          <span class="pill">${STATUS[o.status]}</span>
        </div>
        <pre class="order__items">${esc(o.items)}</pre>
        <div class="order__meta">
          <strong>${esc(o.customer_name)}</strong> · <a href="tel:${esc(o.customer_phone)}">${esc(o.customer_phone)}</a><br>
          ${o.customer_email ? `<small class="muted">✉️ ${esc(o.customer_email)}</small><br>` : ''}
          ${o.delivery_type === 'pickup' ? '🏪 Recoge en tienda' : `🛵 ${esc(o.address)}${o.address_notes ? ` <span class="muted">(${esc(o.address_notes)})</span>` : ''}`}<br>
          ${pay} · <strong>${money(o.total)}</strong>
        </div>
        <div class="order__actions">
          ${next ? `<button class="btn btn--sm" data-set-status="${o.id}" data-value="${next}">→ ${STATUS[next]}</button>` : ''}
          <select data-status-select="${o.id}" aria-label="Cambiar estado">
            ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
      </article>`;
    }).join('');
  }

  async function setStatus(id, status) {
    try {
      await api(`/api/admin/orders/${id}/status`, { method: 'PATCH', body: { status } });
      toast(`✅ ${STATUS[status]}`);
      loadOrders();
    } catch (ex) { guard(ex); }
  }

  $('[data-orders]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-set-status]');
    if (b) setStatus(b.dataset.setStatus, b.dataset.value);
  });
  $('[data-orders]').addEventListener('change', (e) => {
    const s = e.target.closest('[data-status-select]');
    if (s) {
      if (s.value === 'cancelled' && !confirm('¿Cancelar este pedido?')) return loadOrders();
      setStatus(s.dataset.statusSelect, s.value);
    }
  });
  $('[data-order-filters]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    orderFilter = b.dataset.filter;
    $$('[data-filter]').forEach((x) => x.classList.toggle('is-active', x === b));
    loadOrders();
  });

  // ---------- Categorías ----------
  async function loadCategories() {
    try {
      categories = await api('/api/admin/categories');
      $('[data-p-cats]').innerHTML = '<option value="">Sin categoría</option>' +
        categories.map((c) => `<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('');
      renderCategories();
    } catch (ex) { guard(ex); }
  }
  function renderCategories() {
    $('[data-cats]').innerHTML = categories.map((c) => `
      <div class="cat-row"><span>${esc(c.emoji)} ${esc(c.name)}</span><button class="btn btn--ghost btn--sm" data-del-cat="${c.id}">Eliminar</button></div>`).join('');
  }
  $('[data-cat-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    try {
      await api('/api/admin/categories', { method: 'POST', body: { name: f.name.value, emoji: f.emoji.value } });
      e.target.reset();
      toast('🏷 Categoría creada');
      loadCategories();
    } catch (ex) { guard(ex); }
  });
  $('[data-cats]').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del-cat]');
    if (!b || !confirm('¿Eliminar categoría? Los productos quedarán sin categoría.')) return;
    try { await api(`/api/admin/categories/${b.dataset.delCat}`, { method: 'DELETE' }); loadCategories(); } catch (ex) { guard(ex); }
  });

  // ---------- Productos ----------
  async function loadProducts() {
    try {
      products = await api('/api/admin/products');
      const el = $('[data-products]');
      el.innerHTML = products.length ? products.map((p) => `
        <div class="prow ${p.available ? '' : 'is-off'}">
          <img src="${esc(p.image)}" alt="">
          <div>
            <div class="prow__name">${p.featured ? '⭐ ' : ''}${esc(p.name)}</div>
            <div class="prow__meta">${money(p.price)} · ${esc(p.category || 'Sin categoría')} · ${p.prep_minutes} min</div>
          </div>
          <div class="prow__actions">
            <label class="switch"><input type="checkbox" data-toggle="${p.id}" ${p.available ? 'checked' : ''}><i></i> ${p.available ? 'Disponible' : 'Agotado'}</label>
            <button class="btn btn--sm" data-edit="${p.id}">Editar</button>
            <button class="btn btn--ghost btn--sm" data-del="${p.id}">Eliminar</button>
          </div>
        </div>`).join('') : '<div class="card empty"><div class="empty__icon">🎂</div><p>Aún no hay productos. ¡Sube tu primer pastel!</p></div>';
    } catch (ex) { guard(ex); }
  }

  const modal = $('[data-modal]');
  const pform = $('[data-product-form]');
  const closeModal = () => modal.classList.remove('is-open');

  function openForm(p) {
    pform.reset();
    $('[data-p-error]').hidden = true;
    $('[data-p-title]').textContent = p ? 'Editar producto' : 'Subir pastel';
    const f = pform.elements;
    f.id.value = p?.id || '';
    f.name.value = p?.name || '';
    f.description.value = p?.description || '';
    f.price.value = p?.price || '';
    f.prep_minutes.value = p?.prep_minutes || 30;
    f.category_id.value = p?.category_id || '';
    f.available.checked = p ? !!p.available : true;
    f.featured.checked = !!p?.featured;
    $('[data-p-preview]').src = p?.image || '/img/products/placeholder.svg';
    modal.classList.add('is-open');
    f.name.focus();
  }

  pform.elements.image.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) $('[data-p-preview]').src = URL.createObjectURL(file);
  });

  pform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = pform.elements;
    const fd = new FormData();
    ['name', 'description', 'price', 'prep_minutes', 'category_id'].forEach((k) => fd.append(k, f[k].value));
    fd.append('available', f.available.checked ? '1' : '0');
    fd.append('featured', f.featured.checked ? '1' : '0');
    if (f.image.files[0]) fd.append('image', f.image.files[0]);
    const id = f.id.value;
    if (!id && !f.image.files[0]) {
      $('[data-p-error]').textContent = 'Agrega la foto del pastel.';
      $('[data-p-error]').hidden = false;
      return;
    }
    const btn = $('[data-p-save]');
    btn.disabled = true;
    try {
      await api(id ? `/api/admin/products/${id}` : '/api/admin/products', { method: id ? 'PUT' : 'POST', body: fd });
      closeModal();
      toast(id ? '✅ Producto actualizado' : '🎂 ¡Pastel publicado en la tienda!');
      loadProducts();
      loadStats();
    } catch (ex) {
      if (ex.status === 401) return location.reload();
      $('[data-p-error]').textContent = ex.message;
      $('[data-p-error]').hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $('[data-new-product]').addEventListener('click', () => openForm(null));
  $('[data-close-modal]').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => e.target === modal && closeModal());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());

  $('[data-products]').addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (edit) openForm(products.find((p) => p.id === Number(edit.dataset.edit)));
    if (del && confirm('¿Eliminar este producto? No se puede deshacer.')) {
      try { await api(`/api/admin/products/${del.dataset.del}`, { method: 'DELETE' }); toast('🗑 Eliminado'); loadProducts(); loadStats(); } catch (ex) { guard(ex); }
    }
  });
  $('[data-products]').addEventListener('change', async (e) => {
    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    try { await api(`/api/admin/products/${t.dataset.toggle}/availability`, { method: 'PATCH', body: { available: t.checked } }); loadProducts(); } catch (ex) { guard(ex); }
  });

  // ---------- Portada ----------
  const heroForm = $('[data-hero-form]');
  const heroRemove = { left: false, right: false };

  function showHeroPic(side, src) {
    const img = $(`[data-hero-preview="${side}"]`);
    if (src) img.src = src; else img.removeAttribute('src');
    $(`[data-hero-empty="${side}"]`).hidden = !!src;
  }

  async function loadHero() {
    try {
      const h = await api('/api/hero');
      heroForm.reset();
      heroRemove.left = heroRemove.right = false;
      showHeroPic('left', h.left);
      showHeroPic('right', h.right);
    } catch (ex) { guard(ex); }
  }

  heroForm.addEventListener('change', (e) => {
    const side = e.target.dataset.heroInput;
    const file = e.target.files?.[0];
    if (side && file) { heroRemove[side] = false; showHeroPic(side, URL.createObjectURL(file)); }
  });

  heroForm.addEventListener('click', (e) => {
    const side = e.target.closest('[data-hero-remove]')?.dataset.heroRemove;
    if (!side) return;
    heroRemove[side] = true;
    heroForm.elements[side].value = '';
    showHeroPic(side, null);
  });

  heroForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData();
    ['left', 'right'].forEach((side) => {
      const file = heroForm.elements[side].files[0];
      if (file) fd.append(side, file);
      else if (heroRemove[side]) fd.append(`remove_${side}`, '1');
    });
    try {
      await api('/api/admin/hero', { method: 'POST', body: fd });
      toast('🖼 Portada actualizada');
      loadHero();
    } catch (ex) { guard(ex); }
  });

  boot();
})();
