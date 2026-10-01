// Refreshes the Instagram counts baked into index.html (posts, followers, following, and the
// "Counts as of" date). Run it from a home connection; Instagram sends cloud servers to its login page.
//   node scripts/ig-refresh.mjs        then commit and push, and Vercel redeploys
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../index.html', import.meta.url);
let html = readFileSync(file, 'utf8');

async function counts(handle) {
  const r = await fetch(`https://www.instagram.com/${handle}/`, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; facebookexternalhit/1.1)' },
  });
  const m = (await r.text()).match(/content="([\d.,]+[KMB]?) Followers, ([\d.,]+[KMB]?) Following, ([\d.,]+[KMB]?) Posts/);
  return m && { followers: m[1], following: m[2], posts: m[3] };
}

// Every element marked data-ig="handle" holds its own data-k="posts|followers|following" numbers,
// before the next data-ig, so each chunk between markers belongs to one profile.
const parts = html.split('data-ig="');
let updated = 0;
for (let i = 1; i < parts.length; i++) {
  const handle = parts[i].slice(0, parts[i].indexOf('"'));
  const c = await counts(handle).catch(() => null);
  if (!c) { console.warn(`skipped @${handle} (no answer from Instagram)`); continue; }
  parts[i] = parts[i].replace(/data-k="(posts|followers|following)">[^<]*</g, (_, k) => `data-k="${k}">${c[k]}<`);
  console.log(`@${handle}: ${c.followers} followers, ${c.following} following, ${c.posts} posts`);
  updated++;
}
html = parts.join('data-ig="');
if (updated) {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  html = html.replace(/Counts as of [^<]*/g, `Counts as of ${today}`);
  writeFileSync(file, html);
}
console.log(`${updated} profiles updated`);
