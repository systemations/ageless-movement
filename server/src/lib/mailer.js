import { Resend } from 'resend';
import { config } from './config.js';

// Transactional email via Resend. One client, created once from the API key.
// If the key is unset (local dev before Resend is wired) we keep `resend`
// null and sendEmail() falls back to logging — so every email-dependent flow
// (password reset) still works end-to-end locally without real delivery.
const resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;

export function isEmailConfigured() {
  return !!resend;
}

// Escape values interpolated into email HTML. Names come from user input, so
// without this a display name like `<img onerror=...>` would inject markup
// into the message body. URLs we build ourselves (base + hex token).
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Send one email. Returns { delivered, fallback?, id? }. Throws only on a
// real Resend API error so callers can decide whether to surface it; the
// no-key fallback never throws.
export async function sendEmail({ to, subject, html, text }) {
  if (!resend) {
    console.warn(
      `[mailer] RESEND_API_KEY not set — email NOT sent.\n` +
      `         to=${to}\n         subject="${subject}"`,
    );
    return { delivered: false, fallback: true };
  }
  const { data, error } = await resend.emails.send({
    from: config.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });
  if (error) {
    console.error('[mailer] Resend send failed:', error);
    throw new Error(error.message || 'Email send failed');
  }
  return { delivered: true, id: data?.id };
}

// Password-reset email template. Plain, single-CTA layout that renders well
// across clients (inline styles, no external CSS). `resetUrl` is shown as a
// fallback link too, since some clients strip button styling.
export function passwordResetEmail({ name, resetUrl, expiresMinutes = 60 }) {
  const firstName = name ? String(name).trim().split(/\s+/)[0] : 'there';
  const subject = 'Reset your Ageless Movement password';
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:8px 4px;color:#1a1a1a">
    <h2 style="font-size:20px;font-weight:800;margin:0 0 12px">Reset your password</h2>
    <p style="font-size:15px;line-height:1.55;margin:0 0 16px">
      Hi ${esc(firstName)}, we received a request to reset your Ageless Movement password.
      Tap the button below to choose a new one. This link expires in ${esc(expiresMinutes)} minutes.
    </p>
    <p style="margin:0 0 20px">
      <a href="${esc(resetUrl)}" style="display:inline-block;background:#FF8C00;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 24px;border-radius:10px">
        Reset password
      </a>
    </p>
    <p style="font-size:13px;line-height:1.5;color:#666;margin:0 0 6px">
      If the button doesn't work, paste this link into your browser:
    </p>
    <p style="font-size:13px;word-break:break-all;margin:0 0 20px">
      <a href="${esc(resetUrl)}" style="color:#0a66c2">${esc(resetUrl)}</a>
    </p>
    <p style="font-size:13px;line-height:1.5;color:#666;margin:0">
      Didn't request this? You can safely ignore this email — your password won't change.
    </p>
  </div>`;
  const text =
    `Hi ${firstName},\n\n` +
    `We received a request to reset your Ageless Movement password.\n` +
    `Open this link to choose a new one (expires in ${expiresMinutes} minutes):\n\n` +
    `${resetUrl}\n\n` +
    `Didn't request this? You can safely ignore this email — your password won't change.\n`;
  return { subject, html, text };
}
