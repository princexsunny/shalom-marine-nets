/**
 * Marketplace data layer — vendor companies, their products, and buyer enquiries.
 *
 * WHY THIS IS SEPARATE FROM db.js
 * -------------------------------
 * db.js keeps the whole shop in one JSON blob mirrored to a SINGLE Firestore
 * document, which Firestore caps at 1 MB. That is fine for one company, but a
 * marketplace with 50+ vendors and thousands of products would silently blow
 * past that cap and stop backing up.
 *
 * So the marketplace stores ONE DOCUMENT PER RECORD in real Firestore
 * collections (vendors / vendor_products / enquiries). No ceiling, and the
 * existing single-company shop in db.js is left completely untouched.
 *
 * When Firebase is not configured, everything falls back to a local JSON file
 * (data/marketplace.json) so the site still runs on a dev machine.
 *
 * An in-memory cache fronts every read: the public storefront hits this on
 * every page load and we do not want a Firestore read per visitor.
 */
const fs = require('fs');
const path = require('path');
const firebase = require('./firebase');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'marketplace.json');

const COL_VENDORS = 'vendors';
const COL_PRODUCTS = 'vendor_products';
const COL_ENQUIRIES = 'enquiries';

// ---------------------------------------------------------------- local store
let local = { vendors: [], vendor_products: [], enquiries: [] };
function loadLocal() {
  try {
    if (fs.existsSync(FILE)) {
      const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      local = {
        vendors: Array.isArray(d.vendors) ? d.vendors : [],
        vendor_products: Array.isArray(d.vendor_products) ? d.vendor_products : [],
        enquiries: Array.isArray(d.enquiries) ? d.enquiries : [],
      };
    }
  } catch (e) { console.error('[marketplace] could not read local file:', e.message); }
}
function saveLocal() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(local, null, 2));
  } catch (e) { console.error('[marketplace] could not write local file:', e.message); }
}
loadLocal();

const useCloud = () => firebase.firebaseEnabled();

// -------------------------------------------------------------------- cache
/* Short-lived cache so a busy storefront does not cause a Firestore read per
   visitor. Any write clears the affected list. */
const CACHE_MS = 60 * 1000;
const cache = new Map();                       // key -> { at, data }
const cacheGet = (k) => {
  const c = cache.get(k);
  return c && (Date.now() - c.at) < CACHE_MS ? c.data : null;
};
const cacheSet = (k, data) => { cache.set(k, { at: Date.now(), data }); return data; };
const cacheClear = (prefix) => {
  for (const k of [...cache.keys()]) if (!prefix || k.startsWith(prefix)) cache.delete(k);
};

// ------------------------------------------------------------------- helpers
const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();
const normPhone = (s) => String(s || '').replace(/\D/g, '');
/* Compare on the last 10 digits so "+919876543210", "919876543210" and
   "9876543210" are all treated as the same number. */
const samePhone = (a, b) => {
  const x = normPhone(a).slice(-10), y = normPhone(b).slice(-10);
  return x.length === 10 && x === y;
};
const clean = (s, max = 300) => String(s == null ? '' : s).trim().slice(0, max);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Vendor SKU prefix from the company name, e.g. "Anand Coir Co" -> "ANA". */
function skuPrefix(name) {
  const letters = String(name || '').toUpperCase().replace(/[^A-Z]/g, '');
  return (letters.slice(0, 3) || 'VEN').padEnd(3, 'X');
}

// generic read of a whole collection (cloud or local), cached
async function readAll(col) {
  const ck = 'all:' + col;
  const hit = cacheGet(ck);
  if (hit) return hit;
  const rows = useCloud() ? await firebase.colAll(col) : [...(local[col] || [])];
  return cacheSet(ck, rows);
}
async function writeOne(col, row) {
  if (useCloud()) await firebase.colSet(col, row.id, row);
  else {
    const arr = local[col] || (local[col] = []);
    const i = arr.findIndex(x => x.id === row.id);
    if (i >= 0) arr[i] = row; else arr.push(row);
    saveLocal();
  }
  /* Clear everything, not just this collection: derived views such as
     "public:products" are built from BOTH products and vendors, so a
     collection-scoped clear would leave them stale. Writes are rare
     compared with reads, so this costs little. */
  cacheClear();
  return row;
}
async function deleteOne(col, id) {
  if (useCloud()) await firebase.colDelete(col, id);
  else { local[col] = (local[col] || []).filter(x => x.id !== id); saveLocal(); }
  cacheClear();
  return true;
}
async function readOne(col, id) {
  if (!id) return null;
  if (useCloud()) return await firebase.colGet(col, id);
  return (local[col] || []).find(x => x.id === id) || null;
}

