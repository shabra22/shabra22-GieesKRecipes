# Email Notifications — Deployment Guide

Two things happen automatically once this is deployed, with **zero
changes to the website's code** — the notifications trigger on the
database write itself, not on anything the browser calls directly:

1. **Post owner gets emailed** when someone likes or comments on their post
2. **Every user gets emailed** when an admin adds a new challenge

---

## 1. Get a Resend API key (5 minutes)

1. Sign up at **resend.com** (free tier: 3,000 emails/month)
2. **API Keys → Create API Key** — copy it (starts with `re_`)
3. For real use, verify a sending domain: **Domains → Add Domain**,
   follow their DNS instructions. Until then, use their test address
   (`onboarding@resend.dev`) — it works immediately but can only
   send to the email you signed up to Resend with.

## 2. Install the Supabase CLI

```bash
npm install -g supabase
supabase login
```

This opens a browser to authorize the CLI against your Supabase account.

## 3. Link this project to your Supabase project

From the `gieeskrecipes-website` folder:

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Find `YOUR_PROJECT_REF` in your Supabase dashboard URL:
`supabase.com/dashboard/project/YOUR_PROJECT_REF`

## 4. Set the secrets the functions need

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set FROM_EMAIL="GieesK Recipes <onboarding@resend.dev>"
supabase secrets set SITE_URL=https://gieesk.com
```

Once you've verified your own domain in Resend, update `FROM_EMAIL` to
something like `"GieesK Recipes <notifications@gieeskrecipes.com>"` and
re-run that command — it overwrites the old value.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically
by Supabase into every Edge Function — you don't set those yourself.

## 5. Deploy both functions

```bash
supabase functions deploy notify-engagement
supabase functions deploy notify-new-challenge
```

## 6. Wire up the Database Webhooks (this is the part that actually connects everything)

In the Supabase Dashboard: **Database → Webhooks → Create a new webhook**

**Webhook 1 — likes:**
| Field | Value |
|---|---|
| Name | `notify-on-like` |
| Table | `post_likes` |
| Events | Insert |
| Type | Supabase Edge Function |
| Function | `notify-engagement` |

**Webhook 2 — comments:**
| Field | Value |
|---|---|
| Name | `notify-on-comment` |
| Table | `post_comments` |
| Events | Insert |
| Type | Supabase Edge Function |
| Function | `notify-engagement` |

(Both point to the same function — it reads the `table` field in the
webhook payload to tell a like from a comment.)

**Webhook 3 — new challenges:**
| Field | Value |
|---|---|
| Name | `notify-new-challenge` |
| Table | `challenges` |
| Events | Insert |
| Type | Supabase Edge Function |
| Function | `notify-new-challenge` |

## 7. Test it

- Like a post (from a *different* account than the post's owner — the
  function deliberately skips self-notifications) → owner should get
  an email within a few seconds.
- Add a test row to `challenges` via the Table Editor → every
  registered user should get an email.
- Check **Edge Functions → [function name] → Logs** in the dashboard
  if an email doesn't arrive — the functions log exactly why (missing
  API key, Resend rejection, etc.) rather than failing silently.

---

## Cost and scale notes

- Resend's free tier is 3,000 emails/month. The engagement notifier
  sends one email per like/comment (only to the post's owner) —
  cheap at any realistic scale.
- The challenge broadcaster emails **every** registered user on every
  new challenge. Fine at hundreds or low thousands of users. If you
  outgrow the free tier, the natural next step is an opt-in column
  (e.g. `profiles.notify_challenges boolean`) and filtering the
  recipient list in `notify-new-challenge/index.ts` before sending —
  ask me to add that whenever you're ready.

## If something doesn't match your Supabase project

I couldn't inspect your live database from this session — this is
built against the schema in `supabase/community.sql`. If your actual
`community_posts`/`post_likes`/`post_comments` tables use different
column names, tell me what they are and I'll adjust the two Edge
Functions to match exactly rather than guessing.
