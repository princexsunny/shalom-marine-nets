# Partner Marketplace — How It Works

Outside fishing-net companies can register on your site, list their products, and
receive buyer enquiries directly. You stay in control: nothing appears publicly
until you approve it.

**Model: enquiry-only.** Buyers request a quote; the vendor contacts them and the
sale happens between them. You do not take payment, so you are not the seller of
record and carry no GST or refund liability for their goods.

---

## The flow, end to end

1. **Company registers** at `yoursite.com/vendor` (also linked in your footer under
   "For Manufacturers"). They give company details, GST, contact and what they sell.
2. **You review** in Admin → **Partners**. Approve or reject.
3. **They sign in** at `/vendor` with their mobile number + OTP (same Firebase phone
   auth your customers use — no passwords to manage).
4. **They add products** with photos, specs and prices. Each listing is created as
   *pending*.
5. **You review listings** in Admin → **Partner Listings**. Approve to publish.
6. **Buyers see them** on your homepage under "From Our Partner Manufacturers",
   each marked **"Sold by [Company]"**.
7. **Buyer clicks Request Quote** → enquiry emailed to the vendor *and* to you,
   and it appears in the vendor's dashboard and in Admin → **Enquiries**.

---

## What you control

| Action | Where |
|---|---|
| Approve / reject a company | Admin → Partners |
| Suspend a company (hides all their listings instantly) | Admin → Partners |
| Approve / hide an individual listing | Admin → Partner Listings |
| See every enquiry across all partners | Admin → Enquiries |
| Delete a company and all their products | Admin → Partners → View → Delete |
| Private notes about a company | Admin → Partners → View → Internal notes |

Approving a company emails them automatically (if SMTP is configured and they gave
an email address).

---

## What vendors can and cannot do

**Can:** sign in with their phone, add/edit/delete their own products, upload
photos, see and update their own enquiries, edit their company profile.

**Cannot:** see any other company's products, enquiries, or customers; see your own
sales, costs or inventory; publish anything without your approval; change their
registered phone number (that's their login — you change it for them).

Editing a live listing sends it back to *pending* so you re-check changes. This
prevents someone getting approved with an honest listing and then swapping in
something else.

---

## Product IDs

Each vendor gets a SKU prefix from their company name, then a sequence:

- Anand Coir Co → `ANA-0001`, `ANA-0002`, …
- Bharat Nets → `BHA-0001`, …

Your own products keep their existing SKUs, so there's no clash.

---

## Why this scales to 50+ vendors

Your original shop stores everything in **one** JSON document mirrored to a single
Firestore document, which Firestore caps at **1 MB**. That is fine for one company
but would break with thousands of partner products — and the failure is silent.

So the marketplace uses **separate Firestore collections with one document per
record** (`vendors`, `vendor_products`, `enquiries`). No size ceiling.

Your existing shop data (`db.js`) was **not touched**. Two stores side by side:
your business keeps working exactly as before, and the marketplace grows in a
structure built for it.

A 60-second in-memory cache fronts public reads so a busy storefront doesn't
trigger a Firestore read per visitor. Any write clears the cache immediately, so
approvals show up straight away.

---

## Setup

**Nothing new to configure** if you've already set up Firebase Phone Auth (see
`PAYMENTS_AND_OTP_SETUP.md`). The marketplace reuses:

- **Firebase Phone Auth** → vendor sign-in
- **Firebase Storage** → vendor product photos
- **Firestore** → marketplace data
- **SMTP** (optional) → approval and enquiry emails

Without Firebase configured it falls back to a local file (`data/marketplace.json`)
so you can test on your own machine — but **do not run the live site that way**,
because Render wipes local files on restart.

**Security note:** your `firestore.rules` denies all browser access with a
catch-all rule, which already covers the new collections. All marketplace reads
and writes go through your server. Don't loosen that rule.

---

## Before you launch

- [ ] Have a lawyer review `/vendor/terms.html` — it's a plain-language starting
      point, not legal advice.
- [ ] Decide your GST-number policy: eyeball them, or verify against the
      government API later.
- [ ] Approve your first partner yourself and walk their listing end to end.
- [ ] Test that a suspended vendor's products disappear from the storefront.
- [ ] Decide whether to charge later — listing is free today. If you introduce
      fees, tell partners in advance (the terms say you will).

---

## Files added / changed

**New:** `vendors.js`, `public/vendor/index.html`, `public/vendor/vendor.js`,
`public/vendor/vendor.css`, `public/vendor/terms.html`

**Changed:** `server.js` (marketplace API), `firebase.js` (collection helpers),
`public/admin/admin.js` + `public/admin/index.html` (Partners, Partner Listings,
Enquiries), `public/index.html` (partner section, footer link, nav),
`public/js/main.js` (partner listings + enquiry modal), `public/css/style.css`
(marketplace styles)

---

## Verified behaviour

The data layer was tested for security isolation and correctness — all passing:

- A vendor cannot edit, delete, or view another vendor's products or enquiries
- Products stay hidden until individually approved
- Suspending a company hides every one of its listings immediately
- Editing an approved listing pulls it back off the site until re-approved
- Duplicate phone numbers and GST numbers are rejected at registration
- A vendor cannot add products before their company is approved
- Public data never exposes internal admin notes