// =============================================================== VENDORS
const VENDOR_STATUS = ['pending', 'approved', 'suspended', 'rejected'];

/** Public-safe view of a vendor (never leaks internal notes). */
function publicVendor(v) {
  if (!v) return null;
  return {
    id: v.id, company_name: v.company_name, city: v.city, state: v.state,
    categories: v.categories, description: v.description, logo: v.logo,
    website: v.website, since: (v.approved_at || v.created_at || '').slice(0, 10),
  };
}

const marketplace = {
  // ---- registration (public) ----
  async registerVendor(d = {}) {
    const phone = normPhone(d.phone);
    if (!clean(d.company_name)) return { error: 'Company name is required' };
    if (phone.length < 10) return { error: 'A valid 10-digit mobile number is required' };
    if (!clean(d.contact_name)) return { error: 'Contact person name is required' };

    const all = await readAll(COL_VENDORS);
    if (all.some(v => samePhone(v.phone, phone)))
      return { error: 'This mobile number is already registered. Sign in instead.' };
    if (d.gst && all.some(v => v.gst && v.gst.toUpperCase() === clean(d.gst).toUpperCase()))
      return { error: 'This GST number is already registered.' };

    const v = {
      id: uid('v'),
      company_name: clean(d.company_name, 120),
      contact_name: clean(d.contact_name, 80),
      phone,                                   // login key (Firebase phone auth)
      email: clean(d.email, 120),
      gst: clean(d.gst, 20).toUpperCase(),
      address: clean(d.address, 400),
      city: clean(d.city, 60),
      state: clean(d.state, 60),
      pincode: clean(d.pincode, 10),
      website: clean(d.website, 160),
      categories: clean(d.categories, 200),
      description: clean(d.description, 800),
      logo: clean(d.logo, 400),
      status: 'pending',
      sku_prefix: skuPrefix(d.company_name),
      seq: 0,
      created_at: nowIso(),
      approved_at: '', approved_by: '', admin_notes: '',
    };
    await writeOne(COL_VENDORS, v);
    return { ok: true, vendor: v };
  },

  async allVendors(status) {
    const all = await readAll(COL_VENDORS);
    const rows = status ? all.filter(v => v.status === status) : all;
    return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  },
  async getVendor(id) { return await readOne(COL_VENDORS, id); },
  async getVendorByPhone(phone) {
    if (!normPhone(phone)) return null;
    const all = await readAll(COL_VENDORS);
    return all.find(v => samePhone(v.phone, phone)) || null;
  },
  /** Approved vendors only — what the storefront shows. */
  async publicVendors() {
    const all = await readAll(COL_VENDORS);
    return all.filter(v => v.status === 'approved')
      .sort((a, b) => String(a.company_name).localeCompare(String(b.company_name)))
      .map(publicVendor);
  },

  async setVendorStatus(id, status, actor) {
    if (!VENDOR_STATUS.includes(status)) return { error: 'Invalid status' };
    const v = await readOne(COL_VENDORS, id);
    if (!v) return { error: 'Vendor not found' };
    v.status = status;
    v.updated_at = nowIso();
    if (status === 'approved' && !v.approved_at) { v.approved_at = v.updated_at; v.approved_by = actor || ''; }
    await writeOne(COL_VENDORS, v);
    // suspending a vendor must immediately hide their listings
    if (status !== 'approved') cacheClear('all:' + COL_PRODUCTS);
    return { ok: true, vendor: v };
  },
  async updateVendor(id, d = {}, { adminFields = false } = {}) {
    const v = await readOne(COL_VENDORS, id);
    if (!v) return { error: 'Vendor not found' };
    const editable = ['company_name', 'contact_name', 'email', 'address', 'city', 'state',
      'pincode', 'website', 'categories', 'description', 'logo', 'gst'];
    editable.forEach(k => { if (d[k] !== undefined) v[k] = clean(d[k], k === 'description' ? 800 : 400); });
    if (adminFields && d.admin_notes !== undefined) v.admin_notes = clean(d.admin_notes, 1000);
    v.updated_at = nowIso();
    await writeOne(COL_VENDORS, v);
    return { ok: true, vendor: v };
  },
  async deleteVendor(id) {
    // remove the vendor and everything of theirs
    const prods = (await readAll(COL_PRODUCTS)).filter(p => p.vendor_id === id);
    for (const p of prods) await deleteOne(COL_PRODUCTS, p.id);
    await deleteOne(COL_VENDORS, id);
    return { ok: true, removed_products: prods.length };
  },

  // =============================================================== PRODUCTS
  async addProduct(vendorId, d = {}) {
    const v = await readOne(COL_VENDORS, vendorId);
    if (!v) return { error: 'Vendor not found' };
    if (v.status !== 'approved') return { error: 'Your account is not approved yet.' };
    if (!clean(d.name)) return { error: 'Product name is required' };

    v.seq = (v.seq || 0) + 1;
    const p = {
      id: uid('p'),
      vendor_id: v.id,
      vendor_name: v.company_name,
      sku: `${v.sku_prefix}-${String(v.seq).padStart(4, '0')}`,
      name: clean(d.name, 140),
      category: clean(d.category, 80),
      description: clean(d.description, 1500),
      images: Array.isArray(d.images) ? d.images.slice(0, 8).map(u => clean(u, 500)) : [],
      price: num(d.price),
      unit: clean(d.unit, 20) || 'kg',
      moq: num(d.moq) || 1,
      material: clean(d.material, 80),
      size: clean(d.size, 80),
      mesh_size: clean(d.mesh_size, 80),
      md_size: clean(d.md_size, 80),
      color: clean(d.color, 80),
      stock_status: ['in_stock', 'low_stock', 'out_of_stock', 'made_to_order'].includes(d.stock_status)
        ? d.stock_status : 'in_stock',
      status: 'pending',                       // every listing is reviewed before it goes public
      created_at: nowIso(), updated_at: nowIso(),
    };
    await writeOne(COL_PRODUCTS, p);
    await writeOne(COL_VENDORS, v);            // persist the incremented sequence
    return { ok: true, product: p };
  },

  async updateProduct(id, d = {}, vendorId) {
    const p = await readOne(COL_PRODUCTS, id);
    if (!p) return { error: 'Product not found' };
    if (vendorId && p.vendor_id !== vendorId) return { error: 'Not your product' };
    const editable = ['name', 'category', 'description', 'price', 'unit', 'moq', 'material',
      'size', 'mesh_size', 'md_size', 'color', 'stock_status'];
    editable.forEach(k => {
      if (d[k] === undefined) return;
      if (k === 'price' || k === 'moq') p[k] = num(d[k]);
      else p[k] = clean(d[k], k === 'description' ? 1500 : 140);
    });
    if (Array.isArray(d.images)) p.images = d.images.slice(0, 8).map(u => clean(u, 500));
    // a vendor editing a live listing sends it back for review
    if (vendorId && p.status === 'approved') p.status = 'pending';
    p.updated_at = nowIso();
    await writeOne(COL_PRODUCTS, p);
    return { ok: true, product: p };
  },

  async setProductStatus(id, status) {
    if (!['pending', 'approved', 'rejected'].includes(status)) return { error: 'Invalid status' };
    const p = await readOne(COL_PRODUCTS, id);
    if (!p) return { error: 'Product not found' };
    p.status = status; p.updated_at = nowIso();
    await writeOne(COL_PRODUCTS, p);
    return { ok: true, product: p };
  },
  async deleteProduct(id, vendorId) {
    const p = await readOne(COL_PRODUCTS, id);
    if (!p) return { error: 'Product not found' };
    if (vendorId && p.vendor_id !== vendorId) return { error: 'Not your product' };
    await deleteOne(COL_PRODUCTS, id);
    return { ok: true };
  },
  async getProduct(id) { return await readOne(COL_PRODUCTS, id); },
  async vendorProducts(vendorId) {
    const all = await readAll(COL_PRODUCTS);
    return all.filter(p => p.vendor_id === vendorId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  },
  async allProducts(status) {
    const all = await readAll(COL_PRODUCTS);
    const rows = status ? all.filter(p => p.status === status) : all;
    return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  },
  /**
   * Approved products belonging to approved vendors — the storefront view.
   * Both checks matter: suspending a vendor must hide their listings even
   * though each product is still individually "approved".
   */
  async publicProducts() {
    const ck = 'public:products';
    const hit = cacheGet(ck);
    if (hit) return hit;
    const [prods, vends] = await Promise.all([readAll(COL_PRODUCTS), readAll(COL_VENDORS)]);
    const okVendors = new Set(vends.filter(v => v.status === 'approved').map(v => v.id));
    const rows = prods
      .filter(p => p.status === 'approved' && okVendors.has(p.vendor_id))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return cacheSet(ck, rows);
  },

  // =============================================================== ENQUIRIES
  async addEnquiry(d = {}) {
    const product = d.product_id ? await readOne(COL_PRODUCTS, d.product_id) : null;
    if (d.product_id && !product) return { error: 'Product not found' };
    if (!clean(d.name)) return { error: 'Your name is required' };
    const phone = normPhone(d.phone);
    if (phone.length < 10 && !clean(d.email)) return { error: 'A phone number or email is required' };

    const e = {
      id: uid('e'),
      vendor_id: product ? product.vendor_id : clean(d.vendor_id, 40),
      vendor_name: product ? product.vendor_name : '',
      product_id: product ? product.id : '',
      product_name: product ? product.name : clean(d.product_name, 140),
      product_sku: product ? product.sku : '',
      name: clean(d.name, 80),
      company: clean(d.company, 120),
      phone,
      email: clean(d.email, 120),
      quantity: num(d.quantity) || 1,
      unit: clean(d.unit, 20) || (product ? product.unit : 'kg'),
      message: clean(d.message, 1200),
      status: 'new',                            // new | contacted | quoted | closed
      created_at: nowIso(),
      vendor_seen: false,
    };
    await writeOne(COL_ENQUIRIES, e);
    return { ok: true, enquiry: e };
  },
  async vendorEnquiries(vendorId) {
    const all = await readAll(COL_ENQUIRIES);
    return all.filter(e => e.vendor_id === vendorId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  },
  async allEnquiries() {
    const all = await readAll(COL_ENQUIRIES);
    return all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  },
  async setEnquiryStatus(id, status, vendorId) {
    if (!['new', 'contacted', 'quoted', 'closed'].includes(status)) return { error: 'Invalid status' };
    const e = await readOne(COL_ENQUIRIES, id);
    if (!e) return { error: 'Enquiry not found' };
    if (vendorId && e.vendor_id !== vendorId) return { error: 'Not your enquiry' };
    e.status = status; e.vendor_seen = true; e.updated_at = nowIso();
    await writeOne(COL_ENQUIRIES, e);
    return { ok: true, enquiry: e };
  },

  // =============================================================== STATS
  async stats() {
    const [vends, prods, enqs] = await Promise.all([
      readAll(COL_VENDORS), readAll(COL_PRODUCTS), readAll(COL_ENQUIRIES),
    ]);
    return {
      vendors_total: vends.length,
      vendors_pending: vends.filter(v => v.status === 'pending').length,
      vendors_approved: vends.filter(v => v.status === 'approved').length,
      products_total: prods.length,
      products_pending: prods.filter(p => p.status === 'pending').length,
      products_approved: prods.filter(p => p.status === 'approved').length,
      enquiries_total: enqs.length,
      enquiries_new: enqs.filter(e => e.status === 'new').length,
    };
  },
  async vendorStats(vendorId) {
    const [prods, enqs] = await Promise.all([readAll(COL_PRODUCTS), readAll(COL_ENQUIRIES)]);
    const mine = prods.filter(p => p.vendor_id === vendorId);
    const myEnq = enqs.filter(e => e.vendor_id === vendorId);
    return {
      products: mine.length,
      products_live: mine.filter(p => p.status === 'approved').length,
      products_pending: mine.filter(p => p.status === 'pending').length,
      enquiries: myEnq.length,
      enquiries_new: myEnq.filter(e => e.status === 'new').length,
    };
  },

  publicVendor,
  _clearCache: cacheClear,
};

module.exports = { marketplace };
