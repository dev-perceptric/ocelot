// One look for every email: 600px, white card on canvas, yellow wordmark bar, one yellow button.
// Plain functions with no imports beyond colors, so tests can load them.

import { EMAIL_COLORS as C } from "./colors.ts";

export type Email = {
  subject: string;
  html: string;
  text: string;
  // Essential emails (invites, application updates) always send. Others need the person's choice to be on.
  pref: null | "application_updates" | "new_applicants" | "job_alerts" | "weekly_digest" | "product_news";
};

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

type Block = { p: string } | { button: { label: string; url: string } } | { small: string };

// For emails people can turn off: the footer links to settings and to a signed unsubscribe link,
// whose address is filled in when the email is queued (src/lib/email/send.ts).
export const optionalFooter = (siteUrl: string) => ({ settingsUrl: `${siteUrl}/app/settings`, unsubscribeUrl: "{{unsubscribe}}" });

export function layout(o: { title: string; preview: string; blocks: Block[]; footer?: { settingsUrl?: string; unsubscribeUrl?: string } }): { html: string; text: string } {
  const body = o.blocks
    .map((b) => {
      if ("p" in b) return `<p style="margin:0 0 16px;font-size:16px;line-height:24px;">${esc(b.p)}</p>`;
      if ("small" in b) return `<p style="margin:0 0 16px;font-size:14px;line-height:20px;color:${C.muted};">${esc(b.small)}</p>`;
      return `<p style="margin:8px 0 24px;"><a href="${esc(b.button.url)}" style="display:inline-block;background:${C.brand};color:${C.ink};font-weight:700;font-size:16px;text-decoration:none;padding:14px 24px;border-radius:4px;">${esc(b.button.label)}</a></p>`;
    })
    .join("\n");

  const footerLinks = [
    o.footer?.settingsUrl ? `<a href="${esc(o.footer.settingsUrl)}" style="color:${C.muted};">Choose which emails you get</a>` : "",
    o.footer?.unsubscribeUrl ? `<a href="${esc(o.footer.unsubscribeUrl)}" style="color:${C.muted};">Unsubscribe</a>` : "",
  ].filter(Boolean).join(" &nbsp;|&nbsp; ");

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:${C.canvas};font-family:Lato,Arial,sans-serif;color:${C.ink};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(o.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${C.surface};border:1px solid ${C.border};border-radius:8px;">
<tr><td style="background:${C.brand};padding:20px 32px;border-radius:8px 8px 0 0;font-weight:700;letter-spacing:0.28em;font-size:18px;color:${C.ink};">OCELOT</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:24px;line-height:30px;font-weight:700;">${esc(o.title)}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 32px 24px;font-size:12px;line-height:18px;color:${C.muted};">Ocelot, joinocelot.com${footerLinks ? `<br>${footerLinks}` : ""}</td></tr>
</table>
</td></tr></table>
</body>
</html>`;

  const text = [
    o.title,
    "",
    ...o.blocks.map((b) => ("p" in b ? b.p : "small" in b ? b.small : `${b.button.label}: ${b.button.url}`)),
    "",
    "Ocelot, joinocelot.com",
    o.footer?.settingsUrl ? `Choose which emails you get: ${o.footer.settingsUrl}` : "",
    o.footer?.unsubscribeUrl ? `Unsubscribe: ${o.footer.unsubscribeUrl}` : "",
  ].filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n").trim();

  return { html, text };
}
