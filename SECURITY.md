# doubledub — security model

The paywall is enforced by **Postgres**, not by the app. If every line of
application code were deleted tomorrow and someone pointed a Supabase client at
the project with a valid member token, they would still see nothing they had not
paid for. Everything below exists to keep that true.

Run `npm run verify` to check all of it against the live database.

---

## 1. The boundary is row level security

Every table has RLS **enabled and forced**. Forced matters: without it, the table
owner bypasses its own policies.

Absence of a policy means no access. Four tables have no policies at all and are
therefore unreachable with any member token:

| Table | Why it is sealed |
|---|---|
| `admin_users` | Admin identity. Unreadable, so it cannot be enumerated; unwritable, so it cannot be escalated into. |
| `audit_log` | Members must not be able to read — or erase — their own trail. |
| `stripe_events` | Webhook idempotency ledger. |
| `rate_limits` | A member who could read their own counter could time around it. |

## 2. Grants are the second lock

RLS decides *which rows*; grants decide *whether the verb is available at all*.

- **`anon` holds no grant on anything.** Signed-out visitors read nothing. There
  is no free tier, so there is no public read path to get wrong.
- **`authenticated` has SELECT only** on `posts`, `post_legs`, `post_media`.
  A stolen member JWT cannot write a post regardless of what any policy says.
- Members get narrow DML only on rows they own: their own like, tail, comment.
- `profiles` uses a **column-level grant** — `UPDATE (display_name, avatar_color)`.
  A member can rename themselves but cannot touch their own `handle`.
- Default privileges are revoked, so a table added by a future migration is not
  silently readable.

## 3. Admin writes never touch the member path

Admins publish posts through **server code holding the secret key**, which
bypasses RLS. That key is guarded by the `server-only` package — if it is ever
imported into a client component the build fails rather than shipping it.

This is why admin-ness is not a column on `profiles`: if it were, any
over-broad `UPDATE profiles` policy would become a privilege-escalation path.

## 4. Entitlement

`subscriptions.term_days` is both the billing period and the entitlement rank.
A post carries `min_term_days`; a member sees it when their active plan's term
is greater or equal. That single integer implements the "1 month plus" audience
option with no extra machinery.

Entitlement is written **only** by the Stripe webhook. The verification suite
confirms a member cannot insert their own subscription row.

## 5. Billing

- The browser sends a **plan code**, never a price or an amount. Everything
  chargeable is resolved server-side from Stripe.
- The webhook is authenticated by **signature**, not session, and is excluded
  from the auth proxy — otherwise Stripe would be redirected to `/sign-in` and
  payment events would be silently dropped.
- It is **idempotent**: event ids are claimed in `stripe_events` before any work.
- It **re-fetches** the subscription from Stripe rather than trusting the event
  body, so out-of-order delivery still converges on the right answer.
- A payment that cannot be attributed to a user throws loudly rather than being
  swallowed.

## 6. "Members cannot share"

The `slips` bucket is **private** and members hold no storage grant, so a slip
image has no durable URL to copy. Each view mints a **90-second signed URL**
server-side after re-checking entitlement.

This raises the cost of leaking; it does not eliminate it. A screenshot is always
possible. What it does prevent is the cheap, permanent failure — a CDN link
circulating outside the paywall forever.

Member pages are also `Cache-Control: private, no-store` and `noindex`, so no
shared proxy or search engine holds a copy.

## 7. Rate limiting

Backed by Postgres, not memory: serverless instances do not share memory, so a
`Map` would let an attacker spread requests across cold starts and never hit a
limit. It **fails closed** — if the database errors, the request is denied.

## 8. Headers

Set in `src/proxy.ts` on every response: nonce-based CSP with
`strict-dynamic`, `frame-ancestors 'none'`, HSTS with preload, `nosniff`,
`Referrer-Policy`, and a `Permissions-Policy` denying camera/mic/geolocation.

---

## Known gaps — deliberately not yet closed

1. **`SUPABASE_SECRET_KEY` is currently the legacy `service_role` JWT.** The
   newer `sb_secret_…` key is redacted by the CLI and can only be copied from
   the dashboard. Both are the same privilege level; the new format is preferable
   because it can be rotated without rotating the project's JWT secret.
   → Project Settings → API Keys, then replace the value in `.env.local`.

2. **No admin exists yet.** Insert one deliberately once you know your user id:
   `insert into admin_users (user_id, note) values ('<uuid>', 'founder');`

3. **Stripe is not configured.** `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
   are blank, and the eight prices do not exist yet. They must be created with
   the `lookup_key` values in `src/lib/plans.ts` (`dd_3d` … `dd_1y`). The app
   boots without them; anything that charges a card fails loudly.

4. **Prices in `src/lib/plans.ts` are the sample ladder** from the reference
   design, not your real pricing. Stripe is authoritative for what is charged —
   those numbers are display-only — but they should still be corrected.

5. **No email verification enforcement.** Supabase's default confirmation flow
   applies, but nothing yet blocks an unconfirmed account from checking out.

6. **No bot protection on sign-up.** Vercel BotID or a turnstile belongs on the
   auth routes before launch.

7. **Per-viewer watermarking** of slip images is the real deterrent against
   screenshot leaks and is not implemented. The schema supports adding it.
