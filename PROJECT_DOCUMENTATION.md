# Shalom Marine Nets — Complete Reverse-Engineered Documentation

A full technical teardown of the project: architecture, data model, every API route, every
store method, every storefront and admin component, the styling system, all animations, all
design decisions — followed by the sequential build prompts and a single master prompt that
recreates the exact project.

---

## 1. Executive Overview

**What it is:** A production-style, single-command **B2B e-commerce + admin platform** for a
commercial fishing-net manufacturer ("Shalom Marine Nets"). It sells purse seine nets, gill
nets, trawl nets, fish-farm nets, ropes, floats, sinkers and marine accessories to fishing
fleets worldwide.

**Core idea:** A B2B *quote-to-order* flow. Customers browse, configure and add products to a
cart, then check out **without paying immediately**. Every order lands in the admin as
`pending`; the operator reviews pricing/stock/shipping, adjusts the total, and sends a
**payment request**. Payment rails (Bank Transfer, Wire/TT, Letter of Credit, COD, and
stubbed Stripe/PayPal) are admin-managed.

**Design language:** Apple-inspired — generous whitespace, soft blue-gray backgrounds
(`#F5F8FC`), thin 1px borders (`#E5EAF2`), restrained shadows, capsule buttons, glassmorphism
(backdrop blur), GPU-friendly CSS animations, and a navy→ocean brand palette.

**Guiding constraints (explicit design decisions):**
- **Zero external services required to run.** No database server, no cloud, no API keys.
  `npm install && npm start` and it runs.
- **No frontend framework.** Vanilla JS + a single hand-written CSS file per surface. (Framer
  Motion-style requests are fulfilled with GPU CSS transforms + tiny JS.)
- **JSON-file persistence** (`data/app.json`) via a hand-rolled store — no ORM, no SQL.
- **Pluggable integrations** — Twilio SMS and SMTP email degrade gracefully to dev-mode
  console logging when env vars are absent.
- **Server is the source of truth for money** — order totals are always recomputed
  server-side; the client is never trusted.

---

## 2. Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 18+ | Uses global `fetch` (Twilio) — no SDK |
| HTTP framework | Express 4 | `express`, `express-session` |
| Uploads | Multer | Two instances: images (8 MB) and media/video (80 MB) |
| Auth hashing | bcryptjs | Pure-JS, no native build |
| Persistence | JSON file | `data/app.json`, full-rewrite on each mutation |
| Email | nodemailer (lazy) | `require`d only when SMTP env configured |
| SMS | Twilio REST via `fetch` | No SDK; dev-mode fallback |
| Frontend | Vanilla HTML/CSS/JS | No build step, no bundler |
| Admin charts | Chart.js 4 (CDN) | Dashboard only |
| Fonts | System stack | `-apple-system, Segoe UI, Roboto…` (no web-font download) |

**Dependencies (`package.json`):** `bcryptjs ^2.4.3`, `express ^4.21.0`,
`express-session ^1.18.1`, `multer ^1.4.5-lts.1`. Scripts: `start` and `dev` both run
`node server.js`. `"type": "commonjs"`.

---

## 3. Folder Structure

```
/
├── server.js               # Express app: middleware, all API routes, static, invoice, SEO
├── db.js                   # JSON-file store: schema seeding + full store API (data layer)
├── sms.js                  # Pluggable Twilio SMS (dev-mode fallback)
├── email.js                # Pluggable nodemailer SMTP (dev-mode fallback)
├── package.json            # deps + start scripts
├── package-lock.json
├── README.md               # Operator-facing docs
├── data/
│   └── app.json            # The entire database (auto-created & seeded on first run)
└── public/                 # Served statically
    ├── index.html          # Storefront (single page)
    ├── favicon.svg         # Marine emblem favicon
    ├── css/style.css       # Storefront styles (~750 lines, one file)
    ├── js/main.js          # Storefront logic (~1300 lines, one IIFE)
    ├── img/
    │   ├── logo.svg        # Brand wordmark/emblem
    │   └── og-cover.png    # 1200×630 social share image (generated)
    ├── uploads/            # User-uploaded product/hero/diagram images & video
    └── admin/
        ├── index.html      # Admin shell (login + app + sidebar)
        ├── admin.css       # Admin styles (~175 lines)
        └── admin.js        # Admin SPA logic (~836 lines, one IIFE)
```

**Path/cache conventions:** static assets are versioned by query string (`style.css?v=…`,
`main.js?v=…`) which is bumped whenever CSS/JS changes so browsers always fetch fresh copies.
HTML is served `Cache-Control: no-cache`; `/uploads` are cached 30 days immutable
(content-unique filenames); other static assets cached 1 day.

---

## 4. Data Model (JSON Schema)

`data/app.json` is a single object. Top-level arrays: `users`, `categories`, `products`,
`orders`, `customers`, `coupons`, `shipping_methods`, `payment_methods`, `notifications`,
`hotspots`, `audit`. Plus `settings` (object) and `seq` (per-collection auto-increment
counters). IDs are integers from `seq`.

### 4.1 `users` (admin/staff)
```
{ id, username, role: 'admin'|'staff', name, password_hash (bcrypt) }
```
Seeded default: `admin` / `admin123` (role `admin`).

