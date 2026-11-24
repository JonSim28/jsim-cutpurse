// ==UserScript==
// @name         J_Sim Hustle
// @namespace    jsim-hustle
// @version      1.1.0
// @description  Flip it for profit. Supply pack and museum set profit checks from bazaar prices (weav3r), plus price alerts for bazaars and the item market.
// @license      MIT
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      weav3r.dev
// @connect      api.torn.com
// @run-at       document-idle
// ==/UserScript==
/* global GM_xmlhttpRequest, GM_getValue, PDA_httpGet, __hsPdaKey */
(function () {
'use strict';
const VERSION = '1.1.0';   // keep in step with @version above
// The auto-updating loader passes Torn PDA's key in as __hsPdaKey (PDA only fills the placeholder in the installed script).
const PDA_KEY = (typeof __hsPdaKey === 'string' && __hsPdaKey && __hsPdaKey.indexOf('###') !== 0) ? __hsPdaKey : '###PDA-APIKEY###';
try { window.JSimHustle = { version: VERSION }; } catch {}

function start() {
  try { if (document.documentElement.dataset.jsimHustle) return; document.documentElement.dataset.jsimHustle = VERSION; } catch {}
  try { hustle(); } catch (e) { errorBar('start', e); }
}
// A small red message instead of failing silently, so problems can be reported
function errorBar(where, e) {
  try {
    console.error('[Hustle] ' + where + ' failed:', e);
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;left:8px;right:8px;top:70px;z-index:2147483647;padding:8px 10px;border-radius:8px;background:#9b2c2c;color:#fff;font:600 12px Arial;box-shadow:0 2px 8px #0008';
    t.textContent = 'Hustle (' + where + ') error: ' + (e && e.message || e) + ' · v' + VERSION + ' · tap to close';
    t.onclick = () => t.remove();
    document.body.appendChild(t);
  } catch {}
}

function hustle() {

/* =================== DATA =================== */
// Supply packs. 'oneOf': you get one outcome, all equally likely (Drug Pack: 10 Xanax OR 10 Vicodin).
// 'mix': qty items, each drawn at random from the list. Outcomes with their own amount use { name, qty }.
const PACKS = [
  { name: 'Drug Pack', id: 370, type: 'oneOf', qty: 10, contents: ['Xanax', 'Vicodin'] },
  { name: 'Box of Medical Supplies', id: 365, type: 'oneOf',
    contents: [{ name: 'First Aid Kit', qty: 30 }, { name: 'Morphine', qty: 20 }, { name: 'Small First Aid Kit', qty: 50 }, { name: 'Empty Blood Bag', qty: 20 }] },
  { name: 'Box of Grenades', id: 364, type: 'oneOf', qty: 100, contents: ['Grenade', 'HEG'] },
  { name: 'Six-Pack of Alcohol', id: 817, type: 'mix', qty: 6,
    contents: ['Bottle of Kandy Kane', 'Bottle of Pumpkin Brew', 'Bottle of Minty Mayhem', 'Bottle of Wicked Witch', 'Bottle of Mistletoe Madness', 'Bottle of Stinky Swamp Punch'] },
  { name: 'Six-Pack of Energy Drink', id: 818, type: 'mix', qty: 6,
    contents: ['Can of Munster', 'Can of Santa Shooters', 'Can of Red Cow', 'Can of Rockstar Rudolph', 'Can of Taurine Elite', 'Can of X-MASS'] },
  { name: 'Tin of Treats', id: 1298, type: 'mix', qty: 6,
    contents: ['Jawbreaker', 'Pixie Sticks', 'Bag of Candy Kisses', 'Bag of Tootsie Rolls', 'Bag of Chocolate Truffles', 'Bag of Sherbet'] },
  { name: 'Goodie Bag', id: 588, type: 'mix', qty: 30, note: 'Estimate: the wiki list may be incomplete and the odds are unknown.',
    contents: ['Bag of Candy Kisses', 'Bag of Chocolate Truffles', 'Bag of Sherbet', 'Bag of Tootsie Rolls', 'Jawbreaker',
      'Bottle of Kandy Kane', 'Bottle of Minty Mayhem', 'Bottle of Mistletoe Madness', 'Bottle of Pumpkin Brew', 'Bottle of Stinky Swamp Punch', 'Bottle of Wicked Witch',
      'Can of Munster', 'Can of Red Cow', 'Can of Rockstar Rudolph', 'Can of Santa Shooters', 'Can of Taurine Elite', 'Can of X-MASS'] },
];
// Item IDs (Torn wiki). Add new ones here when adding a pack.
const ITEM_IDS = {
  'xanax': 206, 'vicodin': 205, 'first aid kit': 67, 'small first aid kit': 68, 'morphine': 66, 'empty blood bag': 731,
  'grenade': 220, 'heg': 242,
  'bottle of kandy kane': 550, 'bottle of minty mayhem': 551, 'bottle of mistletoe madness': 552,
  'bottle of pumpkin brew': 531, 'bottle of stinky swamp punch': 541, 'bottle of wicked witch': 542,
  'can of munster': 530, 'can of red cow': 532, 'can of taurine elite': 533, 'can of santa shooters': 553, 'can of rockstar rudolph': 554, 'can of x-mass': 555,
  'bag of candy kisses': 527, 'bag of tootsie rolls': 528, 'bag of chocolate truffles': 529, 'jawbreaker': 586, 'bag of sherbet': 587, 'pixie sticks': 151,
};
const idOf = c => ITEM_IDS[(typeof c === 'string' ? c : c.name).toLowerCase()];
// Museum exchanges. items: [name, itemId, quantity needed]
const SETS = [
  { name: 'Plushie set', points: 10, items: [
    ['Jaguar Plushie', 258, 1], ['Lion Plushie', 281, 1], ['Panda Plushie', 274, 1], ['Monkey Plushie', 269, 1], ['Chamois Plushie', 273, 1],
    ['Wolverine Plushie', 270, 1], ['Nessie Plushie', 266, 1], ['Red Fox Plushie', 268, 1], ['Camel Plushie', 384, 1], ['Kitten Plushie', 215, 1],
    ['Teddy Bear Plushie', 187, 1], ['Sheep Plushie', 186, 1], ['Stingray Plushie', 618, 1]] },
  { name: 'Exotic flower set', points: 10, items: [
    ['Dahlia', 260, 1], ['Orchid', 264, 1], ['African Violet', 282, 1], ['Cherry Blossom', 277, 1], ['Peony', 276, 1], ['Ceibo Flower', 271, 1],
    ['Edelweiss', 272, 1], ['Crocus', 263, 1], ['Heather', 267, 1], ['Tribulus Omanense', 385, 1], ['Banana Orchid', 617, 1]] },
  { name: 'Arrowhead set', points: 25, items: [
    ['Obsidian Point', 1499, 1], ['Quartz Point', 1504, 1], ['Basalt Point', 1502, 1], ['Chert Point', 1501, 1], ['Chalcedony Point', 1503, 1], ['Quartzite Point', 1500, 1]] },
  { name: 'Medieval Coin set', points: 100, items: [['Leopard Coin', 450, 1], ['Florin Coin', 451, 1], ['Gold Noble Coin', 452, 1]] },
  { name: 'Companion Scripts', points: 1000, items: [['Companion Script : Abdullah', 455, 1], ['Companion Script : Ali', 457, 1], ['Companion Script : Ubay', 456, 1]] },
  { name: 'Senet Game set', points: 2000, items: [['Senet Board', 462, 1], ['White Senet Pawn', 460, 5], ['Black Senet Pawn', 461, 5]] },
  { name: 'Meteorite Fragment', points: 15, items: [['Meteorite Fragment', 1488, 1]] },
  { name: 'Patagonian Fossil', points: 20, items: [['Patagonian Fossil', 1487, 1]] },
  { name: 'Vairocana Buddha Sculpture', points: 100, items: [['Vairocana Buddha Sculpture', 454, 1]] },
  { name: 'Ganesha Sculpture', points: 250, items: [['Ganesha Sculpture', 453, 1]] },
  { name: 'Shabti Sculpture', points: 500, items: [['Shabti Sculpture', 458, 1]] },
  { name: 'Egyptian Amulet', points: 10000, items: [['Egyptian Amulet', 459, 1]] },
];
// Items you can set price alerts for, shown A–Z
const WATCH_ITEMS = [
  ['Box of Grenades', 364], ['Box of Medical Supplies', 365], ['Business Class Ticket', 396], ['Can of Taurine Elite', 533], ['Can of X-MASS', 555],
  ['Donator Pack', 283], ['Drug Pack', 370], ['Erotic DVD', 366], ['Feathery Hotel Coupon', 367], ['Love Juice', 870],
  ['Six-Pack of Alcohol', 817], ['Six-Pack of Energy Drink', 818], ['Tin of Treats', 1298], ['Xanax', 206],
].sort((a, b) => a[0].localeCompare(b[0]));
const itemName = id => (WATCH_ITEMS.find(i => i[1] === id) || [`Item ${id}`])[0];

/* =================== SETTINGS =================== */
const RESULTS_MS = 10 * 60e3;   // a finished scan stays on screen (even after a page change) for this long
const REUSE_MS = 2 * 60e3;      // a scan reuses prices fetched in the last 2 minutes
const BAIT_RATIO = 0.25;        // in scans, listings under 25% of market value are bait ($1 bazaars) and skipped
// weav3r's per-minute limit isn't published, so Hustle learns it: start at 15 a minute, drop to what weav3r
// actually allowed if it ever says "too many", and try one more after every 10 minutes without a block.
const W3_START_CAP = 15, W3_MIN_CAP = 5, W3_MAX_CAP = 30, W3_PROBE_MS = 10 * 60e3;
const W3_GAP_MS = 400;
// weav3r rebuilds each item's data about every 30s and serves the same copy in between, so bazaar alerts
// check each item just after its next rebuild: as quick as checking non-stop, for a fraction of the requests.
const W_SLOTS = 3, W_GUESS_MS = 30e3, W_AFTER_MS = 500, W_RETRY_MS = 2000, W_NO_STAMP_MS = 6000;
const W_GUARD_MS = 2000;   // a scan never takes the request slot a watched item needs within this time
const M_SLOTS = 5, M_INTERVAL_MS = 5000;   // item market alerts (Torn API): each item every 5s

/* =================== STORAGE =================== */
// torn.com's storage is shared with other scripts; if it's full, save in this tab instead
const S = {
  get(k, d) { try { const v = sessionStorage.getItem('hsfb_' + k) ?? localStorage.getItem('hs_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) {
    const s = JSON.stringify(v);
    try { localStorage.setItem('hs_' + k, s); try { sessionStorage.removeItem('hsfb_' + k); } catch {} return true; } catch {}
    try { trimPrices(true); localStorage.setItem('hs_' + k, s); return true; } catch {}
    try { sessionStorage.setItem('hsfb_' + k, s); return true; } catch { return false; }
  },
};
// One-off: bring over settings from the old "Torn Profit Checker" script
if (!S.get('migrated', 0)) {
  const old = k => {
    try { if (typeof GM_getValue === 'function') { const v = GM_getValue(k); if (v !== undefined) return v; } } catch {}
    try { const v = localStorage.getItem(k); return v == null ? undefined : JSON.parse(v); } catch { return undefined; }
  };
  const slots = o => (o && o.slots || []).map(s => ({ itemId: +s.itemId || 0, max: +s.max || 0 }));
  const ow = old('tpc_watch2'), om = old('tpc_market');
  if (ow) { S.set('watch', { slots: slots(ow) }); if (ow.sameTab === false) S.set('sameTab', false); }
  if (om) { S.set('market', { slots: slots(om) }); if (om.key) S.set('key', om.key); }
  if (old('tpc_point_price')) S.set('pointPrice', +old('tpc_point_price'));
  if (old('tpc_museum_day')) S.set('museumDay', true);
  if (old('tpc_toggle_y')) S.set('toggleY', +old('tpc_toggle_y'));
  S.set('migrated', 1);
}
// Torn API key (item market alerts): saved here, else Torn PDA's, else the one saved in J_Sim Cutpurse
const tornKey = () => {
  const own = S.get('key', '');
  if (own) return own;
  if (PDA_KEY.indexOf('###') !== 0) return PDA_KEY;
  try { return JSON.parse(localStorage.getItem('ths_key') || '""') || localStorage.getItem('tal_ffkey') || ''; } catch { return ''; }
};

/* =================== HELPERS =================== */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => n == null || isNaN(n) ? '—' : (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-GB');
// Accepts 850000, 850,000, 850k, 1.2m
const parseMoney = t => { const m = String(t).toLowerCase().replace(/[$,\s]/g, '').match(/^(\d*\.?\d+)([kmb]?)$/); return m ? Math.round(+m[1] * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1)) : 0; };
const fmtAge = sec => { if (sec == null || !isFinite(sec)) return ''; sec = Math.max(0, Math.round(sec)); return sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s` : `${Math.floor(sec / 3600)}h ${String(Math.floor(sec / 60) % 60).padStart(2, '0')}m`; };
const parseTime = v => { if (v == null || v === '') return 0; if (typeof v === 'number') return v < 1e12 ? v * 1000 : v; const t = Date.parse(v); return isNaN(t) ? 0 : t; };
const w3Link = id => `https://weav3r.dev/item/${id}`;
const bazaarLink = (pid, id, price) => `https://www.torn.com/bazaar.php?userId=${pid}&itemId=${id}&price=${price}&highlight=1#/`;
const marketLink = id => `https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=${id}`;
let sameTab = S.get('sameTab', true);   // opening alert links in this tab loads faster in PDA
const target = () => (sameTab ? '_self' : '_blank');
const itemOptions = WATCH_ITEMS.map(([n, id]) => `<option value="${id}">${esc(n)}</option>`).join('');

/* =================== NETWORK =================== */
const retryAfter = raw => { const v = (String(raw || '').match(/^retry-after:\s*(.+)$/im) || [])[1]; if (!v) return 0; const n = +v; if (n >= 0) return n * 1000; const t = Date.parse(v); return isNaN(t) ? 0 : Math.max(0, t - Date.now()); };
function http(url) {
  if (typeof GM_xmlhttpRequest === 'function') {
    return new Promise((res, rej) => GM_xmlhttpRequest({ method: 'GET', url, timeout: 20000,
      onload: r => res({ status: r.status, text: r.responseText, headers: r.responseHeaders || '' }),
      onerror: () => rej(new Error('Network error')), ontimeout: () => rej(new Error('Timed out')) }));
  }
  if (typeof PDA_httpGet === 'function') return PDA_httpGet(url, {}).then(r => ({ status: +r.status || 200, text: r.responseText, headers: r.responseHeaders || '' }));
  return fetch(url).then(async r => ({ status: r.status, text: await r.text(), headers: 'retry-after: ' + (r.headers.get('retry-after') || '') }));
}
async function getJSON(url) {
  const r = await http(url);
  if (r.status !== 200) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status, retryAfterMs: retryAfter(r.headers) });
  return JSON.parse(r.text);
}

/* =================== WEAV3R PRICES (one shared queue for scans and bazaar alerts) =================== */
let px = S.get('px', {});   // itemId -> { t, mkt, l: [[price, qty], ...] cheapest first }
function trimPrices(hard) {
  const cut = Date.now() - (hard ? REUSE_MS : RESULTS_MS);
  for (const id in px) if (px[id].t < cut) delete px[id];
  try { localStorage.setItem('hs_px', JSON.stringify(px)); } catch {}
}
function storePrices(id, d, recv) {
  const l = (d.listings || []).filter(x => !x.sponsored)   // sponsored rows repeat a normal listing
    .map(x => [+x.price, +(x.quantity ?? x.amount) || 1]).filter(x => x[0] > 0).sort((a, b) => a[0] - b[0]).slice(0, 20);
  px[id] = { t: recv, mkt: +d.market_price || 0, l };
  trimPrices(false);
}
// Cheapest real price (bait skipped) from a price fetched at or after `since`
function priceInfo(id, since) {
  const p = px[id];
  if (!p || p.t < since) return null;
  const floor = p.mkt ? p.mkt * BAIT_RATIO : 1;
  const ls = p.l.filter(x => x[0] >= floor);
  return { price: ls.length ? ls[0][0] : (p.mkt || null), fromMarket: !ls.length, ls };
}
// Cost of buying `need`, filling from the cheapest sellers upwards
function costFor(info, need) {
  if (!info) return null;
  if (!info.ls.length) return info.price ? { total: info.price * need, sellers: 0, short: false } : null;
  let left = need, total = 0, sellers = 0;
  for (const [p, q] of info.ls) { if (left <= 0) break; const take = Math.min(q, left); total += take * p; left -= take; sellers++; }
  return { total, sellers, short: left > 0 };
}

// weav3r refresh timing per item (learnt from every fetch, scans included)
let tm = S.get('tm', {});
const tmOf = id => (tm[id] = tm[id] || { gen: 0, period: 0, gaps: [], offs: [], off: 0, last: 0, stale: 0, err: '' });
function noteTiming(id, d, recv) {
  const t = tmOf(id), prev = t.last, g = parseTime(d.generated_at);
  t.last = recv; t.err = '';
  if (g && g !== t.gen) {
    // Only gaps between checks close together tell us the cycle (a long gap can span several rebuilds)
    if (t.gen && recv - prev < 45e3) {
      t.gaps.push(g - t.gen); if (t.gaps.length > 6) t.gaps.shift();
      t.period = Math.max(10e3, Math.min(120e3, Math.min(...t.gaps)));   // shortest gap = the real cycle
    }
    t.gen = g; t.stale = 0;
    t.offs.push(recv - g); if (t.offs.length > 5) t.offs.shift();
    t.off = Math.min(...t.offs);   // phone clock vs weav3r clock, plus network time
  } else if (g) { t.stale++; if (t.gen && recv - t.gen - t.off > 120e3) t.gen = 0; }
  else t.gen = 0;
  const keep = new Set(watch.slots.map(s => String(s.itemId)));
  for (const k in tm) if (!keep.has(k) && recv - tm[k].last > RESULTS_MS) delete tm[k];
  S.set('tm', tm);
}

const w3 = { times: [], last: 0, blockedUntil: S.get('w3block', 0), cap: S.get('w3cap', W3_START_CAP), capT: S.get('w3capT', Date.now()) };
const saveCap = () => { w3.capT = Date.now(); S.set('w3cap', w3.cap); S.set('w3capT', w3.capT); };
const w3Recent = () => { const cut = Date.now() - 60e3; while (w3.times.length && w3.times[0] < cut) w3.times.shift(); return w3.times.length; };
// How long until weav3r can take another request (`cap` = how much of the minute's budget may be used)
function w3Wait(cap = w3.cap) {
  const now = Date.now();
  let w = Math.max(w3.blockedUntil - now, w3.last + W3_GAP_MS - now);
  if (w3Recent() >= cap) w = Math.max(w, w3.times[w3Recent() - cap] + 60e3 - now + 50);
  return w;
}
async function w3Get(id) {
  w3.last = Date.now(); w3.times.push(w3.last);
  try {
    const d = await getJSON(`https://weav3r.dev/api/marketplace/${id}?limit=100`);
    const recv = Date.now();
    noteTiming(id, d, recv); storePrices(id, d, recv);
    if (recv - w3.capT > W3_PROBE_MS && w3.cap < W3_MAX_CAP) { w3.cap++; saveCap(); }   // no block for a while: allow one more
    return d;
  } catch (e) {
    if (e.status === 429) {
      w3.blockedUntil = Date.now() + Math.max(e.retryAfterMs || 0, 10000); S.set('w3block', w3.blockedUntil);
      // The requests that got through this minute = weav3r's real limit (if something else used some, just step down one)
      const ok = w3Recent() - 1;
      w3.cap = Math.max(W3_MIN_CAP, ok > 0 && ok < w3.cap ? ok : w3.cap - 1); saveCap();
    }
    throw e;
  }
}

// One scheduler runs every weav3r request. Bazaar alerts come first; scans use what's left of the minute.
const scanQ = [];   // { id, resolve, reject, tries }
let schedTimer = null, schedBusy = false;
const kick = (ms = 0) => { clearTimeout(schedTimer); schedTimer = setTimeout(schedTick, ms); };
const stopErr = () => Object.assign(new Error('Stopped'), { stopped: true });
function queueScan(id) { return new Promise((resolve, reject) => { scanQ.push({ id, resolve, reject, tries: 0 }); kick(); }); }
const scanBudget = () => Math.max(1, w3.cap - (watch.active ? 2 * activeW().length : 0));
async function schedTick() {
  if (schedBusy) return;
  const now = Date.now();
  const wn = watch.active ? watchNext() : null;
  const want = wn && wn.due <= now ? 'watch' : scanQ.length ? 'scan' : null;
  if (!want) { if (wn) kick(Math.min(1000, Math.max(50, wn.due - now))); return; }
  if (want === 'scan' && wn && wn.due - now < W_GUARD_MS) return kick(Math.min(1000, Math.max(50, wn.due - now)));
  const wait = w3Wait(want === 'scan' ? scanBudget() : w3.cap);
  if (wait > 0) return kick(Math.min(1000, wait));
  schedBusy = true;
  try {
    if (want === 'watch') await watchCheck(wn.sl);
    else {
      const job = scanQ.shift();
      try { job.resolve(await w3Get(job.id)); }
      catch (e) { if (e.status === 429 && job.tries++ < 6) scanQ.unshift(job); else job.reject(e); }
    }
  } catch (e) { errorBar('weav3r', e); }
  finally { schedBusy = false; kick(50); }
}

/* =================== PROFIT MATHS =================== */
let pointPrice = S.get('pointPrice', 0), museumDay = S.get('museumDay', false);
function evalPack(pack, since) {
  const pk = priceInfo(pack.id, since), n = pack.contents.length;
  const items = pack.contents.map(c => {
    const name = typeof c === 'string' ? c : c.name, qty = typeof c === 'string' ? pack.qty : c.qty, id = idOf(c);
    return { name, qty, id, share: qty / n, inf: id ? priceInfo(id, since) : null };   // share: expected count per pack
  });
  const pending = (pk ? 0 : 1) + items.filter(i => i.id && !i.inf).length;
  const known = items.filter(i => i.inf && i.inf.price);
  const knownShare = known.reduce((s, i) => s + i.share, 0), allShare = items.reduce((s, i) => s + i.share, 0);
  // Missing prices: scale up from the ones we have
  const ev = knownShare ? known.reduce((s, i) => s + i.share * i.inf.price, 0) * allShare / knownShare : null;
  const cost = pk && pk.price;
  return { pack, pk, items, pending, ev, profit: !pending && cost && ev != null ? ev - cost : null, missing: items.length - known.length };
}
function evalSet(set, since) {
  const items = set.items.map(([name, id, qty]) => { const inf = priceInfo(id, since), c = costFor(inf, qty); return { name, id, qty, inf, c }; });
  const pending = items.filter(i => !i.inf).length;
  const bad = items.filter(i => i.inf && (!i.c || i.c.short)).length;
  const cost = pending || bad ? null : items.reduce((s, i) => s + i.c.total, 0);
  const points = set.points * (museumDay ? 1.1 : 1), value = pointPrice ? points * pointPrice : null;
  return { set, items, pending, bad, cost, points, value, perPoint: cost != null ? cost / points : null, profit: cost != null && value != null ? value - cost : null };
}

/* =================== J_SIM BRAND (same as J_Sim Cutpurse) =================== */
const BRAND_GREEN = '#006a4e';
(function loadBrandFonts() {
  try {
    if (document.getElementById('jsim-fonts')) return;
    const l = document.createElement('link');
    l.id = 'jsim-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Black+Ops+One&family=Permanent+Marker&display=swap';
    (document.head || document.documentElement).appendChild(l);
  } catch {}
})();
const BRAND_CSS = `.tsc-brand{display:flex;align-items:center;gap:8px;padding:5px 9px 5px 8px;background:#dcd8ce;border-radius:8px 8px 0 0;border-bottom:2px solid ${BRAND_GREEN}}
.tsc-brand svg{flex:none;display:block}
.tsc-brand .tsc-title{display:flex;flex-direction:column;line-height:1;min-width:0}
.tsc-brand .tsc-cut{font-family:'Bebas Neue',Impact,'Arial Narrow',sans-serif;font-size:27px;letter-spacing:2px;color:#10251c}
.tsc-brand .tsc-tool{font:italic 700 10px Arial;letter-spacing:.2px;color:${BRAND_GREEN};margin-top:1px;white-space:nowrap}
.tsc-brand .tsc-by{margin-left:auto;display:flex;align-items:center;gap:4px;padding-left:8px;border-left:1px solid #c2bdb1}
.tsc-brand .tsc-words{display:flex;flex-direction:column;line-height:1}
.tsc-brand .tsc-name{font-family:'Permanent Marker','Comic Sans MS',cursive;font-size:14px;color:#10251c;transform:rotate(-4deg);transform-origin:left center}
.tsc-brand .tsc-sub{font-family:'Black Ops One',Impact,sans-serif;font-size:7px;letter-spacing:1.5px;color:${BRAND_GREEN};margin:1px 0 0 2px}`;
const BRAND_SPECKLE = (() => {
  let seed = 7, d = '';
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, dist = 41 + rnd() * 9, r = 0.6 + rnd() * 1.6;
    const x = 50 + Math.cos(a) * dist, y = 48 + Math.sin(a) * dist;
    d += `M${(x - r).toFixed(2)} ${y.toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0`;
  }
  return d;
})();
// Hustle's own mark: a price line climbing off the coin
const LOGO = size => `<svg width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="Hustle logo: a rising price arrow">
  <circle cx="50" cy="50" r="40" fill="${BRAND_GREEN}"></circle>
  <circle cx="50" cy="50" r="31" fill="none" stroke="#dcd8ce" stroke-width="3" opacity="0.35"></circle>
  <polyline points="24,68 42,49 54,59 74,37" fill="none" stroke="#dcd8ce" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"></polyline>
  <polygon points="82,28 82,50 60,28" fill="#dcd8ce"></polygon></svg>`;
const brandHTML = tool => `<div class="tsc-brand">${LOGO(30)}
    <div class="tsc-title"><span class="tsc-cut">HUSTLE</span><span class="tsc-tool">${tool}</span></div>
    <div class="tsc-by" title="Made by J_Sim [3659615]">
      <svg width="20" height="22" viewBox="0 0 100 108" aria-hidden="true">
        <path d="${BRAND_SPECKLE}" fill="${BRAND_GREEN}" fill-opacity="0.6"></path>
        <circle cx="50" cy="48" r="40" fill="${BRAND_GREEN}"></circle>
        <rect x="30" y="80" width="5" height="18" rx="2.5" fill="${BRAND_GREEN}"></rect>
        <rect x="47" y="84" width="4" height="22" rx="2" fill="${BRAND_GREEN}"></rect>
        <rect x="66" y="78" width="5" height="13" rx="2.5" fill="${BRAND_GREEN}"></rect>
        <text x="50" y="68" text-anchor="middle" font-family="Black Ops One, Impact, sans-serif" font-size="58" fill="#dcd8ce">J</text>
      </svg>
      <div class="tsc-words"><span class="tsc-name">J_Sim</span><span class="tsc-sub">SCRIPTS</span></div>
    </div></div>`;
const DONATE_TO = 'J_Sim [3659615]';

/* =================== UI =================== */
const css = `${BRAND_CSS}
#hs-toggle{position:fixed;left:0;top:45%;z-index:99999;touch-action:none;user-select:none;-webkit-user-select:none;display:flex;flex-direction:column;align-items:center;gap:2px;
  min-width:36px;padding:7px 4px;background:#1f1f1f;border:1px solid #0a3d2c;border-left:0;border-radius:0 8px 8px 0;box-shadow:2px 2px 6px #0008;cursor:pointer}
#hs-toggle.busy{border-color:#7fb3ff}#hs-toggle.watching{border-color:#ed8936}
#hs-toggle span{font:700 10px Arial;color:#ccc;white-space:nowrap}#hs-toggle span:empty{display:none}
#hs-toggle .ok{color:#68d391;font-size:13px}#hs-toggle .bad{color:#fc8181;font-size:13px}#hs-toggle .wb{color:#ed8936;font-size:11px}
#hs{position:fixed;left:8px;right:8px;top:11vh;max-width:440px;max-height:78vh;z-index:99999;display:none;flex-direction:column;overflow:hidden;
  background:#1f1f1f;color:#ddd;border:1px solid #0a3d2c;border-radius:8px;font:12px Arial,sans-serif;box-shadow:0 4px 14px #000a}
#hs.on{display:flex}
#hs .top{flex:none;background:#1f1f1f;border-bottom:1px solid #333}
#hs button{font:600 12px Arial;color:#ddd;background:#2d3b35;border:0;border-radius:4px;padding:5px 9px;cursor:pointer}
#hs button:disabled{opacity:.45}
#hs .tabs{display:flex;gap:2px;margin:7px 8px 0;padding:3px;border-radius:9px;background:#141414;box-shadow:inset 0 2px 4px #000c}
#hs .tabs button{flex:1;padding:6px 2px;background:transparent;color:#8a9a93;border-radius:7px;font-size:11.5px;transition:background .15s,color .15s}
#hs .tabs button.on{background:#0a3d2c;color:#fff;box-shadow:0 1px 3px #000b,inset 0 1px 0 #ffffff1f}
#hs .bar{display:flex;gap:5px;align-items:center;padding:7px 8px 4px}
#hs .go{background:${BRAND_GREEN};color:#fff;min-width:66px;font-weight:700}
#hs .go.stop{background:#9b2c2c}
#hs .ic{padding:5px 8px;background:#2d2d2d}#hs .ic.on{background:${BRAND_GREEN}}
#hs .grow{flex:1}
#hs .stat{padding:0 9px 7px;color:#9fb3aa;font-size:11px;min-height:13px}
#hs .set{display:none;flex-direction:column;gap:7px;padding:8px 9px;border-top:1px solid #333;background:#232826;max-height:40vh;overflow-y:auto}
#hs .set.on{display:flex}
#hs .row2{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#hs .lbl{flex:0 0 74px;color:#9fb3aa;font-weight:700;font-size:11px}
#hs .hint{color:#8a9a93;font-size:11px}
#hs input,#hs select{background:#1a1a1a;color:#fff;border:1px solid #444;border-radius:4px;padding:4px 6px;font:12px Arial}
#hs .body{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
#hs .view{display:none;padding:7px 8px 2px}#hs .view.on{display:block}
#hs .ctl{display:flex;flex-direction:column;gap:5px;margin-bottom:7px}
#hs .slot{display:flex;gap:5px}#hs .slot select{flex:1;min-width:0}#hs .slot input{width:92px;flex:none}
#hs .card{border:1px solid #333;border-radius:6px;padding:7px 8px;margin-bottom:7px;background:#232323}
#hs .card[data-key]{cursor:pointer}
#hs .r{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:2px 0}
#hs .r b{color:#fff}
#hs .card a{color:#7fb3ff;text-decoration:none}
#hs .pos{color:#68d391;font-weight:700}#hs .neg{color:#fc8181;font-weight:700}#hs .dim{color:#8a8a8a}
#hs .more{display:none;margin-top:5px;padding-top:5px;border-top:1px solid #333;font-size:11px;color:#aaa}
#hs .card.open .more{display:block}
#hs .li{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #2e2e2e}
#hs .li:first-of-type{border-top:0}
.hs-buy{flex:none;white-space:nowrap;background:${BRAND_GREEN};color:#fff!important;text-decoration:none!important;border-radius:4px;padding:4px 8px;font:700 12px Arial}
.hs-new{background:#ed8936;color:#000;border-radius:3px;padding:0 4px;font:700 10px Arial;margin-left:4px}
#hs .donate{display:block;margin:4px 8px 8px;padding:7px 9px;border-radius:6px;background:#0a3d2c;color:#e6f2ec!important;text-align:center;font:600 12px Arial;text-decoration:none}
#hs-alert{position:fixed;left:8px;right:8px;top:8px;max-width:440px;max-height:60vh;overflow:auto;z-index:100000;display:none;
  background:#1f1f1f;color:#ddd;border:2px solid #ed8936;border-radius:8px;font:13px Arial,sans-serif;box-shadow:0 4px 16px #000c}
#hs-alert .ah{display:flex;justify-content:space-between;align-items:center;padding:7px 9px;background:#0a3d2c;color:#fff;font-weight:700}
#hs-alert .ah button{background:#2d2d2d;color:#fff;border:0;border-radius:4px;padding:5px 10px}
#hs-alert .sec{padding:6px 9px 2px;color:#fbd38d;font-weight:700;display:flex;justify-content:space-between;align-items:center;gap:8px}
#hs-alert .li{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 9px;border-top:1px solid #2e2e2e}
#hs-alert .dim{color:#8a8a8a}`;
const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

const TABS = { packs: '📦 Packs', museum: '🏛️ Museum', bazaar: '🔎 Bazaar', market: '🏪 Market' };
const slotRows = (n, kind) => Array.from({ length: n }, (_, i) =>
  `<div class="slot"><select data-${kind}="${i}"><option value="0">— empty —</option>${itemOptions}</select><input type="text" data-${kind}max="${i}" inputmode="decimal" placeholder="Max $"></div>`).join('');
const toggle = document.createElement('div');
toggle.id = 'hs-toggle'; toggle.title = 'J_Sim Hustle';
toggle.innerHTML = `${LOGO(24)}<span id="hs-b1"></span><span id="hs-b2" class="wb"></span>`;
const panel = document.createElement('div');
panel.id = 'hs';
panel.innerHTML = `<div class="top">${brandHTML('Flip it for profit')}
  <div class="tabs">${Object.entries(TABS).map(([k, v]) => `<button type="button" data-tab="${k}">${v}</button>`).join('')}</div>
  <div class="bar"><button type="button" class="go" id="hs-go">Scan</button><span class="grow"></span>
    <button type="button" class="ic" id="hs-gear" title="Settings">⚙</button><button type="button" class="ic" id="hs-x" title="Close (everything keeps running)">✕</button></div>
  <div class="stat" id="hs-stat"></div>
  <div class="set" id="hs-set">
    <div class="row2"><span class="lbl">API key</span><input id="hs-key" type="password" autocomplete="off" placeholder="Torn API key" style="flex:1;min-width:0"><button type="button" id="hs-keysave">Save</button></div>
    <div class="hint">For item market alerts. Public access is enough. Found automatically from Torn PDA or J_Sim Cutpurse if you have them.</div>
    <div class="row2"><span class="lbl">Alert links</span><button type="button" id="hs-tab"></button></div>
    <div class="row2"><span class="lbl">Sound</span><button type="button" id="hs-test">🔊 Test sound</button><span class="hint">tap once after a page change to arm it</span></div>
    <div class="row2"><span class="lbl">Prices</span><button type="button" id="hs-clear">Clear saved prices</button></div>
    <div class="hint">J_Sim Hustle v${VERSION} · prices from weav3r.dev · item market from the Torn API</div>
  </div></div>
<div class="body" id="hs-body">
  <div class="view" data-view="packs"><div class="out"></div></div>
  <div class="view" data-view="museum"><div class="ctl"><div class="row2"><span class="lbl">Point price</span><input id="hs-pp" type="text" inputmode="numeric" placeholder="e.g. 45k" style="width:96px">
    <label class="hint"><input id="hs-md" type="checkbox"> Museum Day +10%</label></div></div><div class="out"></div></div>
  <div class="view" data-view="bazaar"><div class="ctl">${slotRows(W_SLOTS, 'w')}<div class="hint">Bazaars via weav3r. Checks are timed to weav3r's 30-second refresh, so you see new listings as soon as weav3r has them.</div></div><div class="out"></div></div>
  <div class="view" data-view="market"><div class="ctl">${slotRows(M_SLOTS, 'm')}<div class="hint">Torn's item market via your API key. Each item is checked every 5 seconds.</div></div><div class="out"></div></div>
  <a class="donate" href="/item.php#drugs-items" target="_blank" rel="noopener">💊 Support the script: send 1 Xanax to ${DONATE_TO}</a>
</div>`;
const alertBox = document.createElement('div');
alertBox.id = 'hs-alert';
document.body.append(toggle, panel, alertBox);

const q = s => panel.querySelector(s);
const outOf = tab => q(`.view[data-view="${tab}"] .out`);
const b1 = toggle.querySelector('#hs-b1'), b2 = toggle.querySelector('#hs-b2');
const setB1 = (t, cls = '') => { b1.textContent = t; b1.className = cls; };
const isOpen = () => panel.classList.contains('on');
let tab = TABS[S.get('tab', 'packs')] ? S.get('tab', 'packs') : 'packs';
const stat = { packs: 'Tap Scan to check supply packs.', museum: 'Enter the point price, then tap Scan.', bazaar: 'Pick up to 3 items with a max price, then tap Scan.', market: 'Pick up to 5 items with a max price, then tap Scan.' };
const setStat = (t, text) => { stat[t] = text; if (t === tab) q('#hs-stat').textContent = text; };

function showTab(t) {
  tab = t; S.set('tab', t);
  panel.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  panel.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.dataset.view === t));
  q('#hs-body').scrollTop = 0;
  render(t); updateBar();
}
function updateBar() {
  const go = q('#hs-go');
  const on = tab === 'bazaar' ? watch.active : tab === 'market' ? mkt.active : scanning === tab;
  go.textContent = on ? 'Stop' : 'Scan';
  go.classList.toggle('stop', on);
  go.disabled = (tab === 'packs' || tab === 'museum') && !!scanning && scanning !== tab;
  q('#hs-stat').textContent = stat[tab];
  q('#hs-tab').textContent = sameTab ? 'Open in this tab (faster)' : 'Open in a new tab';
}
panel.querySelectorAll('.tabs button').forEach(b => (b.onclick = () => showTab(b.dataset.tab)));
q('#hs-go').onclick = () => {
  unlockAudio();
  if (tab === 'bazaar') return watch.active ? stopWatch() : startWatch(false);
  if (tab === 'market') return mkt.active ? stopMarket() : startMarket(false);
  return scanning === tab ? stopScan() : scan(tab);
};
q('#hs-gear').onclick = () => { const on = !q('#hs-set').classList.contains('on'); q('#hs-set').classList.toggle('on', on); q('#hs-gear').classList.toggle('on', on); };
q('#hs-x').onclick = () => panel.classList.remove('on');
const openPanel = () => { panel.classList.add('on'); if (!scanning) setB1(''); expireOld(); render(tab); updateBar(); };
q('#hs-key').value = S.get('key', '');
q('#hs-key').placeholder = tornKey() ? 'Using your PDA / Cutpurse key' : 'Torn API key';
q('#hs-keysave').onclick = () => { S.set('key', q('#hs-key').value.trim()); q('#hs-keysave').textContent = 'Saved'; setTimeout(() => (q('#hs-keysave').textContent = 'Save'), 1500); if (mkt.active) startMarket(true); };
q('#hs-tab').onclick = () => { sameTab = !sameTab; S.set('sameTab', sameTab); updateBar(); render(tab); };
q('#hs-test').onclick = () => { unlockAudio(); lastBeep = 0; setTimeout(() => { beep(); lastBeep = 0; }, 50); };
q('#hs-clear').onclick = () => { px = {}; S.set('px', px); S.set('last', {}); lastScan = {}; render(tab); setStat('packs', 'Saved prices cleared.'); setStat('museum', 'Saved prices cleared.'); };
const ppIn = q('#hs-pp'), mdIn = q('#hs-md');
ppIn.value = pointPrice ? pointPrice.toLocaleString('en-GB') : ''; mdIn.checked = museumDay;
ppIn.onchange = () => { pointPrice = parseMoney(ppIn.value); ppIn.value = pointPrice ? pointPrice.toLocaleString('en-GB') : ''; S.set('pointPrice', pointPrice); render('museum'); };
mdIn.onchange = () => { museumDay = mdIn.checked; S.set('museumDay', museumDay); render('museum'); };
// Tap a card to see the item prices behind it
const openCards = new Set();
q('#hs-body').addEventListener('click', e => {
  if (e.target.closest('a,button,input,select,label')) return;
  const c = e.target.closest('.card[data-key]');
  if (!c) return;
  openCards.has(c.dataset.key) ? openCards.delete(c.dataset.key) : openCards.add(c.dataset.key);
  c.classList.toggle('open');
});

// Side tab: tap to open/close, drag up and down the left edge (position remembered)
let dragMoved = false, toggleY = S.get('toggleY', 0.45);
function placeToggle(f) { const h = toggle.offsetHeight || 60, top = Math.max(8, Math.min(innerHeight - h - 8, Math.round(f * innerHeight))); toggle.style.top = top + 'px'; return top / innerHeight; }
placeToggle(toggleY);
addEventListener('resize', () => placeToggle(toggleY));
toggle.addEventListener('click', e => { if (dragMoved) { dragMoved = false; e.preventDefault(); return; } isOpen() ? panel.classList.remove('on') : openPanel(); });
toggle.addEventListener('pointerdown', e => {
  if (e.button) return;
  const y0 = e.clientY, top0 = toggle.getBoundingClientRect().top;
  let drag = false; dragMoved = false;
  try { toggle.setPointerCapture(e.pointerId); } catch {}
  const move = ev => { const dy = ev.clientY - y0; if (!drag && Math.abs(dy) < 6) return; drag = true; toggleY = placeToggle((top0 + dy) / innerHeight); ev.preventDefault(); };
  const up = () => {
    toggle.removeEventListener('pointermove', move); toggle.removeEventListener('pointerup', up); toggle.removeEventListener('pointercancel', up);
    if (drag) { dragMoved = true; S.set('toggleY', toggleY); setTimeout(() => (dragMoved = false), 400); }
  };
  toggle.addEventListener('pointermove', move); toggle.addEventListener('pointerup', up); toggle.addEventListener('pointercancel', up);
});
// Donate: copies the name to paste into Send
q('.donate').addEventListener('click', () => {
  try { navigator.clipboard && navigator.clipboard.writeText(DONATE_TO); } catch {}
  const a = q('.donate'), old = a.textContent;
  a.textContent = `Copied "${DONATE_TO}" · choose Xanax → Send → paste`;
  setTimeout(() => (a.textContent = old), 5000);
});

/* =================== RENDERING =================== */
function render(t) {
  if (!isOpen() || t !== tab) return;   // only the tab you're looking at is drawn
  if (t === 'packs' || t === 'museum') renderScan(t);
  else if (t === 'bazaar') renderWatch();
  else renderMarket();
}
const sinceFor = t => scanning === t ? scanSince : Date.now() - RESULTS_MS;
const card = (key, inner) => `<div class="card${openCards.has(key) ? ' open' : ''}" data-key="${key}">${inner}</div>`;
const verdict = (profit, pending) => pending ? '<span class="dim">checking…</span>' : profit == null ? '<span class="dim">—</span>'
  : `<span class="${profit >= 0 ? 'pos' : 'neg'}">${profit >= 0 ? 'BUY ✔' : 'SKIP ✘'}</span>`;
const pct = (profit, base) => profit != null && base ? ` (${(profit / base * 100).toFixed(1)}%)` : '';
function renderScan(t) {
  const out = outOf(t);
  if (!scanning && !lastScan[t]) { out.innerHTML = ''; return; }
  const since = sinceFor(t);
  out.innerHTML = t === 'packs' ? PACKS.map(p => packCard(evalPack(p, since))).join('') : SETS.map(s => setCard(evalSet(s, since))).join('');
}
function packCard(r) {
  const cls = r.profit == null ? '' : r.profit >= 0 ? 'pos' : 'neg';
  return card('p' + r.pack.id, `<div class="r"><b><a href="${w3Link(r.pack.id)}" target="_blank">${esc(r.pack.name)}</a></b>${verdict(r.profit, r.pending)}</div>
    <div class="r"><span>Cheapest pack</span><span>${money(r.pk && r.pk.price)}</span></div>
    <div class="r"><span>Expected contents value</span><span>${money(r.ev)}</span></div>
    <div class="r"><span>Profit per pack</span><span class="${cls}">${money(r.profit)}${pct(r.profit, r.pk && r.pk.price)}</span></div>
    <div class="more">${r.items.map(i => `<div class="r"><span>${r.pack.type === 'oneOf' ? i.qty + '× ' : ''}<a href="${w3Link(i.id)}" target="_blank">${esc(i.name)}</a></span><span>${i.inf ? money(i.inf.price) + (i.inf.fromMarket ? '*' : '') : '…'}</span></div>`).join('')}
      <div>${r.pack.type === 'oneOf' ? `Value = average of the ${r.items.length} equally likely outcomes` : `Value = ${r.pack.qty} × average price of the ${r.items.length} items`}</div>
      ${r.pack.note ? `<div>${esc(r.pack.note)}</div>` : ''}${!r.pending && r.missing ? `<div class="neg">${r.missing} item(s) had no price; the value uses the rest.</div>` : ''}
      ${r.items.some(i => i.inf && i.inf.fromMarket) ? '<div class="dim">* no bazaar listing, market value used</div>' : ''}</div>`);
}
function setCard(r) {
  const cls = r.profit == null ? '' : r.profit >= 0 ? 'pos' : 'neg', single = r.set.items.length === 1;
  const title = single ? `<a href="${w3Link(r.set.items[0][1])}" target="_blank">${esc(r.set.name)}</a>` : esc(r.set.name);
  return card('s' + r.set.name, `<div class="r"><b>${title}</b>${verdict(r.profit, r.pending)}</div>
    <div class="r"><span>Cost to buy · ${r.points.toLocaleString('en-GB', { maximumFractionDigits: 1 })} points</span><span>${money(r.cost)}</span></div>
    <div class="r"><span>Cost per point</span><span>${money(r.perPoint)}</span></div>
    <div class="r"><span>Points value</span><span>${r.value == null ? '<span class="dim">set point price</span>' : money(r.value)}</span></div>
    <div class="r"><span>Profit</span><span class="${cls}">${money(r.profit)}${pct(r.profit, r.cost)}</span></div>
    ${single ? '' : `<div class="more">${r.items.map(i => {
      const multi = i.qty > 1, val = !i.inf ? '…' : multi && i.c ? `${money(i.c.total)} <span class="dim">(${i.c.sellers} seller${i.c.sellers === 1 ? '' : 's'})</span>` : money(i.inf.price);
      return `<div class="r"><span>${multi ? i.qty + '× ' : ''}<a href="${w3Link(i.id)}" target="_blank">${esc(i.name)}</a></span><span>${val}</span></div>` +
        (i.c && i.c.short ? `<div class="neg">Not enough listed for ${i.qty}; can't price a full set.</div>` : '');
    }).join('')}${r.items.some(i => i.qty > 1) ? '<div>Several of one item are filled from the cheapest sellers upwards.</div>' : ''}</div>`}`);
}

/* =================== PACK & MUSEUM SCANS =================== */
let lastScan = S.get('last', {});   // tab -> when its last full scan finished
let scanning = null, scanSince = 0, scanState = null;
const idsFor = t => [...new Set(t === 'packs' ? PACKS.flatMap(p => [p.id, ...p.contents.map(idOf)]) : SETS.flatMap(s => s.items.map(i => i[1])))].filter(Boolean);
const agoText = t => { const m = Math.floor((Date.now() - t) / 60e3); return m < 1 ? 'just now' : `${m} min ago`; };
const doneText = t => (t === 'museum' && !pointPrice ? 'Enter the point price to see profit. ' : '') + `Prices from ${new Date(lastScan[t]).toLocaleTimeString()} (${agoText(lastScan[t])}) · tap a card for details`;
function scanText() {
  const s = scanState, left = s.total - s.done;
  const secs = Math.round(left * 60 / scanBudget());
  return `Checking prices ${s.done}/${s.total}` + (left ? ` · about ${secs < 60 ? secs + 's' : Math.ceil(secs / 60) + ' min'} left` : '') +
    (watch.active ? ' · bazaar alerts go first' : '') + (w3.blockedUntil > Date.now() ? ` · weav3r busy ${Math.ceil((w3.blockedUntil - Date.now()) / 1000)}s` : '');
}
async function scan(t) {
  if (scanning) return;
  scanning = t; scanSince = Date.now() - REUSE_MS;
  const ids = idsFor(t), need = ids.filter(id => !px[id] || px[id].t < scanSince);
  scanState = { total: ids.length, done: ids.length - need.length, failed: 0, err: '' };
  toggle.classList.add('busy'); setStat(t, scanText()); updateBar(); render(t);
  await Promise.all(need.map(id => queueScan(id).then(() => { scanState.done++; render(t); setStat(t, scanText()); setB1(`${scanState.done}/${scanState.total}`); },
    e => { if (!e.stopped) { scanState.failed++; scanState.err = e.message; } })));
  const s = scanState, stopped = s.stopped;
  scanning = null; scanState = null; toggle.classList.remove('busy');
  if (!stopped && !s.failed) { lastScan[t] = Date.now(); S.set('last', lastScan); }
  setB1(isOpen() || stopped ? '' : s.failed ? '✘' : '✔', s.failed ? 'bad' : 'ok');
  setStat(t, stopped ? 'Scan stopped. Prices fetched so far are kept, so the next Scan picks up quickly.'
    : s.failed ? `${s.failed} price(s) failed (${s.err}). Tap Scan to try those again.` : doneText(t));
  updateBar(); render(t);
}
function stopScan() {
  if (!scanning) return;
  scanState.stopped = true;
  while (scanQ.length) scanQ.shift().reject(stopErr());
}
// Results older than 10 minutes are cleared so you don't act on stale prices
function expireOld() {
  for (const t of ['packs', 'museum']) {
    if (!lastScan[t] || scanning === t) continue;
    if (Date.now() - lastScan[t] > RESULTS_MS) { delete lastScan[t]; S.set('last', lastScan); setStat(t, 'The last results were over 10 minutes old and have been cleared. Tap Scan for current prices.'); }
    else setStat(t, doneText(t));
  }
}

/* =================== SOUND =================== */
// iPhones mute Web Audio on silent and block sound until you tap the page, so alerts play a short clip
// (iOS plays it even on silent once unlocked), with Web Audio as a backup. Every tap keeps it unlocked.
function makeBeepWav() {
  const rate = 8000, n = rate / 2, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer);
  const w = (o, t) => [...t].forEach((c, i) => (buf[o + i] = c.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true);
  for (let i = 0; i < n; i++) { const t = i / rate, on = t < 0.18 || (t > 0.3 && t < 0.48); buf[44 + i] = on ? 128 + Math.round(100 * Math.sin(2 * Math.PI * 880 * t)) : 128; }
  let bin = ''; buf.forEach(b => (bin += String.fromCharCode(b)));
  return 'data:audio/wav;base64,' + btoa(bin);
}
let clip = null, clipOk = false, actx = null, lastBeep = 0;
try { clip = new Audio(makeBeepWav()); clip.preload = 'auto'; } catch {}
function unlockAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state !== 'running') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain(); g.gain.value = 0; o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.01);
  } catch {}
  if (clip && !clipOk) {
    try {
      clip.muted = true;
      const p = clip.play(), done = () => { clip.pause(); clip.currentTime = 0; clip.muted = false; };
      if (p && p.then) p.then(() => { done(); clipOk = true; }, () => (clip.muted = false)); else { done(); clipOk = true; }
    } catch { clip.muted = false; }
  }
}
['touchend', 'click'].forEach(ev => document.addEventListener(ev, unlockAudio, { capture: true, passive: true }));
function webBeep() {
  try {
    if (!actx) return; if (actx.state !== 'running') actx.resume();
    [0, 0.3].forEach(t => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; g.gain.value = 0.25; o.connect(g); g.connect(actx.destination); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.18); });
  } catch {}
}
function beep() {
  if (Date.now() - lastBeep < 1500) return;   // several items at once = one beep
  lastBeep = Date.now();
  let played = false;
  try { if (clip) { clip.muted = false; clip.currentTime = 0; const p = clip.play(); played = true; if (p && p.catch) p.catch(webBeep); } } catch {}
  if (!played) webBeep();
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {}
  try { toggle.animate([{ background: '#ed8936' }, { background: '#1f1f1f' }], { duration: 400, iterations: 4 }); } catch {}
}

