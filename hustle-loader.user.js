// ==UserScript==
// @name         J_Sim Hustle (auto-updating)
// @namespace    jsim-hustle-loader
// @version      1.0
// @description  Loads the latest J_Sim Hustle from GitHub, so updates arrive by themselves
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      weav3r.dev
// @connect      api.torn.com
// @connect      raw.githubusercontent.com
// @run-at       document-end
// ==/UserScript==

/*
 * This small script fetches J_Sim Hustle from the address below and keeps a copy on your device,
 * so it starts instantly and still works if the address can't be reached.
 * It checks for a newer copy every few minutes; a new version is used from the next page you open.
 * Your API key stays on your device: PDA puts it into this loader and the loader hands it straight to J_Sim Hustle.
 * GM_xmlhttpRequest is passed on too, so Hustle can still read weav3r's "try again in N seconds" replies.
 */
/* global GM_xmlhttpRequest, PDA_httpGet, PDA_evaluateJavascript */
(function () {
  'use strict';
  if (window.__hsLoader) return;
  window.__hsLoader = true;
  var SRC = 'https://raw.githubusercontent.com/JonSim28/jsim-cutpurse/main/jsim-hustle.user.js';
  var KEY = '###PDA-APIKEY###';
  var GM = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : undefined;
  var ran = false, cached = null, errs = [];
  var NAME = 'J_Sim Hustle';
  function note(m) { errs.push(m); try { console.warn(NAME + ' loader:', m); } catch (e) { /* ignore */ } }
  // A copy kept in this tab wins: it is only made when torn.com's storage was too full to keep the newer download
  try { cached = sessionStorage.getItem('hs_code') || localStorage.getItem('hs_code'); } catch (e) { /* storage blocked */ }
  // Save a new download. torn.com's storage is shared with other scripts and can fill up:
  // then swap out the old copy to make room, or keep the new one in this tab.
  function keep(t) {
    try { localStorage.setItem('hs_code', t); try { sessionStorage.removeItem('hs_code'); } catch (e) { /* ignore */ } return; } catch (e) { /* full */ }
    try { localStorage.removeItem('hs_code'); localStorage.setItem('hs_code', t); try { sessionStorage.removeItem('hs_code'); } catch (e) { /* ignore */ } return; } catch (e) { /* still full */ }
    try { sessionStorage.setItem('hs_code', t); } catch (e) { note('no room to keep the new version'); }
  }

  function started() { try { return !!document.documentElement.dataset.jsimHustle; } catch (e) { return false; } }
  function viaGlobals() { window.__hsPdaKey = KEY; }
  function clearGlobals() { window.__hsPdaKey = undefined; }
  function run(code) {
    if (ran || !code) return;
    ran = true;
    // 1) plain eval
    try {
      new Function('__hsPdaKey', 'GM_xmlhttpRequest', code)(KEY, GM);
      return;
    } catch (e) {
      var why = String(e && (e.name + ': ' + e.message));
      if (!/unsafe-eval|Content Security|EvalError|call to Function|Refused/i.test(why)) { note('script error: ' + why); return; }
      note('eval blocked');
    }
    // 2) a script tag
    viaGlobals();
    try {
      var s = document.createElement('script');
      s.textContent = code;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    } catch (e) { note('script tag failed: ' + e.message); }
    if (started()) { clearGlobals(); return; }
    // 3) TornPDA's own evaluator (not limited by the page's security rules)
    if (typeof PDA_evaluateJavascript === 'function') {
      note('script tag blocked, using PDA');
      try {
        Promise.resolve(PDA_evaluateJavascript(code)).then(function () { setTimeout(clearGlobals, 3000); }, function (e) { note('PDA evaluate failed: ' + e); });
      } catch (e) { note('PDA evaluate failed: ' + e.message); }
    } else note('script tag blocked and PDA evaluator missing');
  }

  // Hustle runs on every Torn page: if it hasn't started after 12 seconds, say why on screen instead of failing silently
  setTimeout(function () {
    if (started()) return;
    if (!errs.length) note(cached ? 'cached copy did not start' : 'still waiting for the download');
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:8px;right:8px;bottom:80px;z-index:2147483647;background:#7a1010;color:#fff;font:13px/1.4 -apple-system,Arial,sans-serif;padding:10px 12px;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.5)';
    d.textContent = NAME + ' could not start: ' + errs.join(' | ') + '. Tap to close, and send Claude a screenshot.';
    d.addEventListener('click', function () { d.remove(); });
    (document.body || document.documentElement).appendChild(d);
  }, 12000);

  function got(t) {
    t = String(t || '');
    if (t.indexOf('JSimHustle') < 0 || t.length < 20000) { note('download was not the script (' + t.length + ' chars: ' + t.slice(0, 40).replace(/\s+/g, ' ') + ')'); return; }
    if (t !== cached) keep(t);
    run(t); // only does anything on the very first install; otherwise the new copy starts on the next page
  }

  run(cached);

  var last = 0;
  try { last = +localStorage.getItem('hs_code_chk') || 0; } catch (e) { /* ignore */ }
  if (!cached || Date.now() - last > 5 * 60e3) {
    try { localStorage.setItem('hs_code_chk', String(Date.now())); } catch (e) { /* ignore */ }
    var url = SRC + (SRC.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now();
    var viaPda = function (why) {
      if (typeof PDA_httpGet !== 'function') return;
      PDA_httpGet(url).then(function (r) { got(r && typeof r === 'object' ? (r.responseText || r.body || r.data || '') : r); }, function (e2) { note('PDA download failed (' + e2 + ')'); });
    };
    var viaGm = function (e) {
      note('download failed (' + (e && e.message || e) + ')');
      if (!GM) return viaPda();
      try {
        GM({ method: 'GET', url: url, timeout: 20000,
          onload: function (r) { if (r.status >= 200 && r.status < 300) got(r.responseText); else { note('GM download HTTP ' + r.status); viaPda(); } },
          onerror: function () { note('GM download failed'); viaPda(); },
          ontimeout: function () { note('GM download timed out'); viaPda(); } });
      } catch (e3) { note('GM download failed (' + e3.message + ')'); viaPda(); }
    };
    fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(got, viaGm);
  }
})();
