/**
 * End-to-end proof that the paywall is enforced by the database, not by the UI.
 *
 * Creates two throwaway members, gives one an entitlement, and then tries — with
 * a real signed-in member token, exactly as a browser would — to do the things
 * a member must never be able to do. Every attempt is expected to fail.
 *
 * Run: node scripts/verify-rls.mjs
 * Cleans up after itself.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const stamp = Date.now();
const users = [];

async function makeUser(tag) {
  const email = `rlstest_${tag}_${stamp}@example.invalid`;
  const password = `Test-${stamp}-${tag}!aA1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  users.push(data.user.id);

  const client = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn(${tag}): ${signInErr.message}`);

  return { id: data.user.id, email, client };
}

async function main() {
  console.log('\ndoubledub — row level security verification\n');

  // ---- fixtures -----------------------------------------------------------
  const paying = await makeUser('paying');
  const lapsed = await makeUser('lapsed');

  const { data: post, error: postErr } = await admin
    .from('posts')
    .insert({
      kind: 'text',
      status: 'published',
      bet_type: 'single',
      title: 'RLS probe',
      caption: 'Temporary fixture created by verify-rls.mjs',
      published_at: new Date().toISOString(),
      min_term_days: 0,
    })
    .select('id')
    .single();
  if (postErr) throw new Error(`fixture post: ${postErr.message}`);

  const { data: gatedPost } = await admin
    .from('posts')
    .insert({
      kind: 'text',
      status: 'published',
      bet_type: 'parlay',
      title: 'RLS probe (gated to 1 month plus)',
      published_at: new Date().toISOString(),
      min_term_days: 30,
    })
    .select('id')
    .single();

  const { data: draftPost } = await admin
    .from('posts')
    .insert({ kind: 'text', status: 'draft', bet_type: 'prop', title: 'RLS probe (draft)' })
    .select('id')
    .single();

  // ---- 1. no subscription = no content ------------------------------------
  console.log('Unsubscribed member:');
  {
    const { data } = await lapsed.client.from('posts').select('id');
    check('cannot read any post without a subscription', (data ?? []).length === 0);
  }

  // ---- 2. entitlement opens exactly the right doors ------------------------
  await admin.from('subscriptions').upsert({
    user_id: paying.id,
    stripe_customer_id: `cus_test_${stamp}`,
    stripe_subscription_id: `sub_test_${stamp}`,
    status: 'active',
    term_days: 7,
    current_period_end: new Date(Date.now() + 7 * 864e5).toISOString(),
  });

  console.log('\nPaying member (7-day plan):');
  {
    const { data } = await paying.client.from('posts').select('id, title');
    const ids = (data ?? []).map((r) => r.id);
    check('can read an ungated published post', ids.includes(post.id));
    check('cannot read a post gated to a longer plan', !ids.includes(gatedPost.id));
    check('cannot read a draft', !ids.includes(draftPost.id));
  }

  // ---- 3. members cannot write content ------------------------------------
  {
    const { error } = await paying.client
      .from('posts')
      .insert({ kind: 'text', status: 'published', title: 'forged', published_at: new Date().toISOString() });
    check('cannot create a post', error !== null, error ? '' : 'insert succeeded!');
  }
  {
    const { error } = await paying.client.from('posts').update({ title: 'defaced' }).eq('id', post.id);
    const { data: after } = await admin.from('posts').select('title').eq('id', post.id).single();
    check('cannot edit a post', error !== null || after.title === 'RLS probe');
  }

  // ---- 4. entitlement is not self-serve -----------------------------------
  {
    const { error } = await lapsed.client.from('subscriptions').insert({
      user_id: lapsed.id,
      stripe_customer_id: 'cus_forged',
      status: 'active',
      term_days: 365,
    });
    check('cannot grant themselves a subscription', error !== null, error ? '' : 'insert succeeded!');
  }
  {
    const { data } = await lapsed.client.from('subscriptions').select('user_id');
    check("cannot read another member's subscription", (data ?? []).length === 0);
  }

  // ---- 5. admin surface is invisible --------------------------------------
  {
    const { data, error } = await paying.client.from('admin_users').select('user_id');
    check('cannot read admin_users', error !== null || (data ?? []).length === 0);
  }
  {
    const { error } = await paying.client.from('admin_users').insert({ user_id: paying.id });
    check('cannot make themselves an admin', error !== null, error ? '' : 'insert succeeded!');
  }
  {
    const { data, error } = await paying.client.from('audit_log').select('id');
    check('cannot read the audit log', error !== null || (data ?? []).length === 0);
  }
  {
    const { error } = await paying.client.rpc('check_rate_limit', {
      p_bucket: 'probe',
      p_subject: 'probe',
      p_max_hits: 1,
      p_window_seconds: 60,
    });
    check('cannot call the rate limiter', error !== null, error ? '' : 'rpc succeeded!');
  }
  {
    const { error } = await paying.client.rpc('can_read_post_for', {
      p_post_id: gatedPost.id,
      p_user_id: lapsed.id,
    });
    check('cannot use the entitlement oracle', error !== null, error ? '' : 'rpc succeeded!');
  }

  // ---- 6. engagement is scoped to posts the member can actually read -------
  {
    const { error } = await paying.client.from('likes').insert({ post_id: gatedPost.id, user_id: paying.id });
    check('cannot like a post they cannot read', error !== null, error ? '' : 'insert succeeded!');
  }
  {
    const { error } = await paying.client.from('likes').insert({ post_id: post.id, user_id: lapsed.id });
    check('cannot like as somebody else', error !== null, error ? '' : 'insert succeeded!');
  }
  {
    const { error } = await paying.client.from('likes').insert({ post_id: post.id, user_id: paying.id });
    check('CAN like a readable post', error === null, error?.message);
    const { data: counted } = await admin.from('posts').select('like_count').eq('id', post.id).single();
    check('like updates the denormalized counter', counted.like_count === 1, `got ${counted?.like_count}`);
  }

  // ---- 7. anonymous visitors get nothing ----------------------------------
  console.log('\nSigned-out visitor:');
  {
    const anon = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } });
    const { data, error } = await anon.from('posts').select('id');
    check('cannot read posts', error !== null || (data ?? []).length === 0);
    const { data: p2, error: e2 } = await anon.from('profiles').select('id');
    check('cannot read profiles', e2 !== null || (p2 ?? []).length === 0);
  }

  // ---- 8. profile role escalation is impossible ---------------------------
  console.log('\nProfile hardening:');
  {
    const { error } = await paying.client
      .from('profiles')
      .update({ handle: 'stolenhandle' })
      .eq('id', paying.id);
    check('cannot change their own handle (no column grant)', error !== null, error ? '' : 'update succeeded!');
  }
  {
    const { error } = await paying.client
      .from('profiles')
      .update({ display_name: 'Legit Name' })
      .eq('id', paying.id);
    check('CAN change their own display name', error === null, error?.message);
  }
  {
    await paying.client.from('profiles').update({ display_name: 'hijacked' }).eq('id', lapsed.id);
    const { data: after } = await admin.from('profiles').select('display_name').eq('id', lapsed.id).single();
    check("cannot rename another member", after.display_name !== 'hijacked');
  }

  // ---- cleanup ------------------------------------------------------------
  await admin.from('posts').delete().in('id', [post.id, gatedPost.id, draftPost.id]);
  for (const id of users) await admin.auth.admin.deleteUser(id);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nverification aborted:', err.message);
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
  process.exit(1);
});
