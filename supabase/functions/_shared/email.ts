// ═══════════════════════════════════════════════════════════════
// GieesK Recipes — Shared email helper (Resend)
// ───────────────────────────────────────────────────────────────
// Used by both notify-engagement and notify-new-challenge.
//
// RESEND_API_KEY and FROM_EMAIL are read from environment secrets —
// set them with:
//   supabase secrets set RESEND_API_KEY=re_xxxxx
//   supabase secrets set FROM_EMAIL="GieesK Recipes <notifications@yourdomain.com>"
//
// Until you've verified a sending domain in Resend, use their test
// address instead: FROM_EMAIL="GieesK Recipes <onboarding@resend.dev>"
// (works immediately, but can only send to the email you signed up
// with — fine for testing, not for real users).
// ═══════════════════════════════════════════════════════════════

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'GieesK Recipes <onboarding@resend.dev>';

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendEmail(payload: EmailPayload): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.error('[GieesK] RESEND_API_KEY not set — email not sent. Run: supabase secrets set RESEND_API_KEY=re_xxxxx');
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[GieesK] Resend API error:', res.status, body);
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[GieesK] Email send threw:', e);
    return { ok: false, error: String(e) };
  }
}

// Batch send — Resend accepts up to 100 recipients per batch call.
// Used for challenge-announcement broadcasts to many users at once
// rather than one HTTP request per user.
export async function sendEmailBatch(emails: EmailPayload[]): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.error('[GieesK] RESEND_API_KEY not set — batch email not sent.');
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  if (emails.length === 0) return { ok: true };

  try {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        emails.map(e => ({ from: FROM_EMAIL, to: e.to, subject: e.subject, html: e.html }))
      ),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[GieesK] Resend batch API error:', res.status, body);
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[GieesK] Batch email send threw:', e);
    return { ok: false, error: String(e) };
  }
}

// Shared visual wrapper so every notification email looks like it
// came from the same product, without duplicating markup everywhere.
export function emailShell(bodyHtml: string, siteUrl = 'https://gieesk.com'): string {
  return `
  <div style="background:#0A0A09;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#141412;border:1px solid #2A2A26;border-radius:12px;overflow:hidden;">
      <div style="padding:24px 28px;border-bottom:1px solid #2A2A26;">
        <span style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#F0EEE8;">Giees<span style="color:#C9963A;">K</span></span>
      </div>
      <div style="padding:28px;color:#D8D5CC;font-size:14px;line-height:1.6;">
        ${bodyHtml}
      </div>
      <div style="padding:18px 28px;border-top:1px solid #2A2A26;font-size:12px;color:#77746A;">
        <a href="${siteUrl}" style="color:#C9963A;text-decoration:none;">GieesK Recipes</a> ·
        <a href="${siteUrl}/#" style="color:#77746A;text-decoration:none;">Notification settings</a>
      </div>
    </div>
  </div>`;
}
