/**
 * Optional Razorpay payment integration — no SDK, uses global fetch + crypto HMAC.
 *
 * Enabled ONLY when both keys are present. When not configured every helper
 * safely no-ops and the storefront falls back to the B2B "review then pay" flow.
 *
 * To enable, set these environment variables (get them from the Razorpay
 * dashboard → Settings → API Keys):
 *   RAZORPAY_KEY_ID        e.g. rzp_live_xxxxxxxx  (or rzp_test_xxxx while testing)
 *   RAZORPAY_KEY_SECRET    the matching secret — NEVER expose this to the browser
 *
 * The Key ID is safe to send to the client (it's needed to open checkout);
 * the Key Secret stays on the server and is used to verify the payment signature.
 */
const crypto = require('crypto');

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

const rzpEnabled = () => Boolean(KEY_ID && KEY_SECRET);
const rzpKeyId = () => KEY_ID || '';

/**
 * Create a Razorpay order for the given amount.
 * @param {number} amountMajor  amount in rupees (major units) — converted to paise here
 * @param {string} currency     ISO currency, defaults to INR
 * @param {string} receipt      your own reference (we pass the order number)
 * @returns {object|null}       the Razorpay order ({ id, amount, currency, ... }) or null
 */
async function createOrder(amountMajor, currency = 'INR', receipt = '') {
  if (!rzpEnabled()) return null;
  const amount = Math.round(Number(amountMajor) * 100); // paise / smallest unit
  if (!(amount > 0)) return null;
  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  try {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency, receipt: String(receipt).slice(0, 40), payment_capture: 1 }),
    });
    if (!res.ok) { console.error('[razorpay] create order failed', res.status, await res.text()); return null; }
    return await res.json();
  } catch (e) {
    console.error('[razorpay] create order error', e.message);
    return null;
  }
}

/**
 * Verify the signature Razorpay returns to the browser after a successful payment.
 * signature === HMAC_SHA256(order_id + "|" + payment_id, key_secret)
 * @returns {boolean}
 */
function verifySignature(orderId, paymentId, signature) {
  if (!rzpEnabled() || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  // constant-time compare
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

module.exports = { rzpEnabled, rzpKeyId, createOrder, verifySignature };
