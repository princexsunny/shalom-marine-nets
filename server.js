/**
 * Marine Nets — B2B commerce server (Express + JSON store).
 * Public storefront + cart/checkout + admin dashboard API.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { store, bcrypt } = require('./db');
const { sendSms, smsEnabled } = require('./sms');
const { sendEmail } = require('./email');
const firebase = require('./firebase');

// Turn multer's saved files into public URLs — via Firebase Storage when configured,
// otherwise the local /uploads path (existing behaviour).
async function filesToUrls(reqFiles) {
  const files = reqFiles || [];
  if (!firebase.storageEnabled()) {
    console.log('[upload] Firebase Storage disabled — using local /uploads');
    return files.map(f => ({ url: `/uploads/${f.filename}`, type: /^video\//.test(f.mimetype) ? 'video' : 'image' }));
  }
  console.log('[upload] Firebase Storage enabled — uploading', files.length, 'file(s)');
  const out = [];
  for (const f of files) {
    try {
      const url = await firebase.uploadToStorage(f.path, f.filename, f.mimetype);
      if (!url) {
        console.error('[upload] Firebase returned null URL for', f.filename, '— check bucket config');
        out.push({ url: `/uploads/${f.filename}`, type: /^video\//.test(f.mimetype) ? 'video' : 'image' });
      } else {
        console.log('[upload] SUCCESS:', f.filename, '→', url.substring(0, 60) + '...');
        out.push({ url, type: /^video\//.test(f.mimetype) ? 'video' : 'image' });
      }
    } catch (e) {
      console.error('[upload] ERROR uploading', f.filename, ':', e.message);
      out.push({ url: `/uploads/${f.filename}`, type: /^video\//.test(f.mimetype) ? 'video' : 'image' });
    }
  }
  return out;
}

// Simple in-memory rate limiter factory (per IP + route bucket).
function rateLimit(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const key = (req.ip || req.socket.remoteAddress || 'x') + '|' + req.path;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Too many requests — please slow down.' });
    arr.push(now); hits.set(key, arr);
    next();
  };
}

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Uploads ----------
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, f, cb) => cb(null, UPLOAD_DIR),
    filename: (req, f, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(f.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, f, cb) => { const ok = /image\/(jpe?g|png|webp|gif|avif)/.test(f.mimetype); cb(ok ? null : new Error('Only images allowed'), ok); },
});
// images + video (for the hero gallery)
const uploadMedia = multer({
  storage: multer.diskStorage({
    destination: (req, f, cb) => cb(null, UPLOAD_DIR),
    filename: (req, f, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(f.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (req, f, cb) => { const ok = /^(image\/(jpe?g|png|webp|gif|avif)|video\/(mp4|webm|ogg|quicktime))$/.test(f.mimetype); cb(ok ? null : new Error('Only images or video allowed'), ok); },
});

// ---------- Middleware ----------
app.disable('x-powered-by');
app.use((req, res, next) => {                       // security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // HSTS — browsers apply it only over HTTPS, so it's safe to always send
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Content-Security-Policy — permissive enough for inline styles, Chart.js (cdnjs),
  // YouTube/Maps embeds and Firebase Storage images, while blocking framing & object embeds.
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "img-src 'self' data: https:",
    "media-src 'self' https:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://www.googletagmanager.com https://www.google-analytics.com",
    "frame-src https://www.youtube.com https://www.google.com",
    "connect-src 'self' https:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join('; '));
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
/* Behind Cloud Run / Render the app sits behind an HTTPS proxy. Without this,
   Express thinks the connection is plain HTTP and refuses to set secure cookies,
   which silently breaks admin login. */
const BEHIND_PROXY = process.env.TRUST_PROXY === '1' || !!process.env.K_SERVICE || !!process.env.RENDER;
if (BEHIND_PROXY) app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(24).toString('hex'),
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: BEHIND_PROXY, maxAge: 1000 * 60 * 60 * 8 },
}));
// Auto audit log: record every successful admin mutation.
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.session && req.session.username && !req.path.startsWith('/auth')) {
    res.on('finish', () => { if (res.statusCode < 400) store.addAudit(req.session.username, `${req.method} ${req.originalUrl}`); });
  }
  next();
});

/* Low-stock alert: emails the operator a digest when items fall to/below their reorder point.
   Throttled to once an hour, and only re-alerts for items that newly dropped. */
let _lowAlertAt = 0, _lowAlerted = new Set();
async function checkLowStock() {
  try {
    const s = store.getSettings();
    if (!s.contact_email || s.low_stock_alerts === '0') return;
    const list = store.reorderList();
    const keys = list.map(r => r.product_id + '|' + (r.variant_id || ''));
    const fresh = keys.filter(k => !_lowAlerted.has(k));
    _lowAlerted = new Set(keys);                       // items back in stock can alert again later
    if (!fresh.length) return;
    if (Date.now() - _lowAlertAt < 60 * 60 * 1000) return;
    _lowAlertAt = Date.now();
    const body = list.map(r => `• ${r.name}${r.label ? ' (' + r.label + ')' : ''} — ${r.available} ${r.unit || ''} left (reorder at ${r.reorder_point}, suggest ordering ${r.suggested})`).join('\n');
    await sendEmail(s.contact_email, `Low stock: ${list.length} item(s) need reordering`,
      `These items are at or below their reorder point:\n\n${body}\n\nOpen Admin → Inventory to restock.`);
  } catch (e) { console.error('[low-stock] alert failed:', e.message); }
}