### 4.2 `categories`
```
{ id, name, sort_order }
```
Standard set always ensured on boot: **Nets, Ropes, Float, Sinker, Accessories** (missing
ones are auto-added without removing custom ones).

### 4.3 `products`
```
{ id, name, slug, description, category_id, brand,
  sku, barcode, images: [url...],
  specs: { size, mesh_size, material, color },
  units: [..], default_unit,
  price, cost_price, wholesale_price, discount_price,
  currency, tax_rate,
  stock_quantity, reserved_stock, low_stock_threshold, min_order,
  warehouse_location, sort_order, published (0|1), created_at }
```
Decorated at read time with: `category_name`, `effective_price` (discount or price),
`available_stock` (stock − reserved), `stock_status` (`in_stock`/`low_stock`/`out_of_stock`).
`cost_price` (purchasing price) added for the Inventory profit feature.

### 4.4 `orders`
```
{ id, order_number ('MN-YYYY-NNNN'), created_at, updated_at,
  customer: { full_name, company, email, phone, whatsapp, country,
              address, shipping_address, postal_code },
  items: [ { product_id, name, category, sku, quantity, unit,
             size, mesh_size, material, color, custom_specs,
             special_instructions, unit_price, line_total } ],
  subtotal, discount, coupon_code, tax,
  shipping_method, shipping_charge, total, currency,
  payment_method, payment_status ('pending'|'awaiting_payment'|'paid'…),
  status ('pending'|'confirmed'|'processing'|'packed'|'shipped'|'delivered'|'cancelled'|'refunded'),
  admin_notes, history: [ { ts, status, note } ], _stockCommitted? }
```

### 4.5 `customers`
```
{ id, email, name, company, phone, whatsapp, country,
  notes, blocked (0|1), verified (0|1), created_at, last_login? }
```
Decorated in `allCustomers()` with `order_count`, `total_spent`. Matched by email OR phone
(phone-only OTP customers supported).

### 4.6 `coupons`
```
{ id, code (UPPER), type: 'percentage'|'fixed', value, expiry, usage_limit, used_count, active }
```

### 4.7 `shipping_methods`
```
{ id, name, courier, charge, areas, eta, active, sort_order }
```
Seeded: Sea Freight (FCL/LCL), Air Freight, Local Courier.

### 4.8 `payment_methods`
```
{ id, key, name, instructions, enabled, sort_order }
```
Seeded: bank_transfer, wire_tt, lc (enabled); cod, stripe, paypal (disabled/stubbed).

### 4.9 `hotspots` (Explore Net Parts)
```
{ id, number (1..15), name, x (%), y (%), color, product_id (link),
  item: { name, description, category, features, uses,
          size, mesh_size, color, material, price, unit, image, in_stock },
  enabled, sort_order }
```
Decorated at read with `product` (the full decorated linked product) and a normalized `item`.
15 hotspots seeded (Float, Float Rope, Head Rope, Changala Valla, Mella Vala Charth, Fishing
Net, Thread, Safety Valla, Madavall Charth, Safety Valla, Changala Valla, Rope, Changala
Valla, Sinker Rope, Sinkers).

### 4.10 `notifications` and `audit`
- `notifications`: `{ id, type, message, ts, read }` (activity log, capped 200).
- `audit`: `{ id, actor, action, ts }` (capped 500, returns 200) — auto-recorded on every
  successful non-GET admin API call.

### 4.11 `settings` (key/value)
Hero (`hero_title`, `hero_subtitle`, `hero_media` (JSON array of `{type,url}`),
`hero_interval`, `hero_image` legacy), Net Parts (`netparts_title`, `netparts_desc`,
`netparts_button`, `netparts_diagram`), About (`about_title`, `about_body`,
`about_stat1..4` as `value|label`, `testimonials` as JSON), company (`company_name`,
`currency: 'INR'`, `default_tax_rate: 18`), contact (`contact_whatsapp/email/phone/address/
hours/map`), social (`social_facebook/instagram/linkedin/youtube`), SEO
(`seo_title/description/keywords`).

---

## 5. Backend — `server.js` (every route)

**Bootstrapping:** creates `public/uploads` if missing; two Multer instances (image-only
8 MB; image+video 80 MB). Security headers on all responses (`X-Content-Type-Options`,
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `X-XSS-Protection: 0`, `Permissions-Policy`).
`x-powered-by` disabled. JSON body limit 2 MB. Session cookie: httpOnly, `sameSite: lax`, 8h
maxAge; secret from `SESSION_SECRET` env or random per-boot. **Rate limiter** factory
(per-IP+path). **Auto audit** middleware logs every successful admin mutation.

**Guards:** `requireAuth` (session.userId), `requireAdmin` (session.role==='admin'),
`requireCustomer` (session.customerId).

### 5.1 Admin/staff auth
- `POST /api/auth/login` — bcrypt check; **login lockout**: 5 fails per IP → 15-min cooldown
  (429). Sets session, audits "Signed in".
- `POST /api/auth/logout` — destroys session.
- `GET /api/auth/me` — `{authenticated, username, role}`.
- `POST /api/auth/password` — change own password (min 6 chars).
- `GET/POST/DELETE /api/users` — staff management (**admin only**); can't delete self.

