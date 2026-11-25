// ==UserScript==
// @name         J_Sim Cutpurse
// @namespace    jsim-cutpurse
// @version      1.8.6
// @description  Catch the cash before it's banked. Abroad: every page in one list, new arrivals flagged, FF Scouter stats, rehab counts in Switzerland. Hospital: self-hosp players (Ipecac / blood bag) with countdowns, activity, faction war status and the bazaars you have checked.
// @license      MIT
// @match        https://www.torn.com/index.php*
// @match        https://www.torn.com/hospitalview.php*
// @match        https://www.torn.com/bazaar.php*
// @match        https://www.torn.com/loader.php*
// @match        https://www.torn.com/page.php*
// @match        https://www.torn.com/casino.php*
// @match        https://www.torn.com/profiles.php*
// @grant        GM_xmlhttpRequest
// @connect      ffscouter.com
// @connect      yata.yt
// @run-at       document-idle
// ==/UserScript==
(function () {
'use strict';
const SCRIPT_VERSION = '1.8.6';   // keep in step with @version above
// Run once the page body exists (some apps inject scripts very early)
// Torn PDA swaps the placeholder below for your key, but only inside the installed script.
// When Cutpurse is started by the auto-updating loader, the loader hands the key over as __cpPdaKey.
/* global __cpPdaKey */
const PDA_KEY_IN = (typeof __cpPdaKey === 'string' && __cpPdaKey && __cpPdaKey.indexOf('###') !== 0) ? __cpPdaKey : '###PDA-APIKEY###';
function start() {
  // Only one copy per page (e.g. the loader and an old installed copy both running)
  try { if (document.documentElement.dataset.cutpurse) return; } catch {}
  try { document.documentElement.dataset.cutpurse = SCRIPT_VERSION; window.JSimCutpurse = { version: SCRIPT_VERSION }; } catch {}
  // Short note after an automatic update
  try {
    const last = lsGet('cp_lastver');
    if (last && last !== SCRIPT_VERSION) {
      const n = document.createElement('div');
      n.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:70px;z-index:2147483647;padding:6px 14px;border-radius:14px;background:#0a3d2c;color:#e6f2ec;font:700 12px Arial;box-shadow:0 2px 8px #0008;pointer-events:none';
      n.textContent = 'J_Sim Cutpurse updated to v' + SCRIPT_VERSION;
      document.body.appendChild(n); setTimeout(() => n.remove(), 4000);
    }
    localStorage.setItem('cp_lastver', SCRIPT_VERSION);
  } catch {}

  // Show a small red message instead of failing silently, so problems can be reported
  function guard(name, fn) {
    try { fn(); } catch (e) {
      try {
        console.error('[Cutpurse] ' + name + ' failed:', e);
        const t = document.createElement('div');
        t.style.cssText = 'position:fixed;left:8px;right:8px;top:70px;z-index:2147483647;padding:8px 10px;border-radius:8px;background:#9b2c2c;color:#fff;font:600 12px Arial;box-shadow:0 2px 8px #0008';
        t.textContent = 'Cutpurse (' + name + ') error: ' + (e && e.message || e) + ' · v' + SCRIPT_VERSION;
        t.onclick = () => t.remove();
        document.body.appendChild(t);
      } catch {}
    }
  }

/* =================== SHARED STORAGE (clears old data when the browser's storage is full) =================== */
// When torn.com's storage is full (other scripts share it), saves fall back to this tab's own storage,
// so the list still survives page changes in this tab.
const FB = 'cpfb_';
function lsGet(k) {
  try { const v = sessionStorage.getItem(FB + k); if (v !== null) return v; } catch {}
  try { return localStorage.getItem(k); } catch { return null; }
}
function lsDel(k) { try { localStorage.removeItem(k); } catch {} try { sessionStorage.removeItem(FB + k); } catch {} }
// Settings > Storage: what is filling torn.com's storage
const CP_KEYS = /^(tal_|ths_|cp_|cpfb_)/;
const CACHE_KEYS = ['tal_ff', 'tal_drugs', 'cp_abhosp', 'ths_baz', 'ths_wars'];
function storageHTML() {
  const rows = [];
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i), n = (k.length + (localStorage.getItem(k) || '').length) * 2;
      total += n; rows.push([k, n]);
    }
  } catch {}
  rows.sort((a, b) => b[1] - a[1]);
  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const esc2 = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ours = rows.filter(r => CP_KEYS.test(r[0])).reduce((a, r) => a + r[1], 0);
  let tab = 0; try { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k.indexOf(FB) === 0) tab++; } } catch {}
  return `<div class="cp-mug-sum">torn.com storage used: <b>${kb(total)}</b> &middot; Cutpurse: <b>${kb(ours)}</b></div>` +
    (tab ? `<div class="cp-hint" style="color:#fbd38d">Storage is full, so Cutpurse is saving in this tab only.</div>` : '') +
    `<div class="cp-hint">Biggest items (other scripts share this space):</div>` +
    `<div class="cp-hint">Tap a name to peek inside (helps tell which script it belongs to).</div>` +
    rows.slice(0, 8).map(([k, n]) => {
      const mine = CP_KEYS.test(k);
      const open = STORE_PEEK === k;
      let peek = '';
      if (open) { try { peek = (localStorage.getItem(k) || '').slice(0, 220).replace(/[A-Za-z0-9]{16}/g, '****'); } catch {} }
      return `<div class="cp-mug-row"><a class="cp-peek" data-k="${esc2(k)}">${esc2(k.length > 30 ? k.slice(0, 30) + '\u2026' : k)}</a><span>${kb(n)}</span>` +
        (mine ? `<span class="cp-mug-ago">Cutpurse</span>` : `<button class="cp-del" type="button" data-k="${esc2(k)}" style="${STORE_ARM === k ? 'background:#9b2c2c;color:#fff' : ''}">${STORE_ARM === k ? 'Sure?' : 'Clear'}</button>`) + `</div>` +
        (open ? `<div class="cp-hint" style="word-break:break-all;font-family:monospace;background:#1a1a1a;padding:4px 6px;border-radius:4px">${esc2(peek)}${peek.length >= 220 ? '\u2026' : ''}</div>` : '');
    }).join('') +
    `<button class="cp-store-free" type="button">Clear Cutpurse caches</button><span class="cp-hint"> FF scores, rehabs and faction checks reload by themselves. Your list and mug log are kept.</span>`;
}
let STORE_PEEK = '', STORE_ARM = '', STORE_ARM_T;
function wireStorage(container, after) {
  container.addEventListener('click', e => {
    const pk = e.target.closest('.cp-peek');
    if (pk) { STORE_PEEK = STORE_PEEK === pk.dataset.k ? '' : pk.dataset.k; container.innerHTML = storageHTML(); return; }
    const del = e.target.closest('.cp-del');
    if (del) {
      // Two taps: the first arms it ("Sure?"), the second clears. Only ever what you tap.
      const k = del.dataset.k;
      clearTimeout(STORE_ARM_T);
      if (STORE_ARM === k) { try { localStorage.removeItem(k); } catch {} STORE_ARM = ''; if (STORE_PEEK === k) STORE_PEEK = ''; }
      else { STORE_ARM = k; STORE_ARM_T = setTimeout(() => { STORE_ARM = ''; try { container.innerHTML = storageHTML(); } catch {} }, 4000); }
      container.innerHTML = storageHTML();
      return;
    }
    if (!e.target.closest('.cp-store-free')) return;
    CACHE_KEYS.forEach(lsDel);
    after();
  });
}

const TS = (() => {
  const J = k => { try { return JSON.parse(lsGet(k)); } catch { return null; } };
  const H = 3600e3;
  function trimMap(k, maxAge, cap) {
    const o = J(k); if (!o || typeof o !== 'object') return;
    const now = Date.now();
    let ents = Object.entries(o).filter(([, v]) => v && v.t && now - v.t < maxAge).sort((a, b) => b[1].t - a[1].t);
    if (cap) ents = ents.slice(0, cap);
    try { localStorage.setItem(k, JSON.stringify(Object.fromEntries(ents))); } catch { try { localStorage.removeItem(k); } catch {} }
  }
  function prune(hard) {
    trimMap('tal_ff', hard ? 2 * H : 12 * H, hard ? 1500 : 5000);
    trimMap('ths_baz', hard ? H / 2 : 2 * H, 1000);
    trimMap('ths_bazseen', hard ? H / 2 : 2 * H, 1000);
    trimMap('ths_wars', hard ? H / 2 : 2 * H, 500);
    trimMap('cp_muglog', hard ? 30 * 24 * H : 90 * 24 * H, hard ? 500 : 2000);
    trimMap('cp_abhosp', hard ? H / 2 : 6 * H, 500);
    trimMap('cp_pokerleft', hard ? H / 2 : 6 * H, 200);
    trimMap('cp_names', hard ? 7 * 24 * H : 60 * 24 * H, hard ? 1000 : 5000);
    trimMap('tal_drugs', hard ? 6 * H : 24 * H, hard ? 1000 : 3000);
    // The hospital list only ever needs self-hosp players
    for (const hk of ['ths_state', 'ths_state_ab']) {
      const hs = J(hk);
      if (hs && hs.players) {
        for (const id in hs.players) if (!hs.players[id].self) delete hs.players[id];
        try { localStorage.setItem(hk, JSON.stringify(hs)); } catch { try { localStorage.removeItem(hk); } catch {} }
      }
    }
    if (hard) { const ab = J('tal_state'); if (ab && ab.snap) { delete ab.snap; try { localStorage.setItem('tal_state', JSON.stringify(ab)); } catch {} } }
  }
  let err = '';
  // raw = store the string exactly as given; otherwise JSON-encode
  function set(k, v, raw) {
    const str = raw ? String(v) : JSON.stringify(v);
    const ok = () => { err = ''; try { sessionStorage.removeItem(FB + k); } catch {} return true; };
    try { localStorage.setItem(k, str); return ok(); } catch {}
    try { prune(false); localStorage.setItem(k, str); return ok(); } catch {}
    try { prune(true); localStorage.setItem(k, str); return ok(); } catch {}
    // Still full (other scripts' data): keep it in this tab instead
    try { localStorage.removeItem(k); } catch {}
    try { sessionStorage.setItem(FB + k, str); err = 'torn.com storage is full: saving in this tab only (see Settings > Storage)'; return true; }
    catch (e) { err = 'Can\'t save: browser storage for torn.com is full (' + (e && e.name || e) + ')'; return false; }
  }
  return { set, prune, get err() { return err; } };
})();
try { TS.prune(false); } catch {}

/* =================== DONATE BUTTON (shared by both panels) =================== */
// Opens your items (drugs) in a new tab and copies the name to paste into "Send". Nothing is sent automatically.
const DONATE_TO = 'J_Sim [3659615]';
const DONATE_CSS = `.cpb-donate{display:block;margin:0;padding:8px 9px;border-top:1px solid #333;background:#0a3d2c;color:#e6f2ec!important;text-align:center;font:600 12px Arial;text-decoration:none;border-radius:0 0 8px 8px}
.cpb-donate:active{background:#006a4e}`;

/* =================== J_SIM BRAND (logo strip at the top of every panel) =================== */
const BRAND_GREEN = '#006a4e';
(function loadBrandFonts() {
  // The logo's two fonts; if they can't load, it falls back to normal fonts and still works
  try {
    if (document.getElementById('jsim-fonts')) return;
    const l = document.createElement('link');
    l.id = 'jsim-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Black+Ops+One&family=Permanent+Marker&display=swap';
    (document.head || document.documentElement).appendChild(l);
  } catch {}
})();
const BRAND_CSS = `.cpb-brand{display:flex;align-items:center;gap:8px;padding:5px 9px 5px 8px;background:#dcd8ce;border-radius:8px 8px 0 0;border-bottom:2px solid ${BRAND_GREEN}}
.cpb-brand svg{flex:none;display:block}
.cpb-brand .cpb-title{display:flex;flex-direction:column;line-height:1;min-width:0}
.cpb-brand .cpb-cut{font-family:'Bebas Neue',Impact,'Arial Narrow',sans-serif;font-size:27px;letter-spacing:2px;color:#10251c}
.cpb-brand .cpb-tool{font:italic 700 10px Arial;letter-spacing:.2px;color:${BRAND_GREEN};margin-top:1px;white-space:nowrap}
.cpb-brand .cpb-by{margin-left:auto;display:flex;align-items:center;gap:4px;padding-left:8px;border-left:1px solid #c2bdb1}
.cpb-brand .cpb-words{display:flex;flex-direction:column;line-height:1}
.cpb-brand .cpb-name{font-family:'Permanent Marker','Comic Sans MS',cursive;font-size:14px;color:#10251c;transform:rotate(-4deg);transform-origin:left center}
.cpb-brand .cpb-sub{font-family:'Black Ops One',Impact,sans-serif;font-size:7px;letter-spacing:1.5px;color:${BRAND_GREEN};margin:1px 0 0 2px}`;
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
/* =================== KA-CHING ALERT SOUND (shared) =================== */
// "Double ka-ching": drawer clunk + two-note bell, twice. Made on the spot, no sound files.
// Phones only allow sound after you tap the page once, so the first tap anywhere switches audio on.
let KC_AUDIO = null;
function kcPrime() { try { KC_AUDIO = KC_AUDIO || new (window.AudioContext || window.webkitAudioContext)(); if (KC_AUDIO.state === 'suspended') KC_AUDIO.resume(); } catch {} }
try { document.addEventListener('pointerdown', kcPrime, true); document.addEventListener('click', kcPrime, true); } catch {}
function kaching() {
  const a = KC_AUDIO; if (!a) return;
  try {
    const bell = (t, f, vol, len) => [[1, 1], [2.76, 0.35], [5.4, 0.15]].forEach(([m, g]) => {
      const o = a.createOscillator(), e = a.createGain();
      o.type = 'sine'; o.frequency.value = f * m;
      e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol * g, t + 0.005); e.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(e); e.connect(a.destination); o.start(t); o.stop(t + len + 0.05);
    });
    const noise = (t, len, freq, vol, q) => {
      const n = Math.floor(a.sampleRate * len), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(a.destination); src.start(t);
    };
    const ring = t => { noise(t, 0.06, 900, 0.5, 0.8); noise(t + 0.05, 0.04, 2500, 0.25, 2); bell(t + 0.09, 2093, 0.18, 0.5); bell(t + 0.2, 2637, 0.16, 0.9); };
    const t0 = a.currentTime + 0.02;
    ring(t0); ring(t0 + 0.38);
  } catch {}
}

/* =================== RANKED WAR CHECK FOR SELF-HOSP ABROAD (shared setting) =================== */
// On by default; turning it off saves API calls
const warCheckOn = () => { try { return lsGet('cp_abwar') !== '0'; } catch { return true; } };

