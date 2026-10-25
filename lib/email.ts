// Email via Resend. Without RESEND_API_KEY, emails are printed to the terminal
// instead, so the app works fully in development with no account.
//
// Addresses at example.com (seed and demo accounts) are never sent to a real
// mail server: those inboxes don't exist, and sending to them would bounce and
// hurt your sending reputation with Resend.
import { Resend } from "resend";

export type Email = { to: string; subject: string; text: string; html?: string };

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const link = (path: string) => `${appUrl()}${path}`;

async function deliver(msg: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const fake = /@example\.(com|org|net)$/i.test(msg.to);
  if (!key || fake) {
    if (process.env.EMAIL_LOG === "off") return; // the seed script turns logging off
    console.log(`\n[email${fake ? " (fake address, not sent)" : ""}] to=${msg.to}\nsubject: ${msg.subject}\n${msg.text}\n`);
    return;
  }
  const from = process.env.EMAIL_FROM ?? "Wo Ọ̀nà <onboarding@resend.dev>";
  const { error } = await new Resend(key).emails.send({
    from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html ?? simpleHtml(msg.text),
  });
  if (error) console.error("[email] Resend error:", error.message);
}

/**
 * Send without making the person wait. Inside a request, Next's after() runs it
 * once the response has gone out. In scripts (no request), it just runs.
 * An email failure is logged; it never breaks the action that triggered it.
 */
export async function sendEmail(msg: Email): Promise<void> {
  const job = () => deliver(msg).catch((e) => console.error("[email] failed:", e));
  try {
    const { after } = await import("next/server");
    after(job);
  } catch {
    await job();
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Plain text → a minimal blue-branded HTML email. Links become clickable. */
function simpleHtml(text: string) {
  const body = escapeHtml(text)
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#1446C8">$1</a>')
    .replace(/\n/g, "<br>");
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#0B0B0C">
<div style="background:#0B0B0C;color:#fff;padding:14px 20px;font-weight:700;font-size:18px">Wo Ọ̀nà</div>
<div style="padding:20px;line-height:1.55;background:#fff;border:1px solid #E3E6EE">${body}</div></div>`;
}
