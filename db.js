/**
 * Zero-dependency JSON-file data store for the B2B commerce platform.
 * No native modules — runs anywhere Node runs. Persists to data/app.json.
 */
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const firebase = require('./firebase');   // optional cloud mirror (no-ops if not configured)

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'app.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; } };
let _mirrorTimer = null;
/* Cloud mirroring starts PAUSED and is switched on by server.js only after it has
   decided whether to restore from the cloud. Without this, a blank instance
   (Cloud Run's disk is empty on every cold start) would seed demo data and push
   it over the real backup 1.5s later — destroying live data. */
let _mirrorPaused = true;
const persist = () => {
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  // debounced live backup to Firestore when Firebase is configured
  if (firebase.firebaseEnabled() && !_mirrorPaused) {
    clearTimeout(_mirrorTimer);
    _mirrorTimer = setTimeout(() => firebase.saveState(state), 1500);
  }
};

let state = load() || {};
const COLLECTIONS = ['users', 'categories', 'products', 'orders', 'customers', 'coupons',
  'shipping_methods', 'payment_methods', 'notifications', 'hotspots', 'audit',
  'purchases', 'movements', 'suppliers', 'supplier_mail'];
for (const k of COLLECTIONS) {
  if (!Array.isArray(state[k])) state[k] = [];
}
state.settings = state.settings || {};
state.seq = state.seq || {};
const nextId = (c) => (state.seq[c] = (state.seq[c] || 0) + 1);
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// ---------------------------------------------------------------- seed
if (state.users.length === 0) {
  state.users.push({ id: nextId('users'), username: 'admin', role: 'admin', name: 'Administrator',
    password_hash: bcrypt.hashSync('admin123', 10) });
  console.log('[seed] Default admin -> username: admin  password: admin123');
}
if (state.categories.length === 0) {
  ['Nets', 'Ropes', 'Float', 'Sinker', 'Accessories'].forEach((name, i) =>
    state.categories.push({ id: nextId('categories'), name, sort_order: i }));
}
// Ensure the standard categories always exist (adds any missing ones without removing existing)
['Nets', 'Ropes', 'Float', 'Sinker', 'Accessories'].forEach((name) => {
  if (!state.categories.some(c => c.name.toLowerCase() === name.toLowerCase()))
    state.categories.push({ id: nextId('categories'), name, sort_order: state.categories.length });
});
if (state.products.length === 0) {
  const catId = (n) => (state.categories.find(c => c.name === n) || {}).id || null;
  //            name, category, description, price/kg, unit, material, stock(kg), lowAt, MOQ
  const seed = [
    ['Purse Seine Fishing Nets', 'Nets', 'High-tenacity nylon and HDPE purse seines engineered for large-scale pelagic operations. Deep hangings, reinforced selvedges, and precision-balanced float-to-lead ratios.', 320, 'kg', 'HDPE / Nylon', 2500, 200, 50],
    ['Gill Nets', 'Nets', 'Monofilament and multifilament gill nets in a full range of mesh sizes. Low-visibility twines and consistent knotting for dependable catch rates.', 260, 'kg', 'Monofilament', 3200, 250, 50],
    ['Trawl Nets', 'Nets', 'Bottom and midwater trawls built from abrasion-resistant braided twine. Optimised panel geometry for reduced drag and greater fuel efficiency.', 290, 'kg', 'Braided PE', 1800, 150, 50],
    ['Fish Farm Nets', 'Nets', 'Multilayer aquaculture cage and predator netting. UV-stabilised, antifouling-treated, and load-rated for open-ocean sites.', 340, 'kg', 'UV-stabilised PET', 1500, 120, 50],
    ['Fishing Ropes', 'Ropes', 'PP, PE, nylon and polysteel ropes in every diameter. High breaking strength, low elongation, excellent seawater and UV resistance.', 180, 'kg', 'Polysteel', 5000, 400, 25],
    ['Marine Floats', 'Float', 'EVA and PVC apple floats and plastic types for purse seine and gill nets. Consistent buoyancy, sold per piece.', 25, 'pcs', 'EVA / Plastic', 8000, 500, 50],
    ['Lead Sinkers', 'Sinker', 'Precision lead and alloy sinkers by weight for balanced net trim. Sold per piece (approx. 13 pieces per yard of net).', 90, 'pcs', 'Lead / Alloy', 6000, 300, 100],
    ['Marine Accessories', 'Accessories', 'Snap hooks, swivels, thimbles, shackles, netting needles and repair twines. The complete rigging and repair kit.', 4, 'pcs', 'Stainless / Brass', 6000, 250, 100],
  ];
  seed.forEach(([name, cat, desc, price, unit, material, stock, low, moq], i) => {
    state.products.push({
      id: nextId('products'), name, slug: slugify(name), description: desc,
      category_id: catId(cat), brand: 'Shalom',
      sku: 'SF-' + String(1001 + i), barcode: '', images: [],
      specs: { size: '', mesh_size: '', material, color: '' },
      units: ['kg', 'Meter', 'pcs', 'Roll', 'Net'], default_unit: unit,
      price, wholesale_price: Math.round(price * 0.85), discount_price: 0,
      currency: 'INR', tax_rate: 0,
      stock_quantity: stock, reserved_stock: 0, low_stock_threshold: low, min_order: moq,
      warehouse_location: 'Main Warehouse',
      sort_order: i, published: 1, created_at: new Date().toISOString(),
    });
  });
}
if (state.shipping_methods.length === 0) {
  state.shipping_methods.push(
    { id: nextId('shipping_methods'), name: 'Sea Freight (FCL/LCL)', courier: 'Global Container Lines', charge: 0, areas: 'Worldwide', eta: '20–40 days', active: 1, sort_order: 0 },
    { id: nextId('shipping_methods'), name: 'Air Freight', courier: 'Cargo Partners', charge: 0, areas: 'Worldwide', eta: '5–10 days', active: 1, sort_order: 1 },
    { id: nextId('shipping_methods'), name: 'Local Courier', courier: 'Regional Express', charge: 25, areas: 'Domestic', eta: '2–5 days', active: 1, sort_order: 2 },
  );
}
if (state.payment_methods.length === 0) {
  state.payment_methods.push(
    { id: nextId('payment_methods'), key: 'bank_transfer', name: 'Bank Transfer', instructions: 'Bank details will be sent with your payment request after order review.', enabled: 1, sort_order: 0 },
    { id: nextId('payment_methods'), key: 'wire_tt', name: 'Wire Transfer (TT)', instructions: 'Telegraphic transfer. SWIFT details provided on the proforma invoice.', enabled: 1, sort_order: 1 },
    { id: nextId('payment_methods'), key: 'lc', name: 'Letter of Credit (LC)', instructions: 'Irrevocable LC at sight. Terms agreed during order confirmation.', enabled: 1, sort_order: 2 },
    { id: nextId('payment_methods'), key: 'cod', name: 'Cash on Delivery', instructions: 'Available for selected domestic deliveries only.', enabled: 0, sort_order: 3 },
    { id: nextId('payment_methods'), key: 'stripe', name: 'Credit / Debit Card (Stripe)', instructions: 'Online card payment. Enable once Stripe keys are configured.', enabled: 0, sort_order: 4 },
    { id: nextId('payment_methods'), key: 'paypal', name: 'PayPal', instructions: 'Online PayPal payment. Enable once PayPal is configured.', enabled: 0, sort_order: 5 },
  );
}
// Seed 15 net-part hotspots (positions are % of the diagram; admin can fine-tune).
if (state.hotspots.length === 0) {
  const parts = [
    ['Float', 6], ['Float Rope', 5], ['Head Rope', 5], ['Changala Valla', 1], ['Mella Vala Charth', 1],
    ['Fishing Net', 1], ['Thread', 7], ['Safety Valla', 1], ['Madavall Charth', 1], ['Safety Valla', 1],
    ['Changala Valla', 1], ['Rope', 5], ['Changala Valla', 1], ['Sinker Rope', 5], ['Sinkers', 6],
  ];
  parts.forEach(([name, pid], i) => state.hotspots.push({
    id: nextId('hotspots'), number: i + 1, name,
    x: 79, y: Math.round(6 + (i * 88) / 14),   // spread down the right-hand number column
    color: '#0071c5', product_id: pid, enabled: 1, sort_order: i,
  }));
}