const requireAuth = (req, res, next) =>
  (req.session && req.session.userId) ? next() : res.status(401).json({ error: 'Unauthorized' });
const requireAdmin = (req, res, next) =>
  (req.session && req.session.role === 'admin') ? next() : res.status(403).json({ error: 'Admin access required' });

// =====================================================================
//  AUTH  (session-based; roles: admin / staff — RBAC)
// =====================================================================
const LOGIN_FAILS = new Map();  // ip -> { count, until }
app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || 'x';
  const rec = LOGIN_FAILS.get(ip);
  if (rec && rec.until > Date.now())
    return res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil((rec.until - Date.now())/60000)} min.` });
  const { username, password } = req.body || {};
  const user = store.findUser(username);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    const r = LOGIN_FAILS.get(ip) || { count: 0, until: 0 };
    r.count++; if (r.count >= 5) { r.until = Date.now() + 15 * 60 * 1000; r.count = 0; }
    LOGIN_FAILS.set(ip, r);
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  LOGIN_FAILS.delete(ip);
  req.session.userId = user.id; req.session.username = user.username; req.session.role = user.role;
  store.addAudit(user.username, 'Signed in');
  res.json({ ok: true, username: user.username, role: user.role, name: user.name });
});
app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/auth/me', (req, res) =>
  (req.session && req.session.userId)
    ? res.json({ authenticated: true, username: req.session.username, role: req.session.role })
    : res.json({ authenticated: false }));
app.post('/api/auth/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  const user = store.getUser(req.session.userId);
  if (!bcrypt.compareSync(current || '', user.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' });
  if (!next || next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  store.setPassword(user.id, bcrypt.hashSync(next, 10));
  res.json({ ok: true });
});
// staff management (admin only)
app.get('/api/users', requireAdmin, (req, res) => res.json(store.allUsers()));
app.post('/api/users', requireAdmin, (req, res) => {
  const { username, password, role, name } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try { const u = store.addUser({ username, password, role, name }); res.json({ ok: true, id: u.id }); }
  catch { res.status(400).json({ error: 'Username already exists' }); }
});
app.delete('/api/users/:id', requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.session.userId) return res.status(400).json({ error: 'You cannot delete yourself' });
  store.deleteUser(req.params.id); res.json({ ok: true });
});

// =====================================================================
//  CUSTOMER AUTH — phone number + SMS OTP
// =====================================================================
const OTP = new Map();            // phoneDigits -> { hash, expires, attempts, lastSent }
const OTP_TTL = 5 * 60 * 1000;    // code valid 5 minutes
const OTP_RESEND = 30 * 1000;     // min 30s between sends
const normPhone = (s) => String(s || '').replace(/[^\d]/g, '');
const requireCustomer = (req, res, next) =>
  (req.session && req.session.customerId) ? next() : res.status(401).json({ error: 'Please sign in' });

app.post('/api/customer/request-otp', async (req, res) => {
  const phone = (req.body || {}).phone;
  const d = normPhone(phone);
  if (d.length < 6) return res.status(400).json({ error: 'Enter a valid phone number' });
  const existing = OTP.get(d);
  if (existing && Date.now() - existing.lastSent < OTP_RESEND)
    return res.status(429).json({ error: 'Please wait a moment before requesting another code' });
  const c = store.getCustomerByPhone(phone);
  if (c && c.blocked) return res.status(403).json({ error: 'This account cannot sign in. Please contact us.' });

  const code = String(Math.floor(100000 + Math.random() * 900000));  // 6 digits
  OTP.set(d, { hash: bcrypt.hashSync(code, 8), expires: Date.now() + OTP_TTL, attempts: 0, lastSent: Date.now() });
  const result = await sendSms(phone, `Your Marine Nets verification code is ${code}. It expires in 5 minutes.`);

  // SECURITY: the code may only ever be echoed back on a local dev machine.
  // On a public host that would let anyone sign in as any customer.
  const isLocal = ['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.hostname);
  const showDev = !smsEnabled() && isLocal && process.env.NODE_ENV !== 'production';
  if (!smsEnabled() && !showDev) {
    OTP.delete(d);
    return res.status(503).json({ error: 'Phone sign-in is temporarily unavailable. Please call or WhatsApp us to place your order.' });
  }
  res.json({ ok: true, sent: result.sent, dev: showDev, devCode: showDev ? code : undefined });
});

app.post('/api/customer/verify-otp', (req, res) => {
  const { phone, code, name } = req.body || {};
  const d = normPhone(phone);
  const rec = OTP.get(d);
  if (!rec) return res.status(400).json({ error: 'Request a code first' });
  if (Date.now() > rec.expires) { OTP.delete(d); return res.status(400).json({ error: 'Code expired — request a new one' }); }
  if (rec.attempts >= 5) { OTP.delete(d); return res.status(429).json({ error: 'Too many attempts — request a new code' }); }
  rec.attempts++;
  if (!bcrypt.compareSync(String(code || ''), rec.hash)) return res.status(400).json({ error: 'Incorrect code' });
  OTP.delete(d);
  const customer = store.loginCustomerByPhone(phone, name);
  req.session.customerId = customer.id;
  res.json({ ok: true, customer: publicCustomer(customer) });
});

// Firebase Auth sign-in: client signs in with Firebase (phone/Google/email), sends the
// ID token; we verify it server-side and create/log-in the matching customer.
app.post('/api/customer/firebase-login', async (req, res) => {
  const { idToken, name } = req.body || {};
  const decoded = await firebase.verifyIdToken(idToken);
  if (!decoded) return res.status(401).json({ error: 'Invalid or expired sign-in token' });
  const phone = decoded.phone_number || '';
  const email = decoded.email || '';
  let customer;
  if (phone) customer = store.loginCustomerByPhone(phone, name || decoded.name);
  else if (email) {
    customer = store.getCustomerByEmail(email) || store.upsertCustomer({ email, full_name: name || decoded.name || '' });
    customer.verified = 1;
  } else return res.status(400).json({ error: 'Token has no phone or email' });
  if (customer.blocked) return res.status(403).json({ error: 'This account cannot sign in. Please contact us.' });
  req.session.customerId = customer.id;
  res.json({ ok: true, customer: publicCustomer(customer) });
});

app.get('/api/customer/me', (req, res) => {
  if (!req.session || !req.session.customerId) return res.json({ authenticated: false });
  const cust = storeCustomerById(req.session.customerId);
  if (!cust) return res.json({ authenticated: false });
  res.json({ authenticated: true, customer: publicCustomer(cust) });
});
app.post('/api/customer/logout', (req, res) => { if (req.session) req.session.customerId = null; res.json({ ok: true }); });
app.get('/api/customer/orders', requireCustomer, (req, res) => {
  const cust = storeCustomerById(req.session.customerId);
  if (!cust) return res.status(401).json({ error: 'Please sign in' });
  res.json({ customer: publicCustomer(cust), orders: store.accountOrders(cust) });
});
app.put('/api/customer/profile', requireCustomer, (req, res) => {
  const c = store.updateCustomerProfile(req.session.customerId, req.body || {});
  res.json({ ok: true, customer: c ? publicCustomer(c) : null });
});

function storeCustomerById(id) { return store.allCustomers().find(c => c.id === id); }
function publicCustomer(c) {
  return { id: c.id, name: c.name, company: c.company, email: c.email, phone: c.phone, whatsapp: c.whatsapp, country: c.country };
}

// =====================================================================
//  PUBLIC STOREFRONT
// =====================================================================
app.get('/api/public/site', (req, res) => {
  res.json({
    products: store.publishedProducts(),
    settings: store.getSettings(),
    shipping: store.activeShipping(),
    payments: store.enabledPayments(),
    firebase_auth: firebase.firebaseEnabled(),   // client may offer Firebase sign-in when true
  });
});
app.get('/api/public/product/:id', (req, res) => {
  const p = store.getProductDecorated(req.params.id);
  if (!p || !p.published) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});
app.post('/api/public/coupon', (req, res) => {
  const { code, subtotal } = req.body || {};
  res.json(store.validateCoupon(code, Number(subtotal) || 0));
});
app.post('/api/public/track', rateLimit(20, 5 * 60 * 1000), (req, res) => {
  const { order_number, contact } = req.body || {};
  const r = store.trackOrder(order_number, contact);
  if (!r) return res.status(404).json({ error: 'No order found for that number and contact.' });
  res.json(r);
});
app.get('/api/public/netparts', (req, res) => {
  const s = store.getSettings();
  res.json({
    diagram: s.netparts_diagram || '', title: s.netparts_title || 'Explore Every Net Component',
    desc: s.netparts_desc || '', button: s.netparts_button || 'Explore All Parts',
    types: store.getNetTypes(),
    hotspots: store.publicHotspots(),
  });
});

/* Live stock check for the storefront: quantity box, cart and checkout all call
   this so the customer sees "only N left" before they ever hit Place Order. */
app.post('/api/public/stock-check', rateLimit(120, 60 * 1000), (req, res) => {
  const items = Array.isArray(req.body && req.body.items) ? req.body.items.slice(0, 50) : [];
  const r = store.checkStock(items);
  res.json({ ok: r.ok, policy: store.getSettings().stock_policy || 'backorder', rows: r.rows });
});

// Place an order (no immediate payment — B2B review flow)
app.post('/api/public/order', rateLimit(10, 10 * 60 * 1000), (req, res) => {
  const b = req.body || {};
  const c = b.customer || {};
  if (!c.full_name || !c.email) return res.status(400).json({ error: 'Name and email are required' });
  if (!Array.isArray(b.items) || !b.items.length) return res.status(400).json({ error: 'Your cart is empty' });

  const existing = store.getCustomerByEmail(c.email);
  if (existing && existing.blocked) return res.status(403).json({ error: 'This account cannot place orders. Please contact us.' });

  /* Stock gate — the authoritative check. The storefront warns as you type, but
     stock can change between adding to cart and checking out, so we re-check here.
     Policy "block" refuses the order; "backorder" (default) accepts it and flags
     the shortfall so the office can quote a lead time. */
  const stock = store.checkStock(b.items);
  const policy = (store.getSettings().stock_policy || 'backorder');
  if (!stock.ok && policy === 'block') {
    return res.status(409).json({
      error: 'Some items are no longer available in the quantity you requested.',
      code: 'INSUFFICIENT_STOCK',
      issues: stock.issues.map(r => ({
        name: r.name, label: r.label, requested: r.requested, available: r.available, unit: r.unit,
        message: r.available <= 0
          ? `${r.name}${r.label ? ' (' + r.label + ')' : ''} is out of stock.`
          : `Only ${r.available} ${r.unit} of ${r.name}${r.label ? ' (' + r.label + ')' : ''} left — you asked for ${r.requested}.`,
      })),
    });
  }

  // Rebuild totals server-side from real product prices (never trust the client)
  let subtotal = 0;
  const items = b.items.map(it => {
    const p = store.getProduct(it.product_id);
    // if the product has variants and one was chosen, price from that variant
    const variant = p && it.variant_id ? (p.variants || []).find(v => v.id === it.variant_id) : null;
    const unitPrice = variant ? (variant.price || 0)
      : (p ? (p.discount_price > 0 ? p.discount_price : p.price) : Number(it.unit_price) || 0);
    const qty = Math.max(1, Number(it.quantity) || 1);
    const line = unitPrice * qty;
    subtotal += line;
    return {
      product_id: p ? p.id : null, name: p ? p.name : it.name, category: p ? (p.category_id) : '',
      variant_id: variant ? variant.id : '', variant_label: it.variant_label || '',
      sku: (variant && variant.sku) || (p ? p.sku : ''), quantity: qty, unit: it.unit || (p && p.default_unit) || 'Piece',
      size: it.size || '', mesh_size: it.mesh_size || '', md_size: it.md_size || '', material: it.material || '',
      color: it.color || '', custom_specs: it.custom_specs || '', special_instructions: it.special_instructions || '',
      unit_price: unitPrice, line_total: Math.round(line * 100) / 100,
    };
  });
  subtotal = Math.round(subtotal * 100) / 100;

  // coupon
  let discount = 0, coupon_code = '';
  if (b.coupon_code) {
    const v = store.validateCoupon(b.coupon_code, subtotal);
    if (v.ok) { discount = v.discount; coupon_code = v.code; }
  }
  // shipping
  const ship = store.activeShipping().find(s => s.id === Number(b.shipping_method_id));
  const shipping_charge = ship ? ship.charge : 0;
  const shipping_method = ship ? ship.name : (b.shipping_method || '');
  // tax (per-product blended kept simple: settings default rate)
  const settings = store.getSettings();
  const taxRate = Number(settings.default_tax_rate) || 0;
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * (taxRate / 100) * 100) / 100;
  const total = Math.round((taxable + tax + shipping_charge) * 100) / 100;

  const order = store.createOrder({
    customer: {
      full_name: c.full_name, company: c.company || '', email: c.email, phone: c.phone || '',
      whatsapp: c.whatsapp || '', country: c.country || '', address: c.address || '',
      shipping_address: c.shipping_address || c.address || '', postal_code: c.postal_code || '',
    },
    items, subtotal, discount, coupon_code, tax, shipping_method, shipping_charge, total,
    currency: settings.currency || 'USD', payment_method: b.payment_method || '',
    // shortfall detail so the office knows what must be made to order
    has_backorder: !stock.ok,
    backorder_note: stock.ok ? '' : stock.issues
      .map(r => `${r.name}${r.label ? ' (' + r.label + ')' : ''}: ordered ${r.requested}, ${r.available} in stock`)
      .join('; '),
  });
  // Email notifications (dev-mode logs unless SMTP configured)
  const money = `${order.currency} ${order.total.toLocaleString()}`;
  if (order.customer.email) sendEmail(order.customer.email, `Order received — ${order.order_number}`,
    `Hi ${order.customer.full_name},\n\nThank you for your order ${order.order_number} (${money}).\nOur team will review pricing, stock and shipping, then send a payment request.\n\n— ${settings.company_name || 'Marine Nets'}`).catch(()=>{});
  if (settings.contact_email) sendEmail(settings.contact_email, `New order ${order.order_number}`,
    `New order from ${order.customer.full_name} (${order.customer.company || order.customer.email}) — ${money}.`).catch(()=>{});
  res.json({ ok: true, order_number: order.order_number, id: order.id, total: order.total, currency: order.currency });
});

// =====================================================================
//  ADMIN API
// =====================================================================
// Products
app.get('/api/products', requireAuth, (req, res) => res.json(store.allProducts()));
app.post('/api/products', requireAuth, (req, res) => {
  if (!req.body || !req.body.name) return res.status(400).json({ error: 'Name is required' });
  res.json({ ok: true, id: store.addProduct(req.body).id });
});
app.put('/api/products/:id', requireAuth, (req, res) => {
  const p = store.updateProduct(req.params.id, req.body || {});
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
app.delete('/api/products/:id', requireAuth, (req, res) => { store.deleteProduct(req.params.id); res.json({ ok: true }); });
app.post('/api/products/:id/restock', requireAuth, (req, res) => {
  const r = store.restockProduct(req.params.id, { ...(req.body || {}), actor: req.session.username });
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ ok: true, product: r.product, purchase: r.purchase });
});
app.get('/api/products/:id/purchases', requireAuth, (req, res) => res.json(store.productPurchases(req.params.id)));
/* ---------------- suppliers ---------------- */
app.get('/api/suppliers', requireAuth, (req, res) => res.json(store.allSuppliers()));
app.get('/api/suppliers/:id', requireAuth, (req, res) => {
  const s = store.getSupplier(req.params.id);
  if (!s) return res.status(404).json({ error: 'Supplier not found' });
  res.json({ ...s, ...store.supplierStats(s.id), products: store.supplierProducts(s.id), mail: store.supplierMail(s.id) });
});
app.post('/api/suppliers', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim()) return res.status(400).json({ error: 'Supplier name is required' });
  res.json({ ok: true, supplier: store.addSupplier(b) });
});
app.put('/api/suppliers/:id', requireAuth, (req, res) => {
  const s = store.updateSupplier(req.params.id, req.body || {});
  if (!s) return res.status(404).json({ error: 'Supplier not found' });
  res.json({ ok: true, supplier: s });
});
app.delete('/api/suppliers/:id', requireAuth, (req, res) => { store.deleteSupplier(req.params.id); res.json({ ok: true }); });

/* Email a supplier (enquiry, purchase order, reminder). Always logged against
   the supplier so there's a record of what was sent, even in dev mode. */
app.post('/api/suppliers/:id/email', requireAuth, async (req, res) => {
  const s = store.getSupplier(req.params.id);
  if (!s) return res.status(404).json({ error: 'Supplier not found' });
  const to = String((req.body && req.body.to) || s.email || '').trim();
  const subject = String((req.body && req.body.subject) || '').trim();
  const body = String((req.body && req.body.body) || '').trim();
  if (!to) return res.status(400).json({ error: 'This supplier has no email address. Add one first.' });
  if (!subject || !body) return res.status(400).json({ error: 'Subject and message are required' });
  let sent = false, dev = false;
  try { const r = await sendEmail(to, subject, body); sent = !!r.sent; dev = !!r.dev; } catch {}
  store.logSupplierMail({ supplier_id: s.id, to, subject, body, sent, actor: req.session.username });
  res.json({ ok: true, sent, dev });
});

app.get('/api/purchases', requireAuth, (req, res) => res.json(store.allPurchases()));

// New stock vs old stock: current stock split into the batches it came from
app.get('/api/products/:id/stock-layers', requireAuth, (req, res) => {
  const r = store.stockLayers(req.params.id, req.query.variant_id || '');
  if (!r) return res.status(404).json({ error: 'Product not found' });
  res.json(r);
});

app.put('/api/purchases/:pid', requireAuth, (req, res) => {
  const r = store.updatePurchase(req.params.pid, { ...(req.body || {}), actor: req.session.username });
  if (!r || r.error) return res.status(400).json({ error: (r && r.error) || 'Could not update purchase' });
  res.json(r);   // the /api audit middleware logs this automatically
});

app.delete('/api/purchases/:pid', requireAuth, (req, res) => {
  const r = store.deletePurchase(req.params.pid, req.session.username);
  if (!r || r.error) return res.status(400).json({ error: (r && r.error) || 'Could not delete purchase' });
  res.json(r);
});
// stock count / correction — records WHY in the movement ledger
app.post('/api/products/:id/adjust', requireAuth, (req, res) => {
  const r = store.adjustStockTo(req.params.id, { ...(req.body || {}), actor: req.session.username });
  if (!r) return res.status(404).json({ error: 'Not found' });
  checkLowStock();
  res.json({ ok: true, product: r.product, unchanged: !!r.unchanged });
});
app.get('/api/products/:id/movements', requireAuth, (req, res) =>
  res.json(store.productMovements(req.params.id, req.query.variant_id || '')));
app.get('/api/movements', requireAuth, (req, res) => res.json(store.allMovements(Number(req.query.limit) || 200)));
app.get('/api/reorder', requireAuth, (req, res) => res.json(store.reorderList()));
app.get('/api/deadstock', requireAuth, (req, res) => res.json(store.deadStock(req.query.days || 60)));
app.post('/api/products/reorder', requireAuth, (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
  store.reorderProducts(order.map(Number)); res.json({ ok: true });
});
app.post('/api/upload', requireAuth, upload.array('images', 12), async (req, res) => {
  const files = await filesToUrls(req.files);
  res.json({ ok: true, urls: files.map(f => f.url) });
});
app.post('/api/upload-media', requireAuth, uploadMedia.array('media', 12), async (req, res) => {
  res.json({ ok: true, files: await filesToUrls(req.files) });
});

// Categories
app.get('/api/categories', requireAuth, (req, res) => res.json(store.allCategories()));
app.post('/api/categories', requireAuth, (req, res) => {
  const { name } = req.body || {}; if (!name) return res.status(400).json({ error: 'Name is required' });
  try { res.json({ ok: true, id: store.addCategory(name).id }); } catch { res.status(400).json({ error: 'Category already exists' }); }
});
app.put('/api/categories/:id', requireAuth, (req, res) => { store.updateCategory(req.params.id, (req.body || {}).name); res.json({ ok: true }); });
app.delete('/api/categories/:id', requireAuth, (req, res) => { store.deleteCategory(req.params.id); res.json({ ok: true }); });

// Orders
app.get('/api/orders', requireAuth, (req, res) => res.json(store.allOrders()));
app.get('/api/orders/:id', requireAuth, (req, res) => {
  const o = store.getOrder(req.params.id); if (!o) return res.status(404).json({ error: 'Not found' }); res.json(o);
});
app.put('/api/orders/:id/status', requireAuth, (req, res) => {
  const { status, note } = req.body || {};
  const allowed = ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const o = store.updateOrderStatus(req.params.id, status, note);
  if (status === 'shipped' || status === 'delivered') checkLowStock();
  if (o && o.customer.email) {
    const s = store.getSettings();
    sendEmail(o.customer.email, `Order ${o.order_number} — ${status}`,
      `Hi ${o.customer.full_name},\n\nYour order ${o.order_number} is now: ${status.toUpperCase()}.\n${note ? note + '\n' : ''}\n— ${s.company_name || 'Marine Nets'}`).catch(()=>{});
  }
  res.json({ ok: true, order: o });
});
app.put('/api/orders/:id', requireAuth, (req, res) => { res.json({ ok: true, order: store.updateOrder(req.params.id, req.body || {}) }); });
app.post('/api/orders/:id/request-payment', requireAuth, (req, res) => { res.json({ ok: true, order: store.requestPayment(req.params.id) }); });

// Customers
app.get('/api/customers', requireAuth, (req, res) => res.json(store.allCustomers()));
app.get('/api/customers/:id/orders', requireAuth, (req, res) => {
  const c = store.allCustomers().find(c => c.id === Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json({ customer: c, orders: store.accountOrders(c) });
});
app.put('/api/customers/:id', requireAuth, (req, res) => { store.updateCustomer(req.params.id, req.body || {}); res.json({ ok: true }); });
app.delete('/api/customers/:id', requireAdmin, (req, res) => { store.deleteCustomer(req.params.id); res.json({ ok: true }); });

// Coupons
app.get('/api/coupons', requireAuth, (req, res) => res.json(store.allCoupons()));
app.post('/api/coupons', requireAuth, (req, res) => {
  if (!req.body || !req.body.code) return res.status(400).json({ error: 'Code is required' });
  res.json({ ok: true, id: store.addCoupon(req.body).id });
});
app.put('/api/coupons/:id', requireAuth, (req, res) => { store.updateCoupon(req.params.id, req.body || {}); res.json({ ok: true }); });
app.delete('/api/coupons/:id', requireAuth, (req, res) => { store.deleteCoupon(req.params.id); res.json({ ok: true }); });

// Shipping
app.get('/api/shipping', requireAuth, (req, res) => res.json(store.allShipping()));
app.post('/api/shipping', requireAuth, (req, res) => {
  if (!req.body || !req.body.name) return res.status(400).json({ error: 'Name is required' });
  res.json({ ok: true, id: store.addShipping(req.body).id });
});
app.put('/api/shipping/:id', requireAuth, (req, res) => { store.updateShipping(req.params.id, req.body || {}); res.json({ ok: true }); });
app.delete('/api/shipping/:id', requireAuth, (req, res) => { store.deleteShipping(req.params.id); res.json({ ok: true }); });

// Payment methods
app.get('/api/payments', requireAuth, (req, res) => res.json(store.allPayments()));
app.post('/api/payments', requireAuth, (req, res) => {
  if (!req.body || !req.body.name) return res.status(400).json({ error: 'Name is required' });
  res.json({ ok: true, id: store.addPayment(req.body).id });
});
app.put('/api/payments/:id', requireAuth, (req, res) => { store.updatePayment(req.params.id, req.body || {}); res.json({ ok: true }); });
app.delete('/api/payments/:id', requireAuth, (req, res) => { store.deletePayment(req.params.id); res.json({ ok: true }); });

// Hotspots (net parts)
app.get('/api/hotspots', requireAuth, (req, res) => res.json(store.allHotspots()));
app.post('/api/hotspots', requireAuth, (req, res) => {
  if (!req.body || !req.body.name) return res.status(400).json({ error: 'Name is required' });
  res.json({ ok: true, id: store.addHotspot(req.body).id });
});
app.put('/api/hotspots/:id', requireAuth, (req, res) => {
  const h = store.updateHotspot(req.params.id, req.body || {});
  if (!h) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
app.delete('/api/hotspots/:id', requireAuth, (req, res) => { store.deleteHotspot(req.params.id); res.json({ ok: true }); });

// Net types (Explore section)
app.get('/api/nettypes', requireAuth, (req, res) => res.json(store.getNetTypes()));
app.put('/api/nettypes', requireAuth, (req, res) => res.json({ ok: true, types: store.setNetTypes(req.body || []) }));

// Audit log
app.get('/api/audit', requireAuth, (req, res) => res.json(store.allAudit()));

// ---- CSV exports ----
function csv(rows) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return rows.map(r => r.map(esc).join(',')).join('\r\n');
}
function sendCsv(res, name, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send('﻿' + csv(rows));
}
app.get('/api/export/orders.csv', requireAuth, (req, res) => {
  const head = ['Order', 'Date', 'Customer', 'Company', 'Email', 'Phone', 'Country', 'Items', 'Subtotal', 'Discount', 'Shipping', 'Total', 'Currency', 'Status', 'Payment'];
  const rows = store.allOrders().map(o => [o.order_number, o.created_at, o.customer.full_name, o.customer.company, o.customer.email, o.customer.phone, o.customer.country,
    o.items.map(i => `${i.name} x${i.quantity}`).join('; '), o.subtotal, o.discount, o.shipping_charge, o.total, o.currency, o.status, o.payment_status]);
  sendCsv(res, 'orders.csv', [head, ...rows]);
});
app.get('/api/export/customers.csv', requireAuth, (req, res) => {
  const head = ['Name', 'Company', 'Email', 'Phone', 'Country', 'Orders', 'Total Spent', 'Blocked'];
  const rows = store.allCustomers().map(c => [c.name, c.company, c.email, c.phone, c.country, c.order_count, c.total_spent, c.blocked ? 'yes' : '']);
  sendCsv(res, 'customers.csv', [head, ...rows]);
});
app.get('/api/export/inventory.csv', requireAuth, (req, res) => {
  const head = ['Product', 'Variant', 'SKU', 'Category', 'Supplier', 'Warehouse', 'Unit',
    'Stock', 'Reserved', 'Available', 'Reorder at', 'Cost', 'Price', 'Stock value', 'Margin', 'Margin %', 'Profit'];
  const rows = store.inventoryLines().map(l => [l.name, l.label, l.sku, l.category, l.supplier, l.warehouse, l.unit,
    l.stock, l.reserved, l.available, l.low_at, l.cost, l.price, l.stock_value, l.margin, l.margin_pc, l.profit]);
  sendCsv(res, 'inventory.csv', [head, ...rows]);
});
app.get('/api/export/products.csv', requireAuth, (req, res) => {
  const head = ['Name', 'SKU', 'Category', 'Brand', 'Price', 'Wholesale', 'Discount', 'Currency', 'Stock', 'Reserved', 'Available', 'Low at', 'Status', 'Published'];
  const rows = store.allProducts().map(p => [p.name, p.sku, p.category_name, p.brand, p.price, p.wholesale_price, p.discount_price, p.currency,
    p.stock_quantity, p.reserved_stock, p.available_stock, p.low_stock_threshold, p.stock_status, p.published ? 'yes' : '']);
  sendCsv(res, 'products.csv', [head, ...rows]);
});

// ---- Printable stock-count sheet (walk the warehouse, write counts, then key them into Adjust) ----
app.get('/stock-count', requireAuth, (req, res) => {
  const s = store.getSettings();
  const esc = (v) => String(v ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  let lines = store.inventoryLines();
  if (req.query.category) lines = lines.filter(l => l.category === req.query.category);
  const rows = lines.map(l => `<tr>
    <td>${esc(l.name)}${l.label ? `<br><small>${esc(l.label)}</small>` : ''}</td>
    <td><small>${esc(l.sku)}</small></td>
    <td>${esc(l.warehouse)}</td>
    <td class="r">${l.stock} ${esc(l.unit)}</td>
    <td class="box"></td><td class="box wide"></td></tr>`).join('');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Stock count sheet</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1d1d1f;margin:1.5rem}
h1{color:#0a2540;margin:0 0 .2rem;font-size:1.4rem} .muted{color:#6e6e73;font-size:.85rem;margin-bottom:1rem}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th{text-align:left;font-size:.68rem;text-transform:uppercase;color:#6e6e73;border-bottom:2px solid #0a2540;padding:.45rem .4rem}
td{padding:.5rem .4rem;border-bottom:1px solid #ddd;vertical-align:top}
.r{text-align:right;white-space:nowrap} small{color:#6e6e73}
.box{border:1px solid #999;width:90px;height:30px;background:#fff}
.box.wide{width:150px}
.sign{margin-top:2rem;display:flex;gap:3rem;font-size:.85rem;color:#6e6e73}
.sign div{border-top:1px solid #999;padding-top:.3rem;min-width:200px}
@media print{.noprint{display:none} body{margin:.5rem} tr{page-break-inside:avoid}}
</style></head><body>
<h1>${esc(s.company_name || 'Stock count sheet')}</h1>
<div class="muted">Physical stock count · ${new Date().toLocaleDateString()} · ${lines.length} lines
${req.query.category ? ' · ' + esc(req.query.category) : ''}</div>
<table><thead><tr><th>Item</th><th>SKU</th><th>Location</th><th class="r">System qty</th><th>Counted</th><th>Notes</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6">No items.</td></tr>'}</tbody></table>
<div class="sign"><div>Counted by</div><div>Checked by</div><div>Date</div></div>
<p class="muted" style="margin-top:1rem">After counting, enter the counted figures in Admin → Inventory → ⚖ Adjust (choose a reason such as “Stock count”).</p>
<button class="noprint" onclick="window.print()" style="margin-top:1rem;padding:.6rem 1.2rem;border:none;background:#0071c5;color:#fff;border-radius:8px;cursor:pointer">Print</button>
</body></html>`);
});