/* =================== ALERT POP-UP =================== */
// Sits on top of Torn even when the panel is closed. Each item adds its own section until you dismiss.
const alertParts = new Map();
function renderAlert() {
  if (!alertParts.size) { alertBox.style.display = 'none'; return; }
  alertBox.innerHTML = `<div class="ah"><span>🔔 HUSTLE price alert</span><button type="button" id="hs-ax">Dismiss</button></div>${[...alertParts.values()].join('')}`;
  alertBox.style.display = 'block';
  alertBox.querySelector('#hs-ax').onclick = () => { alertParts.clear(); alertBox.style.display = 'none'; };
}
function badge() {
  const n = o => Object.values(o).reduce((s, m) => s + m.length, 0);
  const on = watch.active || mkt.active, found = (watch.active ? n(watch.matches) : 0) + (mkt.active ? n(mkt.matches) : 0);
  toggle.classList.toggle('watching', on);
  b2.textContent = !on ? '' : found ? `🔔${found}` : '👁';
}

/* =================== BAZAAR ALERTS (weav3r) =================== */
const watch = Object.assign({ active: false, slots: [], seen: {}, matches: {}, log: [] }, S.get('watch', {}));
while (watch.slots.length < W_SLOTS) watch.slots.push({ itemId: 0, max: 0 });
const saveWatch = () => S.set('watch', watch);
const activeW = () => watch.slots.filter(s => s.itemId && s.max);
const wSel = i => q(`select[data-w="${i}"]`), wMax = i => q(`input[data-wmax="${i}"]`);
watch.slots.forEach((s, i) => { wSel(i).value = String(s.itemId || 0); wMax(i).value = s.max ? s.max.toLocaleString('en-GB') : ''; });

