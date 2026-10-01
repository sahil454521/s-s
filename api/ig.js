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
  if (req.query.debug) { // TEMP: see what Instagram sends this server
    const out = {};
    for (const [k, url, h] of [
      ['page', 'https://www.instagram.com/desitotes/', { 'user-agent': 'Mozilla/5.0 (compatible; facebookexternalhit/1.1)' }],
      ['api', 'https://i.instagram.com/api/v1/users/web_profile_info/?username=desitotes', { 'user-agent': 'Instagram 219.0.0.12.117 Android', 'x-ig-app-id': '936619743392459' }],
    ]) { try { const r = await fetch(url, { headers: h, redirect: 'manual' }); const t = await r.text(); out[k] = { status: r.status, loc: r.headers.get('location'), len: t.length, hasCounts: /Followers, /.test(t), followers: (t.match(/"edge_followed_by":\{"count":(\d+)/) || [])[1], head: t.slice(0, 160) }; } catch (e) { out[k] = String(e); } }
    return res.status(200).json(out);
  }
  const asked = String(req.query.u || '').split(',').filter(h => HANDLES.has(h));
  const out = {};
  await Promise.all(asked.map(async h => {
    try { const c = await counts(h); if (c) out[h] = c; } catch {}
  }));
  // cache good answers for a day; never cache a blocked or empty one
  res.setHeader('Cache-Control', Object.keys(out).length ? 's-maxage=86400, stale-while-revalidate=604800' : 'no-store');
  res.status(200).json(out);
};
