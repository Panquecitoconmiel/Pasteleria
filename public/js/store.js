/* Mafer · página principal: menú, categorías, búsqueda y detalle de producto */
(() => {
  const { $, $$, money, esc, api, cart, toast } = window.Mafer;
  let products = [];
  let activeCategory = '';
  let query = '';

  const card = (p) => `
    <article class="product-card" data-product="${p.id}" tabindex="0" aria-label="${esc(p.name)}">
      ${p.featured ? '<span class="pill product-card__badge">⭐ Favorito</span>' : ''}
      <img class="product-card__img" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">
      <div class="product-card__body">
        <h3 class="product-card__name">${esc(p.name)}</h3>
        <p class="product-card__desc">${esc(p.description)}</p>
        <div class="product-card__foot">
          <span class="product-card__price">${money(p.price)}</span>
          <button class="product-card__add" data-quick-add="${p.id}" aria-label="Agregar ${esc(p.name)}">+</button>
        </div>
      </div>
    </article>`;

  function renderProducts() {
    const grid = $('[data-products]');
    const q = query.toLowerCase();
    const list = products.filter((p) =>
      (!activeCategory || p.category_slug === activeCategory) &&
      (!q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)));
    const emptyMsg = products.length
      ? '<div class="empty__icon">🥲</div><p>No encontramos nada con esa búsqueda.</p>'
      : '<div class="empty__icon">🧁</div><p><strong>¡Muy pronto!</strong><br>Estamos horneando nuestro menú.</p>';
    grid.innerHTML = list.length ? list.map(card).join('') : `<div class="empty" style="grid-column:1/-1">${emptyMsg}</div>`;
  }

  function renderFeatured() {
    const row = $('[data-featured]');
    const featured = products.filter((p) => p.featured).slice(0, 5);
    $('#favoritos').hidden = featured.length === 0;
    row.innerHTML = featured.map((p) => `
      <button class="favs__item" data-product="${p.id}">
        <span class="ring"><img src="${esc(p.image)}" alt="" loading="lazy"></span>
        <strong>${esc(p.name)}</strong>
        <span class="pill">${money(p.price)}</span>
      </button>`).join('');
  }

  // Fotos del encabezado: primero las que se suban desde el admin (Portada);
  // si no hay, usa los archivos public/img/izquierdo.png y public/img/derecho.png
  const HERO_FILES = { left: '/img/izquierdo.png', right: '/img/derecho.png' };
  async function loadHero() {
    let hero = {};
    try { hero = await api('/api/hero'); } catch { /* sin portada en la base */ }
    ['left', 'right'].forEach((side) => {
      const box = $(`[data-hero="${side}"]`);
      if (!box) return;
      const img = box.querySelector('img');
      img.onload = () => { box.hidden = false; };
      img.onerror = () => { box.hidden = true; };
      img.src = hero[side] || HERO_FILES[side];
    });
  }

  async function load() {
    try {
      const [cats, prods] = await Promise.all([api('/api/categories'), api('/api/products')]);
      products = prods;
      $('[data-categories]').innerHTML =
        `<button class="is-active" data-cat="">✨ Todo</button>` +
        cats.map((c) => `<button data-cat="${esc(c.slug)}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('');
      renderProducts();
      renderFeatured();
    } catch (e) {
      $('[data-products]').innerHTML = `<div class="notice notice--error" style="grid-column:1/-1">No pudimos cargar el menú (${esc(e.message)}). ¿Está corriendo el servidor y MySQL?</div>`;
    }
  }

  // ---------- Modal de producto ----------
  const modal = $('[data-modal]');
  let current = null;
  let qty = 1;
  const updateModalTotal = () => {
    $('[data-m-qty]').textContent = qty;
    $('[data-m-total]').textContent = money(current.price * qty);
  };
  function openProduct(id) {
    current = products.find((p) => p.id === Number(id));
    if (!current) return;
    qty = 1;
    $('[data-m-img]').src = current.image;
    $('[data-m-img]').alt = current.name;
    $('[data-m-cat]').textContent = current.category || 'Mafer';
    $('[data-m-name]').textContent = current.name;
    $('[data-m-desc]').textContent = current.description || '';
    $('[data-m-time]').textContent = `⏱ Listo en ~${current.prep_minutes} min`;
    $('[data-m-notes]').value = '';
    updateModalTotal();
    modal.classList.add('is-open');
    $('[data-m-add]').focus();
  }
  const closeModal = () => modal.classList.remove('is-open');

  $('[data-m-plus]').addEventListener('click', () => { qty = Math.min(qty + 1, 50); updateModalTotal(); });
  $('[data-m-minus]').addEventListener('click', () => { qty = Math.max(qty - 1, 1); updateModalTotal(); });
  $('[data-m-add]').addEventListener('click', () => {
    cart.add(current, qty, $('[data-m-notes]').value);
    closeModal();
    toast(`🧁 ${current.name} agregado`);
  });
  $('[data-close-modal]').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => e.target === modal && closeModal());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());

  // ---------- Eventos ----------
  document.addEventListener('click', (e) => {
    const quick = e.target.closest('[data-quick-add]');
    if (quick) {
      e.stopPropagation();
      const p = products.find((x) => x.id === Number(quick.dataset.quickAdd));
      cart.add(p, 1);
      toast(`🧁 ${p.name} agregado`);
      return;
    }
    const prod = e.target.closest('[data-product]');
    if (prod) openProduct(prod.dataset.product);

    const chip = e.target.closest('[data-cat]');
    if (chip) {
      activeCategory = chip.dataset.cat;
      $$('[data-cat]').forEach((b) => b.classList.toggle('is-active', b === chip));
      renderProducts();
    }
  });
  document.addEventListener('keydown', (e) => {
    const prod = e.target.closest?.('article[data-product]');
    if (prod && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openProduct(prod.dataset.product); }
  });
  let t;
  $('[data-search]').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { query = e.target.value.trim(); renderProducts(); }, 150); });

  // Hojitas de otoño cayendo en el hero
  const hero = $('.hero');
  if (hero && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    ['🍂', '🍁', '🍂', '🍁', '🍂'].forEach((leaf, i) => {
      const s = document.createElement('span');
      s.className = 'leaf';
      s.textContent = leaf;
      s.style.left = `${8 + i * 21}%`;
      s.style.top = '0';
      s.style.animationDelay = `${i * 1.7}s`;
      hero.appendChild(s);
    });
  }

  loadHero();
  load();
})();