// When an item should next be checked (phone time)
function dueAt(id) {
  const t = tm[id];
  if (!t || !t.last) return 0;
  if (!t.gen) return t.last + W_NO_STAMP_MS * activeW().length;
  const expected = t.gen + t.off + (t.period || W_GUESS_MS) + W_AFTER_MS;
  if (t.last < expected - W_AFTER_MS) return expected;   // waiting for the next rebuild
  return t.last + W_RETRY_MS * Math.min(1 + Math.floor(t.stale / 3), 4);   // got the old copy: retry soon
}
function watchNext() {
  let best = null;
  for (const sl of activeW()) { const due = dueAt(sl.itemId); if (!best || due < best.due) best = { sl, due }; }
  return best;
}
async function watchCheck(sl) {
  const id = sl.itemId;
  let d;
  try { d = await w3Get(id); } catch (e) { if (e.status !== 429) { const t = tmOf(id); t.last = Date.now(); t.err = e.message; } return; }
  if (!watch.active) return;
  const recv = Date.now(), off = tmOf(id).off || 0, byKey = new Map();
  const floor = +d.market_price ? +d.market_price * BAIT_RATIO : 1;   // skip $1 bait listings
  for (const l of d.listings || []) {
    const price = +l.price, pid = l.player_id;
    if (l.sponsored || !pid || price < floor || price > sl.max) continue;
    const key = `${pid}:${price}`;
    // When weav3r first saw the listing, converted to phone time
    const listed = parseTime(l.content_updated) || parseTime(l.last_checked);
    if (!byKey.has(key)) byKey.set(key, { key, pid, name: l.player_name, qty: +l.quantity || 1, price, listedLocal: listed ? listed + off : 0 });
  }
  const matches = [...byKey.values()].sort((a, b) => a.price - b.price);
  const seen = watch.seen[id] || [], prev = new Map((watch.matches[id] || []).map(l => [l.key, l]));
  const fresh = matches.filter(l => !seen.includes(l.key));
  for (const l of matches) l.age = prev.has(l.key) ? prev.get(l.key).age : l.listedLocal ? Math.max(0, (recv - l.listedLocal) / 1000) : null;
  for (const l of fresh) watch.log.unshift({ t: recv, id, price: l.price, age: l.age });
  watch.log = watch.log.slice(0, 10);
  watch.matches[id] = matches;
  watch.seen[id] = matches.map(l => l.key);   // a listing that sells and comes back alerts again
  saveWatch();
  if (fresh.length) {
    const fk = new Set(fresh.map(l => l.key));
    alertParts.set('b' + id, `<div class="sec">🔎 ${esc(itemName(id))} bazaars · ${matches.length} at or below ${money(sl.max)}</div>` +
      matches.map(l => listingLine(l, id, fk.has(l.key), true)).join(''));
    renderAlert(); beep();
  }
  badge(); render('bazaar');
}
function listingLine(l, id, isNew, forAlert) {
  const age = forAlert ? (l.age != null ? `already ${fmtAge(l.age)} old` : '') : (l.listedLocal ? `listed ${fmtAge((Date.now() - l.listedLocal) / 1000)} ago` : '');
  return `<div class="li"><span><b>${money(l.price)}</b> × ${l.qty.toLocaleString('en-GB')}${isNew ? '<span class="hs-new">NEW</span>' : ''}<br>
    <span class="dim">${esc(l.name || 'Seller')} [${l.pid}]${age ? ' · ' + age : ''}</span></span>
    <a class="hs-buy" href="${bazaarLink(l.pid, id, l.price)}" target="${target()}">Open bazaar ↗</a></div>`;
}
function timingText(id) {
  const t = tm[id];
  if (!t || !t.last) return 'first check…';
  const now = Date.now(), parts = [];
  if (t.gen) { parts.push(t.gaps.length ? `weav3r refreshes ~every ${Math.round(t.period / 1000)}s` : 'learning weav3r refresh…'); parts.push(`data ${Math.max(0, Math.round((now - t.gen - t.off) / 1000))}s old`); }
  const w = Math.ceil((Math.max(dueAt(id), w3.blockedUntil) - now) / 1000);
  parts.push(w > 0 ? `next check in ${w}s` : 'checking…');
  if (t.err) parts.push(`last check failed: ${t.err}`);
  return parts.join(' · ');
}
function renderWatch() {
  const out = outOf('bazaar');
  const cards = watch.active ? activeW().map(sl => {
    const m = watch.matches[sl.itemId] || [];
    return `<div class="card"><div class="r"><b>${esc(itemName(sl.itemId))} ≤ ${money(sl.max)}</b><span class="dim">${m.length ? m.length + ' found' : ''}</span></div>
      <div class="dim" data-wt="${sl.itemId}">${timingText(sl.itemId)}</div>
      ${m.length ? m.map(l => listingLine(l, sl.itemId, false, false)).join('') : '<div class="dim">None at or below your price right now.</div>'}</div>`;
  }).join('') : '';
  // How old listings already were when they reached you: shows whether weav3r is the slow part
  let log = '';
  if (watch.log.length) {
    const ages = watch.log.map(a => a.age).filter(a => a != null).sort((a, b) => a - b);
    log = `<div class="card"><div class="r"><b>📋 Recent alerts</b><span class="dim">${ages.length ? 'typical listing age ' + fmtAge(ages[Math.floor((ages.length - 1) / 2)]) : ''}</span></div>` +
      watch.log.map(a => `<div class="r"><span>${new Date(a.t).toLocaleTimeString()} · ${esc(itemName(a.id))} ${money(a.price)}</span><span class="dim">${a.age == null ? 'age unknown' : fmtAge(a.age) + ' old'}</span></div>`).join('') + '</div>';
  }
  out.innerHTML = cards + log;
}
function readSlots(st, sel, max, n) {
  st.slots = st.slots.slice(0, n).map((old, i) => {
    const itemId = +sel(i).value || 0, m = parseMoney(max(i).value);
    max(i).value = m ? m.toLocaleString('en-GB') : '';
    if (old.itemId !== itemId || old.max !== m) { delete st.seen[old.itemId]; delete st.matches[old.itemId]; }
    return { itemId, max: m };
  });
}
const slotProblem = list => !list.length ? 'Pick at least one item and give it a maximum price.'
  : new Set(list.map(s => s.itemId)).size !== list.length ? 'Each item can only be in one row.' : '';