### 5.2 Customer auth (phone + OTP)
- `POST /api/customer/request-otp` — 6-digit code, bcrypt-hashed, 5-min TTL, 30s resend
  throttle; blocked customers rejected. **Dev mode** returns `devCode` when Twilio not
  configured.
- `POST /api/customer/verify-otp` — verifies (max 5 attempts), logs in / creates customer by
  phone, accepts optional `name` on first sign-up.
- `GET /api/customer/me`, `POST /api/customer/logout`, `GET /api/customer/orders` (by email OR
  phone), `PUT /api/customer/profile`.

### 5.3 Public storefront
- `GET /api/public/site` — `{ products (published, decorated), settings, shipping (active),
  payments (enabled) }`. Single hydration call.
- `GET /api/public/product/:id` — one decorated published product.
- `POST /api/public/coupon` — validate a coupon against a subtotal.
- `POST /api/public/track` — order tracking by number + email/phone (rate-limited).
- `GET /api/public/netparts` — diagram URL, texts, and public hotspots (with linked products).
- `POST /api/public/order` — **place order** (rate-limited 10/10min). Rebuilds every line
  total from real product prices; applies coupon; resolves shipping; computes tax from
  `default_tax_rate`; creates order (reserves stock, increments coupon usage, upserts
  customer, notifies); sends customer + admin emails. Returns `{order_number, id, total,
  currency}`.

### 5.4 Admin API (all `requireAuth`, some `requireAdmin`)
- **Products:** `GET/POST/PUT/DELETE /api/products[/:id]`, `POST /api/products/reorder`.
- **Uploads:** `POST /api/upload` (images ×12), `POST /api/upload-media` (image+video ×12,
  returns `{url, type}`).
- **Categories:** `GET/POST/PUT/DELETE /api/categories[/:id]`.
- **Orders:** `GET /api/orders`, `GET /api/orders/:id`, `PUT /api/orders/:id/status`
  (validated status enum + optional note + status email), `PUT /api/orders/:id`,
  `POST /api/orders/:id/request-payment`.
- **Customers:** `GET /api/customers`, `GET /api/customers/:id/orders`,
  `PUT /api/customers/:id` (notes/block), `DELETE` (**admin only**).
- **Coupons / Shipping / Payments:** full CRUD each.
- **Hotspots:** `GET/POST/PUT/DELETE /api/hotspots[/:id]`.
- **Audit:** `GET /api/audit`. **Reports:** `GET /api/reports`. **Notifications:**
  `GET /api/notifications`. **Settings:** `GET/PUT /api/settings`.
- **CSV exports:** `/api/export/orders.csv`, `/customers.csv`, `/products.csv` (UTF-8 BOM).
- **Proforma invoice:** `GET /invoice/:id` — self-contained printable HTML (Print → Save PDF).

### 5.5 Static & SEO
- `GET /robots.txt` (disallows `/admin`, links sitemap), `GET /sitemap.xml`.
- `express.static` for `/uploads` (30d immutable) and `public` (1d, HTML no-cache).
- `GET /admin` and `GET /` serve their `index.html`. Listens on `PORT` (default 3000).

---

## 6. Data Layer — `db.js` store API (every method)

Loads/creates `data/app.json`, normalizes arrays, seeds on first run (admin user, categories,
8 products, shipping, payments, 15 hotspots, settings defaults), and **ensures** standard
categories + settings defaults on every boot. `nextId(collection)` auto-increments;
`slugify`, `num`, `normPhone`, `fmt` helpers. `decorate(product)`, `hotspotView(hotspot)`,
`cleanItem(item)`, `effectivePrice`, `stockStatus`, `orderNumber` internal helpers.

Store methods (grouped): **users** (findUser, getUser, allUsers, addUser, deleteUser,
setPassword); **products** (allProducts, publishedProducts, getProduct, getProductDecorated,
addProduct, updateProduct, deleteProduct, reorderProducts, adjustStock); **categories**
(allCategories, addCategory, updateCategory, deleteCategory — nulls product links);
**coupons** (allCoupons, addCoupon, updateCoupon, deleteCoupon, findCoupon, validateCoupon);
**shipping** (allShipping, activeShipping, add/update/delete); **payments** (allPayments,
enabledPayments, add/update/delete); **customers** (upsertCustomer, getCustomerByEmail/Phone,
loginCustomerByPhone, updateCustomerProfile, allCustomers, updateCustomer, deleteCustomer,
customerOrders, accountOrders — match by email OR phone); **orders** (allOrders, getOrder,
createOrder — reserves stock/coupon usage/customer upsert/notify; updateOrderStatus — stock
transitions on cancel/refund and ship/deliver; updateOrder; requestPayment; trackOrder);
**audit** (addAudit, allAudit); **notifications** (notify, allNotifications); **reports**
(sales totals, monthly series, best sellers, low stock); **hotspots** (allHotspots,
publicHotspots, getHotspot, addHotspot, updateHotspot, deleteHotspot); **settings**
(getSettings, setSettings).

**Stock lifecycle:** order placement reserves stock; cancel/refund releases reservation;
ship/deliver commits reservation to an actual reduction exactly once (`_stockCommitted`).

---

## 7. Pluggable Integrations

