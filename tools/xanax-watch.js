// Runs on GitHub every ~5 minutes: reads YATA's public foreign stock export, records Xanax stock
// for each country and learns how long restocks take. Writes xanax.json, which J_Sim Cutpurse reads.
// Same rules as the script: restocks land on Torn's quarter-hour tick; the restock wait is learned as
// a fraction of the time the last stock took to sell out (median of the last 5 seen, 0.5 until then).
const fs = require('fs');
const FILE = process.argv[2] || 'xanax.json';
const XAN_ID = 206;
const snapQ = t => Math.ceil(t / 900) * 900;

function observe(c, t, q, cost) {
  const prev = c.hist && c.hist.length ? c.hist[c.hist.length - 1] : null;
  if (prev && prev[0] >= t) return false;
  c.hist = (c.hist || []).concat([[t, q]]).filter(h => t - h[0] < 72 * 3600).slice(-2500);
  c.cost = cost;
  if (!prev) return true;
  if (prev[1] > 0 && q === 0) c.emptyAt = Math.round((prev[0] + t) / 2);
  if (prev[1] === 0 && q > 0) {
    const back = Math.min(snapQ(prev[0] + 1), t);
    if (c.emptyAt && c.fullAt && c.emptyAt > c.fullAt && back > c.emptyAt) {
      const r = (back - c.emptyAt) / (c.emptyAt - c.fullAt);
      if (r > 0.05 && r < 3) c.ratios = (c.ratios || []).concat([+r.toFixed(3)]).slice(-10);
    }
    c.restocks = (c.restocks || []).concat([back]).slice(-50);
    c.fullAt = back; c.emptyAt = 0;
  }
  if (q > prev[1] + 50 && prev[1] > 0) c.fullAt = snapQ(prev[0] + 1);
  return true;
}

(async () => {
  let data = { c: {} };
  try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  data.c = data.c || {};
  const r = await fetch('https://yata.yt/api/v1/travel/export/', { headers: { 'User-Agent': 'J_Sim Cutpurse stock watcher (github.com/JonSim28/jsim-cutpurse)' } });
  if (!r.ok) throw new Error('YATA HTTP ' + r.status);
  const j = await r.json();
  const countries = (j && j.stocks) || j || {};
  const now = Math.floor(Date.now() / 1000);
  let seen = 0, changed = 0;
  for (const code in countries) {
    const ct = countries[code] || {}, list = Array.isArray(ct.stocks) ? ct.stocks : [];
    const it = list.find(s => +s.id === XAN_ID || /^xanax$/i.test(s.name || ''));
    if (!it) continue;
    seen++;
    const c = data.c[code] = data.c[code] || {};
    if (observe(c, +ct.update || now, +it.quantity || 0, +it.cost || 0)) changed++;
    c.seen = now;
  }
  if (!seen) throw new Error('no Xanax found in the YATA export');
  data.t = now; data.v = 1;
  fs.writeFileSync(FILE, JSON.stringify(data));
  console.log(`countries with Xanax: ${seen}, new readings: ${changed}`);
  for (const code in data.c) { const c = data.c[code], l = c.hist[c.hist.length - 1]; console.log(code, 'stock', l && l[1], 'restocks seen', (c.restocks || []).length, 'ratios', (c.ratios || []).join(',')); }
})().catch(e => { console.error(e.message || e); process.exit(1); });