function startWatch(resume) {
  if (!resume) { readSlots(watch, wSel, wMax, W_SLOTS); watch.seen = {}; watch.matches = {}; }   // a fresh start alerts on what's already listed
  const bad = slotProblem(activeW());
  if (bad) return stopWatch(bad);
  watch.active = true; saveWatch();
  setStat('bazaar', `Watching ${activeW().length} item(s) on weav3r…`);
  badge(); updateBar(); render('bazaar'); kick();
}
function stopWatch(msg) {
  watch.active = false; saveWatch();
  badge(); updateBar(); render('bazaar');
  setStat('bazaar', msg || 'Stopped. Tap Scan to start again.');
}
for (let i = 0; i < W_SLOTS; i++) {
  const apply = () => { const v = parseMoney(wMax(i).value); wMax(i).value = v ? v.toLocaleString('en-GB') : ''; if (watch.active) { readSlots(watch, wSel, wMax, W_SLOTS); saveWatch(); startWatch(true); } };
  wSel(i).onchange = apply; wMax(i).onchange = apply;
}

/* =================== ITEM MARKET ALERTS (Torn API) =================== */
const mkt = Object.assign({ active: false, slots: [], seen: {}, matches: {}, checked: {}, age: {} }, S.get('market', {}));
while (mkt.slots.length < M_SLOTS) mkt.slots.push({ itemId: 0, max: 0 });
const saveMkt = () => S.set('market', mkt);
const activeM = () => mkt.slots.filter(s => s.itemId && s.max);
const mSel = i => q(`select[data-m="${i}"]`), mMax = i => q(`input[data-mmax="${i}"]`);
mkt.slots.forEach((s, i) => { mSel(i).value = String(s.itemId || 0); mMax(i).value = s.max ? s.max.toLocaleString('en-GB') : ''; });
let mTimer = null, mIdx = 0, mPause = 0, mErr = '';
const mLines = (id, fk) => (mkt.matches[id] || []).map(l => `<div class="li"><span><b>${money(l.price)}</b> × ${l.amount.toLocaleString('en-GB')}${fk && fk.has(l.key) ? '<span class="hs-new">NEW</span>' : ''}</span></div>`).join('');
async function marketTick() {
  if (!mkt.active) return;
  const slots = activeM();
  if (!slots.length) return stopMarket('No items to watch.');
  const gap = Math.max(1000, Math.round(M_INTERVAL_MS / slots.length));   // spread the checks evenly
  if (mPause > Date.now()) { setStat('market', `Torn API limit reached, continuing in ${Math.ceil((mPause - Date.now()) / 1000)}s`); mTimer = setTimeout(marketTick, 1000); return; }
  const sl = slots[mIdx++ % slots.length];
  try {
    const d = await getJSON(`https://api.torn.com/v2/market/${sl.itemId}?selections=itemmarket&key=${encodeURIComponent(tornKey())}&comment=JSimHustle`);
    if (!mkt.active) return;
    if (d.error) {
      if (d.error.code === 5) { mPause = Date.now() + 15000; mTimer = setTimeout(marketTick, 1000); return; }   // too many requests
      if ([1, 2, 10, 13, 16, 18].includes(d.error.code)) return stopMarket(`Torn API: ${d.error.error}. Check your key in ⚙ Settings, then tap Scan.`);
      throw new Error(d.error.error);
    }
    const im = d.itemmarket || {}, counts = {};
    const matches = (im.listings || []).map(l => ({ price: +l.price, amount: +l.amount || 1 })).filter(l => l.price > 0 && l.price <= sl.max)
      .sort((a, b) => a.price - b.price).map(l => { const k = `${l.price}:${l.amount}`; counts[k] = (counts[k] || 0) + 1; return { ...l, key: `${k}:${counts[k]}` }; });
    const seen = mkt.seen[sl.itemId] || [], fresh = matches.filter(l => !seen.includes(l.key));
    mkt.matches[sl.itemId] = matches; mkt.seen[sl.itemId] = matches.map(l => l.key);
    mkt.checked[sl.itemId] = Date.now();
    mkt.age[sl.itemId] = im.cache_timestamp ? Math.max(0, Math.round(Date.now() / 1000 - im.cache_timestamp)) : null;
    saveMkt(); mErr = '';
    if (fresh.length) {
      alertParts.set('m' + sl.itemId, `<div class="sec">🏪 ${esc(itemName(sl.itemId))} item market · ${matches.length} at or below ${money(sl.max)}
        <a class="hs-buy" href="${marketLink(sl.itemId)}" target="${target()}">Item market ↗</a></div>${mLines(sl.itemId, new Set(fresh.map(l => l.key)))}`);
      renderAlert(); beep();
    }
  } catch (e) { if (!mkt.active) return; mErr = `last check failed (${e.message}), retrying`; }
  setStat('market', `Watching ${slots.length} item(s) on the item market · each every ${M_INTERVAL_MS / 1000}s` + (mErr ? ' · ' + mErr : ''));
  badge(); render('market');
  mTimer = setTimeout(marketTick, gap);
}
function renderMarket() {
  outOf('market').innerHTML = !mkt.active ? '' : activeM().map(sl => {
    const m = mkt.matches[sl.itemId] || [], ck = mkt.checked[sl.itemId], age = mkt.age[sl.itemId];
    return `<div class="card"><div class="r"><b>${esc(itemName(sl.itemId))} ≤ ${money(sl.max)}</b><a class="hs-buy" href="${marketLink(sl.itemId)}" target="${target()}">Item market ↗</a></div>
      <div class="dim">${ck ? 'checked ' + new Date(ck).toLocaleTimeString() : 'first check…'}${age != null ? ` · Torn data ${age}s old` : ''}</div>
      ${m.length ? mLines(sl.itemId) : '<div class="dim">None at or below your price right now.</div>'}</div>`;
  }).join('');
}
function startMarket(resume) {
  if (!resume) { readSlots(mkt, mSel, mMax, M_SLOTS); mkt.seen = {}; mkt.matches = {}; mkt.checked = {}; mkt.age = {}; }
  if (!tornKey()) { q('#hs-set').classList.add('on'); q('#hs-gear').classList.add('on'); return stopMarket('Add your Torn API key in ⚙ Settings first.'); }
  const bad = slotProblem(activeM());
  if (bad) return stopMarket(bad);
  clearTimeout(mTimer);
  mkt.active = true; saveMkt(); mIdx = 0; mErr = '';
  setStat('market', `Watching ${activeM().length} item(s) on the item market…`);
  badge(); updateBar(); render('market'); marketTick();
}
function stopMarket(msg) {
  mkt.active = false; clearTimeout(mTimer); saveMkt();
  badge(); updateBar(); render('market');
  setStat('market', msg || 'Stopped. Tap Scan to start again.');
}
for (let i = 0; i < M_SLOTS; i++) {
  const apply = () => { const v = parseMoney(mMax(i).value); mMax(i).value = v ? v.toLocaleString('en-GB') : ''; if (mkt.active) { readSlots(mkt, mSel, mMax, M_SLOTS); saveMkt(); startMarket(true); } };
  mSel(i).onchange = apply; mMax(i).onchange = apply;
}

