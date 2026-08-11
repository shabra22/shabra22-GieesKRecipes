// ═══════════════════════════════════════════════════════════════
// GieesK Recipes — New Challenge Broadcast
// ───────────────────────────────────────────────────────────────
// Triggered by a Supabase Database Webhook on INSERT to challenges.
// Emails EVERY registered user about the new challenge.
//
// Deploy:
//   supabase functions deploy notify-new-challenge
//
// Dashboard wiring:
//   Database → Webhooks → Create a new webhook
//     Name: notify-new-challenge
//     Table: challenges
//     Events: Insert
//     Type: Supabase Edge Function
//     Function: notify-new-challenge
//
// COST NOTE: this emails your entire user base every time a row is
// inserted into `challenges`. Fine at hundreds/low-thousands of
// users on Resend's free tier (3,000 emails/month) — if you outgrow
// that, the obvious next step is an opt-in `profiles.notify_challenges`
// column and filtering the recipient list by it before sending.
// ═══════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmailBatch, emailShell, type EmailPayload } from '../_shared/email.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = Deno.env.get('SITE_URL') || 'https://gieesk.com';

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// auth.admin.listUsers() is paginated (max 1000/page) — walk every
// page rather than assuming the whole user base fits in one call.
async function getAllUserEmails(): Promise<string[]> {
  const emails: string[] = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) { console.error('[GieesK] listUsers failed:', error); break; }
    const users = data?.users || [];
    users.forEach((u: { email?: string }) => { if (u.email) emails.push(u.email); });
    if (users.length < perPage) break;   // last page
    page++;
  }
  return emails;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const challenge = payload.record as Record<string, unknown>;
    if (!challenge) return new Response(JSON.stringify({ error: 'no challenge in payload' }), { status: 200 });

    const emails = await getAllUserEmails();
    if (emails.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no users' }), { status: 200 });
    }

    const deadline = challenge.deadline
      ? new Date(challenge.deadline as string).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'soon';

    const subject = `New challenge: ${challenge.title}`;
    const bodyHtml = `
      <p style="margin:0 0 4px;font-size:28px;">${challenge.icon || '🏆'}</p>
      <p style="margin:0 0 16px;font-size:17px;font-weight:700;color:#F0EEE8;">${challenge.title}</p>
      <p style="margin:0 0 16px;">${challenge.description || ''}</p>
      <p style="margin:0 0 4px;color:#9A978C;font-size:13px;">Ends ${deadline}</p>
      ${challenge.prize ? `<p style="margin:0 0 20px;color:#9A978C;font-size:13px;">Prize: ${challenge.prize}</p>` : ''}
      <a href="${SITE_URL}/#community" style="display:inline-block;background:#C9963A;color:#141210;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600;font-size:13px;">Enter the challenge</a>`;

    const html = emailShell(bodyHtml, SITE_URL);

    // Resend's batch endpoint takes up to 100 recipients per call —
    // chunk the full user list into batches of 100.
    const BATCH_SIZE = 100;
    let sentBatches = 0;
    let failedBatches = 0;
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const chunk = emails.slice(i, i + BATCH_SIZE);
      const batch: EmailPayload[] = chunk.map(to => ({ to, subject, html }));
      const result = await sendEmailBatch(batch);
      if (result.ok) sentBatches++; else failedBatches++;
    }

    return new Response(JSON.stringify({
      totalUsers: emails.length,
      batchesSent: sentBatches,
      batchesFailed: failedBatches
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('[GieesK] notify-new-challenge threw:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