const defaults = {
  hero_title: 'Premium Purse Seine Fishing Nets',
  hero_subtitle: 'Manufacturer & Exporter of Purse Seine Nets, Gill Nets, Fishing Ropes, Floats, Sinkers, and Marine Equipment.',
  hero_media: '[]', hero_interval: 6,
  netparts_title: 'Explore Every Net Component',
  netparts_desc: 'Click any numbered part in the diagram to instantly view specifications, available sizes, materials, pricing, and stock.',
  netparts_button: 'Explore All Parts',
  netparts_diagram: '',
  about_title: 'A trusted global manufacturer',
  about_body: 'For fleets worldwide, we manufacture purse seine nets, gill nets, trawls and marine gear to exact specifications. In-house production, rigorous QC, and export experience across every major fishing region.',
  about_stat1: '25+ years|Manufacturing experience',
  about_stat2: '40+ countries|Export markets served',
  about_stat3: 'Custom|Made-to-order specifications',
  about_stat4: 'ISO-grade|Quality control',
  testimonials: '[{"name":"Captain M. Haugen","company":"North Atlantic Fleet","text":"The purse seines held up through a brutal season. Clean sets, fast delivery, exactly to spec."},{"name":"R. Fernandes","company":"Coastal Fisheries Ltd","text":"Custom mesh and hangings delivered on time. Our go-to net supplier for three years."}]',
  hero_image: '',
  company_name: 'Shalom Marine Nets',
  currency: 'INR', default_tax_rate: 18,
  contact_whatsapp: '+1 555 000 0000', contact_email: 'sales@marinenets.example',
  contact_phone: '+1 555 000 0000', contact_address: '123 Harbour Road, Coastal City, Country',
  contact_hours: 'Mon – Sat, 9:00 AM – 6:00 PM',
  contact_map: 'https://www.google.com/maps?q=harbour&output=embed',
  social_facebook: '', social_instagram: '', social_linkedin: '', social_youtube: '',
  seo_title: 'Shalom Marine Nets | Purse Seine Fishing Nets & Marine Equipment',
  seo_description: 'B2B manufacturer of purse seine fishing nets, gill nets, trawl nets, fish farm nets, ropes, floats and marine accessories. Order online worldwide.',
  seo_keywords: 'purse seine nets, fishing nets, gill nets, trawl nets, fish farm nets, marine equipment, wholesale',
  ga_id: '',
  faq: JSON.stringify([
    { q: 'What is the minimum order quantity?', a: 'MOQ varies by product and is shown on each item. For bulk and export orders we offer flexible quantities — send us your requirement for a quote.' },
    { q: 'Do you ship worldwide?', a: 'Yes. We export globally via sea freight (FCL/LCL), air freight and local courier. Lead times and Incoterms are confirmed per order.' },
    { q: 'Can nets be made to custom specifications?', a: 'Absolutely. Mesh size, twine, depth, hangings and colours can all be made to order. Share your specs and we will manufacture to match.' },
    { q: 'How does payment work?', a: 'Checkout places a quote-order with no online payment. We confirm pricing, stock and shipping, then send a payment request (Bank Transfer, Wire/TT, Letter of Credit and more). Prices shown include 18% GST.' },
    { q: 'Do you provide samples?', a: 'Yes, samples are available on request for most products. Contact us with the item and specification you need.' },
  ]),
};
for (const [k, v] of Object.entries(defaults)) if (state.settings[k] === undefined) state.settings[k] = v;

// Net types for the Explore section — up to 4, each with its own diagram + hotspots.
(function ensureNetTypes() {
  let types = [];
  try { types = JSON.parse(state.settings.netparts_types || '[]'); } catch { types = []; }
  if (!Array.isArray(types) || !types.length) {
    const names = ['Purse Seine Net', 'Gill Net', 'Trawl Net', 'Fish Farm Net'];
    types = names.map((name, i) => ({ id: nextId('nettypes'), name, diagram: i === 0 ? (state.settings.netparts_diagram || '') : '' }));
    state.settings.netparts_types = JSON.stringify(types);
    // assign all existing hotspots to the first type
    const firstId = types[0].id;
    state.hotspots.forEach(h => { if (h.type_id === undefined || h.type_id === null) h.type_id = firstId; });
  }
})();
persist();

// ---------------------------------------------------------------- helpers
const catName = (id) => { const c = state.categories.find(c => c.id === id); return c ? c.name : null; };
const bySort = (a, b) => (a.sort_order - b.sort_order) || (a.id - b.id);
function effectivePrice(p) { return p.discount_price && p.discount_price > 0 ? p.discount_price : (p.price || 0); }
function stockStatus(p) {
  const avail = (p.stock_quantity || 0) - (p.reserved_stock || 0);
  if (avail <= 0) return 'out_of_stock';
  if (avail <= (p.low_stock_threshold || 0)) return 'low_stock';
  return 'in_stock';
}
/* ---- stock movement ledger ----------------------------------------------
 * Every stock change is recorded so you can always explain the current number.
 * type: purchase | sale | reserve | release | adjustment | return
 */
