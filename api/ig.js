// Live Instagram counts for the profiles shown on the site.
// Reads each public profile's link-preview tags (followers, following, posts) and lets Vercel's
// edge cache the answer for a day. Only the handles below are ever fetched, so it is not an open proxy.
const HANDLES = new Set([
  'cafebuddy_pimplesaudagar', 'dr_skinobsessed', '_digvijay_gavhane__', 'desitotes',
  'sahilpathak.21', 'shivam.forsure',
]);

async function counts(handle) {
  const r = await fetch(`https://www.instagram.com/${handle}/`, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; facebookexternalhit/1.1)' },
  });
  const m = (await r.text()).match(/content="([\d.,]+[KMB]?) Followers, ([\d.,]+[KMB]?) Following, ([\d.,]+[KMB]?) Posts/);
  return m && { followers: m[1], following: m[2], posts: m[3] };
}

module.exports = async (req, res) => {
  const asked = String(req.query.u || '').split(',').filter(h => HANDLES.has(h));
  const out = {};
  await Promise.all(asked.map(async h => {
    try { const c = await counts(h); if (c) out[h] = c; } catch {}
  }));
  // cache good answers for a day; never cache a blocked or empty one
  res.setHeader('Cache-Control', Object.keys(out).length ? 's-maxage=86400, stale-while-revalidate=604800' : 'no-store');
  res.status(200).json(out);
};