/* =================== XANAX RESTOCK PREDICTION (shared) =================== */
// Stock levels abroad come from YATA's free public export (players' scripts report what they see in the shops).
// Torn doesn't publish restock times, so Cutpurse learns them: it notes when Xanax sells out and when it comes back,
// and predicts the next restock as roughly half the sell-out time after it empties (learned from what it sees),
// on Torn's quarter-hour restock tick. Checks at most every 2 minutes, shared across tabs.
const XAN_KEY = 'cp_xan', XAN_ID = 206, XAN_POLL_MS = 120000;
const XAN_SRC = 'https://raw.githubusercontent.com/JonSim28/jsim-cutpurse/data/xanax.json';   // kept up to date by the GitHub watcher
const COUNTRY_NAMES = { mex: 'Mexico', cay: 'Cayman', can: 'Canada', haw: 'Hawaii', uni: 'UK', arg: 'Argentina', swi: 'Switzerland', jap: 'Japan', chi: 'China', uae: 'UAE', sou: 'South Africa' };
const getXan = () => { try { return JSON.parse(lsGet(XAN_KEY)) || { c: {} }; } catch { return { c: {} }; } };
const snapQ = t => Math.ceil(t / 900) * 900;   // next quarter hour (seconds)
const nearQ = t => Math.round(t / 900) * 900;  // nearest quarter hour, for predictions
const median = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
function xanRatio(c) { const r = (c.ratios || []).slice(-5); return r.length ? median(r) : 0.5; }
// One new reading for a country: spot sell-outs and restocks
function xanObserve(c, t, q, cost) {
  const prev = c.hist && c.hist.length ? c.hist[c.hist.length - 1] : null;
  if (prev && prev[0] >= t) return;                       // already have this reading
  c.hist = (c.hist || []).concat([[t, q]]).filter(h => t - h[0] < 48 * 3600).slice(-400);
  c.cost = cost;
  if (!prev) return;
  if (prev[1] > 0 && q === 0) c.emptyAt = Math.round((prev[0] + t) / 2);                       // sold out between the two readings
  if (prev[1] === 0 && q > 0) {                                                               // came back: restocks land on a quarter hour
    const back = Math.min(snapQ(prev[0] + 1), t);
    if (c.emptyAt && c.fullAt && c.emptyAt > c.fullAt && back > c.emptyAt) {
      const r = (back - c.emptyAt) / (c.emptyAt - c.fullAt);
      if (r > 0.05 && r < 3) c.ratios = (c.ratios || []).concat([+r.toFixed(3)]).slice(-10);
    }
    c.fullAt = back; c.emptyAt = 0;
  }
  if (q > prev[1] + 50 && prev[1] > 0) c.fullAt = snapQ(prev[0] + 1);                        // topped up while not empty
}
function xanPredict(c, nowS) {
  const last = c.hist && c.hist[c.hist.length - 1];
  if (!last) return null;
  const q = last[1], ratio = xanRatio(c);
  if (q === 0) {
    if (!c.emptyAt) return { q, note: 'out of stock' };
    if (!c.fullAt || c.fullAt >= c.emptyAt) return { q, emptyAt: c.emptyAt, note: 'learning: needs to see one restock first' };
    let at = nearQ(c.emptyAt + ratio * (c.emptyAt - c.fullAt));
    while (at < nowS) at += 900;                          // overdue: it can come back at any quarter hour now
    return { q, emptyAt: c.emptyAt, restock: at, overdue: nearQ(c.emptyAt + ratio * (c.emptyAt - c.fullAt)) < nowS };
  }
  // In stock: estimate the sell-out from the recent sell rate, then the restock after that
  const since = (c.hist || []).filter(h => h[0] >= (c.fullAt || 0) && h[0] > nowS - 3 * 3600 && h[1] > 0);
  if (since.length < 3 || !c.fullAt) return { q, note: since.length < 3 ? 'learning the sell rate' : 'learning' };
  const a = since[0], b = since[since.length - 1];
  const rate = (a[1] - b[1]) / Math.max(1, b[0] - a[0]);   // items per second
  if (rate <= 0) return { q, note: 'not selling right now' };
  const empty = b[0] + b[1] / rate;
  return { q, emptySoon: empty, restock: nearQ(empty + ratio * (empty - c.fullAt)) };
}
function httpGetX(url) {
  if (typeof PDA_httpGet === 'function') return PDA_httpGet(url, {});
  if (typeof GM_xmlhttpRequest === 'function') return new Promise((res, rej) => GM_xmlhttpRequest({ method: 'GET', url, timeout: 20000, onload: res, onerror: rej, ontimeout: () => rej(new Error('timeout')) }));
  return fetch(url).then(async r => ({ status: r.status, responseText: await r.text() }));
}
let xanBusy = false, xanErr = '';
async function xanPoll(force) {
  if (xanBusy) return;
  let last = 0; try { last = +lsGet('cp_xan_chk') || 0; } catch {}
  if (!force && Date.now() - last < XAN_POLL_MS) return;
  xanBusy = true; TS.set('cp_xan_chk', String(Date.now()), true);
  // 1) The round-the-clock record kept by the GitHub watcher (learns even while nobody has Torn open)
  try {
    let lastS = 0; try { lastS = +lsGet('cp_xan_srv') || 0; } catch {}
    if (force || Date.now() - lastS > 5 * 60000) {
      TS.set('cp_xan_srv', String(Date.now()), true);
      const r = await Promise.race([httpGetX(XAN_SRC + '?t=' + Math.floor(Date.now() / 300000)), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
      const sj = JSON.parse(r && typeof r === 'object' ? (r.responseText || r.body || r.data || '') : r);
      if (sj && sj.c) {
        const x = getXan();
        for (const code in sj.c) {
          const sc = sj.c[code], mine = x.c[code];
          if (!sc || !sc.hist || !sc.hist.length) continue;
          const sLast = sc.hist[sc.hist.length - 1][0];
          const extra = mine && mine.hist ? mine.hist.filter(h => h[0] > sLast) : [];
          const merged = JSON.parse(JSON.stringify(sc));
          for (const h of extra) xanObserve(merged, h[0], h[1], mine.cost);   // add my newer readings on top
          merged.seen = Math.max(sc.seen || 0, (mine && mine.seen) || 0);
          x.c[code] = merged;
        }
        x.srv = sj.t || 0;
        TS.set(XAN_KEY, x);
      }
    }
  } catch {}
  // 2) Live stock from YATA right now
  try {
    const r = await httpGetX('https://yata.yt/api/v1/travel/export/');
    const j = JSON.parse(r && typeof r === 'object' ? (r.responseText || r.body || r.data || '') : r);
    const countries = (j && j.stocks) || j || {};
    const x = getXan(), nowS = Math.floor(Date.now() / 1000);
    let seen = 0;
    for (const code in countries) {
      const ct = countries[code] || {}, list = Array.isArray(ct.stocks) ? ct.stocks : [];
      const it = list.find(s => +s.id === XAN_ID || /^xanax$/i.test(s.name || ''));
      if (!it) continue;
      seen++;
      const c = x.c[code] = x.c[code] || {};
      xanObserve(c, +ct.update || nowS, +it.quantity || 0, +it.cost || 0);
      c.seen = nowS;
    }
    if (!seen) throw new Error('no Xanax in the stock data');
    x.t = nowS; TS.set(XAN_KEY, x); xanErr = '';
  } catch (e) { xanErr = 'Xanax stock: ' + (e && e.message || e); }
  xanBusy = false;
  try { document.querySelectorAll('.cp-xan').forEach(el => el.dispatchEvent(new Event('cp-xan-refresh'))); } catch {}
}
const hhmm = s => { const d = new Date(s * 1000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const inMins = (s, nowS) => { const m = Math.round((s - nowS) / 60); return m <= 0 ? 'now' : m < 60 ? `in ${m}m` : `in ${Math.floor(m / 60)}h ${m % 60}m`; };
function xanHTML() {
  let open = true; try { open = lsGet('cp_xan_open') !== '0'; } catch {}
  const x = getXan(), nowS = Math.floor(Date.now() / 1000);
  const codes = Object.keys(x.c).sort((a, b) => (COUNTRY_NAMES[a] || a).localeCompare(COUNTRY_NAMES[b] || b));
  let body = '';
  if (open) {
    body = codes.map(code => {
      const c = x.c[code], p = xanPredict(c, nowS) || {}, name = COUNTRY_NAMES[code] || code.toUpperCase();
      const last = c.hist && c.hist[c.hist.length - 1], age = last ? Math.max(0, Math.round((nowS - last[0]) / 60)) : null;
      let line;
      if (p.q > 0) line = `<b class="ok">${p.q.toLocaleString('en-GB')} in stock</b>` + (p.emptySoon ? ` · sells out ~${hhmm(p.emptySoon)} · next restock ~<b>${hhmm(p.restock)}</b>` : p.note ? ` · <i>${p.note}</i>` : '');
      else if (p.restock) line = `<b class="out">out</b>${p.emptyAt ? ' since ~' + hhmm(p.emptyAt) : ''} · restock ~<b>${hhmm(p.restock)}</b> (${inMins(p.restock, nowS)})${p.overdue ? ' <i>overdue: any quarter hour</i>' : ''}`;
      else line = `<b class="out">out</b>${p.emptyAt ? ' since ~' + hhmm(p.emptyAt) : ''}${p.note ? ` · <i>${p.note}</i>` : ''}`;
      return `<div class="cp-xan-row"><span class="cp-xan-c">${name}</span><span>${line}<span class="cp-xan-age">${age == null ? '' : ' · data ' + (age < 1 ? 'just now' : age + 'm old')}</span></span></div>`;
    }).join('') || '<div class="cp-xan-row"><i>Loading stock from YATA&hellip;</i></div>';
    if (xanErr) body += `<div class="cp-xan-row err">${xanErr.replace(/[<>&]/g, '')}</div>`;
    const srvAge = x.srv ? Math.round((nowS - x.srv) / 60) : null;
    body += `<div class="cp-xan-row cp-xan-note">Predictions, not Torn data: restocks land on a quarter hour. Learned around the clock by the J_Sim stock watcher${srvAge == null ? '' : ` (last check ${srvAge < 1 ? 'just now' : srvAge + 'm ago'})`}, plus what you see live.</div>`;
  }
  return `<div class="cp-xan-head" role="button" tabindex="0">${open ? '&#9662;' : '&#9656;'} &#128138; Xanax restock</div>${body}`;
}
function mountXan(el) {
  if (!el) return;
  const draw = () => { try { el.innerHTML = xanHTML(); } catch {} };
  el.addEventListener('click', e => { if (!e.target.closest('.cp-xan-head')) return; let open = true; try { open = lsGet('cp_xan_open') !== '0'; } catch {} TS.set('cp_xan_open', open ? '0' : '1', true); draw(); });
  el.addEventListener('cp-xan-refresh', draw);
  window.addEventListener('storage', e => { if (e.key === XAN_KEY) draw(); });
  draw(); xanPoll();
  setInterval(() => { xanPoll(); draw(); }, 30000);
}
const XAN_CSS = `.cp-xan{flex:none;border-bottom:1px solid #333;background:#1a2421;font:12px Arial;color:#ccc}
.cp-xan-head{padding:5px 9px;font:700 11px Arial;letter-spacing:.4px;text-transform:uppercase;color:#c6f6d5;cursor:pointer;user-select:none}
.cp-xan-row{display:flex;gap:8px;padding:3px 9px;border-top:1px solid #26302c;line-height:1.35}
.cp-xan-c{flex:0 0 78px;color:#fff;font-weight:700}
.cp-xan .ok{color:#9ae6b4}.cp-xan .out{color:#feb2b2}
.cp-xan-age{color:#888}.cp-xan i{color:#aaa}
.cp-xan-note{color:#888;font-size:11px;display:block}
.cp-xan .err{color:#f56565}`;

/* =================== CHECK FOR UPDATES (Settings) =================== */
// Fetches the latest copy from GitHub now and hands it to the loader's cache, so a reload starts it
const UPDATE_SRC = 'https://raw.githubusercontent.com/JonSim28/jsim-cutpurse/main/jsim-cutpurse.user.js';
const VIA_LOADER = (() => { try { return typeof __cpPdaKey !== 'undefined' || !!window.__cpLoader; } catch { return !!window.__cpLoader; } })();
const verNum = v => String(v).split('.').map(n => +n || 0).reduce((a, n) => a * 1000 + n, 0);
function updateHTML() {
  return `<div class="cp-h">Updates</div>
    <div class="cp-row"><button class="cp-upd" type="button">Check for updates</button><button class="cp-reload" type="button" style="display:none">Reload now</button></div>
    <div class="cp-hint cp-updmsg">You're on v${SCRIPT_VERSION}. ${VIA_LOADER ? 'Updates also install by themselves (checked every 5 minutes).' : 'This copy was installed directly, so it can\'t update itself: install "J_Sim Cutpurse (auto-updating)" and delete this one.'}</div>`;
}
function wireUpdate(container) {
  if (!container) return;
  container.addEventListener('click', async e => {
    if (e.target.closest('.cp-reload')) { location.reload(); return; }
    const btn = e.target.closest('.cp-upd');
    if (!btn) return;
    const msg = container.querySelector('.cp-updmsg'), rl = container.querySelector('.cp-reload');
    btn.disabled = true; msg.textContent = 'Checking GitHub…';
    try {
      const url = UPDATE_SRC + '?t=' + Date.now();
      let text;
      try { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); text = await r.text(); }
      catch { const r = await httpGetX(url); text = r && typeof r === 'object' ? (r.responseText || r.body || r.data || '') : r; }
      const m = /@version\s+([\d.]+)/.exec(text || '');
      if (!m || String(text).indexOf('JSimCutpurse') < 0) throw new Error('the download was not the script');
      const latest = m[1];
      if (verNum(latest) <= verNum(SCRIPT_VERSION)) { msg.textContent = `You're up to date (v${SCRIPT_VERSION}).`; return; }
      if (!VIA_LOADER) { msg.textContent = `v${latest} is out, but this copy was installed directly and can't update itself. Install "J_Sim Cutpurse (auto-updating)" and delete this one.`; return; }
      try { localStorage.setItem('cp_code', text); localStorage.setItem('cp_code_chk', String(Date.now())); try { sessionStorage.removeItem('cp_code'); } catch {} }
      catch { try { localStorage.removeItem('cp_code'); localStorage.setItem('cp_code', text); } catch { try { sessionStorage.setItem('cp_code', text); } catch {} } }
      msg.textContent = `v${latest} downloaded. Reload the page to start it.`;
      rl.style.display = '';
    } catch (err) { msg.textContent = 'Could not check for updates: ' + (err && err.message || err); }
    finally { btn.disabled = false; }
  });
}

/* =================== NAME -> ID BOOK (shared) =================== */
// Learned from profiles you open and from lists that show IDs; lets the poker panel find FF scores and Attack links by name
const NAMES_KEY = 'cp_names';   // lower-case name -> { id, name, t }
const getNames = () => { try { return JSON.parse(lsGet(NAMES_KEY)) || {}; } catch { return {}; } };
function learnName(name, id) {
  if (!name || !id) return;
  const book = getNames(), k = String(name).toLowerCase();
  if (book[k] && book[k].id === +id && Date.now() - book[k].t < 864e5) return;
  book[k] = { id: +id, name: String(name), t: Date.now() };
  TS.set(NAMES_KEY, book);
}

/* =================== MUG LOG (shared) =================== */
// Filled in when YOU open an attack and it ends in a mug: Cutpurse reads the result on that page
const MUG_KEY = 'cp_muglog';   // id -> { name, t: last mug time, mugs: [{ a: amount|null, t }] }
const getMugs = () => { try { return JSON.parse(lsGet(MUG_KEY)) || {}; } catch { return {}; } };
const fmtMoney = n => n == null ? '?' : n >= 1e9 ? '$' + (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'b' : n >= 1e6 ? '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'm' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'k' : '$' + n;
const agoShort = t => { const m = Math.floor((Date.now() - t) / 60000); return m < 60 ? Math.max(1, m) + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd'; };
function mugTag(id, mugs) {
  const r = mugs[id];
  if (!r || !r.mugs || !r.mugs.length) return '';
  const last = r.mugs[r.mugs.length - 1];
  const n = r.mugs.length;
  return `<span class="cp-mug" title="Mugged ${n} time${n === 1 ? '' : 's'}">&#128176; ${fmtMoney(last.a)} &middot; ${agoShort(last.t)} ago${n > 1 ? ' &middot; x' + n : ''}</span>`;
}
function mugLogHTML(mugs) {
  const all = [];
  for (const id in mugs) for (const m of (mugs[id].mugs || [])) all.push({ id, name: mugs[id].name || '#' + id, a: m.a, t: m.t });
  all.sort((x, y) => y.t - x.t);
  if (!all.length) return '<div class="cp-mug-empty">No mugs logged yet. Open an attack from the list; when it ends in a mug, it is logged here.</div>';
  const week = all.filter(m => Date.now() - m.t < 7 * 864e5);
  const total = week.reduce((s, m) => s + (m.a || 0), 0);
  const esc2 = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<div class="cp-mug-sum">Last 7 days: <b>${week.length}</b> mug${week.length === 1 ? '' : 's'} &middot; <b>${fmtMoney(total)}</b></div>` +
    all.slice(0, 12).map(m => `<div class="cp-mug-row"><a href="/profiles.php?XID=${m.id}" target="_blank" rel="noopener">${esc2(m.name)}</a><span>${fmtMoney(m.a)}</span><span class="cp-mug-ago">${agoShort(m.t)} ago</span></div>`).join('') +
    `<button class="cp-mug-clear" type="button">Clear mug log</button>`;
}
function wireMugClear(container, after) {
  container.addEventListener('click', e => {
    if (!e.target.closest('.cp-mug-clear')) return;
    try { lsDel(MUG_KEY); } catch {}
    after();
  });
}

/* =================== SETTINGS MENU STYLES (shared) =================== */
const SETTINGS_CSS = `.cp-gear{background:#2d3b35!important;color:#e6f2ec!important;border:0;border-radius:4px;padding:4px 9px!important;font:700 11px Arial!important}
.cp-gear.on{background:#006a4e!important}
.cp-set{display:none;flex:none;flex-direction:column;gap:7px;padding:8px 9px;border-bottom:1px solid #333;background:#232826;max-height:42vh;overflow-y:auto}
#tal .list,#ths .list{flex:1 1 auto;min-height:60px}
.cpb-brand,#tal header,#ths header,#tal .foot,#ths .foot,.cpb-donate{flex:none}
.cp-set.on{display:flex}
.cp-set .cp-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cp-set .cp-lbl{flex:0 0 74px;color:#9fb3aa;font:700 11px Arial}
.cp-set .cp-hint{color:#8a9a93;font-size:11px}
.cp-set button{background:#444;color:#ddd;border:0;border-radius:4px;padding:4px 9px;font-size:11px}
.cp-set .keyrow{padding:0!important;border:0!important;background:none!important}
.cp-set .cp-h{margin-top:4px;padding-top:7px;border-top:1px solid #333;color:#e6f2ec;font:700 11px Arial;letter-spacing:.5px;text-transform:uppercase}
.cp-mug{display:inline-block;margin-left:5px;padding:1px 5px;border-radius:3px;background:#5f4b0f;color:#fefcbf;font:700 10px Arial;vertical-align:1px}
.cp-mug-sum{color:#ddd;font-size:12px}
.cp-mug-row{display:flex;gap:8px;align-items:center;font-size:12px;padding:3px 0;border-bottom:1px solid #2c2c2c}
.cp-mug-row a{flex:1;min-width:0;color:#7fb3ff!important;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-mug-row span{color:#fefcbf;font-weight:700}
.cp-mug-row .cp-mug-ago{color:#999;font-weight:400;width:54px;text-align:right}
.cp-mug-empty{color:#999;font-size:11px;font-style:italic}
.cp-mug-clear,.cp-store-free{align-self:flex-start;margin-top:4px}
.cp-set .cp-del{padding:2px 8px;margin-left:4px}
.cp-peek{cursor:pointer;text-decoration:underline dotted!important}`;

function brandHTML(tool) {
  return `<div class="cpb-brand">
    <svg width="30" height="30" viewBox="0 0 100 100" role="img" aria-label="Cutpurse logo: a coin sliced through">
      <circle cx="50" cy="50" r="40" fill="${BRAND_GREEN}"></circle>
      <circle cx="50" cy="50" r="31" fill="none" stroke="#dcd8ce" stroke-width="3" opacity="0.35"></circle>
      <text x="50" y="64" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="40" fill="#dcd8ce">$</text>
      <path d="M10 84 L90 16" stroke="#dcd8ce" stroke-width="9" stroke-linecap="round"></path>
      <path d="M14 82 L86 20" stroke="#10251c" stroke-width="3" stroke-linecap="round"></path>
    </svg>
    <div class="cpb-title"><span class="cpb-cut">CUTPURSE</span><span class="cpb-tool">${tool}</span></div>
    <div class="cpb-by" title="Made by J_Sim [3659615]">
      <svg width="20" height="22" viewBox="0 0 100 108" aria-hidden="true">
        <path d="${BRAND_SPECKLE}" fill="${BRAND_GREEN}" fill-opacity="0.6"></path>
        <circle cx="50" cy="48" r="40" fill="${BRAND_GREEN}"></circle>
        <rect x="30" y="80" width="5" height="18" rx="2.5" fill="${BRAND_GREEN}"></rect>
        <rect x="47" y="84" width="4" height="22" rx="2" fill="${BRAND_GREEN}"></rect>
        <rect x="66" y="78" width="5" height="13" rx="2.5" fill="${BRAND_GREEN}"></rect>
        <text x="50" y="68" text-anchor="middle" font-family="Black Ops One, Impact, sans-serif" font-size="58" fill="#dcd8ce">J</text>
      </svg>
      <div class="cpb-words"><span class="cpb-name">J_Sim</span><span class="cpb-sub">SCRIPTS</span></div>
    </div>
  </div>`;
}
function donateHTML() {
  return `<a class="cpb-donate" href="/item.php#drugs-items" target="_blank" rel="noopener" title="Opens your drugs. Choose Xanax, tap Send, paste the name and send 1.">💊 Support the script: send 1 Xanax to ${DONATE_TO}</a>`;
}
function wireDonate(container) {
  const a = container.querySelector('.cpb-donate');
  if (!a) return;
  a.addEventListener('click', () => {
    try { navigator.clipboard && navigator.clipboard.writeText(DONATE_TO); } catch {}
    const old = a.textContent;
    a.textContent = `Copied "${DONATE_TO}" · choose Xanax → Send → paste`;
    setTimeout(() => { a.textContent = old; }, 5000);
  });
}

/* =================== ABROAD PEOPLE PAGE =================== */
guard('Abroad', function () {
  'use strict';
  if (!/[?&]page=people\b/.test(location.search + location.hash)) return;
  // Never run twice on the same page (some apps inject scripts more than once)
  if (document.documentElement.dataset.tornScannerAbroad && document.getElementById('tal')) return;
  document.documentElement.dataset.tornScannerAbroad = '1';
  // An older copy of this script may still be installed: take over and remove its panel and buttons
  let oldCopy = false;
  for (const id of ['tal', 'tal-next', 'tal-toggle']) {
    const el = document.getElementById(id);
    if (el) { el.remove(); oldCopy = true; }
  }
  const VERSION = '1.8.6';

  /* ---------------- settings ---------------- */
  const TAP_LOCK_MS = 700;     // one page load per tap; blocks accidental double taps
  const KEY = 'tal_state';

  const COUNTRIES = ['Mexico', 'Cayman Islands', 'Canada', 'Hawaii', 'United Kingdom',
    'Argentina', 'Switzerland', 'Japan', 'China', 'UAE', 'United Arab Emirates', 'South Africa'];

  /* ---------------- state ---------------- */
  const load = () => { try { return JSON.parse(lsGet(KEY)) || null; } catch { return null; } };
  const save = () => TS.set(KEY, state);
  const fresh = country => ({ country, cycle: 0, lastPage: 0, open: true, players: {} });

  let state = load() || fresh('');
  let locked = false;

  /* ---------------- FF Scouter stats ---------------- */
  // Uses the FF Scouter API (ffscouter.com). Your Torn API key must be registered at ffscouter.com.
  const PDA_KEY = PDA_KEY_IN;   // Torn PDA's key (from the loader, or swapped in directly)
  const FF_TTL = 60 * 60 * 1000;        // re-check each player at most once an hour
  const FF_BATCH = 200;                 // FF Scouter accepts up to 200 IDs per request
  let ffKey = (() => { try { return lsGet('tal_ffkey') || ''; } catch { return ''; } })();
  if (!ffKey && !PDA_KEY.includes('#')) ffKey = PDA_KEY;
  let ffCache = (() => { try { return JSON.parse(lsGet('tal_ff')) || {}; } catch { return {}; } })();
  const saveFF = () => TS.set('tal_ff', ffCache);
  let ffBusy = false, ffErr = '', ffTimer;

  function httpGet(url) {
    if (typeof PDA_httpGet === 'function') return PDA_httpGet(url, {});
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((resolve, reject) => GM_xmlhttpRequest({
        method: 'GET', url, timeout: 20000,
        onload: resolve, onerror: reject, ontimeout: () => reject(new Error('timeout')),
      }));
    }
    return fetch(url).then(async r => ({ status: r.status, responseText: await r.text() }));
  }

  async function fetchFF() {
    if (ffBusy || !ffKey) return;
    const now = Date.now();
    const need = Object.keys(state.players).filter(id => !ffCache[id] || now - ffCache[id].t > FF_TTL);
    if (!need.length) return;
    ffBusy = true;
    try {
      for (let i = 0; i < need.length; i += FF_BATCH) {
        const ids = need.slice(i, i + FF_BATCH);
        const r = await httpGet(`https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(ffKey)}&targets=${ids.join(',')}`);
        const j = JSON.parse(r.responseText);
        if (!Array.isArray(j)) throw new Error(j && j.error ? j.error : `HTTP ${r.status}`);
        const got = new Set();
        for (const s of j) {
          got.add(String(s.player_id));
          ffCache[s.player_id] = { ff: s.fair_fight, bs: s.bs_estimate_human, t: now };
        }
        for (const id of ids) if (!got.has(String(id))) ffCache[id] = { ff: null, bs: null, t: now };
      }
      ffErr = '';
      try { queueDrugs(); } catch {}
      // trim old entries so storage doesn't grow forever
      for (const id in ffCache) if (now - ffCache[id].t > 24 * FF_TTL) delete ffCache[id];
      saveFF();
    } catch (e) {
      ffErr = 'FF Scouter: ' + (e.message || e);
    } finally {
      ffBusy = false;
      render();
    }
  }
  const queueFF = () => { clearTimeout(ffTimer); ffTimer = setTimeout(fetchFF, 400); };

  /* ---------------- Rehab counts (Switzerland only, Torn API) ---------------- */
  const DRUG_TTL = 6 * 60 * 60 * 1000;   // these change slowly; re-check every 6 hours
  const DRUG_GAP_MS = 1500;              // ~40 calls/min, well under Torn's 100/min
  const isSwiss = () => state.country === 'Switzerland';
  const tornKey = () => {
    if (ffKey) return ffKey;
    try { return JSON.parse(lsGet('ths_key')) || ''; } catch { return ''; }
  };
  let drugs = (() => { try { return JSON.parse(lsGet('tal_drugs')) || {}; } catch { return {}; } })();
  const saveDrugs = () => TS.set('tal_drugs', drugs);
  let drugQueue = [], drugRunning = false, drugErr = '';

  function findStat(obj, keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    if (Array.isArray(obj)) {                       // v2 style: [{ name, value }]
      const hit = obj.find(s => s && keys.includes(s.name));
      if (hit) return +hit.value;
    }
    for (const k of keys) if (typeof obj[k] === 'number') return obj[k];
    for (const v of Object.values(obj)) {
      const r = findStat(v, keys);
      if (r !== undefined) return r;
    }
    return undefined;
  }

  /* ---------------- Self-hosp abroad (Torn API profile of players shown as In hospital) ---------------- */
  const SELF_HOSP_RE = /Severe emesis following Ipecac Syrup ingestion|Suffering from an acute hemolytic transfusion reaction/i;
  const HOSP_GAP_MS = 1500;
  let abHosp = (() => { try { return JSON.parse(lsGet('cp_abhosp')) || {}; } catch { return {}; } })();   // id -> { reason, self, until, t }
  let hospQueue = [], hospRunning = false, hospErr = '';
  // Older entries saved before the war check have no faction yet: look them up again when the check is on
  // Self-hosp players are re-checked every 10 minutes (revives can be switched on or off); older entries without a revive status straight away
  const hospFresh = id => { const h = abHosp[id]; if (h && h.self && (h.revivable === undefined || (warCheckOn() && h.facId === undefined) || Date.now() - h.t > 10 * 60000)) return false; return h && (h.until ? Date.now() < h.until * 1000 + 60000 : Date.now() - h.t < 10 * 60000); };
  let warsA = (() => { try { return JSON.parse(lsGet('ths_wars')) || {}; } catch { return {}; } })();   // shared with the hospital page
  async function checkWarA(fid) {
    warsA = (() => { try { return JSON.parse(lsGet('ths_wars')) || {}; } catch { return warsA; } })();
    if (warsA[fid] && Date.now() - warsA[fid].t < 10 * 60000) return;
    await new Promise(res => setTimeout(res, HOSP_GAP_MS));
    try {
      const r = await fetch(`https://api.torn.com/v2/faction/${fid}/wars?key=${encodeURIComponent(tornKey())}&comment=CutpurseAbroad`);
      const j = await r.json();
      if (j.error) { hospErr = `API error ${j.error.code}: ${j.error.error}`; return; }
      const w = j.wars || {}, now = Date.now() / 1000;
      const live = x => x && (!x.end || x.end > now) && !x.winner;
      const asList = x => Array.isArray(x) ? x : x ? Object.values(x) : [];
      const enemy = x => { const f = asList(x && x.factions).find(f => +f.id !== +fid); return f && f.name ? ` vs ${f.name}` : ''; };
      let label = '';
      if (live(w.ranked)) label = 'Ranked war' + enemy(w.ranked);
      else if (asList(w.raids).some(live)) label = 'Raid' + enemy(asList(w.raids).find(live));
      else if (asList(w.territory).some(live)) label = 'Territory war';
      warsA[fid] = { war: !!label, label, t: Date.now() };
      TS.set('ths_wars', warsA);
    } catch (e) { hospErr = 'War check: ' + (e.message || e); }
  }
  function queueHosp() {
    return;   // Self-hosp here section removed from the People page (v1.8.6): no lookups
    if (!tornKey() || isSwiss()) return;   // not needed in Switzerland
    for (const p of Object.values(state.players)) {
      if (p.status === 'Hospital' && !hospFresh(p.id) && !hospQueue.includes(p.id)) hospQueue.push(p.id);
    }
    runHospQueue();
  }
  async function runHospQueue() {
    if (hospRunning) return;
    hospRunning = true;
    while (hospQueue.length) {
      const id = hospQueue.shift();
      const p = state.players[id];
      if (!p || p.status !== 'Hospital' || isSwiss()) continue;
      try {
        const r = await fetch(`https://api.torn.com/user/${id}?selections=profile&key=${encodeURIComponent(tornKey())}&comment=CutpurseAbroad`);
        const j = await r.json();
        if (j.error) {
          hospErr = `API error ${j.error.code}: ${j.error.error}`;
          if ([1, 2, 5, 10, 13, 16].includes(j.error.code)) { hospQueue = []; break; }
        } else {
          const st = j.status || {};
          const reason = String(st.details || '').trim() || String(st.description || '').trim();
          const fac = j.faction || {};
          abHosp[id] = { reason: reason.slice(0, 120), self: SELF_HOSP_RE.test(reason), until: +st.until || 0, state: st.state || '', facId: +fac.faction_id || 0, facName: fac.faction_name || '', revivable: j.revivable === undefined ? null : +j.revivable, t: Date.now() };
          hospErr = '';
          TS.set('cp_abhosp', abHosp);
          if (abHosp[id].self && abHosp[id].facId && warCheckOn()) await checkWarA(abHosp[id].facId);
        }
      } catch (e) { hospErr = 'API: ' + (e.message || e); }
      render();
      await new Promise(res => setTimeout(res, HOSP_GAP_MS));
    }
    hospRunning = false;
    render();
  }
  // Live countdowns in the abroad panel
  const fmtLeftA = ms => { if (ms <= 0) return 'OUT'; const t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return h ? `${h}h ${String(m).padStart(2, '0')}m ${String(x).padStart(2, '0')}s` : `${m}m ${String(x).padStart(2, '0')}s`; };
  setInterval(() => {
    try {
      document.querySelectorAll('#tal [data-out]').forEach(el => {
        const left = +el.dataset.out - Date.now();
        el.textContent = fmtLeftA(left);
        el.classList.toggle('soon', left > 0 && left <= 5 * 60000);
        el.classList.toggle('out', left <= 0);
      });
    } catch {}
  }, 1000);

  // FF limit check for rehab lookups: over the Max FF = skip; no FF score yet = look up last
  const ffBand = id => {
    let max = null; try { const v = parseFloat(lsGet('tal_ffmax')); max = isNaN(v) ? null : v; } catch {}
    const f = ffCache[id];
    if (!f || f.ff == null) return 1;            // unknown: after everyone within the limit
    if (max != null && +f.ff > max) return 2;    // over the limit: ignore
    return 0;                                    // within the limit: first
  };
  function queueDrugs() {
    if (!isSwiss() || !tornKey()) return;
    const now = Date.now();
    for (const p of Object.values(state.players)) {
      if ((drugs[p.id] && now - drugs[p.id].t <= DRUG_TTL) || ffBand(p.id) === 2) continue;
      if (!drugQueue.includes(p.id)) drugQueue.push(p.id);
    }
    // Within the FF limit first (newest arrivals first), then players with no FF score yet; drop anyone over the limit
    drugQueue = drugQueue.filter(id => state.players[id] && ffBand(id) !== 2);
    drugQueue.sort((a, b) => (ffBand(a) - ffBand(b)) || (((state.players[b] || {}).firstSeen || 0) - ((state.players[a] || {}).firstSeen || 0)));
    runDrugQueue();
  }

  async function runDrugQueue() {
    if (drugRunning) return;
    drugRunning = true;
    while (drugQueue.length && isSwiss()) {
      const id = drugQueue.shift();
      if (!state.players[id] || ffBand(id) === 2) continue;
      try {
        const r = await fetch(`https://api.torn.com/user/${id}?selections=personalstats&key=${encodeURIComponent(tornKey())}&comment=AbroadDrugs`);
        const j = await r.json();
        if (j.error) {
          drugErr = `API error ${j.error.code}: ${j.error.error}`;
          if ([1, 2, 5, 10, 13, 16].includes(j.error.code)) { drugQueue = []; break; }
        } else {
          const ps = j.personalstats || j;
          drugs[id] = { xan: findStat(ps, ['xantaken', 'xanax']), rehab: findStat(ps, ['rehabs']), t: Date.now() };
          drugErr = '';
          saveDrugs();
        }
      } catch (e) {
        drugErr = 'API: ' + (e.message || e);
      }
      render();
      await new Promise(res => setTimeout(res, DRUG_GAP_MS));
    }
    drugRunning = false;
    render();
  }

  function ffColour(ff) {
    if (ff == null) return '#555';
    if (ff < 2) return '#2b6cb0';      // easy
    if (ff < 3.5) return '#2f855a';    // good
    if (ff < 4.5) return '#c05621';    // tough
    return '#c53030';                  // very tough
  }

  /* ---------------- page reading ---------------- */
  function main() {
    return document.querySelector('#mainContainer .content-wrapper') ||
           document.querySelector('.content-wrapper') ||
           document.querySelector('#mainContainer') || document.body;
  }

  function detectCountry() {
    // Torn tags the page with the country you're in; use that first
    const tag = ((document.body && (document.body.dataset.country || document.body.getAttribute('data-country'))) || '').toLowerCase().replace(/[-_]/g, ' ');
    if (tag) {
      const hit = COUNTRIES.find(c => c.toLowerCase() === tag || c.toLowerCase().replace(/\s/g, '') === tag.replace(/\s/g, ''));
      if (hit) return hit === 'United Arab Emirates' ? 'UAE' : hit;
      if (tag === 'uk') return 'United Kingdom';
      if (tag === 'cayman') return 'Cayman Islands';
    }
    // Fallback: page heading only (not player names or chat text)
    const txt = [...document.querySelectorAll('.content-title, .title-black, h4')].map(e => e.textContent).join(' ');
    let hit = COUNTRIES.find(c => txt.includes(c));
    // Last resort, only before we know the country: scan the top of the page
    if (!hit && !state.country) hit = COUNTRIES.find(c => (main().textContent || '').slice(0, 3000).includes(c));
    return hit === 'United Arab Emirates' ? 'UAE' : (hit || '');
  }

  // Pagination: find numbered page buttons in the main content
  const PER_PAGE = 50;
  let ingestedOnce = false;

  /* ---------------- landing detection ---------------- */
  // "388 People in Japan active in the past week." - goes up when someone lands
  function readHeadCount() {
    const m = (main().textContent || '').replace(/\s+/g, ' ').match(/([\d,]+)\s+People in [^.]{2,40}? active in the past/i);
    return m ? +m[1].replace(/,/g, '') : null;
  }
  // How far the people on this page have moved since you last saw it (+1 = someone landed above it)
  function pageShift(page, ids) {
    const snap = state.snap || {};
    const old = new Map();
    for (const k in snap) (snap[k].ids || []).forEach((id, j) => old.set(id, (+k - 1) * PER_PAGE + j));
    const votes = new Map();
    ids.forEach((id, j) => {
      if (!old.has(id)) return;
      const off = (page - 1) * PER_PAGE + j - old.get(id);
      votes.set(off, (votes.get(off) || 0) + 1);
    });
    let best = null, n = 0;
    for (const [off, c] of votes) if (c > n) { best = off; n = c; }
    return n >= 3 ? best : null;   // need a few matches to be sure
  }

  // Alert: flash and vibrate (no sound abroad)
  let audio;
  function primeAudio() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch {} }
  function alertLanding() {
    try { navigator.vibrate && navigator.vibrate([150, 80, 150]); } catch {}
    panel.classList.remove('flash'); void panel.offsetWidth; panel.classList.add('flash');
  }
  function pager() {
    const root = main();
    const boxes = root.querySelectorAll('[class*="pagination"], [class*="pager"], [class*="page-number"], .gallery-wrapper-nav');
    const byNum = new Map();
    let current = null;
    boxes.forEach(b => b.querySelectorAll('a, button, li, span').forEach(el => {
      const t = el.textContent.trim();
      if (!/^\d+$/.test(t) || el.children.length) return;
      const n = +t;
      const clickable = el.closest('a, button') || el;
      if (!byNum.has(n)) byNum.set(n, clickable);
      // The current page is marked active/current, or is the one number that isn't a link
      const cls = ((el.className || '') + ' ' + (clickable.className || '') + ' ' + (clickable.parentElement ? clickable.parentElement.className : '')).toLowerCase();
      if (/\b(active|current|selected)\b|-active|-current|-selected/.test(cls) || clickable.getAttribute('aria-current')) current = n;
    }));
    if (!byNum.size) return null;
    const nums = [...byNum.keys()].sort((a, b) => a - b);
    if (current == null) {
      const plain = nums.filter(n => { const el = byNum.get(n); return !(el.tagName === 'A' && el.getAttribute('href')) && el.tagName !== 'BUTTON'; });
      if (plain.length === 1) current = plain[0];
    }
    if (current == null) {
      const m = (location.href.match(/start=(\d+)/) || [])[1];
      if (m != null) current = Math.floor(+m / PER_PAGE) + 1;
      else if (state.expectPage) current = state.expectPage;
    }
    return { byNum, nums, current, last: Math.max(nums[nums.length - 1], current || 1) };
  }


  // Online / Idle / Offline from the status icon in the player's row
  function readActivity(row) {
    for (const el of row.querySelectorAll('[id^="icon"], [title], [aria-label], [class*="status"], [class*="online"], [class*="idle"], [class*="offline"]')) {
      const id = el.id || '';
      if (/^icon62[_-]/.test(id)) return 'Idle';
      if (/^icon1[_-]/.test(id)) return 'Online';
      if (/^icon2[_-]/.test(id)) return 'Offline';
      const t = ((el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (typeof el.className === 'string' ? el.className : '')).toLowerCase();
      if (/\bidle\b/.test(t)) return 'Idle';
      if (/\boffline\b/.test(t)) return 'Offline';
      if (/\bonline\b/.test(t)) return 'Online';
    }
    return '';
  }

  function readPlayers() {
    const seen = new Map();
    main().querySelectorAll('a[href*="profiles.php?XID="]').forEach(a => {
      const id = +(a.href.match(/XID=(\d+)/) || [])[1];
      if (!id || seen.has(id)) return;
      const row = a.closest('li, tr, [class*="row"], [class*="item"]') || a.parentElement;
      const img = a.querySelector('img');
      const name = a.textContent.trim() || (img && (img.alt || img.title)) || a.title || `#${id}`;
      const text = (row.textContent || '').replace(/\s+/g, ' ');
      const level = (text.match(/(?:Level|Lvl|LV)\s*:?\s*(\d+)/i) || [])[1] || '';
      const status = /hospital/i.test(text) ? 'Hospital' : /jail/i.test(text) ? 'Jail' : /okay/i.test(text) ? 'Okay' : '';
      seen.set(id, { id, name: name.replace(/\s+/g, ' ').slice(0, 40), level, status, activity: readActivity(row) });
      try { learnName(name.replace(/\s+/g, ' ').trim(), id); } catch {}
    });
    return [...seen.values()];
  }

  /* ---------------- merging ---------------- */
  function ingest() {
    const country = detectCountry();
    // Only start a new list when we're sure you're in a different country (blank = not sure, keep the list)
    if (country && country !== state.country) {
      if (state.country) { const open = state.open, mode = state.mode; state = fresh(country); state.open = open; state.mode = mode; }
      else state.country = country;
    }

    const pg = pager();
    if (pg && pg.current == null) return;          // can't tell which page this is yet: wait
    const page = pg ? pg.current : 1;
    const onPage = readPlayers();
    if (!onPage.length) return;                    // list still loading
    // Page number changed but the names are the same as last time = Torn hasn't swapped the list yet
    const sig = onPage.map(p => p.id).join(',');
    if (page !== state.lastPage && sig === state.lastSig) return;
    // Same page, same people, already handled during this page load: nothing to do
    if (ingestedOnce && page === state.lastPage && sig === state.lastSig) return;
    ingestedOnce = true;
    state.lastSig = sig;
    state.expectPage = 0;

    // Wrapped from the last page back to page 1 = finished a full sweep (only if every page was visited this sweep)
    const prevTotal = state.totalPages || 1;
    const sweepDone = (() => { const c = state.cyclePages || []; for (let n = 1; n <= prevTotal; n++) if (!c.includes(n)) return false; return true; })();
    if (page === 1 && state.lastPage > 1 && state.lastPage >= prevTotal && sweepDone) {
      state.cyclePages = [];
      state.cycle++;
      // drop anyone not seen during the last full sweep (they flew home)
      for (const id in state.players) {
        if (state.players[id].lastCycle < state.cycle - 1) delete state.players[id];
      }
    }
    // Single-page country: every refresh counts as a sweep
    if (pg && pg.last === 1 && state.lastPage === 1) {
      state.cycle++;
      for (const id in state.players) {
        if (state.players[id].lastCycle < state.cycle - 1) delete state.players[id];
      }
    }
    state.lastPage = page;
    state.totalPages = pg ? pg.last : 1;
    const total = state.totalPages;
    state.cyclePages = [...new Set([...(state.cyclePages || []), page])];

    // ---- 1. Head count went up = someone landed (works from any page) ----
    const shift = pageShift(page, onPage.map(p => p.id));
    const newHere = state.baselineDone ? onPage.filter(p => !state.players[p.id]) : [];
    const count = readHeadCount();
    let alerted = false;
    if (count != null) {
      if (state.baselineDone && state.count != null && count > state.count) {
        state.pending = (state.pending || 0) + (count - state.count);
        state.lastAlertAt = Date.now();
        alerted = true;
      }
      state.count = count;
    }

    // ---- 2. Find them: narrow down which page they landed on ----
    if (state.baselineDone && (state.pending || 0) > 0) {
      if (newHere.length) {
        state.pending = Math.max(0, state.pending - newHere.length);
        state.search = state.pending ? { lo: 1, hi: total } : null;
      } else {
        const sr = state.search || { lo: 1, hi: total };
        sr.hi = Math.min(sr.hi, total);
        if (page >= sr.lo && page <= sr.hi) {
          // shift > 0: people here moved down, so the arrival is on an earlier page
          if (shift != null && shift > 0) sr.hi = page - 1;
          else sr.lo = page + 1;
        }
        if (sr.lo > sr.hi) {
          // Couldn't pin it down (they may have moved, or someone just became active): give up quietly
          state.pending = 0; state.search = null; state.searchNote = 'Couldn\'t find the new arrival';
        } else state.search = sr;
      }
    } else if (!(state.pending > 0)) state.search = null;
    if (newHere.length) state.searchNote = '';

    // Remember this page's order for next time
    state.snap = state.snap || {};
    state.snap[page] = { ids: onPage.map(p => p.id), t: Date.now() };
    for (const k in state.snap) if (+k > total) delete state.snap[k];

    // The starting list is only complete once every page has been loaded at least once
    if (!state.baselineDone) {
      state.pagesSeen = [...new Set([...(state.pagesSeen || []), page])];
    }
    const baselineWasDone = !!state.baselineDone;

    const now = Date.now();
    for (const p of onPage) {
      const old = state.players[p.id];
      state.players[p.id] = {
        ...p,
        firstSeen: old ? old.firstSeen : now,
        firstCycle: old ? old.firstCycle : state.cycle,
        // Only someone who first shows up AFTER every page was checked can be a new arrival
        afterBaseline: old ? !!old.afterBaseline : baselineWasDone,
        // Seen again on a later loop = one full cycle since they arrived, so no longer new
        seenAgain: old ? (old.seenAgain || old.firstCycle < state.cycle) : false,
        lastCycle: state.cycle,
      };
    }
    if (!state.baselineDone) {
      const total = state.totalPages || 1;
      let all = true;
      for (let n = 1; n <= total; n++) if (!state.pagesSeen.includes(n)) { all = false; break; }
      if (all) state.baselineDone = true;
    }
    // Start counting from here once the first full loop is done
    if (state.baselineDone && state.count == null) state.count = count;
    save();
    render();
    if (alerted || newHere.length) alertLanding();
    queueFF();
    queueDrugs();
    queueHosp();
  }

  /* ---------------- the button ---------------- */
  function nextPage() {
    if (locked) return;
    locked = true;
    setTimeout(() => { locked = false; render(); }, TAP_LOCK_MS);
    render();

    primeAudio();
    const pg = pager();
    if (!pg || pg.last <= 1) { location.reload(); return; }
    // Someone landed: jump towards the page they're on
    const sr = state.search;
    if (sr && state.pending > 0) {
      const cur = pg.current || state.lastPage || 1;
      let target = Math.floor((sr.lo + sr.hi) / 2);
      if (target === cur) target = cur < sr.hi ? cur + 1 : Math.max(sr.lo, cur - 1);
      goToPage(pg, target);
      return;
    }
    // Page 1 mode: just keep reloading page 1
    if (watchMode()) {
      const one = pg.byNum.get(1);
      if (pg.current !== 1 && one) one.click(); else location.reload();
      return;
    }
    const cur = pg.current || state.lastPage || 1;
    const target = cur >= pg.last ? 1 : cur + 1;
    goToPage(pg, target);
  }
  // Click the page link; if that page isn't shown in Torn's pager, use the start= link format, else the nearest shown page
  function goToPage(pg, target) {
    let el = pg.byNum.get(target);
    let dest = target;
    if (!el) {
      const withStart = [...pg.byNum.values()].find(a => a.tagName === 'A' && /start=\d+/.test(a.getAttribute('href') || ''));
      if (withStart) {
        state.expectPage = target; save();
        location.href = withStart.href.replace(/start=\d+/, 'start=' + (target - 1) * PER_PAGE);
        return;
      }
      const cur = pg.current || state.lastPage || 1;
      dest = pg.nums.filter(n => n !== cur).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
      el = pg.byNum.get(dest);
    }
    state.expectPage = dest; save();
    if (el) el.click(); else location.reload();
  }
  // Cycle all pages by default; "Page 1" mode (header button) just keeps reloading page 1
  function watchMode() { return state.baselineDone && state.mode === 'p1'; }

  /* ---------------- UI ---------------- */
  const style = document.createElement('style');
  style.textContent = `
  #tal-next{position:fixed;right:10px;bottom:80px;z-index:2147483646;width:72px;height:72px;border-radius:50%;border:0;background:#2b6cb0;color:#fff;font:700 13px Arial;box-shadow:0 3px 10px #0008;touch-action:manipulation}
  #tal-next:disabled{background:#4a5568}
  #tal-toggle{position:fixed;right:10px;bottom:160px;z-index:2147483646;border:0;border-radius:16px;background:#333;color:#fff;font:600 12px Arial;padding:7px 11px;box-shadow:0 2px 6px #0007}
  #tal{position:fixed;left:8px;right:92px;bottom:80px;z-index:2147483645;max-height:62vh;display:flex;flex-direction:column;background:#1f1f1f;color:#ddd;border:1px solid #0a3d2c;border-radius:8px;font:12px Arial;box-shadow:0 4px 14px #000a}
  #tal header{padding:7px 9px;border-bottom:1px solid #333;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px}
  #tal header b{color:#fff}
  #tal header button{background:#444;color:#ddd;border:0;border-radius:4px;padding:3px 7px;font-size:11px}
  #tal .list{overflow-y:auto}
  #tal .row{display:flex;align-items:center;gap:6px;padding:6px 9px;border-bottom:1px solid #2a2a2a}
  #tal .row.new{background:#1e3a24}
  #tal .row a{color:#7fb3ff;text-decoration:none}
  #tal .grow{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #tal .badge{background:#38a169;color:#fff;border-radius:3px;padding:1px 4px;font-size:10px;font-weight:700}
  #tal .meta{color:#999;font-size:11px}
  #tal .hosp{color:#f56565}
  #tal .atk{background:#9b2c2c;color:#fff!important;border-radius:3px;padding:3px 7px}
  #tal .btns{display:flex;flex-direction:column;gap:4px;align-items:stretch;text-align:center}
  #tal .rev,#ths .rev{background:#2c7a7b;color:#fff!important;border-radius:3px;padding:3px 7px;text-decoration:none}
  #tal .revon,#ths .revon{color:#9ae6b4;font-weight:700}
  #tal .revoff,#ths .revoff{color:#999}
  #tal .foot{padding:5px 9px;border-top:1px solid #333;color:#999;font-size:11px}
  #tal .sec{position:sticky;top:0;z-index:1;padding:6px 9px;font:700 11px Arial;letter-spacing:.4px;text-transform:uppercase;display:flex;justify-content:space-between}
  #tal .sec.new{background:#22543d;color:#c6f6d5;border-bottom:2px solid #38a169;cursor:pointer;user-select:none}
  #tal .sec.rest{background:#2d2d2d;color:#bbb;border-bottom:1px solid #444}
  #tal .empty{padding:8px 9px;color:#777;font-style:italic}
  #tal .row .name{font-weight:700;font-size:13px}
  #tal .row .sub{display:block;margin-top:2px}
  #tal .row.new{border-left:3px solid #38a169}
  #tal .gap{height:6px;background:#181818}
  #tal .ff{display:inline-block;margin-left:5px;padding:1px 5px;border-radius:3px;color:#fff;font:700 11px Arial;vertical-align:1px}
  #tal .ffbs{color:#bbb;font-weight:400}
  #tal .keyrow{display:none;gap:6px;padding:6px 9px;border-bottom:1px solid #333;background:#262626}
  #tal .keyrow.on{display:flex}
  #tal .keyrow input{flex:1;min-width:0;background:#1a1a1a;color:#ddd;border:1px solid #444;border-radius:4px;padding:4px 6px;font:12px Arial}
  #tal .keyrow button,#tal header .hbtns button{background:#444;color:#ddd;border:0;border-radius:4px;padding:3px 7px;font-size:11px}
  #tal .ffmax{color:#bbb;font-size:11px;white-space:nowrap}
  #tal .ffmax input{width:52px;background:#1a1a1a;color:#fff;border:1px solid #555;border-radius:4px;padding:2px 4px;font:12px Arial}
  ${DONATE_CSS}
  ${BRAND_CSS}
  ${SETTINGS_CSS}
  ${XAN_CSS}
  #tal .err{color:#f56565}
  #tal .drug{color:#d6bcfa}
  #tal .sec.selfh{position:sticky;top:0;z-index:1;padding:6px 9px;font:700 11px Arial;letter-spacing:.4px;text-transform:uppercase;display:flex;justify-content:space-between;background:#4a3b12;color:#fbd38d;border-bottom:1px solid #b7791f}
  #tal .row.selfh{border-left:3px solid #b7791f;background:#2a2412}
  #tal .reason{color:#c9b98f;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #tal .cd{display:inline-block;margin-left:5px;padding:1px 5px;border-radius:3px;background:#2a4365;color:#bee3f8;font:700 11px monospace;vertical-align:1px}
  #tal .cd.soon{background:#744210;color:#fefcbf}
  #tal .cd.out{background:#9b2c2c;color:#fff}
  #tal .landed{position:sticky;top:0;z-index:2;padding:8px 9px;background:#c05621;color:#fff;font:700 12px Arial}
  #tal .landed.miss{background:#4a5568;font-weight:400}
  #tal.flash{animation:talflash .9s ease 2}
  @keyframes talflash{0%,100%{box-shadow:0 4px 14px #000a}50%{box-shadow:0 0 0 4px #ed8936,0 4px 14px #000a}}
  #tal-next.find{background:#c05621}
  #tal .act{color:#ddd}
  #tal .act i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
  #tal .drug b{color:#fff}
  `;
  document.head.appendChild(style);

  const btn = Object.assign(document.createElement('button'), { id: 'tal-next' });
  const toggle = Object.assign(document.createElement('button'), { id: 'tal-toggle' });
  const panel = Object.assign(document.createElement('div'), { id: 'tal' });
  panel.innerHTML = `${brandHTML('Catch the cash before it&#39;s banked')}<header><b id="tal-title"></b><button class="cp-gear" id="tal-gear" type="button" aria-expanded="false">&#9881; Settings</button></header><div class="cp-xan" id="tal-xan"></div>
                     <div class="cp-set" id="tal-set">
                       <div class="cp-row"><span class="cp-lbl">Max FF</span><label class="ffmax"><input id="tal-ffmax" type="number" inputmode="decimal" step="0.1" min="0" placeholder="off" aria-label="Max FF"></label><span class="cp-hint">hide anyone above this</span></div>
                       <div class="cp-row" id="tal-rehabrow"><span class="cp-lbl">Min rehabs</span><label class="ffmax"><input id="tal-minrehab" type="number" inputmode="numeric" step="1" min="0" placeholder="off" aria-label="Minimum rehabs"></label><span class="cp-hint">Switzerland only</span></div>
                       <div class="cp-row" id="tal-warrow"><span class="cp-lbl">War check</span><button id="tal-war" type="button"></button><span class="cp-hint">ranked war status of self-hosp players</span></div>
                       <div class="cp-row" id="tal-moderow"><span class="cp-lbl">Pages</span><button id="tal-mode" type="button"></button></div>
                       <div class="cp-row"><span class="cp-lbl">FF key</span><button id="tal-keybtn" type="button">Change key</button></div>
                       <div class="keyrow" id="tal-keyrow"><input id="tal-key" type="password" autocomplete="off" placeholder="API key registered at ffscouter.com"><button id="tal-keysave" type="button">Save</button></div>
                       <div class="cp-row"><span class="cp-lbl">List</span><button id="tal-reset" type="button">Reset list</button></div>
                       <div class="cp-h">Mug log</div>
                       <div id="tal-mugs"></div>
                       <div id="tal-upd">${updateHTML()}</div>
                       <div class="cp-h">Storage</div>
                       <div id="tal-store"></div>
                     </div>
                     <div class="list" id="tal-list"></div><div class="foot" id="tal-foot"></div>${donateHTML()}`;
  document.body.append(panel, toggle, btn);

  btn.onclick = nextPage;
  const keyRow = panel.querySelector('#tal-keyrow');
  // Settings menu (gear)
  const setBox = panel.querySelector('#tal-set'), gear = panel.querySelector('#tal-gear');
  const setOpen = on => { setBox.classList.toggle('on', on); gear.classList.toggle('on', on); gear.setAttribute('aria-expanded', on ? 'true' : 'false'); render(); };
  gear.onclick = () => setOpen(!setBox.classList.contains('on'));
  wireMugClear(panel.querySelector('#tal-mugs'), () => render());
  mountXan(panel.querySelector('#tal-xan'));
  wireUpdate(panel.querySelector('#tal-upd'));
  wireStorage(panel.querySelector('#tal-store'), () => { ffCache = {}; drugs = {}; abHosp = {}; render(); queueFF(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { try { render(); } catch {} } });
  panel.querySelector('#tal-key').value = ffKey;
  if (!ffKey) { keyRow.classList.add('on'); setBox.classList.add('on'); gear.classList.add('on'); }
  panel.querySelector('#tal-keybtn').onclick = () => keyRow.classList.toggle('on');
  panel.querySelector('#tal-keysave').onclick = () => {
    ffKey = panel.querySelector('#tal-key').value.trim();
    TS.set('tal_ffkey', ffKey, true);
    ffCache = {}; saveFF(); ffErr = '';
    keyRow.classList.remove('on');
    fetchFF();
    drugErr = ''; queueDrugs();
  };
  panel.querySelector('#tal-list').addEventListener('click', e => {
    if (e.target.closest('#tal-newhead')) { state.newOpen = state.newOpen === false; save(); render(); }
  });
  toggle.onclick = () => { state.open = !state.open; save(); render(); };
  panel.querySelector('#tal-reset').onclick = () => { const o = state.open, m = state.mode; state = fresh(detectCountry()); state.open = o; state.mode = m; ingestedOnce = false; save(); ingest(); };
  panel.querySelector('#tal-war').onclick = () => { TS.set('cp_abwar', warCheckOn() ? '0' : '1', true); render(); queueHosp(); };
  panel.querySelector('#tal-mode').onclick = () => { state.mode = state.mode === 'p1' ? 'all' : 'p1'; save(); render(); };
  // Max FF: hide anyone with an FF score above this number (blank = no filter)
  const ffMax = () => { try { const v = parseFloat(lsGet('tal_ffmax')); return isNaN(v) ? null : v; } catch { return null; } };
  const ffInput = panel.querySelector('#tal-ffmax');
  if (ffMax() != null) ffInput.value = ffMax();
  let ffInputT;
  ffInput.addEventListener('input', () => {
    clearTimeout(ffInputT);
    ffInputT = setTimeout(() => { TS.set('tal_ffmax', ffInput.value.trim(), true); render(); queueDrugs(); }, 300);
  });
  // Min rehabs (Switzerland only): hide players whose rehab count is below this
  const minRehab = () => { try { const v = parseInt(lsGet('tal_minrehab'), 10); return isNaN(v) ? null : v; } catch { return null; } };
  const rehabInput = panel.querySelector('#tal-minrehab');
  if (minRehab() != null) rehabInput.value = minRehab();
  let rehabInputT;
  rehabInput.addEventListener('input', () => {
    clearTimeout(rehabInputT);
    rehabInputT = setTimeout(() => { TS.set('tal_minrehab', rehabInput.value.trim(), true); render(); }, 300);
  });
  wireDonate(panel);

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = ms => { const s = Math.floor(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`; };

  function render() {
    const now = Date.now();
    const pg = state.lastPage || 1, total = state.totalPages || 1;
    btn.disabled = locked;
    const searching = state.search && state.pending > 0;
    const sTarget = searching ? Math.floor((state.search.lo + state.search.hi) / 2) : 0;
    btn.classList.toggle('find', !!searching);
    btn.innerHTML = searching
      ? `Find<br><span style="font-weight:400;font-size:11px">p${state.search.lo === state.search.hi ? state.search.lo : state.search.lo + '–' + state.search.hi}</span>`
      : watchMode()
      ? `Refresh<br><span style="font-weight:400;font-size:11px">page 1</span>`
      : `Next<br><span style="font-weight:400;font-size:11px">${pg} / ${total}</span>`;
    const modeBtn = panel.querySelector('#tal-mode');
    modeBtn.style.display = state.baselineDone ? '' : 'none';
    panel.querySelector('#tal-moderow').style.display = state.baselineDone ? '' : 'none';
    panel.querySelector('#tal-rehabrow').style.display = isSwiss() ? '' : 'none';
    panel.querySelector('#tal-warrow').style.display = 'none';
    panel.querySelector('#tal-war').textContent = warCheckOn() ? 'On' : 'Off';
    try { warsA = JSON.parse(lsGet('ths_wars')) || warsA; } catch {}
    const mugs = getMugs();
    if (setBox.classList.contains('on')) { panel.querySelector('#tal-mugs').innerHTML = mugLogHTML(mugs); panel.querySelector('#tal-store').innerHTML = storageHTML(); }
    modeBtn.textContent = watchMode() ? 'Mode: Page 1' : 'Mode: All pages';
    toggle.textContent = state.open ? 'Hide list' : 'Show list';
    panel.style.display = state.open ? 'flex' : 'none';

    // FF filter (players with no FF score yet stay visible)
    const maxFF = ffMax();
    const ffHidden = p => {
      if (maxFF == null) return false;
      const f = ffCache[p.id];
      if (!f || f.ff == null) return false;
      return +f.ff > maxFF;
    };
    const hiddenByFF = Object.values(state.players).filter(ffHidden).length;
    // Min rehabs (Switzerland only); players whose count hasn't loaded yet stay visible
    const minR = isSwiss() ? minRehab() : null;
    const rehabHidden = p => minR != null && drugs[p.id] && drugs[p.id].rehab != null && drugs[p.id].rehab < minR;
    const hiddenByRehab = minR != null ? Object.values(state.players).filter(p => !ffHidden(p) && rehabHidden(p)).length : 0;
    const list = Object.values(state.players).filter(p => !ffHidden(p) && !rehabHidden(p)).map(p => ({
      ...p,
      // Mugged in the last 15 minutes = already done, so not shown as a new arrival
      isNew: !!state.baselineDone && !!p.afterBaseline && !p.seenAgain && !(mugs[p.id] && mugs[p.id].t && now - mugs[p.id].t < 15 * 60000),
    })).sort((a, b) => (b.isNew - a.isNew) || (b.isNew ? b.firstSeen - a.firstSeen : 0) || (+b.level || 0) - (+a.level || 0));

    const newCount = list.filter(p => p.isNew).length;
    panel.querySelector('#tal-title').textContent = `${state.country || 'Abroad'} · ${list.length} people${newCount ? ` · ${newCount} new` : ''}`;
    const ffTag = id => {
      if (!ffKey) return '';
      const s = ffCache[id];
      if (!s) return '<span class="ff" style="background:#3a3a3a">FF …</span>';
      if (s.ff == null) return '<span class="ff" style="background:#3a3a3a">FF ?</span>';
      return `<span class="ff" style="background:${ffColour(s.ff)}">FF ${(+s.ff).toFixed(2)}${s.bs ? ` <span class="ffbs">${esc(s.bs)}</span>` : ''}</span>`;
    };
    const actDot = a => {
      if (!a) return '';
      const col = a === 'Online' ? '#38a169' : a === 'Idle' ? '#d69e2e' : '#718096';
      return `<span class="act"><i style="background:${col}"></i>${a}</span> · `;
    };
    const fmtN = n => n == null || isNaN(n) ? '?' : Number(n).toLocaleString('en-GB');
    const drugLine = id => {
      if (!isSwiss()) return '';
      if (!tornKey()) return '<span class="meta sub drug">Add your API key to see rehabs</span>';
      const d = drugs[id];
      if (!d) return '<span class="meta sub drug">🏥 Rehabs …</span>';
      return `<span class="meta sub drug">🏥 Rehabs done <b>${fmtN(d.rehab)}</b></span>`;
    };
    const row = p => `
      <div class="row ${p.isNew ? 'new' : ''}">
        <div class="grow">
          <a class="name" href="/profiles.php?XID=${p.id}">${esc(p.name)}</a>${ffTag(p.id)}${mugTag(p.id, mugs)}
          <span class="meta sub">${actDot(p.activity)}${p.level ? 'Level ' + esc(p.level) : 'Level ?'}${p.status === 'Hospital' ? ' · <span class="hosp">In hospital</span>' : p.status ? ' · ' + esc(p.status) : ''}${p.isNew ? ' · arrived ' + ago(now - p.firstSeen) + ' ago' : ''}</span>
          ${drugLine(p.id)}
        </div>
        <a class="atk" href="/loader.php?sid=attack&user2ID=${p.id}" target="_blank" rel="noopener">Attack</a>
      </div>`;

    // Self-hospitalised players here (still in hospital), shown in their own section
    const isSelfHere = p => { return false; if (isSwiss()) return false; const h = abHosp[p.id]; return p.status === 'Hospital' && h && h.self && (!h.until || Date.now() < h.until * 1000 + 60000); };
    const warLineA = h => {
      if (h.facId === undefined) return '';
      if (!h.facId) return '<span class="meta sub">No faction</span>';
      const fname = esc(h.facName || 'Faction');
      if (!warCheckOn()) return `<span class="meta sub">${fname}</span>`;
      const w = warsA[h.facId];
      if (!w) return `<span class="meta sub">${fname} · war check…</span>`;
      return w.war ? `<span class="meta sub" style="color:#feb2b2;font-weight:700">&#9876; ${fname} · ${esc(w.label)}</span>` : `<span class="meta sub">${fname} · not at war</span>`;
    };
    const revTagA = h => h.revivable === 1 ? ' · <span class="revon">Revives on</span>' : h.revivable === 0 ? ' · <span class="revoff">Revives off</span>' : '';
    const selfRow = p => {
      const h = abHosp[p.id];
      const why = /ipecac/i.test(h.reason) ? 'Ipecac' : 'Blood bag';
      return `
      <div class="row selfh">
        <div class="grow">
          <a class="name" href="/profiles.php?XID=${p.id}">${esc(p.name)}</a>${ffTag(p.id)}${h.until ? `<span class="cd" data-out="${h.until * 1000}">${fmtLeftA(h.until * 1000 - Date.now())}</span>` : ''}${mugTag(p.id, mugs)}
          <span class="meta sub">${actDot(p.activity)}${p.level ? 'Level ' + esc(p.level) : 'Level ?'} · ${why}${revTagA(h)}</span>
          <span class="meta sub reason" title="${esc(h.reason)}">${esc(h.reason)}</span>
          ${warLineA(h)}
          ${drugLine(p.id)}
        </div>
        <div class="btns"><a class="atk" href="/loader.php?sid=attack&user2ID=${p.id}" target="_blank" rel="noopener">Attack</a>${h.revivable === 1 ? `<a class="rev" href="/profiles.php?XID=${p.id}" target="_blank" rel="noopener" title="Opens their profile: tap Revive there">Revive</a>` : ''}</div>
      </div>`;
    };
    // Revives on first (soonest out first), then revives off (soonest out first)
    const revA = id => abHosp[id] && abHosp[id].revivable === 1 ? 1 : 0;
    const selfHere = list.filter(p => !p.isNew && isSelfHere(p)).sort((a, b) => (revA(b.id) - revA(a.id)) || ((abHosp[a.id].until || 9e15) - (abHosp[b.id].until || 9e15)));
    const selfSection = selfHere.length
      ? `<div class="gap"></div><div class="sec selfh"><span>&#127973; Self-hosp here</span><span>${selfHere.length}</span></div>` + selfHere.map(selfRow).join('')
      : '';
    const fresh = list.filter(p => p.isNew);
    const byRehab = (a, b) => ((drugs[b.id] && drugs[b.id].rehab != null ? drugs[b.id].rehab : -1) - (drugs[a.id] && drugs[a.id].rehab != null ? drugs[a.id].rehab : -1));
    const rest = list.filter(p => !p.isNew && !isSelfHere(p));
    if (isSwiss()) rest.sort(byRehab);
    const newOpen = state.newOpen !== false;
    let html = '';
    if (!list.length) {
      html = '<div class="empty">Tap Next to start building the list.</div>';
    } else if (!state.baselineDone) {
      // First loop: plain list, nobody highlighted
      html += selfSection;
      const others = list.filter(p => !isSelfHere(p));
      if (isSwiss()) others.sort(byRehab);
      html += `<div class="sec rest"><span>Everyone here</span><span>${others.length}</span></div>`;
      html += others.map(row).join('');
    } else {
      html += `<div class="sec new" id="tal-newhead"><span>${newOpen ? '▾' : '▸'} 🛬 New arrivals</span><span>${fresh.length}</span></div>`;
      if (newOpen) {
        html += fresh.length ? fresh.map(row).join('')
          : `<div class="empty">No new arrivals in the last loop.</div>`;
      }
      html += selfSection;
      html += `<div class="gap"></div><div class="sec rest"><span>Everyone else</span><span>${rest.length}</span></div>`;
      html += rest.length ? rest.map(row).join('') : '<div class="empty">Nobody else here.</div>';
    }
    if (searching) {
      html = `<div class="landed">🛬 ${state.pending} just landed · ${state.search.lo === state.search.hi ? 'on page ' + state.search.lo : 'somewhere in pages ' + state.search.lo + '–' + state.search.hi} · tap <b>Find</b></div>` + html;
    } else if (state.searchNote) {
      html = `<div class="landed miss">${esc(state.searchNote)} · carry on with Next</div>` + html;
    }
    panel.querySelector('#tal-list').innerHTML = html;

    const seenN = (state.pagesSeen || []).filter(n => n <= total).length;
    const footText = (!state.baselineDone
      ? `First loop: ${seenN} of ${total} pages checked. New arrivals show once every page has been checked.`
      : watchMode() ? `Watching page 1 only · tap "Mode" to cycle all pages again`
      : `Sweep ${state.cycle + 1} · page ${pg} of ${total}`) + (state.count != null ? ` · ${state.count} here` : '') + (hiddenByFF ? ` · ${hiddenByFF} hidden (FF over ${maxFF})` : '') + (hiddenByRehab ? ` · ${hiddenByRehab} hidden (under ${minR} rehabs)` : '') + ` · v${VERSION}` +
      (oldCopy ? ' · an old copy of this script is still installed, please delete it' : '');
    panel.querySelector('#tal-foot').innerHTML = esc(footText) +
      (ffErr ? `<br><span class="err">${esc(ffErr)}</span>` : !ffKey ? '<br>Add your key under "FF key" to see FF stats.' : '') +
      (isSwiss() && drugQueue.length ? `<br>Loading rehabs: ${drugQueue.length} left` : '') +
      (hospQueue.length ? `<br>Checking hospital reasons: ${hospQueue.length} left` : '') +
      (hospErr ? `<br><span class="err">${esc(hospErr)}</span>` : '') +
      (isSwiss() && drugErr ? `<br><span class="err">${esc(drugErr)}</span>` : '') +
      (TS.err ? `<br><span class="err">${esc(TS.err)}</span>` : '');
  }

  /* ---------------- watch for page changes ---------------- */
  let t;
  new MutationObserver(muts => {
    if (muts.every(m => panel.contains(m.target) || m.target === btn || m.target === toggle)) return;
    clearTimeout(t);
    t = setTimeout(ingest, 400);
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => { clearTimeout(t); t = setTimeout(ingest, 400); });

  ingest();
});

/* =================== BAZAAR PAGE (records what you see) =================== */
guard('Bazaar', function () {
  'use strict';
  if (!/bazaar\.php/.test(location.pathname)) return;
  const id = +((location.search + location.hash).match(/userId=(\d+)/i) || [])[1];
  if (!id) return;
  const get = () => { try { return JSON.parse(lsGet('ths_bazseen')) || {}; } catch { return {}; } };
  const put = v => TS.set('ths_bazseen', v);
  const root = () => document.querySelector('#mainContainer .content-wrapper') || document.querySelector('.content-wrapper') || document.body;

  let toast, last = '';
  function show(msg, ok) {
    if (!toast) {
      toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:99999;padding:8px 14px;border-radius:16px;font:600 13px Arial;color:#fff;box-shadow:0 2px 8px #0008';
      document.body.appendChild(toast);
    }
    toast.style.background = ok ? '#2f855a' : '#4a5568';
    toast.textContent = msg;
  }

  function check(final) {
    const r = root();
    // Notices like "This user does not have a bazaar" can sit outside the main box, so read the whole page for those
    const text = (document.body.innerText || document.body.textContent || '').replace(/\s+/g, ' ');
    // "Closed" covers a closed bazaar or no bazaar at all. An EMPTY open bazaar is kept: items may have sold, leaving cash on hand
    const closed = /bazaar (is )?(currently )?closed|closed (their|this|his|her) bazaar|is closed\b|bazaar[^.!]{0,40}\bclosed\b|\bclosed\b[^.!]{0,25}\bbazaar|(does not|doesn't|do not) have a bazaar|no bazaar/i.test(text);
    const empty = !closed && /bazaar is empty|no items (for sale|in (this|the|their) bazaar)|(has|have) nothing (for sale|in)/i.test(text);
    const itemEls = r.querySelectorAll('img[src*="/images/items/"], img[data-src*="/images/items/"], img[srcset*="/images/items/"], [style*="/images/items/"]');
    let items = new Set([...itemEls].map((el, i) => el.closest('li, [class*="item"]') || i)).size;
    // Fallback: item cards that show a price
    if (!items) items = [...r.querySelectorAll('[class*="item"]')].filter(el => /\$[\d,]+/.test(el.textContent) && !el.querySelector('[class*="item"]')).length;
    let rec = null;
    if (closed) rec = { open: false, items: 0 };
    else if (items > 0) rec = { open: true, items };
    else if (empty) rec = { open: true, items: 0, empty: true };
    if (!rec) {
      // Couldn't see items or a "closed" notice: don't guess, leave it as not checked
      if (final && !last) show("Hospital list: couldn't read this bazaar", false);
      return;
    }
    const sig = rec.open + ':' + rec.items;
    if (sig === last) return;
    last = sig;
    const all = get();
    all[id] = { ...rec, t: Date.now() };
    if (!put(all)) { show(TS.err || "Hospital list: couldn't save", false); last = ''; return; }
    show(rec.empty ? 'Hospital list: bazaar open · empty (items sold?)'
      : rec.open ? `Hospital list: bazaar open · ${rec.items} item${rec.items === 1 ? '' : 's'}`
      : /have a bazaar|no bazaar/i.test(text) ? 'Hospital list: no bazaar' : 'Hospital list: bazaar closed', rec.open);
  }

  let t;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => check(false), 500); })
    .observe(document.body, { childList: true, subtree: true });
  show('Hospital list: reading bazaar…', false);   // shows straight away so you know the script is running here
  setTimeout(() => check(false), 1200);
  setTimeout(() => check(true), 6000);
});

/* =================== ATTACK PAGE (logs your mugs) =================== */
guard('Attack', function () {
  // Attack pages can be loader.php?sid=attack or page.php?sid=attack
  if (!/(loader|page)\.php/.test(location.pathname) || !/sid=attack/i.test(location.search + location.hash)) return;
  const id = +((location.search + location.hash).match(/user2ID=(\d+)/i) || [])[1];
  if (!id) return;
  const PATTERNS = [
    /you\s+mugged\s+(.+?)\s+and\s+(?:stole|took|received|got|gained)\s+\$\s?([\d,]+)/i,
    /mugged\s+(.+?)\s+(?:and|for)\s+\$\s?([\d,]+)/i,
  ];
  const AMOUNT_FIRST = /stole\s+\$\s?([\d,]+)\s+from\s+([^.!\n]+)/i;
  let done = false, obs;
  function toast(msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:70px;z-index:2147483647;padding:8px 14px;border-radius:16px;background:#0a3d2c;color:#e6f2ec;font:700 13px Arial;box-shadow:0 2px 8px #0008';
    t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 6000);
  }
  function check() {
    if (done) return;
    // textContent keeps names in their real case (Torn shows the result in capitals)
    const raw = (document.body.textContent || '').replace(/\s+/g, ' ');
    const text = /mugged|stole/i.test(raw) ? raw : (document.body.innerText || '').replace(/\s+/g, ' ');
    let name = null, amt = null, hit = false;
    for (const re of PATTERNS) { const m = text.match(re); if (m) { name = m[1]; amt = +m[2].replace(/,/g, ''); hit = true; break; } }
    if (!hit) { const m = text.match(AMOUNT_FIRST); if (m) { amt = +m[1].replace(/,/g, ''); name = m[2]; hit = true; } }
    if (!hit && /\byou\s+mugged\b/i.test(text)) { hit = true; const m = text.match(/you\s+mugged\s+([^.!,]+?)(?:\s+and|[.!,])/i); name = m ? m[1] : null; }
    if (!hit) return;
    done = true; if (obs) obs.disconnect();
    const log = getMugs();
    const rec = log[id] || { name: name || '#' + id, mugs: [] };
    if (name) {
      name = name.trim();
      // If the name came out in capitals, find its real spelling elsewhere on the page (e.g. the fighters' name bar)
      if (name === name.toUpperCase()) {
        const m = raw.match(new RegExp('\\b(' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'i'));
        const all = raw.match(new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi')) || [];
        const nicer = all.find(n => n !== n.toUpperCase());
        if (nicer) name = nicer; else if (m) name = m[1];
      }
      rec.name = name.slice(0, 30);
    }
    const last = rec.mugs[rec.mugs.length - 1];
    if (last && Date.now() - last.t < 120000 && last.a === amt) return;   // same mug seen twice
    rec.mugs.push({ a: amt, t: Date.now() });
    rec.mugs = rec.mugs.slice(-10);
    rec.t = Date.now();
    log[id] = rec;
    TS.set(MUG_KEY, log);
  }
  let t;
  obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(check, 300); });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  check();
});

/* =================== PROFILE PAGE (learns name -> ID) =================== */
guard('Profile', function () {
  if (!/profiles\.php/.test(location.pathname)) return;
  const q = location.search + location.hash;
  const xid = +((q.match(/XID=(\d+)/i) || [])[1]) || null;
  const nid = (() => { const m = q.match(/NID=([^&#]+)/i); try { return m ? decodeURIComponent(m[1]).trim() : null; } catch { return m ? m[1] : null; } })();
  const reEsc = v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    const text = (document.title + ' ' + (document.body.textContent || '').slice(0, 60000)).replace(/\s+/g, ' ');
    let done = false;
    if (nid) {
      // Opened by name: find that exact name followed by its [ID] (not your own name in the sidebar)
      const m = text.match(new RegExp('(?:^|[^A-Za-z0-9_-])(' + reEsc(nid) + ')\\s*\\[(\\d{1,9})\\]', 'i'));
      if (m) { learnName(m[1], m[2]); done = true; }
    } else if (xid) {
      // Opened by ID: find the name written next to that ID
      const m = text.match(new RegExp('([A-Za-z0-9_-]{2,20})\\s*\\[' + xid + '\\]'));
      if (m) { learnName(m[1], xid); done = true; }
    }
    if (done || tries > 15) clearInterval(t);
  }, 700);
});


/* =================== POKER (reads the table you are watching) =================== */
guard('Poker', function () {
  const url = location.pathname + location.search + location.hash;
  if (!/(page|loader|casino)\.php/.test(location.pathname)) return;
  if (!(/sid=(holdem|poker)/i.test(url) || /casino\.php/.test(location.pathname) || /poker/i.test(document.title))) return;

  const LEFT_KEY = 'cp_pokerleft';         // name -> { stack, id, t }
  const LEFT_SHOW_MS = 30 * 60 * 1000;     // show leavers for 30 minutes
  const STOP = /^(folded|fold|call|check|bet|raise|all|in|all in|waiting|waiting bb|bb|sb|d|dealer|small|big|blind|small blind|big blind|pot|sit|sit in|starting|next|round|cash|games|tournaments|poker|won|winner)$/i;
  const NAME_RE = /^[A-Za-z0-9_-]{2,20}$/;
  const MONEY_RE = /^\$\s?([\d,]+)$/;
  const money = t => +String(t).replace(/[^\d]/g, '');
  const minStack = () => { try { const v = parseFloat(lsGet('cp_pokermin')); return isNaN(v) ? 10e6 : v * 1e6; } catch { return 10e6; } };
  const getLeft = () => { try { return JSON.parse(lsGet(LEFT_KEY)) || {}; } catch { return {}; } };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let seats = {};          // name -> { stack, id, won, missing }

  // FF Scouter scores (shared cache with the other panels). Needs the player's ID, which comes from the seat's profile link.
  const ffKeyP = () => { try { return lsGet('tal_ffkey') || JSON.parse(lsGet('ths_key') || '""') || (PDA_KEY_IN.indexOf('###') === 0 ? '' : PDA_KEY_IN); } catch { return ''; } };
  const getFF = () => { try { return JSON.parse(lsGet('tal_ff')) || {}; } catch { return {}; } };
  const maxFFP = () => { try { const raw = lsGet('cp_pokerffmax'); if (raw === null) return 3.5; const v = parseFloat(raw); return isNaN(v) ? null : v; } catch { return 3.5; } };
  let ffBusyP = false, ffErrP = '', ffLastTry = 0;
  function httpGetP(url) {
    if (typeof PDA_httpGet === 'function') return PDA_httpGet(url, {});
    if (typeof GM_xmlhttpRequest === 'function') return new Promise((res, rej) => GM_xmlhttpRequest({ method: 'GET', url, timeout: 20000, onload: res, onerror: rej, ontimeout: () => rej(new Error('timeout')) }));
    return fetch(url).then(async r => ({ status: r.status, responseText: await r.text() }));
  }
  async function fetchFFP() {
    const key = ffKeyP();
    if (ffBusyP || !key) return;
    const cache = getFF(), now = Date.now();
    if (now - ffLastTry < (ffErrP ? 60000 : 5000)) return;   // don't hammer FF Scouter (wait a minute after an error)
    ffLastTry = now;
    const ids = [...new Set(Object.values(seats).map(v => v.id).concat(Object.values(getLeft()).map(v => v.id)).filter(id => id && (!cache[id] || now - cache[id].t > 3600e3)))];
    if (!ids.length) return;
    ffBusyP = true;
    try {
      const r = await httpGetP(`https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(key)}&targets=${ids.slice(0, 200).join(',')}`);
      const j = JSON.parse(r.responseText);
      if (!Array.isArray(j)) throw new Error(j && j.error ? j.error : `HTTP ${r.status}`);
      const c2 = getFF(), got = new Set();
      for (const x of j) { got.add(String(x.player_id)); c2[x.player_id] = { ff: x.fair_fight, bs: x.bs_estimate_human, t: now }; }
      for (const id of ids) if (!got.has(String(id))) c2[id] = { ff: null, bs: null, t: now };
      TS.set('tal_ff', c2);
      ffErrP = '';
    } catch (e) { ffErrP = 'FF Scouter: ' + (e.message || e); }
    ffBusyP = false;
    render();
  }
  let seenLog = new WeakSet();
  let firstScan = true, panel = null, flashT = 0, graceUntil = 0;

  // ---- reading the page ----
  function textNodes(root) {
    const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) out.push({ t, n }); }
    return out;
  }
  function tableRoot() {
    const pot = textNodes(document.body).find(x => /^POT:/i.test(x.t));
    if (!pot) return null;
    let el = pot.n.parentElement;
    for (let i = 0; i < 12 && el && el.parentElement; i++) {
      const cnt = textNodes(el).filter(x => MONEY_RE.test(x.t)).length;
      if (cnt >= 4) return el;
      el = el.parentElement;
    }
    return el;
  }
  // Look for a player ID in this seat: profile links, attack links, or data attributes that hold a user ID
  const ID_ATTR = /(?:XID=|user2?ID=|userId=|player_?id=|uid=)(\d{3,9})/i;
  function idIn(el) {
    const all = [el, ...(el.querySelectorAll ? el.querySelectorAll('*') : [])];
    for (const e of all) {
      if (!e.attributes) continue;
      for (const a of e.attributes) {
        const v = a.value || '';
        let m = v.match(ID_ATTR);
        if (m) return +m[1];
        if (/^data-(user|player|uid|id|userid|player-id|user-id)$/i.test(a.name) && /^\d{3,9}$/.test(v)) return +v;
        // Torn's poker seats: <div class="opponent___..." id="player-4213776">
        if (a.name === 'id') { const pm = v.match(/^(?:player|user|opponent)[-_](\d{3,9})$/i); if (pm) return +pm[1]; }
      }
    }
    return null;
  }
  function idNear(node, name) {
    // Climb to the seat's own box (stop before it holds another player's stack too)
    let el = node.parentElement, best = null;
    for (let i = 0; i < 6 && el; i++) {
      const monies = textNodes(el).filter(x => MONEY_RE.test(x.t)).length;
      if (monies > 2) break;
      best = el;
      const id = idIn(el);
      if (id) { learnName(name, id); return id; }
      el = el.parentElement;
    }
    const known = getNames()[String(name).toLowerCase()];
    return known ? known.id : null;
  }
  // For the diagnose button: the HTML of one seat
  function seatHTML(name) {
    const root = tableRoot(); if (!root) return '';
    const hit = textNodes(root).find(x => x.t === name); if (!hit) return '';
    let el = hit.n.parentElement, best = el;
    for (let i = 0; i < 6 && el; i++) { if (textNodes(el).filter(x => MONEY_RE.test(x.t)).length > 2) break; best = el; el = el.parentElement; }
    return best.outerHTML.replace(/\s+/g, ' ').slice(0, 3000);
  }
  function readSeats(root) {
    const toks = textNodes(root).filter(x => !/^POT:/i.test(x.t));
    const found = {};
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i].t;
      if (!NAME_RE.test(t) || !/[A-Za-z]/.test(t) || STOP.test(t) || MONEY_RE.test(t)) continue;
      for (let j = i + 1; j <= i + 2 && j < toks.length; j++) {
        if (MONEY_RE.test(toks[j].t)) { found[t] = { stack: money(toks[j].t), id: idNear(toks[i].n, t) }; break; }
        if (NAME_RE.test(toks[j].t) && !STOP.test(toks[j].t)) break;
      }
    }
    return found;
  }
  function readLog() {
    const events = [];
    for (const x of textNodes(document.body)) {
      if (seenLog.has(x.n)) continue;
      let m;
      if ((m = x.t.match(/^(.+?) left the table/i))) events.push({ type: 'left', name: m[1].trim(), n: x.n });
      else if ((m = x.t.match(/^(.+?) joined the table/i))) events.push({ type: 'joined', name: m[1].trim(), n: x.n });
      else if ((m = x.t.match(/^(.+?)\s+won\s+\$([\d,]+)/i))) events.push({ type: 'won', name: m[1].trim(), amt: money(m[2]), n: x.n });
      else continue;
      seenLog.add(x.n);
    }
    return events;
  }

  // ---- what we do with it ----
  function recordLeaver(name, stack, id) {
    if (!stack) return;
    const left = getLeft();
    left[name] = { stack, id: id || null, t: Date.now() };
    TS.set(LEFT_KEY, left);
    // Only ka-ching for people who will show in the list: big enough stack and not over your Max FF
    const f = id && getFF()[id], mx = maxFFP();
    const tooTough = mx != null && f && f.ff != null && +f.ff > mx;
    if (stack >= minStack() && !tooTough) alertLeaver();
  }
  let audio;
  document.addEventListener('click', () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch {} }, true);
  function alertLeaver() {
    kaching();
    flashT = Date.now();
  }
  function scan() {
    const root = tableRoot();
    if (!root) return;
    const now = readSeats(root);
    // Switched to another table? Most of the old seats vanish at once (and new names appear).
    // Start fresh for the new table instead of counting everyone you left behind as "left with cash".
    const prevNames = Object.keys(seats);
    const gone = prevNames.filter(n => !now[n]), fresh = Object.keys(now).filter(n => !seats[n]);
    if (prevNames.length && (gone.length >= 3 || (gone.length >= 2 && fresh.length >= 2) || gone.length >= Math.ceil(prevNames.length * 0.6))) {
      seats = {};
      graceUntil = Date.now() + 5000;                // the new table's old log lines are not new events
    }
    const quiet = firstScan || Date.now() < graceUntil;
    for (const e of readLog()) {
      if (quiet) continue;                           // ignore what was already in the log when you arrived
      if (e.type === 'left') {
        if (!seats[e.name]) continue;                // only players we saw sitting at this table
        const s0 = seats[e.name]; recordLeaver(e.name, s0.stack, s0.id); delete seats[e.name];
      }
      if (e.type === 'won') { (seats[e.name] = seats[e.name] || { stack: 0, won: 0 }).won = (seats[e.name].won || 0) + e.amt; }
    }
    // Seat gone for a few checks without a log line: treat as left
    for (const name in seats) {
      if (now[name]) continue;
      seats[name].missing = (seats[name].missing || 0) + 1;
      if (seats[name].missing === 4) { if (!quiet) recordLeaver(name, seats[name].stack, seats[name].id); delete seats[name]; }
    }
    const book = getNames();
    for (const name in now) {
      if (!now[name].id && book[name.toLowerCase()]) now[name].id = book[name.toLowerCase()].id;
      if (now[name].id) learnName(name, now[name].id);
      seats[name] = { ...(seats[name] || {}), ...now[name], missing: 0 };
    }
    firstScan = false;
    render();
  }

  // ---- panel ----
  function build() {
    const st = document.createElement('style');
    st.textContent = `
    #cpk{position:fixed;left:8px;right:8px;bottom:80px;z-index:2147483645;max-height:46vh;display:flex;flex-direction:column;background:#1f1f1f;color:#ddd;border:1px solid #0a3d2c;border-radius:8px;font:12px Arial;box-shadow:0 4px 14px #000a}
    #cpk.min .cpk-body{display:none}
    #cpk.flash{animation:cpkflash .9s ease 3}
    @keyframes cpkflash{50%{box-shadow:0 0 0 4px #ed8936,0 4px 14px #000a}}
    #cpk header{display:flex;align-items:center;gap:6px;padding:6px 9px;border-bottom:1px solid #333}
    #cpk header b{flex:1;color:#fff}
    #cpk header button{background:#2d3b35;color:#e6f2ec;border:0;border-radius:4px;padding:4px 8px;font:700 11px Arial}
    #cpk .cpk-body{display:flex;flex-direction:column;min-height:0}
    #cpk .cpk-set{display:none;flex-direction:column;gap:6px;padding:6px 9px;background:#232826;border-bottom:1px solid #333}
    #cpk .cpk-set.on{display:flex}
    #cpk .cpk-hint{color:#8a9a93;font-size:11px}
    #cpk .cpk-set button{background:#444;color:#ddd;border:0;border-radius:4px;padding:4px 9px;font-size:11px}
    #cpk .ff{display:inline-block;margin-left:5px;padding:1px 5px;border-radius:3px;color:#fff;font:700 11px Arial;vertical-align:1px}
    #cpk .foot{padding:4px 9px;color:#999;font-size:11px;border-top:1px solid #333}
    #cpk .cpk-set input{width:64px;background:#1a1a1a;color:#fff;border:1px solid #555;border-radius:4px;padding:3px 5px;font:12px Arial}
    #cpk .cpk-list{overflow-y:auto}
    #cpk .sec{padding:5px 9px;font:700 11px Arial;letter-spacing:.4px;text-transform:uppercase;display:flex;justify-content:space-between}
    #cpk .sec.left{background:#7b341e;color:#feebc8}
    #cpk .sec.seat{background:#2d2d2d;color:#bbb}
    #cpk .r{display:flex;align-items:center;gap:6px;padding:5px 9px;border-bottom:1px solid #2a2a2a}
    #cpk .r.big{background:#3b2414}
    #cpk .r .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #cpk .r .n b{color:#fff;font-size:13px}
    #cpk .r .m{color:#fbd38d;font-weight:700}
    #cpk .r .w{color:#9ae6b4;font-size:11px;margin-left:4px}
    #cpk .r .ago{color:#999;font-size:11px}
    #cpk .r a{border-radius:3px;padding:3px 7px;color:#fff!important;text-decoration:none;white-space:nowrap}
    #cpk .atk{background:#9b2c2c}
    #cpk .pro{background:#2b6cb0}
    #cpk .empty{padding:7px 9px;color:#888;font-style:italic}
    ${BRAND_CSS}
    ${DONATE_CSS}
    ${SETTINGS_CSS}`;
    document.head.appendChild(st);
    panel = document.createElement('div');
    panel.id = 'cpk';
    panel.innerHTML = `${brandHTML('Catch the cash before it&#39;s banked')}
      <header><b id="cpk-title">Poker</b><button id="cpk-gear" type="button">&#9881;</button><button id="cpk-min" type="button">Hide</button></header>
      <div class="cpk-body">
        <div class="cpk-set" id="cpk-set">
          <div><span>Max FF</span> <input id="cpk-maxff" type="number" inputmode="decimal" min="0" step="0.1" placeholder="off" aria-label="Max FF"> <span class="cpk-hint">hide anyone above this</span></div>
          <div><span>Alert when someone leaves with at least $</span><input id="cpk-minstack" type="number" inputmode="decimal" min="0" step="1" aria-label="Minimum stack in millions"><span>m</span></div>
          <div><button id="cpk-clear" type="button">Clear "Left with cash"</button></div>
          <div id="cpk-upd" class="cp-set" style="display:flex;padding:0;border:0;background:none">${updateHTML()}</div>
        </div>
        <div class="cpk-list" id="cpk-list"></div>
        <div class="foot" id="cpk-foot"></div>
        ${donateHTML()}
      </div>`;
    document.body.appendChild(panel);
    wireDonate(panel);
    wireUpdate(panel.querySelector('#cpk-upd'));
    const inp = panel.querySelector('#cpk-minstack');
    inp.value = minStack() / 1e6;
    const ffi = panel.querySelector('#cpk-maxff');
    if (maxFFP() != null) ffi.value = maxFFP();
    ffi.addEventListener('input', () => { TS.set('cp_pokerffmax', ffi.value.trim(), true); render(); });
    inp.addEventListener('input', () => { TS.set('cp_pokermin', inp.value.trim(), true); render(); });
    panel.querySelector('#cpk-clear').onclick = () => { try { lsDel(LEFT_KEY); } catch {} render(); };
    panel.querySelector('#cpk-gear').onclick = () => panel.querySelector('#cpk-set').classList.toggle('on');
    panel.querySelector('#cpk-min').onclick = () => { panel.classList.toggle('min'); panel.querySelector('#cpk-min').textContent = panel.classList.contains('min') ? 'Show' : 'Hide'; };
  }
  const agoTxt = t => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? 'just now' : m + 'm ago'; };
  const fmt = n => typeof fmtMoney === 'function' ? fmtMoney(n) : '$' + Number(n).toLocaleString('en-GB');
  function links(name, id) {
    return id ? `<a class="atk" href="/loader.php?sid=attack&user2ID=${id}" target="_blank" rel="noopener">Attack</a>`
              : `<a class="pro" href="/profiles.php?NID=${encodeURIComponent(name)}" target="_blank" rel="noopener">Profile</a>`;
  }
  function render() {
    if (!panel) build();
    const min = minStack();
    const left = getLeft();
    const ffc = getFF(), maxFF = maxFFP();
    const ffOf = v => v.id && ffc[v.id] && ffc[v.id].ff != null ? +ffc[v.id].ff : null;
    const tooTough = v => maxFF != null && ffOf(v) != null && ffOf(v) > maxFF;
    const ffTagP = v => {
      if (!v.id) return '<span class="ff" style="background:#3a3a3a" title="No player ID on this seat">FF ?</span>';
      const f = ffc[v.id];
      if (!f) return ffKeyP() ? '<span class="ff" style="background:#3a3a3a">FF &hellip;</span>' : '';
      if (f.ff == null) return '<span class="ff" style="background:#3a3a3a">FF ?</span>';
      const col = f.ff < 2 ? '#2b6cb0' : f.ff < 3.5 ? '#2f855a' : f.ff < 4.5 ? '#c05621' : '#c53030';
      return `<span class="ff" style="background:${col}">FF ${(+f.ff).toFixed(2)}</span>`;
    };
    const book = getNames();
    for (const n in left) if (!left[n].id && book[n.toLowerCase()]) left[n].id = book[n.toLowerCase()].id;
    const allLeavers = Object.entries(left).filter(([, v]) => Date.now() - v.t < LEFT_SHOW_MS && v.stack >= min);
    const leavers = allLeavers.filter(([, v]) => !tooTough(v)).sort((a, b) => b[1].t - a[1].t);
    const allSeats = Object.entries(seats);
    const list = allSeats.filter(([, v]) => !tooTough(v)).sort((a, b) => b[1].stack - a[1].stack);
    const hidden = (allSeats.length - list.length) + (allLeavers.length - leavers.length);
    const noId = allSeats.filter(([, v]) => !v.id).length;
    panel.querySelector('#cpk-title').textContent = `Poker watch · ${list.length} seated · v${SCRIPT_VERSION}`;
    let html = `<div class="sec left"><span>&#128682; Left with cash</span><span>${leavers.length}</span></div>`;
    html += leavers.length ? leavers.map(([n, v]) => `<div class="r big"><div class="n"><b>${esc(n)}</b>${ffTagP(v)} <span class="m">${fmt(v.stack)}</span><br><span class="ago">left ${agoTxt(v.t)}</span></div>${links(n, v.id)}</div>`).join('')
      : `<div class="empty">Nobody has left with ${fmt(min)}+ yet. Keep this table open.</div>`;
    html += `<div class="sec seat"><span>At the table</span><span>${list.length}</span></div>`;
    html += list.map(([n, v]) => `<div class="r${v.stack >= min ? ' big' : ''}"><div class="n"><b>${esc(n)}</b>${ffTagP(v)} <span class="m">${fmt(v.stack)}</span>${v.won ? `<span class="w">+${fmt(v.won)} won</span>` : ''}</div>${links(n, v.id)}</div>`).join('') || '<div class="empty">Waiting for the table to load.</div>';
    panel.querySelector('#cpk-list').innerHTML = html;
    panel.querySelector('#cpk-foot').innerHTML = esc([
      hidden ? `${hidden} hidden (FF over ${maxFF})` : '',
      noId ? `${noId} with no player ID (FF unknown)` : '',
      !ffKeyP() ? 'Add your FF key on the abroad or hospital panel to see FF' : '',
      ffErrP,
    ].filter(Boolean).join(' \u00b7 ')) || '&nbsp;';
    fetchFFP();
    if (flashT && Date.now() - flashT < 3000) { panel.classList.remove('flash'); void panel.offsetWidth; panel.classList.add('flash'); flashT = 0; }
  }

  let t;
  new MutationObserver(muts => {
    if (panel && muts.every(m => panel.contains(m.target))) return;
    clearTimeout(t); t = setTimeout(scan, 300);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  setInterval(scan, 2000);
  scan();
});

/* =================== HOSPITAL PAGE =================== */
guard('Hospital', function () {
  'use strict';
  if (!/hospitalview\.php/.test(location.pathname)) return;

  /* ---------------- settings ---------------- */
  // Only these two hospital reasons count as self-hospitalised
  const SELF_HOSP = /Severe emesis following Ipecac Syrup ingestion|Suffering from an acute hemolytic transfusion reaction/i;
  const isSelfHosp = reason => SELF_HOSP.test(reason);
  const TAP_LOCK_MS = 700;            // one page load per tap
  const BAZ_TTL = 60 * 1000;          // re-check activity / faction at most once a minute
  const SEEN_TTL = 15 * 60 * 1000;    // a bazaar you opened counts as checked for 15 minutes
  // Max FF box in the header: hide anyone with an FF score above it (blank = no limit; unknown FF stays visible)
  const maxFF = () => { try { const raw = lsGet('ths_ffmax'); if (raw === null) return 3.5; const v = parseFloat(raw); return isNaN(v) ? null : v; } catch { return 3.5; } };
  const overMax = id => { const m = maxFF(), f = ffCache[id]; return m != null && !!f && f.ff != null && +f.ff > m; };
  const WAR_TTL = 10 * 60 * 1000;     // re-check a faction's wars every 10 minutes
  const BAZ_GAP_MS = 1500;            // ~40 API calls/min max, well under Torn's 100/min
  // Abroad hospitals keep their own list, so it never mixes with Torn's hospital list
  const ABROAD_AT_START = (() => { try { const t = document.title + ' ' + [...document.querySelectorAll('h4, .content-title, .title-black')].map(e => e.textContent).join(' ') + ' ' + (document.body.textContent || '').slice(0, 20000); const m = t.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?) Hospital\b/); return /Travel Home/i.test(t) || !!(m && !/\b(Torn|City)\b/.test(m[1])); } catch { return false; } })();
  const KEY = ABROAD_AT_START ? 'ths_state_ab' : 'ths_state';

  /* ---------------- storage ---------------- */
  const ls = {
    get: (k, d) => { try { const v = lsGet(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set: (k, v) => TS.set(k, v),
  };
  const fresh = () => ({ cycle: 0, lastPage: 0, totalPages: 1, open: true, restOpen: false, players: {} });
  let state = ls.get(KEY, null) || fresh();
  const save = () => ls.set(KEY, state);
  // Re-check saved players with the current rules (clears earlier false matches)
  for (const id in state.players) state.players[id].self = isSelfHosp(state.players[id].reason || '');

  const PDA_KEY = PDA_KEY_IN;   // Torn PDA's key (from the loader, or swapped in directly)
  let apiKey = ls.get('ths_key', '') || (PDA_KEY.includes('#') ? '' : PDA_KEY);
  let baz = ls.get('ths_baz', {});      // id -> { activity, lastSeen, facId, facName, t }  (Torn API profile)
  // Bazaar open/closed, recorded when YOU open someone's bazaar (Torn made bazaar data private in the API)
  let seen = ls.get('ths_bazseen', {}); // id -> { open, items, t }
  const safeRender = () => { try { render(); } catch {} };   // panel may not exist yet
  window.addEventListener('storage', e => { if (e.key === 'ths_bazseen') safeRender(); });
  // Coming back to this tab: refresh straight away
  document.addEventListener('visibilitychange', () => { if (!document.hidden) safeRender(); });
  window.addEventListener('focus', safeRender);
  window.addEventListener('pageshow', safeRender);
  const bazState = id => { const v = seen[id]; if (!v) return 'unknown'; const ttl = v.open ? SEEN_TTL : 2 * 60 * 60 * 1000; if (Date.now() - v.t > ttl) return 'unknown'; return v.open ? 'open' : 'closed'; };
  let apiErr = '';
  let locked = false;

  /* ---------------- FF Scouter stats (shares key + cache with the abroad page) ---------------- */
  const FF_TTL = 60 * 60 * 1000, FF_BATCH = 200;
  // FF key saved on the abroad page, otherwise the Torn API key saved here (it must be registered at ffscouter.com)
  const ffKeyNow = () => { try { return lsGet('tal_ffkey') || apiKey; } catch { return apiKey; } };
  let ffCache = ls.get('tal_ff', {});
  let ffBusy = false, ffErr = '', ffTimer;

  function httpGet(url) {
    if (typeof PDA_httpGet === 'function') return PDA_httpGet(url, {});
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((resolve, reject) => GM_xmlhttpRequest({
        method: 'GET', url, timeout: 20000,
        onload: resolve, onerror: reject, ontimeout: () => reject(new Error('timeout')),
      }));
    }
    return fetch(url).then(async r => ({ status: r.status, responseText: await r.text() }));
  }

  async function fetchFF() {
    const key = ffKeyNow();
    if (ffBusy || !key) return;
    const now = Date.now();
    // Only self-hosp players are ever shown, so only look those up
    const need = Object.keys(state.players).filter(id => state.players[id].self && (!ffCache[id] || now - ffCache[id].t > FF_TTL));
    if (!need.length) return;
    ffBusy = true;
    try {
      for (let i = 0; i < need.length; i += FF_BATCH) {
        const ids = need.slice(i, i + FF_BATCH);
        const r = await httpGet(`https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(key)}&targets=${ids.join(',')}`);
        const j = JSON.parse(r.responseText);
        if (!Array.isArray(j)) throw new Error(j && j.error ? j.error : `HTTP ${r.status}`);
        const got = new Set();
        for (const s of j) { got.add(String(s.player_id)); ffCache[s.player_id] = { ff: s.fair_fight, bs: s.bs_estimate_human, t: now }; }
        for (const id of ids) if (!got.has(String(id))) ffCache[id] = { ff: null, bs: null, t: now };
      }
      ffErr = '';
      for (const id in ffCache) if (now - ffCache[id].t > 24 * FF_TTL) delete ffCache[id];
      ls.set('tal_ff', ffCache);
    } catch (e) {
      ffErr = 'FF Scouter: ' + (e.message || e);
    } finally {
      ffBusy = false;
      render();
    }
  }
  const queueFF = () => { clearTimeout(ffTimer); ffTimer = setTimeout(fetchFF, 400); };
  const ffColour = ff => ff == null ? '#555' : ff < 2 ? '#2b6cb0' : ff < 3.5 ? '#2f855a' : ff < 4.5 ? '#c05621' : '#c53030';

  /* ---------------- hospital countdown ---------------- */
  function parseSecs(str) {
    if (!str) return 0;
    const c = str.match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);
    if (c) return (+(c[1] || 0)) * 3600 + (+c[2]) * 60 + (+c[3]);
    let s = 0;
    const units = { d: 86400, h: 3600, m: 60, s: 1 };
    str.replace(/(\d+)\s*(d(?:ays?)?|h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)\b/gi, (_, n, u) => { s += (+n) * units[u[0].toLowerCase()]; return _; });
    return s;
  }
  function fmtLeft(ms) {
    if (ms <= 0) return 'OUT';
    const t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return h ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : `${m}m ${String(s).padStart(2, '0')}s`;
  }

  /* ---------------- page reading ---------------- */
  function main() {
    return document.querySelector('#mainContainer .content-wrapper') ||
           document.querySelector('.content-wrapper') ||
           document.querySelector('#mainContainer') || document.body;
  }

  function pager() {
    const boxes = main().querySelectorAll('[class*="pagination"], [class*="pager"], [class*="page-number"], .gallery-wrapper-nav');
    const byNum = new Map();
    boxes.forEach(b => b.querySelectorAll('a, button, li, span').forEach(el => {
      const t = el.textContent.trim();
      if (!/^\d+$/.test(t) || el.children.length) return;
      const n = +t;
      if (!byNum.has(n)) byNum.set(n, el.closest('a, button') || el);
    }));
    // Fallback: read page from the URL hash (hospitalview.php#start=50)
    const start = +((location.hash.match(/start=(\d+)/) || [])[1] || 0);
    const hashPage = Math.floor(start / 50) + 1;
    if (!byNum.size) return { byNum, current: hashPage, last: Math.max(hashPage, state.totalPages || 1), hashOnly: true };
    const nums = [...byNum.keys()].sort((a, b) => a - b);
    let current = nums.find(n => {
      const el = byNum.get(n);
      const cls = (el.className + ' ' + (el.parentElement ? el.parentElement.className : '')).toLowerCase();
      return /active|current|selected/.test(cls) || el.getAttribute('aria-current');
    }) || hashPage;
    return { byNum, current, last: Math.max(nums[nums.length - 1], current) };
  }

  function readPlayers() {
    const seen = new Map();
    main().querySelectorAll('a[href*="profiles.php?XID="]').forEach(a => {
      const id = +(a.href.match(/XID=(\d+)/) || [])[1];
      if (!id || seen.has(id)) return;
      const row = a.closest('li, tr, [class*="row"]') || a.parentElement;
      const img = a.querySelector('img');
      const name = (a.textContent.trim() || (img && (img.alt || img.title)) || a.title || `#${id}`).replace(/\s+/g, ' ').slice(0, 40);
      const text = (row.textContent || '').replace(/\s+/g, ' ').trim();
      const reasonEl = row.querySelector('[class*="reason"], [class*="description"]');
      // Strip the player's own name so a name like "BloodyX" can't trigger a match
      const reason = (reasonEl ? reasonEl.textContent : text.split(name).join(' ')).replace(/\s+/g, ' ').trim().slice(0, 120);
      const timeEl = row.querySelector('[class*="time"]');
      const time = timeEl ? timeEl.textContent.replace(/\s+/g, ' ').trim()
                          : ((text.match(/(\d+\s*h\s*)?\d+\s*m(in)?(\s*\d+\s*s)?/i) || [])[0] || '');
      const level = (text.match(/(?:Level|Lvl|LV)\s*:?\s*(\d+)/i) || [])[1] || '';
      seen.set(id, { id, name, reason, time, level, self: isSelfHosp(reason) });
      try { learnName(name, id); } catch {}
    });
    return [...seen.values()];
  }

  /* ---------------- merging ---------------- */
  function ingest() {
    const pg = pager();
    const page = pg.current;
    // Pages are swept last → 1, then back to the last page: that jump completes a loop
    const wrapped = (pg.last > 1 && page === pg.last && state.lastPage === 1) || (pg.last === 1 && state.lastPage === 1);
    if (wrapped) {
      state.cycle++;
      for (const id in state.players) {
        if (state.players[id].lastCycle < state.cycle - 1) delete state.players[id];
      }
    }
    state.lastPage = page;
    state.totalPages = pg.last;

    const now = Date.now();
    const onPage = readPlayers();
    const ids = new Set(onPage.map(p => p.id));
    for (const p of onPage) {
      if (!p.self) { delete state.players[p.id]; continue; }   // only self-hosp players are kept (saves storage)
      const old = state.players[p.id];
      const secs = parseSecs(p.time);
      const outAt = secs > 0 ? now + secs * 1000 : (old && old.outAt) || 0;
      state.players[p.id] = { ...p, lastCycle: state.cycle, seenAt: now, outAt };
    }
    // Anyone previously listed on this page but missing now has left hospital
    for (const id in state.players) {
      const p = state.players[id];
      if (p.page === page && !ids.has(+id)) delete state.players[id];
    }
    for (const p of onPage) if (state.players[p.id]) state.players[p.id].page = page;

    save();
    render();
    queueBazaars();
    queueFF();
  }

  /* ---------------- bazaar checks (Torn API) ---------------- */
  let bazQueue = [], bazRunning = false;

  function queueBazaars() {
    const now = Date.now();
    const want = Object.values(state.players)
      .filter(p => p.self && !overMax(p.id) && (!baz[p.id] || now - baz[p.id].t > BAZ_TTL))
      .map(p => p.id);
    for (const id of want) if (!bazQueue.includes(id)) bazQueue.push(id);
    runBazQueue();
  }

  async function runBazQueue() {
    if (bazRunning || !apiKey) return;
    bazRunning = true;
    while (bazQueue.length) {
      const id = bazQueue.shift();
      if (!state.players[id]) continue;
      try {
        // Activity, faction and exact hospital release time (bazaar data is no longer public in the API)
        const r = await fetch(`https://api.torn.com/user/${id}?selections=profile&key=${encodeURIComponent(apiKey)}&comment=HospScan`);
        const j = await r.json();
        if (j.error) {
          apiErr = `API error ${j.error.code}: ${j.error.error}`;
          if ([1, 2, 5, 10, 13, 16].includes(j.error.code)) { bazQueue = []; break; }  // bad key / rate limit: stop
        } else {
          const fac = j.faction || {};
          baz[id] = {
            t: Date.now(),
            activity: (j.last_action && j.last_action.status) || '',
            lastSeen: (j.last_action && j.last_action.relative) || '',
            facId: +fac.faction_id || 0, facName: fac.faction_name || '',
            revivable: j.revivable === undefined ? null : +j.revivable,
          };
          const until = j.status && +j.status.until;
          if (until && state.players[id]) state.players[id].outAt = until * 1000;
          apiErr = '';
          ls.set('ths_baz', baz);
          if (baz[id].facId && (!abroadHosp || warCheckOn())) await checkWar(baz[id].facId);
        }
      } catch (e) {
        apiErr = 'API: ' + (e.message || e);
      }
      render();
      await new Promise(res => setTimeout(res, BAZ_GAP_MS));
    }
    bazRunning = false;
    render();
  }

  /* ---------------- faction war check (Torn API v2) ---------------- */
  let wars = ls.get('ths_wars', {});   // facId -> { war: bool, label, t }
  async function checkWar(fid) {
    if (wars[fid] && Date.now() - wars[fid].t < WAR_TTL) return;
    await new Promise(res => setTimeout(res, BAZ_GAP_MS));
    try {
      const r = await fetch(`https://api.torn.com/v2/faction/${fid}/wars?key=${encodeURIComponent(apiKey)}&comment=HospBazaar`);
      const j = await r.json();
      if (j.error) { apiErr = `API error ${j.error.code}: ${j.error.error}`; return; }
      const w = j.wars || {};
      const now = Date.now() / 1000;
      const live = x => x && (!x.end || x.end > now) && !x.winner;
      const asList = x => Array.isArray(x) ? x : x ? Object.values(x) : [];
      const enemy = x => {
        const f = asList(x && x.factions).find(f => +f.id !== +fid);
        return f && f.name ? ` vs ${f.name}` : '';
      };
      let label = '';
      if (live(w.ranked)) label = 'Ranked war' + enemy(w.ranked);
      else if (asList(w.raids).some(live)) label = 'Raid' + enemy(asList(w.raids).find(live));
      else if (asList(w.territory).some(live)) label = 'Territory war';
      wars[fid] = { war: !!label, label, t: Date.now() };
      ls.set('ths_wars', wars);
    } catch (e) {
      apiErr = 'War check: ' + (e.message || e);
    }
  }

  /* ---------------- the button ---------------- */
  function nextPage() {
    if (locked) return;
    locked = true;
    setTimeout(() => { locked = false; render(); }, TAP_LOCK_MS);
    render();
    const pg = pager();
    // Go backwards: soonest-out players are on the last pages
    const target = pg.current <= 1 ? pg.last : pg.current - 1;
    const el = pg.byNum.get(target);
    if (el) { el.click(); return; }
    if (pg.hashOnly) { location.hash = `#start=${(target - 1) * 50}`; return; }
    location.reload();
  }

  /* ---------------- UI ---------------- */
  const style = document.createElement('style');
  style.textContent = `
  #ths-next{position:fixed;right:10px;bottom:80px;z-index:2147483646;width:72px;height:72px;border-radius:50%;border:0;background:#2b6cb0;color:#fff;font:700 13px Arial;box-shadow:0 3px 10px #0008;touch-action:manipulation}
  #ths-next:disabled{background:#4a5568}
  #ths-toggle{position:fixed;right:10px;bottom:160px;z-index:2147483646;border:0;border-radius:16px;background:#333;color:#fff;font:600 12px Arial;padding:7px 11px;box-shadow:0 2px 6px #0007}
  #ths{position:fixed;left:8px;right:92px;bottom:80px;z-index:2147483645;max-height:62vh;display:flex;flex-direction:column;background:#1f1f1f;color:#ddd;border:1px solid #0a3d2c;border-radius:8px;font:12px Arial;box-shadow:0 4px 14px #000a}
  #ths header{padding:7px 9px;border-bottom:1px solid #333;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px}
  #ths header b{color:#fff}
  #ths header button,#ths .keyrow button{background:#444;color:#ddd;border:0;border-radius:4px;padding:3px 7px;font-size:11px}
  #ths .keyrow{display:none;gap:6px;padding:6px 9px;border-bottom:1px solid #333;background:#262626}
  #ths .keyrow.on{display:flex}
  #ths .keyrow input{flex:1;min-width:0;background:#1a1a1a;color:#ddd;border:1px solid #444;border-radius:4px;padding:4px 6px;font:12px Arial}
  #ths .list{overflow-y:auto}
  #ths .sec{position:sticky;top:0;z-index:1;padding:6px 9px;font:700 11px Arial;letter-spacing:.4px;text-transform:uppercase;display:flex;justify-content:space-between;user-select:none}
  #ths .sec.hot{background:#22543d;color:#c6f6d5;border-bottom:2px solid #38a169}
  #ths .sec.self{background:#4a3b12;color:#fbd38d;border-bottom:1px solid #b7791f}
  #ths .sec.rest{background:#2d2d2d;color:#bbb;border-bottom:1px solid #444;cursor:pointer}
  #ths .row{display:flex;align-items:center;gap:6px;padding:6px 9px;border-bottom:1px solid #2a2a2a}
  #ths .row.hot{background:#1e3a24;border-left:3px solid #38a169}
  #ths .row.self{border-left:3px solid #b7791f}
  #ths .row a{color:#7fb3ff;text-decoration:none}
  #ths .grow{flex:1;min-width:0}
  #ths .name{font-weight:700;font-size:13px}
  #ths .meta{color:#999;font-size:11px;display:block;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #ths .tag{display:inline-block;margin-left:5px;padding:1px 5px;border-radius:3px;font:700 10px Arial;color:#fff;vertical-align:1px}
  #ths .btn{border-radius:3px;padding:3px 7px;color:#fff!important;white-space:nowrap}
  #ths .baz{background:#2f855a}
  #ths .atk{background:#9b2c2c}
  #ths .rev{background:#2c7a7b;color:#fff!important;border-radius:3px;padding:3px 7px;text-decoration:none}
  #ths .revon{color:#9ae6b4;font-weight:700}
  #ths .revoff{color:#999}
  #ths .mark{display:flex;gap:4px}
  #ths .mark button{flex:1;border:0;border-radius:3px;padding:3px 0;font:700 12px Arial;color:#fff;background:#2d3748}
  #ths .mark button[data-mark="open"]{background:#276749}
  #ths .mark button[data-mark="none"]{background:#4a5568}
  #ths .act{color:#ddd}
  #ths .act i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:0}
  #ths .war{color:#feb2b2;font-weight:700}
  #ths header button#ths-rw.on{background:#9b2c2c;color:#fff}
  #ths .ffmax{color:#bbb;font-size:11px;white-space:nowrap}
  #ths .ffmax input{width:52px;background:#1a1a1a;color:#fff;border:1px solid #555;border-radius:4px;padding:2px 4px;font:12px Arial}
  #ths .nofac{color:#888}
  #ths .btns{display:flex;flex-direction:column;gap:4px;align-items:stretch;text-align:center}
  #ths .cd{display:inline-block;margin-left:5px;padding:1px 5px;border-radius:3px;background:#2a4365;color:#bee3f8;font:700 11px monospace;vertical-align:1px}
  #ths .cd.soon{background:#744210;color:#fefcbf}
  #ths .cd.out{background:#9b2c2c;color:#fff}
  #ths .ff{display:inline-block;margin-left:5px;padding:1px 5px;border-radius:3px;color:#fff;font:700 11px Arial;vertical-align:1px}
  #ths .ffbs{color:#ddd;font-weight:400}
  #ths .empty{padding:8px 9px;color:#777;font-style:italic}
  #ths .gap{height:6px;background:#181818}
  #ths .foot{padding:5px 9px;border-top:1px solid #333;color:#999;font-size:11px}
  ${DONATE_CSS}
  ${BRAND_CSS}
  ${SETTINGS_CSS}
  ${XAN_CSS}
  #ths .err{color:#f56565}
  `;
  document.head.appendChild(style);

  const btn = Object.assign(document.createElement('button'), { id: 'ths-next' });
  const toggle = Object.assign(document.createElement('button'), { id: 'ths-toggle' });
  const panel = Object.assign(document.createElement('div'), { id: 'ths' });
  panel.innerHTML = `
    ${brandHTML('Catch the cash before it&#39;s banked')}<header><b id="ths-title"></b><button class="cp-gear" id="ths-gear" type="button" aria-expanded="false">&#9881; Settings</button></header><div class="cp-xan" id="ths-xan"></div>
    <div class="cp-set" id="ths-set">
      <div class="cp-row"><span class="cp-lbl">Max FF</span><label class="ffmax"><input id="ths-ffmax" type="number" inputmode="decimal" step="0.1" min="0" placeholder="off" aria-label="Max FF"></label><span class="cp-hint">hide anyone above this</span></div>
      <div class="cp-row"><span class="cp-lbl">Ranked war</span><button id="ths-rw" type="button"></button></div>
      <div class="cp-row" id="ths-warrow"><span class="cp-lbl">War check</span><button id="ths-war" type="button"></button><span class="cp-hint">abroad only</span></div>
      <div class="cp-row"><span class="cp-lbl">Closed</span><button id="ths-closed" type="button"></button><span class="cp-hint">closed or no bazaar</span></div>
      <div class="cp-row"><span class="cp-lbl">API key</span><button id="ths-keybtn" type="button">Change key</button></div>
      <div class="keyrow" id="ths-keyrow"><input id="ths-key" type="password" autocomplete="off" placeholder="Torn API key (Public is enough)"><button id="ths-keysave" type="button">Save</button></div>
      <div class="cp-row"><span class="cp-lbl">List</span><button id="ths-reset" type="button">Reset list</button></div>
      <div class="cp-h">Mug log</div>
      <div id="ths-mugs"></div>
      <div id="ths-upd">${updateHTML()}</div>
      <div class="cp-h">Storage</div>
      <div id="ths-store"></div>
    </div>
    <div class="list" id="ths-list"></div>
    <div class="foot" id="ths-foot"></div>${donateHTML()}`;
  document.body.append(panel, toggle, btn);

  const $ = id => panel.querySelector('#' + id);
  const keyRow = $('ths-keyrow');
  const setBox = $('ths-set'), gear = $('ths-gear');
  const setOpen = on => { setBox.classList.toggle('on', on); gear.classList.toggle('on', on); gear.setAttribute('aria-expanded', on ? 'true' : 'false'); render(); };
  gear.onclick = () => setOpen(!setBox.classList.contains('on'));
  wireMugClear($('ths-mugs'), () => render());
  mountXan($('ths-xan'));
  wireUpdate($('ths-upd'));
  wireStorage($('ths-store'), () => { ffCache = {}; baz = {}; wars = {}; render(); queueBazaars(); queueFF(); });
  $('ths-key').value = apiKey;
  if (!apiKey) { keyRow.classList.add('on'); setBox.classList.add('on'); gear.classList.add('on'); }

  btn.onclick = nextPage;
  toggle.onclick = () => { state.open = !state.open; save(); render(); };
  $('ths-keybtn').onclick = () => keyRow.classList.toggle('on');
  $('ths-keysave').onclick = () => {
    apiKey = $('ths-key').value.trim(); ls.set('ths_key', apiKey);
    baz = {}; ls.set('ths_baz', baz); apiErr = '';
    keyRow.classList.remove('on');
    queueBazaars();
  };
  $('ths-reset').onclick = () => { const o = state.open, rw = state.hideRW; state = fresh(); state.open = o; state.hideRW = rw; save(); ingest(); };
  $('ths-war').onclick = () => { TS.set('cp_abwar', warCheckOn() ? '0' : '1', true); render(); if (warCheckOn()) { for (const id in baz) if (baz[id].facId && !wars[baz[id].facId]) baz[id].t = 0; queueBazaars(); } };
  $('ths-rw').onclick = () => { state.hideRW = !state.hideRW; save(); render(); };
  $('ths-closed').onclick = () => { state.showClosed = !state.showClosed; save(); render(); };
  wireDonate(panel);
  const ffIn = $('ths-ffmax');
  if (maxFF() != null) ffIn.value = maxFF();
  let ffInT;
  ffIn.addEventListener('input', () => {
    clearTimeout(ffInT);
    ffInT = setTimeout(() => { TS.set('ths_ffmax', ffIn.value.trim(), true); render(); queueBazaars(); }, 300);
  });
  $('ths-list').addEventListener('click', e => {
    const mk = e.target.closest('[data-mark]');
    if (mk) {
      const all = ls.get('ths_bazseen', {});
      all[mk.dataset.id] = mk.dataset.mark === 'open' ? { open: true, items: 0, manual: true, t: Date.now() } : { open: false, items: 0, manual: true, t: Date.now() };
      ls.set('ths_bazseen', all);
      render();
      return;
    }
    if (e.target.closest('#ths-resthead')) { state.restOpen = !state.restOpen; save(); render(); }
  });

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Travelling: the hospital page is the local one ("Japanese Hospital", with a Travel Home button)
  let abroadHosp = '';
  function detectAbroadHosp() {
    if (abroadHosp) return;
    const heads = [...document.querySelectorAll('h4, .content-title, .title-black, [class*="title"]')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
    const m = (heads + ' | ' + document.title).match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?) Hospital\b/);
    const away = /Travel Home/i.test((main().textContent || '').slice(0, 20000));
    if (m && !/\b(Torn|City)\b/.test(m[1])) abroadHosp = m[0];
    else if (away) abroadHosp = 'Hospital abroad';
  }
  function render() {
    try { detectAbroadHosp(); } catch {}
    seen = ls.get('ths_bazseen', {});   // pick up bazaars you opened in another tab
    const pg = state.lastPage || 1, total = state.totalPages || 1;
    btn.disabled = locked;
    btn.innerHTML = state.lastPage === 1 && total > 1 && state.cycle === 0 && !Object.keys(state.players).length
      ? 'Start<br><span style="font-weight:400;font-size:11px">from last</span>'
      : `◀ Next<br><span style="font-weight:400;font-size:11px">${pg} / ${total}</span>`;
    toggle.textContent = state.open ? 'Hide list' : 'Show list';
    panel.style.display = state.open ? 'flex' : 'none';

    // Soonest out first; unknown times last
    // Revives on first (soonest out first), then revives off (soonest out first)
    const revH = p => baz[p.id] && baz[p.id].revivable === 1 ? 1 : 0;
    const byOut = (a, b) => (revH(b) - revH(a)) || ((a.outAt || Infinity) - (b.outAt || Infinity));
    const all = Object.values(state.players);
    const tooTough = p => overMax(p.id);
    const hiddenFF = all.filter(p => p.self && tooTough(p)).length;
    // Players whose faction is in a ranked war (known once their faction has been checked)
    const inRW = p => { if (abroadHosp && !warCheckOn()) return false; const b = baz[p.id], w = b && b.facId && wars[b.facId]; return !!(w && w.war && /^Ranked war/.test(w.label || '')); };
    const hiddenRW = state.hideRW ? all.filter(p => p.self && !tooTough(p) && inRW(p)).length : 0;
    const selfs = all.filter(p => p.self && !tooTough(p) && !(state.hideRW && inRW(p)));
    const mugs = getMugs();
    if (setBox.classList.contains('on')) { $('ths-mugs').innerHTML = mugLogHTML(mugs); $('ths-store').innerHTML = storageHTML(); }
    const rwBtn = $('ths-rw');
    rwBtn.textContent = state.hideRW ? 'Ranked war: hidden' : 'Ranked war: shown';
    rwBtn.classList.toggle('on', !!state.hideRW);
    // Abroad (e.g. "Japanese Hospital" while travelling): just self-hosp, soonest out first, no bazaar checks
    const abroadOf = () => abroadHosp;
    const hot = abroadHosp ? [] : selfs.filter(p => bazState(p.id) === 'open').sort(byOut);
    const unchecked = abroadHosp ? [] : selfs.filter(p => bazState(p.id) === 'unknown').sort(byOut);
    const closed = abroadHosp ? [] : selfs.filter(p => bazState(p.id) === 'closed').sort(byOut);
    const selfCount = selfs.length - (state.showClosed ? 0 : closed.length);
    $('ths-closed').closest('.cp-row').style.display = abroadHosp ? 'none' : '';
    $('ths-warrow').style.display = abroadHosp ? '' : 'none';
    $('ths-war').textContent = warCheckOn() ? 'On' : 'Off';
    $('ths-rw').closest('.cp-row').style.display = abroadHosp && !warCheckOn() ? 'none' : '';
    const cBtn = $('ths-closed');
    cBtn.textContent = state.showClosed ? 'Shown' : 'Hidden';

    $('ths-title').textContent = abroadHosp ? `${abroadHosp} · self-hosp · ${selfCount}` : `Self-hosp · ${selfCount} · open: ${hot.length}`;

    const agoMin = t => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? 'just now' : m + 'm ago'; };
    const bazTag = p => {
      if (!p.self || abroadOf(p)) return '';
      const st = bazState(p.id), v = seen[p.id];
      if (st === 'open') return `<span class="tag" style="background:#2f855a">${v.empty ? 'open · empty' : v.items ? v.items + ' item' + (v.items === 1 ? '' : 's') : 'open'} · ${agoMin(v.t)}</span>`;
      if (st === 'closed' && v.manual) return `<span class="tag" style="background:#555">marked closed · ${agoMin(v.t)}</span>`;
      if (st === 'closed') return `<span class="tag" style="background:#555">closed · ${agoMin(v.t)}</span>`;
      return '<span class="tag" style="background:#4a5568">not checked</span>';
    };
    const ffTag = id => {
      if (!ffKeyNow()) return '';
      const s = ffCache[id];
      if (!s) return '<span class="ff" style="background:#3a3a3a">FF …</span>';
      if (s.ff == null) return '<span class="ff" style="background:#3a3a3a">FF ?</span>';
      return `<span class="ff" style="background:${ffColour(s.ff)}">FF ${(+s.ff).toFixed(2)}${s.bs ? ` <span class="ffbs">${esc(s.bs)}</span>` : ''}</span>`;
    };
    const actTag = p => {
      const b = baz[p.id];
      if (!b || !b.activity) return '';
      const a = b.activity.toLowerCase();
      const col = a === 'online' ? '#38a169' : a === 'idle' ? '#d69e2e' : '#718096';
      return `<span class="act" title="${esc(b.lastSeen)}"><i style="background:${col}"></i>${esc(b.activity)}</span>`;
    };
    const warTag = p => {
      const b = baz[p.id];
      if (!b || !b.facId) return b ? '<span class="nofac">No faction</span>' : '';
      const w = wars[b.facId];
      const fname = esc(b.facName || 'Faction');
      if (abroadHosp && !warCheckOn()) return `<span class="nofac">${fname}</span>`;
      if (!w) return `<span class="nofac">${fname} · war check…</span>`;
      return w.war ? `<span class="war">⚔ ${fname} · ${esc(w.label)}</span>` : `<span class="nofac">${fname} · not at war</span>`;
    };
    const cdTag = p => p.outAt ? `<span class="cd" data-out="${p.outAt}">${fmtLeft(p.outAt - Date.now())}</span>` : '';
    const row = (p, cls) => `
      <div class="row ${cls}">
        <div class="grow">
          <a class="name" href="/profiles.php?XID=${p.id}" target="_blank" rel="noopener">${esc(p.name)}</a>${ffTag(p.id)}${cdTag(p)}${bazTag(p)}${mugTag(p.id, mugs)}
          <span class="meta">${actTag(p)}${p.level ? ' · Level ' + esc(p.level) : ''} · ${/ipecac/i.test(p.reason) ? 'Ipecac' : 'Blood bag'}${baz[p.id] && baz[p.id].revivable === 1 ? ' · <span class="revon">Revives on</span>' : baz[p.id] && baz[p.id].revivable === 0 ? ' · <span class="revoff">Revives off</span>' : ''}</span>
          <span class="meta">${warTag(p)}</span>
        </div>
        <div class="btns">
          <a class="btn atk" href="/loader.php?sid=attack&user2ID=${p.id}" target="_blank" rel="noopener">Attack</a>
          ${baz[p.id] && baz[p.id].revivable === 1 ? `<a class="btn rev" href="/profiles.php?XID=${p.id}" target="_blank" rel="noopener" title="Opens their profile: tap Revive there">Revive</a>` : ''}
          ${p.self && !abroadOf(p) ? `<a class="btn baz" href="/bazaar.php?userId=${p.id}" target="_blank" rel="noopener">Bazaar</a>
` : ''}
        </div>
      </div>`;

    let html = '';
    if (!all.length) {
      html = '<div class="empty">Tap Next to start building the list.</div>';
    } else if (!selfCount) {
      html = '<div class="empty">No self-hosp players found yet. Keep tapping Next.</div>';
    } else if (abroadHosp) {
      html += `<div class="sec self"><span>Revives on first · soonest out</span><span>${selfs.length}</span></div>`;
      html += selfs.slice().sort(byOut).map(p => row(p, 'self')).join('');
    } else {
      html += `<div class="sec hot"><span>🟢 Bazaar open</span><span>${hot.length}</span></div>`;
      html += hot.length ? hot.map(p => row(p, 'hot')).join('') : '<div class="empty">None confirmed yet. Tap Bazaar on someone below to check.</div>';
      html += `<div class="gap"></div><div class="sec self"><span>Not checked · tap Bazaar</span><span>${unchecked.length}</span></div>`;
      html += unchecked.length ? unchecked.map(p => row(p, 'self')).join('') : '<div class="empty">None.</div>';
      if (closed.length && state.showClosed) {
        html += `<div class="gap"></div><div class="sec rest" id="ths-resthead"><span>${state.restOpen ? '▾' : '▸'} Closed / no bazaar</span><span>${closed.length}</span></div>`;
        if (state.restOpen) html += closed.map(p => row(p, '')).join('');
      }
    }
    $('ths-list').innerHTML = html;
    tick();

    const pending = ` · ${selfCount} self-hosp shown` + (hiddenFF ? ` · ${hiddenFF} hidden (FF over ${maxFF()})` : '') + (hiddenRW ? ` · ${hiddenRW} hidden (ranked war)` : '') + (!state.showClosed && closed.length ? ` · ${closed.length} closed hidden` : '') + (bazQueue.length ? ` · loading details ${bazQueue.length}` : '');
    $('ths-foot').innerHTML = esc(`${state.cycle === 0 ? 'First loop' : 'Loop ' + (state.cycle + 1)} · page ${pg} of ${total}${pending} · v${SCRIPT_VERSION}`) +
      (apiErr ? `<br><span class="err">${esc(apiErr)}</span>` : '') +
      (ffErr ? `<br><span class="err">${esc(ffErr)}</span>` : '') +
      (TS.err ? `<br><span class="err">${esc(TS.err)}</span>` : '');
  }

  /* ---------------- live countdown (updates the timers only, every second) ---------------- */
  function tick() {
    const now = Date.now();
    panel.querySelectorAll('[data-out]').forEach(el => {
      const left = +el.dataset.out - now;
      el.textContent = fmtLeft(left);
      el.classList.toggle('soon', left > 0 && left <= 5 * 60000);
      el.classList.toggle('out', left <= 0);
    });
  }
  let seenRaw = '';
  setInterval(() => {
    tick();
    // Pick up bazaar results saved from another tab
    let raw = ''; try { raw = lsGet('ths_bazseen') || ''; } catch {}
    if (raw !== seenRaw) { seenRaw = raw; render(); }
    // Drop people who have been out of hospital for over a minute
    const now = Date.now();
    let changed = false;
    for (const id in state.players) {
      const o = state.players[id].outAt;
      if (o && now - o > 60000) { delete state.players[id]; changed = true; }
    }
    if (changed) { save(); render(); }
  }, 1000);

  /* ---------------- watch for page changes ---------------- */
  let t;
  new MutationObserver(muts => {
    if (muts.every(m => panel.contains(m.target) || m.target === btn || m.target === toggle)) return;
    clearTimeout(t);
    t = setTimeout(ingest, 250);
  }).observe(main(), { childList: true, subtree: true });
  window.addEventListener('hashchange', () => { clearTimeout(t); t = setTimeout(ingest, 400); });

  ingest();
});

}
if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
