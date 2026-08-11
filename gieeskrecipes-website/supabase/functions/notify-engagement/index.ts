// ═══════════════════════════════════════════════════════════════
// GieesK Recipes — Engagement Notification
// ───────────────────────────────────────────────────────────────
// Triggered by a Supabase Database Webhook on INSERT to post_likes
// and post_comments. Emails the POST OWNER (not the person who
// liked/commented — never self-notify).
//
// Deploy:
//   supabase functions deploy notify-engagement
//
// Then wire it up in the Supabase Dashboard:
//   Database → Webhooks → Create a new webhook
//     Name: notify-on-like
//     Table: post_likes
//     Events: Insert
//     Type: Supabase Edge Function
//     Function: notify-engagement
//   Repeat once more for:
//     Name: notify-on-comment
//     Table: post_comments
//     Events: Insert
//     Function: notify-engagement   (same function — it branches on payload.table)
//
// See supabase/functions/DEPLOY.md for the full walkthrough.
// ═══════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, emailShell } from '../_shared/email.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = Deno.env.get('SITE_URL') || 'https://gieesk.com';

// Service-role client — this is a trusted server context (an Edge
// Function, never exposed to the browser), so it's safe to use the
// elevated key here to read auth.users emails and bypass RLS for
// the lookups this needs. NEVER ship this key to client-side code.
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    // Supabase Database Webhook payload shape:
    // { type: 'INSERT', table: 'post_likes'|'post_comments', record: {...}, schema: 'public' }
    const table = payload.table as string;
    const record = payload.record as Record<string, unknown>;

    if (table !== 'post_likes' && table !== 'post_comments') {
      return new Response(JSON.stringify({ skipped: true, reason: 'unhandled table' }), { status: 200 });
    }

    const postId = record.post_id as string;
    const actorUserId = record.user_id as string;

    const { data: post, error: postErr } = await supabaseAdmin
      .from('community_posts')
      .select('id, user_id, author_name, text, recipe_title')
      .eq('id', postId)
      .single();

    if (postErr || !post) {
      console.error('[GieesK] notify-engagement: post not found', postId, postErr);
      return new Response(JSON.stringify({ error: 'post not found' }), { status: 200 });
    }

    // Never notify someone about their own like/comment on their own post.
    if (post.user_id === actorUserId) {
      return new Response(JSON.stringify({ skipped: true, reason: 'self-action' }), { status: 200 });
    }

    const { data: ownerAuth, error: ownerErr } = await supabaseAdmin.auth.admin.getUserById(post.user_id as string);
    if (ownerErr || !ownerAuth?.user?.email) {
      console.error('[GieesK] notify-engagement: owner email not found', post.user_id, ownerErr);
      return new Response(JSON.stringify({ error: 'owner email not found' }), { status: 200 });
    }
    const ownerEmail = ownerAuth.user.email;

    // Who did the liking/commenting — for the "X liked your post" line
    const { data: actorAuth } = await supabaseAdmin.auth.admin.getUserById(actorUserId);
    const actorName =
      (actorAuth?.user?.user_metadata?.full_name as string) ||
      (actorAuth?.user?.user_metadata?.name as string) ||
      (actorAuth?.user?.email?.split('@')[0]) ||
      'Someone';

    const postSummary = post.recipe_title
      ? `your post about "${post.recipe_title}"`
      : 'your post';

    let subject: string;
    let bodyHtml: string;

    if (table === 'post_likes') {
      subject = `${actorName} liked your post on GieesK Recipes`;
      bodyHtml = `
        <p style="margin:0 0 16px"><strong style="color:#F0EEE8;">${actorName}</strong> liked ${postSummary}.</p>
        <p style="margin:0 0 20px;color:#9A978C;font-style:italic;">"${String(post.text).slice(0, 140)}${String(post.text).length > 140 ? '…' : ''}"</p>
        <a href="${SITE_URL}/#community" style="display:inline-block;background:#C9963A;color:#141210;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600;font-size:13px;">View your post</a>`;
    } else {
      const commentText = String(record.text || '');
      subject = `${actorName} commented on your post on GieesK Recipes`;
      bodyHtml = `
        <p style="margin:0 0 12px"><strong style="color:#F0EEE8;">${actorName}</strong> commented on ${postSummary}:</p>
        <p style="margin:0 0 20px;padding:12px 14px;background:#1A1A17;border-radius:8px;color:#D8D5CC;">"${commentText.slice(0, 200)}${commentText.length > 200 ? '…' : ''}"</p>
        <a href="${SITE_URL}/#community" style="display:inline-block;background:#C9963A;color:#141210;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600;font-size:13px;">Reply on GieesK</a>`;
    }

    const result = await sendEmail({ to: ownerEmail, subject, html: emailShell(bodyHtml, SITE_URL) });

    return new Response(JSON.stringify({ sent: result.ok, error: result.error }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[GieesK] notify-engagement threw:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