// ---- Printable proforma invoice ----
app.get('/invoice/:id', requireAuth, (req, res) => {
  const o = store.getOrder(req.params.id);
  if (!o) return res.status(404).send('Order not found');
  const s = store.getSettings();
  const m = (v) => `${o.currency} ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const esc = (v) => String(v ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const rows = o.items.map(i => `<tr><td>${esc(i.name)}${i.sku ? `<br><small>${esc(i.sku)}</small>` : ''}${[i.size&&'Size: '+i.size,i.mesh_size&&'Mesh: '+i.mesh_size,i.md_size&&'MD: '+i.md_size,i.material,i.color].filter(Boolean).map(esc).join(' · ') ? `<br><small>${[i.size&&'Size: '+i.size,i.mesh_size&&'Mesh: '+i.mesh_size,i.md_size&&'MD: '+i.md_size,i.material,i.color].filter(Boolean).map(esc).join(' · ')}</small>` : ''}</td><td class="r">${i.quantity} ${esc(i.unit||'')}</td><td class="r">${i.unit_price?m(i.unit_price):'—'}</td><td class="r">${i.line_total?m(i.line_total):'—'}</td></tr>`).join('');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Proforma ${esc(o.order_number)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1d1d1f;max-width:800px;margin:2rem auto;padding:0 1.5rem}
h1{color:#0a2540;margin:0} .muted{color:#6e6e73} .head{display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem;border-bottom:2px solid #0a2540;padding-bottom:1rem;margin-bottom:1rem}
table{width:100%;border-collapse:collapse;margin:1rem 0} th{text-align:left;font-size:.72rem;text-transform:uppercase;color:#6e6e73;border-bottom:1px solid #ddd;padding:.5rem}
td{padding:.5rem;border-bottom:1px solid #eee;vertical-align:top} .r{text-align:right;white-space:nowrap} .tot{text-align:right;margin-top:1rem} .tot div{margin:.2rem 0} .big{font-size:1.2rem;font-weight:600;color:#0a2540}
.badge{display:inline-block;padding:.2rem .6rem;border-radius:99px;background:#eef4fb;color:#0071c5;font-size:.8rem;font-weight:600}
@media print{.noprint{display:none}}</style></head><body>
<div class="head"><div><h1>${esc(s.company_name || 'Marine Nets')}</h1><div class="muted">${esc(s.contact_address||'')}<br>${esc(s.contact_email||'')} · ${esc(s.contact_phone||'')}</div></div>
<div style="text-align:right"><h2 style="margin:0;color:#0a2540">PROFORMA INVOICE</h2><div class="muted">${esc(o.order_number)}<br>${esc((o.created_at||'').slice(0,10))}</div><div class="badge">${esc(o.payment_status)}</div></div></div>
<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem"><div><strong>Bill to</strong><br>${esc(o.customer.full_name)}<br>${esc(o.customer.company||'')}<br>${esc(o.customer.email||'')} · ${esc(o.customer.phone||'')}<br>${esc(o.customer.address||'')} ${esc(o.customer.country||'')}</div>
<div><strong>Shipping</strong><br>${esc(o.shipping_method||'To be advised')}<br>Payment: ${esc(o.payment_method||'—')}</div></div>
<table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot"><div>Subtotal: ${m(o.subtotal)}</div>${o.discount?`<div>Discount: −${m(o.discount)}</div>`:''}${o.tax?`<div>Tax: ${m(o.tax)}</div>`:''}${o.shipping_charge?`<div>Shipping: ${m(o.shipping_charge)}</div>`:''}<div class="big">Total: ${m(o.total)}</div></div>
<p class="muted" style="margin-top:2rem;font-size:.85rem">This is a proforma invoice for review. Payment instructions will be provided upon confirmation.</p>
<button class="noprint" onclick="window.print()" style="padding:.6rem 1.2rem;border:none;background:#0071c5;color:#fff;border-radius:8px;cursor:pointer">Print / Save as PDF</button>
</body></html>`);
});