/* =================== EVERY SECOND: countdowns and status (text only, so links stay tappable) =================== */
setInterval(() => {
  try {
    if (scanning) setStat(scanning, scanText());
    if (watch.active) {
      setStat('bazaar', `Watching ${activeW().length} item(s) on weav3r · ${w3Recent()} of ${w3.cap} weav3r requests this minute` +
        (w3.blockedUntil > Date.now() ? ` · weav3r limit, waiting ${Math.ceil((w3.blockedUntil - Date.now()) / 1000)}s` : ''));
      if (isOpen() && tab === 'bazaar') outOf('bazaar').querySelectorAll('[data-wt]').forEach(el => (el.textContent = timingText(+el.dataset.wt)));
    }
  } catch {}
}, 1000);

/* =================== START =================== */
// Short note after an update
try { const lv = S.get('ver', ''); if (lv && lv !== VERSION) { const n = document.createElement('div'); n.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:70px;z-index:2147483647;padding:6px 14px;border-radius:14px;background:#0a3d2c;color:#e6f2ec;font:700 12px Arial;box-shadow:0 2px 8px #0008;pointer-events:none'; n.textContent = 'J_Sim Hustle updated to v' + VERSION; document.body.appendChild(n); setTimeout(() => n.remove(), 4000); } S.set('ver', VERSION); } catch {}
expireOld();
showTab(tab);
badge();
if (watch.active) startWatch(true);
if (mkt.active) startMarket(true);
}

if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
