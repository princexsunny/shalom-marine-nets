/**
 * Pluggable SMS sender.
 * - If Twilio env vars are set, sends a real SMS via Twilio's REST API (uses global
 *   fetch — no SDK, no native modules).
 * - Otherwise runs in DEV mode: prints the message to the server console. The caller
 *   may surface the code to the page so you can test without an SMS account.
 *
 * To enable real SMS, set these environment variables before `npm start`:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM   (your Twilio sending number)
 */
const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_FROM;

const smsEnabled = () => Boolean(SID && TOKEN && FROM);

async function sendSms(to, body) {
  if (!smsEnabled()) {
    console.log(`\n[SMS DEV MODE] To ${to}: ${body}\n(Set TWILIO_* env vars to send real messages.)\n`);
    return { sent: false, dev: true };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`;
  const auth = Buffer.from(`${SID}:${TOKEN}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: FROM, Body: body });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) { console.error('[SMS] Twilio error', res.status, await res.text()); return { sent: false, error: 'sms_failed' }; }
    return { sent: true };
  } catch (e) {
    console.error('[SMS] send failed', e.message);
    return { sent: false, error: 'sms_failed' };
  }
}

module.exports = { sendSms, smsEnabled };
