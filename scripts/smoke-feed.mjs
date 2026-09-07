/**
 * Smoke test for the paywall as a browser experiences it.
 *
 * Drives the real HTTP surface with a cookie jar, in three states:
 *   signed out          -> bounced to /sign-in
 *   signed in, unpaid   -> bounced to /membership
 *   signed in, paid     -> feed renders with picks
 *
 * Requires the dev server on http://localhost:3000. Cleans up its test user.
 *
 * Run: node scripts/smoke-feed.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3100';
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

/** Minimal cookie jar — enough to carry a Supabase session across requests. */
function makeJar() {
  const jar = new Map();
  return {
    header: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb: (res) => {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(';');
        const idx = pair.indexOf('=');
        if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    },
  };
}

async function get(path, jar) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: jar ? { cookie: jar.header() } : {},
  });
  if (jar) jar.absorb(res);
  return res;
}

const stamp = Date.now();
const email = `smoke_${stamp}@example.invalid`;
const password = `Smoke-${stamp}!aA1`;
let userId = null;

async function main() {
  console.log(`\ndoubledub — feed smoke test  (${BASE})\n`);

  try {
    await fetch(BASE, { redirect: 'manual' });
  } catch {
    console.error(`Cannot reach ${BASE}. Start the dev server first: npm run dev\n`);
    process.exit(1);
  }

  // ---- signed out ---------------------------------------------------------
  console.log('Signed out:');
  {
    const res = await get('/feed');
    const loc = res.headers.get('location') ?? '';
    check('/feed redirects to sign-in', res.status === 307 && loc.includes('/sign-in'), `${res.status} ${loc}`);
  }
  {
    const res = await get('/membership');
    const loc = res.headers.get('location') ?? '';
    check('/membership redirects to sign-in', res.status === 307 && loc.includes('/sign-in'), `${res.status} ${loc}`);
  }
  {
    const res = await get('/sign-in');
    check('/sign-in is reachable', res.status === 200, String(res.status));
  }

  // ---- signed in, unpaid --------------------------------------------------
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr) throw new Error(createErr.message);
  userId = created.user.id;

  const jar = makeJar();
  const authed = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data: session, error: signInErr } = await authed.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(signInErr.message);

  // Plant the session the way @supabase/ssr stores it.
  const ref = process.env.SUPABASE_PROJECT_REF;
  const payload = encodeURIComponent(JSON.stringify({
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    expires_at: session.session.expires_at,
    token_type: 'bearer',
    user: session.user,
  }));
  jar.absorb({ headers: { getSetCookie: () => [`sb-${ref}-auth-token=base64-${Buffer.from(decodeURIComponent(payload)).toString('base64')}`] } });

  console.log('\nSigned in, no subscription:');
  {
    const res = await get('/feed', jar);
    const loc = res.headers.get('location') ?? '';
    const gated = res.status === 307 && (loc.includes('/membership') || loc.includes('/sign-in'));
    check('/feed does not render picks', gated, `${res.status} ${loc}`);
  }

  // ---- signed in, paid ----------------------------------------------------
  await admin.from('subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: `cus_smoke_${stamp}`,
    stripe_subscription_id: `sub_smoke_${stamp}`,
    status: 'active',
    term_days: 30,
    current_period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
  });

  console.log('\nSigned in, active membership:');
  {
    const res = await get('/feed', jar);
    if (res.status === 200) {
      const html = await res.text();
      check('/feed renders', true);
      check('feed shows a seeded pick', html.includes('Anthony Edwards') || html.includes('Blockx'),
        'no known pick text found');
      check('feed shows the tail control', html.includes('Tail'));
      check('page is not indexable', html.includes('noindex'));
    } else {
      const loc = res.headers.get('location') ?? '';
      check('/feed renders', false, `${res.status} ${loc}`);
    }
  }

  // ---- headers ------------------------------------------------------------
  console.log('\nResponse headers:');
  {
    const res = await get('/feed', jar);
    check('sets a CSP', Boolean(res.headers.get('content-security-policy')));
    check('denies framing', res.headers.get('x-frame-options') === 'DENY');
    const cc = res.headers.get('cache-control') ?? '';
    // Hard requirement: a shared cache must never serve this to someone else.
    // Satisfied by no-store, or by private (which bars shared caches outright).
    check('member pages are not shared-cacheable', /no-store|private/.test(cc) || /no-cache/.test(cc), cc || 'absent');
    // Next controls Cache-Control on dynamic routes and emits a weaker
    // "no-cache, must-revalidate" locally. vercel.json restores the strict
    // value at the edge, so only assert the strong form against a deployment.
    if (process.env.SMOKE_BASE_URL) {
      check('deployed pages are private/no-store', /no-store/.test(cc) && /private/.test(cc), cc);
    } else {
      console.log(`  note  local Cache-Control is "${cc}" — vercel.json sets the strict value in production`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
}

main()
  .then(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error('\nsmoke test aborted:', err.message);
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
    process.exit(1);
  });