function logMovement(d) {
  state.movements.unshift({
    id: nextId('movements'), ts: new Date().toISOString(),
    product_id: d.product_id, product_name: d.product_name || '',
    variant_id: d.variant_id || '', variant_label: d.variant_label || '',
    type: d.type, qty: num(d.qty), before: num(d.before), after: num(d.after),
    unit_cost: d.unit_cost != null ? num(d.unit_cost) : '',
    reason: d.reason || '', ref: d.ref || '', actor: d.actor || '',
  });
  state.movements = state.movements.slice(0, 3000);
}
// ---- product variants (same product, different type: size/mesh/MD/colour) ----
function cleanVariant(v) {
  return {
    id: v.id || ('v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    sku: v.sku || '',
    size: v.size || '', mesh_size: v.mesh_size || '', md_size: v.md_size || '',
    color: v.color || '', material: v.material || '',
    price: num(v.price), cost_price: num(v.cost_price),
    stock_quantity: num(v.stock_quantity), reserved_stock: num(v.reserved_stock),
    low_stock_threshold: num(v.low_stock_threshold),
    active: v.active === 0 || v.active === false ? 0 : 1,
  };
}
function cleanSupplier(d) {
  const str = (v) => String(v == null ? '' : v).trim();
  return {
    id: d.id, created_at: d.created_at,
    name: str(d.name), company: str(d.company), contact_person: str(d.contact_person),
    phone: str(d.phone), whatsapp: str(d.whatsapp), email: str(d.email),
    address: str(d.address), city: str(d.city), state_region: str(d.state_region),
    country: str(d.country) || 'India', gst: str(d.gst),
    payment_terms: str(d.payment_terms), lead_time: str(d.lead_time),
    supplies: str(d.supplies), notes: str(d.notes),
    rating: Math.min(5, Math.max(0, num(d.rating))),
    active: d.active === 0 || d.active === false ? 0 : 1,
  };
}
function variantLabel(v) {
  return [v.size, v.mesh_size, v.md_size, v.color, v.material].filter(Boolean).join(' · ') || 'Standard';
}
/* Replay every purchase for a product (or one variant) oldest-first to rebuild
   the weighted-average cost. Used after a purchase is edited or deleted, so the
   cost and the "avg cost after" column both stay correct. */
function replayCost(p, v) {
  const t = v || p;
  const recs = state.purchases
    .filter(x => x.product_id === p.id && (v ? x.variant_id === v.id : !x.variant_id))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id);
  if (!recs.length) return;                       // nothing left to derive cost from
  let stock = num(recs[0].prev_stock), cost = num(recs[0].prev_cost);
  for (const r of recs) {
    const q = num(r.quantity), ns = stock + q;
    r.prev_stock = stock; r.prev_cost = Math.round(cost * 100) / 100;
    cost = ns > 0 ? (stock * cost + q * num(r.unit_price)) / ns : num(r.unit_price);
    cost = Math.round(cost * 100) / 100;
    r.new_avg_cost = cost;
    stock = ns;
  }
  t.cost_price = cost;
}
/* Auto SKU per variant, e.g. "Thangu Valla" 3 ply/38mm/600 MD/Blue → THAVAL-3PLY-38MM-600MD-BLU */
function autoSku(productName, v) {
  const base = String(productName || '').split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/gi, '')).filter(Boolean)
    .map(w => w.slice(0, 3)).join('').slice(0, 6).toUpperCase() || 'ITEM';
  const part = (s, n) => String(s || '').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, n || 5);
  return [base, part(v.size), part(v.mesh_size), part(v.md_size), part(v.color, 3)].filter(Boolean).join('-');
}
function decorate(p) {
  const variants = (p.variants || []).map(v => {
    const avail = (v.stock_quantity || 0) - (v.reserved_stock || 0);
    return { ...v, label: variantLabel(v), available_stock: avail,
      stock_status: avail <= 0 ? 'out_of_stock' : (avail <= (v.low_stock_threshold || 0) ? 'low_stock' : 'in_stock') };
  });
  const hasV = variants.length > 0;
  const active = variants.filter(v => v.active);
  const avail = hasV ? active.reduce((s, v) => s + v.available_stock, 0)
                     : (p.stock_quantity || 0) - (p.reserved_stock || 0);
  const prices = active.filter(v => v.price > 0).map(v => v.price);
  return { ...p, variants, category_name: catName(p.category_id),
    effective_price: hasV && prices.length ? Math.min(...prices) : effectivePrice(p),
    price_from: prices.length ? Math.min(...prices) : 0,
    price_to: prices.length ? Math.max(...prices) : 0,
    available_stock: avail,
    stock_status: hasV
      ? (avail <= 0 ? 'out_of_stock' : (avail <= (p.low_stock_threshold || 0) ? 'low_stock' : 'in_stock'))
      : stockStatus(p) };
}
function orderNumber() {
  const n = (state.orders.length + 1).toString().padStart(4, '0');
  return `MN-${new Date().getFullYear()}-${n}`;
}

