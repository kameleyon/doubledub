/**
 * Seeds a handful of published picks so the feed has content during
 * development. Uses the content from the approved design canvas.
 *
 * Idempotent — re-running replaces the demo set rather than duplicating it.
 * Demo rows are tagged in `title` with a marker so they can be found and
 * removed without touching real posts.
 *
 * Run:   node scripts/seed-demo-posts.mjs
 * Clear: node scripts/seed-demo-posts.mjs --clear
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const MARKER = '[demo]';
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

const POSTS = [
  {
    kind: 'text',
    bet_type: 'prop',
    title: 'Pick of the night',
    caption:
      'Staff play of the night. Line opened at 27.5 and we are getting a full point of value with Gobert ruled out.',
    published_at: minsAgo(18),
  },
  {
    kind: 'text',
    bet_type: 'single',
    title: 'Tennis play',
    caption:
      'Blockx has won four straight on hard court and the number has not moved all morning. Taking it before it does.',
    published_at: minsAgo(55),
  },
  {
    kind: 'text',
    bet_type: 'parlay',
    title: 'Two-leg homer parlay',
    caption:
      'Tatis has gone deep in 3 of his last 5 at Petco and PCA sees a lefty with a 1.9 HR/9. Sizing at half a unit given the payout.',
    published_at: minsAgo(140),
  },
  {
    kind: 'text',
    bet_type: 'parlay',
    title: 'Sunday early window',
    caption: 'Both legs are correlated with the game total staying under.',
    published_at: minsAgo(320),
  },
  {
    kind: 'text',
    bet_type: 'total',
    title: 'Late add',
    caption: 'Bullpen day for Colorado and this total has been climbing since it opened.',
    published_at: minsAgo(460),
  },
];

async function clearDemo() {
  const { data } = await admin.from('posts').select('id, caption').ilike('caption', `%${MARKER}%`);
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length) await admin.from('posts').delete().in('id', ids);
  return ids.length;
}

async function main() {
  const removed = await clearDemo();
  if (removed) console.log(`removed ${removed} existing demo post(s)`);

  if (process.argv.includes('--clear')) {
    console.log('cleared.');
    return;
  }

  for (const p of POSTS) {
    const { error } = await admin
      .from('posts')
      .insert({
        kind: p.kind,
        status: 'published',
        bet_type: p.bet_type,
        title: p.title,
        caption: `${p.caption} ${MARKER}`,
        published_at: p.published_at,
        min_term_days: 0,
      })
      .select('id')
      .single();

    if (error) throw new Error(`post "${p.title}": ${error.message}`);

    console.log(`  ${p.bet_type.padEnd(8)} ${p.title}`);
  }

  console.log(`\nseeded ${POSTS.length} published picks.\n`);
}

main().catch((err) => {
  console.error('failed:', err.message);
  process.exit(1);
});
