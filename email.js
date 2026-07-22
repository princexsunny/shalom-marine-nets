/**
 * Pluggable email sender.
 * - If SMTP env vars are set, sends real email via nodemailer (installed on demand).
 * - Otherwise DEV mode: logs the email to the server console.
 *
 * To enable real email, set these before `npm start` and run `npm install nodemailer`:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
const HOST = process.env.SMTP_HOST, PORT = process.env.SMTP_PORT,
      USER = process.env.SMTP_USER, PASS = process.env.SMTP_PASS,
      FROM = process.env.SMTP_FROM || process.env.SMTP_USER;

const emailEnabled = () => Boolean(HOST && USER && PASS);
let transporter = null;

async function sendEmail(to, subject, text) {
  if (!to) return { sent: false };
  if (!emailEnabled()) {
    console.log(`\n[EMAIL DEV MODE] To ${to} | ${subject}\n${text}\n(Set SMTP_* env vars + install nodemailer to send.)\n`);
    return { sent: false, dev: true };
  }
  try {
    if (!transporter) {
      const nodemailer = require('nodemailer');   // lazy — only needed when configured
      transporter = nodemailer.createTransport({
        host: HOST, port: Number(PORT) || 587, secure: Number(PORT) === 465,
        auth: { user: USER, pass: PASS },
      });
    }
    await transporter.sendMail({ from: FROM, to, subject, text });
    return { sent: true };
  } catch (e) {
    console.error('[EMAIL] send failed:', e.message);
    return { sent: false, error: 'email_failed' };
  }
}

module.exports = { sendEmail, emailEnabled };