**`sms.js`** — `sendSms(to, body)` posts to Twilio's REST endpoint using global `fetch` +
Basic auth when `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM` are set; otherwise logs to console and
returns `{sent:false, dev:true}`. `smsEnabled()` gates dev-code exposure in the OTP route.

**`email.js`** — `sendEmail(to, subject, text)` lazily `require`s nodemailer and sends when
`SMTP_HOST/USER/PASS` are set; otherwise logs to console. Used for order confirmation
(customer), new-order alert (operator), and status-change emails.

---

## 8. Storefront — `public/index.html` + `public/js/main.js`

Single-page storefront. `main.js` is one IIFE. On load it fetches `/api/public/site` into
`SITE`, then renders: settings/hero, products, net parts, about, contact, footer; wires cart,
account, modals. Helpers: `$`/`querySelector`, `esc`, `money` (₹ + en-IN grouping),
`GSTR/gross/gmoney/gstNote` (GST-inclusive display), `cssColor` (name→CSS, two-tone
`White/Red`→gradient), `qtyUnit`. Cart/saved persisted to `localStorage` (`mn_cart`,
`mn_saved`).

### 8.1 Navigation
Sticky top nav: brand emblem SVG + wordmark **"Shalom Marine Nets"** with tagline
**"Stronger Nets. Safer Seas."**; center links (Products, About, Contact); right cluster —
search (expanding popover with live product filter), **Sign in** (phone-OTP popover), cart
button with live badge count.