// Reports + notifications + settings
app.get('/api/reports', requireAuth, (req, res) => res.json(store.reports()));
app.get('/api/notifications', requireAuth, (req, res) => res.json(store.allNotifications()));
app.get('/api/settings', requireAuth, (req, res) => res.json(store.getSettings()));
app.put('/api/settings', requireAuth, (req, res) => { store.setSettings(req.body || {}); res.json({ ok: true }); });

// =====================================================================
//  STATIC + ROUTES
// =====================================================================
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${req.protocol}://${req.get('host')}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const urls = [`${base}/`, `${base}/#products`, `${base}/#netparts`, `${base}/#contact`]
    .map(u => `  <url><loc>${u}</loc></url>`).join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
});

// uploads have content-unique filenames → cache aggressively; other assets 1 day
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); },
}));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

(async () => {
  /* Boot: decide whether to pull the cloud backup BEFORE any local change is
     mirrored upward. On an ephemeral host (Cloud Run) the disk is empty on every
     cold start, so we restore automatically whenever there's no real data yet.
     FIREBASE_RESTORE=1 forces a restore even over existing local data. */
  if (firebase.firebaseEnabled()) {
    const force = process.env.FIREBASE_RESTORE === '1';
    if (force || store.isEmpty()) {
      try {
        if (await store.restoreFromCloud())
          console.log(`[firebase] state restored from cloud backup${force ? ' (forced)' : ' (blank instance)'}`);
        else if (force) console.log('[firebase] no cloud backup found — keeping local state');
      } catch (e) { console.error('[firebase] restore failed:', e.message); }
    }
  }
  store.startCloudMirror();   // from here on, saves also go to Firestore
  // ---- Pre-launch safety check -------------------------------------------
  // Warns loudly about anything that is fine locally but dangerous in public.
  const warn = [];
  try {
    const admin = store.findUser('admin');   // findUser keeps password_hash; allUsers strips it
    if (admin && admin.password_hash && bcrypt.compareSync('admin123', admin.password_hash))
      warn.push('Admin password is still the default "admin123" — change it in Admin > Account.');
  } catch {}
  if (!process.env.SESSION_SECRET)
    warn.push('SESSION_SECRET is not set — sessions reset on every restart and are guessable.');
  if (!smsEnabled())
    warn.push('No SMS provider configured — customer phone sign-in will be unavailable to real users.');
  if (!firebase.firebaseEnabled())
    warn.push('Firebase is off — data lives only in data/app.json (lost if the host restarts on free tiers).');

  if (warn.length) {
    console.log('\n  ⚠  BEFORE GOING LIVE:');
    warn.forEach(w => console.log('     • ' + w));
  }

  app.listen(PORT, () => {
    console.log(`\n  Marine Nets B2B running at  http://localhost:${PORT}`);
    console.log(`  Storefront  ->  http://localhost:${PORT}/`);
    console.log(`  Admin panel ->  http://localhost:${PORT}/admin   (admin / admin123)`);
    console.log(`  Firebase    ->  ${firebase.firebaseEnabled() ? (firebase.storageEnabled() ? 'Firestore + Storage + Auth' : 'Firestore + Auth') : 'disabled (local mode)'}\n`);
  });
})();
