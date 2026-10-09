// Email through one interface: console (development: printed + kept in a dev outbox) or Resend.
import { config } from '../config.js';

const outbox = []; // development only: the last 50 emails, shown at /dev/outbox

function layout(title, bodyHtml, brand = 'OneJump') {
  return `<!doctype html><html><body style="margin:0;background:#F4F6F1;font-family:Archivo,Helvetica,Arial,sans-serif;color:#12281F">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-weight:800;font-size:20px;letter-spacing:-.02em;margin-bottom:20px">${escapeHtml(brand)}</div>
    <div style="background:#fff;border-radius:16px;padding:24px;border:1px solid rgba(18,40,31,.1)">
      <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>${bodyHtml}
    </div>
    <p style="font-size:12px;color:#56685E;margin-top:16px">Sent by OneJump on behalf of ${escapeHtml(brand)}. OneJump never markets to you.</p>
  </div></body></html>`;
}
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function button(href, label) {
  return `<p style="margin:20px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#12281F;color:#F4F6F1;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">${escapeHtml(label)}</a></p><p style="font-size:12px;color:#56685E;word-break:break-all">Or paste this link: ${escapeHtml(href)}</p>`;
}

async function deliver(msg) {
  if (config.email.provider === 'resend' && config.email.resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.email.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.email.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, reply_to: msg.replyTo }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Email failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return { id: (await res.json()).id };
  }
  const entry = { ...msg, at: new Date().toISOString() };
  outbox.unshift(entry);
  outbox.length = Math.min(outbox.length, 50);
  if (!config.isTest) console.log(`[email] to ${msg.to}: ${msg.subject}${msg.link ? `\n        ${msg.link}` : ''}`);
  return { id: `console-${outbox.length}` };
}

export const EmailService = {
  provider: () => config.email.provider,
  outbox: () => outbox,

  sendInvite({ to, clientName, coachName, businessName, link }) {
    const first = (clientName || '').split(' ')[0] || 'there';
    return deliver({
      to, link, subject: `${coachName} invited you to ${businessName}`,
      text: `Hi ${first}, ${coachName} set up your coaching app. Open it here: ${link}`,
      html: layout(`You’re invited, ${first}`, `<p>${escapeHtml(coachName)} set up your coaching app with ${escapeHtml(businessName)}. Your program, check-ins and messages live there.</p>${button(link, 'Open my app')}<p style="font-size:13px;color:#56685E">This link works once and expires in 14 days.</p>`, businessName),
    });
  },
  sendMagicLink({ to, name, businessName, link }) {
    const first = (name || '').split(' ')[0] || 'there';
    return deliver({
      to, link, subject: `Your login link for ${businessName || 'OneJump'}`,
      text: `Hi ${first}, here's your login link (valid 30 minutes): ${link}`,
      html: layout(`Log in, ${first}`, `<p>Tap the button to open your coaching app. The link works once and expires in 30 minutes.</p>${button(link, 'Log in')}<p style="font-size:13px;color:#56685E">Didn’t ask for this? You can ignore it.</p>`, businessName || 'OneJump'),
    });
  },
  sendCoachMessage({ to, businessName, subject, text }) {
    return deliver({ to, subject, text, html: layout(subject, `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`, businessName) });
  },
  /** Alerts for the coach (urgent flags, the morning briefing). No client health details in the email itself. */
  sendCoachAlert({ to, subject, text, link, linkLabel = 'Open OneJump' }) {
    return deliver({ to, link, subject, text: `${text}\n\n${link}`, html: layout(subject, `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>${button(link, linkLabel)}`) });
  },
  sendMigrationRequest({ fromName, fromEmail, businessName, body }) {
    return deliver({ to: 'hello@onejumpfit.com', replyTo: fromEmail, subject: `Migration request: ${businessName}`, text: `${fromName} <${fromEmail}>\n\n${body}`, html: layout('Migration request', `<p><b>${escapeHtml(fromName)}</b> (${escapeHtml(fromEmail)}) · ${escapeHtml(businessName)}</p><p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>`) });
  },
};