### 8.2 Hero (full-bleed, redesigned)
Full-bleed rotating **media gallery** background (`#heroMedia`) — images and video that
cross-fade with a Ken-Burns zoom; supports uploaded video (`autoplay muted loop`), YouTube
embeds (auto-converted), and navigation dots (bottom-right). A left-side white **scrim**
gradient keeps text legible over any photo. Left copy column: glass trust badge
(★★★★★ "Trusted by Commercial Fishing Fleets"), ocean eyebrow, huge uppercase headline, ocean
underline accent, subtitle, **Buy Now** (ocean) + **Explore Products** (ghost glass) CTAs.
Below: a white **feature strip** (Premium Quality, Marine Grade, Global Supply, Expert
Support with line icons); then a **navy gradient stats band** ("Built for Demanding
Conditions" + 25+ Years / 1000+ Clients / 50+ Countries / 99% Satisfaction). The section is
`min-height:100vh`, distributing bands via flex; feature strip pushed to the bottom via
`margin-top:auto`. Staggered entrance animations (`--d` delays); reduced-motion honored.

### 8.3 Products
Grid of premium compact **product cards** (Apple-inspired). Each card: image area with
multi-image auto-slideshow (arrows + dots), hover-zoom magnifier (desktop, pointer:fine),
category + name row with divider, rule under description, **In Stock** pill with green check,
selectable colour dots + size/mesh dropdowns (single-select per group), capsule **Buy Now**
(cart icon) + **Details** (doc icon) buttons. Prices shown **GST-inclusive** (`gmoney`) with
"incl. 18% GST". Category filter + sort (price/name/in-stock) + nav search filter the grid.
Card tilt on pointer, reveal-on-scroll (`IntersectionObserver`).

### 8.4 Buy Now configurator (`openBuy`)
Compact modal (no scroll): renders only relevant options per category via conditional fields
— Colour as visual swatches (`.buy-swatches`, tint reflected in header via `color-mix`), Size,
Mesh, Material as select (>1)/readonly (1)/input (0). Unit is read-only (admin default).
Quantity with live total (GST-inclusive). Sinker category shows **live piece calculation**
(e.g. 1 kg of 200 g = 5 pieces). Header tints to the selected colour with a modern drifting
**aurora sheen** + flowing bottom accent line. Add to Cart / Buy Now.

### 8.5 Product Details modal (`openDetails`)
Compact stacked layout that fits in 90vh with a sticky action bar: image on top
(clamped 220–290px, `object-fit:contain`, 16px radius) with gallery arrows + horizontal
thumbnails + hover-zoom + click-to-lightbox; small blue Category label; product name;
2-line-clamped description; optional colour swatches; a **2-column info-card grid**
(Material, Available Sizes, Availability In/Low/Out, GST-inclusive Price); sticky bottom bar
with **Add to Cart** + **Buy Now**.

### 8.6 Explore Fishing Net Components (redesigned two-column)
White rounded container on soft-blue `#F5F9FF`. Centered header (title + subtitle). **Left
(45%)** diagram card: uploaded diagram scaled with `object-contain`, 15 **navy circular
hotspots** with white numbers that **glow blue** on hover/active (aligned via a wrapper that
hugs the image). **Right (55%)** live **details panel** (equal height to the diagram card,
content top-aligned, never stretched): large gradient number **badge**, category eyebrow,
name, a **floating product image gallery** pinned top-right (fixed 140×140 main image with
`object-fit:contain`, thumbnails row 48×48 scrollable, side arrows, keyboard ←/→, swipe,
fade transitions, "No Image Available" fallback), 2-column info cards (Material, Available
Sizes, Availability, Price), **Features** and **Uses** pill tags, and a blue **View Product**
CTA (matches the Buy Now ocean colour) that opens the purchase drawer. **Below**: a
responsive grid of numbered **chips** (① Float … ⑮ Sinkers) — selected chip turns ocean-blue,
others lift 4px on hover; horizontally scrollable on mobile. On desktop (≥901px) the whole
section fits one viewport (`min-height:100vh`, flex bands: header ~10–12%, main ~70–75%, chips
~13–15%); stacks vertically on tablet/mobile. Data comes from either the linked product or a
manually-typed hotspot `item`.

### 8.7 Cart drawer, Checkout, Order tracking, Account
- **Cart drawer:** line items (image, name, GST-inclusive line price, specs, qty stepper,
  unit, save-for-later, remove), saved-for-later list, GST-inclusive subtotal/total, Checkout.
- **Checkout modal:** customer info (auto-filled if signed in), shipping method, payment
  method + instructions, coupon apply, **itemized GST breakdown** (Subtotal excl. GST,
  Discount, GST 18%, Shipping, Estimated Total) plus a green **"✓ 18% GST included"** badge;
  place order → confirmation with order number and server total.
- **Order tracking:** footer "Track Order" → number + email/phone → status + history.
- **Account:** Apple-style phone-OTP popover (+91 default) with optional name; signed-in
  account menu (My Orders, profile, sign out); resend timer.

### 8.8 About & Request-a-Quote (navy band model)
- **About:** the same **navy gradient stat band** as the hero — circular icon + editable
  heading/body on the left, four editable stats with icons on the right — then testimonials in
  a responsive card grid.
- **Request a Quote:** matching navy band (icon + "Fast, no-obligation quotes" + four
  capability columns: Worldwide Shipping, Bulk Pricing, Custom Sizes, Expert Support), then the
  quote form (name, company, email, phone, product autocomplete, quantity, **unit**, message)
  + contact info card. Submits as a quote order.

### 8.9 Footer & WhatsApp
Two-tone brand, explore/contact link columns, social icons, dynamic copyright. Floating
**WhatsApp** button (bottom-right) pre-filled with an enquiry message; hidden if no number.

---

## 9. Admin Panel — `public/admin/index.html` + `admin.js`

Login card ("Authorized personnel only.") → app shell with a **navy sidebar** (brand
"Shalom Marine Nets", nav items with active accent bar + glow) and a `main` view container.
`admin.js` is one IIFE routing `VIEWS` by nav `data-view`. Helpers: `$/$$`, `esc`, `money`
(₹), `api()` (fetch wrapper with 401→login), `toast`, `modal`, predefined spec option
constants and `specConfig(catId)`, chip multi-select helpers (`chipButtons`, `chipGroup`,
`chipValue`).

**Views:** Dashboard (Chart.js metrics, best sellers, low stock), Orders (list + detail modal:
status, payment, notes, proforma link, request payment), Products (list + editor modal),
Inventory, Customers (list + detail: orders, notes, block, delete), Coupons, Shipping,
Payments, **Net Parts** manager, Categories, Hero Banner, Contact Info (+ About/Testimonials),
SEO, Staff & Roles (admin only), Audit Log (admin only), Account.

**Product editor:** name, category (drives `specConfig`), brand, SKU, barcode, description,
**Explore-diagram part No.** link, spec chips (Size/diameter, Mesh, Colour, Material — shown/
hidden per category), default unit, pricing, stock, images. Category-aware: Rope→mm sizes/no
mesh/kg; Float→types (Apple/Plastic/Sponge/4"/6")/float colours/pcs/no mesh/material;
Sinker→gram weights/kg/no colour-mesh-material; Nets→ply sizes+mesh+colours+materials. On
save it also links the chosen hotspot to the product (1:1).

**Inventory:** editable **Purchase ₹** and **Selling ₹** + stock + low-at, computed **Unit
profit** and **Stock profit** (live, colored), a **Total stock profit** footer, and a per-row
**Edit→Save** toggle (rows locked as plain text until edited).

**Net Parts manager:** upload diagram, drag numbered hotspots to position, per-hotspot editor
with a **Category** selector that loads matching chip options (Type/Size, Mesh, Colour,
Material), price, unit, stock, **Features**, **Uses**, description, and image upload — plus an
optional linked product. This is the manual item source for the storefront components panel.

**Hero Banner:** headline, subtitle, **multi-media gallery** (upload multiple images/video or
paste YouTube/MP4 URL; tiles tagged Image/Video with remove), slide interval.

---

## 10. Styling System

**CSS variables (storefront `:root`):** `--navy:#0a2540; --ocean:#0071c5; --ocean-deep:#004b87;
--ink:#1d1d1f; --grey:#6e6e73; --line:#e5e7eb; --bg:#f5f7fa; --card:#fff; --radius:14px;
--page:#F5F8FC; --bg-soft:#F7F8FA;` plus an `--ease` cubic-bezier. Admin `:root` mirrors these.

**Systemic decisions:** system font stack (fast, no download); capsule buttons
(`border-radius:980px`); soft blue-gray section backgrounds with alternating scheme
(`#products/#contact` white, `#netparts #F5F9FF`, about band navy); 1px `--line` borders;
reduced/soft shadows; glassmorphism (`backdrop-filter: blur() saturate()`) on hero badge,
feature strip, and popovers; a shared `.stat-band` navy-gradient component reused by
hero/about/contact; global `[hidden]{display:none!important}`; `grid` columns use
`minmax(0,1fr)` + `min-width:0` to prevent nowrap blowouts.

**Animations (GPU CSS + tiny JS):** hero staggered entrance (`heroIn`), Ken-Burns
(`kenburns`), hero gallery cross-fade, glow pulse, feature reveal via `IntersectionObserver`,
card tilt on pointer, buy-now header aurora sheen (`pmAurora`) + flowing accent (`pmFlow`),
hotspot glow, chip hover lift, details/net-parts fade (`npFade`), gallery fade, WhatsApp pop.
All heavy motion respects `prefers-reduced-motion`.

---

## 11. Notable Design Decisions & Trade-offs

1. **Quote-to-order B2B flow** (no instant payment) — matches wholesale reality; total is
   operator-adjustable.
2. **Server recomputes all money** — client cart is a convenience only; never trusted.
3. **GST-inclusive display, itemized at checkout** — browsing prices show "incl. 18% GST";
   checkout shows Subtotal excl. GST + GST line + total, matching the server exactly.
4. **JSON store over SQL** — zero-setup; acceptable at SMB scale; single-writer (never run two
   instances against one file).
5. **Category-driven spec system** (`specConfig`) — one editor adapts to Rope/Float/Sinker/Net.
6. **Hotspot ↔ product 1:1 link + manual item fallback** — the diagram is purchasable whether
   or not a product is linked.
7. **Graceful degradation** — SMS/email/video all fall back cleanly; the diagram is optional.
8. **Cache-busting query versions** — sidesteps aggressive browser caching during iteration.
9. **Accessibility** — aria-labels, keyboard gallery nav, focus states, colour names beside
   swatches, reduced-motion.

---

## 12. Sequential Build Prompts

The following ordered prompts reconstruct the project as it was built (foundation first, then
the long iterative refinement that actually occurred).

**P1 — Foundation & data layer.** "Build a single-command Node.js + Express B2B e-commerce
platform for a fishing-net manufacturer with no database server — persist everything to a JSON
file (`data/app.json`) via a hand-rolled store module (`db.js`) exposing a `store` API. Seed
an admin user (`admin`/`admin123`, bcrypt), categories (Nets, Ropes, Float, Sinker,
Accessories), 8 seed products, shipping methods, payment methods, 15 net-part hotspots, and
settings defaults. Auto-increment integer IDs. Decorate products with category_name,
effective_price, available_stock, stock_status."

**P2 — Express server & security.** "Create `server.js`: security headers, disabled
x-powered-by, express-session (httpOnly, sameSite lax, 8h), a per-IP rate-limit factory,
requireAuth/requireAdmin/requireCustomer guards, and an auto audit-log middleware for admin
mutations. Serve `public/` statically; `/` and `/admin` route to their index.html."

**P3 — Admin auth + RBAC.** "Add admin/staff auth: `/api/auth/login` with bcrypt and a 5-fail
→ 15-min IP lockout, logout, me, change-password, and admin-only staff CRUD."

**P4 — Product/category/order/customer/coupon/shipping/payment APIs.** "Add full CRUD APIs for
products (with reorder + image upload via Multer), categories, orders (status enum + history +
stock lifecycle + status emails), customers (block/notes, admin-only delete), coupons,
shipping and payment methods."

**P5 — Public storefront API + order flow.** "Add `/api/public/site` hydration,
`/api/public/product/:id`, coupon validation, order tracking, and `/api/public/order` that
rebuilds all totals server-side, applies coupon/shipping/tax, reserves stock, upserts the
customer, and emails confirmation + operator alert."

**P6 — Pluggable SMS & email + customer OTP auth.** "Add `sms.js` (Twilio via fetch, dev
fallback) and `email.js` (lazy nodemailer, dev fallback). Add phone-number OTP customer auth
(request/verify, 6-digit bcrypt code, 5-min TTL, 30s resend, dev code exposure) that
creates/logs-in customers by phone with an optional name."