// ---------------------------------------------------------------- store API
const store = {
  raw: () => state,

  // users / auth
  findUser: (u) => state.users.find(x => x.username === u),
  getUser: (id) => state.users.find(x => x.id === id),
  allUsers: () => state.users.map(({ password_hash, ...u }) => u),
  addUser({ username, password, role, name }) {
    if (state.users.some(u => u.username === username)) throw new Error('exists');
    const u = { id: nextId('users'), username, role: role === 'staff' ? 'staff' : 'admin',
      name: name || username, password_hash: bcrypt.hashSync(password, 10) };
    state.users.push(u); persist(); return u;
  },
  deleteUser(id) { state.users = state.users.filter(u => u.id !== Number(id)); persist(); },
  setPassword(id, hash) { const u = store.getUser(id); if (u) { u.password_hash = hash; persist(); } },

  // products
  allProducts: () => state.products.slice().sort(bySort).map(decorate),
  publishedProducts: () => state.products.filter(p => p.published).sort(bySort).map(decorate),
  getProduct: (id) => state.products.find(p => p.id === Number(id)),
  getProductDecorated: (id) => { const p = store.getProduct(id); return p ? decorate(p) : null; },
  addProduct(d) {
    const maxOrder = state.products.reduce((m, p) => Math.max(m, p.sort_order), -1);
    const p = {
      id: nextId('products'), name: d.name, slug: slugify(d.name), description: d.description || '',
      category_id: d.category_id ? Number(d.category_id) : null, brand: d.brand || '',
      sku: d.sku || '', barcode: d.barcode || '', images: Array.isArray(d.images) ? d.images : [],
      specs: d.specs || { size: '', mesh_size: '', material: '', color: '' },
      variants: Array.isArray(d.variants) ? d.variants.map(v => { const c = cleanVariant(v); if (!c.sku) c.sku = autoSku(d.name, c); return c; }) : [],
      supplier_id: num(d.supplier_id),
      supplier: d.supplier || '', supplier_contact: d.supplier_contact || '', lead_time: d.lead_time || '',
      units: d.units && d.units.length ? d.units : ['kg', 'Meter', 'pcs', 'Roll', 'Net'],
      default_unit: d.default_unit || 'kg',
      price: num(d.price), cost_price: num(d.cost_price), wholesale_price: num(d.wholesale_price), discount_price: num(d.discount_price),
      currency: d.currency || state.settings.currency || 'INR', tax_rate: num(d.tax_rate),
      stock_quantity: num(d.stock_quantity), reserved_stock: 0,
      low_stock_threshold: num(d.low_stock_threshold), min_order: num(d.min_order),
      warehouse_location: d.warehouse_location || '',
      sort_order: maxOrder + 1, published: d.published === 0 ? 0 : 1, created_at: new Date().toISOString(),
    };
    state.products.push(p); persist(); return p;
  },
  updateProduct(id, d) {
    const p = store.getProduct(id); if (!p) return null;
    const f = ['name', 'description', 'brand', 'sku', 'barcode', 'warehouse_location', 'default_unit', 'currency',
               'supplier', 'supplier_contact', 'lead_time'];
    f.forEach(k => { if (d[k] !== undefined) p[k] = d[k]; });
    if (d.supplier_id !== undefined) p.supplier_id = num(d.supplier_id);
    if (d.name !== undefined) p.slug = slugify(d.name);
    if (d.category_id !== undefined) p.category_id = d.category_id ? Number(d.category_id) : null;
    if (Array.isArray(d.images)) p.images = d.images;
    if (Array.isArray(d.units)) p.units = d.units;
    if (Array.isArray(d.variants)) p.variants = d.variants.map(v => {
      const c = cleanVariant(v); if (!c.sku) c.sku = autoSku(d.name || p.name, c); return c; });
    if (d.specs) p.specs = { ...p.specs, ...d.specs };
    ['price', 'cost_price', 'wholesale_price', 'discount_price', 'tax_rate', 'stock_quantity', 'low_stock_threshold', 'min_order']
      .forEach(k => { if (d[k] !== undefined) p[k] = num(d[k]); });
    if (d.published !== undefined) p.published = d.published ? 1 : 0;
    persist(); return p;
  },
  deleteProduct(id) { state.products = state.products.filter(p => p.id !== Number(id)); persist(); },
  reorderProducts(order) { order.forEach((id, i) => { const p = store.getProduct(id); if (p) p.sort_order = i; }); persist(); },
  adjustStock(id, deltaStock, deltaReserved, variantId) {
    const p = store.getProduct(id); if (!p) return;
    const v = variantId && (p.variants || []).find(x => x.id === variantId);
    const t = v || p;                                   // adjust the variant when given
    t.stock_quantity = Math.max(0, (t.stock_quantity || 0) + (deltaStock || 0));
    t.reserved_stock = Math.max(0, (t.reserved_stock || 0) + (deltaReserved || 0));
    persist();
  },
  // Record a purchase batch and update the weighted-average cost + stock.
  restockProduct(id, d) {
    const p = store.getProduct(id); if (!p) return null;
    const qty = num(d.quantity), price = num(d.price);
    if (qty <= 0) return { error: 'Quantity must be greater than 0' };
    // restock a specific variant when given, otherwise the product itself
    const v = d.variant_id && (p.variants || []).find(x => x.id === d.variant_id);
    const t = v || p;
    const oldStock = t.stock_quantity || 0, oldCost = t.cost_price || 0;
    const newStock = oldStock + qty;
    const newCost = newStock > 0 ? (oldStock * oldCost + qty * price) / newStock : price;
    t.stock_quantity = newStock;
    t.cost_price = Math.round(newCost * 100) / 100;
    const rec = { id: nextId('purchases'), product_id: p.id, product_name: p.name,
      variant_id: v ? v.id : '', variant_label: v ? variantLabel(v) : '',
      quantity: qty, unit_price: price, total: Math.round(qty * price * 100) / 100,
      prev_cost: oldCost, prev_stock: oldStock, new_avg_cost: t.cost_price,
      date: d.date || new Date().toISOString().slice(0, 10), note: d.note || '',
      actor: d.actor || '', ts: new Date().toISOString() };
    state.purchases.unshift(rec);
    logMovement({ product_id: p.id, product_name: p.name, variant_id: v ? v.id : '',
      variant_label: v ? variantLabel(v) : '', type: 'purchase', qty: qty,
      before: oldStock, after: newStock, unit_cost: price,
      reason: d.note || 'Purchase', actor: d.actor });
    persist();
    return { product: decorate(p), purchase: rec };
  },
  productPurchases: (id) => state.purchases.filter(x => x.product_id === Number(id)),
  allPurchases: () => state.purchases.slice(),

  /* Break current stock into the batches it came from, oldest first, and work
     out how much of each batch is left (FIFO — oldest stock sells first).
     Gives a real "new stock vs old stock" picture instead of one blended number. */
  stockLayers(id, variantId) {
    const p = store.getProduct(id); if (!p) return null;
    const v = variantId ? (p.variants || []).find(x => x.id === variantId) : null;
    const t = v || p;
    const recs = state.purchases
      .filter(x => x.product_id === Number(id) && (variantId ? x.variant_id === variantId : !x.variant_id))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id);

    const layers = [];
    // whatever was on hand before the first recorded purchase
    const open = recs.length ? num(recs[0].prev_stock) : 0;
    if (open > 0) layers.push({ id: 'opening', date: recs[0].date, qty: open,
      unit_cost: num(recs[0].prev_cost), note: 'Stock held before this purchase', opening: true });
    recs.forEach(r => layers.push({ id: r.id, date: r.date, qty: num(r.quantity),
      unit_cost: num(r.unit_price), note: r.note || '', opening: false }));

    const received = layers.reduce((s, l) => s + l.qty, 0);
    const onHand = num(t.stock_quantity);
    let consumed = Math.max(0, received - onHand);
    layers.forEach(l => {                       // FIFO: oldest batch is used up first
      const take = Math.min(l.qty, consumed);
      l.used = Math.round(take * 100) / 100;
      l.remaining = Math.round((l.qty - take) * 100) / 100;
      consumed -= take;
    });
    const day = d => { const t2 = new Date(d).getTime(); return isNaN(t2) ? null : Math.floor((Date.now() - t2) / 864e5); };
    layers.forEach(l => l.age_days = day(l.date));

    const live = layers.filter(l => l.remaining > 0);
    const newest = live.length ? live[live.length - 1] : null;
    const older = live.slice(0, -1);
    const oldQty = older.reduce((s, l) => s + l.remaining, 0);
    const oldVal = older.reduce((s, l) => s + l.remaining * l.unit_cost, 0);

    return {
      product_id: p.id, name: p.name, variant_id: variantId || '',
      label: v ? variantLabel(v) : '', unit: p.default_unit || '',
      on_hand: onHand, reserved: num(t.reserved_stock),
      available: Math.max(0, onHand - num(t.reserved_stock)),
      avg_cost: num(t.cost_price), received,
      // stock that exists but came from adjustments rather than a recorded purchase
      untracked: Math.max(0, Math.round((onHand - received) * 100) / 100),
      new_stock: newest ? { qty: newest.remaining, unit_cost: newest.unit_cost, date: newest.date,
        age_days: newest.age_days, note: newest.note, opening: newest.opening } : null,
      old_stock: { qty: Math.round(oldQty * 100) / 100, value: Math.round(oldVal * 100) / 100,
        avg_cost: oldQty > 0 ? Math.round(oldVal / oldQty * 100) / 100 : 0,
        batches: older.length, oldest_date: older.length ? older[0].date : '',
        oldest_age: older.length ? older[0].age_days : null },
      layers,
    };
  },

  /* Live availability for a set of cart lines — the single source of truth for
     "can this be sold right now". Available = on hand − already reserved by
     other unfulfilled orders, so two customers can't be sold the same stock. */
  checkStock(items) {
    const rows = (items || []).map(it => {
      const qty = Math.max(0, num(it.quantity));
      const p = store.getProduct(it.product_id);
      const base = { product_id: it.product_id, variant_id: it.variant_id || '',
        name: (p && p.name) || it.name || 'Item', label: '', requested: qty,
        available: 0, unit: (p && p.default_unit) || '', ok: false, reason: 'unavailable' };
      if (!p || p.active === 0) return base;
      const d = decorate(p);
      let avail, label = '';
      if (it.variant_id) {
        const v = (d.variants || []).find(x => x.id === it.variant_id);
        if (!v || v.active === 0) return base;
        avail = num(v.available_stock); label = v.label || '';
      } else {
        avail = num(d.available_stock);
      }
      avail = Math.max(0, avail);
      return { ...base, label, available: avail,
        ok: qty <= avail,
        reason: avail <= 0 ? 'out' : (qty > avail ? 'partial' : '') };
    });
    return { ok: rows.every(r => r.ok), rows, issues: rows.filter(r => !r.ok) };
  },

  /* Edit a past purchase. Corrects stock by the difference and replays the
     whole purchase chain so the weighted-average cost stays truthful.
     d: { quantity, price, date, note, actor } */
  updatePurchase(pid, d) {
    const rec = state.purchases.find(x => x.id === Number(pid));
    if (!rec) return { error: 'Purchase not found' };
    const p = store.getProduct(rec.product_id);
    if (!p) return { error: 'Product no longer exists' };
    const v = rec.variant_id ? (p.variants || []).find(x => x.id === rec.variant_id) : null;
    const t = v || p;
    const qty = num(d.quantity), price = num(d.price);
    if (qty <= 0) return { error: 'Quantity must be greater than 0' };

    const dq = qty - num(rec.quantity);
    const before = t.stock_quantity || 0;
    t.stock_quantity = Math.max(0, before + dq);

    rec.quantity = qty;
    rec.unit_price = price;
    rec.total = Math.round(qty * price * 100) / 100;
    if (d.date) rec.date = d.date;
    if (d.note != null) rec.note = d.note;
    rec.edited_by = d.actor || '';
    rec.edited_ts = new Date().toISOString();

    replayCost(p, v);
    if (dq !== 0) logMovement({ product_id: p.id, product_name: p.name,
      variant_id: v ? v.id : '', variant_label: v ? variantLabel(v) : '',
      type: 'adjustment', qty: dq, before, after: t.stock_quantity,
      reason: `Purchase #${rec.id} edited`, actor: d.actor });
    persist();
    return { product: decorate(p), purchase: rec };
  },

  /* Remove a purchase entirely: pulls its quantity back out of stock and
     recomputes the average cost from the purchases that remain. */
  deletePurchase(pid, actor) {
    const i = state.purchases.findIndex(x => x.id === Number(pid));
    if (i < 0) return { error: 'Purchase not found' };
    const rec = state.purchases[i];
    const p = store.getProduct(rec.product_id);
    if (!p) { state.purchases.splice(i, 1); persist(); return { ok: true }; }
    const v = rec.variant_id ? (p.variants || []).find(x => x.id === rec.variant_id) : null;
    const t = v || p;
    const before = t.stock_quantity || 0;
    t.stock_quantity = Math.max(0, before - num(rec.quantity));
    state.purchases.splice(i, 1);

    replayCost(p, v);
    logMovement({ product_id: p.id, product_name: p.name,
      variant_id: v ? v.id : '', variant_label: v ? variantLabel(v) : '',
      type: 'adjustment', qty: -num(rec.quantity), before, after: t.stock_quantity,
      reason: `Purchase #${rec.id} deleted`, actor });
    persist();
    return { ok: true, product: decorate(p) };
  },

  /* Set stock to a counted/corrected value and record WHY (modern stock-take).
     d: { variant_id, quantity (new on-hand), reason, note, actor } */
  adjustStockTo(id, d) {
    const p = store.getProduct(id); if (!p) return null;
    const v = d.variant_id && (p.variants || []).find(x => x.id === d.variant_id);
    const t = v || p;
    const before = t.stock_quantity || 0;
    const after = Math.max(0, num(d.quantity));
    if (after === before) return { product: decorate(p), unchanged: true };
    t.stock_quantity = after;
    logMovement({ product_id: p.id, product_name: p.name, variant_id: v ? v.id : '',
      variant_label: v ? variantLabel(v) : '', type: 'adjustment', qty: after - before,
      before, after, reason: [d.reason, d.note].filter(Boolean).join(' — '), actor: d.actor });
    persist();
    return { product: decorate(p) };
  },
  allMovements: (limit) => state.movements.slice(0, limit || 200),
  productMovements: (id, variantId) => state.movements.filter(m =>
    m.product_id === Number(id) && (!variantId || m.variant_id === variantId)),
  /* Flat list of every stock-keeping line (product or variant) — used for CSV, count sheets, reports. */
  inventoryLines() {
    const out = [];
    state.products.forEach(p => {
      const push = (t, label, vid, sku) => {
        const stock = t.stock_quantity || 0, cost = t.cost_price || 0, price = t.price || 0;
        out.push({ product_id: p.id, name: p.name, variant_id: vid || '', label: label || '',
          sku: sku || p.sku || '', category: catName(p.category_id) || '', supplier: p.supplier || '',
          unit: p.default_unit || '', stock, reserved: t.reserved_stock || 0,
          available: stock - (t.reserved_stock || 0), low_at: t.low_stock_threshold || 0,
          cost, price, stock_value: Math.round(cost * stock * 100) / 100,
          margin: Math.round((price - cost) * 100) / 100,
          margin_pc: price > 0 ? Math.round((price - cost) / price * 1000) / 10 : 0,
          profit: Math.round((price - cost) * stock * 100) / 100,
          warehouse: p.warehouse_location || '' });
      };
      if ((p.variants || []).length) p.variants.forEach(v => push(v, variantLabel(v), v.id, v.sku));
      else push(p, '', '', p.sku);
    });
    return out;
  },
  /* Stock that hasn't sold in N days (cash sitting still). */
  deadStock(days) {
    const since = Date.now() - (Number(days) || 60) * 864e5;
    const soldRecently = new Set();
    state.movements.forEach(m => {
      if (m.type === 'sale' && new Date(m.ts).getTime() >= since)
        soldRecently.add(m.product_id + '|' + (m.variant_id || ''));
    });
    const lastSale = {};
    state.movements.forEach(m => {
      if (m.type !== 'sale') return;
      const k = m.product_id + '|' + (m.variant_id || '');
      if (!lastSale[k]) lastSale[k] = m.ts;      // movements are newest-first
    });
    return store.inventoryLines()
      .filter(l => l.stock > 0 && !soldRecently.has(l.product_id + '|' + l.variant_id))
      .map(l => ({ ...l, last_sale: lastSale[l.product_id + '|' + l.variant_id] || '' }))
      .sort((a, b) => b.stock_value - a.stock_value);
  },
  /* Items at or below their reorder point, with a suggested order quantity. */
  reorderList() {
    const out = [];
    state.products.forEach(p => {
      const push = (t, label, vid) => {
        const onHand = t.stock_quantity || 0, reserved = t.reserved_stock || 0;
        const avail = onHand - reserved, low = t.low_stock_threshold || 0;
        if (low > 0 && avail <= low) out.push({ product_id: p.id, name: p.name, variant_id: vid || '',
          label: label || '', available: avail, reorder_point: low,
          suggested: Math.max(low * 2 - avail, low), unit: p.default_unit, cost: t.cost_price || 0,
          supplier_id: num(p.supplier_id), supplier: p.supplier || '' });
      };
      if ((p.variants || []).length) p.variants.forEach(v => push(v, variantLabel(v), v.id));
      else push(p, '', '');
    });
    return out.sort((a, b) => a.available - b.available);
  },

  // categories
  allCategories: () => state.categories.slice().sort(bySort),
  addCategory(name) {
    if (state.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) throw new Error('exists');
    const c = { id: nextId('categories'), name, sort_order: state.categories.length };
    state.categories.push(c); persist(); return c;
  },
  updateCategory(id, name) { const c = state.categories.find(c => c.id === Number(id)); if (c) { c.name = name; persist(); } },
  deleteCategory(id) {
    state.categories = state.categories.filter(c => c.id !== Number(id));
    state.products.forEach(p => { if (p.category_id === Number(id)) p.category_id = null; });
    persist();
  },

  // coupons
  /* ---------------- suppliers ----------------
     Kept as proper records so purchase history, spend and contact details all
     hang off one entity instead of being retyped on every product. */
  allSuppliers() {
    return state.suppliers.map(s => ({ ...s, ...store.supplierStats(s.id) }));
  },
  getSupplier: (id) => state.suppliers.find(s => s.id === Number(id)),
  addSupplier(d) {
    // spread first — cleanSupplier echoes id/created_at, so they must be set after it
    const s = { ...cleanSupplier(d), id: nextId('suppliers'), created_at: new Date().toISOString() };
    state.suppliers.push(s); persist(); return s;
  },
  updateSupplier(id, d) {
    const s = state.suppliers.find(x => x.id === Number(id)); if (!s) return null;
    Object.assign(s, cleanSupplier({ ...s, ...d }));
    persist(); return s;
  },
  deleteSupplier(id) {
    state.suppliers = state.suppliers.filter(s => s.id !== Number(id));
    // don't orphan products — just unlink them
    state.products.forEach(p => { if (p.supplier_id === Number(id)) p.supplier_id = 0; });
    persist();
  },
  /* What this supplier has actually cost us, straight from the purchase ledger. */
  supplierStats(id) {
    const sid = Number(id);
    const sup = state.suppliers.find(s => s.id === sid);
    const names = new Set(state.products.filter(p => p.supplier_id === sid).map(p => p.id));
    const recs = state.purchases.filter(r => names.has(r.product_id));
    const spend = recs.reduce((s, r) => s + num(r.total), 0);
    const dates = recs.map(r => r.date).filter(Boolean).sort();
    return {
      product_count: names.size,
      purchase_count: recs.length,
      total_spend: Math.round(spend * 100) / 100,
      last_purchase: dates.length ? dates[dates.length - 1] : '',
      mail_count: state.supplier_mail.filter(m => m.supplier_id === sid).length,
      last_mail: (state.supplier_mail.filter(m => m.supplier_id === sid).slice(-1)[0] || {}).ts || '',
      _name: sup ? sup.name : '',
    };
  },
  supplierProducts: (id) => state.products.filter(p => p.supplier_id === Number(id))
    .map(p => ({ id: p.id, name: p.name, sku: p.sku, stock: num(p.stock_quantity), cost: num(p.cost_price) })),
  logSupplierMail(d) {
    const m = { id: nextId('supplier_mail'), supplier_id: Number(d.supplier_id) || 0,
      to: d.to || '', subject: d.subject || '', body: d.body || '',
      sent: d.sent ? 1 : 0, actor: d.actor || '', ts: new Date().toISOString() };
    state.supplier_mail.push(m); persist(); return m;
  },
  supplierMail: (id) => state.supplier_mail.filter(m => m.supplier_id === Number(id)).slice().reverse(),

  allCoupons: () => state.coupons.slice(),
  addCoupon(d) {
    const c = { id: nextId('coupons'), code: String(d.code || '').toUpperCase(), type: d.type === 'fixed' ? 'fixed' : 'percentage',
      value: num(d.value), expiry: d.expiry || '', usage_limit: num(d.usage_limit), used_count: 0, active: d.active === 0 ? 0 : 1 };
    state.coupons.push(c); persist(); return c;
  },
  updateCoupon(id, d) {
    const c = state.coupons.find(c => c.id === Number(id)); if (!c) return;
    if (d.code !== undefined) c.code = String(d.code).toUpperCase();
    if (d.type !== undefined) c.type = d.type === 'fixed' ? 'fixed' : 'percentage';
    ['value', 'usage_limit'].forEach(k => { if (d[k] !== undefined) c[k] = num(d[k]); });
    if (d.expiry !== undefined) c.expiry = d.expiry;
    if (d.active !== undefined) c.active = d.active ? 1 : 0;
    persist();
  },
  deleteCoupon(id) { state.coupons = state.coupons.filter(c => c.id !== Number(id)); persist(); },
  findCoupon: (code) => state.coupons.find(c => c.code === String(code || '').toUpperCase()),
  validateCoupon(code, subtotal) {
    const c = store.findCoupon(code);
    if (!c || !c.active) return { ok: false, error: 'Invalid coupon' };
    if (c.expiry && new Date(c.expiry) < new Date()) return { ok: false, error: 'Coupon expired' };
    if (c.usage_limit && c.used_count >= c.usage_limit) return { ok: false, error: 'Coupon usage limit reached' };
    const discount = c.type === 'percentage' ? subtotal * (c.value / 100) : Math.min(c.value, subtotal);
    return { ok: true, code: c.code, type: c.type, value: c.value, discount: Math.round(discount * 100) / 100 };
  },

  // shipping methods
  allShipping: () => state.shipping_methods.slice().sort(bySort),
  activeShipping: () => state.shipping_methods.filter(s => s.active).sort(bySort),
  addShipping(d) {
    const s = { id: nextId('shipping_methods'), name: d.name, courier: d.courier || '', charge: num(d.charge),
      areas: d.areas || '', eta: d.eta || '', active: d.active === 0 ? 0 : 1, sort_order: state.shipping_methods.length };
    state.shipping_methods.push(s); persist(); return s;
  },
  updateShipping(id, d) {
    const s = state.shipping_methods.find(s => s.id === Number(id)); if (!s) return;
    ['name', 'courier', 'areas', 'eta'].forEach(k => { if (d[k] !== undefined) s[k] = d[k]; });
    if (d.charge !== undefined) s.charge = num(d.charge);
    if (d.active !== undefined) s.active = d.active ? 1 : 0;
    persist();
  },
  deleteShipping(id) { state.shipping_methods = state.shipping_methods.filter(s => s.id !== Number(id)); persist(); },

  // payment methods
  allPayments: () => state.payment_methods.slice().sort(bySort),
  enabledPayments: () => state.payment_methods.filter(p => p.enabled).sort(bySort),
  addPayment(d) {
    const p = { id: nextId('payment_methods'), key: slugify(d.name).replace(/-/g, '_'), name: d.name,
      instructions: d.instructions || '', enabled: d.enabled === 0 ? 0 : 1, sort_order: state.payment_methods.length };
    state.payment_methods.push(p); persist(); return p;
  },
  updatePayment(id, d) {
    const p = state.payment_methods.find(p => p.id === Number(id)); if (!p) return;
    if (d.name !== undefined) p.name = d.name;
    if (d.instructions !== undefined) p.instructions = d.instructions;
    if (d.enabled !== undefined) p.enabled = d.enabled ? 1 : 0;
    persist();
  },
  deletePayment(id) { state.payment_methods = state.payment_methods.filter(p => p.id !== Number(id)); persist(); },

  // customers
  upsertCustomer(info) {
    const email = info.email ? String(info.email).toLowerCase() : '';
    const phoneD = normPhone(info.phone);
    let c = (email && state.customers.find(c => c.email && c.email.toLowerCase() === email))
         || (phoneD && state.customers.find(c => normPhone(c.phone) === phoneD));
    if (!c) {
      c = { id: nextId('customers'), email: info.email || '', name: info.full_name || info.name || '',
        company: info.company || '', phone: info.phone || '', whatsapp: info.whatsapp || '',
        country: info.country || '', notes: '', blocked: 0, verified: 0, created_at: new Date().toISOString() };
      state.customers.push(c);
    } else {
      c.name = info.full_name || c.name; c.company = info.company || c.company;
      c.email = info.email || c.email; c.phone = info.phone || c.phone;
      c.whatsapp = info.whatsapp || c.whatsapp; c.country = info.country || c.country;
    }
    persist(); return c;
  },
  getCustomerByEmail: (email) => state.customers.find(c => c.email && c.email.toLowerCase() === String(email).toLowerCase()),
  getCustomerByPhone: (phone) => { const d = normPhone(phone); return d && state.customers.find(c => normPhone(c.phone) === d); },
  loginCustomerByPhone(phone, name) {
    const d = normPhone(phone);
    let c = state.customers.find(c => normPhone(c.phone) === d);
    if (!c) { c = { id: nextId('customers'), email: '', name: name || '', company: '', phone, whatsapp: '', country: '', notes: '', blocked: 0, verified: 1, created_at: new Date().toISOString() }; state.customers.push(c); }
    if (name && !c.name) c.name = name;   // fill name on first sign-up if provided
    c.verified = 1; c.last_login = new Date().toISOString();
    persist(); return c;
  },
  updateCustomerProfile(id, d) {
    const c = state.customers.find(c => c.id === Number(id)); if (!c) return null;
    ['name', 'company', 'email', 'whatsapp', 'country'].forEach(k => { if (d[k] !== undefined) c[k] = d[k]; });
    persist(); return c;
  },
  allCustomers() {
    return state.customers.map(c => {
      const orders = store.accountOrders(c);   // match by email OR phone
      const spent = orders.reduce((s, o) => s + (o.total || 0), 0);
      return { ...c, order_count: orders.length, total_spent: Math.round(spent * 100) / 100 };
    });
  },
  updateCustomer(id, d) {
    const c = state.customers.find(c => c.id === Number(id)); if (!c) return;
    if (d.notes !== undefined) c.notes = d.notes;
    if (d.blocked !== undefined) c.blocked = d.blocked ? 1 : 0;
    persist();
  },
  deleteCustomer(id) { state.customers = state.customers.filter(c => c.id !== Number(id)); persist(); },
  customerOrders: (email) => state.orders.filter(o => o.customer.email && o.customer.email.toLowerCase() === String(email).toLowerCase())
    .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  accountOrders(customer) {
    const email = customer.email ? customer.email.toLowerCase() : '';
    const phoneD = normPhone(customer.phone);
    return state.orders.filter(o => (email && o.customer.email && o.customer.email.toLowerCase() === email)
        || (phoneD && normPhone(o.customer.phone) === phoneD))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  // orders
  allOrders: () => state.orders.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)),
  getOrder: (id) => state.orders.find(o => o.id === Number(id)),
  createOrder(payload) {
    const now = new Date().toISOString();
    const o = { id: nextId('orders'), order_number: orderNumber(), created_at: now, updated_at: now,
      customer: payload.customer, items: payload.items, subtotal: payload.subtotal,
      discount: payload.discount || 0, coupon_code: payload.coupon_code || '',
      tax: payload.tax || 0, shipping_method: payload.shipping_method || '', shipping_charge: payload.shipping_charge || 0,
      total: payload.total, currency: payload.currency || state.settings.currency || 'USD',
      payment_method: payload.payment_method || '', payment_status: 'pending', status: 'pending',
      // set when the order exceeds stock on hand — the balance must be made to order
      has_backorder: payload.has_backorder ? 1 : 0, backorder_note: payload.backorder_note || '',
      admin_notes: '', history: [{ ts: now, status: 'pending', note: 'Order placed by customer' }] };
    if (o.has_backorder) o.history.push({ ts: now, status: 'pending', note: 'Stock shortfall: ' + o.backorder_note });
    state.orders.push(o);
    // reserve stock (per variant when the item has one) + record the movement
    o.items.forEach(it => {
      if (!it.product_id) return;
      const pr = store.getProduct(it.product_id);
      const vv = it.variant_id && pr && (pr.variants || []).find(x => x.id === it.variant_id);
      const t = vv || pr || {};
      store.adjustStock(it.product_id, 0, it.quantity, it.variant_id);
      logMovement({ product_id: it.product_id, product_name: it.name, variant_id: it.variant_id || '',
        variant_label: it.variant_label || '', type: 'reserve', qty: -it.quantity,
        before: t.stock_quantity || 0, after: t.stock_quantity || 0,
        reason: 'Reserved for order', ref: o.order_number });
    });
    // coupon usage
    if (o.coupon_code) { const c = store.findCoupon(o.coupon_code); if (c) c.used_count = (c.used_count || 0) + 1; }
    store.upsertCustomer(o.customer);
    store.notify('new_order', `New order ${o.order_number} from ${o.customer.full_name} — ${fmt(o.total, o.currency)}`);
    persist(); return o;
  },
  updateOrderStatus(id, status, note) {
    const o = store.getOrder(id); if (!o) return null;
    const prev = o.status; o.status = status; o.updated_at = new Date().toISOString();
    o.history.push({ ts: o.updated_at, status, note: note || '' });
    // stock transitions
    const restore = ['cancelled', 'refunded'];
    if (restore.includes(status) && !restore.includes(prev)) {
      o.items.forEach(it => {
        if (!it.product_id) return;
        store.adjustStock(it.product_id, 0, -it.quantity, it.variant_id);
        logMovement({ product_id: it.product_id, product_name: it.name, variant_id: it.variant_id || '',
          variant_label: it.variant_label || '', type: 'release', qty: it.quantity,
          reason: 'Reservation released (' + status + ')', ref: o.order_number });
      });
    }
    if (status === 'shipped' || status === 'delivered') {
      // convert reserved -> actual reduction (only once, when leaving pre-ship states)
      if (!o._stockCommitted) {
        o.items.forEach(it => {
          if (!it.product_id) return;
          const pr = store.getProduct(it.product_id);
          const vv = it.variant_id && pr && (pr.variants || []).find(x => x.id === it.variant_id);
          const t = vv || pr || {};
          const before = t.stock_quantity || 0;
          store.adjustStock(it.product_id, -it.quantity, -it.quantity, it.variant_id);
          logMovement({ product_id: it.product_id, product_name: it.name, variant_id: it.variant_id || '',
            variant_label: it.variant_label || '', type: 'sale', qty: -it.quantity,
            before, after: Math.max(0, before - it.quantity), reason: 'Sold / shipped', ref: o.order_number });
        });
        o._stockCommitted = true;
      }
    }
    store.notify('order_status', `Order ${o.order_number} status -> ${status}`);
    persist(); return o;
  },
  updateOrder(id, d) {
    const o = store.getOrder(id); if (!o) return null;
    if (d.payment_status !== undefined) o.payment_status = d.payment_status;
    if (d.payment_method !== undefined) o.payment_method = d.payment_method;
    if (d.admin_notes !== undefined) o.admin_notes = d.admin_notes;
    if (d.total !== undefined) o.total = num(d.total);
    if (d.shipping_charge !== undefined) o.shipping_charge = num(d.shipping_charge);
    o.updated_at = new Date().toISOString();
    persist(); return o;
  },
  requestPayment(id) {
    const o = store.getOrder(id); if (!o) return null;
    o.payment_status = 'awaiting_payment'; o.updated_at = new Date().toISOString();
    o.history.push({ ts: o.updated_at, status: o.status, note: 'Payment request sent to customer' });
    store.notify('payment_request', `Payment request sent for order ${o.order_number}`);
    persist(); return o;
  },

  // order tracking (public — no account)
  trackOrder(number, contact) {
    const o = state.orders.find(o => o.order_number.toLowerCase() === String(number || '').trim().toLowerCase());
    if (!o) return null;
    const c = String(contact || '').trim().toLowerCase();
    const emailMatch = o.customer.email && o.customer.email.toLowerCase() === c;
    const phoneMatch = normPhone(o.customer.phone) && normPhone(o.customer.phone) === normPhone(contact);
    if (!emailMatch && !phoneMatch) return null;
    return { order_number: o.order_number, status: o.status, payment_status: o.payment_status,
      created_at: o.created_at, total: o.total, currency: o.currency,
      items: o.items.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
      history: o.history };
  },

  // audit log
  addAudit(actor, action) {
    state.audit.unshift({ id: nextId('audit'), actor: actor || 'system', action, ts: new Date().toISOString() });
    state.audit = state.audit.slice(0, 500); persist();
  },
  allAudit: () => state.audit.slice(0, 200),

  // notifications (email stub / activity log)
  notify(type, message) {
    state.notifications.unshift({ id: nextId('notifications'), type, message, ts: new Date().toISOString(), read: 0 });
    state.notifications = state.notifications.slice(0, 200);
  },
  allNotifications: () => state.notifications.slice(0, 50),

  // reports
  reports() {
    const orders = state.orders;
    const paid = orders.filter(o => o.payment_status === 'paid');
    const totalSales = paid.reduce((s, o) => s + (o.total || 0), 0);
    const byMonth = {};
    orders.forEach(o => {
      const m = (o.created_at || '').slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + (o.total || 0);
    });
    const productSales = {};
    orders.forEach(o => o.items.forEach(it => {
      const key = it.name; productSales[key] = (productSales[key] || 0) + (it.quantity || 0);
    }));
    const best = Object.entries(productSales).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));
    const lowStock = state.products.filter(p => stockStatus(p) !== 'in_stock')
      .map(p => ({ name: p.name, available: (p.stock_quantity || 0) - (p.reserved_stock || 0), status: stockStatus(p) }));
    return {
      total_sales: Math.round(totalSales * 100) / 100,
      order_count: orders.length,
      pending_orders: orders.filter(o => o.status === 'pending').length,
      customers: state.customers.length,
      currency: state.settings.currency || 'USD',
      monthly: Object.entries(byMonth).sort().slice(-6).map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 })),
      best_sellers: best,
      low_stock: lowStock,
    };
  },

  // hotspots (net parts)
  allHotspots: () => state.hotspots.slice().sort((a, b) => a.number - b.number).map(hotspotView),
  publicHotspots: () => state.hotspots.filter(h => h.enabled).sort((a, b) => a.number - b.number).map(hotspotView),
  getHotspot: (id) => state.hotspots.find(h => h.id === Number(id)),
  addHotspot(d) {
    const maxN = state.hotspots.reduce((m, h) => Math.max(m, h.number), 0);
    const h = { id: nextId('hotspots'), number: d.number ? Number(d.number) : maxN + 1, name: d.name || 'New Part',
      x: d.x !== undefined ? Number(d.x) : 50, y: d.y !== undefined ? Number(d.y) : 50,
      color: d.color || '#0071c5', product_id: d.product_id ? Number(d.product_id) : null,
      type_id: d.type_id ? Number(d.type_id) : null,
      item: cleanItem(d.item),
      enabled: d.enabled === 0 ? 0 : 1, sort_order: state.hotspots.length };
    state.hotspots.push(h); persist(); return h;
  },
  updateHotspot(id, d) {
    const h = store.getHotspot(id); if (!h) return null;
    if (d.name !== undefined) h.name = d.name;
    if (d.number !== undefined) h.number = Number(d.number);
    if (d.x !== undefined) h.x = Number(d.x);
    if (d.y !== undefined) h.y = Number(d.y);
    if (d.color !== undefined) h.color = d.color;
    if (d.product_id !== undefined) h.product_id = d.product_id ? Number(d.product_id) : null;
    if (d.type_id !== undefined) h.type_id = d.type_id ? Number(d.type_id) : null;
    if (d.item !== undefined) h.item = cleanItem(d.item);
    if (d.enabled !== undefined) h.enabled = d.enabled ? 1 : 0;
    persist(); return h;
  },
  deleteHotspot(id) { state.hotspots = state.hotspots.filter(h => h.id !== Number(id)); persist(); },

  // net types (Explore section) — up to 4, each { id, name, diagram }
  getNetTypes() { try { return JSON.parse(state.settings.netparts_types || '[]'); } catch { return []; } },
  setNetTypes(arr) {
    const list = (Array.isArray(arr) ? arr : []).slice(0, 4).map(t => ({
      id: t.id ? Number(t.id) : nextId('nettypes'), name: t.name || 'Net type', diagram: t.diagram || '' }));
    state.settings.netparts_types = JSON.stringify(list); persist(); return list;
  },

  // settings
  getSettings: () => ({ ...state.settings }),
  setSettings(obj) { for (const [k, v] of Object.entries(obj)) state.settings[k] = v ?? ''; persist(); },

  // Firebase: pull the cloud backup into this instance (opt-in; overwrites local state)
  async restoreFromCloud() {
    const cloud = await firebase.loadState();
    if (!cloud || typeof cloud !== 'object') return false;
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, cloud);
    // A backup taken before a collection existed would leave it undefined and
    // crash on first write — re-normalise exactly as we do at boot.
    for (const k of COLLECTIONS) if (!Array.isArray(state[k])) state[k] = [];
    state.settings = state.settings || {};
    state.seq = state.seq || {};
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
    return true;
  },
  /* True when this looks like a freshly seeded instance with no real trading
     data — i.e. an ephemeral disk (Cloud Run) that should pull the cloud backup. */
  isEmpty: () => !state.orders.length && !state.purchases.length && !state.suppliers.length,

  /* Called by server.js once it has decided whether to restore. Everything before
     this point stays local-only, so boot can never clobber the cloud backup. */
  startCloudMirror() {
    _mirrorPaused = false;
    if (firebase.firebaseEnabled()) firebase.saveState(state);
  },
};

function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function fmt(v, cur) { return `${cur || 'USD'} ${Number(v || 0).toLocaleString()}`; }
function normPhone(s) { return String(s || '').replace(/[^\d]/g, ''); }
function cleanItem(it) {
  it = it || {};
  return {
    name: it.name || '', description: it.description || '', category: it.category || '',
    features: it.features || '', uses: it.uses || '',
    size: it.size || '', mesh_size: it.mesh_size || '', md_size: it.md_size || '', color: it.color || '', material: it.material || '',
    price: it.price !== undefined && it.price !== '' ? Number(it.price) : '',
    unit: it.unit || 'kg', image: it.image || '',
    in_stock: it.in_stock === 0 || it.in_stock === false ? 0 : 1,
  };
}
function hotspotView(h) {
  const p = h.product_id ? state.products.find(x => x.id === h.product_id) : null;
  return { ...h, item: cleanItem(h.item), product: p ? decorate(p) : null };
}

module.exports = { store, bcrypt };
