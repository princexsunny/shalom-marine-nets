/* Admin single-page app — B2B commerce management */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const main = $('#main');
  let ME = { role: 'admin' };
  let SETTINGS = {};
  let SUPPLIERS = [];        // cached for the product editor's supplier dropdown
  const CURSYM = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', AUD: 'A$', SGD: 'S$' };
  const cur = () => { const c = SETTINGS.currency; return c && c !== 'USD' ? c : 'INR'; };
  const curSym = () => CURSYM[cur()] || (cur() + ' ');
  const money = (v) => `${curSym()}${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const date = (s) => (s || '').replace('T', ' ').slice(0, 16);

  // Predefined spec options (admin selects one or more)
  const SPEC_SIZES = ['0.5 ply', '1 ply', '1.5 ply', '2 ply', '3 ply', '4 ply', '5 ply', '6 ply', '7 ply', '8 ply', '9 ply'];
  const ROPE_SIZES = ['1mm', '2mm', '3mm', '4mm', '6mm', '8mm', '10mm', '12mm', '16mm', '18mm', '22mm', '24mm', '26mm', '28mm', '30mm', '32mm', '34mm'];
  const FLOAT_TYPES = ['Apple Float', 'Plastic Type', 'Sponge Type', '4 inch', '6 inch'];
  const SINKER_WEIGHTS = ['200 gram', '300 gram', '400 gram', '500 gram'];
  const SPEC_MESH = ['6mm', '8mm', '9mm', '10mm', '12mm', '14mm', '16mm', '18mm', '20mm', '21mm', '22mm', '24mm', '25mm', '28mm', '30mm', '32mm', '36mm', '38mm', '40mm', '42mm', '44mm', '48mm', '50mm', '60mm', '70mm', '80mm', '100mm', '120mm'];
  const SPEC_MD = ['400 MD', '450 MD', '500 MD', '600 MD', '640 MD', '660 MD', '700 MD', '800 MD', '1000 MD'];
  const SPEC_COLORS = ['Red', 'Green', 'Brown', 'Blue', 'Yellow', 'White', 'Black'];
  const FLOAT_COLORS = ['Yellow', 'Green', 'Red', 'Orange', 'White/Red', 'Red/Green'];
  const SPEC_MATERIALS = ['Nylon', 'Polyester', 'PE', 'HDPE', 'PP'];
  const catNameById = (id) => { const c = CATS.find(c => c.id == id); return c ? c.name : ''; };
  // colour name → CSS (two-tone "White/Red" becomes a split swatch)
  const colorCss = (name) => {
    const raw = String(name || '').trim().toLowerCase();
    if (!raw) return '#cbd5e1';
    if (raw.includes('/')) {
      const [a, b] = raw.split('/').map(s => s.trim().replace(/\s+/g, '') || '#cbd5e1');
      return `linear-gradient(135deg, ${a} 0 50%, ${b} 50% 100%)`;
    }
    return raw.replace(/\s+/g, '') || '#cbd5e1';
  };
  const colorChip = (c) => c ? `<span class="v-dot" style="background:${colorCss(c)}" title="${esc(c)}"></span>${esc(c)}` : '';
  // a distinct colour per product type/category, for quick scanning
  const catColor = (name) => {
    const n = String(name || '').toLowerCase();
    if (/rope/.test(n)) return '#b26a00';
    if (/float/.test(n)) return '#1a7f37';
    if (/sinker/.test(n)) return '#6b46c1';
    if (/accessor/.test(n)) return '#0d9488';
    if (/net/.test(n)) return '#0071c5';
    return '#6e6e73';
  };
  const catTag = (name) => name
    ? `<span class="cat-chip" style="background:${catColor(name)}1f;color:${catColor(name)}">${esc(name)}</span>` : '';
  // variant label with a real colour swatch
  const variantCell = (v) => {
    const specs = [v.size, v.mesh_size, v.md_size].filter(Boolean).map(esc).join(' · ');
    const col = colorChip(v.color);
    const mat = v.material ? esc(v.material) : '';
    return [specs, col, mat].filter(Boolean).join(' · ');
  };
  // per-category spec configuration (size options, mesh visibility, default unit, colours)
  function specConfig(catId) {
    const n = catNameById(catId).toLowerCase();
    if (/rope/.test(n)) return { sizes: ROPE_SIZES, colors: SPEC_COLORS, label: 'Size (diameter)', hint: '(diameter — select one or more)', mesh: false, md: false, mat: true, color: true, unit: 'kg' };
    if (/float/.test(n)) return { sizes: FLOAT_TYPES, colors: FLOAT_COLORS, label: 'Type / Size', hint: '(per piece — select one or more)', mesh: false, md: false, mat: false, color: true, unit: 'pcs' };
    if (/sinker/.test(n)) return { sizes: SINKER_WEIGHTS, colors: SPEC_COLORS, label: 'Weight (per piece)', hint: '(sold by kg — pieces auto-calculated)', mesh: false, md: false, mat: false, color: false, unit: 'kg' };
    return { sizes: SPEC_SIZES, colors: SPEC_COLORS, label: 'Size / Thickness', hint: '(select one or more)', mesh: true, md: true, mat: true, color: true, unit: 'kg' };
  }
  // multi-select chip group; pre-selects values already on the product (keeps any custom ones)
  function chipButtons(opts, current) {
    const cur = String(current || '').split(',').map(s => s.trim()).filter(Boolean);
    const all = [...opts];
    cur.forEach(c => { if (!all.some(o => o.toLowerCase() === c.toLowerCase())) all.push(c); });
    return all.map(o => `<button type="button" class="chip${cur.some(c => c.toLowerCase() === o.toLowerCase()) ? ' on' : ''}" data-v="${esc(o)}">${esc(o)}</button>`).join('');
  }
  function chipGroup(id, opts, current) { return `<div class="chipset" id="${id}">${chipButtons(opts, current)}</div>`; }
  const chipValue = (box, id) => [...$('#' + id, box).querySelectorAll('.chip.on')].map(c => c.dataset.v).join(', ');

  async function api(path, opts = {}) {
    const res = await fetch(path, { headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined, ...opts });
    // A 401 from the login endpoint itself means "wrong password", not "your session
    // expired" — let it fall through so the real server message (e.g. "Incorrect
    // password") reaches the user instead of being replaced.
    if (res.status === 401 && path !== '/api/auth/login') { showLogin(); throw new Error('Session expired'); }
    let data = {}; try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200); }

  // ---- Auth ----
  async function checkAuth() { const me = await api('/api/auth/me'); if (me.authenticated) { ME = me; showApp(); } else showLogin(); }
  function showLogin() { $('#loginView').classList.remove('hidden'); $('#appView').classList.add('hidden'); }
  async function showApp() {
    $('#loginView').classList.add('hidden'); $('#appView').classList.remove('hidden');
    $('#whoami').textContent = `${ME.username || 'admin'}${ME.role ? ' · ' + ME.role : ''}`;
    $$('.admin-only').forEach(el => el.style.display = ME.role === 'admin' ? '' : 'none');
    try { SETTINGS = await api('/api/settings'); } catch {}
    await ensureSuppliers();
    route('dashboard');
  }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const msg = $('#loginMsg'); msg.textContent = '';
    try { const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); ME = r; showApp(); }
    catch (err) { msg.textContent = err.message; }
  });
  $('#logoutBtn').addEventListener('click', async (e) => { e.preventDefault(); await api('/api/auth/logout', { method: 'POST' }); showLogin(); });

  // ---- Router ----
  $$('.nav-item').forEach(n => n.addEventListener('click', () => route(n.dataset.view)));
  const VIEWS = { dashboard: viewDashboard, orders: viewOrders, products: viewProducts, inventory: viewInventory,
    customers: viewCustomers, suppliers: viewSuppliers, coupons: viewCoupons, shipping: viewShipping, payments: viewPayments,
    netparts: viewNetParts, categories: viewCategories, hero: viewHero, contact: viewContact, seo: viewSeo,
    staff: viewStaff, audit: viewAudit, account: viewAccount,
    partners: viewPartners, partnerproducts: viewPartnerProducts, enquiries: viewEnquiries };
  function route(view) { $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view)); (VIEWS[view] || viewDashboard)(); }
  const head = (t, sub, action = '') => `<div class="page-head"><div><h2>${t}</h2>${sub ? `<p>${sub}</p>` : ''}</div><div>${action}</div></div>`;
  const stBadge = (s) => `<span class="st st-${esc(s)}">${esc(String(s).replace('_',' '))}</span>`;

  // ===================== DASHBOARD =====================
  async function viewDashboard() {
    main.innerHTML = head('Dashboard', 'Sales, inventory and orders at a glance');
    const r = await api('/api/reports');
    main.insertAdjacentHTML('beforeend', `
      <div class="stat-row">
        <div class="stat"><div class="n">${money(r.total_sales)}</div><div class="l">Total Sales (paid)</div></div>
        <div class="stat"><div class="n">${r.order_count}</div><div class="l">Orders</div></div>
        <div class="stat"><div class="n">${r.pending_orders}</div><div class="l">Pending Orders</div></div>
        <div class="stat"><div class="n">${r.customers}</div><div class="l">Customers</div></div>
      </div>
      <div class="chart-card"><h3>Revenue (last 6 months)</h3><div class="chart-wrap"><canvas id="revChart"></canvas></div></div>
      <div class="two-col">
        <div class="card"><h3 style="color:var(--navy);margin-bottom:.6rem">Best Selling Products</h3>
          ${r.best_sellers.length ? r.best_sellers.map(b => `<div class="row-line"><span>${esc(b.name)}</span><strong>${b.qty} sold</strong></div>`).join('') : '<p style="color:var(--grey)">No sales yet.</p>'}</div>
        <div class="card"><h3 style="color:var(--navy);margin-bottom:.6rem">Low / Out of Stock</h3>
          ${r.low_stock.length ? r.low_stock.map(l => `<div class="row-line"><span>${esc(l.name)}</span>${stBadge(l.status)}</div>`).join('') : '<p style="color:var(--grey)">All products well stocked.</p>'}</div>
      </div>`);
    const ctx = $('#revChart');
    if (window.Chart && ctx) new Chart(ctx, {
      type: 'bar',
      data: { labels: r.monthly.map(m => m.month), datasets: [{ label: 'Revenue', data: r.monthly.map(m => m.total), backgroundColor: '#0071c5', borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });
  }

  // ===================== ORDERS =====================
  let ORDERS = [];
  async function viewOrders() {
    main.innerHTML = head('Orders', 'View, search, filter and update orders.', `<a class="btn btn--ghost" href="/api/export/orders.csv">Export CSV</a>`);
    ORDERS = await api('/api/orders');
    main.insertAdjacentHTML('beforeend', `
      <div class="filters">
        <input type="search" id="oSearch" placeholder="Search order #, name, email, company">
        <select id="oStatus"><option value="">All statuses</option>${['pending','confirmed','processing','packed','shipped','delivered','cancelled','refunded'].map(s=>`<option>${s}</option>`).join('')}</select>
        <select id="oPay"><option value="">All payments</option>${['pending','awaiting_payment','paid','failed','refunded'].map(s=>`<option>${s}</option>`).join('')}</select>
      </div>
      <div class="wrap-scroll"><table class="table"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th class="num">Total</th><th>Status</th><th>Payment</th></tr></thead><tbody id="oBody"></tbody></table></div>`);
    const draw = () => {
      const q = $('#oSearch').value.toLowerCase(), st = $('#oStatus').value, pay = $('#oPay').value;
      const rows = ORDERS.filter(o =>
        (!st || o.status === st) && (!pay || o.payment_status === pay) &&
        (!q || [o.order_number, o.customer.full_name, o.customer.email, o.customer.company].join(' ').toLowerCase().includes(q)));
      $('#oBody').innerHTML = rows.length ? rows.map(o => `
        <tr class="clickable" data-id="${o.id}">
          <td><strong>${esc(o.order_number)}</strong>${o.has_backorder?`<div class="hint-inline" style="color:#B45309;font-weight:700" title="${esc(o.backorder_note||'')}">⚠ short stock</div>`:''}</td>
          <td>${esc(o.customer.full_name)}<div class="hint-inline">${esc(o.customer.company||o.customer.email)}</div></td>
          <td>${date(o.created_at)}</td><td class="num">${money(o.total)}</td>
          <td>${stBadge(o.status)}</td><td>${stBadge(o.payment_status)}</td>
        </tr>`).join('') : '<tr><td colspan="6" style="color:var(--grey)">No orders match.</td></tr>';
      $$('#oBody tr.clickable').forEach(tr => tr.addEventListener('click', () => openOrder(Number(tr.dataset.id))));
    };
    ['input','change'].forEach(ev => { $('#oSearch').addEventListener(ev, draw); $('#oStatus').addEventListener(ev, draw); $('#oPay').addEventListener(ev, draw); });
    draw();
  }

  async function openOrder(id) {
    const o = await api('/api/orders/' + id);
    const c = o.customer;
    const statuses = ['pending','confirmed','processing','packed','shipped','delivered','cancelled','refunded'];
    const pstatuses = ['pending','awaiting_payment','paid','failed','refunded'];
    modal(`
      <h3>Order ${esc(o.order_number)}</h3>
      <div class="order-grid">
        <div class="card"><h4 style="color:var(--navy);margin-bottom:.5rem">Customer</h4>
          <div class="kv"><b>${esc(c.full_name)}</b> ${c.company?'· '+esc(c.company):''}</div>
          <div class="kv">${esc(c.email)}</div>
          <div class="kv">${esc(c.phone||'')} ${c.whatsapp?'· WA '+esc(c.whatsapp):''}</div>
          <div class="kv">${esc(c.country||'')}</div>
          <div class="kv">${esc(c.address||'')} ${c.postal_code?'· '+esc(c.postal_code):''}</div>
        </div>
        <div class="card"><h4 style="color:var(--navy);margin-bottom:.5rem">Order</h4>
          <div class="kv">Placed: ${date(o.created_at)}</div>
          <div class="kv">Shipping: ${esc(o.shipping_method||'TBD')} ${o.shipping_charge?'· '+money(o.shipping_charge):''}</div>
          <div class="kv">Payment method: ${esc(o.payment_method||'—')}</div>
          <div class="kv">Coupon: ${esc(o.coupon_code||'—')}</div>
          <div class="kv">Status: ${stBadge(o.status)} · Payment: ${stBadge(o.payment_status)}</div>
        </div>
      </div>
      <div class="wrap-scroll"><table class="table"><thead><tr><th>Item</th><th>Specs</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th></tr></thead><tbody>
        ${o.items.map(it => `<tr><td>${esc(it.name)}<div class="hint-inline">${esc(it.sku||'')}</div></td>
          <td class="hint-inline">${[it.size&&'Size: '+it.size,it.mesh_size&&'Mesh: '+it.mesh_size,it.material&&it.material,it.color&&it.color,it.custom_specs,it.special_instructions].filter(Boolean).map(esc).join('<br>')}</td>
          <td class="num">${it.quantity} ${esc(it.unit||'')}</td><td class="num">${it.unit_price?money(it.unit_price):'—'}</td><td class="num">${it.line_total?money(it.line_total):'—'}</td></tr>`).join('')}
      </tbody></table></div>
      <div style="text-align:right;margin:.6rem 0">
        <div class="kv">Subtotal: ${money(o.subtotal)}</div>
        ${o.discount?`<div class="kv">Discount: −${money(o.discount)}</div>`:''}
        ${o.tax?`<div class="kv">Tax: ${money(o.tax)}</div>`:''}
        ${o.shipping_charge?`<div class="kv">Shipping: ${money(o.shipping_charge)}</div>`:''}
        <div class="kv total-line">Total: ${money(o.total)}</div>
      </div>

      <div class="two-col">
        <div class="card">
          <h4 style="color:var(--navy);margin-bottom:.5rem">Update</h4>
          <div class="field"><label>Order status</label><select id="oNewStatus">${statuses.map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label>Payment status</label><select id="oNewPay">${pstatuses.map(s=>`<option ${s===o.payment_status?'selected':''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label>Adjust total (after review)</label><input id="oNewTotal" type="number" value="${o.total}"></div>
          <div class="field"><label>Admin notes</label><textarea id="oNotes">${esc(o.admin_notes||'')}</textarea></div>
          <div style="display:flex;gap:.5rem;margin-top:.6rem;flex-wrap:wrap">
            <button class="btn" id="oSave">Save</button>
            <button class="btn btn--ghost" id="oReqPay">Send Payment Request</button>
          </div>
        </div>
        <div class="card"><h4 style="color:var(--navy);margin-bottom:.5rem">History</h4>
          <ul class="timeline">${o.history.map(h=>`<li><strong>${esc(h.status)}</strong> · ${date(h.ts)}<div class="hint-inline">${esc(h.note||'')}</div></li>`).join('')}</ul>
        </div>
      </div>
      <div class="modal__actions"><a class="btn btn--ghost" href="/invoice/${o.id}" target="_blank">Proforma Invoice</a><button class="btn btn--ghost" id="oClose">Close</button></div>
    `, (box) => {
      $('#oClose', box).addEventListener('click', closeModal);
      $('#oSave', box).addEventListener('click', async () => {
        const status = $('#oNewStatus', box).value;
        if (status !== o.status) await api(`/api/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status, note: 'Updated by ' + (ME.username||'admin') }) });
        await api('/api/orders/' + id, { method: 'PUT', body: JSON.stringify({ payment_status: $('#oNewPay', box).value, total: Number($('#oNewTotal', box).value), admin_notes: $('#oNotes', box).value }) });
        toast('Order updated'); closeModal(); viewOrders();
      });
      $('#oReqPay', box).addEventListener('click', async () => { await api(`/api/orders/${id}/request-payment`, { method: 'POST' }); toast('Payment request sent'); closeModal(); viewOrders(); });
    });
  }

  // ===================== PRODUCTS =====================
  let CATS = [], HOTSPOTS_A = [];
  // inventory search/sort state — survives a save so your filters aren't lost
  const INV_UI = { q: '', cat: '', status: '', sortKey: 'name', sortDir: 1 };
  async function viewProducts() {
    main.innerHTML = head('Products', 'Drag to reorder. Manage details, pricing and stock.', `<a class="btn btn--ghost" href="/api/export/products.csv" style="margin-right:.4rem">Export CSV</a><button class="btn" id="addProd">+ Add Product</button>`);
    $('#addProd').addEventListener('click', () => openProduct());
    CATS = await api('/api/categories');
    try { HOTSPOTS_A = await api('/api/hotspots'); } catch { HOTSPOTS_A = []; }
    const products = await api('/api/products');
    const list = document.createElement('div'); list.id = 'prodList'; main.appendChild(list);
    renderProdList(products);
  }
  function renderProdList(products) {
    const list = $('#prodList');
    if (!products.length) { list.innerHTML = '<div class="card">No products yet.</div>'; return; }
    list.innerHTML = products.map(p => {
      const thumb = p.images && p.images[0] ? `<img class="prod-thumb" src="${esc(p.images[0])}">` : `<div class="prod-thumb">No img</div>`;
      const badge = { in_stock:['on','In Stock'], low_stock:['','Low'], out_of_stock:['off','Out'] }[p.stock_status];
      return `<div class="prod-row" draggable="true" data-id="${p.id}">
        <span class="drag">⋮⋮</span>${thumb}
        <div class="info"><h4>${esc(p.name)}</h4><div class="cat">${esc(p.category_name||'Uncategorised')} · ${esc(p.sku||'no SKU')} · ${p.effective_price>0?money(p.effective_price):'no price'}</div></div>
        <span class="pill ${badge[0]}">${p.available_stock} ${badge[1]}</span>
        <span class="pill ${p.published?'on':'off'}">${p.published?'Published':'Hidden'}</span>
        <div class="actions"><button class="btn btn--ghost btn--sm" data-edit="${p.id}">Edit</button><button class="btn btn--danger btn--sm" data-del="${p.id}">Delete</button></div>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openProduct(products.find(p => p.id == b.dataset.edit))));
    list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Delete this product?')) return; await api('/api/products/' + b.dataset.del, { method: 'DELETE' }); toast('Deleted'); viewProducts(); }));
    enableDrag(list);
  }
  function enableDrag(list) {
    let dragEl = null;
    list.querySelectorAll('.prod-row').forEach(row => {
      row.addEventListener('dragstart', () => { dragEl = row; row.classList.add('dragging'); });
      row.addEventListener('dragend', async () => { row.classList.remove('dragging'); dragEl = null;
        await api('/api/products/reorder', { method: 'POST', body: JSON.stringify({ order: [...list.querySelectorAll('.prod-row')].map(r => Number(r.dataset.id)) }) }); toast('Order saved'); });
    });
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      const after = [...list.querySelectorAll('.prod-row:not(.dragging)')].reduce((c, ch) => { const b = ch.getBoundingClientRect(); const o = e.clientY - b.top - b.height/2; return (o < 0 && o > c.offset) ? { offset:o, el:ch } : c; }, { offset:-Infinity }).el;
      if (!dragEl) return; if (after) list.insertBefore(dragEl, after); else list.appendChild(dragEl);
    });
  }
  async function ensureSuppliers() {
    if (SUPPLIERS.length) return;
    try { SUPPLIERS = await api('/api/suppliers'); } catch {}
  }
  function openProduct(prod, after) {
    const refresh = after || viewProducts;
    const editing = !!prod; let images = editing ? [...(prod.images||[])] : [];
    const sp = (prod && prod.specs) || {};
    const cfg = specConfig(editing ? prod.category_id : '');
    const catOpts = CATS.map(c => `<option value="${c.id}" ${editing && prod.category_id==c.id?'selected':''}>${esc(c.name)}</option>`).join('');
    modal(`
      <h3>${editing?'Edit':'Add'} Product</h3>
      <div class="tabs"><span class="tab active" data-tab="t1">Details</span><span class="tab" data-tab="t2">Pricing</span><span class="tab" data-tab="t3">Inventory</span><span class="tab" data-tab="t4">Images</span></div>
      <div data-pane="t1">
        <div class="field"><label>Name</label><input id="mName" value="${editing?esc(prod.name):''}"></div>
        <div class="grid2">
          <div class="field"><label>Category</label><select id="mCat"><option value="">Uncategorised</option>${catOpts}</select></div>
          <div class="field"><label>Brand</label><input id="mBrand" value="${editing?esc(prod.brand):''}"></div>
        </div>
        <div class="grid2">
          <div class="field"><label>SKU</label><input id="mSku" value="${editing?esc(prod.sku):''}"></div>
          <div class="field"><label>Barcode</label><input id="mBarcode" value="${editing?esc(prod.barcode):''}"></div>
        </div>
        <div class="field"><label>Description</label><textarea id="mDesc">${editing?esc(prod.description):''}</textarea></div>
        <div class="field"><label>Explore-diagram part No. <span class="chip-hint">(links this product to a hotspot — customer clicks the number to open it)</span></label>
          <select id="mNetPart"><option value="">— none —</option>${HOTSPOTS_A.map(h => `<option value="${h.id}" ${editing && h.product_id == prod.id ? 'selected' : ''}>${h.number}. ${esc(h.name)}</option>`).join('')}</select></div>
        <div class="field" id="sizeWrap"><label>${cfg.label} <span class="chip-hint" id="sizeHint">${cfg.hint}</span></label>${chipGroup('mSize', cfg.sizes, sp.size)}</div>
        <div class="field" id="meshWrap"${cfg.mesh?'':' style="display:none"'}><label>Mesh Size <span class="chip-hint">(select one or more)</span></label>${chipGroup('mMesh', SPEC_MESH, sp.mesh_size)}</div>
        <div class="field" id="mdWrap"${cfg.md?'':' style="display:none"'}><label>MD (mesh depth) <span class="chip-hint">(meshes deep — select one or more)</span></label>${chipGroup('mMd', SPEC_MD, sp.md_size)}</div>
        <div class="grid2">
          <div class="field" id="colorWrap"${cfg.color?'':' style="display:none"'}><label>Colour(s) <span class="chip-hint">(select one or more)</span></label>${chipGroup('mColor', cfg.colors, sp.color)}</div>
          <div class="field" id="matWrap"${cfg.mat?'':' style="display:none"'}><label>Material <span class="chip-hint">(select one or more)</span></label>${chipGroup('mMat', SPEC_MATERIALS, sp.material)}</div>
        </div>
        <div class="grid2">
          <div class="field"><label>Default unit</label><select id="mUnit">${(()=>{const base=['kg','pcs','Meter','Roll','Net'];const cu=editing?prod.default_unit:cfg.unit;if(cu&&!base.includes(cu))base.unshift(cu);return base.map(u=>`<option ${cu===u?'selected':''}>${esc(u)}</option>`).join('');})()}</select></div>
          <div class="field"><label>Published</label><select id="mPub"><option value="1" ${!editing||prod.published?'selected':''}>Published</option><option value="0" ${editing&&!prod.published?'selected':''}>Hidden</option></select></div>
        </div>
      </div>
      <div data-pane="t2" hidden>
        <div class="grid2">
          <div class="field"><label>Selling price</label><input id="mPrice" type="number" value="${editing?prod.price:0}"></div>
          <div class="field"><label>Wholesale price</label><input id="mWhole" type="number" value="${editing?prod.wholesale_price:0}"></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Discount price (0 = none)</label><input id="mDisc" type="number" value="${editing?prod.discount_price:0}"></div>
          <div class="field"><label>Tax rate %</label><input id="mTax" type="number" value="${editing?prod.tax_rate:0}"></div>
        </div>
        <div class="field"><label>Minimum order (MOQ) <span class="chip-hint">(smallest quantity a customer may order)</span></label><input id="mMoq" type="number" value="${editing?(prod.min_order||0):0}"></div>
        <div class="field"><label>Currency</label><input id="mCur" value="${editing?esc(prod.currency):cur()}"></div>
      </div>
      <div data-pane="t3" hidden>
        <div class="grid2">
          <div class="field"><label>Available stock (in default unit)</label><input id="mStock" type="number" value="${editing?prod.stock_quantity:0}"></div>
          <div class="field"><label>Low stock alert at <span class="chip-hint">(reorder point)</span></label><input id="mLow" type="number" value="${editing?prod.low_stock_threshold:0}"></div>
        </div>
        <div class="field"><label>Warehouse location</label><input id="mWh" value="${editing?esc(prod.warehouse_location):''}"></div>
        <div class="grid2">
          <div class="field"><label>Supplier record</label><select id="mSupId"><option value="0">— none / type below —</option>${SUPPLIERS.map(s=>`<option value="${s.id}" ${editing&&Number(prod.supplier_id)===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select><span class="hint-inline">Linking pulls in their contact details and tracks spend.</span></div>
          <div class="field"><label>Supplier (free text)</label><input id="mSup" value="${editing?esc(prod.supplier||''):''}" placeholder="who you buy this from"></div>
          <div class="field"><label>Supplier contact</label><input id="mSupC" value="${editing?esc(prod.supplier_contact||''):''}" placeholder="phone / email"></div>
        </div>
        <div class="field"><label>Lead time <span class="chip-hint">(how long delivery takes)</span></label><input id="mLead" value="${editing?esc(prod.lead_time||''):''}" placeholder="e.g. 2 weeks"></div>
        ${editing?`<p class="hint-inline">Reserved: ${prod.reserved_stock} · Available: ${prod.available_stock}</p>`:''}
        <hr style="border:none;border-top:1px solid var(--line);margin:.9rem 0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem">
          <div><b style="color:var(--navy)">Variants</b> <span class="hint-inline">(same product, different type — each has its own stock &amp; price)</span></div>
          <div style="display:flex;gap:.4rem"><button type="button" class="btn btn--sm" id="mVarGen">⚡ Generate from selected options</button><button type="button" class="btn btn--ghost btn--sm" id="mVarAdd">+ Add</button></div>
        </div>
        <p class="hint-inline" id="mVarNote" hidden style="margin-bottom:.4rem;padding:.4rem .6rem;background:#eef5fd;border-radius:8px"></p>
        <p class="hint-inline" style="margin-bottom:.5rem">Tick the Size / Mesh / MD / Colour options above, then click <b>Generate</b> — every combination is created here for you to fill in stock &amp; price. Untick <b>Show</b> to hide a variant from the shop. Leave the table empty to use the single stock/price above.</p>
        <div class="wrap-scroll"><table class="table"><thead><tr>
          <th>Size</th><th>Mesh</th><th>MD</th><th>Colour</th><th class="num">Cost ₹</th><th class="num">Price ₹</th><th class="num">Stock</th><th class="num">Low at</th><th>Show</th><th></th>
        </tr></thead><tbody id="mVarRows"></tbody></table></div>
      </div>
      <div data-pane="t4" hidden>
        <div class="drop" id="drop">Click or drop images to upload (multiple)</div>
        <input type="file" id="fileInp" accept="image/*" multiple class="hidden">
        <div class="img-grid" id="imgGrid"></div>
      </div>
      <p class="msg" id="mMsg"></p>
      <div class="modal__actions"><button class="btn btn--ghost" id="mCancel">Cancel</button><button class="btn" id="mSave">Save</button></div>
    `, (box) => {
      // chip toggle via delegation (works for dynamically-swapped size chips)
      box.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) c.classList.toggle('on'); });
      // category-aware sizes: ropes use mm diameters and hide mesh size
      $('#mCat', box).addEventListener('change', () => {
        const c = specConfig($('#mCat', box).value);
        $('#mSize', box).innerHTML = chipButtons(c.sizes, '');
        $('#mColor', box).innerHTML = chipButtons(c.colors, '');
        $('#meshWrap', box).style.display = c.mesh ? '' : 'none';
        $('#mdWrap', box).style.display = c.md ? '' : 'none';
        $('#colorWrap', box).style.display = c.color ? '' : 'none';
        $('#matWrap', box).style.display = c.mat ? '' : 'none';
        $('#sizeHint', box).textContent = c.hint;
        $('#sizeWrap', box).querySelector('label').firstChild.textContent = c.label + ' ';
        const us = $('#mUnit', box); if (us) us.value = c.unit;
      });
      $$('.tab', box).forEach(t => t.addEventListener('click', () => {
        $$('.tab', box).forEach(x => x.classList.remove('active')); t.classList.add('active');
        $$('[data-pane]', box).forEach(p => p.hidden = p.dataset.pane !== t.dataset.tab);
      }));
      // ---- variants (same product, different type) ----
      const vIn = 'width:100%;padding:.35rem .45rem;border:1px solid var(--line);border-radius:7px;font-size:.85rem;font-family:inherit';
      const varRow = (v) => `<tr data-vid="${esc(v.id||'')}">
        <td><input class="v-size" value="${esc(v.size||'')}" placeholder="3 ply" style="${vIn}"></td>
        <td><input class="v-mesh" value="${esc(v.mesh_size||'')}" placeholder="38mm" style="${vIn}"></td>
        <td><input class="v-md" value="${esc(v.md_size||'')}" placeholder="600 MD" style="${vIn}"></td>
        <td><span style="display:flex;align-items:center;gap:.35rem"><span class="v-dot v-dot-live" style="background:${colorCss(v.color)}"></span><input class="v-color" value="${esc(v.color||'')}" placeholder="Blue" style="${vIn}"></span></td>
        <td class="num"><input class="v-cost" type="number" step="0.01" value="${v.cost_price||0}" style="${vIn};text-align:right"></td>
        <td class="num"><input class="v-price" type="number" step="0.01" value="${v.price||0}" style="${vIn};text-align:right"></td>
        <td class="num"><input class="v-stock" type="number" value="${v.stock_quantity||0}" style="${vIn};text-align:right"></td>
        <td class="num"><input class="v-low" type="number" value="${v.low_stock_threshold||0}" style="${vIn};text-align:right"></td>
        <td style="text-align:center"><input class="v-active" type="checkbox" ${v.active===0?'':'checked'} title="Show in shop"></td>
        <td><button type="button" class="btn btn--danger btn--sm" data-vdel>×</button></td></tr>`;
      const vBody = $('#mVarRows', box);
      const bindVDel = () => {
        vBody.querySelectorAll('[data-vdel]').forEach(b => b.onclick = () => { b.closest('tr').remove(); });
        // live colour swatch as you type the colour name
        vBody.querySelectorAll('.v-color').forEach(inp => inp.oninput = () => {
          const dot = inp.closest('td').querySelector('.v-dot-live');
          if (dot) dot.style.background = colorCss(inp.value);
        });
      };
      vBody.innerHTML = ((editing && prod.variants) || []).map(varRow).join('');
      bindVDel();
      $('#mVarAdd', box).addEventListener('click', () => {
        vBody.insertAdjacentHTML('beforeend', varRow({}));
        bindVDel(); syncVariantMode();
      });
      // build every combination from the ticked Size / Mesh / MD / Colour chips
      $('#mVarGen', box).addEventListener('click', () => {
        const pick = (id) => { const s = chipValue(box, id); return s ? s.split(',').map(x => x.trim()).filter(Boolean) : ['']; };
        const sizes = pick('mSize'), meshes = pick('mMesh'), mds = pick('mMd'), colors = pick('mColor');
        const total = sizes.length * meshes.length * mds.length * colors.length;
        if (total > 200) { toast(`That would create ${total} variants — please select fewer options.`); return; }
        const key = (a, b, c, d) => [a, b, c, d].map(x => String(x || '').toLowerCase()).join('|');
        const existing = new Set([...vBody.querySelectorAll('tr')].map(tr =>
          key($('.v-size', tr).value, $('.v-mesh', tr).value, $('.v-md', tr).value, $('.v-color', tr).value)));
        let added = 0, html = '';
        sizes.forEach(s => meshes.forEach(m => mds.forEach(d => colors.forEach(c => {
          if (existing.has(key(s, m, d, c))) return;
          existing.add(key(s, m, d, c));
          html += varRow({ size: s, mesh_size: m, md_size: d, color: c,
            cost_price: $('#mPrice', box) ? 0 : 0, price: Number($('#mPrice', box).value) || 0,
            stock_quantity: 0, low_stock_threshold: Number($('#mLow', box).value) || 0 });
          added++;
        }))));
        if (!added) { toast('All combinations already added.'); return; }
        vBody.insertAdjacentHTML('beforeend', html); bindVDel(); syncVariantMode();
        toast(`${added} variant${added > 1 ? 's' : ''} created — now set stock & price.`);
      });
      // when variants exist, the product-level stock/price fields are ignored — make that obvious
      const syncVariantMode = () => {
        const has = vBody.querySelectorAll('tr').length > 0;
        ['#mStock', '#mPrice', '#mDisc'].forEach(sel => {
          const el = $(sel, box); if (!el) return;
          el.disabled = has; el.style.opacity = has ? '.5' : '';
          el.title = has ? 'Managed by variants below' : '';
        });
        const note = $('#mVarNote', box);
        if (note) {
          const zero = [...vBody.querySelectorAll('.v-price')].filter(i => !(Number(i.value) > 0)).length;
          note.hidden = !has;
          note.innerHTML = has
            ? `ℹ️ Stock &amp; price are managed per variant below — the product-level fields are disabled.${zero ? ` <b style="color:#b26a00">${zero} variant(s) have no price and will show “Price on Request”.</b>` : ''}`
            : '';
        }
      };
      vBody.addEventListener('input', syncVariantMode);
      syncVariantMode();
      const collectVariants = () => [...vBody.querySelectorAll('tr')].map(tr => ({
        id: tr.dataset.vid || '',
        size: $('.v-size', tr).value.trim(), mesh_size: $('.v-mesh', tr).value.trim(),
        md_size: $('.v-md', tr).value.trim(), color: $('.v-color', tr).value.trim(),
        cost_price: $('.v-cost', tr).value, price: $('.v-price', tr).value,
        stock_quantity: $('.v-stock', tr).value, low_stock_threshold: $('.v-low', tr).value,
        active: $('.v-active', tr).checked ? 1 : 0,
      })).filter(v => v.size || v.mesh_size || v.md_size || v.color || Number(v.price) > 0);
      const grid = $('#imgGrid', box);
      const drawImgs = () => { grid.innerHTML = images.map((u,i)=>`<div class="img-tile"><img src="${esc(u)}"><button data-i="${i}">×</button></div>`).join('');
        grid.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { images.splice(b.dataset.i,1); drawImgs(); })); };
      drawImgs();
      const fi = $('#fileInp', box), drop = $('#drop', box);
      drop.addEventListener('click', () => fi.click());
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor='var(--ocean)'; });
      drop.addEventListener('drop', e => { e.preventDefault(); drop.style.borderColor=''; up(e.dataTransfer.files); });
      fi.addEventListener('change', () => up(fi.files));
      async function up(files) { if (!files.length) return; const fd = new FormData(); [...files].forEach(f => fd.append('images', f)); drop.textContent='Uploading…';
        try { const r = await api('/api/upload', { method:'POST', body: fd }); images.push(...r.urls); drawImgs(); } catch(e){ $('#mMsg',box).className='msg err'; $('#mMsg',box).textContent=e.message; } drop.textContent='Click or drop images to upload (multiple)'; }
      $('#mCancel', box).addEventListener('click', closeModal);
      $('#mSave', box).addEventListener('click', async () => {
        const payload = {
          name: $('#mName',box).value.trim(), category_id: $('#mCat',box).value||null, brand: $('#mBrand',box).value,
          sku: $('#mSku',box).value, barcode: $('#mBarcode',box).value, description: $('#mDesc',box).value,
          specs: (()=>{const c=specConfig($('#mCat',box).value);return { size:chipValue(box,'mSize'), mesh_size: c.mesh?chipValue(box,'mMesh'):'', md_size: c.md?chipValue(box,'mMd'):'', material: c.mat?chipValue(box,'mMat'):'', color: c.color?chipValue(box,'mColor'):'' };})(),
          default_unit: $('#mUnit',box).value, published: Number($('#mPub',box).value),
          price: $('#mPrice',box).value, wholesale_price: $('#mWhole',box).value, discount_price: $('#mDisc',box).value,
          tax_rate: $('#mTax',box).value, currency: $('#mCur',box).value,
          stock_quantity: $('#mStock',box).value, low_stock_threshold: $('#mLow',box).value, min_order: $('#mMoq',box).value, warehouse_location: $('#mWh',box).value,
          supplier_id: ($('#mSupId',box)||{}).value || 0,
          supplier: $('#mSup',box).value.trim(), supplier_contact: $('#mSupC',box).value.trim(), lead_time: $('#mLead',box).value.trim(),
          images, variants: collectVariants(),
        };
        if (!payload.name) { $('#mMsg',box).className='msg err'; $('#mMsg',box).textContent='Name is required'; return; }
        try {
          let pid;
          if (editing) { await api('/api/products/'+prod.id, { method:'PUT', body: JSON.stringify(payload) }); pid = prod.id; }
          else { const r = await api('/api/products', { method:'POST', body: JSON.stringify(payload) }); pid = r.id; }
          // link to Explore-diagram hotspot: this product ↔ one part number
          const netPart = $('#mNetPart', box) ? $('#mNetPart', box).value : '';
          await Promise.all(HOTSPOTS_A.filter(h => h.product_id == pid).map(h => api('/api/hotspots/'+h.id, { method:'PUT', body: JSON.stringify({ product_id: null }) })));
          if (netPart) await api('/api/hotspots/'+netPart, { method:'PUT', body: JSON.stringify({ product_id: pid }) });
          closeModal(); toast('Saved'); refresh();
        } catch(e){ $('#mMsg',box).className='msg err'; $('#mMsg',box).textContent=e.message; }
      });
    }, 'modal__box--full');
  }

  // ===================== INVENTORY =====================
  async function viewInventory() {
    main.innerHTML = head('Inventory', '', `<a class="btn btn--ghost btn--sm" href="/stock-count" target="_blank" style="margin-right:.3rem">🖨 Count sheet</a><a class="btn btn--ghost btn--sm" href="/api/export/inventory.csv" style="margin-right:.3rem">⭳ CSV</a><button class="btn btn--ghost btn--sm" id="invDead" style="margin-right:.3rem">💤 Dead stock</button><button class="btn" id="invAddProd">+ Add Product</button>`);
    $('#invAddProd').addEventListener('click', () => openProduct(null, viewInventory));
    $('#invDead').addEventListener('click', () => viewDeadStock());
    const products = await api('/api/products');
    if (!CATS.length) { try { CATS = await api('/api/categories'); } catch {} }
    try { HOTSPOTS_A = await api('/api/hotspots'); } catch {}
    let reorder = []; try { reorder = await api('/api/reorder'); } catch {}
    if (reorder.length) {
      $('#invDead').insertAdjacentHTML('beforebegin',
        `<button class="btn btn--ghost btn--sm" id="invReorder" style="margin-right:.3rem;border-color:#b26a00;color:#b26a00">⚠ Reorder (${reorder.length})</button>`);
      $('#invReorder').addEventListener('click', () => modal(
        `<h3>⚠ Reorder needed <span style="font-weight:400;color:var(--grey)">— ${reorder.length} item(s) at or below reorder point</span></h3>
         <div class="wrap-scroll" style="max-height:55vh"><table class="table"><thead><tr><th>Item</th><th>Supplier</th><th class="num">Available</th><th class="num">Reorder at</th><th class="num">Suggested order</th></tr></thead><tbody>
         ${reorder.map(r => `<tr><td>${esc(r.name)}${r.label?`<div class="hint-inline">↳ ${esc(r.label)}</div>`:''}</td>
           <td class="hint-inline">${esc((products.find(p=>p.id===r.product_id)||{}).supplier||'—')}</td>
           <td class="num" style="color:${r.available<=0?'#c62828':'#b26a00'};font-weight:700">${r.available}</td>
           <td class="num">${r.reorder_point}</td><td class="num"><b>${r.suggested} ${esc(r.unit||'')}</b></td></tr>`).join('')}
         </tbody></table></div>
         <div class="modal__actions"><button class="btn" id="roClose">Close</button></div>`,
        (box) => { $('#roClose', box).addEventListener('click', closeModal); }));
    }
    // last stock activity per item (for the "Last activity" column)
    const lastAct = {};
    try {
      (await api('/api/movements?limit=1500')).forEach(m => {
        const k = m.product_id + '|' + (m.variant_id || '');
        if (!lastAct[k]) lastAct[k] = m.ts;            // movements are newest-first
      });
    } catch {}
    /* Last purchase per item — gives us "old stock → restocked" on each row,
       plus how much money has actually gone out on purchases. */
    const lastBuy = {};
    let spendAll = 0, spend30 = 0, buyCount = 0;
    try {
      const cut = Date.now() - 30 * 864e5;
      (await api('/api/purchases')).forEach(r => {
        const k = r.product_id + '|' + (r.variant_id || '');
        const cur = lastBuy[k];
        if (!cur || String(r.date) > String(cur.date) || (r.date === cur.date && r.id > cur.id)) lastBuy[k] = r;
        spendAll += Number(r.total) || 0;
        buyCount++;
        if (new Date(r.date).getTime() >= cut) spend30 += Number(r.total) || 0;
      });
    } catch {}
    // "was 400 · +550 on 20 Jul" under the stock figure
    const wasNote = (pid, vid) => {
      const r = lastBuy[pid + '|' + (vid || '')];
      if (!r) return '';
      const d = new Date(r.date);
      const when = isNaN(d) ? esc(r.date) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      // purchases recorded before this feature have no prev_stock — don't invent "was 0"
      const was = r.prev_stock == null ? '' : `was ${Number(r.prev_stock)} · `;
      return `<div class="inv-was" title="Stock before the last purchase → quantity received">${was}<b>+${r.quantity}</b> <span>${when}</span></div>`;
    };

    // ---- search / filter / sort state ----
    let sortKey = INV_UI.sortKey, sortDir = INV_UI.sortDir;
    // columns were merged — drop any sort key that no longer has a heading
    if (!['name', 'price', 'stock', 'value', 'marginpc', 'profit'].includes(sortKey)) { sortKey = 'name'; sortDir = 1; }
    const metrics = (p) => {
      const vs = (p.variants || []).filter(v => v.active !== 0);
      const low = vs.length ? vs.reduce((s, v) => s + (v.low_stock_threshold || 0), 0) : (p.low_stock_threshold || 0);
      if (vs.length) {
        const stock = vs.reduce((s, v) => s + (v.stock_quantity || 0), 0);
        const value = vs.reduce((s, v) => s + ((v.cost_price || 0) * (v.stock_quantity || 0)), 0);
        const profit = vs.reduce((s, v) => s + (((v.price || 0) - (v.cost_price || 0)) * (v.stock_quantity || 0)), 0);
        const prices = vs.filter(v => v.price > 0).map(v => v.price);
        const price = prices.length ? Math.min(...prices) : 0;
        const cost = stock > 0 ? value / stock : 0;
        return { stock, value, profit, price, cost, low, margin: price - cost, marginpc: price > 0 ? (price - cost) / price * 100 : 0 };
      }
      const stock = p.stock_quantity || 0, cost = p.cost_price || 0, price = p.price || 0;
      return { stock, value: cost * stock, profit: (price - cost) * stock, price, cost, low,
        margin: price - cost, marginpc: price > 0 ? (price - cost) / price * 100 : 0 };
    };
    const matches = (p) => {
      const q = ($('#invSearch') ? $('#invSearch').value : '').trim().toLowerCase();
      const cat = $('#invCat') ? $('#invCat').value : '';
      const st = $('#invStatus') ? $('#invStatus').value : '';
      if (cat && (p.category_name || '') !== cat) return false;
      if (st && p.stock_status !== st) return false;
      if (q) {
        const hay = [p.name, p.sku, p.category_name, ...(p.variants || []).map(v => v.label)]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };
    const sorted = (list) => list.slice().sort((a, b) => {
      if (sortKey === 'name') return sortDir * String(a.name).localeCompare(String(b.name));
      const ma = metrics(a), mb = metrics(b);
      return sortDir * ((ma[sortKey] || 0) - (mb[sortKey] || 0));
    });

    main.insertAdjacentHTML('beforeend', `<div class="inv-toolbar">
      <input id="invSearch" placeholder="🔍 Search product, SKU or variant…" value="${esc(INV_UI.q)}">
      <select id="invCat"><option value="">All categories</option>${CATS.map(c => `<option ${INV_UI.cat===c.name?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
      <select id="invStatus"><option value="">All stock</option><option value="in_stock" ${INV_UI.status==='in_stock'?'selected':''}>In stock</option><option value="low_stock" ${INV_UI.status==='low_stock'?'selected':''}>Low stock</option><option value="out_of_stock" ${INV_UI.status==='out_of_stock'?'selected':''}>Out of stock</option></select>
      <button class="btn btn--ghost btn--sm" id="invClear">Clear</button>
      <span class="hint-inline" id="invCount"></span>
    </div>`);
    main.insertAdjacentHTML('beforeend', `<div class="wrap-scroll inv-wrap"><table class="table inv-table"><thead><tr>
      <th class="th-sort" data-sort="name">Product</th>
      <th class="num th-sort" data-sort="price">Cost → Price</th>
      <th class="num th-sort" data-sort="stock">Stock</th>
      <th class="num th-sort" data-sort="value">Stock value</th>
      <th class="num th-sort" data-sort="marginpc">Margin</th>
      <th class="num th-sort" data-sort="profit">Profit</th>
      <th>Status</th><th></th></tr></thead><tbody id="invRows"></tbody>
      <tfoot>
        <tr style="border-top:2px solid var(--line)"><td colspan="3" class="ft-l">Total purchase value</td><td class="num ft-v" id="invTotPurchase"></td><td colspan="4"></td></tr>
        <tr><td colspan="3" class="ft-l">Total selling value</td><td class="num ft-v" id="invTotSell"></td><td colspan="4"></td></tr>
        <tr><td colspan="5" class="ft-l">Total stock profit</td><td class="num ft-v" id="invTotProfit"></td><td colspan="2" class="hint-inline" id="invTotMargin" style="font-weight:700"></td></tr>
      </tfoot></table></div>
      <p class="hint-inline" style="margin-top:.3rem;font-size:.7rem">▾ new/old stock · ＋ restock · ⚖ adjust · 🕘 log · ✎ edit — click a heading to sort</p>`);

    // "3d ago" style last-activity cell
    const actCell = (ts) => {
      if (!ts) return '<span style="opacity:.5">—</span>';
      const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
      if (!t) return '<span style="opacity:.5">—</span>';
      const d = Math.floor((Date.now() - t) / 864e5);
      const txt = d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? d + 'd ago' : Math.floor(d / 30) + 'mo ago';
      return `<span title="${esc(new Date(t).toLocaleString())}" style="${d > 60 ? 'color:#b26a00;font-weight:600' : ''}">${txt}</span>`;
    };
    /* One cell per idea instead of one cell per number:
       cost+price together, stock+reorder+last intake together, margin ₹+% together. */
    const cpCell = (cost, price) => `<div class="cp">
        <span class="cp-row"><i>cost</i><input type="number" step="0.01" min="0" value="${cost||0}" data-cost class="inv-num" readonly></span>
        <span class="cp-row cp-row--sell"><i>sell</i><input type="number" step="0.01" min="0" value="${price||0}" data-price class="inv-num" readonly></span>
      </div>`;
    const stockCell = (t, pid, vid) => `<div class="stk">
        <span class="stk-row"><input type="number" value="${t.stock_quantity||0}" data-stock class="inv-num stk-main" readonly></span>
        <span class="stk-row stk-row--min"><i>min</i><input type="number" value="${t.low_stock_threshold||0}" data-low class="inv-num low" readonly></span>
        ${t.reserved_stock>0?`<span class="stk-res">${t.reserved_stock} held · ${t.available_stock} free</span>`:''}
        ${wasNote(pid, vid)}
      </div>`;
    const actionBtns = (pid, vid) => {
      const v = vid ? ` data-lvid="${esc(vid)}"` : '', r = vid ? ` data-rvid="${esc(vid)}"` : '',
            a = vid ? ` data-avid="${esc(vid)}"` : '', h = vid ? ` data-hvid="${esc(vid)}"` : '',
            e = vid ? ` data-vid="${esc(vid)}"` : '';
      return `<div class="rowacts"><button class="btn btn--ghost btn--sm ibtn" title="New vs old stock" data-layers="${pid}"${v}>▾</button><button class="btn btn--sm ibtn" title="Restock (add purchase)" data-restock="${pid}"${r}>＋</button><button class="btn btn--ghost btn--sm ibtn" title="Adjust / stock count" data-adjust="${pid}"${a}>⚖</button><button class="btn btn--ghost btn--sm ibtn" title="Movement log" data-hist="${pid}"${h}>🕘</button><button class="btn btn--ghost btn--sm ibtn" title="Edit row" data-btn data-mode="edit" data-id="${pid}"${e}>✎</button></div>`;
    };
    const statusCell = (status, ts) => `<div class="stcell">${stBadge(status)}<span class="stcell-act">${actCell(ts)}</span></div>`;

    const rowsHtml = (list) => list.map(p => (p.variants && p.variants.length)
        ? `<tr class="inv-parent" data-pid="${p.id}" style="background:${catColor(p.category_name)}1a">
             <td style="border-left:4px solid ${catColor(p.category_name)}"><span class="inv-toggle" data-toggle="${p.id}">▸</span> <b>${esc(p.name)}</b> <span class="hint-inline">${p.variants.length} types</span><div class="hint-inline">${catTag(p.category_name)}</div></td>
             <td class="num" data-prange></td>
             <td class="num" data-pstock></td>
             <td class="num" data-ppvalue></td>
             <td class="num" data-pmpc></td>
             <td class="num" data-psprofit></td>
             <td>${statusCell(p.stock_status, lastAct[p.id + '|'] || Math.max(...p.variants.map(v => new Date(lastAct[p.id + '|' + v.id] || 0).getTime())) || '')}</td>
             <td><button class="btn btn--ghost btn--sm" data-editfull="${p.id}">Edit</button></td>
           </tr>` + p.variants.map(v => `<tr class="inv-child" data-parent="${p.id}" data-id="${p.id}" data-vid="${esc(v.id)}" hidden>
            <td class="vname">↳ ${variantCell(v)}</td>
            <td class="num">${cpCell(v.cost_price, v.price)}</td>
            <td class="num">${stockCell(v, p.id, v.id)}</td>
            <td class="num" data-pvalue></td>
            <td class="num"><span data-uprofit></span><span class="mpc" data-mpc></span></td>
            <td class="num" data-sprofit></td>
            <td>${statusCell(v.stock_status, lastAct[p.id + '|' + v.id])}</td>
            <td>${actionBtns(p.id, v.id)}</td>
          </tr>`).join('')
        : `<tr data-id="${p.id}" style="background:${catColor(p.category_name)}12">
        <td style="border-left:4px solid ${catColor(p.category_name)}">${esc(p.name)}<div class="hint-inline">${catTag(p.category_name)}${p.sku?' '+esc(p.sku):''}</div></td>
        <td class="num">${cpCell(p.cost_price, p.price)}</td>
        <td class="num">${stockCell(p, p.id, '')}</td>
        <td class="num" data-pvalue></td>
        <td class="num"><span data-uprofit></span><span class="mpc" data-mpc></span></td>
        <td class="num" data-sprofit></td>
        <td>${statusCell(p.stock_status, lastAct[p.id + '|'])}</td>
        <td>${actionBtns(p.id, '')}</td>
      </tr>`).join('');
    const money2 = v => `${curSym()}${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
    const recalc = () => {
      let total = 0, totPurchase = 0, totSell = 0;
      $$('#main tbody tr').forEach(tr => {
        const costEl = $('[data-cost]', tr); if (!costEl) return;      // skip grouped parent rows
        const cost = Number(costEl.value)||0, sell = Number($('[data-price]', tr).value)||0, stk = Number($('[data-stock]', tr).value)||0;
        const up = sell - cost, sp = up * stk, pv = cost * stk;
        total += sp; totPurchase += pv; totSell += sell * stk;
        const pc = $('[data-pvalue]', tr), uc = $('[data-uprofit]', tr), sc = $('[data-sprofit]', tr), mc = $('[data-mpc]', tr);
        pc.textContent = money2(pv);
        uc.textContent = money2(up); sc.textContent = money2(sp);
        if (mc) { const pct = sell > 0 ? (up / sell * 100) : 0;
          mc.textContent = sell > 0 ? (Math.round(pct * 10) / 10) + '%' : '—';
          mc.style.color = pct < 0 ? '#c62828' : (pct >= 30 ? '#1a7f37' : (pct > 0 ? '#b26a00' : 'var(--grey)'));
          mc.style.fontWeight = '700'; }
        uc.style.color = sc.style.color = up < 0 ? '#c62828' : (up > 0 ? '#1a7f37' : 'var(--grey)');
      });
      // roll the variant rows up into their product row
      $$('#main tbody tr.inv-parent').forEach(par => {
        const kids = $$(`#main tbody tr.inv-child[data-parent="${par.dataset.pid}"]`);
        let stock = 0, pv = 0, sp = 0; const prices = [];
        kids.forEach(tr => {
          const cost = Number($('[data-cost]', tr).value)||0, sell = Number($('[data-price]', tr).value)||0, stk = Number($('[data-stock]', tr).value)||0;
          stock += stk; pv += cost * stk; sp += (sell - cost) * stk; if (sell > 0) prices.push(sell);
        });
        $('[data-pstock]', par).textContent = Math.round(stock * 100) / 100;
        $('[data-ppvalue]', par).textContent = money2(pv);
        const spc = $('[data-psprofit]', par); spc.textContent = money2(sp);
        spc.style.color = sp < 0 ? '#c62828' : '#1a7f37';
        const lo = prices.length ? Math.min(...prices) : 0, hi = prices.length ? Math.max(...prices) : 0;
        $('[data-prange]', par).textContent = !prices.length ? '—' : (lo === hi ? money2(lo) : money2(lo) + '–' + money2(hi));
        const mpc = $('[data-pmpc]', par);
        if (mpc) { const sell = pv + sp, pct = sell > 0 ? (sp / sell * 100) : 0;
          mpc.textContent = sell > 0 ? (Math.round(pct * 10) / 10) + '%' : '—';
          mpc.style.color = pct < 0 ? '#c62828' : (pct >= 30 ? '#1a7f37' : '#b26a00'); mpc.style.fontWeight = '700'; }
      });
      const t = $('#invTotProfit'); t.textContent = money2(total); t.style.color = total < 0 ? '#c62828' : '#1a7f37';
      $('#invTotPurchase').textContent = money2(totPurchase);
      $('#invTotSell').textContent = money2(totSell);
      const tm = $('#invTotMargin');
      if (tm) { const pct = totSell > 0 ? total / totSell * 100 : 0;
        tm.textContent = totSell > 0 ? `${Math.round(pct * 10) / 10}% overall margin` : '';
        tm.style.color = pct < 0 ? '#c62828' : (pct >= 30 ? '#1a7f37' : '#b26a00'); }
    };
    // render the table body for the current search / filter / sort, then re-bind row actions
    const render = () => {
      const list = sorted(products.filter(matches));
      $('#invRows').innerHTML = rowsHtml(list) || `<tr><td colspan="8" style="color:var(--grey);padding:1rem">No products match this search.</td></tr>`;
      $('#invCount').textContent = `${list.length} of ${products.length} products`;
      // remember filters + sort so a save doesn't lose them
      INV_UI.q = $('#invSearch').value; INV_UI.cat = $('#invCat').value;
      INV_UI.status = $('#invStatus').value; INV_UI.sortKey = sortKey; INV_UI.sortDir = sortDir;
      $$('#main thead .th-sort').forEach(th => {
        th.classList.toggle('sorted', th.dataset.sort === sortKey);
        th.dataset.dir = th.dataset.sort === sortKey ? (sortDir > 0 ? '▲' : '▼') : '';
      });
      bindRows();
      // when searching, open the variant groups so the matching type is visible
      if (($('#invSearch').value || '').trim()) {
        $$('#main tbody tr.inv-child').forEach(k => { k.hidden = false; });
        $$('#main tbody tr.inv-parent').forEach(par => {
          par.classList.add('open');
          const ic = $('.inv-toggle', par); if (ic) ic.textContent = '▾';
        });
      }
      recalc();
    };
    $('#invSearch').addEventListener('input', render);
    $('#invCat').addEventListener('change', render);
    $('#invStatus').addEventListener('change', render);
    $('#invClear').addEventListener('click', () => {
      $('#invSearch').value = ''; $('#invCat').value = ''; $('#invStatus').value = ''; render();
    });
    $$('#main thead .th-sort').forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'name' ? 1 : -1; }
      render();
    }));

    function bindRows() {
    $$('#main tbody input').forEach(i => i.addEventListener('input', recalc));
    $$('[data-btn]').forEach(b => b.addEventListener('click', async () => {
      const tr = b.closest('tr');
      if (b.dataset.mode === 'edit') {
        // enter edit mode
        $$('.inv-num', tr).forEach(i => i.removeAttribute('readonly'));
        tr.classList.add('row-editing');
        b.textContent = 'Save'; b.dataset.mode = 'save'; b.classList.remove('btn--ghost');
        $('[data-cost]', tr).focus();
      } else {
        // save & lock back
        b.disabled = true; b.textContent = 'Saving…';
        const vals = { cost_price: $('[data-cost]', tr).value, price: $('[data-price]', tr).value,
          stock_quantity: $('[data-stock]', tr).value, low_stock_threshold: $('[data-low]', tr).value };
        try {
          if (b.dataset.vid) {                       // variant row → update that variant
            const p = products.find(x => x.id == b.dataset.id) || {};
            const variants = (p.variants || []).map(v => v.id === b.dataset.vid ? { ...v, ...vals } : v);
            await api('/api/products/' + b.dataset.id, { method:'PUT', body: JSON.stringify({ variants }) });
          } else {
            await api('/api/products/' + b.dataset.id, { method:'PUT', body: JSON.stringify(vals) });
          }
          toast('Saved'); viewInventory();
        } catch(e){ b.disabled = false; b.textContent = 'Save'; toast(e.message); }
      }
    }));
    $$('[data-restock]').forEach(b => b.addEventListener('click', () => openRestock(products.find(p => p.id == b.dataset.restock), b.dataset.rvid || '')));
    $$('[data-layers]').forEach(b => b.addEventListener('click', () => openStockLayers(products.find(p => p.id == b.dataset.layers), b.dataset.lvid || '')));
    $$('[data-adjust]').forEach(b => b.addEventListener('click', () => openAdjust(products.find(p => p.id == b.dataset.adjust), b.dataset.avid || '')));
    $$('[data-hist]').forEach(b => b.addEventListener('click', () => viewMovements(products.find(p => p.id == b.dataset.hist), b.dataset.hvid || '')));
    $$('[data-editfull]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); openProduct(products.find(p => p.id == b.dataset.editfull), viewInventory); }));
    // expand / collapse a product's variant rows
    const toggleGroup = (pid, force) => {
      const kids = $$(`#main tbody tr.inv-child[data-parent="${pid}"]`);
      if (!kids.length) return;
      const open = force != null ? force : kids[0].hidden;
      kids.forEach(k => { k.hidden = !open; });
      const par = $(`#main tbody tr.inv-parent[data-pid="${pid}"]`);
      if (par) { par.classList.toggle('open', open); const ic = $('.inv-toggle', par); if (ic) ic.textContent = open ? '▾' : '▸'; }
    };
    $$('#main tbody tr.inv-parent').forEach(par => par.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;             // don't toggle when clicking a button
      toggleGroup(par.dataset.pid);
    }));
    }   // end bindRows
    render();
  }

  // Dead stock — money sitting in items that haven't sold
  async function viewDeadStock(days) {
    const d = days || 60;
    const list = await api('/api/deadstock?days=' + d);
    const total = list.reduce((s, l) => s + (l.stock_value || 0), 0);
    modal(`<h3>💤 Dead stock <span style="font-weight:400;color:var(--grey)">— no sales in ${d} days</span></h3>
      <div style="display:flex;gap:.5rem;align-items:center;margin:.4rem 0 .7rem">
        <span class="hint-inline">Show items with no sales in</span>
        <select id="dsDays">${[30,60,90,180].map(n=>`<option value="${n}" ${n==d?'selected':''}>${n} days</option>`).join('')}</select>
        <span class="hint-inline">· <b>${list.length}</b> items · <b>${money(total)}</b> tied up</span>
      </div>
      <div class="wrap-scroll" style="max-height:55vh"><table class="table"><thead><tr><th>Item</th><th>SKU</th><th class="num">Stock</th><th class="num">Stock value</th><th>Last sold</th></tr></thead><tbody>
      ${list.length ? list.map(l => `<tr><td>${esc(l.name)}${l.label?`<div class="hint-inline">↳ ${esc(l.label)}</div>`:''}</td>
        <td class="hint-inline">${esc(l.sku||'')}</td><td class="num">${l.stock} ${esc(l.unit||'')}</td>
        <td class="num"><b>${money(l.stock_value)}</b></td>
        <td class="hint-inline">${l.last_sale?esc(date(l.last_sale)):'never sold'}</td></tr>`).join('')
        : '<tr><td colspan="5" style="color:var(--grey)">Nothing is sitting still — everything has sold recently.</td></tr>'}
      </tbody></table></div>
      <div class="modal__actions"><button class="btn" id="dsClose">Close</button></div>
    `, (box) => {
      $('#dsDays', box).addEventListener('change', () => { closeModal(); viewDeadStock(Number($('#dsDays', box).value)); });
      $('#dsClose', box).addEventListener('click', closeModal);
    });
  }

  // Stock count / correction — records the reason in the movement ledger
  function openAdjust(p, variantId) {
    if (!p) return;
    const v = variantId ? (p.variants || []).find(x => x.id === variantId) : null;
    const t = v || p;
    modal(`<h3>Adjust stock — ${esc(p.name)}${v?` <span style="font-weight:400;color:var(--grey)">(${variantCell(v)})</span>`:''}</h3>
      <p class="hint-inline" style="margin:.1rem 0 .6rem">System shows <b>${t.stock_quantity||0} ${esc(p.default_unit||'')}</b> on hand. Enter the <b>counted / corrected</b> quantity — the difference is logged with your reason.</p>
      <div class="grid2">
        <div class="field"><label>Counted quantity</label><input id="aQty" type="number" min="0" step="0.01" value="${t.stock_quantity||0}"></div>
        <div class="field"><label>Reason</label><select id="aReason">
          <option>Stock count</option><option>Damaged</option><option>Lost / shrinkage</option>
          <option>Returned to supplier</option><option>Customer return</option><option>Correction</option>
        </select></div>
      </div>
      <div class="field"><label>Note (optional)</label><input id="aNote" placeholder="e.g. counted on 19 Jul, 2 rolls water damaged"></div>
      <div id="aPreview" style="display:none;font-size:.85rem;color:var(--navy);background:#fff8ec;border:1px solid #ffe3b0;border-radius:8px;padding:.5rem .7rem;margin:.2rem 0"></div>
      <p class="msg" id="aMsg"></p>
      <div class="modal__actions"><button class="btn btn--ghost" id="aCancel">Cancel</button><button class="btn" id="aSave">Save adjustment</button></div>
    `, (box) => {
      const prev = () => {
        const nq = Number($('#aQty', box).value) || 0, cur = t.stock_quantity || 0, diff = nq - cur;
        const el = $('#aPreview', box);
        el.style.display = diff ? 'block' : 'none';
        el.innerHTML = diff ? `Change: <b>${diff > 0 ? '+' : ''}${Math.round(diff*100)/100}</b> ${esc(p.default_unit||'')} (${cur} → ${nq})` : '';
      };
      $('#aQty', box).addEventListener('input', prev); prev();
      $('#aCancel', box).addEventListener('click', closeModal);
      $('#aSave', box).addEventListener('click', async () => {
        try {
          await api('/api/products/' + p.id + '/adjust', { method: 'POST', body: JSON.stringify({
            variant_id: variantId || '', quantity: $('#aQty', box).value,
            reason: $('#aReason', box).value, note: $('#aNote', box).value.trim() }) });
          closeModal(); toast('Stock adjusted'); viewInventory();
        } catch(e){ $('#aMsg', box).className = 'msg err'; $('#aMsg', box).textContent = e.message; }
      });
    });
  }

  // Full movement ledger for one product/variant
  async function viewMovements(p, variantId) {
    if (!p) return;
    const list = await api('/api/products/' + p.id + '/movements' + (variantId ? '?variant_id=' + encodeURIComponent(variantId) : ''));
    const tag = { purchase:['#1a7f37','Purchase'], sale:['#0071c5','Sale'], reserve:['#b26a00','Reserved'],
      release:['#6e6e73','Released'], adjustment:['#c62828','Adjustment'], return:['#1a7f37','Return'] };
    modal(`<h3>Stock movements — ${esc(p.name)}</h3>
      <p class="hint-inline" style="margin-bottom:.5rem">Every change to this item's stock, newest first.</p>
      <div class="wrap-scroll"><table class="table"><thead><tr><th>When</th><th>Type</th><th class="num">Change</th><th class="num">After</th><th>Reason / ref</th><th>By</th></tr></thead><tbody>
      ${list.length ? list.map(m => { const t2 = tag[m.type] || ['#6e6e73', m.type]; return `<tr>
        <td>${esc(date(m.ts))}</td>
        <td><span style="color:${t2[0]};font-weight:700">${t2[1]}</span>${m.variant_label?`<div class="hint-inline">${esc(m.variant_label)}</div>`:''}</td>
        <td class="num" style="font-weight:700;color:${m.qty<0?'#c62828':'#1a7f37'}">${m.qty>0?'+':''}${m.qty}</td>
        <td class="num">${m.after!==''?m.after:'—'}</td>
        <td>${esc(m.reason||'')}${m.ref?`<div class="hint-inline">${esc(m.ref)}</div>`:''}</td>
        <td class="hint-inline">${esc(m.actor||'')}</td></tr>`; }).join('')
        : '<tr><td colspan="6" style="color:var(--grey)">No movements recorded yet.</td></tr>'}
      </tbody></table></div>
      <div class="modal__actions"><button class="btn" id="mvClose">Close</button></div>
    `, (box) => { $('#mvClose', box).addEventListener('click', closeModal); });
  }

  function openRestock(p, variantId) {
    if (!p) return;
    const v = variantId ? (p.variants || []).find(x => x.id === variantId) : null;
    const t = v || p;                                   // the thing being restocked
    const today = new Date().toISOString().slice(0, 10);
    modal(`<h3>Restock — ${esc(p.name)}${v?` <span style="font-weight:400;color:var(--grey)">(${variantCell(v)})</span>`:''}</h3>
      <p class="hint-inline" style="margin:.1rem 0 .4rem">Current: <b>${t.stock_quantity||0} ${esc(p.default_unit||'')}</b> in stock at avg cost <b>${money(t.cost_price||0)}</b>. Adding a purchase updates the weighted-average cost.</p>
      ${p.supplier||p.lead_time ? `<p class="hint-inline" style="margin:0 0 .6rem;padding:.4rem .6rem;background:var(--bg-soft,#f5f7fa);border-radius:8px">🏭 Supplier: <b>${esc(p.supplier||'—')}</b>${p.supplier_contact?` · ${esc(p.supplier_contact)}`:''}${p.lead_time?` · lead time <b>${esc(p.lead_time)}</b>`:''}</p>` : ''}
      <p class="hint-inline" id="rLast" style="margin:0 0 .6rem"></p>
      <div class="grid2"><div class="field"><label>Quantity purchased</label><input id="rQty" type="number" min="0" step="0.01" placeholder="e.g. 50"></div>
      <div class="field"><label>Purchase price (₹ / ${esc(p.default_unit||'unit')})</label><input id="rPrice" type="number" min="0" step="0.01" placeholder="this batch's price"></div></div>
      <div class="grid2"><div class="field"><label>Date</label><input id="rDate" type="date" value="${today}"></div>
      <div class="field"><label>Note (optional)</label><input id="rNote" placeholder="supplier / invoice #"></div></div>
      <div id="rPreview" style="display:none;font-size:.85rem;color:var(--navy);background:#eef7ee;border:1px solid #cfe8cf;border-radius:8px;padding:.5rem .7rem;margin:.2rem 0"></div>
      <p class="msg" id="rMsg"></p>
      <div class="modal__actions"><button class="btn btn--ghost" id="rHist">View history</button><button class="btn btn--ghost" id="rCancel">Cancel</button><button class="btn" id="rSave">Add Purchase</button></div>
    `, (box) => {
      const preview = () => {
        const qty = Number($('#rQty', box).value) || 0, price = Number($('#rPrice', box).value) || 0;
        const os = t.stock_quantity || 0, oc = t.cost_price || 0;
        const ns = os + qty, nc = ns > 0 ? (os * oc + qty * price) / ns : price;
        const el = $('#rPreview', box);
        el.style.display = qty > 0 ? 'block' : 'none';
        el.innerHTML = qty > 0
          ? `New stock: <b>${ns}</b> · New average cost: <b>${money(Math.round(nc*100)/100)}</b> · This purchase: <b>${money(qty*price)}</b>`
          : '';
      };
      $('#rQty', box).addEventListener('input', preview); $('#rPrice', box).addEventListener('input', preview);
      // show what this item cost last time, and prefill that price
      api('/api/products/' + p.id + '/purchases').then(hist => {
        const rel = hist.filter(h => (variantId ? h.variant_id === variantId : !h.variant_id));
        const last = rel[0]; const el = $('#rLast', box);
        if (last && el) {
          el.innerHTML = `🕘 Last purchase: <b>${last.quantity}</b> @ <b>${money(last.unit_price)}</b> on ${esc(last.date)}${last.note?` · ${esc(last.note)}`:''}`;
          const pi = $('#rPrice', box); if (pi && !pi.value) { pi.value = last.unit_price; preview(); }
        }
      }).catch(()=>{});
      $('#rCancel', box).addEventListener('click', closeModal);
      $('#rHist', box).addEventListener('click', () => viewPurchaseHistory(p));
      $('#rSave', box).addEventListener('click', async () => {
        const body = { quantity: $('#rQty', box).value, price: $('#rPrice', box).value, date: $('#rDate', box).value, note: $('#rNote', box).value.trim(), variant_id: variantId || '' };
        if (!(Number(body.quantity) > 0)) { $('#rMsg', box).className = 'msg err'; $('#rMsg', box).textContent = 'Enter a quantity greater than 0.'; return; }
        try { await api('/api/products/' + p.id + '/restock', { method: 'POST', body: JSON.stringify(body) });
          closeModal(); toast('Purchase recorded'); viewInventory();
        } catch(e){ $('#rMsg', box).className = 'msg err'; $('#rMsg', box).textContent = e.message; }
      });
    });
  }

  /* New stock vs old stock — current stock split into the batches it came from,
     oldest sold first (FIFO), so you can see what's fresh, what's ageing and
     what each batch actually cost. */
  async function openStockLayers(p, variantId) {
    if (!p) return;
    let d;
    try { d = await api('/api/products/' + p.id + '/stock-layers' + (variantId ? '?variant_id=' + encodeURIComponent(variantId) : '')); }
    catch (e) { toast(e.message); return; }
    const u = esc(d.unit || '');
    const age = n => n == null ? '' : n <= 0 ? 'today' : n === 1 ? '1 day old' : n < 30 ? n + ' days old' : n < 365 ? Math.floor(n / 30) + ' months old' : Math.floor(n / 365) + 'y old';
    const ageTone = n => n == null ? '' : n > 180 ? 'sl-age--bad' : n > 90 ? 'sl-age--warn' : 'sl-age--ok';
    const ns = d.new_stock, os = d.old_stock;

    const batches = d.layers.slice().reverse().map(l => {
      const pctLeft = l.qty > 0 ? Math.round(l.remaining / l.qty * 100) : 0;
      const gone = l.remaining <= 0;
      return `<div class="sl-batch${gone ? ' sl-batch--gone' : ''}">
        <div class="sl-batch__head">
          <div><b>${l.opening ? 'Opening stock' : esc(l.date)}</b>
            <span class="sl-age ${ageTone(l.age_days)}">${age(l.age_days)}</span>
            ${l.note ? `<div class="hint-inline">${esc(l.note)}</div>` : ''}</div>
          <div class="sl-batch__num">
            <b>${gone ? '<span style="opacity:.55">used up</span>' : l.remaining + ' ' + u + ' left'}</b>
            <span class="hint-inline">of ${l.qty} ${u} @ ${money(l.unit_cost)}</span>
          </div>
        </div>
        <div class="sl-bar"><span style="width:${pctLeft}%"></span></div>
      </div>`;
    }).join('');

    modal(`<h3>Stock breakdown — ${esc(d.name)}${d.label ? ` <span style="font-weight:400;color:var(--grey)">(${esc(d.label)})</span>` : ''}</h3>
      <p class="hint-inline" style="margin:.1rem 0 .7rem">Oldest stock is treated as sold first (FIFO). ${d.on_hand} ${u} on hand${d.reserved > 0 ? ` · ${d.reserved} reserved · <b>${d.available} ${u} free to sell</b>` : ''}.</p>

      <div class="sl-cards">
        <div class="sl-card sl-card--new">
          <span class="sl-card__l">🟢 New stock — latest batch</span>
          ${ns ? `<b class="sl-card__v">${ns.qty} ${u}</b>
            <span class="sl-card__s">bought ${esc(ns.date)} · ${age(ns.age_days)}</span>
            <span class="sl-card__s">cost <b>${money(ns.unit_cost)}</b> / ${u} · worth ${money(ns.qty * ns.unit_cost)}</span>
            ${ns.note ? `<span class="sl-card__s">${esc(ns.note)}</span>` : ''}`
          : `<b class="sl-card__v" style="opacity:.5">—</b><span class="sl-card__s">No purchase recorded yet</span>`}
        </div>
        <div class="sl-card sl-card--old">
          <span class="sl-card__l">🟠 Old stock — earlier batches</span>
          <b class="sl-card__v">${os.qty} ${u}</b>
          ${os.qty > 0
            ? `<span class="sl-card__s">${os.batches} older batch${os.batches === 1 ? '' : 'es'} · oldest ${age(os.oldest_age)}</span>
               <span class="sl-card__s">avg cost <b>${money(os.avg_cost)}</b> / ${u} · worth ${money(os.value)}</span>
               ${os.oldest_age > 180 ? `<span class="sl-flag">⚠ Stock over 6 months old — consider clearing it first</span>` : ''}`
            : `<span class="sl-card__s">All current stock is from the latest batch</span>`}
        </div>
      </div>

      ${d.untracked > 0 ? `<p class="hint-inline" style="margin:.2rem 0 .6rem;padding:.45rem .65rem;background:#FFF7ED;border-left:3px solid #EA580C;border-radius:0 6px 6px 0">
        <b>${d.untracked} ${u}</b> of this stock has no purchase behind it — it was entered directly or adjusted in. Record it through Restock to track its real cost.</p>` : ''}

      <h4 style="margin:.9rem 0 .5rem;color:var(--navy);font-size:.9rem">Batches — newest first</h4>
      <div class="wrap-scroll" style="max-height:38vh">${batches || '<p class="hint-inline">No purchase batches recorded yet.</p>'}</div>

      <div class="modal__actions">
        <button class="btn btn--ghost" id="slHist">Purchase history</button>
        <button class="btn btn--ghost" id="slRestock">＋ Add purchase</button>
        <button class="btn" id="slClose">Close</button>
      </div>
    `, (box) => {
      $('#slClose', box).addEventListener('click', closeModal);
      $('#slHist', box).addEventListener('click', () => viewPurchaseHistory(p));
      $('#slRestock', box).addEventListener('click', () => openRestock(p, variantId));
    });
  }

  async function viewPurchaseHistory(p) {
    const list = await api('/api/products/' + p.id + '/purchases');
    const zero = list.filter(r => !(Number(r.unit_price) > 0)).length;
    modal(`<h3>Purchase history — ${esc(p.name)}</h3>
      <p class="hint-inline" style="margin:.1rem 0 .5rem">Editing or deleting a purchase corrects the stock and recalculates the weighted-average cost.</p>
      ${zero ? `<p class="hint-inline" style="margin:0 0 .6rem;padding:.4rem .6rem;background:#FFF4E5;border-left:3px solid #E8A33D;border-radius:0 6px 6px 0">⚠ ${zero} purchase${zero>1?'s have':' has'} a unit price of ₹0 — edit to enter the real price so your cost and profit are accurate.</p>` : ''}
      <div class="wrap-scroll"><table class="table"><thead><tr><th>Date</th><th>Variant</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Total</th><th class="num">Avg cost after</th><th>Note</th><th style="width:96px"></th></tr></thead><tbody id="phBody">
      ${list.length ? list.map(r => `<tr data-pid="${r.id}">
        <td>${esc(r.date)}${r.edited_ts?` <span class="hint-inline" title="Edited by ${esc(r.edited_by||'')}">·edited</span>`:''}</td>
        <td class="hint-inline">${esc(r.variant_label||'—')}</td>
        <td class="num">${r.quantity}</td>
        <td class="num"${Number(r.unit_price)>0?'':' style="color:#C2410C;font-weight:700"'}>${money(r.unit_price)}</td>
        <td class="num">${money(r.total)}</td>
        <td class="num">${money(r.new_avg_cost)}</td>
        <td class="hint-inline">${esc(r.note||'')}</td>
        <td class="num"><button class="ibtn" data-act="edit" title="Edit">✎</button> <button class="ibtn" data-act="del" title="Delete">🗑</button></td>
      </tr>`).join('') : '<tr><td colspan="8" style="color:var(--grey)">No purchases recorded yet.</td></tr>'}
      </tbody></table></div>
      <div class="modal__actions"><button class="btn btn--ghost" id="phAdd">+ Add purchase</button><button class="btn" id="phClose">Close</button></div>
    `, (box) => {
      $('#phClose', box).addEventListener('click', closeModal);
      $('#phAdd', box).addEventListener('click', () => openRestock(p));
      box.querySelectorAll('#phBody button[data-act]').forEach(b => {
        b.addEventListener('click', () => {
          const pid = Number(b.closest('tr').dataset.pid);
          const rec = list.find(x => x.id === pid); if (!rec) return;
          if (b.dataset.act === 'edit') editPurchase(p, rec);
          else deletePurchase(p, rec);
        });
      });
    });
  }

  // Edit one historical purchase (fix a wrong quantity, price, date or note).
  function editPurchase(p, rec) {
    modal(`<h3>Edit purchase — ${esc(p.name)}</h3>
      <p class="hint-inline" style="margin:.1rem 0 .6rem">Recorded ${esc(rec.date)}${rec.variant_label?` · ${esc(rec.variant_label)}`:''}. Saving corrects stock by the difference and recalculates the average cost.</p>
      <div class="grid2"><div class="field"><label>Quantity purchased</label><input id="eQty" type="number" min="0" step="0.01" value="${rec.quantity}"></div>
      <div class="field"><label>Purchase price (₹ / ${esc(p.default_unit||'unit')})</label><input id="ePrice" type="number" min="0" step="0.01" value="${rec.unit_price}"></div></div>
      <div class="grid2"><div class="field"><label>Date</label><input id="eDate" type="date" value="${esc(rec.date)}"></div>
      <div class="field"><label>Note (optional)</label><input id="eNote" value="${esc(rec.note||'')}" placeholder="supplier / invoice #"></div></div>
      <div id="ePreview" style="font-size:.85rem;color:var(--navy);background:#eef7ee;border:1px solid #cfe8cf;border-radius:8px;padding:.5rem .7rem;margin:.2rem 0"></div>
      <p class="msg" id="eMsg"></p>
      <div class="modal__actions"><button class="btn btn--ghost" id="eCancel">Cancel</button><button class="btn" id="eSave">Save changes</button></div>
    `, (box) => {
      const preview = () => {
        const q = Number($('#eQty', box).value)||0, pr = Number($('#ePrice', box).value)||0;
        const dq = q - Number(rec.quantity);
        $('#ePreview', box).innerHTML = `This purchase: <b>${money(q*pr)}</b>`
          + (dq ? ` · Stock will change by <b>${dq>0?'+':''}${Math.round(dq*100)/100}</b>` : ' · Stock unchanged');
      };
      preview();
      $('#eQty', box).addEventListener('input', preview);
      $('#ePrice', box).addEventListener('input', preview);
      $('#eCancel', box).addEventListener('click', () => viewPurchaseHistory(p));
      $('#eSave', box).addEventListener('click', async () => {
        const body = { quantity: $('#eQty', box).value, price: $('#ePrice', box).value,
                       date: $('#eDate', box).value, note: $('#eNote', box).value.trim() };
        if (!(Number(body.quantity) > 0)) { $('#eMsg', box).className='msg err'; $('#eMsg', box).textContent='Enter a quantity greater than 0.'; return; }
        try {
          await api('/api/purchases/' + rec.id, { method: 'PUT', body: JSON.stringify(body) });
          toast('Purchase updated'); viewInventory(); viewPurchaseHistory(p);
        } catch(e){ $('#eMsg', box).className='msg err'; $('#eMsg', box).textContent = e.message; }
      });
    });
  }

  function deletePurchase(p, rec) {
    modal(`<h3>Delete this purchase?</h3>
      <p class="hint-inline" style="margin:.2rem 0 .7rem">
        <b>${esc(rec.date)}</b> · ${rec.quantity} ${esc(p.default_unit||'')} @ ${money(rec.unit_price)} = <b>${money(rec.total)}</b>${rec.variant_label?`<br>Variant: ${esc(rec.variant_label)}`:''}
      </p>
      <p class="hint-inline" style="padding:.5rem .7rem;background:#FEF2F2;border-left:3px solid #DC2626;border-radius:0 6px 6px 0">
        <b>${rec.quantity}</b> will be removed from stock and the average cost recalculated from the remaining purchases. This cannot be undone.
      </p>
      <p class="msg" id="dMsg"></p>
      <div class="modal__actions"><button class="btn btn--ghost" id="dCancel">Cancel</button><button class="btn btn--danger" id="dOk">Delete purchase</button></div>
    `, (box) => {
      $('#dCancel', box).addEventListener('click', () => viewPurchaseHistory(p));
      $('#dOk', box).addEventListener('click', async () => {
        try {
          await api('/api/purchases/' + rec.id, { method: 'DELETE' });
          toast('Purchase deleted'); viewInventory(); viewPurchaseHistory(p);
        } catch(e){ $('#dMsg', box).className='msg err'; $('#dMsg', box).textContent = e.message; }
      });
    });
  }

  // ===================== SUPPLIERS =====================
  async function viewSuppliers() {
    main.innerHTML = head('Suppliers', 'Who you buy from, what you spend with them, and every message you send.',
      `<button class="btn" id="supAdd">+ Add Supplier</button>`);
    const list = await api('/api/suppliers');
    SUPPLIERS = list;                       // keep the product-editor dropdown in sync
    const stars = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
    main.insertAdjacentHTML('beforeend', `
      <div class="inv-toolbar"><input id="supSearch" placeholder="🔍 Search supplier, product or city…">
        <span class="hint-inline" id="supCount"></span></div>
      <div class="wrap-scroll"><table class="table"><thead><tr>
        <th>Supplier</th><th>Contact</th><th>Supplies</th><th class="num">Total spent</th>
        <th class="num">Purchases</th><th>Last buy</th><th>Terms</th><th></th>
      </tr></thead><tbody id="supRows"></tbody></table></div>`);

    const draw = () => {
      const q = ($('#supSearch').value || '').trim().toLowerCase();
      const rows = list.filter(s => !q || [s.name, s.company, s.contact_person, s.city, s.supplies, s.email]
        .filter(Boolean).join(' ').toLowerCase().includes(q));
      $('#supCount').textContent = `${rows.length} of ${list.length} suppliers`;
      $('#supRows').innerHTML = rows.length ? rows.map(s => `<tr data-sid="${s.id}"${s.active ? '' : ' style="opacity:.55"'}>
        <td><b>${esc(s.name)}</b>${s.company && s.company !== s.name ? `<div class="hint-inline">${esc(s.company)}</div>` : ''}
            ${s.rating > 0 ? `<div class="hint-inline" style="color:#E8A33D">${stars(s.rating)}</div>` : ''}
            ${s.active ? '' : '<div class="hint-inline">inactive</div>'}</td>
        <td class="hint-inline">${s.contact_person ? esc(s.contact_person) + '<br>' : ''}${s.phone ? '📞 ' + esc(s.phone) + '<br>' : ''}${s.email ? '✉ ' + esc(s.email) : '<span style="color:#c62828">no email</span>'}${s.city ? '<br>📍 ' + esc(s.city) : ''}</td>
        <td class="hint-inline">${esc(s.supplies || '—')}${s.product_count ? `<div class="hint-inline">${s.product_count} product(s) linked</div>` : ''}</td>
        <td class="num"><b>${money(s.total_spend)}</b></td>
        <td class="num">${s.purchase_count}</td>
        <td class="hint-inline">${esc(s.last_purchase || '—')}</td>
        <td class="hint-inline">${esc(s.payment_terms || '—')}${s.lead_time ? `<div class="hint-inline">⏱ ${esc(s.lead_time)}</div>` : ''}</td>
        <td style="white-space:nowrap"><button class="btn btn--sm ibtn" title="Send email" data-mail="${s.id}">✉</button>
          <button class="btn btn--ghost btn--sm ibtn" title="View details" data-open="${s.id}">👁</button>
          <button class="btn btn--ghost btn--sm ibtn" title="Edit" data-edit="${s.id}">✎</button>
          <button class="btn btn--ghost btn--sm ibtn" title="Delete" data-del="${s.id}">🗑</button></td>
      </tr>`).join('') : `<tr><td colspan="8" style="color:var(--grey);padding:1rem">${list.length ? 'No suppliers match.' : 'No suppliers yet — add your first one to start tracking what you buy and from whom.'}</td></tr>`;
      $$('#supRows [data-edit]').forEach(b => b.addEventListener('click', () => openSupplier(list.find(s => s.id == b.dataset.edit))));
      $$('#supRows [data-open]').forEach(b => b.addEventListener('click', () => supplierDetail(b.dataset.open)));
      $$('#supRows [data-mail]').forEach(b => b.addEventListener('click', () => emailSupplier(list.find(s => s.id == b.dataset.mail))));
      $$('#supRows [data-del]').forEach(b => b.addEventListener('click', () => {
        const s = list.find(x => x.id == b.dataset.del);
        modal(`<h3>Delete ${esc(s.name)}?</h3>
          <p class="hint-inline">Their purchase history stays intact — only the contact record is removed${s.product_count ? `, and ${s.product_count} product(s) will be unlinked` : ''}.</p>
          <div class="modal__actions"><button class="btn btn--ghost" id="dc">Cancel</button><button class="btn btn--danger" id="dk">Delete</button></div>`,
          (box) => { $('#dc', box).addEventListener('click', closeModal);
            $('#dk', box).addEventListener('click', async () => { await api('/api/suppliers/' + s.id, { method: 'DELETE' }); closeModal(); toast('Supplier deleted'); viewSuppliers(); }); });
      }));
    };
    $('#supSearch').addEventListener('input', draw);
    $('#supAdd').addEventListener('click', () => openSupplier(null));
    draw();
  }

  function openSupplier(s) {
    const d = s || {};
    const f = (label, id, val, ph, type) => `<div class="field"><label>${label}</label><input id="s_${id}" ${type ? `type="${type}"` : ''} value="${esc(val == null ? '' : val)}" ${ph ? `placeholder="${esc(ph)}"` : ''}></div>`;
    modal(`<h3>${s ? 'Edit supplier — ' + esc(s.name) : 'Add supplier'}</h3>
      <div class="grid2">${f('Supplier name *', 'name', d.name, 'e.g. Kerala Twine Works')}${f('Company / trading name', 'company', d.company)}</div>
      <div class="grid2">${f('Contact person', 'contact_person', d.contact_person)}${f('Phone', 'phone', d.phone, '+91…')}</div>
      <div class="grid2">${f('WhatsApp', 'whatsapp', d.whatsapp)}${f('Email', 'email', d.email, 'for purchase enquiries', 'email')}</div>
      <div class="field"><label>Address</label><input id="s_address" value="${esc(d.address || '')}"></div>
      <div class="grid2">${f('City', 'city', d.city)}${f('State', 'state_region', d.state_region)}${f('Country', 'country', d.country || 'India')}${f('GST / Tax number', 'gst', d.gst)}</div>
      <div class="grid2">${f('Payment terms', 'payment_terms', d.payment_terms, 'e.g. 30 days credit')}${f('Typical lead time', 'lead_time', d.lead_time, 'e.g. 2 weeks')}</div>
      <div class="field"><label>What they supply</label><input id="s_supplies" value="${esc(d.supplies || '')}" placeholder="e.g. HDPE twine, float rope, lead sinkers"></div>
      <div class="grid2">
        <div class="field"><label>Rating</label><select id="s_rating">${[0,1,2,3,4,5].map(n => `<option value="${n}" ${Number(d.rating || 0) === n ? 'selected' : ''}>${n === 0 ? 'Not rated' : '★'.repeat(n)}</option>`).join('')}</select></div>
        <div class="field"><label>Status</label><select id="s_active"><option value="1" ${d.active === 0 ? '' : 'selected'}>Active</option><option value="0" ${d.active === 0 ? 'selected' : ''}>Inactive</option></select></div>
      </div>
      <div class="field"><label>Notes</label><textarea id="s_notes">${esc(d.notes || '')}</textarea></div>
      <p class="msg" id="sMsg"></p>
      <div class="modal__actions"><button class="btn btn--ghost" id="sCancel">Cancel</button><button class="btn" id="sSave">${s ? 'Save changes' : 'Add supplier'}</button></div>
    `, (box) => {
      $('#sCancel', box).addEventListener('click', closeModal);
      $('#sSave', box).addEventListener('click', async () => {
        const keys = ['name','company','contact_person','phone','whatsapp','email','address','city','state_region','country','gst','payment_terms','lead_time','supplies','rating','active'];
        const body = Object.fromEntries(keys.map(k => [k, ($('#s_' + k, box) || {}).value || '']));
        body.notes = $('#s_notes', box).value;
        if (!body.name.trim()) { $('#sMsg', box).className = 'msg err'; $('#sMsg', box).textContent = 'Supplier name is required.'; return; }
        try {
          if (s) await api('/api/suppliers/' + s.id, { method: 'PUT', body: JSON.stringify(body) });
          else await api('/api/suppliers', { method: 'POST', body: JSON.stringify(body) });
          closeModal(); toast(s ? 'Supplier updated' : 'Supplier added'); viewSuppliers();
        } catch (e) { $('#sMsg', box).className = 'msg err'; $('#sMsg', box).textContent = e.message; }
      });
    });
  }

  async function supplierDetail(id) {
    const s = await api('/api/suppliers/' + id);
    modal(`<h3>${esc(s.name)}${s.company && s.company !== s.name ? ` <span style="font-weight:400;color:var(--grey)">${esc(s.company)}</span>` : ''}</h3>
      <div class="sl-cards" style="margin-bottom:.6rem">
        <div class="sl-card sl-card--new"><span class="sl-card__l">Total spent</span><b class="sl-card__v">${money(s.total_spend)}</b>
          <span class="sl-card__s">${s.purchase_count} purchase(s)${s.last_purchase ? ' · last ' + esc(s.last_purchase) : ''}</span></div>
        <div class="sl-card sl-card--old"><span class="sl-card__l">Contact</span>
          <span class="sl-card__s">${s.contact_person ? esc(s.contact_person) + '<br>' : ''}${s.phone ? '📞 ' + esc(s.phone) + '<br>' : ''}${s.email ? '✉ ' + esc(s.email) + '<br>' : ''}${[s.city, s.state_region, s.country].filter(Boolean).map(esc).join(', ')}</span>
          <span class="sl-card__s">${s.payment_terms ? 'Terms: ' + esc(s.payment_terms) : ''}${s.lead_time ? ' · Lead ' + esc(s.lead_time) : ''}</span></div>
      </div>
      ${s.notes ? `<p class="hint-inline" style="padding:.5rem .65rem;background:var(--bg-soft,#f5f7fa);border-radius:8px">${esc(s.notes)}</p>` : ''}
      <h4 style="margin:.8rem 0 .4rem;color:var(--navy);font-size:.9rem">Products from this supplier</h4>
      ${s.products.length ? `<div class="wrap-scroll" style="max-height:22vh"><table class="table"><thead><tr><th>Product</th><th>SKU</th><th class="num">Stock</th><th class="num">Cost</th></tr></thead><tbody>
        ${s.products.map(p => `<tr><td>${esc(p.name)}</td><td class="hint-inline">${esc(p.sku || '—')}</td><td class="num">${p.stock}</td><td class="num">${money(p.cost)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="hint-inline">No products linked yet — set the supplier on a product in its Stock tab.</p>'}
      <h4 style="margin:.8rem 0 .4rem;color:var(--navy);font-size:.9rem">Messages sent (${s.mail.length})</h4>
      ${s.mail.length ? `<div class="wrap-scroll" style="max-height:22vh">${s.mail.map(m => `<div class="sl-batch"><div class="sl-batch__head"><div><b>${esc(m.subject)}</b><div class="hint-inline">to ${esc(m.to)} · ${new Date(m.ts).toLocaleString()}${m.actor ? ' · by ' + esc(m.actor) : ''}</div></div><div class="hint-inline">${m.sent ? '<span style="color:#2E7D32;font-weight:700">sent</span>' : '<span style="color:#B26A00;font-weight:700">logged only</span>'}</div></div><div class="hint-inline" style="white-space:pre-wrap;margin-top:.3rem">${esc(m.body)}</div></div>`).join('')}</div>` : '<p class="hint-inline">No messages sent yet.</p>'}
      <div class="modal__actions"><button class="btn btn--ghost" id="sdMail">✉ Send email</button><button class="btn btn--ghost" id="sdEdit">Edit</button><button class="btn" id="sdClose">Close</button></div>
    `, (box) => {
      $('#sdClose', box).addEventListener('click', closeModal);
      $('#sdEdit', box).addEventListener('click', () => openSupplier(s));
      $('#sdMail', box).addEventListener('click', () => emailSupplier(s));
    });
  }

  /* Compose an email to a supplier. Templates cover the two things you actually
     send: a price enquiry and a restock order. */
  async function emailSupplier(s) {
    if (!s) return;
    let reorder = []; try { reorder = await api('/api/reorder'); } catch {}
    const mine = reorder.filter(r => (r.supplier_id ? r.supplier_id === s.id : false));
    const co = (SETTINGS && SETTINGS.company_name) || 'Shalom Marine Nets';
    const lines = (mine.length ? mine : reorder).slice(0, 12)
      .map(r => `  • ${r.name}${r.label ? ' (' + r.label + ')' : ''} — ${r.suggested} ${r.unit || ''}`).join('\n');
    const TPL = {
      enquiry: { s: `Price enquiry — ${co}`,
        b: `Dear ${s.contact_person || s.name},\n\nWe would like your current price and availability for the following:\n\n  • \n  • \n\nPlease also confirm your lead time and payment terms.\n\nThank you,\n${co}` },
      order: { s: `Purchase order enquiry — ${co}`,
        b: `Dear ${s.contact_person || s.name},\n\nWe would like to place an order for:\n\n${lines || '  • '}\n\nPlease confirm price, availability and delivery date.\n\nThank you,\n${co}` },
      chase: { s: `Follow-up on our order — ${co}`,
        b: `Dear ${s.contact_person || s.name},\n\nCould you please update us on the status and expected delivery date of our recent order?\n\nThank you,\n${co}` },
    };
    modal(`<h3>Email ${esc(s.name)}</h3>
      ${s.email ? '' : `<p class="hint-inline" style="color:#c62828">This supplier has no saved email — enter one below (and add it to their record to save it).</p>`}
      <div class="field"><label>Template</label><select id="mTpl">
        <option value="enquiry">Price enquiry</option><option value="order">Purchase order / restock</option><option value="chase">Follow up on an order</option></select></div>
      <div class="field"><label>To</label><input id="mTo" value="${esc(s.email || '')}" placeholder="supplier@example.com"></div>
      <div class="field"><label>Subject</label><input id="mSub"></div>
      <div class="field"><label>Message</label><textarea id="mBody" style="min-height:210px;font-family:inherit"></textarea></div>
      <p class="msg" id="mMsg"></p>
      <div class="modal__actions">
        ${s.whatsapp || s.phone ? `<a class="btn btn--ghost" id="mWa" target="_blank" rel="noopener">WhatsApp instead</a>` : ''}
        <button class="btn btn--ghost" id="mCancel">Cancel</button><button class="btn" id="mSend">Send email</button></div>
    `, (box) => {
      const apply = () => { const t = TPL[$('#mTpl', box).value]; $('#mSub', box).value = t.s; $('#mBody', box).value = t.b; };
      apply();
      $('#mTpl', box).addEventListener('change', apply);
      const wa = $('#mWa', box);
      if (wa) {
        const num = String(s.whatsapp || s.phone).replace(/\D/g, '');
        const upd = () => wa.href = `https://wa.me/${num.length === 10 ? '91' + num : num}?text=${encodeURIComponent($('#mBody', box).value)}`;
        upd(); $('#mBody', box).addEventListener('input', upd);
      }
      $('#mCancel', box).addEventListener('click', closeModal);
      $('#mSend', box).addEventListener('click', async () => {
        const btn = $('#mSend', box); btn.disabled = true; btn.textContent = 'Sending…';
        try {
          const r = await api('/api/suppliers/' + s.id + '/email', { method: 'POST', body: JSON.stringify({
            to: $('#mTo', box).value.trim(), subject: $('#mSub', box).value.trim(), body: $('#mBody', box).value }) });
          closeModal();
          toast(r.sent ? 'Email sent' : 'Saved to the supplier log (email not configured)');
        } catch (e) { $('#mMsg', box).className = 'msg err'; $('#mMsg', box).textContent = e.message; btn.disabled = false; btn.textContent = 'Send email'; }
      });
    });
  }

  // ===================== MARKETPLACE: PARTNERS =====================
  const vstBadge = (s) => {
    const map = { approved: ['st-paid', 'Approved'], pending: ['st-pending', 'Pending'],
      suspended: ['st-cancelled', 'Suspended'], rejected: ['st-cancelled', 'Rejected'] };
    const [cls, label] = map[s] || ['st-pending', s];
    return `<span class="st ${cls}">${esc(label)}</span>`;
  };

  async function viewPartners() {
    main.innerHTML = head('Partner Companies', 'Outside companies selling through your marketplace.');
    const [stats, list] = await Promise.all([api('/api/mkt/stats'), api('/api/mkt/vendors')]);
    const pending = list.filter(v => v.status === 'pending');

    main.innerHTML += `
      <div class="cards" style="margin-bottom:1rem">
        <div class="card"><span>Total partners</span><b>${stats.vendors_total}</b></div>
        <div class="card"><span>Awaiting approval</span><b>${stats.vendors_pending}</b></div>
        <div class="card"><span>Live listings</span><b>${stats.products_approved}</b></div>
        <div class="card"><span>New enquiries</span><b>${stats.enquiries_new}</b></div>
      </div>`;

    if (pending.length) {
      main.innerHTML += `<h3 style="margin:1rem 0 .6rem;color:var(--navy)">Awaiting your approval (${pending.length})</h3>
        <div class="tablewrap"><table><thead><tr>
          <th>Company</th><th>Contact</th><th>Sells</th><th>Applied</th><th>Action</th>
        </tr></thead><tbody>
        ${pending.map(v => `<tr>
          <td><strong>${esc(v.company_name)}</strong><br><small>${esc([v.city, v.state].filter(Boolean).join(', '))}${v.gst ? ' · GST ' + esc(v.gst) : ''}</small></td>
          <td>${esc(v.contact_name)}<br><small>${esc(v.phone)}${v.email ? '<br>' + esc(v.email) : ''}</small></td>
          <td><small>${esc(v.categories || '—')}</small></td>
          <td><small>${(v.created_at || '').slice(0, 10)}</small></td>
          <td style="white-space:nowrap">
            <button class="btn btn--sm" data-ap="${esc(v.id)}">Approve</button>
            <button class="btn btn--ghost btn--sm" data-rj="${esc(v.id)}">Reject</button>
            <button class="btn btn--ghost btn--sm" data-vw="${esc(v.id)}">View</button>
          </td></tr>`).join('')}
        </tbody></table></div>`;
    }

    main.innerHTML += `<h3 style="margin:1.4rem 0 .6rem;color:var(--navy)">All partners</h3>
      <div class="tablewrap"><table><thead><tr>
        <th>Company</th><th>Contact</th><th>Listings</th><th>Status</th><th>Action</th>
      </tr></thead><tbody>
      ${list.length ? list.map(v => `<tr>
        <td><strong>${esc(v.company_name)}</strong><br><small>${esc(v.sku_prefix || '')} · ${esc([v.city, v.state].filter(Boolean).join(', '))}</small></td>
        <td><small>${esc(v.contact_name)}<br>${esc(v.phone)}</small></td>
        <td><span class="pcount" data-count="${esc(v.id)}">–</span></td>
        <td>${vstBadge(v.status)}</td>
        <td style="white-space:nowrap">
          <button class="btn btn--ghost btn--sm" data-vw="${esc(v.id)}">View</button>
          ${v.status === 'approved'
            ? `<button class="btn btn--ghost btn--sm" data-sp="${esc(v.id)}">Suspend</button>`
            : `<button class="btn btn--sm" data-ap="${esc(v.id)}">Approve</button>`}
        </td></tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;color:var(--grey);padding:1.4rem">No partner companies yet. Share the link <strong>/vendor</strong> to invite them.</td></tr>'}
      </tbody></table></div>`;

    // fill listing counts
    api('/api/mkt/products').then(prods => {
      $$('.pcount').forEach(el => {
        const n = prods.filter(p => p.vendor_id === el.dataset.count);
        el.textContent = `${n.filter(p => p.status === 'approved').length} live / ${n.length}`;
      });
    }).catch(() => {});

    const setStatus = async (id, status, okMsg) => {
      try { await api(`/api/mkt/vendors/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
        toast(okMsg); viewPartners(); } catch (e) { toast(e.message); }
    };
    $$('[data-ap]').forEach(b => b.addEventListener('click', () => setStatus(b.dataset.ap, 'approved', 'Partner approved')));
    $$('[data-rj]').forEach(b => b.addEventListener('click', () => {
      if (confirm('Reject this application?')) setStatus(b.dataset.rj, 'rejected', 'Application rejected');
    }));
    $$('[data-sp]').forEach(b => b.addEventListener('click', () => {
      if (confirm('Suspend this partner? Their listings will be hidden immediately.'))
        setStatus(b.dataset.sp, 'suspended', 'Partner suspended');
    }));
    $$('[data-vw]').forEach(b => b.addEventListener('click', () => partnerDetail(b.dataset.vw)));
  }

  async function partnerDetail(id) {
    const d = await api('/api/mkt/vendors/' + id);
    const v = d.vendor;
    modal(`<h3>${esc(v.company_name)} ${vstBadge(v.status)}</h3>
      <div class="sl-cards" style="margin-bottom:.8rem">
        <div class="sl-card sl-card--new"><span class="sl-card__l">Listings</span>
          <b class="sl-card__v">${d.stats.products_live} live</b>
          <span class="sl-card__s">${d.stats.products_pending} awaiting review · ${d.stats.products} total</span></div>
        <div class="sl-card sl-card--old"><span class="sl-card__l">Enquiries</span>
          <b class="sl-card__v">${d.stats.enquiries}</b>
          <span class="sl-card__s">${d.stats.enquiries_new} new</span></div>
      </div>
      <div class="field"><label>Contact</label>
        <div style="font-size:.9rem;color:var(--navy);line-height:1.7">
          ${esc(v.contact_name)}<br>
          📞 <a href="tel:${esc(v.phone)}">${esc(v.phone)}</a>
          ${v.email ? `<br>✉ <a href="mailto:${esc(v.email)}">${esc(v.email)}</a>` : ''}
          ${v.gst ? `<br>GST: <strong>${esc(v.gst)}</strong>` : ''}
          ${v.website ? `<br>🌐 ${esc(v.website)}` : ''}
          <br>${esc([v.address, v.city, v.state, v.pincode].filter(Boolean).join(', '))}
        </div></div>
      <div class="field"><label>Sells</label><div style="font-size:.9rem">${esc(v.categories || '—')}</div></div>
      ${v.description ? `<div class="field"><label>About</label><div style="font-size:.9rem;color:var(--grey)">${esc(v.description)}</div></div>` : ''}
      <div class="field"><label>Internal notes (not shown to the partner)</label>
        <textarea id="vNotes" rows="2">${esc(v.admin_notes || '')}</textarea></div>
      <h4 style="margin:1rem 0 .5rem;color:var(--navy)">Their listings</h4>
      <div class="tablewrap"><table><thead><tr><th>SKU</th><th>Product</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>
        ${d.products.length ? d.products.map(p => `<tr>
          <td><small>${esc(p.sku)}</small></td>
          <td>${esc(p.name)}</td>
          <td>${p.price > 0 ? money(p.price) + '<small>/' + esc(p.unit) + '</small>' : '<small>On request</small>'}</td>
          <td>${vstBadge(p.status)}</td>
          <td style="white-space:nowrap">${p.status !== 'approved'
            ? `<button class="btn btn--sm" data-pap="${esc(p.id)}">Approve</button>`
            : `<button class="btn btn--ghost btn--sm" data-prj="${esc(p.id)}">Hide</button>`}</td>
        </tr>`).join('') : '<tr><td colspan="5" style="color:var(--grey);text-align:center;padding:1rem">No listings yet.</td></tr>'}
      </tbody></table></div>
      <div class="modal-actions" style="margin-top:1rem">
        <button class="btn btn--ghost" id="vSaveNotes">Save Notes</button>
        ${v.status === 'approved'
          ? `<button class="btn btn--ghost" id="vSuspend">Suspend Partner</button>`
          : `<button class="btn" id="vApprove">Approve Partner</button>`}
        <button class="btn btn--danger" id="vDelete">Delete</button>
      </div>`, (box) => {
      const reload = () => { closeModal(); viewPartners(); };
      $('#vSaveNotes', box).addEventListener('click', async () => {
        try { await api('/api/mkt/vendors/' + v.id, { method: 'PUT', body: JSON.stringify({ admin_notes: $('#vNotes', box).value }) });
          toast('Notes saved'); } catch (e) { toast(e.message); }
      });
      $('#vApprove', box)?.addEventListener('click', async () => {
        await api(`/api/mkt/vendors/${v.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'approved' }) });
        toast('Partner approved'); reload();
      });
      $('#vSuspend', box)?.addEventListener('click', async () => {
        if (!confirm('Suspend this partner? Their listings will be hidden.')) return;
        await api(`/api/mkt/vendors/${v.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'suspended' }) });
        toast('Partner suspended'); reload();
      });
      $('#vDelete', box).addEventListener('click', async () => {
        if (!confirm(`Delete ${v.company_name} and all their listings? This cannot be undone.`)) return;
        await api('/api/mkt/vendors/' + v.id, { method: 'DELETE' });
        toast('Partner deleted'); reload();
      });
      box.querySelectorAll('[data-pap]').forEach(b => b.addEventListener('click', async () => {
        await api(`/api/mkt/products/${b.dataset.pap}/status`, { method: 'PUT', body: JSON.stringify({ status: 'approved' }) });
        toast('Listing approved'); closeModal(); partnerDetail(v.id);
      }));
      box.querySelectorAll('[data-prj]').forEach(b => b.addEventListener('click', async () => {
        await api(`/api/mkt/products/${b.dataset.prj}/status`, { method: 'PUT', body: JSON.stringify({ status: 'rejected' }) });
        toast('Listing hidden'); closeModal(); partnerDetail(v.id);
      }));
    });
  }

  // ===================== MARKETPLACE: LISTINGS REVIEW =====================
  async function viewPartnerProducts() {
    main.innerHTML = head('Partner Listings', 'Review products submitted by partner companies.');
    const list = await api('/api/mkt/products');
    const pending = list.filter(p => p.status === 'pending');
    const render = (rows, title, emptyMsg) => `
      <h3 style="margin:1.2rem 0 .6rem;color:var(--navy)">${title} (${rows.length})</h3>
      <div class="tablewrap"><table><thead><tr>
        <th>Product</th><th>Partner</th><th>SKU</th><th>Price</th><th>Status</th><th>Action</th>
      </tr></thead><tbody>
      ${rows.length ? rows.map(p => `<tr>
        <td style="display:flex;align-items:center;gap:.6rem">
          ${p.images && p.images[0] ? `<img src="${esc(p.images[0])}" style="width:38px;height:38px;border-radius:6px;object-fit:cover">` : ''}
          <div><strong>${esc(p.name)}</strong><br><small>${esc(p.category || '')}</small></div></td>
        <td><small>${esc(p.vendor_name)}</small></td>
        <td><small>${esc(p.sku)}</small></td>
        <td>${p.price > 0 ? money(p.price) + '<small>/' + esc(p.unit) + '</small>' : '<small>On request</small>'}</td>
        <td>${vstBadge(p.status)}</td>
        <td style="white-space:nowrap">
          ${p.status !== 'approved' ? `<button class="btn btn--sm" data-ok="${esc(p.id)}">Approve</button>` : ''}
          ${p.status !== 'rejected' ? `<button class="btn btn--ghost btn--sm" data-no="${esc(p.id)}">Hide</button>` : ''}
        </td></tr>`).join('')
      : `<tr><td colspan="6" style="text-align:center;color:var(--grey);padding:1.2rem">${emptyMsg}</td></tr>`}
      </tbody></table></div>`;

    main.innerHTML += render(pending, 'Awaiting review', 'Nothing waiting for review.')
      + render(list.filter(p => p.status !== 'pending'), 'Reviewed', 'No reviewed listings yet.');

    $$('[data-ok]').forEach(b => b.addEventListener('click', async () => {
      await api(`/api/mkt/products/${b.dataset.ok}/status`, { method: 'PUT', body: JSON.stringify({ status: 'approved' }) });
      toast('Listing approved'); viewPartnerProducts();
    }));
    $$('[data-no]').forEach(b => b.addEventListener('click', async () => {
      await api(`/api/mkt/products/${b.dataset.no}/status`, { method: 'PUT', body: JSON.stringify({ status: 'rejected' }) });
      toast('Listing hidden'); viewPartnerProducts();
    }));
  }

  // ===================== MARKETPLACE: ENQUIRIES =====================
  async function viewEnquiries() {
    main.innerHTML = head('Marketplace Enquiries', 'Buyer enquiries sent to partner companies.');
    const list = await api('/api/mkt/enquiries');
    main.innerHTML += `<div class="tablewrap"><table><thead><tr>
      <th>Buyer</th><th>Product</th><th>Partner</th><th>Qty</th><th>When</th><th>Status</th>
    </tr></thead><tbody>
    ${list.length ? list.map(e => `<tr>
      <td><strong>${esc(e.name)}</strong>${e.company ? '<br><small>' + esc(e.company) + '</small>' : ''}
        <br><small>${esc(e.phone)}${e.email ? ' · ' + esc(e.email) : ''}</small></td>
      <td>${esc(e.product_name || '—')}${e.product_sku ? '<br><small>' + esc(e.product_sku) + '</small>' : ''}</td>
      <td><small>${esc(e.vendor_name || '—')}</small></td>
      <td>${e.quantity} ${esc(e.unit)}</td>
      <td><small>${(e.created_at || '').replace('T', ' ').slice(0, 16)}</small></td>
      <td>${vstBadge(e.status === 'new' ? 'pending' : 'approved')} <small>${esc(e.status)}</small></td>
    </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--grey);padding:1.4rem">No enquiries yet.</td></tr>'}
    </tbody></table></div>`;
  }

  // ===================== CUSTOMERS =====================
  async function viewCustomers() {
    main.innerHTML = head('Customers', 'Purchase history, notes and access control.', `<a class="btn btn--ghost" href="/api/export/customers.csv">Export CSV</a>`);
    const list = await api('/api/customers');
    main.insertAdjacentHTML('beforeend', `<div class="wrap-scroll"><table class="table"><thead><tr><th>Name</th><th>Company</th><th>Email</th><th class="num">Orders</th><th class="num">Spent</th><th>Status</th></tr></thead><tbody>
      ${list.length ? list.map(c => `<tr class="clickable" data-id="${c.id}"><td>${esc(c.name)}</td><td>${esc(c.company||'')}</td><td>${esc(c.email)}</td><td class="num">${c.order_count}</td><td class="num">${money(c.total_spent)}</td><td>${c.blocked?'<span class="st st-cancelled">Blocked</span>':'<span class="st st-delivered">Active</span>'}</td></tr>`).join('') : '<tr><td colspan="6" style="color:var(--grey)">No customers yet.</td></tr>'}
    </tbody></table></div>`);
    $$('#main tr.clickable').forEach(tr => tr.addEventListener('click', () => openCustomer(Number(tr.dataset.id))));
  }
  async function openCustomer(id) {
    const d = await api('/api/customers/' + id + '/orders'); const c = d.customer;
    modal(`
      <h3>${esc(c.name)} ${c.company?'· '+esc(c.company):''}</h3>
      <div class="kv">${esc(c.email)} · ${esc(c.phone||'')} ${c.whatsapp?'· WA '+esc(c.whatsapp):''}</div>
      <div class="kv">${esc(c.country||'')} · ${c.order_count} orders · ${money(c.total_spent)} lifetime</div>
      <div class="field" style="margin-top:.8rem"><label>Customer notes</label><textarea id="cnNotes">${esc(c.notes||'')}</textarea></div>
      <label class="toggle" style="margin:.4rem 0"><input type="checkbox" id="cnBlock" ${c.blocked?'checked':''}> Block this customer from ordering</label>
      <h4 style="color:var(--navy);margin:1rem 0 .4rem">Order history</h4>
      <div class="wrap-scroll"><table class="table"><thead><tr><th>Order</th><th>Date</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>
        ${d.orders.length ? d.orders.map(o=>`<tr><td>${esc(o.order_number)}</td><td>${date(o.created_at)}</td><td class="num">${money(o.total)}</td><td>${stBadge(o.status)}</td></tr>`).join('') : '<tr><td colspan="4" style="color:var(--grey)">No orders.</td></tr>'}
      </tbody></table></div>
      <div class="modal__actions">
        ${ME.role==='admin'?`<button class="btn btn--danger" id="cnDel">Delete</button>`:''}
        <button class="btn btn--ghost" id="cnClose">Close</button><button class="btn" id="cnSave">Save</button>
      </div>
    `, (box) => {
      $('#cnClose', box).addEventListener('click', closeModal);
      $('#cnSave', box).addEventListener('click', async () => { await api('/api/customers/'+id, { method:'PUT', body: JSON.stringify({ notes: $('#cnNotes',box).value, blocked: $('#cnBlock',box).checked?1:0 }) }); toast('Saved'); closeModal(); viewCustomers(); });
      $('#cnDel', box)?.addEventListener('click', async () => { if (!confirm('Delete this customer record?')) return; await api('/api/customers/'+id, { method:'DELETE' }); toast('Deleted'); closeModal(); viewCustomers(); });
    });
  }

  // ===================== COUPONS =====================
  async function viewCoupons() {
    main.innerHTML = head('Coupons', 'Discount codes for checkout.', `<button class="btn" id="addCoupon">+ Add Coupon</button>`);
    $('#addCoupon').addEventListener('click', () => openCoupon());
    const list = await api('/api/coupons');
    main.insertAdjacentHTML('beforeend', `<div class="wrap-scroll"><table class="table"><thead><tr><th>Code</th><th>Type</th><th class="num">Value</th><th>Expiry</th><th class="num">Used</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.length ? list.map(c=>`<tr><td><strong>${esc(c.code)}</strong></td><td>${c.type}</td><td class="num">${c.type==='percentage'?c.value+'%':money(c.value)}</td><td>${esc(c.expiry||'—')}</td><td class="num">${c.used_count}${c.usage_limit?'/'+c.usage_limit:''}</td><td>${c.active?'<span class="st st-delivered">Active</span>':'<span class="st st-cancelled">Off</span>'}</td>
      <td><button class="btn btn--ghost btn--sm" data-edit="${c.id}">Edit</button> <button class="btn btn--danger btn--sm" data-del="${c.id}">Del</button></td></tr>`).join('') : '<tr><td colspan="7" style="color:var(--grey)">No coupons.</td></tr>'}
    </tbody></table></div>`);
    $$('[data-edit]').forEach(b => b.addEventListener('click', () => openCoupon(list.find(c => c.id == b.dataset.edit))));
    $$('[data-del]').forEach(b => b.addEventListener('click', async () => { if(!confirm('Delete coupon?'))return; await api('/api/coupons/'+b.dataset.del,{method:'DELETE'}); toast('Deleted'); viewCoupons(); }));
  }
  function openCoupon(c) {
    const e = !!c;
    modal(`<h3>${e?'Edit':'Add'} Coupon</h3>
      <div class="grid2"><div class="field"><label>Code</label><input id="cpCode" value="${e?esc(c.code):''}"></div>
      <div class="field"><label>Type</label><select id="cpType"><option value="percentage" ${e&&c.type==='percentage'?'selected':''}>Percentage</option><option value="fixed" ${e&&c.type==='fixed'?'selected':''}>Fixed amount</option></select></div></div>
      <div class="grid2"><div class="field"><label>Value</label><input id="cpVal" type="number" value="${e?c.value:0}"></div>
      <div class="field"><label>Usage limit (0 = ∞)</label><input id="cpLimit" type="number" value="${e?c.usage_limit:0}"></div></div>
      <div class="grid2"><div class="field"><label>Expiry date</label><input id="cpExp" type="date" value="${e?esc(c.expiry):''}"></div>
      <div class="field"><label>Active</label><select id="cpActive"><option value="1" ${!e||c.active?'selected':''}>Active</option><option value="0" ${e&&!c.active?'selected':''}>Disabled</option></select></div></div>
      <p class="msg" id="cpMsg"></p>
      <div class="modal__actions"><button class="btn btn--ghost" id="cpCancel">Cancel</button><button class="btn" id="cpSave">Save</button></div>
    `, (box) => {
      $('#cpCancel', box).addEventListener('click', closeModal);
      $('#cpSave', box).addEventListener('click', async () => {
        const p = { code:$('#cpCode',box).value.trim(), type:$('#cpType',box).value, value:$('#cpVal',box).value, usage_limit:$('#cpLimit',box).value, expiry:$('#cpExp',box).value, active:Number($('#cpActive',box).value) };
        if (!p.code) { $('#cpMsg',box).className='msg err'; $('#cpMsg',box).textContent='Code required'; return; }
        try { if (e) await api('/api/coupons/'+c.id,{method:'PUT',body:JSON.stringify(p)}); else await api('/api/coupons',{method:'POST',body:JSON.stringify(p)}); closeModal(); toast('Saved'); viewCoupons(); } catch(err){ $('#cpMsg',box).className='msg err'; $('#cpMsg',box).textContent=err.message; }
      });
    });
  }

  // ===================== SHIPPING =====================
  async function viewShipping() {
    main.innerHTML = head('Shipping', 'Methods, couriers, charges and delivery times.', `<button class="btn" id="addShip">+ Add Method</button>`);
    $('#addShip').addEventListener('click', () => openShip());
    const list = await api('/api/shipping');
    main.insertAdjacentHTML('beforeend', `<div class="wrap-scroll"><table class="table"><thead><tr><th>Method</th><th>Courier</th><th>Areas</th><th>ETA</th><th class="num">Charge</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(s=>`<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.courier||'')}</td><td>${esc(s.areas||'')}</td><td>${esc(s.eta||'')}</td><td class="num">${s.charge?money(s.charge):'Quote'}</td><td>${s.active?'<span class="st st-delivered">Active</span>':'<span class="st st-cancelled">Off</span>'}</td>
      <td><button class="btn btn--ghost btn--sm" data-edit="${s.id}">Edit</button> <button class="btn btn--danger btn--sm" data-del="${s.id}">Del</button></td></tr>`).join('')}
    </tbody></table></div>`);
    $$('[data-edit]').forEach(b => b.addEventListener('click', () => openShip(list.find(s => s.id == b.dataset.edit))));
    $$('[data-del]').forEach(b => b.addEventListener('click', async () => { if(!confirm('Delete method?'))return; await api('/api/shipping/'+b.dataset.del,{method:'DELETE'}); toast('Deleted'); viewShipping(); }));
  }
  function openShip(s) {
    const e = !!s;
    modal(`<h3>${e?'Edit':'Add'} Shipping Method</h3>
      <div class="field"><label>Name</label><input id="spName" value="${e?esc(s.name):''}"></div>
      <div class="grid2"><div class="field"><label>Courier company</label><input id="spCourier" value="${e?esc(s.courier):''}"></div><div class="field"><label>Charge (0 = quote)</label><input id="spCharge" type="number" value="${e?s.charge:0}"></div></div>
      <div class="grid2"><div class="field"><label>Delivery areas</label><input id="spAreas" value="${e?esc(s.areas):''}"></div><div class="field"><label>Estimated delivery</label><input id="spEta" value="${e?esc(s.eta):''}"></div></div>
      <div class="field"><label>Active</label><select id="spActive"><option value="1" ${!e||s.active?'selected':''}>Active</option><option value="0" ${e&&!s.active?'selected':''}>Off</option></select></div>
      <p class="msg" id="spMsg"></p>
      <div class="modal__actions"><button class="btn btn--ghost" id="spCancel">Cancel</button><button class="btn" id="spSave">Save</button></div>
    `, (box) => {
      $('#spCancel', box).addEventListener('click', closeModal);
      $('#spSave', box).addEventListener('click', async () => {
        const p = { name:$('#spName',box).value.trim(), courier:$('#spCourier',box).value, charge:$('#spCharge',box).value, areas:$('#spAreas',box).value, eta:$('#spEta',box).value, active:Number($('#spActive',box).value) };
        if (!p.name) { $('#spMsg',box).className='msg err'; $('#spMsg',box).textContent='Name required'; return; }
        if (e) await api('/api/shipping/'+s.id,{method:'PUT',body:JSON.stringify(p)}); else await api('/api/shipping',{method:'POST',body:JSON.stringify(p)}); closeModal(); toast('Saved'); viewShipping();
      });
    });
  }

  // ===================== PAYMENTS =====================
  async function viewPayments() {
    main.innerHTML = head('Payment Methods', 'Control which methods customers see at checkout.', `<button class="btn" id="addPay">+ Add Method</button>`);
    $('#addPay').addEventListener('click', () => openPay());
    const list = await api('/api/payments');
    main.insertAdjacentHTML('beforeend', `<div class="wrap-scroll"><table class="table"><thead><tr><th>Method</th><th>Instructions</th><th>Enabled</th><th></th></tr></thead><tbody>
      ${list.map(p=>`<tr><td><strong>${esc(p.name)}</strong></td><td class="hint-inline">${esc(p.instructions||'')}</td>
      <td><label class="toggle"><input type="checkbox" data-toggle="${p.id}" ${p.enabled?'checked':''}> ${p.enabled?'On':'Off'}</label></td>
      <td><button class="btn btn--ghost btn--sm" data-edit="${p.id}">Edit</button> <button class="btn btn--danger btn--sm" data-del="${p.id}">Del</button></td></tr>`).join('')}
    </tbody></table></div><p class="hint-inline" style="margin-top:.6rem">Stripe and PayPal appear here ready to enable once API keys are added in a future update.</p>`);
    $$('[data-toggle]').forEach(cb => cb.addEventListener('change', async () => { await api('/api/payments/'+cb.dataset.toggle,{method:'PUT',body:JSON.stringify({enabled:cb.checked?1:0})}); toast('Updated'); viewPayments(); }));
    $$('[data-edit]').forEach(b => b.addEventListener('click', () => openPay(list.find(p => p.id == b.dataset.edit))));
    $$('[data-del]').forEach(b => b.addEventListener('click', async () => { if(!confirm('Delete method?'))return; await api('/api/payments/'+b.dataset.del,{method:'DELETE'}); toast('Deleted'); viewPayments(); }));
  }
  function openPay(p) {
    const e = !!p;
    modal(`<h3>${e?'Edit':'Add'} Payment Method</h3>
      <div class="field"><label>Name</label><input id="pyName" value="${e?esc(p.name):''}"></div>
      <div class="field"><label>Instructions shown to customer</label><textarea id="pyInstr">${e?esc(p.instructions):''}</textarea></div>
      <div class="field"><label>Enabled</label><select id="pyEnabled"><option value="1" ${!e||p.enabled?'selected':''}>Enabled</option><option value="0" ${e&&!p.enabled?'selected':''}>Disabled</option></select></div>
      <p class="msg" id="pyMsg"></p>
      <div class="modal__actions"><button class="btn btn--ghost" id="pyCancel">Cancel</button><button class="btn" id="pySave">Save</button></div>
    `, (box) => {
      $('#pyCancel', box).addEventListener('click', closeModal);
      $('#pySave', box).addEventListener('click', async () => {
        const d = { name:$('#pyName',box).value.trim(), instructions:$('#pyInstr',box).value, enabled:Number($('#pyEnabled',box).value) };
        if (!d.name) { $('#pyMsg',box).className='msg err'; $('#pyMsg',box).textContent='Name required'; return; }
        if (e) await api('/api/payments/'+p.id,{method:'PUT',body:JSON.stringify(d)}); else await api('/api/payments',{method:'POST',body:JSON.stringify(d)}); closeModal(); toast('Saved'); viewPayments();
      });
    });
  }

  // ===================== NET PARTS MANAGER =====================
  async function viewNetParts() {
    main.innerHTML = head('Net Parts Manager', 'Up to 4 net types — each with its own diagram and numbered components.', `<button class="btn" id="npAdd">+ Add Component</button>`);
    let [settings, allHotspots, products, types] = await Promise.all([api('/api/settings'), api('/api/hotspots'), api('/api/products'), api('/api/nettypes')]);
    CATS = await api('/api/categories');
    if (!types.length) types = [{ id: 1, name: 'Default', diagram: settings.netparts_diagram || '' }];
    let activeType = types[0].id;
    const productName = (id) => { const p = products.find(p => p.id === id); return p ? p.name : '—'; };
    const curType = () => types.find(t => t.id == activeType) || types[0];
    const typeHotspots = () => allHotspots.filter(h => h.type_id == activeType || (h.type_id == null && activeType == types[0].id));
    main.insertAdjacentHTML('beforeend', `
      <div class="card">
        <h3 style="color:var(--navy);margin-bottom:.5rem">Net types <span class="hint-inline">(pick one to edit its diagram &amp; components; rename below)</span></h3>
        <div class="np-typetabs" id="npTypeTabs"></div>
        <div style="display:flex;gap:.5rem;align-items:flex-end;margin-top:.7rem">
          <div class="field" style="flex:1;max-width:320px;margin:0"><label>Rename selected type</label><input id="npTypeName"></div>
          <button class="btn btn--ghost btn--sm" id="npTypeSave">Save name</button>
        </div>
      </div>
      <div class="two-col">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
            <h3 style="color:var(--navy)">Diagram — <span id="npActiveName"></span></h3>
            <div><input type="file" id="npFile" accept="image/*" class="hidden"><button class="btn btn--ghost btn--sm" id="npUpload">Upload diagram</button></div>
          </div>
          <div class="np-preview" id="npPreview"></div>
          <p class="hint-inline" style="margin-top:.5rem">Drag any pin to position it — it saves when you release.</p>
        </div>
        <div class="card">
          <h3 style="color:var(--navy);margin-bottom:.6rem">Components — <span id="npActiveName2"></span></h3>
          <div class="wrap-scroll"><table class="table"><thead><tr><th>#</th><th>Name</th><th>Linked product</th><th>On</th><th></th></tr></thead><tbody id="npRows"></tbody></table></div>
        </div>
      </div>`);

    function drawTabs() {
      $('#npTypeTabs').innerHTML = types.map(t => `<button class="np-tab${t.id == activeType ? ' on' : ''}" data-tid="${t.id}">${esc(t.name)}</button>`).join('');
      $$('#npTypeTabs .np-tab').forEach(b => b.addEventListener('click', () => { activeType = Number(b.dataset.tid); syncType(); }));
      $('#npTypeName').value = curType().name;
      $('#npActiveName').textContent = curType().name;
      $('#npActiveName2').textContent = curType().name;
    }
    function syncType() { drawTabs(); drawPreview(); drawRows(); }
    function drawPreview() {
      const prev = $('#npPreview');
      const diagram = curType().diagram;
      prev.innerHTML = diagram ? `<img src="${esc(diagram)}" alt="diagram">` : `<div class="np-ph">No diagram for “${esc(curType().name)}” yet — click “Upload diagram”.</div>`;
      typeHotspots().forEach(h => {
        const pin = document.createElement('div');
        pin.className = 'np-pin'; pin.style.left = h.x + '%'; pin.style.top = h.y + '%';
        pin.style.background = h.color || '#0071c5'; pin.textContent = h.number; pin.dataset.id = h.id;
        prev.appendChild(pin); makeDraggable(pin, h, prev);
      });
    }
    function makeDraggable(pin, h, prev) {
      let dragging = false;
      pin.addEventListener('pointerdown', (e) => { dragging = true; pin.setPointerCapture(e.pointerId); e.preventDefault(); });
      pin.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const r = prev.getBoundingClientRect();
        h.x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
        h.y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
        pin.style.left = h.x + '%'; pin.style.top = h.y + '%';
      });
      pin.addEventListener('pointerup', async () => {
        if (!dragging) return; dragging = false;
        await api('/api/hotspots/' + h.id, { method: 'PUT', body: JSON.stringify({ x: Math.round(h.x * 10) / 10, y: Math.round(h.y * 10) / 10 }) });
        toast('Position saved');
      });
    }
    function drawRows() {
      const rows = typeHotspots();
      $('#npRows').innerHTML = rows.map(h => `<tr>
        <td><span class="prod-thumb" style="width:24px;height:24px;background:${esc(h.color||'#0071c5')};color:#fff;font-size:.7rem;font-weight:700">${h.number}</span></td>
        <td>${esc(h.name)}</td><td>${esc(productName(h.product_id))}</td>
        <td><label class="toggle"><input type="checkbox" data-en="${h.id}" ${h.enabled?'checked':''}></label></td>
        <td><button class="btn btn--ghost btn--sm" data-edit="${h.id}">Edit</button> <button class="btn btn--danger btn--sm" data-del="${h.id}">Del</button></td>
      </tr>`).join('') || '<tr><td colspan="5" style="color:var(--grey)">No components for this type yet.</td></tr>';
      $$('#npRows [data-en]').forEach(cb => cb.addEventListener('change', async () => { await api('/api/hotspots/' + cb.dataset.en, { method: 'PUT', body: JSON.stringify({ enabled: cb.checked ? 1 : 0 }) }); toast('Updated'); }));
      $$('#npRows [data-edit]').forEach(b => b.addEventListener('click', () => editHotspot(allHotspots.find(h => h.id == b.dataset.edit))));
      $$('#npRows [data-del]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Delete component?')) return; await api('/api/hotspots/' + b.dataset.del, { method: 'DELETE' }); toast('Deleted'); refresh(); }));
    }
    async function refresh() { allHotspots = await api('/api/hotspots'); drawPreview(); drawRows(); }
    function editHotspot(h) {
      const editing = !!h;
      const it = (editing && h.item) || {};
      let itImg = it.image || '';
      const opts = products.map(p => `<option value="${p.id}" ${editing && h.product_id==p.id?'selected':''}>${esc(p.name)}</option>`).join('');
      const catOpts = CATS.map(c => `<option value="${c.id}" ${it.category==c.id?'selected':''}>${esc(c.name)}</option>`).join('');
      const cfg0 = specConfig(it.category || '');
      modal(`<h3>${editing?'Edit':'Add'} Component</h3>
        <div class="grid2"><div class="field"><label>Number</label><input id="hN" type="number" value="${editing?h.number:typeHotspots().length+1}"></div>
        <div class="field"><label>Part name</label><input id="hName" value="${editing?esc(h.name):''}"></div></div>
        <div class="field"><label>Net type</label><select id="hType">${types.map(t=>`<option value="${t.id}" ${(editing? h.type_id==t.id : t.id==activeType)?'selected':''}>${esc(t.name)}</option>`).join('')}</select></div>
        <div class="grid2"><div class="field"><label>Pin colour</label><input id="hColor" type="color" value="${editing?esc(h.color||'#0071c5'):'#0071c5'}"></div>
        <div class="field"><label>Enabled</label><select id="hEn"><option value="1" ${!editing||h.enabled?'selected':''}>Enabled</option><option value="0" ${editing&&!h.enabled?'selected':''}>Disabled</option></select></div></div>

        <div class="field"><label>Linked product <span class="chip-hint">(pick a product for the easiest setup — its image, price, sizes &amp; stock are used automatically)</span></label><select id="hProd"><option value="">— none, type item manually below —</option>${opts}</select></div>
        <p class="hint-inline" id="hProdNote" hidden style="color:#1a7f37;margin:.1rem 0 .3rem">✓ Using this product's details. The manual fields below are hidden and not needed.</p>

        <div id="hItemBlock">
        <hr style="border:none;border-top:1px solid var(--line);margin:.4rem 0">
        <p class="hint-inline" style="margin:.1rem 0 .5rem"><b>Item details</b> — only needed if <b>no product</b> is linked above. Pick a category to load the right options, then tap the ones to offer.</p>
        <div class="field"><label>Category <span class="chip-hint">(loads the matching size / mesh / colour options)</span></label>
          <select id="iCat"><option value="">— general —</option>${catOpts}</select></div>
        <div class="grid2"><div class="field"><label>Item name <span class="chip-hint">(blank = use part name)</span></label><input id="iName" value="${esc(it.name||'')}"></div>
        <div class="field"><label>Price (₹)</label><input id="iPrice" type="number" step="0.01" value="${it.price!==''&&it.price!=null?it.price:''}"></div></div>
        <div class="grid2"><div class="field"><label>Unit</label><select id="iUnit"><option value="kg" ${(it.unit||cfg0.unit)!=='pcs'?'selected':''}>per kg</option><option value="pcs" ${(it.unit||cfg0.unit)==='pcs'?'selected':''}>per piece (pcs)</option></select></div>
        <div class="field"><label>Stock</label><select id="iStock"><option value="1" ${it.in_stock!==0?'selected':''}>In stock</option><option value="0" ${it.in_stock===0?'selected':''}>Out of stock</option></select></div></div>
        <div class="field" id="iSizeWrap"><label id="iSizeLabel">${cfg0.label} <span class="chip-hint">${cfg0.hint}</span></label>${chipGroup('iSize', cfg0.sizes, it.size)}</div>
        <div class="field" id="iMeshWrap" ${cfg0.mesh?'':'hidden'}><label>Mesh size <span class="chip-hint">(select one or more)</span></label>${chipGroup('iMesh', SPEC_MESH, it.mesh_size)}</div>
        <div class="field" id="iMdWrap" ${cfg0.md?'':'hidden'}><label>MD (mesh depth) <span class="chip-hint">(select one or more)</span></label>${chipGroup('iMd', SPEC_MD, it.md_size)}</div>
        <div class="field" id="iColorWrap" ${cfg0.color?'':'hidden'}><label>Colour <span class="chip-hint">(select one or more)</span></label>${chipGroup('iColor', cfg0.colors, it.color)}</div>
        <div class="field" id="iMatWrap" ${cfg0.mat?'':'hidden'}><label>Material <span class="chip-hint">(select one or more)</span></label>${chipGroup('iMat', SPEC_MATERIALS, it.material)}</div>
        <div class="field"><label>Description</label><input id="iDesc" value="${esc(it.description||'')}"></div>
        <div class="field"><label>Features <span class="chip-hint">(shown in the component panel — separate with commas)</span></label><input id="iFeatures" value="${esc(it.features||'')}" placeholder="e.g. UV resistant, High tensile strength, Knotless"></div>
        <div class="field"><label>Uses / Applications <span class="chip-hint">(comma separated)</span></label><input id="iUses" value="${esc(it.uses||'')}" placeholder="e.g. Purse seine, Trawl nets, Aquaculture"></div>
        <div class="field"><label>Item image</label><div style="display:flex;gap:.5rem;align-items:center">
          <span class="prod-thumb" id="iThumb" style="width:44px;height:44px;background:${itImg?`url('${esc(itImg)}') center/cover`:'var(--bg-soft)'}"></span>
          <button type="button" class="btn btn--ghost btn--sm" id="iUpBtn">Upload image</button>
          <input type="file" id="iFile" accept="image/*" hidden></div></div>
        </div>

        ${editing?`<p class="hint-inline">Position: ${Math.round(h.x)}%, ${Math.round(h.y)}% — drag the pin on the diagram to move it.</p>`:'<p class="hint-inline">After saving, drag its pin on the diagram to position it.</p>'}
        <p class="msg" id="hMsg"></p>
        <div class="modal__actions"><button class="btn btn--ghost" id="hCancel">Cancel</button><button class="btn" id="hSave">Save</button></div>
      `, (box) => {
        $('#hCancel', box).addEventListener('click', closeModal);
        // chip toggle
        box.addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) c.classList.toggle('on'); });
        // when a product is linked, hide the manual item block (it's ignored) and auto-fill the name
        const hProd = $('#hProd', box), hName = $('#hName', box);
        const syncProd = (fill) => {
          const pid = hProd.value;
          $('#hItemBlock', box).hidden = !!pid;
          $('#hProdNote', box).hidden = !pid;
          if (fill && pid && !hName.value.trim()) {
            const p = products.find(x => x.id == pid); if (p) hName.value = p.name;
          }
        };
        hProd.addEventListener('change', () => syncProd(true));
        syncProd(false);
        // category drives which option chips appear
        $('#iCat', box).addEventListener('change', () => {
          const cfg = specConfig($('#iCat', box).value);
          const keep = { size: chipValue(box,'iSize'), mesh: chipValue(box,'iMesh'), md: chipValue(box,'iMd'), color: chipValue(box,'iColor'), mat: chipValue(box,'iMat') };
          $('#iSizeLabel', box).innerHTML = `${cfg.label} <span class="chip-hint">${cfg.hint}</span>`;
          $('#iSize', box).innerHTML = chipButtons(cfg.sizes, keep.size);
          $('#iMesh', box).innerHTML = chipButtons(SPEC_MESH, keep.mesh);
          $('#iMd', box).innerHTML = chipButtons(SPEC_MD, keep.md);
          $('#iColor', box).innerHTML = chipButtons(cfg.colors, keep.color);
          $('#iMat', box).innerHTML = chipButtons(SPEC_MATERIALS, keep.mat);
          $('#iMeshWrap', box).hidden = !cfg.mesh;
          $('#iMdWrap', box).hidden = !cfg.md;
          $('#iColorWrap', box).hidden = !cfg.color;
          $('#iMatWrap', box).hidden = !cfg.mat;
          $('#iUnit', box).value = cfg.unit;
        });
        $('#iUpBtn', box).addEventListener('click', () => $('#iFile', box).click());
        $('#iFile', box).addEventListener('change', async () => {
          if (!$('#iFile', box).files.length) return;
          $('#iUpBtn', box).textContent = 'Uploading…';
          const fd = new FormData(); fd.append('images', $('#iFile', box).files[0]);
          try { const r = await api('/api/upload', { method: 'POST', body: fd }); itImg = r.urls[0];
            $('#iThumb', box).style.background = `url('${itImg}') center/cover`; } catch(e){}
          $('#iUpBtn', box).textContent = 'Change image';
        });
        $('#hSave', box).addEventListener('click', async () => {
          const cfg = specConfig($('#iCat', box).value);
          const item = { name: $('#iName',box).value.trim(), description: $('#iDesc',box).value.trim(),
            category: $('#iCat',box).value || '',
            features: $('#iFeatures',box).value.trim(), uses: $('#iUses',box).value.trim(),
            size: chipValue(box,'iSize'), mesh_size: cfg.mesh?chipValue(box,'iMesh'):'', md_size: cfg.md?chipValue(box,'iMd'):'',
            color: cfg.color?chipValue(box,'iColor'):'', material: cfg.mat?chipValue(box,'iMat'):'',
            price: $('#iPrice',box).value, unit: $('#iUnit',box).value, image: itImg,
            in_stock: Number($('#iStock',box).value) };
          const d = { number: $('#hN', box).value, name: $('#hName', box).value.trim(), product_id: $('#hProd', box).value || null, type_id: $('#hType', box).value || null, color: $('#hColor', box).value, enabled: Number($('#hEn', box).value), item };
          if (!d.name) { $('#hMsg', box).className = 'msg err'; $('#hMsg', box).textContent = 'Name required'; return; }
          if (editing) await api('/api/hotspots/' + h.id, { method: 'PUT', body: JSON.stringify(d) });
          else await api('/api/hotspots', { method: 'POST', body: JSON.stringify({ ...d, x: 50, y: 50 }) });
          closeModal(); toast('Saved'); refresh();
        });
      });
    }
    $('#npAdd').addEventListener('click', () => editHotspot(null));
    $('#npTypeSave').addEventListener('click', async () => {
      const v = $('#npTypeName').value.trim(); if (v) curType().name = v;
      await api('/api/nettypes', { method: 'PUT', body: JSON.stringify(types) });
      toast('Saved'); drawTabs();
    });
    $('#npUpload').addEventListener('click', () => $('#npFile').click());
    $('#npFile').addEventListener('change', async () => {
      const fd = new FormData(); [...$('#npFile').files].forEach(f => fd.append('images', f));
      $('#npUpload').textContent = 'Uploading…';
      const r = await api('/api/upload', { method: 'POST', body: fd });
      curType().diagram = (r.urls && r.urls[0]) || '';
      await api('/api/nettypes', { method: 'PUT', body: JSON.stringify(types) });
      // keep the legacy single-diagram setting in sync with the first type
      if (activeType == types[0].id) await api('/api/settings', { method: 'PUT', body: JSON.stringify({ netparts_diagram: curType().diagram }) });
      $('#npUpload').textContent = 'Upload diagram'; toast('Diagram updated'); drawPreview();
    });
    syncType();
  }

  // ===================== CATEGORIES =====================
  async function viewCategories() {
    main.innerHTML = head('Categories', 'Group products for the storefront.');
    const cats = await api('/api/categories');
    main.insertAdjacentHTML('beforeend', `<div class="card"><div class="field" style="display:flex;gap:.6rem;align-items:flex-end"><div style="flex:1"><label>New category</label><input id="newCat"></div><button class="btn" id="addCat">Add</button></div></div>
      <div class="card">${cats.map(c=>`<div class="row-line" data-id="${c.id}"><input class="cat-name" value="${esc(c.name)}" style="border:1px solid var(--line);border-radius:8px;padding:.4rem .6rem;max-width:280px"><div style="display:flex;gap:.4rem"><button class="btn btn--ghost btn--sm" data-save="${c.id}">Save</button><button class="btn btn--danger btn--sm" data-del="${c.id}">Delete</button></div></div>`).join('')||'<p style="color:var(--grey)">None yet.</p>'}</div>`);
    $('#addCat').addEventListener('click', async () => { const name=$('#newCat').value.trim(); if(!name)return; try{ await api('/api/categories',{method:'POST',body:JSON.stringify({name})}); toast('Added'); viewCategories(); }catch(e){toast(e.message);} });
    $$('[data-save]').forEach(b => b.addEventListener('click', async () => { const row=b.closest('.row-line'); await api('/api/categories/'+b.dataset.save,{method:'PUT',body:JSON.stringify({name:$('.cat-name',row).value.trim()})}); toast('Saved'); }));
    $$('[data-del]').forEach(b => b.addEventListener('click', async () => { if(!confirm('Delete category?'))return; await api('/api/categories/'+b.dataset.del,{method:'DELETE'}); toast('Deleted'); viewCategories(); }));
  }

  // ===================== SETTINGS VIEWS =====================
  const getS = () => api('/api/settings');
  async function saveS(obj, el) { try { await api('/api/settings', { method:'PUT', body: JSON.stringify(obj) }); SETTINGS = { ...SETTINGS, ...obj }; toast('Saved'); } catch(e){ if(el){el.className='msg err';el.textContent=e.message;} } }
  const fr = (label, id, val, type='text') => `<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${esc(val)}"></div>`;

  async function viewHero() {
    main.innerHTML = head('Hero Banner', 'The rotating gallery of images & video at the top of your storefront.');
    const s = await getS();
    main.insertAdjacentHTML('beforeend', `<div class="card">${fr('Headline','hero_title',s.hero_title)}${fr('Subtitle','hero_subtitle',s.hero_subtitle)}
      <div class="field"><label>Hero gallery <span class="chip-hint">(images & video — they auto-rotate with a fade animation)</span></label>
        <div class="drop" id="heroDrop">Click to upload images or video</div>
        <input type="file" id="heroFile" accept="image/*,video/*" multiple class="hidden">
        <div style="display:flex;gap:.5rem;margin:.5rem 0">
          <input id="heroVidUrl" placeholder="…or paste a video URL (YouTube or .mp4)" style="flex:1">
          <button type="button" class="btn btn--ghost btn--sm" id="heroVidAdd">Add video</button></div>
        <div class="img-grid" id="heroMediaGrid"></div></div>
      <div class="grid2">${fr('Slide interval (seconds)','hero_interval',s.hero_interval||6,'number')}</div>
      <p class="msg" id="heroMsg"></p><button class="btn" id="heroSave">Save Hero</button></div>`);
    // load existing media list (fallback to legacy single hero_image)
    let media = [];
    try { media = JSON.parse(s.hero_media || '[]'); } catch { media = []; }
    if (!media.length && s.hero_image) media = [{ type:'image', url:s.hero_image }];
    const draw = () => $('#heroMediaGrid').innerHTML = media.map((m,i)=>`<div class="img-tile">
      ${m.type==='video' ? (/(youtube|youtu\.be)/.test(m.url)?`<div style="width:100%;height:90px;display:flex;align-items:center;justify-content:center;background:#0a2540;color:#fff;font-size:.7rem">▶ YouTube</div>`:`<video src="${esc(m.url)}" muted></video>`) : `<img src="${esc(m.url)}">`}
      <span class="tile-tag">${m.type==='video'?'Video':'Image'}</span>
      <button data-rm="${i}">×</button></div>`).join('') || '<p class="hint-inline">No media yet — upload images or add a video.</p>';
    draw();
    $('#heroMediaGrid').addEventListener('click', e => { const b=e.target.closest('[data-rm]'); if(b){ media.splice(Number(b.dataset.rm),1); draw(); } });
    $('#heroDrop').addEventListener('click', () => $('#heroFile').click());
    $('#heroFile').addEventListener('change', async () => {
      const files=[...$('#heroFile').files]; if(!files.length) return;
      $('#heroDrop').textContent='Uploading…';
      try {
        const fd=new FormData(); files.forEach(f=>fd.append('media',f));
        const r=await api('/api/upload-media',{method:'POST',body:fd});
        (r.files||[]).forEach(f=>media.push(f)); draw();
      } catch(err) {
        // fallback: server not restarted yet → use the old image-only route
        const imgs=files.filter(f=>/^image\//.test(f.type));
        if (imgs.length) {
          try { const fd2=new FormData(); imgs.forEach(f=>fd2.append('images',f));
            const r2=await api('/api/upload',{method:'POST',body:fd2});
            (r2.urls||[]).forEach(u=>media.push({type:'image',url:u})); draw();
            if (imgs.length<files.length) toast('Images added. For video uploads, restart the server once.');
          } catch(e2){ toast(e2.message); }
        } else toast('Video upload needs a one-time server restart (Ctrl+C, then npm start).');
      }
      $('#heroDrop').textContent='Click to upload images or video'; $('#heroFile').value='';
    });
    $('#heroVidAdd').addEventListener('click', () => { const u=$('#heroVidUrl').value.trim(); if(!u) return; media.push({type:'video',url:u}); $('#heroVidUrl').value=''; draw(); });
    $('#heroSave').addEventListener('click', () => saveS({
      hero_title:$('#hero_title').value, hero_subtitle:$('#hero_subtitle').value,
      hero_media: JSON.stringify(media), hero_image:(media.find(m=>m.type==='image')||{}).url||'',
      hero_interval: $('#hero_interval').value }, $('#heroMsg')));
  }
  async function viewContact() {
    main.innerHTML = head('Contact & Store', 'Contact details, currency and social links.');
    const s = await getS();
    main.insertAdjacentHTML('beforeend', `<div class="card">${fr('Company name','company_name',s.company_name)}
      <div class="grid2">${fr('Currency (e.g. USD)','currency',s.currency)}${fr('Default tax rate %','default_tax_rate',s.default_tax_rate,'number')}</div>
      <div class="field"><label>When a customer orders more than you have in stock</label>
        <select id="stock_policy">
          <option value="backorder" ${(s.stock_policy||'backorder')==='backorder'?'selected':''}>Accept the order and flag it (recommended — made-to-order work)</option>
          <option value="block" ${s.stock_policy==='block'?'selected':''}>Refuse — customer must reduce the quantity to what's in stock</option>
        </select>
        <span class="hint-inline">Customers always see "only N left" either way. Accepting keeps made-to-order sales; refusing suits items you only resell.</span>
      </div>
      <div class="grid2">${fr('WhatsApp','contact_whatsapp',s.contact_whatsapp)}${fr('Email','contact_email',s.contact_email)}${fr('Phone','contact_phone',s.contact_phone)}${fr('Address','contact_address',s.contact_address)}</div>
      <div class="grid2">${fr('Business hours','contact_hours',s.contact_hours)}${fr('Google Map embed URL','contact_map',s.contact_map)}</div>
      <h3 style="color:var(--navy);margin:.5rem 0">Social links</h3>
      <div class="grid2">${fr('Facebook','social_facebook',s.social_facebook)}${fr('Instagram','social_instagram',s.social_instagram)}${fr('LinkedIn','social_linkedin',s.social_linkedin)}${fr('YouTube','social_youtube',s.social_youtube)}</div>
      <p class="msg" id="cMsg"></p><button class="btn" id="cSave" style="margin-top:.8rem">Save</button></div>
      <div class="card">
        <h3 style="color:var(--navy);margin-bottom:.5rem">About & Testimonials</h3>
        ${fr('About heading','about_title',s.about_title)}
        <div class="field"><label>About text</label><textarea id="about_body">${esc(s.about_body||'')}</textarea></div>
        <div class="grid2">${fr('Stat 1 (value | label)','about_stat1',s.about_stat1)}${fr('Stat 2','about_stat2',s.about_stat2)}${fr('Stat 3','about_stat3',s.about_stat3)}${fr('Stat 4','about_stat4',s.about_stat4)}</div>
        <div class="field"><label>Testimonials (JSON: [{"name","company","text"}])</label><textarea id="testimonials" style="min-height:120px">${esc(s.testimonials||'[]')}</textarea></div>
        <p class="msg" id="aMsg"></p><button class="btn" id="aSave" style="margin-top:.6rem">Save About</button>
      </div>`);
    $('#cSave').addEventListener('click', () => { const keys=['company_name','currency','default_tax_rate','stock_policy','contact_whatsapp','contact_email','contact_phone','contact_address','contact_hours','contact_map','social_facebook','social_instagram','social_linkedin','social_youtube']; saveS(Object.fromEntries(keys.map(k=>[k,$('#'+k).value])), $('#cMsg')); });
    $('#aSave').addEventListener('click', () => {
      const t = $('#testimonials').value.trim();
      try { JSON.parse(t || '[]'); } catch { $('#aMsg').className='msg err'; $('#aMsg').textContent='Testimonials must be valid JSON.'; return; }
      saveS({ about_title:$('#about_title').value, about_body:$('#about_body').value, about_stat1:$('#about_stat1').value, about_stat2:$('#about_stat2').value, about_stat3:$('#about_stat3').value, about_stat4:$('#about_stat4').value, testimonials:t }, $('#aMsg'));
    });
  }
  async function viewSeo() {
    main.innerHTML = head('SEO & Analytics', 'Search engine details, Google Analytics, and the storefront FAQ.');
    const s = await getS();
    main.insertAdjacentHTML('beforeend', `<div class="card">${fr('Page title','seo_title',s.seo_title)}<div class="field"><label>Meta description</label><textarea id="seo_description">${esc(s.seo_description)}</textarea></div>${fr('Keywords','seo_keywords',s.seo_keywords)}
      ${fr('Google Analytics ID','ga_id',s.ga_id||'')}<p class="hint-inline" style="margin-top:-.4rem">Paste your GA4 Measurement ID (looks like <code>G-XXXXXXXXXX</code>) to enable analytics. Leave blank for none.</p>
      <p class="msg" id="sMsg"></p><button class="btn" id="sSave" style="margin-top:.6rem">Save SEO</button></div>
      <div class="card">
        <h3 style="color:var(--navy);margin-bottom:.4rem">FAQ <span class="hint-inline">(shown on the storefront — JSON list of {"q","a"})</span></h3>
        <div class="field"><textarea id="faq" style="min-height:180px;font-family:monospace;font-size:.85rem">${esc(s.faq||'[]')}</textarea></div>
        <p class="msg" id="fMsg"></p><button class="btn" id="fSave">Save FAQ</button>
      </div>`);
    $('#sSave').addEventListener('click', () => saveS({ seo_title:$('#seo_title').value, seo_description:$('#seo_description').value, seo_keywords:$('#seo_keywords').value, ga_id:$('#ga_id').value.trim() }, $('#sMsg')));
    $('#fSave').addEventListener('click', () => {
      try { JSON.parse($('#faq').value || '[]'); } catch { $('#fMsg').className='msg err'; $('#fMsg').textContent='Invalid JSON — check the format.'; return; }
      saveS({ faq: $('#faq').value }, $('#fMsg'));
    });
  }
  async function viewStaff() {
    main.innerHTML = head('Staff & Roles', 'Admins have full access; staff cannot manage staff or delete customers.', `<button class="btn" id="addStaff">+ Add User</button>`);
    const list = await api('/api/users');
    main.insertAdjacentHTML('beforeend', `<div class="wrap-scroll"><table class="table"><thead><tr><th>Username</th><th>Name</th><th>Role</th><th></th></tr></thead><tbody>
      ${list.map(u=>`<tr><td><strong>${esc(u.username)}</strong></td><td>${esc(u.name||'')}</td><td>${esc(u.role)}</td><td>${u.id!==undefined?`<button class="btn btn--danger btn--sm" data-del="${u.id}">Delete</button>`:''}</td></tr>`).join('')}
    </tbody></table></div>`);
    $('#addStaff').addEventListener('click', () => modal(`<h3>Add User</h3>
      <div class="grid2"><div class="field"><label>Username</label><input id="uUser"></div><div class="field"><label>Name</label><input id="uName"></div></div>
      <div class="grid2"><div class="field"><label>Password</label><input id="uPass" type="password"></div><div class="field"><label>Role</label><select id="uRole"><option value="staff">Staff</option><option value="admin">Admin</option></select></div></div>
      <p class="msg" id="uMsg"></p><div class="modal__actions"><button class="btn btn--ghost" id="uCancel">Cancel</button><button class="btn" id="uSave">Create</button></div>`,
      (box) => { $('#uCancel',box).addEventListener('click', closeModal); $('#uSave',box).addEventListener('click', async () => {
        try { await api('/api/users',{method:'POST',body:JSON.stringify({username:$('#uUser',box).value.trim(),name:$('#uName',box).value.trim(),password:$('#uPass',box).value,role:$('#uRole',box).value})}); closeModal(); toast('User created'); viewStaff(); }
        catch(e){ $('#uMsg',box).className='msg err'; $('#uMsg',box).textContent=e.message; } }); }));
    $$('[data-del]').forEach(b => b.addEventListener('click', async () => { if(!confirm('Delete user?'))return; try{ await api('/api/users/'+b.dataset.del,{method:'DELETE'}); toast('Deleted'); viewStaff(); }catch(e){toast(e.message);} }));
  }
  async function viewAudit() {
    main.innerHTML = head('Audit Log', 'Recent admin and staff activity.');
    const rows = await api('/api/audit');
    main.insertAdjacentHTML('beforeend', `<div class="wrap-scroll"><table class="table"><thead><tr><th>When</th><th>User</th><th>Action</th></tr></thead><tbody>
      ${rows.length ? rows.map(a => `<tr><td>${date(a.ts)}</td><td>${esc(a.actor)}</td><td>${esc(a.action)}</td></tr>`).join('') : '<tr><td colspan="3" style="color:var(--grey)">No activity yet.</td></tr>'}
    </tbody></table></div>`);
  }

  async function viewAccount() {
    main.innerHTML = head('Account', 'Change your password.');
    main.insertAdjacentHTML('beforeend', `<div class="card" style="max-width:420px"><div class="field"><label>Current password</label><input id="pwCur" type="password"></div><div class="field"><label>New password</label><input id="pwNew" type="password"></div><p class="msg" id="pwMsg"></p><button class="btn" id="pwSave" style="margin-top:.6rem">Update Password</button></div>`);
    $('#pwSave').addEventListener('click', async () => { const m=$('#pwMsg'); try{ await api('/api/auth/password',{method:'POST',body:JSON.stringify({current:$('#pwCur').value,next:$('#pwNew').value})}); m.className='msg ok'; m.textContent='Password updated.'; $('#pwCur').value=''; $('#pwNew').value=''; }catch(e){ m.className='msg err'; m.textContent=e.message; } });
  }

  // ---- modal plumbing ----
  function modal(html, onMount, boxClass) {
    const wrap = document.createElement('div'); wrap.className='modal';
    wrap.innerHTML = `<div class="modal__box ${boxClass||''}">${html}</div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    if (onMount) onMount(wrap.querySelector('.modal__box'));
    modal._cur = wrap;
  }
  function closeModal() { if (modal._cur) { modal._cur.remove(); modal._cur = null; } document.querySelectorAll('.modal').forEach(m => m.remove()); }

  // settle animation on any dropdown change (delegated — covers re-rendered views)
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || el.tagName !== 'SELECT') return;
    el.classList.remove('just-picked'); void el.offsetWidth; el.classList.add('just-picked');
    setTimeout(() => el.classList.remove('just-picked'), 320);
  }, true);

  checkAuth();
})();