**P7 — Storefront UI (Apple-inspired).** "Build a single-page storefront (`index.html`,
`css/style.css`, `js/main.js`, no framework) with sticky nav, hero, product grid with cards,
Buy Now configurator modal, Details gallery modal, cart drawer, checkout modal, order tracking,
phone-OTP account popover, About + testimonials, Request-a-Quote form, footer, and a floating
WhatsApp button. System font stack; navy/ocean palette; capsule buttons; reveal-on-scroll;
reduced-motion support."

**P8 — Explore Net Parts (interactive diagram).** "Add a homepage section showing an uploaded
seine-net diagram with 15 numbered hotspots linked to products; hover glow + tooltip; click
opens a side drawer with the product to buy."

**P9 — Admin dashboard SPA.** "Build the admin panel (`admin/index.html`, `admin.css`,
`admin.js`) as a vanilla SPA with a navy sidebar and views: Dashboard (Chart.js), Orders,
Products, Inventory, Customers, Coupons, Shipping, Payments, Net Parts, Categories, Hero,
Contact, SEO, Staff, Audit, Account. Add CSV exports and a printable proforma invoice route."

**P10 — Growth + SEO + hardening.** "Add order tracking, WhatsApp deep-link, product
filter/sort, About/testimonials editing, CSV export, proforma invoice, audit log, sitemap.xml,
robots.txt, and product JSON-LD."

