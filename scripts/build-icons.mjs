/**
 * Regenerates every app icon from one square master.
 *
 * Master: public/icons/icon-master.png (square, transparent background).
 *
 * Maskable icons get the mark inset inside a safe zone on the brand background,
 * because Android crops icons to a circle and would otherwise clip the artwork.
 * The plain favicon keeps its transparency so it sits correctly on light and
 * dark browser chrome alike.
 *
 * Run: node scripts/build-icons.mjs
 */

import sharp from 'sharp';
import { existsSync } from 'node:fs';

const MASTER = 'public/icons/icon-master.png';
const BG = '#121214';

if (!existsSync(MASTER)) {
  console.error(`Missing ${MASTER} — drop the square logo there first.`);
  process.exit(1);
}

/** Mark inset inside a padded square on the brand background. */
async function maskable(size, out, pad = 0.16) {
  const inset = Math.round(size * pad);
  await sharp(MASTER)
    .resize(size - inset * 2, size - inset * 2, { fit: 'contain', background: BG })
    .extend({ top: inset, bottom: inset, left: inset, right: inset, background: BG })
    .png()
    .toFile(out);
  return out;
}

/** Transparent, edge-to-edge. */
async function plain(size, out) {
  await sharp(MASTER)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out);
  return out;
}

const meta = await sharp(MASTER).metadata();
console.log(`\nmaster: ${meta.width}x${meta.height} ${meta.format}\n`);

const written = [
  await maskable(192, 'public/icons/icon-192.png'),
  await maskable(512, 'public/icons/icon-512.png'),
  // iOS renders apple-touch-icon on an opaque tile and ignores alpha, so it
  // gets the brand background baked in rather than showing black fringing.
  await maskable(180, 'public/icons/apple-touch-icon.png', 0.12),
  await plain(32, 'public/icons/favicon-32.png'),
  await plain(16, 'public/icons/favicon-16.png'),
  // Next serves src/app/icon.png as the favicon automatically.
  await plain(48, 'src/app/icon.png'),
];

for (const f of written) console.log(`  wrote ${f}`);
console.log();
