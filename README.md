# Marine Nets — B2B Purchasing & Inventory Platform

An Apple-inspired storefront for purse seine fishing nets & marine equipment, with a full
admin dashboard for orders, inventory, customers, coupons, shipping, payments and reports.
Runs with one command — no database server, cloud accounts or API keys required.

## Quick start

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm start
```

- **Storefront** — http://localhost:3000
- **Admin panel** — http://localhost:3000/admin  (default `admin` / `admin123` — change under Account)

## How the B2B order flow works

Customers browse products, configure them (Buy Now), add to cart and check out **without
paying immediately**. Each order lands in the admin as **Pending**. You review pricing,
stock and shipping, adjust the total if needed, then **Send Payment Request**. Payment
methods (Bank Transfer, Wire/TT, Letter of Credit, Cash on Delivery) are fully managed from
the admin — Stripe and PayPal are listed and ready to enable once keys are added.

## Customer side

- **Buy Now** on every product opens a configurator: quantity, unit (Piece/Roll/Meter/Kg),
  size, mesh size, material, color, custom specifications, special instructions — with a
  **live total**.
- **Cart drawer**: add to cart, update quantity, remove, save for later, cart total.
- **Checkout**: full customer info (name, company, email, phone, WhatsApp, country,
  address, postal code), shipping method, payment method, coupon code, order summary,
  place order → order confirmation with order number.
- **View Details** opens a product gallery with specifications.

## Growth features (Phase 1)

- **Order tracking (no account):** customers click "Track Order" in the footer and enter their
  order number + email/phone to see status and history.
- **Floating WhatsApp button:** appears bottom-right, pre-fills a chat to your WhatsApp number
  (from Admin → Contact). Hidden if no number is set.
- **Product filter & sort:** category filter and sort (price, name, in-stock) on the storefront,
  plus the nav search.
- **About & testimonials section:** editable in Admin → Contact & Store (heading, text, four
  stats, and testimonials as JSON).
- **CSV export:** one-click export of orders, customers and products from the admin (buttons on
  each page).
- **Proforma invoice:** open any order in the admin and click "Proforma Invoice" for a clean
  printable page — use the browser's Print → Save as PDF.
- **Security hardening:** rate-limiting on public endpoints, admin login lockout (5 fails →
  15-min cooldown), and security headers. Set a strong `SESSION_SECRET` in production.
- **Audit log:** Admin → Audit Log records every admin/staff change (who, what, when).
- **SEO:** `/sitemap.xml`, `/robots.txt`, and product structured data (JSON-LD).
- **Email notifications (pluggable):** order confirmation to the customer, new-order alert to
  you, and status-change emails. Dev mode logs to console; to send real email set
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` and run `npm install nodemailer`.

## Explore Net Parts (interactive diagram)

A compact section on the homepage shows your seine-net diagram with 15 numbered hotspots,
a numbered parts list, and an intro with an "Explore All Parts" button. Hovering a number
glows/pulses it, highlights the matching list item, and shows a tooltip; clicking opens an
Apple-style side drawer (blurred background) with the linked product's image, description,
sizes, mesh, material, colours, stock status, price, a quantity selector, and **Buy Now /
Add to Cart**. The selected hotspot stays highlighted while the drawer is open.

**First-time setup (one step):** the diagram image couldn't be bundled automatically, so
open **Admin → Net Parts**, click **Upload diagram**, and choose your "Parts of Fishing
Seine Net" image. The 15 hotspots are already created and pre-linked to products — just drag
each numbered pin onto its part on your diagram (positions save on release).

In **Admin → Net Parts** you can upload/replace the diagram, add/edit/delete hotspots, drag
to reposition, set each hotspot's colour, link it to any product, and enable/disable it.
Because hotspots read the product live, updating a product's price, stock, images or specs
in the Products tab instantly updates what the hotspot drawer shows.

## Customer accounts (phone + SMS OTP login)

Customers can sign in from the storefront with their phone number: they enter their number,
receive a 6-digit code, and verify it — no password to remember. Signed-in customers get a
**My Orders** panel (order history + live status) and their checkout form is pre-filled.

**Works immediately in demo mode.** With no SMS provider configured, the code is printed to
the server console and shown on the sign-in screen so you can test right away.

**To send real texts**, set these environment variables before `npm start` (any Twilio
account works — the app calls Twilio's API directly, no extra install):

```
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_FROM=+1XXXXXXXXXX      # your Twilio sending number
```

Security: codes are bcrypt-hashed, expire after 5 minutes, allow 5 attempts, and are
rate-limited to one send per 30 seconds. Blocking a customer in the admin also blocks
their sign-in. Orders link to the account automatically by matching phone or email.

## Admin dashboard

- **Dashboard** — total sales, orders, pending orders, customers, a 6-month revenue chart,
  best sellers and low-stock list.
- **Orders** — search/filter by status & payment; open any order to see items, customer,
  history; update status (Pending → Confirmed → Processing → Packed → Shipped → Delivered,
  or Cancelled/Refunded), set payment status, adjust total, add notes, send payment request.
- **Products** — add/edit/delete, drag to reorder, multiple images + gallery, description,
  specs (size, mesh, material, color), SKU, barcode, category, brand; pricing (selling,
  wholesale, discount, currency, tax); inventory (stock, low-stock alert, warehouse).
- **Inventory** — fast stock editor with live In Stock / Low Stock / Out of Stock status.
- **Customers** — list with order counts and lifetime spend; purchase/order history,
  notes, block, delete.
- **Coupons** — percentage or fixed discounts, expiry dates, usage limits.
- **Shipping** — methods, couriers, charges, delivery areas, estimated times.
- **Payments** — manage methods and the instructions customers see; enable/disable each.
- **Categories, Hero banner, Contact & store (currency/tax), SEO** — all editable.
- **Staff & Roles** — add admin or staff users (role-based access; staff can't manage
  staff or delete customers). Passwords are bcrypt-hashed.

**Stock automation:** placing an order reserves stock; shipping/delivering commits it;
cancelling or refunding releases it.

## Notes on the requested stack

You asked for a Next.js 15 / PostgreSQL / Prisma / Cloudinary / Stripe build. Per our
discussion this was built as an extension of the existing zero-setup Express app so it runs
immediately with no external services. The trade-offs versus that stack:

- **Auth:** secure sessions + bcrypt hashing + admin/staff RBAC (instead of JWT — equivalent
  protection for a server-rendered app).
- **Storage:** JSON file at `data/app.json` + local `public/uploads/` (instead of
  PostgreSQL/Prisma + Cloudinary). Same data model; swappable later.
- **Payments:** offline B2B methods now, with Stripe/PayPal slots ready to wire up.
- **Email notifications** are recorded as an activity log; connect SMTP to send real mail.

## Testing

Core commerce logic (order totals, coupon discounts, shipping, stock reservation, stock
commit on ship, cancel/refund restock, reports, best-sellers) is covered by unit tests and
passes. To reset all data to seeded defaults, stop the server and delete `data/app.json`.

## Project structure

```
server.js            Express server + commerce API + RBAC
db.js                JSON data store, seed data, all business logic
public/
  index.html js/ css/   Storefront (hero, products, cart, checkout)
  admin/                Admin dashboard (orders, inventory, customers, coupons, …)
  uploads/              Uploaded images
data/app.json        Your data (auto-created)
```

## Deploying

Any Node host works (Render, Railway, a VPS). Set `SESSION_SECRET` (long random string) and
`PORT`, change the default admin password, and serve over HTTPS.