**P11 — Category-specific specs.** "Make product specs category-driven via `specConfig`: Rope =
mm diameters, no mesh, kg; Float = per-piece types (Apple/Plastic/Sponge/4"/6"), specific float
colours, no mesh/material; Sinker = kg with gram weights, no colour/mesh/material and a live
piece calculation; Nets = ply sizes + mesh + colours + materials. Split Float and Sinker into
separate categories and auto-ensure standard categories on boot. Use multi-select chips in the
admin and matching swatches/selects on the storefront."

**P12 — Product card + Buy Now + Details polish.** "Redesign product cards (compact,
colour dots, size/mesh dropdowns, capsule cart/doc buttons, In-Stock pill, hover-zoom,
slideshow). Make Buy Now show only relevant options with colour swatches, header colour tint,
read-only unit, and a modern animated header sheen. Redesign the Details modal to fit 90vh
with image-on-top, 2-column info cards, and a sticky Add-to-Cart/Buy-Now bar."

**P13 — Currency, GST, branding.** "Switch currency to ₹/INR with Indian grouping; treat legacy
USD as INR. Rebrand to 'Shalom Marine Nets' with a marine emblem logo, favicon, and og-cover.
Show all prices GST-inclusive (18%), with an itemized GST breakdown and a '18% GST included'
badge at checkout."

**P14 — Hotspot ↔ product linking + manual items.** "Let the product editor assign an
Explore-diagram part number (1:1 link). In the Net Parts manager, let each hotspot carry a
manually-typed item (category-driven chips for type/size/mesh/colour/material, price, unit,
stock, features, uses, image) so clicking a number is purchasable even without a linked
product."

**P15 — Explore Components redesign + galleries.** "Rebuild Explore Net Parts as a premium
two-column layout: diagram left with navy glowing hotspots, a live details panel right with a
floating fixed 140×140 top-right product gallery (thumbnails, arrows, keyboard, swipe, fade),
info cards, Features/Uses tags, and a View Product CTA; numbered chips below. Fit the whole
section in one viewport on desktop; stack on mobile."

**P16 — Hero gallery + full-bleed redesign.** "Make the hero a full-bleed rotating gallery of
multiple images and video (uploaded or YouTube) with cross-fade + Ken-Burns and dots, a
left-side scrim, left-aligned copy, a white feature strip, and a navy stats band. Add a
multi-media Hero Banner admin editor."

**P17 — Inventory profit + About/Contact bands + fixes.** "Add purchasing price to products;
in Inventory show Purchase/Selling/Unit-profit/Stock-profit with a live total and Edit→Save
rows. Restyle About and Request-a-Quote with the shared navy stat band. Unify the section
button colours to the Buy Now ocean, fix chip clipping, and polish the admin sidebar."

---

## 13. MASTER PROMPT (recreates the exact project)

