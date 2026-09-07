# doubledub

Better picks. Bigger wins.

A members-only betting picks feed. Admins post betting slip screenshots or typed
picks; paying members read the feed, like, comment and tail. There is no free
tier and no sharing.

Next.js 16 (App Router) · Supabase (Postgres, Auth, Storage) · Stripe · Tailwind 4.
Ships as an installable PWA, so subscriptions run on Stripe web checkout rather
than app-store in-app purchase.

---

## Status

| Area | State |
|---|---|
| Design | 9 interactive artboards, approved |
| Database, RLS, entitlements | Built and verified |
| Auth, roles, audit log, rate limiting | Built |
| Stripe checkout + webhook | Built; prices not yet created |
| Member and admin screens | Not started |

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

`.env.local` is gitignored and must never be committed. See `.env.example` for
the required keys.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run verify` | Typecheck, schema audit, and live RLS probes |
| `npm run db:push` | Apply migrations to the linked Supabase project |
| `npm run db:audit` | 50 schema and privilege assertions |
| `npm run verify:rls` | 22 live probes against real member tokens |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` |
| `npm run stripe:listen` | Forward Stripe webhooks to localhost |

Run `npm run verify` after any migration. It is the difference between believing
the paywall holds and knowing it does.

## Layout

```
design/            Approved design canvas (.dc.html artboards + canvas.json)
scripts/           verify-rls.mjs — live security probes
src/app/api/       Stripe checkout and webhook
src/lib/           env, auth, supabase clients, plans, media, audit, rate limiting
src/proxy.ts       Session refresh, route protection, security headers
supabase/checks/   security_audit.sql
supabase/migrations/
```

## Security

The paywall is enforced by Postgres, not by the app. Read
[SECURITY.md](./SECURITY.md) before changing anything under `supabase/` or
`src/lib/` — it documents the model and the known gaps.

## Legal

doubledub publishes information and opinion only and does not accept wagers.
21+ only. If you or someone you know has a gambling problem, call 1-800-GAMBLER.
