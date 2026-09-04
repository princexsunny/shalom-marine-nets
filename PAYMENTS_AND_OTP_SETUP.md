# OTP Sign-in (Firebase Phone Auth) + Razorpay Payments — Setup

Both features are now built into the code. They stay **off** until you add the
environment variables below on Render, so nothing breaks in the meantime.

---

## Part 1 — OTP sign-in with Firebase Phone Auth

Your project already verifies Firebase tokens on the server. The storefront now
also does the phone + code flow in the browser using Firebase, so Google sends
the SMS (free tier, reliable in India, no DLT paperwork).

### Steps

1. **Firebase console → your project → Authentication → Get started.**
2. **Sign-in method → Phone → Enable → Save.**
3. **Authentication → Settings → Authorized domains → Add domain.** Add your
   live site domain (e.g. `your-app.onrender.com`, and your custom domain if you
   have one). `localhost` is already allowed for testing.
4. **Project settings (gear) → General → Your apps.** If you don't have a **Web
   app** yet, click the `</>` icon to register one. Copy the `firebaseConfig`
   values it shows — `apiKey`, `authDomain`, `projectId`, `appId`,
   `messagingSenderId`. These are **not secret**; they're safe in the browser.
5. **On Render → your service → Environment**, add:

   | Variable | Value (from firebaseConfig) |
   |---|---|
   | `FIREBASE_WEB_API_KEY` | `apiKey` |
   | `FIREBASE_WEB_AUTH_DOMAIN` | `authDomain` (e.g. `your-project.firebaseapp.com`) |
   | `FIREBASE_WEB_PROJECT_ID` | `projectId` |
   | `FIREBASE_WEB_APP_ID` | `appId` (optional but recommended) |
   | `FIREBASE_WEB_SENDER_ID` | `messagingSenderId` (optional) |

6. Redeploy. Done — the "Sign In" button now uses Firebase phone OTP.

**Note:** Free phone-auth SMS has a monthly quota. Beyond it, Firebase asks you
to enable billing (you're already on Blaze) and charges a small per-SMS fee.
Firebase also shows an invisible reCAPTCHA to block abuse — that's automatic.

If these Firebase env vars are **not** set, the site falls back to your existing
Twilio-based OTP (which needs `TWILIO_*` vars and DLT registration for India).

---

## Part 2 — Razorpay online payments

After a customer places an order, they now see a **Pay Now Online** button
(UPI, cards, netbanking, wallets). Payment is verified on the server before the
order is marked paid — the browser can't fake it.

### Steps

1. **Sign up at [razorpay.com](https://razorpay.com)** and complete KYC
   (business PAN + bank account). This is required before you can accept live
   payments — it's on you and can take a day or two to approve.
2. While waiting, you can test immediately using **Test Mode** keys.
3. **Razorpay dashboard → Settings → API Keys → Generate Key.** You get a
   **Key ID** and a **Key Secret**. Copy both. (Test keys start with
   `rzp_test_`, live keys with `rzp_live_`.)
4. **On Render → Environment**, add:

   | Variable | Value |
   |---|---|
   | `RAZORPAY_KEY_ID` | your Key ID (`rzp_test_…` or `rzp_live_…`) |
   | `RAZORPAY_KEY_SECRET` | your Key Secret — **keep this private** |

5. Redeploy. The **Pay Now Online** button appears at the end of checkout.

**Important:** The Key Secret must only ever live on the server (Render env var).
Never put it in the front-end code or commit it to GitHub. The code only sends
the Key ID to the browser, which is the safe, intended design.

### Currency
Razorpay charges in **INR**. Make sure your store currency (Admin → Settings) is
INR, or the amount Razorpay collects may not match what the customer expects.

### Testing a payment (Test Mode)
Use Razorpay's test card `4111 1111 1111 1111`, any future expiry, any CVV, and
any name. In test mode no real money moves. Switch to live keys once KYC is
approved.

---

## Quick checklist

**OTP (Firebase):**
- [ ] Phone provider enabled in Firebase Auth
- [ ] Live domain added to Authorized domains
- [ ] 3 required `FIREBASE_WEB_*` env vars set on Render
- [ ] Redeployed, tested sign-in on the live site

**Razorpay:**
- [ ] Razorpay account + KYC (for live) — or test keys for now
- [ ] `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` set on Render
- [ ] Store currency is INR
- [ ] Redeployed, placed a test order, paid with a test card

---

## What changed in the code (for reference)

- `razorpay.js` — new helper (create order + verify signature, no SDK).
- `server.js` — `/api/public/pay/create` + `/api/public/pay/verify` endpoints;
  exposes `razorpay_key` and non-secret `firebase_config` to the storefront.
- `db.js` — `getOrderByNumber`, `attachRazorpayOrder`, `markOrderPaid`.
- `public/js/main.js` — Firebase phone-auth sign-in flow; Razorpay "Pay Now"
  button on the order-success screen with server-side verification.

Files to push to GitHub for this to go live:
`razorpay.js`, `server.js`, `db.js`, `public/js/main.js`.
