/* Marine Nets — storefront + cart + checkout */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const netIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 3l18 18M21 3L3 21M8 3v18M16 3v18M3 8h18M3 16h18"/></svg>`;

  let SITE = { products: [], settings: {}, shipping: [], payments: [] };
  let CART = load('mn_cart', []);
  let SAVED = load('mn_saved', []);
  const CURSYM = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', AUD: 'A$', SGD: 'S$' };
  const CUR = () => { const c = SITE.settings.currency; return c && c !== 'USD' ? c : 'INR'; };
  const curSym = () => CURSYM[CUR()] || (CUR() + ' ');
  const money = (v) => `${curSym()}${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  // GST: prices are shown inclusive of the store's tax rate (default 18%)
  const GSTR = () => Number(SITE.settings && SITE.settings.default_tax_rate) || 0;   // percent
  // 'backorder' (default) = short items may still be ordered; 'block' = refuse them
  const stockPolicy = () => (SITE.settings && SITE.settings.stock_policy) || 'backorder';
  /* Ask the server what is actually free to sell right now. Stock moves while a
     cart sits open, so the cart's own figures are never trusted at checkout. */
  async function liveStock(items) {
    try {
      const r = await fetch('/api/public/stock-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map(i => ({ product_id: i.product_id, variant_id: i.variant_id || '', quantity: i.quantity })) }),
      });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }
  const gross = (v) => Number(v || 0) * (1 + GSTR() / 100);
  const gmoney = (v) => money(gross(v));
  const gstNote = () => GSTR() ? `incl. ${GSTR()}% GST` : '';
  const qtyUnit = (n, unit) => `${Number(n || 0).toLocaleString('en-IN')} ${unit || 'kg'}`;

  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } }
  function save() { localStorage.setItem('mn_cart', JSON.stringify(CART)); localStorage.setItem('mn_saved', JSON.stringify(SAVED)); }

  // -------- mobile detection & features --------
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
  const isSmallPhone = () => window.matchMedia('(max-width: 480px)').matches;

  function initStickyBottomCTA() {
    if (!isMobile()) return;
    const existing = $('#stickyBottomCTA');
    if (existing) existing.remove();
    const cta = document.createElement('div');
    cta.id = 'stickyBottomCTA';
    cta.className = 'sticky-cta';
    const phone = SITE.settings?.contact_phone || '+91XXXXXXXXXX';
    const wa = SITE.settings?.contact_whatsapp || 'XXXXXXXXXX';
    cta.innerHTML = `
      <button class="cta-btn cta-call" title="Call us">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      </button>
      <button class="cta-btn cta-wa" title="Chat on WhatsApp">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-4.782 1.14l-.046.025-4.774.798.81-4.884a9.9 9.9 0 011.516-4.578A9.897 9.897 0 0112.05 0C6.584 0 2.247 4.339 2.247 9.675c0 1.697.429 3.365 1.237 4.857L2.129 23l5.355-1.403a9.873 9.873 0 004.735 1.206h.005c5.467 0 9.805-4.338 9.805-9.675 0-2.591-.981-5.032-2.767-6.864a9.900 9.900 0 00-7.075-2.836"/></svg>
      </button>
      <button class="cta-btn cta-cart" title="Open cart">
        <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <span id="stickyCartCount" class="cart-badge">0</span>
      </button>
    `;
    document.body.appendChild(cta);
    cta.querySelector('.cta-call').addEventListener('click', () => window.location.href = `tel:${phone}`);
    cta.querySelector('.cta-wa').addEventListener('click', () => {
      const num = wa.replace(/\D/g, '');
      window.open(`https://wa.me/${num}?text=${encodeURIComponent('Hi, I am interested in your products.')}`, '_blank');
    });
    cta.querySelector('.cta-cart').addEventListener('click', openCart);
    updateStickyCartCount();
  }

  function updateStickyCartCount() {
    const el = $('#stickyCartCount');
    if (el) {
      const n = CART.reduce((s, i) => s + i.quantity, 0);
      el.textContent = n;
      el.style.display = n > 0 ? 'flex' : 'none';
    }
  }

  function lazyLoadImages() {
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const img = e.target;
            if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
            obs.unobserve(img);
          }
        });
      }, { rootMargin: '100px' });
      document.querySelectorAll('img[data-src]').forEach(img => obs.observe(img));
    }
  }

  // -------- pinch-to-zoom on images --------
  function initPinchZoom() {
    if (!isMobile()) return;
    document.addEventListener('touchstart', (e) => {
      const img = e.target.closest('img.product-image');
      if (!img) return;
      if (e.touches.length === 2) e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const img = e.target.closest('img.product-image');
        if (!img) return;
        e.preventDefault();
        const touch1 = e.touches[0], touch2 = e.touches[1];
        const dist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
        if (!img._touchStart) img._touchStart = dist;
        const scale = dist / img._touchStart;
        img.style.transform = `scale(${Math.min(Math.max(scale, 1), 3)})`;
        img.style.cursor = 'grab';
      }
    }, { passive: false });
    document.addEventListener('touchend', (e) => {
      const img = e.target.closest('img.product-image');
      if (img) { img._touchStart = null; img.style.transform = 'scale(1)'; }
    });
  }

  // -------- expandable product specs --------
  function initExpandableSpecs() {
    if (!isMobile()) return;
    document.addEventListener('click', (e) => {
      const spec = e.target.closest('.spec-tab');
      if (!spec) return;
      const isOpen = spec.classList.contains('open');
      spec.closest('.specs-group')?.querySelectorAll('.spec-tab').forEach(s => s.classList.remove('open'));
      if (!isOpen) spec.classList.add('open');
    });
  }

  // -------- quick-view modal --------
  function openQuickView(productId) {
    const p = SITE.products.find(x => x.id === productId);
    if (!p) return;
    const overlay = document.createElement('div');
    overlay.className = 'quick-view-overlay';
    overlay.innerHTML = `
      <div class="quick-view-modal">
        <button class="qv-close">×</button>
        <div class="qv-image">
          <img src="${esc((p.images || [])[0] || '')}" alt="${esc(p.name)}">
        </div>
        <div class="qv-info">
          <h3>${esc(p.name)}</h3>
          <p class="qv-cat">${esc(p.category_name || '')}</p>
          <p class="qv-desc">${esc((p.description || '').substring(0, 100))}</p>
          <div class="qv-price">${gmoney(p.effective_price)}</div>
          <div class="qv-actions">
            <button class="btn btn--sm qv-view">View Details</button>
            <button class="btn btn--sm btn--dark qv-cart">Add to Cart</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.qv-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('.qv-view').addEventListener('click', () => { overlay.remove(); location.hash = '#product-' + p.id; });
    overlay.querySelector('.qv-cart').addEventListener('click', () => {
      addToCart({
        product_id: p.id, name: p.name, category: p.category_name, sku: p.sku, image: (p.images||[])[0] || '',
        variant_id: '', variant_label: '', quantity: 1, unit: p.default_unit,
        unit_price: p.effective_price, size: '', mesh_size: '', md_size: '', material: '', color: '',
        custom_specs: '', special_instructions: '',
      });
      overlay.remove();
    });
  }

  // -------- mobile checkout simplification --------
  function simplifyCheckoutForMobile() {
    if (!isMobile()) return;
    const form = $('#checkoutForm');
    if (form) {
      form.classList.add('mobile-checkout');
      form.querySelectorAll('fieldset').forEach((fs, i) => {
        if (i > 0) fs.style.marginTop = '1.5rem';
      });
    }
  }

  // ---------------- boot ----------------
  async function boot() {
    try { SITE = await (await fetch('/api/public/site')).json(); }
    catch { SITE = { products: [], settings: {}, shipping: [], payments: [] }; }
    renderSettings(); renderProducts(); updateCartUI(); initReveal(); checkCustomer(); loadNetParts(); initHeroUI();
    initProductControls(); initExtras(); injectProductSchema(); loadPartnerProducts();
    setTimeout(() => {
      initStickyBottomCTA();
      initPinchZoom();
      initExpandableSpecs();
      simplifyCheckoutForMobile();
      lazyLoadImages();
    }, 100);
  }

  // ---------------- partner marketplace ----------------
  let PARTNER_PRODUCTS = [];
  async function loadPartnerProducts() {
    try {
      const list = await (await fetch('/api/public/partner-products')).json();
      PARTNER_PRODUCTS = Array.isArray(list) ? list : [];
    } catch { PARTNER_PRODUCTS = []; }
    const sec = $('#partners'), nav = $('#navPartners');
    if (!PARTNER_PRODUCTS.length) { if (sec) sec.hidden = true; if (nav) nav.hidden = true; return; }
    if (sec) sec.hidden = false;
    if (nav) nav.hidden = false;

    // company filter
    const sel = $('#filterPartner');
    if (sel) {
      const names = [...new Set(PARTNER_PRODUCTS.map(p => p.vendor_name).filter(Boolean))].sort();
      sel.innerHTML = '<option value="">All partner companies</option>'
        + names.map(n => `<option>${esc(n)}</option>`).join('');
      sel.addEventListener('change', () => renderPartnerProducts(
        sel.value ? PARTNER_PRODUCTS.filter(p => p.vendor_name === sel.value) : PARTNER_PRODUCTS));
    }
    renderPartnerProducts(PARTNER_PRODUCTS);
  }

  const availLabel = { in_stock: ['stock-in', 'In Stock'], low_stock: ['stock-low', 'Limited'],
    out_of_stock: ['stock-out', 'Out of Stock'], made_to_order: ['stock-low', 'Made to Order'] };

  function renderPartnerProducts(list) {
    const wrap = $('#partnerList');
    if (!wrap) return;
    if (!list.length) { wrap.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--grey)">No listings from this company yet.</p>'; return; }
    wrap.innerHTML = list.map(p => {
      const img = (p.images && p.images[0])
        ? `<img class="product-image" src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">`
        : `<div class="pcard__ph">${netIcon}<span>Product image</span></div>`;
      const badge = availLabel[p.stock_status] || availLabel.in_stock;
      const price = p.price > 0
        ? `<span class="pcard__price">${gmoney(p.price)} <small>/ ${esc(p.unit || 'kg')}</small></span>`
        : `<span class="pcard__price"><small>Price on Request</small></span>`;
      const specs = [p.material, p.size && 'Size ' + p.size, p.mesh_size && 'Mesh ' + p.mesh_size,
        p.color].filter(Boolean).map(esc).join(' · ');
      return `<article class="pcard reveal">
       <div class="pcard__inner">
        <div class="pcard__media">${img}<span class="sold-by">${esc(p.vendor_name)}</span></div>
        <div class="pcard__body">
          <div class="pcard__head">
            <span class="pcard__cat">${esc(p.category || 'Marine Equipment')}</span>
            <span class="pcard__hdiv"></span>
            <h3 class="pcard__name">${esc(p.name)}</h3>
          </div>
          <p class="pcard__desc">${esc(p.description || '')}</p>
          <div class="pcard__rule"></div>
          <div class="pcard__meta">${price}<span class="stock-badge ${badge[0]}">${badge[1]}</span></div>
          ${specs ? `<p class="partner-specs">${specs}</p>` : ''}
          <p class="partner-moq">${esc(p.sku)}${p.moq > 1 ? ' · Min order ' + p.moq + ' ' + esc(p.unit || 'kg') : ''}</p>
          <div class="pcard__actions">
            <button class="btn btn--sm" data-enq="${esc(p.id)}">Request Quote</button>
          </div>
        </div>
       </div>
      </article>`;
    }).join('');
    wrap.querySelectorAll('[data-enq]').forEach(b => b.addEventListener('click', () =>
      openEnquiry(list.find(x => x.id === b.dataset.enq))));
    initReveal();
    window.applyI18n && window.applyI18n(wrap);
  }

  function openEnquiry(p) {
    if (!p) return;
    const pre = CUSTOMER || {};
    modal(`
      <div class="pm__head"><h3 class="pm__title">Request a Quote</h3><button class="pm__close" aria-label="Close">&times;</button></div>
      <div class="pm__body">
        <div class="enq-prod">
          ${p.images && p.images[0] ? `<img src="${esc(p.images[0])}" alt="">` : ''}
          <div>
            <strong>${esc(p.name)}</strong>
            <div class="spec">${esc(p.sku)} · Sold by <strong>${esc(p.vendor_name)}</strong></div>
            <div class="spec">${p.price > 0 ? gmoney(p.price) + ' / ' + esc(p.unit || 'kg') : 'Price on request'}</div>
          </div>
        </div>
        <p class="enq-note">Your details go directly to <strong>${esc(p.vendor_name)}</strong>, who will contact you with a quote.</p>
        <div class="frow2">
          <div class="field"><label>Your Name *</label><input id="eName" value="${esc(pre.name || '')}"></div>
          <div class="field"><label>Company</label><input id="eCompany" value="${esc(pre.company || '')}"></div>
        </div>
        <div class="frow2">
          <div class="field"><label>Phone *</label><input id="ePhone" type="tel" value="${esc(pre.phone || '')}"></div>
          <div class="field"><label>Email</label><input id="eEmail" type="email" value="${esc(pre.email || '')}"></div>
        </div>
        <div class="frow2">
          <div class="field"><label>Quantity</label><input id="eQty" inputmode="decimal" value="${p.moq > 1 ? p.moq : 1}"></div>
          <div class="field"><label>Unit</label><input id="eUnit" value="${esc(p.unit || 'kg')}"></div>
        </div>
        <div class="field"><label>Message</label><textarea id="eMsg" rows="3" placeholder="Sizes, specifications, delivery location, timeline…"></textarea></div>
        <p class="form__msg err" id="enqMsg"></p>
      </div>
      <div class="pm__foot pm__foot--split">
        <button class="btn btn--ghost" id="enqCancel">Cancel</button>
        <button class="btn" id="enqSend">Send Enquiry</button>
      </div>`, (box) => {
      $('#enqCancel', box).addEventListener('click', closeModal);
      $('#enqSend', box).addEventListener('click', async () => {
        const msg = $('#enqMsg', box);
        const v = (id) => $('#' + id, box).value.trim();
        if (!v('eName')) { msg.textContent = 'Please enter your name.'; return; }
        if (!v('ePhone') && !v('eEmail')) { msg.textContent = 'Please give a phone number or email.'; return; }
        const btn = $('#enqSend', box); btn.disabled = true; btn.textContent = 'Sending…';
        try {
          const r = await (await fetch('/api/public/enquiry', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: p.id, name: v('eName'), company: v('eCompany'),
              phone: v('ePhone'), email: v('eEmail'), quantity: Number(v('eQty')) || 1,
              unit: v('eUnit'), message: v('eMsg') }),
          })).json();
          if (r.error) throw new Error(r.error);
          enquirySent(p.vendor_name);
        } catch (e) { msg.textContent = e.message; btn.disabled = false; btn.textContent = 'Send Enquiry'; }
      });
    }, 'modal__box--order');
  }

  function enquirySent(vendorName) {
    modal(`
      <div class="modal__head"><h3>Enquiry Sent</h3><button class="modal__close">&times;</button></div>
      <div class="modal__body"><div class="success-box">
        <div class="check">✓</div>
        <h3 style="color:var(--navy)">Your enquiry is on its way.</h3>
        <p style="color:var(--grey);max-width:40ch;margin:.6rem auto 0">
          <strong>${esc(vendorName)}</strong> has received your details and will contact you
          directly with a quote. We've kept a copy too.</p>
      </div></div>
      <div class="modal__foot" style="justify-content:flex-end"><button class="btn modal__close-btn3">Done</button></div>`,
      (box) => box.querySelector('.modal__close-btn3').addEventListener('click', closeModal));
  }

  // ---------------- filter + sort ----------------
  function initProductControls() {
    const cats = [...new Set(SITE.products.map(p => p.category_name).filter(Boolean))];
    const sel = $('#filterCat');
    if (sel) { sel.innerHTML = '<option value="">All categories</option>' + cats.map(c => `<option>${esc(c)}</option>`).join(''); sel.addEventListener('change', applyProductView); }
    $('#sortBy')?.addEventListener('change', applyProductView);
  }
  function applyProductView() {
    const cat = $('#filterCat')?.value || '';
    const sort = $('#sortBy')?.value || 'default';
    let list = SITE.products.filter(p => !cat || p.category_name === cat);
    const price = p => p.effective_price || Infinity;
    if (sort === 'price-asc') list = [...list].sort((a, b) => price(a) - price(b));
    else if (sort === 'price-desc') list = [...list].sort((a, b) => (b.effective_price || 0) - (a.effective_price || 0));
    else if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'stock') list = [...list].sort((a, b) => (a.stock_status === 'out_of_stock' ? 1 : 0) - (b.stock_status === 'out_of_stock' ? 1 : 0));
    renderProducts(list);
  }

  // ---------------- WhatsApp + tracking ----------------
  function initExtras() {
    const s = SITE.settings;
    const wa = $('#waFloat');
    if (wa && s.contact_whatsapp) {
      const num = String(s.contact_whatsapp).replace(/\D/g, '');
      wa.href = `https://wa.me/${num}?text=${encodeURIComponent('Hi, I\'d like to enquire about your fishing nets.')}`;
      wa.hidden = false;
    }
    // mobile hamburger menu
    const navToggle = $('#navToggle'), navLinks = $('#navLinks');
    if (navToggle && navLinks) {
      navToggle.addEventListener('click', () => {
        const open = navLinks.classList.toggle('open');
        navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
        navLinks.classList.remove('open'); navToggle.setAttribute('aria-expanded', 'false');
      }));
    }
    $('#trackLink')?.addEventListener('click', (e) => { e.preventDefault(); openTracking(); });
  }
  function openTracking() {
    modal(`
      <div class="modal__head"><h3>Track your order</h3><button class="modal__close">&times;</button></div>
      <div class="modal__body">
        <p style="color:var(--grey);margin-bottom:1rem">Enter your order number and the email or phone used on the order.</p>
        <div class="field"><label>Order number</label><input id="tkNum" placeholder="MN-2026-0001"></div>
        <div class="field"><label>Email or phone</label><input id="tkContact"></div>
        <p class="form__msg err" id="tkMsg"></p>
        <div id="tkResult"></div>
      </div>
      <div class="modal__foot" style="justify-content:flex-end"><button class="btn" id="tkGo">Track</button></div>
    `, (box) => {
      $('#tkGo', box).addEventListener('click', async () => {
        const msg = $('#tkMsg', box); msg.textContent = ''; $('#tkResult', box).innerHTML = '';
        const body = { order_number: $('#tkNum', box).value.trim(), contact: $('#tkContact', box).value.trim() };
        if (!body.order_number || !body.contact) { msg.textContent = 'Enter both fields.'; return; }
        try {
          const r = await (await fetch('/api/public/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
          if (r.error) throw new Error(r.error);
          $('#tkResult', box).innerHTML = `
            <div class="subhead">Order ${esc(r.order_number)}</div>
            <div class="cart-summary-row"><span>Status</span><span class="stock-badge order-st st-${esc(r.status)}">${esc(r.status)}</span></div>
            <div class="cart-summary-row"><span>Payment</span><span>${esc(r.payment_status)}</span></div>
            <div class="cart-summary-row"><span>Placed</span><span>${(r.created_at||'').slice(0,10)}</span></div>
            <div class="cart-summary-row total"><span>Total</span><span>${money(r.total)}</span></div>
            <div class="subhead">History</div>
            ${r.history.map(h => `<div class="cart-summary-row"><span>${esc(h.status)}</span><span>${(h.ts||'').replace('T',' ').slice(0,16)}</span></div>`).join('')}`;
        } catch (e) { msg.textContent = e.message; }
      });
    });
  }

  function injectProductSchema() {
    if (!SITE.products.length) return;
    const items = SITE.products.map((p, i) => ({ '@type': 'Product', position: i + 1, name: p.name,
      category: p.category_name, description: (p.description || '').slice(0, 160),
      offers: p.effective_price > 0 ? { '@type': 'Offer', price: p.effective_price, priceCurrency: p.currency || 'USD',
        availability: p.stock_status === 'out_of_stock' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' } : undefined }));
    const el = document.createElement('script'); el.type = 'application/ld+json';
    el.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList',
      itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, item: it })) });
    document.head.appendChild(el);
  }

  // ---------------- Hero UI: scroll navbar, parallax, bubbles, search ----------------
  function initHeroUI() {
    const nav = $('#nav'), bg = document.querySelector('.hero__bg');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        nav.classList.toggle('solid', window.scrollY > 20);
        if (bg && !reduce) bg.style.transform = `translateY(${window.scrollY * 0.28}px)`;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

    // floating bubbles
    const wrap = $('#bubbles');
    if (wrap && !reduce) {
      for (let i = 0; i < 14; i++) {
        const b = document.createElement('span'); b.className = 'bubble';
        const s = 6 + Math.random() * 22;
        b.style.width = b.style.height = s + 'px';
        b.style.left = Math.random() * 100 + '%';
        b.style.animationDuration = (8 + Math.random() * 10) + 's';
        b.style.animationDelay = (Math.random() * 8) + 's';
        wrap.appendChild(b);
      }
    }

    // search
    const bar = $('#searchBar'), input = $('#searchInput');
    $('#searchBtn').addEventListener('click', () => {
      bar.hidden = !bar.hidden;
      if (!bar.hidden) { input.focus(); location.hash = '#products'; }
      else { input.value = ''; filterProducts(''); }
    });
    $('#searchClose').addEventListener('click', () => { bar.hidden = true; input.value = ''; filterProducts(''); });
    input.addEventListener('input', () => filterProducts(input.value));
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { bar.hidden = true; input.value = ''; filterProducts(''); } });

    animateHeroStats();

    // subtle mouse parallax on the hero image (5–10px)
    const hero = $('#hero'), media = $('#heroMedia');
    if (hero && media && window.matchMedia('(pointer:fine)').matches && !reduce) {
      hero.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect();
        const dx = ((e.clientX - r.left) / r.width - 0.5) * 16;   // ±8px
        const dy = ((e.clientY - r.top) / r.height - 0.5) * 16;
        media.style.setProperty('--px', dx.toFixed(1) + 'px');
        media.style.setProperty('--py', dy.toFixed(1) + 'px');
      });
      hero.addEventListener('pointerleave', () => { media.style.setProperty('--px', '0px'); media.style.setProperty('--py', '0px'); });
    }
  }
  // rotating single-message glass card (fade up / in from below, 3s, pause on hover)
  function initInfoCard() {
    const card = $('#infoCard'), msg = $('#infoMsg'), count = $('#infoCount');
    if (!card || !msg) return;
    const messages = ['Marine Grade Quality', 'Worldwide Shipping', 'Custom Manufacturing',
      'Exporting to 30+ Countries', '25+ Years of Experience', '500+ Premium Products',
      'Trusted by Commercial Fishing Fleets'];
    const total = String(messages.length).padStart(2, '0');
    let i = 0, timer = null;
    const paint = () => { msg.textContent = messages[i]; if (count) count.textContent = String(i + 1).padStart(2, '0') + ' / ' + total; };
    paint();
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rotate = () => {
      msg.classList.add('leave');                       // fade out + move up
      setTimeout(() => {
        i = (i + 1) % messages.length; paint();
        msg.classList.remove('leave'); msg.classList.add('enter');   // reset below
        requestAnimationFrame(() => requestAnimationFrame(() => msg.classList.remove('enter'))); // animate in
      }, 300);
    };
    const start = () => { if (!timer) timer = setInterval(rotate, 3000); };
    const stop = () => { clearInterval(timer); timer = null; };
    card.addEventListener('mouseenter', stop);
    card.addEventListener('mouseleave', start);
    start();
  }

  function animateHeroStats() {
    const els = document.querySelectorAll('.hstat b[data-target]');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fmt = (n) => n.toLocaleString();
    els.forEach(el => {
      const target = Number(el.dataset.target) || 0, suffix = el.dataset.suffix || '';
      if (reduce) { el.textContent = fmt(target) + suffix; return; }
      const dur = 1600, start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3);           // easeOutCubic
        el.textContent = fmt(Math.round(target * eased)) + suffix;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  function filterProducts(q) {
    q = q.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('#productList .pcard').forEach(card => {
      const name = (card.querySelector('.pcard__name')?.textContent || '').toLowerCase();
      const cat = (card.querySelector('.pcard__cat')?.textContent || '').toLowerCase();
      const desc = (card.querySelector('.pcard__desc')?.textContent || '').toLowerCase();
      const show = !q || name.includes(q) || cat.includes(q) || desc.includes(q);
      card.style.display = show ? '' : 'none';
      if (show) shown++;
    });
    let empty = $('#searchEmpty');
    if (q && shown === 0) {
      if (!empty) { empty = document.createElement('p'); empty.id = 'searchEmpty'; empty.style.cssText = 'grid-column:1/-1;text-align:center;color:var(--grey)'; $('#productList').appendChild(empty); }
      empty.textContent = `No products match “${q}”.`;
    } else if (empty) empty.remove();
  }

  // ---------------- Explore Net Parts ----------------
  let HOTSPOTS = [], selectedPart = null;
  async function loadNetParts() {
    let data;
    try { data = await (await fetch('/api/public/netparts')).json(); } catch { return; }
    const ALL = data.hotspots || [];
    const types = Array.isArray(data.types) ? data.types : [];
    if (!ALL.length && !types.length) return;
    const sec = $('#netparts'); sec.hidden = false;
    if (data.title) $('#npTitle').textContent = data.title;
    if (data.desc) $('#npDesc').textContent = data.desc;

    const wrap = $('#diagramWrap');
    const circ = n => '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮'[n-1] || n;
    const firstTypeId = types[0] ? types[0].id : null;

    // render one net type: its diagram + only its hotspots + chips
    function renderNetType(typeId) {
      const type = types.find(t => t.id == typeId) || null;
      // hotspots for this type (legacy null type_id belongs to the first type)
      HOTSPOTS = types.length
        ? ALL.filter(h => (h.type_id == typeId) || (h.type_id == null && typeId === firstTypeId))
        : ALL;
      const diagram = (type && type.diagram) || data.diagram || '';
      if (diagram) {
        wrap.innerHTML = `<img src="${esc(diagram)}" alt="${esc((type && type.name) || 'Fishing net diagram')}">` +
          HOTSPOTS.map(h => `<button class="hotspot" data-hs="${h.id}" style="left:${h.x}%;top:${h.y}%">${h.number}<span class="hotspot__tip">${esc(h.name)}</span></button>`).join('');
      } else {
        wrap.innerHTML = `<div class="diagram-ph"><strong>${esc((type && type.name) || 'Net parts')} diagram</strong><span>Upload a diagram for this type in Admin → Net Parts.</span></div>`;
      }
      $('#npChips').innerHTML = HOTSPOTS.map(h =>
        `<button class="np-chip" data-hs="${h.id}"><span class="np-chip__n">${circ(h.number)}</span>${esc(h.name)}</button>`).join('')
        || '<p style="grid-column:1/-1;color:var(--grey);font-size:.9rem">No components added for this type yet — add them in Admin → Net Parts.</p>';
      const bindHover = (el) => {
        const id = Number(el.dataset.hs);
        el.addEventListener('mouseenter', () => setActive(id, true));
        el.addEventListener('mouseleave', () => { if (selectedPart !== id) setActive(id, false); });
        el.addEventListener('click', () => selectPart(id));
      };
      wrap.querySelectorAll('.hotspot').forEach(bindHover);
      $('#npChips').querySelectorAll('.np-chip').forEach(bindHover);
      selectedPart = null;
      if (HOTSPOTS.length) selectPart(HOTSPOTS[0].id);
      else $('#npDetails').innerHTML = '<div class="np-panel__top"><span class="np-badge">–</span><div><span class="np-panel__eyebrow">No components</span><h3>Nothing here yet</h3></div></div><p class="np-panel__desc">Add components for this net type in Admin → Net Parts.</p>';
    }

    // net-type dropdown (only when 2+ types configured)
    const bar = $('#npTypeBar'), sel = $('#npTypeSelect');
    if (bar && sel && types.length > 1) {
      sel.innerHTML = types.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
      bar.hidden = false;
      sel.onchange = () => renderNetType(Number(sel.value));
    } else if (bar) { bar.hidden = true; }

    // keyboard arrows navigate the gallery when the section is on screen
    if (!loadNetParts._kb) {
      loadNetParts._kb = true;
      document.addEventListener('keydown', e => {
        if (galImgs.length < 2) return;
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const s2 = $('#netparts'); if (!s2 || s2.hidden) return;
        const r = s2.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
        const tag = (document.activeElement || {}).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        galleryShow(galIdx + (e.key === 'ArrowRight' ? 1 : -1));
      });
    }

    renderNetType(firstTypeId);
  }

  function setActive(id, on) {
    document.querySelectorAll(`#diagramWrap .hotspot[data-hs="${id}"], #npChips .np-chip[data-hs="${id}"]`)
      .forEach(e => e.classList.toggle('active', on));
  }
  // normalize a hotspot into displayable component data (from linked product or manual item)
  function partData(h) {
    const p = h.product, it = h.item || {};
    if (p) return { name: p.name, desc: p.description, images: (p.images||[]).filter(Boolean), category: p.category_name,
      material: p.specs && p.specs.material, size: p.specs && p.specs.size, mesh: p.specs && p.specs.mesh_size, md: p.specs && p.specs.md_size, features: it.features, uses: it.uses,
      avail: p.stock_status !== 'out_of_stock', price: p.effective_price, unit: p.default_unit, buyable: true };
    const has = (it.price!=='' && it.price!=null) || it.size || it.color || it.material || it.image;
    return { name: it.name || h.name, desc: it.description, images: it.image ? [it.image] : [], category: '',
      material: it.material, size: it.size, mesh: it.mesh_size, md: it.md_size, features: it.features, uses: it.uses,
      avail: it.in_stock !== 0, price: Number(it.price)||0, unit: it.unit||'kg', buyable: !!has };
  }
  // ---- net-parts image gallery state ----
  let galImgs = [], galIdx = 0;
  function galleryShow(i) {
    if (!galImgs.length) return;
    i = (i + galImgs.length) % galImgs.length; galIdx = i;
    const img = $('#npMainImg'); if (!img) return;
    img.style.opacity = '0';
    setTimeout(() => { img.src = galImgs[i]; img.style.opacity = '1'; }, 160);
    document.querySelectorAll('#npDetails .np-thumb').forEach((t, k) => t.classList.toggle('active', k === i));
  }
  function selectPart(id) {
    const h = HOTSPOTS.find(x => x.id === id); if (!h) return;
    if (selectedPart != null) setActive(selectedPart, false);
    selectedPart = id; setActive(id, true);
    const d = partData(h);
    const imgs = d.images || [];
    const panel = $('#npDetails');
    const row = (label, val) => val ? `<div class="np-spec"><span data-i18n="${label}">${label}</span><b>${esc(val)}</b></div>` : '';
    const tags = (label, val) => val ? `<div class="np-block"><h5 data-i18n="${label}">${label}</h5><div class="np-tags">${String(val).split(',').map(x=>x.trim()).filter(Boolean).map(x=>`<span>${esc(x)}</span>`).join('')}</div></div>` : '';
    const gallery = !imgs.length
      ? `<div class="np-gallery"><div class="np-gallery__main np-noimg"><span>No Image<br>Available</span></div></div>`
      : `<div class="np-gallery" tabindex="0" aria-label="Product images">
           <div class="np-gallery__main">
             <img id="npMainImg" src="${esc(imgs[0])}" alt="${esc(d.name)}">
             ${imgs.length>1 ? `<button class="np-gnav np-gprev" type="button" aria-label="Previous image">&#8249;</button><button class="np-gnav np-gnext" type="button" aria-label="Next image">&#8250;</button>` : ''}
           </div>
           ${imgs.length>1 ? `<div class="np-thumbs">${imgs.map((u,k)=>`<button class="np-thumb${k===0?' active':''}" type="button" data-k="${k}"><img src="${esc(u)}" alt=""></button>`).join('')}</div>` : ''}
         </div>`;
    panel.classList.toggle('np-has-thumbs', imgs.length > 1);
    panel.innerHTML = `
      ${gallery}
      <div class="np-panel__top">
        <span class="np-badge">${h.number}</span>
        <div><span class="np-panel__eyebrow">${esc(d.category || 'Net Component')}</span><h3>${esc(d.name)}</h3></div>
      </div>
      ${d.desc ? `<p class="np-panel__desc">${esc(d.desc)}</p>` : ''}
      <div class="np-specs">
        ${row('Material', d.material)}
        ${row('Available Sizes', d.size)}
        ${row('Mesh size', d.mesh)}
        ${row('MD (mesh depth)', d.md)}
        <div class="np-spec"><span data-i18n="Availability">Availability</span><b class="${d.avail?'np-in':'np-out'}" data-i18n="${d.avail?'In Stock':'Made to order'}">${d.avail?'In Stock':'Made to order'}</b></div>
        ${d.price>0 ? row('Price', gmoney(d.price)+' / '+d.unit+(gstNote()?' ('+gstNote()+')':'')) : ''}
      </div>
      ${tags('Features', d.features)}
      ${tags('Uses & Applications', d.uses)}
      ${!d.buyable ? `<p class="np-panel__note" data-i18n="Made to your specification. Send us your size and mesh requirement for a price.">Made to your specification. Send us your size and mesh requirement for a price.</p>` : ''}
      <div class="np-panel__cta">
        <button class="btn" id="npView"><span data-i18n="${d.buyable?'View Product':'Request a Quote'}">${d.buyable?'View Product':'Request a Quote'}</span> <span class="arw">&#8594;</span></button>
      </div>`;
    panel.classList.remove('np-fade'); void panel.offsetWidth; panel.classList.add('np-fade');
    window.applyI18n && window.applyI18n(panel);
    $('#npView').onclick = () => { if (d.buyable) openPart(id); else { location.hash = '#contact'; } };

    // gallery wiring
    galImgs = imgs; galIdx = 0;
    if (imgs.length > 1) {
      panel.querySelector('.np-gprev').onclick = () => galleryShow(galIdx - 1);
      panel.querySelector('.np-gnext').onclick = () => galleryShow(galIdx + 1);
      panel.querySelectorAll('.np-thumb').forEach(t => t.onclick = () => galleryShow(Number(t.dataset.k)));
      // swipe
      const main = panel.querySelector('.np-gallery__main'); let sx = null;
      main.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
      main.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 30) galleryShow(galIdx + (dx < 0 ? 1 : -1)); sx = null; }, { passive: true });
    }
  }

  let openPartId = null;
  function openPart(id) {
    const h = HOTSPOTS.find(x => x.id === id); if (!h) return;
    // clear previous active, set this one
    if (openPartId) toggleActiveEls(openPartId, false);
    openPartId = id; toggleActiveEls(id, true);
    const p = h.product;
    const it = h.item || {};
    const hasItem = (it.price !== '' && it.price != null) || it.size || it.color || it.mesh_size || it.material || it.image || it.description;
    $('#partDrawerTitle').textContent = `${h.number}. ${h.name}`;
    const body = $('#partBody'), foot = $('#partFoot');
    // Build a buyable source from the linked product OR the manually-typed item
    let src = null;
    if (p) {
      const sp = p.specs || {};
      src = { product_id: p.id, name: p.name, category: p.category_name, description: p.description,
        image: (p.images||[])[0]||'', price: p.effective_price, unit: p.default_unit, sku: p.sku,
        color: sp.color, size: sp.size, mesh: sp.mesh_size, material: sp.material, stock: p.stock_status,
        rows: [['Category', p.category_name], ['Minimum Order', p.min_order > 0 ? qtyUnit(p.min_order, p.default_unit) : ''],
          ['Available Stock', qtyUnit(p.available_stock, p.default_unit)], ['Warehouse', p.warehouse_location]] };
    } else if (hasItem) {
      src = { product_id: null, name: it.name || h.name, category: '', description: it.description,
        image: it.image, price: Number(it.price) || 0, unit: it.unit || 'kg', sku: '',
        color: it.color, size: it.size, mesh: it.mesh_size, material: it.material,
        stock: it.in_stock === 0 ? 'out_of_stock' : 'in_stock', rows: [] };
    }
    if (src) {
      const arr = s => String(s||'').split(',').map(x=>x.trim()).filter(Boolean);
      const colors = arr(src.color), sizes = arr(src.size), meshes = arr(src.mesh), mats = arr(src.material);
      const hero = src.image ? `<img src="${esc(src.image)}" alt="${esc(src.name)}">` : `<span>${esc(src.name)}</span>`;
      const badge = { in_stock:['stock-in','In Stock'], low_stock:['stock-low','Low Stock'], out_of_stock:['stock-out','Out of Stock'] }[src.stock] || ['stock-in','In Stock'];
      const rows = (src.rows||[]).filter(r => r[1]);
      const selField = (id, label, opts) => !opts.length ? '' :
        (opts.length === 1
          ? `<div class="field"><label>${label}</label><div class="spec-ro" id="${id}" data-v="${esc(opts[0])}">${esc(opts[0])}</div></div>`
          : `<div class="field"><label>${label}</label><select id="${id}">${opts.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></div>`);
      const colorField = !colors.length ? '' : `
        <div class="field"><label>Colour</label>
          <input type="hidden" id="partColor" value="${esc(colors[0])}">
          <div class="buy-swatches">${colors.map((c,i)=>`<button type="button" class="bswatch${i===0?' on':''}" data-v="${esc(c)}"><span class="bsw-dot" style="background:${cssColor(c)}"></span>${esc(c)}</button>`).join('')}</div>
        </div>`;
      body.innerHTML = `
        <div class="part-hero">${hero}</div>
        ${src.category?`<span class="pcard__cat">${esc(src.category)}</span>`:''}
        <h3 style="color:var(--navy);margin:.25rem 0 .4rem">${esc(src.name)}</h3>
        ${src.description?`<p style="color:var(--grey);font-size:.9rem;margin-bottom:.6rem">${esc(src.description)}</p>`:''}
        <div style="display:flex;gap:.6rem;align-items:center;margin-bottom:.5rem">
          <span class="total-line">${src.price>0?gmoney(src.price)+` <small style="color:var(--grey);font-weight:400">/ ${esc(src.unit)}${gstNote()?' · '+gstNote():''}</small>`:'Price on Request'}</span>
          <span class="stock-badge ${badge[0]}">${badge[1]}</span>
        </div>
        ${rows.length?`<table class="part-spec"><tbody>${rows.map(r=>`<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table>`:''}
        ${colorField}
        ${selField('partSize', 'Type / Size', sizes)}
        ${selField('partMesh', 'Mesh size', meshes)}
        ${selField('partMat', 'Material', mats)}
        <div class="field"><label>Quantity</label><input id="partQty" type="number" min="1" value="1" style="max-width:120px"></div>
        ${src.price>0?`<div class="ord-calc" id="partTotal"></div>`:''}`;
      const sw = body.querySelector('.buy-swatches');
      if (sw) sw.addEventListener('click', e => { const b = e.target.closest('.bswatch'); if (!b) return;
        sw.querySelectorAll('.bswatch').forEach(x=>x.classList.remove('on')); b.classList.add('on');
        $('#partColor').value = b.dataset.v; });
      const rv = id => { const el = $('#'+id); return !el ? '' : (el.dataset.v != null ? el.dataset.v : el.value); };
      const updTotal = () => { const t = $('#partTotal'); if (!t) return;
        const q = Math.max(1, Number($('#partQty').value)||1);
        t.innerHTML = `Total: <strong>${gmoney(src.price*q)}</strong> <small>(${q} × ${gmoney(src.price)} / ${esc(src.unit)}${gstNote()?' · '+gstNote():''})</small>`; };
      $('#partQty').addEventListener('input', updTotal); updTotal();
      const collect = () => ({ product_id: src.product_id, name: src.name, category: src.category, sku: src.sku, image: src.image||'',
        quantity: Math.max(1, Number($('#partQty').value)||1), unit: src.unit, unit_price: src.price,
        size: rv('partSize'), mesh_size: rv('partMesh'), material: rv('partMat'), color: rv('partColor') });
      const out = src.stock === 'out_of_stock';
      foot.innerHTML = `<div style="display:flex;gap:.5rem"><button class="btn btn--ghost" id="partAdd" ${out?'disabled':''}>Add to Cart</button><button class="btn" id="partBuy" ${out?'disabled':''}>${out?'Out of Stock':'Buy Now'}</button></div>`;
      $('#partAdd').onclick = () => { addToCart(collect()); closePart(); openCart(); };
      $('#partBuy').onclick = () => { addToCart(collect()); closePart(); openCheckout(); };
    } else {
      body.innerHTML = `<div class="part-hero"><span>${esc(h.name)}</span></div>
        <h3 style="color:var(--navy);margin:.25rem 0 .5rem">${esc(h.name)}</h3>
        <p style="color:var(--grey);font-size:.92rem">This component isn't linked to a product yet. Contact us for specifications, sizes and pricing.</p>`;
      foot.innerHTML = `<button class="btn btn--block" id="partContact">Request a Quote</button>`;
      $('#partContact').onclick = () => { closePart(); location.hash = '#contact'; };
    }
    $('#overlay').classList.add('show'); $('#partDrawer').classList.add('show');
  }
  function toggleActiveEls(id, on) {
    document.querySelectorAll(`#diagramWrap .hotspot[data-hs="${id}"], #npChips .np-chip[data-hs="${id}"]`).forEach(e => e.classList.toggle('active', on));
  }
  function closePart() {
    $('#partDrawer').classList.remove('show');
    if (openPartId) { toggleActiveEls(openPartId, false); openPartId = null; }
    if (!$('#cartDrawer').classList.contains('show') && !$('#modalMount').children.length) $('#overlay').classList.remove('show');
  }

  // ---------------- customer account (phone + OTP) ----------------
  let CUSTOMER = null;
  async function checkCustomer() {
    try { const r = await (await fetch('/api/customer/me')).json(); CUSTOMER = r.authenticated ? r.customer : null; }
    catch { CUSTOMER = null; }
    updateAuthUI();
  }
  function updateAuthUI() {
    const btn = $('#authBtn'), menu = $('#acctMenu');
    if (CUSTOMER) {
      const first = (CUSTOMER.name || CUSTOMER.phone || 'Account').split(' ')[0];
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg><span>${esc(first)}</span>`;
    } else { btn.textContent = 'Sign in'; menu.hidden = true; }
  }
  $('#authBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (CUSTOMER) { $('#acctMenu').hidden = !$('#acctMenu').hidden; }
    else openSignIn();
  });
  document.addEventListener('click', () => { $('#acctMenu').hidden = true; });
  $('#acctMenu').addEventListener('click', e => e.stopPropagation());
  $('#acctOrders').addEventListener('click', () => { $('#acctMenu').hidden = true; openMyOrders(); });
  $('#acctLogout').addEventListener('click', async () => {
    await fetch('/api/customer/logout', { method: 'POST' }); CUSTOMER = null; $('#acctMenu').hidden = true; updateAuthUI(); toast('Signed out');
  });

  // Apple-style auth popover (anchored top-right, glass overlay, fade+scale)
  function authEsc(e) { if (e.key === 'Escape') closeAuth(); }
  function closeAuth() {
    document.querySelectorAll('.auth-overlay, .auth-pop').forEach(e => e.remove());
    document.removeEventListener('keydown', authEsc);
  }
  function authShell(inner) {
    closeAuth();
    const ov = document.createElement('div'); ov.className = 'auth-overlay';
    const pop = document.createElement('div'); pop.className = 'auth-pop';
    pop.innerHTML = `<button class="auth-close" aria-label="Close">&times;</button>${inner}`;
    document.body.appendChild(ov); document.body.appendChild(pop);
    ov.addEventListener('click', closeAuth);
    pop.querySelector('.auth-close').addEventListener('click', closeAuth);
    document.addEventListener('keydown', authEsc);
    return pop;
  }
  // ---- Firebase Phone Auth (client) — used when the project is configured ----
  const fbAuthOn = () => !!(SITE.firebase_auth && SITE.firebase_config && SITE.firebase_config.apiKey);
  let _fbAuth = null, _fbLoading = null;
  function loadFirebaseAuth() {
    if (_fbAuth) return Promise.resolve(_fbAuth);
    if (_fbLoading) return _fbLoading;
    const addScript = (src) => new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
    const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
    _fbLoading = addScript(base + 'firebase-app-compat.js')
      .then(() => addScript(base + 'firebase-auth-compat.js'))
      .then(() => {
        if (!window.firebase.apps.length) window.firebase.initializeApp(SITE.firebase_config);
        _fbAuth = window.firebase.auth();
        try { _fbAuth.useDeviceLanguage(); } catch {}
        return _fbAuth;
      });
    return _fbLoading;
  }
  function ensureRecaptcha(auth) {
    if (window._fbRecaptcha) return window._fbRecaptcha;
    let holder = document.getElementById('fbRecaptcha');
    if (!holder) { holder = document.createElement('div'); holder.id = 'fbRecaptcha'; document.body.appendChild(holder); }
    // compat keeps the v8 signature: (container, params)
    window._fbRecaptcha = new window.firebase.auth.RecaptchaVerifier('fbRecaptcha', { size: 'invisible' }, auth);
    return window._fbRecaptcha;
  }

  function openSignInFirebase(onDone) {
    const pop = authShell(`
      <h3 class="auth-title">Sign in / Sign up</h3>
      <p class="auth-sub">Enter your mobile number — we'll text you a verification code.</p>
      <label class="auth-label">Name <span style="color:var(--grey);font-weight:400">(optional)</span></label>
      <input id="siName" class="auth-input" placeholder="Your name" autocomplete="name">
      <label class="auth-label" style="margin-top:10px">Mobile number</label>
      <div class="phone-row">
        <span class="phone-cc">🇮🇳 +91</span>
        <input id="siPhone" inputmode="numeric" maxlength="10" placeholder="98765 43210" autocomplete="tel">
      </div>
      <p class="form__msg err" id="siMsg"></p>
      <button class="btn btn--block auth-btn" id="siSend">Continue</button>
    `);
    const phoneEl = $('#siPhone', pop);
    phoneEl.addEventListener('input', () => { phoneEl.value = phoneEl.value.replace(/\D/g, '').slice(0, 10); });
    setTimeout(() => phoneEl.focus(), 60);
    const submit = async () => {
      const digits = phoneEl.value.replace(/\D/g, ''); const msg = $('#siMsg', pop); msg.textContent = '';
      if (!/^[6-9]\d{9}$/.test(digits)) { msg.textContent = 'Enter a valid 10-digit Indian mobile number.'; return; }
      const phone = '+91' + digits; const name = $('#siName', pop).value.trim();
      const btn = $('#siSend', pop); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const auth = await loadFirebaseAuth();
        const verifier = ensureRecaptcha(auth);
        const confirmation = await auth.signInWithPhoneNumber(phone, verifier);
        fbOtpStep(phone, confirmation, onDone, name);
      } catch (e) {
        // reset recaptcha so a retry works
        try { if (window._fbRecaptcha) { window._fbRecaptcha.clear(); window._fbRecaptcha = null; } } catch {}
        msg.textContent = fbErr(e); btn.disabled = false; btn.textContent = 'Continue';
      }
    };
    $('#siSend', pop).addEventListener('click', submit);
    phoneEl.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }
  function fbOtpStep(phone, confirmation, onDone, name) {
    const pop = authShell(`
      <h3 class="auth-title">Verify</h3>
      <p class="auth-sub">Enter the 6-digit code sent to <strong>${esc(phone)}</strong>.</p>
      <div class="otp-boxes" id="otpBoxes">${Array.from({ length: 6 }).map(() => `<input class="otp-box" inputmode="numeric" maxlength="1">`).join('')}</div>
      <p class="form__msg err" id="otpMsg"></p>
      <button class="btn btn--block auth-btn" id="otpVerify">Verify &amp; Sign In</button>
      <div class="auth-actions">
        <button class="link-btn" id="otpChange">Change number</button>
      </div>
    `);
    const boxes = [...pop.querySelectorAll('.otp-box')];
    setTimeout(() => boxes[0] && boxes[0].focus(), 60);
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => { b.value = b.value.replace(/\D/g, '').slice(0, 1); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); });
      b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus(); if (e.key === 'Enter') verify(); });
      b.addEventListener('paste', e => { const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (t) { e.preventDefault(); t.split('').forEach((c, j) => { if (boxes[j]) boxes[j].value = c; }); (boxes[Math.min(t.length, 5)]).focus(); } });
    });
    $('#otpChange', pop).addEventListener('click', () => openSignInFirebase(onDone));
    async function verify() {
      const msg = $('#otpMsg', pop); msg.textContent = '';
      const code = boxes.map(b => b.value).join('');
      if (code.length !== 6) { msg.textContent = 'Enter the 6-digit code.'; return; }
      const btn = $('#otpVerify', pop); btn.disabled = true; btn.textContent = 'Verifying…';
      try {
        const cred = await confirmation.confirm(code);
        const idToken = await cred.user.getIdToken();
        const r = await (await fetch('/api/customer/firebase-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken, name }) })).json();
        if (r.error) throw new Error(r.error);
        CUSTOMER = r.customer; updateAuthUI(); closeAuth(); toast('Signed in'); if (onDone) onDone();
      } catch (e) { msg.textContent = fbErr(e); btn.disabled = false; btn.textContent = 'Verify & Sign In'; }
    }
    $('#otpVerify', pop).addEventListener('click', verify);
  }
  function fbErr(e) {
    const c = (e && e.code) || '';
    if (c === 'auth/invalid-verification-code') return 'Incorrect code — please try again.';
    if (c === 'auth/code-expired') return 'Code expired — request a new one.';
    if (c === 'auth/too-many-requests') return 'Too many attempts. Please wait a while and try again.';
    if (c === 'auth/invalid-phone-number') return 'That phone number looks invalid.';
    return (e && e.message) || 'Something went wrong. Please try again.';
  }

  function openSignIn(onDone) {
    if (fbAuthOn()) return openSignInFirebase(onDone);
    const pop = authShell(`
      <h3 class="auth-title">Sign in / Sign up</h3>
      <p class="auth-sub">Enter your mobile number — we'll create your account automatically if you're new.</p>
      <label class="auth-label">Name <span style="color:var(--grey);font-weight:400">(optional)</span></label>
      <input id="siName" class="auth-input" placeholder="Your name" autocomplete="name">
      <label class="auth-label" style="margin-top:10px">Mobile number</label>
      <div class="phone-row">
        <span class="phone-cc">🇮🇳 +91</span>
        <input id="siPhone" inputmode="numeric" maxlength="10" placeholder="98765 43210" autocomplete="tel">
      </div>
      <p class="form__msg err" id="siMsg"></p>
      <button class="btn btn--block auth-btn" id="siSend">Continue</button>
    `);
    const phoneEl = $('#siPhone', pop);
    phoneEl.addEventListener('input', () => { phoneEl.value = phoneEl.value.replace(/\D/g, '').slice(0, 10); });
    setTimeout(() => phoneEl.focus(), 60);
    const submit = async () => {
      const digits = phoneEl.value.replace(/\D/g, ''); const msg = $('#siMsg', pop); msg.textContent = '';
      if (!/^[6-9]\d{9}$/.test(digits)) { msg.textContent = 'Enter a valid 10-digit Indian mobile number.'; return; }
      const phone = '+91' + digits; const name = $('#siName', pop).value.trim();
      const btn = $('#siSend', pop); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const r = await (await fetch('/api/customer/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) })).json();
        if (r.error) throw new Error(r.error);
        otpStep(phone, r.devCode, onDone, name);
      } catch (e) { msg.textContent = e.message; btn.disabled = false; btn.textContent = 'Continue'; }
    };
    $('#siSend', pop).addEventListener('click', submit);
    phoneEl.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }
  function otpStep(phone, devCode, onDone, name) {
    const pop = authShell(`
      <h3 class="auth-title">Verify</h3>
      <p class="auth-sub">Enter the 6-digit code sent to <strong>${esc(phone)}</strong>.</p>
      <div class="otp-boxes" id="otpBoxes">${Array.from({ length: 6 }).map(() => `<input class="otp-box" inputmode="numeric" maxlength="1">`).join('')}</div>
      <p class="form__msg err" id="otpMsg"></p>
      ${devCode ? `<div class="dev-hint">Demo mode: your code is <strong>${esc(devCode)}</strong></div>` : ''}
      <button class="btn btn--block auth-btn" id="otpVerify">Verify &amp; Sign In</button>
      <div class="auth-actions">
        <button class="otp-resend" id="otpResend" disabled>Resend in <span id="otpTimer">30</span>s</button>
        <button class="link-btn" id="otpChange">Change number</button>
      </div>
    `);
    const boxes = [...pop.querySelectorAll('.otp-box')];
    setTimeout(() => boxes[0] && boxes[0].focus(), 60);
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => { b.value = b.value.replace(/\D/g, '').slice(0, 1); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); });
      b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus(); if (e.key === 'Enter') verify(); });
      b.addEventListener('paste', e => { const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (t) { e.preventDefault(); t.split('').forEach((c, j) => { if (boxes[j]) boxes[j].value = c; }); (boxes[Math.min(t.length, 5)]).focus(); } });
    });
    let secs = 30; const timer = setInterval(() => { secs--; const t = $('#otpTimer', pop); if (t) t.textContent = secs; if (secs <= 0) { clearInterval(timer); const rb = $('#otpResend', pop); if (rb) { rb.disabled = false; rb.textContent = 'Resend code'; } } }, 1000);
    $('#otpResend', pop).addEventListener('click', async () => {
      if ($('#otpResend', pop).disabled) return; clearInterval(timer);
      const r = await (await fetch('/api/customer/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) })).json();
      if (!r.error) otpStep(phone, r.devCode, onDone, name);
    });
    $('#otpChange', pop).addEventListener('click', () => { clearInterval(timer); openSignIn(onDone); });
    async function verify() {
      const msg = $('#otpMsg', pop); msg.textContent = '';
      const code = boxes.map(b => b.value).join('');
      if (code.length !== 6) { msg.textContent = 'Enter the 6-digit code.'; return; }
      const btn = $('#otpVerify', pop); btn.disabled = true; btn.textContent = 'Verifying…';
      try {
        const r = await (await fetch('/api/customer/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code, name }) })).json();
        if (r.error) throw new Error(r.error);
        clearInterval(timer); CUSTOMER = r.customer; updateAuthUI(); closeAuth(); toast('Signed in'); if (onDone) onDone();
      } catch (e) { msg.textContent = e.message; btn.disabled = false; btn.textContent = 'Verify & Sign In'; }
    }
    $('#otpVerify', pop).addEventListener('click', verify);
  }

  async function openMyOrders() {
    let data;
    try { data = await (await fetch('/api/customer/orders')).json(); }
    catch { data = { orders: [] }; }
    if (data.error) { openSignIn(); return; }
    const rows = (data.orders || []).map(o => `
      <div class="cart-line" style="align-items:center">
        <div class="cart-line__info">
          <h4>${esc(o.order_number)}</h4>
          <div class="spec">${(o.created_at||'').replace('T',' ').slice(0,16)} · ${o.items.length} item(s)</div>
          <div class="spec">${o.items.map(i=>esc(i.name)+' × '+i.quantity).join(', ')}</div>
        </div>
        <div class="cart-line__side">
          <span class="cart-line__price">${money(o.total)}</span>
          <span class="stock-badge order-st st-${esc(o.status)}">${esc(o.status)}</span>
        </div>
      </div>`).join('');
    modal(`
      <div class="modal__head"><h3>My Orders</h3><button class="modal__close">&times;</button></div>
      <div class="modal__body">${rows || '<p style="color:var(--grey);text-align:center;padding:1rem">No orders yet.</p>'}</div>
      <div class="modal__foot" style="justify-content:flex-end"><button class="btn modal__close-btn2">Close</button></div>
    `, (box) => { box.querySelector('.modal__close-btn2').addEventListener('click', closeModal); });
  }

  // ---------------- settings / contact / footer ----------------
  function renderSettings() {
    const s = SITE.settings;
    if (s.hero_title) $('#heroTitle').textContent = s.hero_title;
    if (s.hero_subtitle) $('#heroSub').textContent = s.hero_subtitle;
    let hmedia = [];
    try { hmedia = JSON.parse(s.hero_media || '[]'); } catch { hmedia = []; }
    if (!hmedia.length && s.hero_image) hmedia = [{ type:'image', url:s.hero_image }];
    if (hmedia.length) buildHeroGallery(hmedia, Math.max(2, Number(s.hero_interval)||6));
    const brand = s.company_name || 'Shalom Marine Nets';
    if ($('#footerBrand')) { const [first, ...rest] = brand.split(' '); $('#footerBrand').innerHTML = esc(first) + (rest.length ? ' <span>' + esc(rest.join(' ')) + '</span>' : ''); }
    if (s.seo_title) document.title = s.seo_title;
    // Google Analytics 4 — loads only when a Measurement ID is set in Admin → SEO
    if (s.ga_id && /^G-[\w]+$/i.test(s.ga_id) && !window.__gaLoaded) {
      window.__gaLoaded = true;
      const g = document.createElement('script'); g.async = true;
      g.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(s.ga_id);
      document.head.appendChild(g);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function(){ window.dataLayer.push(arguments); };
      window.gtag('js', new Date()); window.gtag('config', s.ga_id);
    }

    const items = [];
    if (s.contact_whatsapp) items.push(info(icoWa, 'WhatsApp', `<a href="https://wa.me/${String(s.contact_whatsapp).replace(/\D/g,'')}" target="_blank" rel="noopener">${esc(s.contact_whatsapp)}</a>`));
    if (s.contact_email) items.push(info(icoMail, 'Email', `<a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a>`));
    if (s.contact_phone) items.push(info(icoPhone, 'Phone', `<a href="tel:${esc(String(s.contact_phone).replace(/[^\d+]/g,''))}">${esc(s.contact_phone)}</a>`));
    if (s.contact_address) items.push(info(icoPin, 'Address', `<p>${esc(s.contact_address)}</p>`));
    if (s.contact_hours) items.push(info(icoClock, 'Business Hours', `<p>${esc(s.contact_hours)}</p>`));
    let html = items.join('');
    if (s.contact_map) html += `<div class="map-embed"><iframe loading="lazy" src="${esc(s.contact_map)}" title="Map"></iframe></div>`;
    $('#contactInfo').innerHTML = html;
    // product autocomplete for the quote form
    const dl = $('#prodOptions');
    if (dl) dl.innerHTML = (SITE.products || []).map(p => `<option value="${esc(p.name)}">`).join('');

    $('#footEmail').textContent = s.contact_email || ''; $('#footEmail').href = 'mailto:' + (s.contact_email || '');
    $('#footPhone').textContent = s.contact_phone || ''; $('#footPhone').href = 'tel:' + String(s.contact_phone || '').replace(/[^\d+]/g,'');
    $('#footAddress').textContent = s.contact_address || '';
    $('#footerCopy').textContent = `© ${new Date().getFullYear()} ${brand}. All rights reserved.`;
    const social = [['social_facebook',icoFb],['social_instagram',icoIg],['social_linkedin',icoLi],['social_youtube',icoYt]];
    $('#footerSocial').innerHTML = social.filter(([k]) => s[k]).map(([k,ic]) => `<a href="${esc(s[k])}" target="_blank" rel="noopener">${ic}</a>`).join('');

    // About / capabilities (section may be removed)
    if (s.about_title && $('#aboutTitle')) $('#aboutTitle').textContent = s.about_title;
    if (s.about_body && $('#aboutBody')) $('#aboutBody').textContent = s.about_body;
    const statIcons = [
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21C7 17 3 13.5 3 9.5 3 6.5 5.5 4 8.5 4c1.8 0 3 .8 3.5 1.5C12.5 4.8 13.7 4 15.5 4 18.5 4 21 6.5 21 9.5c0 4-4 7.5-9 11.5z"/></svg>',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z"/></svg>',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5"/></svg>'];
    const stats = ['about_stat1','about_stat2','about_stat3','about_stat4'].map(k => s[k]).filter(Boolean)
      .map((v, i) => { const [b, l] = String(v).split('|'); return `<div class="sb-stat">${statIcons[i]||''}<b>${esc(b||'')}</b><span>${esc(l||'')}</span></div>`; }).join('');
    if ($('#aboutStats')) $('#aboutStats').innerHTML = stats;
    let tlist = []; try { tlist = JSON.parse(s.testimonials || '[]'); } catch {}
    if ($('#testimonials')) $('#testimonials').innerHTML = tlist.map(t =>
      `<div class="tcard"><p>${esc(t.text)}</p><div class="who"><b>${esc(t.name)}</b>${t.company ? ' · ' + esc(t.company) : ''}</div></div>`).join('');

    // FAQ accordion
    let faq = []; try { faq = JSON.parse(s.faq || '[]'); } catch {}
    const faqList = $('#faqList');
    if (faqList && faq.length) {
      $('#faq').hidden = false;
      faqList.innerHTML = faq.map((f, i) => `
        <div class="faq-item">
          <button class="faq-q" aria-expanded="false" data-i="${i}"><span>${esc(f.q)}</span><span class="faq-ic">+</span></button>
          <div class="faq-a"><p>${esc(f.a)}</p></div>
        </div>`).join('');
      faqList.querySelectorAll('.faq-q').forEach(btn => btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item'); const open = item.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.querySelector('.faq-ic').textContent = open ? '–' : '+';
      }));
    } else if ($('#faq')) { $('#faq').hidden = true; }
  }

  // ---------------- hero gallery (images + video, auto-rotating) ----------------
  function ytId(url){ const m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : ''; }
  function buildHeroGallery(list, interval) {
    const stage = $('#heroMedia'); if (!stage) return;
    stage.classList.add('hero__gallery');
    const title = esc((SITE.settings && SITE.settings.hero_title) || '');
    stage.innerHTML = list.map((m, i) => {
      const active = i === 0 ? ' is-active' : '';
      if (m.type === 'video') {
        const yid = ytId(m.url);
        if (yid) return `<div class="hslide is-video${active}" data-yt="${yid}"></div>`;
        return `<div class="hslide is-video${active}"><video src="${esc(m.url)}" muted loop playsinline preload="metadata"></video></div>`;
      }
      return `<div class="hslide${active}"><img src="${esc(m.url)}" alt="${title}"></div>`;
    }).join('') + (list.length > 1 ? `<div class="hdots">${list.map((_, i) => `<button class="hdot${i===0?' on':''}" data-i="${i}" aria-label="Slide ${i+1}"></button>`).join('')}</div>` : '');

    const slides = [...stage.querySelectorAll('.hslide')];
    const dots = [...stage.querySelectorAll('.hdot')];
    let cur = 0, timer;
    const activate = (el, on) => {
      const v = el.querySelector('video');
      if (v) { if (on) { try { v.currentTime = 0; v.play(); } catch {} } else v.pause(); }
      const yid = el.dataset.yt;
      if (yid) el.innerHTML = on
        ? `<iframe src="https://www.youtube.com/embed/${yid}?autoplay=1&mute=1&loop=1&playlist=${yid}&controls=0&modestbranding=1&rel=0&playsinline=1" allow="autoplay; encrypted-media" frameborder="0"></iframe>`
        : '';
    };
    const go = (n) => {
      n = (n + slides.length) % slides.length; if (n === cur) return;
      slides[cur].classList.remove('is-active'); activate(slides[cur], false);
      cur = n;
      slides[cur].classList.add('is-active'); activate(slides[cur], true);
      dots.forEach((d, i) => d.classList.toggle('on', i === cur));
    };
    activate(slides[0], true);
    const start = () => { if (slides.length > 1) { clearInterval(timer); timer = setInterval(() => go(cur + 1), interval * 1000); } };
    dots.forEach(d => d.addEventListener('click', () => { go(Number(d.dataset.i)); start(); }));
    start();
  }

  // ---------------- products ----------------
  function renderProducts(list) {
    list = list || SITE.products;
    const wrap = $('#productList');
    if (!SITE.products.length) { wrap.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--grey)">Products coming soon.</p>'; return; }
    wrap.innerHTML = list.map(p => {
      const imgs = p.images || [];
      let img;
      if (imgs.length > 1) {
        img = `<div class="slides">${imgs.map((u, i) => `<img class="slide product-image${i === 0 ? ' active' : ''}" src="${esc(u)}" alt="${esc(p.name)}" loading="lazy">`).join('')}</div>
          <button class="cnav cprev" data-dir="-1" aria-label="Previous image">&#8249;</button>
          <button class="cnav cnext" data-dir="1" aria-label="Next image">&#8250;</button>
          <div class="dots">${imgs.map((_, i) => `<span class="dot${i === 0 ? ' active' : ''}" data-i="${i}"></span>`).join('')}</div>`;
      } else if (imgs.length === 1) {
        img = `<img class="product-image" src="${esc(imgs[0])}" alt="${esc(p.name)}" loading="lazy">`;
      } else {
        img = `<div class="pcard__ph">${netIcon}<span>Product image</span></div>`;
      }
      const badge = { in_stock: ['stock-in','In Stock'], low_stock: ['stock-low','Low Stock'], out_of_stock: ['stock-out','Out of Stock'] }[p.stock_status];
      const price = p.effective_price > 0
        ? `<span class="pcard__price">${gmoney(p.effective_price)} <small>/ ${esc(p.default_unit || 'kg')}${gstNote()?' · '+gstNote():''}</small></span>`
        : `<span class="pcard__price"><small>Price on Request</small></span>`;
      const out = p.stock_status === 'out_of_stock';
      return `<article class="pcard reveal">
       <div class="pcard__inner">
        <div class="pcard__media" data-view="${p.id}" role="button" tabindex="0" title="View details">${img}</div>
        <div class="pcard__body">
          <div class="pcard__head">
            <span class="pcard__cat">${esc(p.category_name || 'Marine Equipment')}</span>
            <span class="pcard__hdiv"></span>
            <h3 class="pcard__name">${esc(p.name)}</h3>
          </div>
          <p class="pcard__desc">${esc(p.description || '')}</p>
          <div class="pcard__rule"></div>
          <div class="pcard__meta">${price}<span class="stock-badge ${badge[0]}">${p.stock_status==='in_stock'?`<svg class="sb-ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.3 14.3-3.4-3.4 1.4-1.4 2 2 4.6-4.6 1.4 1.4-6 6Z"/></svg>`:''}${badge[1]}</span></div>
          ${(() => {
            const sp = (v) => (v ? v : '').split(',').map(x => x.trim()).filter(Boolean);
            const cc = sp(p.specs && p.specs.color), sz = sp(p.specs && p.specs.size), me = sp(p.specs && p.specs.mesh_size), mdl = sp(p.specs && p.specs.md_size);
            const pills = (arr, cls) => arr.map((v, i) => `<button type="button" class="cs-pill ${cls}${i === 0 ? ' on' : ''}" data-v="${esc(v)}">${esc(v)}</button>`).join('');
            let h = '';
            if (cc.length) h += `<div class="card-colors" data-group="color">${cc.map((c, i) => `<button type="button" class="cc-dot${i === 0 ? ' on' : ''}" title="${esc(c)}" data-v="${esc(c)}" style="background:${cssColor(c)}"></button>`).join('')}</div>`;
            const selHtml = (grp, ttl, arr) => arr.length ? `<select class="card-select" data-group="${grp}" title="${ttl}">${arr.map((v, i) => `<option ${i === 0 ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>` : '';
            if (sz.length || me.length || mdl.length) h += `<div class="card-selrow">${selHtml('size','Size',sz)}${selHtml('mesh','Mesh size',me)}${selHtml('md','MD (mesh depth)',mdl)}</div>`;
            return h;
          })()}
          <div class="pcard__actions">
            <button class="btn btn--sm buy-btn qv-trigger" data-buy="${p.id}" data-qv="${p.id}" ${out?'disabled':''}>${out?'<span data-i18n="Out of Stock">Out of Stock</span>':`<svg class="btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2 3h2.2l1.5 12.4a1.5 1.5 0 0 0 1.5 1.3h9.3a1.5 1.5 0 0 0 1.5-1.2L20.5 7H6"/></svg><span data-i18n="Buy Now">Buy Now</span>`}</button>
            <button class="btn btn--ghost btn--sm view-btn" data-view="${p.id}"><svg class="btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg><span data-i18n="Details">Details</span></button>
          </div>
        </div>
       </div>
      </article>`;
    }).join('');
    // selectable option pills/dots on the card (single-select per group)
    wrap.querySelectorAll('.pcard [data-group]').forEach(grp => grp.querySelectorAll('button').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation(); grp.querySelectorAll('button').forEach(x => x.classList.remove('on')); btn.classList.add('on');
    })));
    wrap.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
      const card = b.closest('.pcard');
      const sel = (g) => {
        const el = card && card.querySelector(`[data-group="${g}"]`);
        if (!el) return '';
        if (el.tagName === 'SELECT') return el.value;
        const on = el.querySelector('.on'); return on ? on.dataset.v : '';
      };
      openBuy(Number(b.dataset.buy), { color: sel('color'), size: sel('size'), mesh: sel('mesh'), md: sel('md') });
    }));
    wrap.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => openDetails(Number(b.dataset.view))));
    wrap.querySelectorAll('.pcard__media[data-view]').forEach(m => m.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetails(Number(m.dataset.view)); } }));
    wrap.querySelectorAll('.qv-trigger').forEach(b => b.addEventListener('click', (e) => { if (isMobile()) { e.stopPropagation(); openQuickView(Number(b.dataset.qv)); } }));
    attachTilt(wrap);
    initCardSlideshows(wrap);
    initCardZoom(wrap);
    initReveal();
    window.applyI18n && window.applyI18n(wrap);
  }

  // hover-to-zoom magnifier on product card images (desktop only)
  function initCardZoom(wrap) {
    const fine = window.matchMedia && window.matchMedia('(pointer:fine)').matches;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduce) return;
    wrap.querySelectorAll('.pcard__media').forEach(media => {
      const target = media.querySelector('.slides') || media.querySelector('img');
      if (!target) return;
      media.addEventListener('mousemove', (e) => {
        const r = media.getBoundingClientRect();
        target.style.transformOrigin = `${((e.clientX - r.left) / r.width * 100)}% ${((e.clientY - r.top) / r.height * 100)}%`;
        target.style.transform = 'scale(1.45)';
      });
      media.addEventListener('mouseleave', () => { target.style.transform = ''; });
    });
  }

  // Auto-cycling image slideshow on product cards (pause on hover + touch swipe)
  function initCardSlideshows(wrap) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    wrap.querySelectorAll('.pcard__media .slides').forEach(sl => {
      const slides = [...sl.querySelectorAll('.slide')];
      const dots = [...sl.parentElement.querySelectorAll('.dot')];
      if (slides.length < 2) return;
      let idx = 0, timer = null;
      const go = (n) => {
        slides[idx].classList.remove('active'); if (dots[idx]) dots[idx].classList.remove('active');
        idx = (n + slides.length) % slides.length;
        slides[idx].classList.add('active'); if (dots[idx]) dots[idx].classList.add('active');
      };
      const start = () => { if (!timer && !reduce) timer = setInterval(() => go(idx + 1), 3500); };
      const stop = () => { clearInterval(timer); timer = null; };
      const card = sl.closest('.pcard');
      card.addEventListener('mouseenter', stop);
      card.addEventListener('mouseleave', start);
      dots.forEach((d, i) => d.addEventListener('click', (e) => { e.stopPropagation(); stop(); go(i); }));
      sl.parentElement.querySelectorAll('.cnav').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); stop(); go(idx + Number(btn.dataset.dir)); }));
      // Touch swipe support (left/right swipe to navigate)
      const media = sl.closest('.pcard__media');
      let touchStartX = null, touchStartY = null, swiped = false;
      sl.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) { touchStartX = null; return; }
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        swiped = false;
      }, { passive: true });
      sl.addEventListener('touchmove', e => {
        if (touchStartX == null || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        // horizontal intent — mark as a swipe so the tap-to-view click is suppressed
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) swiped = true;
      }, { passive: true });
      sl.addEventListener('touchend', e => {
        if (touchStartX == null) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
          stop(); go(idx + (dx < 0 ? 1 : -1));
          swiped = true;
        }
        touchStartX = null;
      }, { passive: true });
      // stop a swipe from also firing the card's "view details" click
      if (media) media.addEventListener('click', e => {
        if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; }
      }, true);
      start();
    });
  }

  // Pointer-driven 3D tilt + opposite image parallax (GPU transforms, rAF-throttled).
  function attachTilt(wrap) {
    return; // compact grid uses a clean CSS lift instead of 3D tilt
    if (!window.matchMedia || !window.matchMedia('(pointer:fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    wrap.querySelectorAll('.pcard').forEach(card => {
      const inner = card.querySelector('.pcard__inner');
      const img = card.querySelector('.pcard__media img');
      let raf = null, rect = null;
      inner.addEventListener('pointerenter', () => { card.classList.add('tilting'); rect = inner.getBoundingClientRect(); });
      inner.addEventListener('pointermove', (e) => {
        if (!rect) rect = inner.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;   // -0.5 .. 0.5
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          const rotY = (px * 5).toFixed(2), rotX = (-py * 5).toFixed(2);
          inner.style.transform = `translate3d(0,-11px,0) scale(1.02) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
          if (img) img.style.transform = `translate3d(${(-px*8).toFixed(1)}px,${(-py*8-5).toFixed(1)}px,0) scale(1.06)`;
        });
      });
      inner.addEventListener('pointerleave', () => {
        card.classList.remove('tilting');
        rect = null; if (raf) { cancelAnimationFrame(raf); raf = null; }
        inner.style.transform = ''; if (img) img.style.transform = '';
      });
    });
  }

  const productById = (id) => SITE.products.find(p => p.id === id);

  // ---------------- product details modal ----------------
  function openDetails(id) {
    const p = productById(id); if (!p) return;
    const imgs = p.images && p.images.length ? p.images : [];
    const spec = p.specs || {};
    const colors = (spec.color || '').split(',').map(c => c.trim()).filter(Boolean);
    const mainImg = imgs.length ? `<img id="galMain" src="${esc(imgs[0])}" alt="${esc(p.name)}">` : `<div class="pcard__ph">${netIcon}<span>Product image</span></div>`;
    const thumbs = imgs.map((u,i) => `<img class="gthumb${i===0?' active':''}" src="${esc(u)}" data-i="${i}">`).join('');
    const swatches = colors.length ? `<div class="swatches">${colors.map((c,i) => `<button class="swatch${i===0?' active':''}" data-ci="${i}" title="${esc(c)}"><span class="sw-dot" style="background:${cssColor(c)}"></span>${esc(c)}</button>`).join('')}</div>` : '';
    const stockMap = { in_stock:['det2-in','In Stock'], low_stock:['det2-low','Low Stock'], out_of_stock:['det2-out','Out of Stock'] };
    const st = stockMap[p.stock_status] || stockMap.in_stock;
    const priceTxt = p.effective_price>0 ? gmoney(p.effective_price)+' / '+esc(p.default_unit||'kg')+(gstNote()?' ('+gstNote()+')':'') : 'On Request';
    modal(`
      <div class="pm__head det2__head"><button class="pm__close" aria-label="Close">&times;</button></div>
      <div class="pm__body det2">
        <div class="det__gallery det2__galwrap">
          <div class="det2__media" id="galStage">
            ${mainImg}
            ${imgs.length>1?`<button class="gnav gprev" id="gPrev" aria-label="Previous image">&#8249;</button><button class="gnav gnext" id="gNext" aria-label="Next image">&#8250;</button>`:''}
          </div>
          ${imgs.length>1?`<div class="det2__thumbs">${thumbs}</div>`:''}
        </div>
        <span class="pcard__cat">${esc(p.category_name||'Marine Equipment')}</span>
        <h3 class="det2__name">${esc(p.name)}</h3>
        ${p.description?`<p class="det2__desc">${esc(p.description)}</p>`:''}
        ${colors.length?`<div class="det2__colors">${swatches}</div>`:''}
        <div class="det2__grid">
          <div class="det2__card"><span>Material</span><b>${esc(spec.material||'—')}</b></div>
          <div class="det2__card"><span>Available Sizes</span><b>${esc(spec.size||'—')}</b></div>
          ${spec.mesh_size?`<div class="det2__card"><span>Mesh Size</span><b>${esc(spec.mesh_size)}</b></div>`:''}
          ${spec.md_size?`<div class="det2__card"><span>MD (mesh depth)</span><b>${esc(spec.md_size)}</b></div>`:''}
          <div class="det2__card"><span>Availability</span><b class="${st[0]}">${st[1]}</b></div>
          <div class="det2__card"><span>Price</span><b>${priceTxt}</b></div>
        </div>
      </div>
      <div class="pm__foot pm__foot--split">
        <button class="btn btn--ghost" id="detailAdd" ${p.stock_status==='out_of_stock'?'disabled':''}>Add to Cart</button>
        <button class="btn" id="detailBuy" ${p.stock_status==='out_of_stock'?'disabled':''}>Buy Now</button>
      </div>`, (box) => {
      const main = $('#galMain', box);
      const thumbEls = [...box.querySelectorAll('.gthumb')];
      let gi = 0, gtimer = null, chosenColor = colors[0] || '';
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const show = (n) => { if (!imgs.length) return; gi = (n + imgs.length) % imgs.length; if (main) main.src = imgs[gi]; thumbEls.forEach((t, j) => t.classList.toggle('active', j === gi)); };
      const gstart = () => { if (!gtimer && imgs.length > 1 && !reduce) gtimer = setInterval(() => show(gi + 1), 4000); };
      const gstop = () => { clearInterval(gtimer); gtimer = null; };
      thumbEls.forEach(t => t.addEventListener('click', () => { gstop(); show(Number(t.dataset.i)); }));
      $('#gPrev', box)?.addEventListener('click', (e) => { e.stopPropagation(); gstop(); show(gi - 1); });
      $('#gNext', box)?.addEventListener('click', (e) => { e.stopPropagation(); gstop(); show(gi + 1); });
      if (main) main.addEventListener('click', () => openZoom(imgs[gi]));
      $('#gZoom', box)?.addEventListener('click', (e) => { e.stopPropagation(); openZoom(imgs[gi]); });
      // hover-to-zoom magnifier on the main image (follows the cursor)
      const stage = $('#galStage', box);
      const fine = window.matchMedia && window.matchMedia('(pointer:fine)').matches;
      if (stage && main && imgs.length && fine && !reduce) {
        stage.addEventListener('mousemove', (e) => {
          const r = main.getBoundingClientRect();
          main.style.transformOrigin = `${((e.clientX - r.left) / r.width * 100)}% ${((e.clientY - r.top) / r.height * 100)}%`;
          main.style.transform = 'scale(1.6)';
        });
        stage.addEventListener('mouseleave', () => { main.style.transform = ''; main.style.transformOrigin = 'center'; });
      }
      // colour swatches: highlight + jump to matching image when 1 image per colour
      box.querySelectorAll('.swatch').forEach(s => s.addEventListener('click', () => {
        box.querySelectorAll('.swatch').forEach(x => x.classList.remove('active'));
        s.classList.add('active'); const ci = Number(s.dataset.ci); chosenColor = colors[ci];
        if (colors.length === imgs.length && imgs.length) { gstop(); show(ci); }
      }));
      const gal = box.querySelector('.det__gallery');
      if (gal) { gal.addEventListener('mouseenter', gstop); gal.addEventListener('mouseleave', gstart); }
      gstart();
      $('#detailBuy', box).addEventListener('click', () => { closeModal(); openBuy(id, chosenColor); });
      $('#detailAdd', box).addEventListener('click', () => { closeModal(); openBuy(id, chosenColor); });
    }, 'modal__box--details');
  }

  // map a colour name to a CSS colour; two-tone "White/Red" → split gradient
  function cssColor(name) {
    const raw = String(name || '').trim().toLowerCase();
    if (raw.includes('/')) {
      const [a, b] = raw.split('/').map(s => s.trim().replace(/\s+/g, '') || '#cbd5e1');
      return `linear-gradient(135deg, ${a} 0 50%, ${b} 50% 100%)`;
    }
    const n = raw.replace(/\s+/g, '');
    return n || '#cbd5e1';
  }

  // full-screen zoom lightbox with click-to-magnify + pan
  function openZoom(src) {
    if (!src) return;
    const z = document.createElement('div'); z.className = 'zoom-overlay';
    z.innerHTML = `<img class="zoom-img" src="${esc(src)}" alt=""><button class="zoom-close" aria-label="Close">&times;</button>`;
    document.body.appendChild(z); document.body.classList.add('scroll-lock');
    const img = z.querySelector('.zoom-img'); let zoomed = false;
    const close = () => { z.remove(); document.removeEventListener('keydown', esc); if (!$('#modalMount').children.length && !$('#cartDrawer').classList.contains('show')) document.body.classList.remove('scroll-lock'); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    z.addEventListener('click', close);
    z.querySelector('.zoom-close').addEventListener('click', (e) => { e.stopPropagation(); close(); });
    img.addEventListener('click', (e) => { e.stopPropagation(); zoomed = !zoomed; img.style.transform = zoomed ? 'scale(2)' : 'scale(1)'; img.style.cursor = zoomed ? 'zoom-out' : 'zoom-in'; });
    img.addEventListener('mousemove', (e) => { if (!zoomed) return; const r = img.getBoundingClientRect(); img.style.transformOrigin = `${((e.clientX-r.left)/r.width*100)}% ${((e.clientY-r.top)/r.height*100)}%`; });
    document.addEventListener('keydown', esc);
  }

  // ---------------- Buy Now: product configurator ----------------
  function openBuy(id, pre) {
    pre = typeof pre === 'string' ? { color: pre } : (pre || {});
    const preColor = pre.color, preSize = pre.size, preMesh = pre.mesh, preMd = pre.md;
    const p = productById(id); if (!p) return;
    const spec = p.specs || {};
    const units = (p.units && p.units.length ? p.units : ['kg','Meter','pcs','Roll','Net']);
    const moq = p.min_order > 0 ? p.min_order : 1;
    const priceLabel = p.effective_price > 0 ? `${gmoney(p.effective_price)} <small>/ ${esc(p.default_unit||'kg')}${gstNote()?' · '+gstNote():''}</small>` : 'Price on Request';
    const split = (v) => String(v || '').split(',').map(c => c.trim()).filter(Boolean);
    const colors = split(spec.color), meshes = split(spec.mesh_size), sizes = split(spec.size), mds = split(spec.md_size);
    const optField = (arr, id, single, ph, pre) => arr.length > 1
      ? `<select id="${id}">${arr.map(v => `<option ${pre && pre.toLowerCase() === v.toLowerCase() ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`
      : (arr.length === 1
          ? `<input id="${id}" value="${esc(arr[0])}" readonly class="spec-ro">`
          : `<input id="${id}" value="${esc(pre || single || '')}" placeholder="${ph}">`);
    const materialsList = split(spec.material);
    // colour = visual swatch selector
    const colorField = colors.length
      ? `<div class="buy-swatches">${colors.map((c, i) => `<button type="button" class="bswatch${(preColor ? preColor.toLowerCase() === c.toLowerCase() : i === 0) ? ' on' : ''}" data-v="${esc(c)}"><span class="bsw-dot" style="background:${cssColor(c)}"></span>${esc(c)}</button>`).join('')}<input type="hidden" id="bColor" value="${esc(preColor || colors[0] || '')}"></div>`
      : `<input id="bColor" value="${esc(preColor || spec.color || '')}" placeholder="Preferred colour">`;
    const meshField = optField(meshes, 'bMesh', spec.mesh_size, 'e.g. 40mm', preMesh);
    const mdField = optField(mds, 'bMd', spec.md_size, 'e.g. 600 MD', preMd);
    const sizeField = optField(sizes, 'bSize', spec.size, 'e.g. 2 ply / 200m', preSize);
    const materialField = optField(materialsList, 'bMat', spec.material, 'Material');
    modal(`
      <div class="pm__head"><h3 class="pm__title">Order · ${esc(p.name)}</h3><span class="head-swatch" id="bHeadColor" hidden><span class="hs-dot"></span><span class="hs-name"></span></span><button class="pm__close" aria-label="Close">&times;</button></div>
      <div class="pm__body">
        <p class="ord-lead">Choose your options for <strong>${esc(p.name)}</strong>.</p>
        ${/sinker/i.test(p.category_name||'')?`<p class="ord-note">📏 Guide: about <strong>13 pieces per yard</strong> of net — a 500-yard net needs ≈ 6,500 pieces.</p>`:''}
        ${/float/i.test(p.category_name||'')?`<p class="ord-note">🛟 Floats are sold <strong>per piece</strong>. Choose the type/size you need.</p>`:''}
        <div class="ord-grid">
          ${colors.length?`<div class="field"><label>Colour</label>${colorField}</div>`:''}
          ${sizes.length?`<div class="field"><label>${/sinker/i.test(p.category_name||'')?'Weight (per piece)':(/float/i.test(p.category_name||'')?'Type / Size':'Size / Thickness')}</label>${sizeField}</div>`:''}
          ${meshes.length?`<div class="field"><label>Mesh Size</label>${meshField}</div>`:''}
          ${mds.length?`<div class="field"><label>MD (mesh depth)</label>${mdField}</div>`:''}
          ${materialsList.length?`<div class="field"><label>Material</label>${materialField}</div>`:''}
          <div class="field"><label>Quantity${p.min_order>0?` (min ${qtyUnit(p.min_order,p.default_unit)})`:''}</label><input id="bQty" type="number" min="${moq}" value="${moq}"></div>
          <div class="field"><label>Unit</label><input id="bUnit" value="${esc(p.default_unit||'kg')}" readonly class="spec-ro"></div>
        </div>
        <div class="price-bar">
          <div class="pb-item"><span>Price</span><b id="pcPrice">${priceLabel}</b></div>
          <div class="pb-item"><span>Quantity</span><b id="pcQty"></b></div>
          <div class="pb-item pb-total"><span>Total</span><b id="bTotal"></b></div>
        </div>
        <p class="ord-calc" id="varNote" hidden></p>
        <p class="ord-calc" id="ordCalc" hidden></p>
      </div>
      <div class="pm__foot">
        <button class="btn btn--ghost" id="bAdd">Add to Cart</button>
        <button class="btn" id="bBuy">Buy Now</button>
      </div>`, (box) => {
      const qty = $('#bQty', box);
      const sinker = /sinker/i.test(p.category_name || '');
      const gramsOf = (v) => { const m = String(v || '').match(/(\d+(?:\.\d+)?)\s*g/i); return m ? Number(m[1]) : 0; };
      // ---- variants: match the chosen options to a variant for price + stock ----
      const VARIANTS = (p.variants || []).filter(v => v.active !== 0);
      const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
      const curVal = (id) => { const el = $('#' + id, box); return el ? el.value : ''; };
      const matchVariant = () => {
        if (!VARIANTS.length) return null;
        const s = curVal('bSize'), m = curVal('bMesh'), d = curVal('bMd'), c = curVal('bColor');
        return VARIANTS.find(v =>
          (!v.size || eq(v.size, s)) && (!v.mesh_size || eq(v.mesh_size, m)) &&
          (!v.md_size || eq(v.md_size, d)) && (!v.color || eq(v.color, c))) || null;
      };
      let curVariant = matchVariant();
      const calc = () => {
        curVariant = matchVariant();
        const unitPrice = curVariant ? (curVariant.price || 0) : p.effective_price;
        const q = Math.max(moq, Number(qty.value) || moq);
        const unit = $('#bUnit', box) ? $('#bUnit', box).value : p.default_unit;
        $('#pcQty', box).textContent = qtyUnit(q, unit || p.default_unit);
        $('#bTotal', box).innerHTML = unitPrice > 0 ? gmoney(unitPrice * q) : 'On Request';
        // show this variant's own availability and block ordering when it's out of stock
        /* Availability vs the quantity actually typed. Under the default
           "backorder" policy a shortfall is allowed but clearly explained;
           under "block" the buttons are disabled. */
        const vNote = $('#varNote', box);
        if (vNote) {
          const target = curVariant || (VARIANTS.length ? null : p);
          if (target) {
            const av = Math.max(0, Number(target.available_stock != null ? target.available_stock : target.stock_quantity) || 0);
            const strict = stockPolicy() === 'block';
            const out = av <= 0, over = !out && q > av;
            const who = esc(curVariant ? (curVariant.label || 'This option') : p.name);
            const u = esc(p.default_unit || '');
            vNote.hidden = false;
            vNote.className = (out || over) ? 'ord-note' : 'ord-calc';
            vNote.innerHTML = out
              ? (strict
                  ? `⛔ <strong>${who}</strong> is out of stock — please choose another option.`
                  : `⛔ <strong>${who}</strong> is out of stock. You can still order it — we'll make it to order and confirm a delivery date.`)
              : over
                ? (strict
                    ? `⚠️ Only <strong>${av} ${u}</strong> left — please reduce the quantity to ${av} or less.`
                    : `⚠️ Only <strong>${av} ${u}</strong> in stock, you asked for ${q} ${u}. You can still order — the balance of <strong>${Math.round((q - av) * 100) / 100} ${u}</strong> will be made to order.`)
                : `✓ <strong>${who}</strong> — ${av} ${u} available at <strong>${gmoney(unitPrice)}</strong>`;
            const blocked = strict && (out || over);
            const ab = $('#bAdd', box), bb = $('#bBuy', box);
            if (ab) ab.disabled = blocked; if (bb) bb.disabled = blocked;
          } else if (VARIANTS.length) {
            vNote.hidden = false; vNote.className = 'ord-note';
            vNote.innerHTML = 'Select the options above to see price and availability.';
          } else vNote.hidden = true;
        }
        const note = $('#ordCalc', box);
        if (note && sinker) {
          const g = gramsOf($('#bSize', box) ? $('#bSize', box).value : '');
          if (g > 0) {
            const perKg = 1000 / g;
            if (/kg/i.test(unit)) note.innerHTML = `⚖️ ≈ <strong>${Math.round(q * perKg).toLocaleString('en-IN')} pieces</strong> · 1 kg = ${Math.round(perKg * 100) / 100} pcs (at ${g} g each)`;
            else note.innerHTML = `⚖️ ≈ <strong>${(Math.round(q * g / 1000 * 100) / 100).toLocaleString('en-IN')} kg</strong> · ${g} g each`;
            note.hidden = false;
          } else note.hidden = true;
        }
      };
      qty.addEventListener('input', calc);
      ['bSize','bMesh','bMd','bMat','bUnit'].forEach(id => { const el = $('#' + id, box); if (el) el.addEventListener('change', calc); });
      calc();
      const head = box.querySelector('.pm__head'), headSw = $('#bHeadColor', box);
      const updateHead = (c) => {
        if (!headSw) return;
        if (!c) { headSw.hidden = true; if (head) head.style.background = ''; return; }
        headSw.querySelector('.hs-dot').style.background = cssColor(c);
        headSw.querySelector('.hs-name').textContent = c; headSw.hidden = false;
        if (head) head.style.background = `color-mix(in srgb, ${cssColor(c)} 24%, #fff)`;
      };
      if (colors.length) updateHead((preColor && colors.find(c => c.toLowerCase() === preColor.toLowerCase())) || colors[0]);
      box.querySelectorAll('.bswatch').forEach(s => s.addEventListener('click', () => {
        box.querySelectorAll('.bswatch').forEach(x => x.classList.remove('on')); s.classList.add('on');
        const h = $('#bColor', box); if (h) h.value = s.dataset.v;
        updateHead(s.dataset.v); calc();
      }));
      const rv = (id) => { const el = $('#' + id, box); return el ? el.value : ''; };
      const collect = () => ({
        product_id: p.id, name: p.name, category: p.category_name, sku: (curVariant && curVariant.sku) || p.sku, image: (p.images||[])[0] || '',
        variant_id: curVariant ? curVariant.id : '', variant_label: curVariant ? (curVariant.label || '') : '',
        quantity: Math.max(moq, Number(qty.value) || moq), unit: rv('bUnit') || p.default_unit,
        unit_price: curVariant ? (curVariant.price || 0) : p.effective_price,
        size: rv('bSize'), mesh_size: rv('bMesh'), md_size: rv('bMd'), material: rv('bMat') || spec.material || '',
        color: rv('bColor'), custom_specs: '', special_instructions: '',
      });
      $('#bAdd', box).addEventListener('click', () => { addToCart(collect()); closeModal(); openCart(); });
      $('#bBuy', box).addEventListener('click', () => { addToCart(collect()); closeModal(); openCheckout(); });
    }, 'modal__box--order');
  }

  // ---------------- cart ----------------
  function addToCart(item) { CART.push({ ...item, _id: Date.now() + Math.random() }); save(); updateCartUI(); updateStickyCartCount(); toast('Added to cart'); }
  function removeFromCart(_id) { CART = CART.filter(i => i._id !== _id); save(); updateCartUI(); openCart(); }
  function setQty(_id, q) { const it = CART.find(i => i._id === _id); if (it) { it.quantity = Math.max(1, q); save(); updateCartUI(); openCart(); } }
  function saveForLater(_id) { const it = CART.find(i => i._id === _id); if (it) { CART = CART.filter(i => i._id !== _id); SAVED.push(it); save(); updateCartUI(); openCart(); } }
  function moveToCart(_id) { const it = SAVED.find(i => i._id === _id); if (it) { SAVED = SAVED.filter(i => i._id !== _id); CART.push(it); save(); updateCartUI(); openCart(); } }
  const cartSubtotal = () => CART.reduce((s, i) => s + (i.unit_price || 0) * i.quantity, 0);

  function updateCartUI() {
    const n = CART.reduce((s, i) => s + i.quantity, 0);
    const c = $('#cartCount'); c.textContent = n; c.hidden = n === 0;
    updateStickyCartCount();
  }

  function lineImg(i) { return i.image ? `<img class="cart-line__img" src="${esc(i.image)}">` : `<div class="cart-line__img">No image</div>`; }
  function specLine(i) {
    return [i.size && `Size: ${i.size}`, i.mesh_size && `Mesh: ${i.mesh_size}`, i.md_size && `MD: ${i.md_size}`,
      i.material && `${i.material}`, i.color && `Colour: ${i.color}`].filter(Boolean).map(esc).join(' · ');
  }

  function openCart() {
    const body = $('#cartBody'), foot = $('#cartFoot');
    if (!CART.length && !SAVED.length) {
      body.innerHTML = `<div class="cart-empty"><p>Your cart is empty.</p><button class="btn btn--sm" style="margin-top:1rem" id="cartShop">Browse Products</button></div>`;
      foot.innerHTML = '';
      $('#cartShop')?.addEventListener('click', () => { closeCart(); location.hash = '#products'; });
    } else {
      body.innerHTML = CART.map(i => `
        <div class="cart-line">
          ${lineImg(i)}
          <div class="cart-line__main">
            <div class="cl-top"><h4>${esc(i.name)}</h4><span class="cart-line__price">${i.unit_price>0?gmoney(i.unit_price*i.quantity):'Quote'}</span></div>
            <div class="spec">${specLine(i)}</div>
            <div class="cl-stock" data-stockfor="${i._id}"></div>
            <div class="cl-bottom">
              <div class="qty"><button data-dec="${i._id}">−</button><input value="${i.quantity}" data-qty="${i._id}"><button data-inc="${i._id}">+</button></div>
              <span class="qty-unit">${esc(i.unit||'kg')}</span>
              <span class="cl-links"><button class="link-btn" data-save="${i._id}">Save</button><button class="link-btn" data-rm="${i._id}">Remove</button></span>
            </div>
          </div>
        </div>`).join('') || '<p style="color:var(--grey)">No items in cart.</p>';
      if (SAVED.length) {
        body.innerHTML += `<div class="saved-head">Saved for later</div>` + SAVED.map(i => `
          <div class="cart-line">${lineImg(i)}
            <div class="cart-line__main">
              <div class="cl-top"><h4>${esc(i.name)}</h4><span class="cart-line__price">${i.unit_price>0?money(i.unit_price*i.quantity):'Quote'}</span></div>
              <div class="spec">${specLine(i)}</div>
              <div class="cl-bottom"><span class="qty-unit">${i.quantity} ${esc(i.unit||'kg')}</span><span class="cl-links"><button class="link-btn" data-move="${i._id}">Move to cart</button></span></div>
            </div>
          </div>`).join('');
      }
      const sub = cartSubtotal();
      foot.innerHTML = `
        <div class="cart-summary-row"><span>Subtotal ${gstNote()?`<small style="color:var(--grey)">(${gstNote()})</small>`:''}</span><span>${sub>0?gmoney(sub):'On request'}</span></div>
        <div class="cart-summary-row"><span>Estimated shipping</span><span>Calculated at review</span></div>
        <div class="cart-summary-row total"><span>Total</span><span>${sub>0?gmoney(sub):'On request'}</span></div>
        <button class="btn btn--block" id="goCheckout" style="margin-top:.6rem" ${CART.length?'':'disabled'}>Checkout</button>`;
      body.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => setQty(Number(b.dataset.inc), qtyOf(b.dataset.inc)+1)));
      body.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => setQty(Number(b.dataset.dec), qtyOf(b.dataset.dec)-1)));
      body.querySelectorAll('[data-qty]').forEach(inp => inp.addEventListener('change', () => setQty(Number(inp.dataset.qty), Number(inp.value)||1)));
      body.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => removeFromCart(Number(b.dataset.rm))));
      body.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', () => saveForLater(Number(b.dataset.save))));
      body.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => moveToCart(Number(b.dataset.move))));
      $('#goCheckout')?.addEventListener('click', () => { closeCart(); openCheckout(); });
      /* Live availability per cart line — tells the customer "only N left"
         while they can still do something about it. */
      if (CART.length) liveStock(CART).then(chk => {
        if (!chk) return;
        const strict = chk.policy === 'block';
        CART.forEach((i, k) => {
          const r = chk.rows[k], el = body.querySelector(`[data-stockfor="${i._id}"]`);
          if (!r || !el) return;
          if (r.ok) { el.innerHTML = ''; return; }
          el.className = 'cl-stock cl-stock--warn';
          el.innerHTML = r.available > 0
            ? `⚠️ Only <strong>${r.available} ${esc(r.unit || '')}</strong> in stock` + (strict ? ` — reduce to continue` : ` · balance made to order`)
            : `⛔ Out of stock` + (strict ? ' — remove to continue' : ' · made to order');
        });
      });
    }
    $('#overlay').classList.add('show'); $('#cartDrawer').classList.add('show'); document.body.classList.add('scroll-lock');
  }
  const qtyOf = (id) => { const it = CART.find(i => i._id == id); return it ? it.quantity : 1; };
  function closeCart() { $('#cartDrawer').classList.remove('show'); if (!$('#modalMount').children.length) { $('#overlay').classList.remove('show'); document.body.classList.remove('scroll-lock'); } }

  // ---------------- checkout ----------------
  let COUPON = null;
  function openCheckout() {
    if (!CART.length) { openCart(); return; }
    COUPON = null;
    const ship = SITE.shipping || [];
    const pays = SITE.payments || [];
    modal(`
      <div class="pm__head"><h3 class="pm__title">Checkout</h3><button class="pm__close" aria-label="Close">&times;</button></div>
      <div class="pm__body">
        <div class="pm__split">
          <div class="pm__main">
            ${CUSTOMER ? '' : `<div class="co-login"><span>Returning customer? Sign in with your mobile number to autofill.</span><button type="button" id="coLogin">Sign In</button></div>`}
            <div class="frow2">
              <div class="field"><label>Full Name *</label><input id="cFull"></div>
              <div class="field"><label>Phone *</label><input id="cPhone" type="tel"></div>
            </div>
            <div class="frow2">
              <div class="field"><label>Email *</label><input id="cEmail" type="email"></div>
              <div class="field"><label>Country</label><input id="cCountry" value="India"></div>
            </div>
            <div class="frow2">
              <div class="field"><label>State</label><input id="cState"></div>
              <div class="field"><label>City</label><input id="cCity"></div>
            </div>
            <div class="frow2">
              <div class="field"><label>PIN Code</label><input id="cPin" inputmode="numeric"></div>
              <div class="field"><label>Shipping Method</label><select id="cShip">${ship.map(s=>`<option value="${s.id}">${esc(s.name)}${s.charge?` (+${money(s.charge)})`:''}</option>`).join('')||'<option value="">To be advised</option>'}</select></div>
            </div>
            <div class="field"><label>Address *</label><textarea id="cAddr"></textarea></div>
            <button type="button" class="more-toggle" id="moreToggle">+ Additional Details</button>
            <div class="more-panel" id="morePanel" hidden>
              <div class="frow2">
                <div class="field"><label>Company</label><input id="cCompany"></div>
                <div class="field"><label>WhatsApp</label><input id="cWa" type="tel"></div>
              </div>
              <div class="frow2">
                <div class="field"><label>GST (optional)</label><input id="cGst"></div>
                <div class="field"><label>Coupon</label><div style="display:flex;gap:8px"><input id="cCoupon" placeholder="Code"><button class="btn btn--ghost btn--sm" id="applyCoupon" type="button">Apply</button></div></div>
              </div>
              <p class="form__msg" id="couponMsg"></p>
            </div>
          </div>
          <aside class="pm__aside">
            <div class="summary-card">
              <div class="summary-card__title">Order Summary</div>
              <div id="summary"></div>
            </div>
            <div class="field" style="margin-top:12px"><label>Payment Method</label><select id="cPay">${pays.map(p=>`<option value="${esc(p.key)}">${esc(p.name)}</option>`).join('')||'<option value="">To be advised</option>'}</select></div>
            <div class="pay-note" id="payNote"></div>
          </aside>
        </div>
        <p class="stock-warn" id="stockWarn" hidden></p>
        <p class="form__msg err" id="checkoutMsg"></p>
      </div>
      <div class="pm__foot pm__foot--split">
        <span class="foot-total">Total: <b id="coTotal"></b></span>
        <div style="display:flex;gap:10px">
          <button class="btn btn--ghost" id="coBack">Back</button>
          <button class="btn" id="placeOrder">Place Order</button>
        </div>
      </div>`, (box) => {
      $('#coBack', box).addEventListener('click', () => { closeModal(); openCart(); });
      $('#coLogin', box)?.addEventListener('click', () => openSignIn(() => { closeModal(); openCheckout(); }));
      $('#moreToggle', box).addEventListener('click', () => {
        const pnl = $('#morePanel', box); pnl.hidden = !pnl.hidden;
        $('#moreToggle', box).textContent = (pnl.hidden ? '+ ' : '– ') + 'Additional Details';
      });
      const shipSel = $('#cShip', box), paySel = $('#cPay', box);
      if (CUSTOMER) {
        const set = (id, v) => { const el = $('#' + id, box); if (el && v) el.value = v; };
        set('cFull', CUSTOMER.name); set('cCompany', CUSTOMER.company); set('cEmail', CUSTOMER.email);
        set('cPhone', CUSTOMER.phone); set('cWa', CUSTOMER.whatsapp); set('cCountry', CUSTOMER.country);
      }
      function shipCharge() { const s = ship.find(x => x.id == shipSel.value); return s ? s.charge : 0; }
      function renderSummary() {
        const sub = cartSubtotal();
        const disc = COUPON ? COUPON.discount : 0;
        const shipC = shipCharge();
        const taxable = Math.max(0, sub - disc);
        const gst = taxable * GSTR() / 100;
        const total = taxable + gst + shipC;
        $('#summary', box).innerHTML = CART.map(i => `<div class="cart-summary-row"><span>${esc(i.name)} × ${i.quantity}</span><span>${i.unit_price>0?money(i.unit_price*i.quantity):'Quote'}</span></div>`).join('')
          + `<div class="cart-summary-row"><span>Subtotal (excl. GST)</span><span>${money(sub)}</span></div>`
          + (disc ? `<div class="cart-summary-row"><span>Discount (${esc(COUPON.code)})</span><span>−${money(disc)}</span></div>` : '')
          + (GSTR() ? `<div class="cart-summary-row"><span>GST (${GSTR()}%)</span><span>${money(gst)}</span></div>` : '')
          + `<div class="cart-summary-row"><span>Shipping</span><span>${shipC?money(shipC):'TBD'}</span></div>`
          + `<div class="cart-summary-row total"><span>Estimated Total</span><span>${money(total)}</span></div>`
          + (GSTR() ? `<div class="gst-note">✓ ${GSTR()}% GST included</div>` : '');
        $('#coTotal', box).textContent = money(total);
        const pm = pays.find(p => p.key === paySel.value);
        $('#payNote', box).textContent = pm ? pm.instructions : 'Payment details will be sent after we review your order.';
      }
      shipSel.addEventListener('change', renderSummary); paySel.addEventListener('change', renderSummary);
      renderSummary();
      $('#applyCoupon', box).addEventListener('click', async () => {
        const code = $('#cCoupon', box).value.trim(); const m = $('#couponMsg', box);
        if (!code) return;
        const r = await (await fetch('/api/public/coupon', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ code, subtotal: cartSubtotal() }) })).json();
        if (r.ok) { COUPON = r; m.className='form__msg ok'; m.textContent = `Applied − ${money(r.discount)}`; }
        else { COUPON = null; m.className='form__msg err'; m.textContent = r.error; }
        renderSummary();
      });
      $('#placeOrder', box).addEventListener('click', async () => {
        const msg = $('#checkoutMsg', box);
        const st = $('#cState', box).value.trim(), ci = $('#cCity', box).value.trim(), gst = $('#cGst', box).value.trim();
        const addrParts = [$('#cAddr', box).value.trim(), [ci, st].filter(Boolean).join(', '), gst ? 'GST: ' + gst : ''].filter(Boolean);
        const customer = {
          full_name: $('#cFull', box).value.trim(), company: $('#cCompany', box).value.trim(),
          email: $('#cEmail', box).value.trim(), phone: $('#cPhone', box).value.trim(),
          whatsapp: $('#cWa', box).value.trim(), country: $('#cCountry', box).value.trim(),
          address: addrParts.join(' · '), postal_code: $('#cPin', box).value.trim(),
        };
        if (!customer.full_name || !customer.email || !$('#cAddr', box).value.trim()) { msg.textContent = 'Please fill name, email and address.'; return; }
        const payload = {
          customer, items: CART, coupon_code: COUPON ? COUPON.code : '',
          shipping_method_id: shipSel.value, payment_method: paySel.value,
        };
        const btn = $('#placeOrder', box); btn.disabled = true; btn.textContent = 'Checking stock…';
        // Re-check against live stock: items may have sold while this cart was open.
        const chk = await liveStock(CART);
        if (chk && !chk.ok) {
          const bad = chk.rows.filter(r => !r.ok);
          const lines = bad.map(r => `• ${r.name}${r.label ? ' (' + r.label + ')' : ''} — you asked for ${r.requested} ${r.unit}, ${r.available > 0 ? `only <strong>${r.available} ${r.unit}</strong> left` : '<strong>out of stock</strong>'}`).join('<br>');
          if (chk.policy === 'block') {
            msg.innerHTML = `Please adjust your quantities:<br>${lines}`;
            btn.disabled = false; btn.textContent = 'Place Order'; return;
          }
          const warn = $('#stockWarn', box);
          if (warn && !warn.dataset.shown) {          // explain once, then let them confirm
            warn.dataset.shown = '1';
            warn.hidden = false;
            warn.innerHTML = `<strong>Some items exceed our current stock:</strong><br>${lines}<br><br>You can still place this order — we'll make the balance to order and confirm a delivery date. Press <strong>Place Order</strong> again to continue.`;
            btn.disabled = false; btn.textContent = 'Place Order'; return;
          }
        }
        btn.textContent = 'Placing…';
        try {
          const res = await fetch('/api/public/order', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
          const r = await res.json();
          if (res.status === 409 && r.issues) {       // server had the final say
            msg.innerHTML = 'Please adjust your quantities:<br>' + r.issues.map(i => '• ' + esc(i.message)).join('<br>');
            btn.disabled = false; btn.textContent = 'Place Order'; return;
          }
          if (!r.ok) throw new Error(r.error || 'Could not place order');
          CART = []; COUPON = null; save(); updateCartUI();
          orderSuccess(r);
        } catch (e) { msg.textContent = e.message; btn.disabled = false; btn.textContent = 'Place Order'; }
      });
    }, 'modal__box--checkout');
  }

  function orderSuccess(r) {
    const canPay = SITE.razorpay && r.total > 0;
    modal(`
      <div class="modal__head"><h3>Order Received</h3><button class="modal__close">&times;</button></div>
      <div class="modal__body"><div class="success-box">
        <div class="check">✓</div>
        <h3 style="color:var(--navy)">Thank you — your order is in.</h3>
        <p style="color:var(--grey);margin:.6rem 0">Order <strong>${esc(r.order_number)}</strong></p>
        <p style="color:var(--grey);max-width:42ch;margin:0 auto">${canPay
          ? `You can pay securely online now, or we'll send a payment request after review. Total: <strong>${money(r.total)}</strong>.`
          : `Our team will review pricing, stock and shipping, then send you a payment request. Estimated total: <strong>${money(r.total)}</strong>.`}</p>
        <p class="form__msg err" id="payMsg" style="margin-top:.6rem"></p>
      </div></div>
      <div class="modal__foot" style="justify-content:${canPay ? 'space-between' : 'flex-end'}">
        <button class="btn btn--ghost modal__close-btn">${canPay ? 'Pay later' : 'Done'}</button>
        ${canPay ? `<button class="btn" id="payNowBtn">Pay Now Online</button>` : ''}
      </div>`, (box) => {
      box.querySelector('.modal__close-btn').addEventListener('click', closeModal);
      const pb = $('#payNowBtn', box);
      if (pb) pb.addEventListener('click', () => payNow(r.order_number, pb, $('#payMsg', box)));
    });
  }

  function loadRazorpayCheckout() {
    return new Promise((res, rej) => {
      if (window.Razorpay) return res();
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = res; s.onerror = () => rej(new Error('Could not load the payment window. Check your connection.'));
      document.head.appendChild(s);
    });
  }
  async function payNow(orderNumber, btn, msgEl) {
    if (msgEl) msgEl.textContent = '';
    btn.disabled = true; btn.textContent = 'Starting…';
    try {
      await loadRazorpayCheckout();
      const r = await (await fetch('/api/public/pay/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_number: orderNumber }) })).json();
      if (r.error) throw new Error(r.error);
      const rzp = new window.Razorpay({
        key: r.key, amount: r.amount, currency: r.currency, name: r.name,
        description: 'Order ' + r.order_number, order_id: r.razorpay_order_id,
        prefill: r.prefill, theme: { color: '#0071c5' },
        handler: async (resp) => {
          try {
            const v = await (await fetch('/api/public/pay/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ order_number: r.order_number, razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature }) })).json();
            if (v.ok) paymentDone(r.order_number);
            else if (msgEl) { msgEl.textContent = v.error || 'Payment could not be verified. If money was deducted, contact us.'; btn.disabled = false; btn.textContent = 'Pay Now Online'; }
          } catch { if (msgEl) msgEl.textContent = 'Could not confirm payment. If money was deducted, contact us.'; btn.disabled = false; btn.textContent = 'Pay Now Online'; }
        },
        modal: { ondismiss: () => { btn.disabled = false; btn.textContent = 'Pay Now Online'; } },
      });
      rzp.on('payment.failed', (r2) => { if (msgEl) msgEl.textContent = (r2 && r2.error && r2.error.description) || 'Payment failed. Please try again.'; btn.disabled = false; btn.textContent = 'Pay Now Online'; });
      rzp.open();
    } catch (e) { if (msgEl) msgEl.textContent = e.message; btn.disabled = false; btn.textContent = 'Pay Now Online'; }
  }
  function paymentDone(orderNumber) {
    modal(`
      <div class="modal__head"><h3>Payment Successful</h3><button class="modal__close">&times;</button></div>
      <div class="modal__body"><div class="success-box">
        <div class="check">✓</div>
        <h3 style="color:var(--navy)">Payment received — thank you!</h3>
        <p style="color:var(--grey);margin:.6rem 0">Order <strong>${esc(orderNumber)}</strong> is now paid.</p>
        <p style="color:var(--grey);max-width:42ch;margin:0 auto">We've emailed your confirmation. Our team will arrange dispatch and keep you posted.</p>
      </div></div>
      <div class="modal__foot" style="justify-content:flex-end"><button class="btn modal__close-btn2">Done</button></div>`, (box) => {
      box.querySelector('.modal__close-btn2').addEventListener('click', closeModal);
    });
  }

  // ---------------- contact form ----------------
  $('#contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#submitBtn'), out = $('#formMsg');
    out.className = 'form__msg'; out.textContent = '';
    const p = Object.fromEntries(new FormData(e.target).entries());
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const qty = Math.max(1, Number(p.quantity) || 1);
      const r = await (await fetch('/api/public/order', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ customer: { full_name: p.name, company: p.company, email: p.email, phone: p.phone, address: 'See message' },
          items: [{ product_id: null, name: (p.product && p.product.trim()) || 'Quote request', quantity: qty, unit: p.unit || 'kg', unit_price: 0, special_instructions: p.message } ] }) })).json();
      if (!r.ok) throw new Error(r.error || 'Something went wrong');
      out.className = 'form__msg ok'; out.textContent = "Thank you — we'll be in touch shortly."; e.target.reset();
    } catch (err) { out.className = 'form__msg err'; out.textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = 'Submit Quote'; }
  });

  // ---------------- modal + drawer plumbing ----------------
  function modalEsc(e) { if (e.key === 'Escape') closeModal(); }
  function modal(html, onMount, boxClass) {
    const wrap = document.createElement('div'); wrap.className = 'modal';
    wrap.innerHTML = `<div class="modal__box ${boxClass || ''}">${html}</div>`;
    $('#modalMount').appendChild(wrap); $('#overlay').classList.add('show');
    document.body.classList.add('scroll-lock');
    document.addEventListener('keydown', modalEsc);
    wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
    wrap.querySelectorAll('.modal__close, .pm__close').forEach(b => b.addEventListener('click', closeModal));
    const box = wrap.querySelector('.modal__box');
    if (onMount) onMount(box);
    const first = box.querySelector('input:not([readonly]):not([type=hidden]), select, textarea');
    if (first) setTimeout(() => { try { first.focus(); } catch {} }, 60);
  }
  function closeModal() {
    $('#modalMount').innerHTML = '';
    document.removeEventListener('keydown', modalEsc);
    if (!$('#cartDrawer').classList.contains('show')) { $('#overlay').classList.remove('show'); document.body.classList.remove('scroll-lock'); }
  }
  $('#cartBtn').addEventListener('click', openCart);
  $('#cartClose').addEventListener('click', closeCart);
  $('#partClose').addEventListener('click', closePart);
  $('#overlay').addEventListener('click', () => { closeCart(); closeModal(); closePart(); });

  // ---------------- reveal ----------------
  function initReveal() {
    const els = document.querySelectorAll('.reveal:not(.in)');
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver((ents) => ents.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: .12 });
    els.forEach(e => io.observe(e));
  }

  // icons
  function info(icon, title, body) { return `<div class="info-item"><span class="ic">${icon}</span><div><h4>${title}</h4>${body}</div></div>`; }
  const icoMail = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`;
  const icoPhone = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>`;
  const icoPin = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
  const icoClock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
  const icoWa = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.2-5.4A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.5 8.5c0 3.5 3.5 7 7 7"/></svg>`;
  const icoFb = `<svg viewBox="0 0 24 24"><path d="M13 22v-8h2.7l.4-3H13V9c0-.9.3-1.5 1.6-1.5H16V4.9c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1V11H7v3h2.6v8H13z"/></svg>`;
  const icoIg = `<svg viewBox="0 0 24 24"><path d="M12 8.8A3.2 3.2 0 1 0 15.2 12 3.2 3.2 0 0 0 12 8.8Zm0 5.3A2.1 2.1 0 1 1 14.1 12 2.1 2.1 0 0 1 12 14.1Zm4.1-5.4a.75.75 0 1 1-.75-.75.75.75 0 0 1 .75.75ZM19 8.7a7.4 7.4 0 0 0-.2-2.5 3.6 3.6 0 0 0-2-2 7.4 7.4 0 0 0-2.5-.2H9.7a7.4 7.4 0 0 0-2.5.2 3.6 3.6 0 0 0-2 2A7.4 7.4 0 0 0 5 8.7v6.6a7.4 7.4 0 0 0 .2 2.5 3.6 3.6 0 0 0 2 2 7.4 7.4 0 0 0 2.5.2h4.6a7.4 7.4 0 0 0 2.5-.2 3.6 3.6 0 0 0 2-2 7.4 7.4 0 0 0 .2-2.5V8.7Z"/></svg>`;
  const icoLi = `<svg viewBox="0 0 24 24"><path d="M6.94 5A1.94 1.94 0 1 1 5 3.06 1.94 1.94 0 0 1 6.94 5ZM5.1 8.5h3.7V21H5.1Zm5.9 0h3.5v1.7h.05a3.9 3.9 0 0 1 3.5-1.9c3.7 0 4.4 2.4 4.4 5.6V21h-3.7v-5.4c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9V21H11Z"/></svg>`;
  const icoYt = `<svg viewBox="0 0 24 24"><path d="M23 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.7-1.7C19.4 5.2 12 5.2 12 5.2s-7.4 0-8.9.4a2.5 2.5 0 0 0-1.7 1.7C1 8.8 1 12 1 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.7 1.7c1.5.4 8.9.4 8.9.4s7.4 0 8.9-.4a2.5 2.5 0 0 0 1.7-1.7C23 15.2 23 12 23 12Zm-13 3V9l5.2 3Z"/></svg>`;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1800); }

  /* Small settle animation whenever any dropdown value changes. Delegated, so
     it covers selects rendered later (cards, buy modal, net-type bar). */
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || el.tagName !== 'SELECT') return;
    el.classList.remove('just-picked');
    void el.offsetWidth;                    // restart the animation
    el.classList.add('just-picked');
    setTimeout(() => el.classList.remove('just-picked'), 320);
  }, true);

  boot();
})();