> **Build "Shalom Marine Nets" — a single-command, zero-external-dependency B2B e-commerce +
> admin platform for a commercial fishing-net manufacturer, using only Node.js + Express +
> vanilla HTML/CSS/JS and a JSON-file data store. No database server, no cloud, no API keys, no
> frontend framework, no build step. `npm install && npm start` must run it on port 3000.**
>
> **Architecture.** `server.js` (Express: security headers, disabled x-powered-by,
> express-session with httpOnly/sameSite-lax/8h cookie and `SESSION_SECRET` env, a per-IP
> rate-limit factory, `requireAuth`/`requireAdmin`/`requireCustomer` guards, an auto audit-log
> middleware, two Multer uploaders — images 8 MB and image+video 80 MB, static serving with
> versioned cache headers, `/robots.txt`, `/sitemap.xml`, and a printable `/invoice/:id`).
> `db.js` (a hand-rolled JSON store persisting to `data/app.json`, auto-incrementing integer
> IDs, seeding on first run and ensuring defaults on every boot). `sms.js` (Twilio via global
> fetch with dev-mode console fallback) and `email.js` (lazy nodemailer with dev-mode
> fallback). `public/` holds the storefront (`index.html`, `css/style.css`, `js/main.js`), the
> admin (`admin/index.html`, `admin.css`, `admin.js`), `img/` (logo.svg, og-cover.png),
> `favicon.svg`, and `uploads/`.
>
> **Data model** (JSON arrays + settings + seq counters): users (bcrypt, roles admin/staff),
> categories (Nets/Ropes/Float/Sinker/Accessories, always ensured), products (name, slug,
> category, brand, sku, images[], specs{size,mesh_size,material,color}, units[], default_unit,
> price, cost_price, wholesale_price, discount_price, currency, tax_rate, stock_quantity,
> reserved_stock, low_stock_threshold, min_order, warehouse_location, published — decorated
> with category_name/effective_price/available_stock/stock_status), orders (order_number
> MN-YYYY-NNNN, customer block, items[] with per-line specs and totals, subtotal/discount/
> coupon/tax/shipping/total/currency, payment_status, status enum with history[] and a stock
> lifecycle: reserve on placement, release on cancel/refund, commit once on ship/deliver),
> customers (matched by email OR phone, block/notes/verified), coupons (percentage/fixed,
> expiry, usage limit), shipping_methods, payment_methods (bank_transfer/wire_tt/lc enabled;
> cod/stripe/paypal stubbed), hotspots (1–15, x/y %, colour, product_id link, and a manual
> `item` with category/features/uses/size/mesh/colour/material/price/unit/image/in_stock),
> notifications, audit (capped), and settings (hero_title/subtitle/media JSON/interval, netparts
> texts/diagram, about_title/body/stat1..4 as "value|label"/testimonials JSON, company_name,
> currency INR, default_tax_rate 18, contact + social + SEO fields).
>
> **APIs.** Admin/staff auth with a 5-fail→15-min IP lockout and audit; customer phone-OTP auth
> (6-digit bcrypt code, 5-min TTL, 30s resend, dev-code exposure, optional name); public
> `/api/public/site` hydration, product, coupon-validate, order-track, netparts, and
> `/api/public/order` that rebuilds all totals server-side (never trust the client), applies
> coupon/shipping/tax(18%), reserves stock, upserts the customer, and emails confirmation +
> operator alert; full admin CRUD for products (+reorder +image/media upload), categories,
> orders (status+note+email), customers, coupons, shipping, payments, hotspots; reports, audit,
> notifications, settings; CSV exports for orders/customers/products.
>
> **Storefront (Apple-inspired; navy #0a2540 / ocean #0071c5; soft-blue #F5F8FC; system fonts;
> capsule buttons; 1px borders; soft shadows; glassmorphism; GPU CSS animations that respect
> prefers-reduced-motion; cache-busting `?v=` on CSS/JS).** Sticky nav (emblem + "Shalom Marine
> Nets" / "Stronger Nets. Safer Seas.", Products/About/Contact, expanding search, phone-OTP Sign
> in, cart badge). A **full-bleed hero** with a rotating image+video gallery (cross-fade +
> Ken-Burns + dots, uploaded video and YouTube), a left scrim, left-aligned copy (glass trust
> badge, uppercase headline, ocean underline, Buy Now + Explore CTAs), a white feature strip,
> and a navy gradient stats band — the section fits `min-height:100vh`. A **product grid** of
> compact cards (image slideshow + hover-zoom, colour dots + size/mesh selects, In-Stock pill,
> capsule Buy Now + Details) with category filter/sort/search and GST-inclusive prices. A **Buy
> Now** configurator that renders only category-relevant options (colour swatches with header
> tint + aurora sheen, size/mesh/material, read-only unit, live GST-inclusive total, live sinker
> piece calc). A **Details** modal that fits 90vh (image-on-top gallery + thumbnails + hover
> zoom + lightbox, category label, 2-line description, 2-column info cards, sticky Add-to-Cart /
> Buy-Now). An **Explore Fishing Net Components** section: white rounded card on #F5F9FF, header,
> left diagram card (object-contain image, 15 navy circular hotspots that glow blue), right live
> details panel (equal height, top-aligned) with a floating fixed 140×140 top-right product
> gallery (48×48 thumbnails, side arrows, keyboard ←/→, swipe, fade, "No Image Available"
> fallback), Material/Sizes/Availability/Price cards, Features/Uses pill tags, and an ocean View
> Product CTA — plus numbered chips (① Float … ⑮ Sinkers, active=ocean, hover lift) below; the
> whole section fits one desktop viewport and stacks on mobile. A **cart drawer** and
> **checkout** with GST-inclusive line prices, an itemized breakdown (Subtotal excl. GST /
> Discount / GST 18% / Shipping / Estimated Total) and a green "✓ 18% GST included" badge; order
> tracking; a phone-OTP account popover; an **About** section and a **Request-a-Quote** section
> both rendered with a shared navy gradient **stat band** (icon + heading/text + four stat/
> capability columns); testimonials; a two-tone footer; and a pre-filled floating WhatsApp
> button.
>
> **Admin SPA** (navy sidebar with active accent bar; vanilla router): Dashboard (Chart.js,
> best sellers, low stock), Orders (detail modal: status, payment, notes, proforma link, request
> payment), Products (category-driven `specConfig` editor with multi-select spec chips, an
> Explore-diagram part-number link, pricing, stock, images), Inventory (editable Purchase/
> Selling prices, live Unit-profit and Stock-profit with a total and per-row Edit→Save),
> Customers (orders, notes, block, delete), Coupons, Shipping, Payments, **Net Parts** (upload
> diagram, drag hotspots, per-hotspot category-driven chip editor with price/unit/stock/features/
> uses/image + optional linked product), Categories, **Hero Banner** (multi-image + video +
> YouTube gallery, interval), Contact Info (+ About/Testimonials/stats), SEO, Staff & Roles
> (admin only), Audit Log (admin only), Account.
>
> **Behavioural rules:** the server is the single source of truth for money; the JSON store is
> single-writer; prices are shown GST-inclusive while checkout itemizes the 18% GST to match the
> server; the diagram, video, SMS and email all degrade gracefully; everything is keyboard- and
> reduced-motion-friendly. Default admin `admin`/`admin123` (changeable under Account).

---

*End of documentation.*
