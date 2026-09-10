/* FC 記帳本 — 純前端、離線可用、資料存於 localStorage */
(function () {
  'use strict';

  var STORE_KEY = 'fcLedger.v1';
  var THEME_KEY = 'fcLedger.theme';
  var VERSION = '2.7.1';
  var PALETTE = ['--c1','--c2','--c3','--c4','--c5','--c6','--c7','--c8','--c9'];

  /* ─────────────── 小工具 ─────────────── */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function money(n) { return Math.round(n).toLocaleString('en-US'); }
  function money2(n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function color(i) { return 'var(' + PALETTE[i % PALETTE.length] + ')'; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* 全形 → 半形，貼上帳單時很需要 */
  function toHalf(s) {
    return String(s).replace(/[！-～]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/　/g, ' ');
  }

  /* ─────────────── 日期（含民國） ─────────────── */
  function toROC(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    if (p.length !== 3) return iso;
    return (Number(p[0]) - 1911) + '/' + p[1] + '/' + p[2];
  }
  // 接受 2026-04-06、2026/4/6、115/04/06、1150406、8/6、2026.04.06
  function toISO(raw) {
    if (!raw) return '';
    var s = toHalf(raw).trim().replace(/[.年月]/g, '/').replace(/日/g, '');
    var m = s.match(/^(\d{3})(\d{2})(\d{2})$/);          // 1150406
    if (!m) m = s.match(/^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (!m) {
      var mm = s.match(/^(\d{1,2})[\/-](\d{1,2})$/);      // 08/06 → 當年（民國 115）
      if (!mm) return '';
      m = [null, String(new Date().getFullYear() - 1911), mm[1], mm[2]];
    }
    var y = Number(m[1]);
    if (y < 1911) y += 1911;
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return y + '-' + pad(Number(m[2])) + '-' + pad(Number(m[3]));
  }
  function ymOf(iso) { return iso ? iso.slice(0, 7) : ''; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }
  function addMonths(iso, n) {
    var p = iso.split('-'), d = new Date(Number(p[0]), Number(p[1]) - 1 + n, Number(p[2]));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysInMonth(ym) {
    var p = ym.split('-');
    return new Date(Number(p[0]), Number(p[1]), 0).getDate();
  }
  function rocYM(ym) { return (Number(ym.slice(0, 4)) - 1911) + '/' + ym.slice(5); }

  /* ─────────────── 狀態 ─────────────── */
  var db = { version: 2, records: [], categories: [], cards: [], cardMeta: {},
             installments: [], subs: [], budget: null };
  var ui = { tab: 'dash', mode: 'month', ym: ymOf(todayISO()), year: todayISO().slice(0, 4),
             editingId: null, allPeriods: false };
  var pasteDraft = [];

  function defaultBudget() { return clone(window.SEED.budget); }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) {}
    if (raw) {
      try {
        var d = JSON.parse(raw);
        db.records = Array.isArray(d.records) ? d.records : [];
        db.categories = (d.categories && d.categories.length) ? d.categories : window.SEED.categories.slice();
        db.cards = (d.cards && d.cards.length) ? d.cards : window.SEED.cards.slice();
        db.installments = Array.isArray(d.installments) ? d.installments : clone(window.SEED.installments);
        db.subs = Array.isArray(d.subs) ? d.subs : clone(window.SEED.subs);
        db.cardMeta = d.cardMeta || clone(window.SEED.cardMeta);
        db.budget = d.budget || defaultBudget();
        if (!db.budget.excludeCats) db.budget.excludeCats = [];
        if (db.budget.estimatePending == null) db.budget.estimatePending = true;
        return;
      } catch (e) {}
    }
    seed();
  }
  var CARD_RENAME = {
    '台新Richart 3208':      '台新 Richart JCB 3208',
    '台新Richart 0602':      '台新 Richart Visa 0602',
    '台新Richart 6209':      '台新 Richart 萬事達 6209',
    '寰宇卡 2007':           '新光寰宇 Visa 2007',
    '國泰CUBE 3624':         '國泰 CUBE Visa 3624',
    '國泰CUBE 2225':         '國泰蝦皮萬事達 2225',
    '聯邦M悠遊鈔 0206':      '聯邦 M 卡萬事達 0206',
    '聯邦賴點卡 9908':        '聯邦幫賴點卡 Visa 9908',
    'LINE Bank 1308':         '聯邦 LINE Bank Visa 1308',
    '4511 卡':               '中信 All Me 萬事達 4511',
    '6357 卡':               '中信 LINE Pay JCB 6357',
    '富邦MASTER 6848':       '富邦 momo 卡萬事達 6848',
    '富邦MASTER 0969':       '富邦 Costco 萬事達 0969'
  };
  function migrateCardNames() {
    var changed = false;
    db.cards = db.cards.map(function(c) {
      var n = CARD_RENAME[c];
      if (n) { changed = true; return n; }
      return c;
    });
    db.records.forEach(function(r) {
      var n = CARD_RENAME[r.card];
      if (n) { r.card = n; changed = true; }
    });
    Object.keys(CARD_RENAME).forEach(function(old) {
      if (db.cardMeta && db.cardMeta[old]) {
        db.cardMeta[CARD_RENAME[old]] = db.cardMeta[old];
        delete db.cardMeta[old];
        changed = true;
      }
    });
    if (changed) save();
  }

  function seed() {
    db.records = window.SEED.records.map(function (r) { var c = clone(r); c.id = uid(); return c; });
    db.categories = window.SEED.categories.slice();
    db.cards = window.SEED.cards.slice();
    db.installments = clone(window.SEED.installments);
    db.subs = clone(window.SEED.subs);
    db.cardMeta = clone(window.SEED.cardMeta);
    db.budget = defaultBudget();
    save();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
    catch (e) { toast('儲存失敗，瀏覽器空間可能已滿'); }
    if (gistAuto() && gistToken()) syncToGist();
  }

  /* ─────────────── Gist 雲端同步 ─────────────── */
  var GIST_TOKEN_KEY = 'fcLedger.gistToken';
  var GIST_ID_KEY   = 'fcLedger.gistId';
  var GIST_AUTO_KEY = 'fcLedger.gistAuto';
  var GIST_FILE     = 'fc-ledger-data.json';

  function gistToken() { try { return (localStorage.getItem(GIST_TOKEN_KEY) || '').replace(/[^\x20-\x7E]/g, '').trim(); } catch(e) { return ''; } }
  function gistId()    { try { return (localStorage.getItem(GIST_ID_KEY)    || '').replace(/[^\x20-\x7E]/g, '').trim(); } catch(e) { return ''; } }
  function gistAuto()  { try { return localStorage.getItem(GIST_AUTO_KEY) === '1'; } catch(e) { return false; } }

  function setSyncStatus(msg, ok) {
    var el = $('#syncStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.color = ok === false ? 'var(--danger)' : (ok ? '#16a34a' : '');
  }

  function syncToGist() {
    var token = gistToken();
    if (!token) { setSyncStatus('請先填入 Personal Access Token', false); return Promise.reject('no token'); }
    var id = gistId();
    var payload = JSON.stringify({
      files: { 'fc-ledger-data.json': { content: JSON.stringify(db) } },
      description: 'FC 記帳本資料',
      public: false
    });
    setSyncStatus('上傳中…');
    return fetch(id ? 'https://api.github.com/gists/' + id : 'https://api.github.com/gists', {
      method: id ? 'PATCH' : 'POST',
      headers: {
        'Authorization': 'token ' + token,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: payload
    }).then(function(r) {
      if (!r.ok) return r.text().then(function(t) { throw new Error('HTTP ' + r.status + '：' + t.slice(0,80)); });
      return r.json();
    }).then(function(data) {
      try { localStorage.setItem(GIST_ID_KEY, data.id); } catch(e) {}
      setSyncStatus('已上傳 ' + new Date().toLocaleTimeString('zh-TW') + '　Gist: ' + data.id.slice(0, 8) + '…', true);
      toast('☁ 已同步到雲端');
    }).catch(function(e) {
      setSyncStatus('上傳失敗：' + e.message, false);
      toast('同步失敗');
    });
  }

  function syncFromGist() {
    var token = gistToken();
    var id = gistId();
    if (!token) { setSyncStatus('請先填入 Personal Access Token', false); return; }
    if (!id)    { setSyncStatus('尚未上傳過，請先點「立即上傳」建立 Gist', false); return; }
    setSyncStatus('下載中…');
    fetch('https://api.github.com/gists/' + id, {
      headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' }
    }).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(data) {
      var file = data.files && data.files[GIST_FILE];
      if (!file) throw new Error('找不到 ' + GIST_FILE);
      if (file.truncated && file.raw_url) return fetch(file.raw_url).then(function(r) { return r.text(); });
      return file.content || '';
    }).then(function(content) {
      var d = JSON.parse(content);
      if (!Array.isArray(d.records)) throw new Error('資料格式錯誤');
      db.records = d.records;
      if (d.categories && d.categories.length) db.categories = d.categories;
      if (d.cards && d.cards.length) db.cards = d.cards;
      if (Array.isArray(d.installments)) db.installments = d.installments;
      if (Array.isArray(d.subs)) db.subs = d.subs;
      if (d.cardMeta) db.cardMeta = d.cardMeta;
      if (d.budget) { db.budget = d.budget; if (!db.budget.excludeCats) db.budget.excludeCats = []; }
      save(); refreshOptions(); renderAll();
      setSyncStatus('已從雲端載入 ' + new Date().toLocaleTimeString('zh-TW'), true);
      toast('⬇ 已從雲端同步');
    }).catch(function(e) {
      setSyncStatus('下載失敗：' + e.message, false);
      toast('下載失敗');
    });
  }

  /* ─────────────── 密碼鎖 ─────────────── */
  var PIN_KEY = 'fcLedger.pinHash';

  function getPinHash() { try { return localStorage.getItem(PIN_KEY) || ''; } catch(e) { return ''; } }

  function hashPin(pin) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin)).then(function(buf) {
      return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2,'0'); }).join('');
    });
  }

  function lockApp() {
    $('#lockScreen').hidden = false;
    $('#lockPin').value = '';
    $('#lockMsg').textContent = '';
    setTimeout(function() { try { $('#lockPin').focus(); } catch(e) {} }, 100);
  }

  function unlockApp() {
    $('#lockScreen').hidden = true;
    renderAll();
  }

  function renderPinSection() {
    var has = !!getPinHash();
    $('#pinSetBtn').textContent = has ? '修改密碼' : '設定密碼';
    $('#pinRemoveBtn').hidden = !has;
    $('#pinLockNow').hidden = !has;
    $('#pinStatus').textContent = has ? '密碼已設定 ✓' : '';
    $('#pinStatus').style.color = has ? '#16a34a' : '';
  }

  /* ─────────────── 計算 ─────────────── */

  /* 每個幣別用「自己歷史上實際入帳的紀錄」算出平均匯率與手續費率 */
  function rates() {
    var m = {};
    db.records.forEach(function (r) {
      if (r.twd == null || !r.currency || !num(r.amount)) return;
      if (!m[r.currency]) m[r.currency] = { twd: 0, amt: 0, fee: 0 };
      m[r.currency].twd += num(r.twd);
      m[r.currency].amt += num(r.amount);
      m[r.currency].fee += num(r.fee);
    });
    return m;
  }

  /* 本幣留空時補一個金額。台幣消費的原幣就是台幣，直接用、不必估；
     外幣才用上面那組平均匯率推算——不推的話預算會看起來比實際寬鬆。 */
  function estimated(r) {
    if (r.twd != null || !num(r.amount)) return null;
    var cur = (r.currency || 'TWD').toUpperCase();
    if (cur === 'TWD') return { twd: num(r.amount), fee: num(r.fee), rate: 1, exact: true };
    var m = rates()[cur];
    if (!m || !m.amt) return null;
    var rate = m.twd / m.amt;
    var twd = num(r.amount) * rate;
    return { twd: twd, fee: m.twd ? twd * (m.fee / m.twd) : 0, rate: rate, exact: false };
  }

  function total(r) {
    if (r.twd == null) {
      var e = estimated(r);
      if (!e) return 0;
      // 開關只管「估算」，台幣那種確定金額一律計入
      if (!e.exact && db.budget && db.budget.estimatePending === false) return 0;
      return e.twd + e.fee;
    }
    return num(r.twd) + num(r.fee);
  }

  /* ── 帳單週期 ──
     信用卡的一筆消費會經過三個日子：消費日 → 入帳日 → 出現在某一期帳單。
     結帳日之後刷的會落到下一期，所以「這個月刷了多少」和「這期帳單多少」是兩回事。 */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function cardMeta(card) {
    return (db.cardMeta && db.cardMeta[card]) || { close: 31, due: 15, guess: true };
  }
  /* 依入帳日與該卡結帳日，決定落在哪一期帳單（回傳該期的帳單月） */
  function billYm(r) {
    if (!r.postDate) return '';
    var c = cardMeta(r.card).close;
    var y = Number(r.postDate.slice(0, 4)), m = Number(r.postDate.slice(5, 7)), d = Number(r.postDate.slice(8));
    if (d > c) { m++; if (m > 12) { m = 1; y++; } }
    return y + '-' + pad2(m);
  }
  /* 該卡今天之前最近的一次結帳日 */
  function lastClose(card) {
    var c = Math.min(cardMeta(card).close, 28), t = todayISO();
    var thisM = t.slice(0, 8) + pad2(c);
    return t >= thisM ? thisM : addMonths(thisM, -1);
  }
  function nextClose(card) { return addMonths(lastClose(card), 1); }

  /* billed    已經出現在某一期帳單
     upcoming  結帳日之後才刷的，會進下一期
     unmatched 消費日早於結帳日、照理已出帳，但入帳日還空著 → 該去對帳單了 */
  function billState(r) {
    if (r.postDate) return 'billed';
    return (r.date && r.date > lastClose(r.card)) ? 'upcoming' : 'unmatched';
  }
  function pendingRecords() {
    return db.records.filter(function (r) { return billState(r) !== 'billed'; })
      .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
  }

  function inPeriod(r) {
    if (ui.mode === 'all') return true;
    if (ui.mode === 'year') return (r.date || '').slice(0, 4) === ui.year;
    return ymOf(r.date) === ui.ym;
  }
  function periodRecords() { return db.records.filter(inPeriod); }

  function groupSum(list, keyFn) {
    var map = {};
    list.forEach(function (r) {
      var k = keyFn(r) || '未分類';
      map[k] = (map[k] || 0) + total(r);
    });
    return Object.keys(map).map(function (k) { return { name: k, value: map[k] }; })
      .filter(function (r) { return r.value !== 0; })
      .sort(function (a, b) { return b.value - a.value; });
  }

  function installMonthly() {
    return db.installments.reduce(function (a, i) { return a + num(i.monthly) + num(i.interest); }, 0);
  }
  function installRemaining() {
    return db.installments.reduce(function (a, i) { return a + num(i.remaining); }, 0);
  }
  function fixedTotal() {
    return (db.budget.fixed || []).reduce(function (a, f) { return a + num(f.amount); }, 0);
  }
  function disposable() {
    return num(db.budget.income) - fixedTotal() - installMonthly() - num(db.budget.savings);
  }
  function isExcluded(cat) {
    return (db.budget.excludeCats || []).indexOf(cat) > -1;
  }

  /* ─────────────── 圖表 ─────────────── */
  function renderBars(el, rows) {
    if (!rows.length) { el.innerHTML = '<p class="empty">這段期間沒有資料</p>'; return; }
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); })) || 1;
    el.innerHTML = rows.map(function (r, i) {
      var pct = Math.max(2, (Math.abs(r.value) / max) * 100);
      return '<div class="bar-row">' +
        '<span class="bar-name" title="' + esc(r.name) + '">' + esc(r.name) + '</span>' +
        '<span class="bar-track"><span class="bar-fill" style="width:' + pct.toFixed(1) + '%;background:' + color(i) + '"></span></span>' +
        '<span class="bar-val">' + money(r.value) + '</span></div>';
    }).join('');
  }

  function renderDonut(el, legendEl, rows) {
    // 負數（回饋折抵）畫不成扇形，但中心要顯示真正的淨額，否則會跟上面的總支出對不起來
    var credits = rows.filter(function (r) { return r.value < 0; });
    var creditSum = credits.reduce(function (a, r) { return a + r.value; }, 0);
    rows = rows.filter(function (r) { return r.value > 0; });
    var sum = rows.reduce(function (a, r) { return a + r.value; }, 0);
    var net = sum + creditSum;
    if (!sum) { el.innerHTML = ''; legendEl.innerHTML = '<li class="empty">沒有資料</li>'; return; }
    var R = 60, C = 2 * Math.PI * R, off = 0, segs = '';
    rows.forEach(function (r, i) {
      var len = (r.value / sum) * C;
      segs += '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + color(i) + '" stroke-width="19"' +
        ' stroke-dasharray="' + Math.max(0, len - 1.5).toFixed(2) + ' ' + (C - len + 1.5).toFixed(2) + '"' +
        ' stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)"></circle>';
      off += len;
    });
    el.innerHTML = '<svg viewBox="0 0 140 140" role="img" aria-label="分類佔比">' + segs +
      '<text x="70" y="66" text-anchor="middle" font-size="10" fill="currentColor" opacity=".6">合計</text>' +
      '<text x="70" y="82" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">' + money(net) + '</text></svg>';
    legendEl.innerHTML = rows.map(function (r, i) {
      return '<li><span class="dot" style="background:' + color(i) + '"></span>' +
        '<span class="lg-name">' + esc(r.name) + '</span>' +
        '<span class="lg-val">' + money(r.value) + '　' + ((r.value / sum) * 100).toFixed(0) + '%</span></li>';
    }).join('') +
      (creditSum ? '<li style="opacity:.7;border-top:1px solid var(--line);margin-top:4px;padding-top:6px">' +
        '<span class="dot" style="background:var(--ok)"></span>' +
        '<span class="lg-name">' + credits.map(function (r) { return esc(r.name); }).join('、') + '</span>' +
        '<span class="lg-val">' + money(creditSum) + '</span></li>' : '');
  }

  function renderMonthChart(el) {
    var map = {};
    db.records.forEach(function (r) {
      if (!r.date) return;
      map[ymOf(r.date)] = (map[ymOf(r.date)] || 0) + total(r);
    });
    var keys = Object.keys(map).sort();
    if (!keys.length) { el.innerHTML = '<p class="empty">沒有資料</p>'; return; }
    var all = [], cur = keys[0] + '-01', last = keys[keys.length - 1] + '-01', guard = 0;
    while (cur <= last && guard++ < 240) { all.push(cur.slice(0, 7)); cur = addMonths(cur, 1); }
    var show = all.slice(-12);
    var cap = disposable();
    var max = Math.max(cap, Math.max.apply(null, show.map(function (k) { return map[k] || 0; }))) || 1;

    var W = 320, H = 138, pad = 16, bw = (W - pad * 2) / show.length, base = H - 22;
    var capY = base - (cap / max) * (H - 44);
    var bars = show.map(function (k, i) {
      var v = map[k] || 0;
      var h = Math.max(v ? 3 : 0, (v / max) * (H - 44));
      var x = pad + i * bw + bw * 0.16, w = bw * 0.68, y = base - h;
      var on = (ui.mode === 'month' && k === ui.ym);
      var over = cap > 0 && v > cap;
      return '<g><rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) +
        '" height="' + h.toFixed(1) + '" rx="3" fill="' + (over ? 'var(--danger)' : 'var(--c1)') +
        '" opacity="' + (on ? 1 : .45) + '"></rect>' +
        '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" text-anchor="middle" font-size="7.5" fill="currentColor" opacity=".75">' +
        (v ? money(v) : '') + '</text>' +
        '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="8" fill="currentColor" opacity=".55">' +
        Number(k.slice(5)) + '月</text></g>';
    }).join('');
    var capLine = cap > 0 ? '<line x1="' + pad + '" y1="' + capY.toFixed(1) + '" x2="' + (W - pad) + '" y2="' + capY.toFixed(1) +
      '" stroke="var(--ok)" stroke-width="1" stroke-dasharray="3 3"></line>' +
      '<text x="' + (W - pad) + '" y="' + (capY - 3).toFixed(1) + '" text-anchor="end" font-size="7.5" fill="var(--ok)">可花上限 ' + money(cap) + '</text>' : '';
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="每月支出">' + bars + capLine + '</svg>';
  }

  /* ─────────────── 總覽 ─────────────── */
  function periodText() {
    if (ui.mode === 'all') return '全部期間';
    if (ui.mode === 'year') return '民國 ' + (Number(ui.year) - 1911) + ' 年';
    return '民國 ' + rocYM(ui.ym);
  }

  function renderDash() {
    var list = periodRecords();
    var sum = list.reduce(function (a, r) { return a + total(r); }, 0);
    var fee = list.reduce(function (a, r) { return a + num(r.fee); }, 0);
    var max = list.reduce(function (a, r) { return Math.max(a, total(r)); }, 0);

    $('#sumTotal').textContent = 'NT$ ' + money(sum);
    $('#sumSub').textContent = list.length
      ? '含手續費 NT$ ' + money(fee) + '　·　' + periodText()
      : periodText() + ' 尚無紀錄';
    $('#sumCount').textContent = list.length + ' 筆';
    $('#sumFee').textContent = money(fee);
    $('#sumAvg').textContent = list.length ? money(sum / list.length) : '0';
    $('#sumMax').textContent = money(max);

    renderMonthChart($('#chartMonth'));
    renderDonut($('#chartCat'), $('#legendCat'), groupSum(list, function (r) { return r.category; }));
    renderBars($('#chartCard'), groupSum(list, function (r) { return r.card; }));
    renderBars($('#chartArtist'), groupSum(list, function (r) { return r.artist; }).slice(0, 8));

    var cm = {};
    list.forEach(function (r) {
      var c = r.currency || 'TWD';
      if (!cm[c]) cm[c] = { orig: 0, twd: 0, n: 0 };
      cm[c].orig += num(r.amount); cm[c].twd += total(r); cm[c].n++;
    });
    var keys = Object.keys(cm).sort(function (a, b) { return cm[b].twd - cm[a].twd; });
    $('#tblCurrency').innerHTML = keys.length
      ? '<div class="tbl-scroll"><table><thead><tr><th>幣別</th><th>筆數</th><th>原幣合計</th><th>台幣合計</th><th>均價</th></tr></thead><tbody>' +
        keys.map(function (k) {
          var c = cm[k], rate = c.orig ? (c.twd / c.orig) : 0;
          return '<tr><td><b>' + esc(k) + '</b></td><td class="num">' + c.n + '</td>' +
            '<td class="num">' + money2(c.orig) + '</td><td class="num">' + money(c.twd) + '</td>' +
            '<td class="num">' + (rate ? rate.toFixed(4) : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="empty">沒有資料</p>';

    var top = list.slice().sort(function (a, b) { return total(b) - total(a); }).slice(0, 8);
    $('#topSpend').innerHTML = top.length
      ? '<div class="tbl-scroll"><table><tbody>' + top.map(function (r) {
          return '<tr><td>' + esc(r.item.length > 30 ? r.item.slice(0, 30) + '…' : r.item) +
            '<br><span class="pill">' + esc(r.category || '未分類') + '</span> <span class="pill">' + esc(r.card || '') + '</span></td>' +
            '<td class="num"><b>' + money(total(r)) + '</b><br><span class="lg-val">' + toROC(r.date) + '</span></td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="empty">沒有資料</p>';
  }

  /* ─────────────── 預算 ─────────────── */
  function renderBudget() {
    var b = db.budget;
    var ym = ui.mode === 'month' ? ui.ym : ymOf(todayISO());
    var monthRecs = db.records.filter(function (r) { return ymOf(r.date) === ym; });
    // 年繳保費之類已在固定支出預留過的分類，不重複算進「已花」
    var counted = monthRecs.filter(function (r) { return !isExcluded(r.category); });
    var excluded = monthRecs.filter(function (r) { return isExcluded(r.category); });
    var spent = counted.reduce(function (a, r) { return a + total(r); }, 0);
    var exSum = excluded.reduce(function (a, r) { return a + total(r); }, 0);
    var pending = counted.filter(function (r) { return r.twd == null && total(r); });
    var pendSum = pending.reduce(function (a, r) { return a + total(r); }, 0);
    // 只有外幣推算出來的才叫「估算」，台幣的原幣就是確定金額
    var pendEst = pending.filter(function (r) { var e = estimated(r); return e && !e.exact; });
    var pendEstSum = pendEst.reduce(function (a, r) { return a + total(r); }, 0);
    var cap = disposable();
    var left = cap - spent;
    var pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 100;

    var isCurrent = ym === ymOf(todayISO());
    var dim = daysInMonth(ym);
    var dayNow = isCurrent ? Number(todayISO().slice(8)) : dim;
    var daysLeft = Math.max(0, dim - dayNow);

    var over = left < 0;
    $('#budgetHero').className = 'budget-hero' + (over ? ' over' : '');
    $('#budgetHero').innerHTML =
      '<div class="bh-k">' + rocYM(ym) + '　' + (over ? '已經超支' : '這個月還可以花') + '</div>' +
      '<div class="bh-v">NT$ ' + money(Math.abs(left)) + '</div>' +
      '<div class="bh-sub">可支配 ' + money(cap) + '　−　已花 ' + money(spent) + '<br>' +
        (over
          ? '這個月的花費是可支配額度的 ' + (cap > 0 ? (spent / cap).toFixed(1) : '∞') + ' 倍'
          : (daysLeft > 0 ? '還剩 ' + daysLeft + ' 天，平均每天可花 NT$ ' + money(left / daysLeft) : '本月已結束')) +
      '</div>' +
      '<div class="bh-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      '<div class="bh-foot"><span>已用 ' + (cap > 0 ? Math.round((spent / cap) * 100) : 0) + '%</span>' +
        '<span>' + money(spent) + ' / ' + money(cap) + '</span></div>' +
      (pendSum ? '<div class="bh-note">已含 ' + pending.length + ' 筆待入帳共 ' +
        (pendEstSum ? '~' : '') + money(pendSum) +
        (pendEstSum ? '，其中 ' + pendEst.length + ' 筆外幣用平均匯率估了 ~' + money(pendEstSum) : '') +
        '。帳單來了補上實際金額就會自動更正</div>' : '') +
      (exSum ? '<div class="bh-note">另有 ' + money(exSum) + ' 的 ' + (b.excludeCats || []).join('、') +
        '，已在固定支出預留，不重複計入</div>' : '');

    var im = installMonthly();
    var html = '<div class="brk plus"><span class="brk-n">月收入（稅後）</span><span class="brk-v">+ ' + money(num(b.income)) + '</span></div>';
    (b.fixed || []).forEach(function (f) {
      html += '<div class="brk minus"><span class="brk-n">' + esc(f.name) + '</span><span class="brk-v">− ' + money(num(f.amount)) + '</span></div>';
    });
    html += '<div class="brk minus"><span class="brk-n">分期扣款<small>' + db.installments.length + ' 筆，剩餘本金 ' + money(installRemaining()) + '</small></span>' +
      '<span class="brk-v">− ' + money(im) + '</span></div>';
    if (num(b.savings) > 0) {
      html += '<div class="brk minus"><span class="brk-n">存起來</span><span class="brk-v">− ' + money(num(b.savings)) + '</span></div>';
    }
    html += '<div class="brk tot"><span class="brk-n">可自由支配</span><span class="brk-v">' + money(disposable()) + '</span></div>';
    var sm = subMonthly();
    if (sm > 0) {
      html += '<div class="brk" style="border-bottom:0;opacity:.85"><span class="brk-n">其中訂閱已佔用' +
        '<small>' + db.subs.filter(function (s) { return s.active; }).length + ' 個生效中，含年費月攤</small></span>' +
        '<span class="brk-v">' + money(sm) + '</span></div>' +
        '<div class="brk" style="border-bottom:0;padding-top:0"><span class="brk-n"><b>真正彈性的錢</b></span>' +
        '<span class="brk-v"><b>' + money(disposable() - sm) + '</b></span></div>';
    }
    $('#budgetBreakdown').innerHTML = html;

    // 分期
    var ins = db.installments.slice().sort(function (a, b2) { return num(b2.remaining) - num(a.remaining); });
    if (!ins.length) {
      $('#installList').innerHTML = '<p class="empty">目前沒有分期 🎉</p>';
    } else {
      var maxTerm = 0;
      var body = ins.map(function (i) {
        // 最後一期會補足餘數，用四捨五入比無條件進位貼近實際期數
        var per = num(i.monthly) > 0 ? Math.max(1, Math.round(num(i.remaining) / num(i.monthly))) : 0;
        maxTerm = Math.max(maxTerm, per);
        var paid = num(i.total) ? 1 - num(i.remaining) / num(i.total) : 0;
        return '<tr><td>' + esc(i.name) + '<br><span class="pill">' + esc(i.card || '') + '</span>' +
          '<div class="mini-bar"><i style="width:' + Math.max(2, paid * 100).toFixed(0) + '%"></i></div></td>' +
          '<td class="num">' + money(num(i.monthly) + num(i.interest)) + '</td>' +
          '<td class="num">' + money(num(i.remaining)) + '</td>' +
          '<td class="num">' + (per ? per + ' 期' : '—') + '</td></tr>';
      }).join('');
      var endYm = addMonths(todayISO().slice(0, 8) + '01', maxTerm).slice(0, 7);
      $('#installList').innerHTML =
        '<div class="tbl-scroll"><table><thead><tr><th>項目</th><th>月付</th><th>剩餘本金</th><th>還剩</th></tr></thead><tbody>' +
        body +
        '<tr><td><b>合計</b></td><td class="num"><b>' + money(im) + '</b></td>' +
        '<td class="num"><b>' + money(installRemaining()) + '</b></td><td class="num"><b>' + maxTerm + ' 期</b></td></tr>' +
        '</tbody></table></div>' +
        '<p class="hint" style="margin:10px 0 0">照目前進度，最後一筆大約在 <b>民國 ' + rocYM(endYm) + '</b> 繳完；' +
        '繳完後每個月可自由支配會回到約 <b>NT$ ' + money(disposable() + im) + '</b>。</p>';
    }

    renderDue();
    renderSubTable();
    renderCatBudget(monthRecs, cap);
  }

  function renderCatBudget(monthRecs, cap) {
    var rows = groupSum(monthRecs, function (r) { return r.category; });
    if (!rows.length) { $('#catBudget').innerHTML = '<p class="empty">這個月還沒有紀錄</p>'; return; }
    var sum = rows.reduce(function (a, r) { return a + r.value; }, 0);
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); })) || 1;
    var counted = rows.filter(function (r) { return !isExcluded(r.name); })
      .reduce(function (a, r) { return a + r.value; }, 0);
    $('#catBudget').innerHTML = rows.map(function (r, i) {
      var share = sum > 0 ? (r.value / sum) * 100 : 0;
      var ex = isExcluded(r.name);
      return '<div class="bar-row"' + (ex ? ' style="opacity:.55"' : '') + '>' +
        '<span class="bar-name" title="' + esc(r.name) + '">' + esc(r.name) + (ex ? ' *' : '') + '</span>' +
        '<span class="bar-track"><span class="bar-fill" style="width:' + Math.max(2, (Math.abs(r.value) / max) * 100).toFixed(1) +
        '%;background:' + color(i) + '"></span></span>' +
        '<span class="bar-val">' + money(r.value) + '<br><span class="lg-val">' + share.toFixed(0) + '%</span></span></div>';
    }).join('') +
      (cap > 0 ? '<p class="hint" style="margin:10px 0 0">可自由支配額度 NT$ ' + money(cap) +
        '，本月計入預算的花費 NT$ ' + money(counted) +
        (counted !== sum ? '（* 的分類已在固定支出預留，不計入）' : '') + '。</p>' : '');
  }

  /* 訂閱是自己維護的清單（db.subs）。停訂就把 active 關掉——不能只靠歷史紀錄推導，
     否則停掉的會一直跳提醒，剛訂還沒扣款的又完全不會出現。 */
  function subMonthly() {
    return db.subs.reduce(function (a, s) {
      if (!s.active) return a;
      return a + (s.cycle === 'year' ? num(s.amount) / 12 : num(s.amount));
    }, 0);
  }
  // 月費用「最近一次實際扣款 + 1 個月」，才看得出這個月的還沒記到帳
  function subNext(s) {
    if (s.cycle === 'year') return s.nextDue || '';
    var last = db.records.filter(function (r) { return r.item === s.name && r.date; })
      .map(function (r) { return r.date; }).sort().pop();
    return last ? addMonths(last, 1) : (s.nextDue || '');
  }
  function subPaidCount(s) {
    return db.records.filter(function (r) { return r.item === s.name; }).length;
  }

  function renderDue() {
    var today = todayISO();
    var due = db.subs.filter(function (s) { return s.active; })
      .map(function (s) { var c = clone(s); c.next = subNext(s); return c; })
      .filter(function (s) { return s.next && daysBetween(today, s.next) <= 90; })
      .sort(function (a, b) { return a.next.localeCompare(b.next); });

    $('#dueList').innerHTML = due.length ? due.map(function (s) {
      var d = daysBetween(today, s.next);
      var cls = d < 0 ? 'over' : (d <= 14 ? 'soon' : '');
      var txt = d < 0 ? '已過 ' + (-d) + ' 天' : (d === 0 ? '今天' : d + ' 天後');
      return '<div class="due"><div class="due-body">' +
        '<div class="due-name">' + esc(s.name) + '</div>' +
        '<div class="due-sub">' + toROC(s.next) + '　·　' +
        (num(s.amount) ? '約 NT$ ' + money(s.amount) : '金額待補') +
        (s.memberId ? '　·　#' + esc(s.memberId) : '') + '</div></div>' +
        '<span class="due-badge ' + cls + '">' + txt + '</span></div>';
    }).join('') : '<p class="empty">未來 90 天內沒有要續訂的 🎉</p>';
  }

  function renderSubTable() {
    var act = db.subs.filter(function (s) { return s.active; });
    var off = db.subs.filter(function (s) { return !s.active; });
    if (!db.subs.length) { $('#subList').innerHTML = '<p class="empty">還沒有登記訂閱</p>'; return; }

    var row = function (s) {
      var yr = s.cycle === 'year' ? num(s.amount) : num(s.amount) * 12;
      var n = subPaidCount(s);
      return '<tr' + (s.active ? '' : ' style="opacity:.5"') + '><td>' +
        esc(s.name.length > 24 ? s.name.slice(0, 24) + '…' : s.name) +
        (s.artist ? '<br><span class="pill">' + esc(s.artist) + '</span>' : '') +
        (s.active ? '' : ' <span class="pill">已停訂</span>') +
        (s.active && !n ? ' <span class="pill">未扣款</span>' : '') + '</td>' +
        '<td>' + (s.cycle === 'year' ? '年' : '月') + '</td>' +
        '<td class="num">' + (num(s.amount) ? money(s.amount) : '—') + '</td>' +
        '<td class="num"><b>' + (num(yr) ? money(yr) : '—') + '</b></td></tr>';
    };
    var yearSum = act.reduce(function (a, s) {
      return a + (s.cycle === 'year' ? num(s.amount) : num(s.amount) * 12);
    }, 0);

    $('#subList').innerHTML =
      '<div class="tbl-scroll"><table><thead><tr><th>項目</th><th>週期</th><th>每次</th><th>年估</th></tr></thead><tbody>' +
      act.map(row).join('') +
      '<tr><td><b>生效中合計</b></td><td></td><td class="num">每月約 ' + money(subMonthly()) + '</td>' +
      '<td class="num"><b>' + money(yearSum) + '</b></td></tr>' +
      off.map(row).join('') +
      '</tbody></table></div>' +
      '<button class="btn btn-ghost btn-sm wide" id="editSubs" type="button">管理訂閱</button>';
    $('#editSubs').onclick = openBudgetSheet;
  }

  /* ─────────────── 明細 ─────────────── */
  function filteredRecords() {
    var q = toHalf($('#q').value).trim().toLowerCase();
    var fc = $('#fCategory').value, fk = $('#fCard').value,
        fu = $('#fCurrency').value, fa = $('#fArtist').value, fb = $('#fBill').value;

    var list = db.records.filter(function (r) {
      if (!ui.allPeriods && !inPeriod(r)) return false;
      if (fc && (r.category || '') !== fc) return false;
      if (fk && (r.card || '') !== fk) return false;
      if (fu && (r.currency || '') !== fu) return false;
      if (fa && (r.artist || '') !== fa) return false;
      if (fb) {
        var st = billState(r);
        if (fb === '_up' ? st !== 'upcoming' : (fb === '_un' ? st !== 'unmatched' : billYm(r) !== fb)) return false;
      }
      if (q) {
        var hay = toHalf([r.item, r.note, r.memberId, r.artist, r.category, r.card].join(' ')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    var s = $('#sortBy').value;
    list.sort(function (a, b) {
      if (s === 'twd-desc') return total(b) - total(a);
      if (s === 'twd-asc') return total(a) - total(b);
      if (s === 'date-asc') return (a.date || '').localeCompare(b.date || '');
      return (b.date || '').localeCompare(a.date || '');
    });
    return list;
  }

  /* ─────────────── 帳單 ─────────────── */
  /* 明細裡標出這筆落在哪一期帳單 */
  function billPill(r) {
    var st = billState(r);
    if (st === 'upcoming') return '<span class="pill warn">未出帳</span>';
    if (st === 'unmatched') return '<span class="pill danger">待對帳</span>';
    return '<span class="pill">' + rocYM(billYm(r)) + ' 帳單</span>';
  }

  function recRow(r) {
    var catIdx = {};
    db.categories.forEach(function (c, i) { catIdx[c] = i; });
    var ci = catIdx[r.category] != null ? catIdx[r.category] : 8;
    var t = total(r);
    var est = (r.twd == null && t) ? estimated(r) : null;
    var amtTxt = r.twd == null
      ? (t ? (est && est.exact ? money(t) : '~' + money(t)) : '待入帳')
      : money(t);
    var meta = [toROC(r.date) || '無日期'];
    if (r.card) meta.push('<span class="pill">' + esc(r.card) + '</span>');
    if (r.artist) meta.push(esc(r.artist));
    var age = r.date ? daysBetween(r.date, todayISO()) : 0;
    if (age > 0) meta.push(age + ' 天前');

    return '<button class="rec" type="button" data-id="' + r.id + '">' +
      '<span class="rec-chip" style="background:' + color(ci) + '">' + esc((r.category || '其他').slice(0, 3)) + '</span>' +
      '<span class="rec-body"><span class="rec-title">' + esc(r.item || '(未命名)') + '</span>' +
        '<span class="rec-meta">' + meta.join('<span>·</span>') + '</span></span>' +
      '<span class="rec-amt"><span class="rec-twd' + (r.twd == null ? ' pending' : '') + '">' + amtTxt + '</span><br>' +
        '<span class="rec-orig">' + (r.currency && r.currency !== 'TWD' ? esc(r.currency) + ' ' + money2(num(r.amount)) : '') +
        (est && !est.exact ? '<br>估算 @' + est.rate.toFixed(4) : '') + '</span></span></button>';
  }

  function updatePendBadge() {
    var n = pendingRecords().length, badge = $('#pendBadge');
    badge.textContent = n; badge.hidden = !n;
  }

  function renderPending() {
    var all = pendingRecords();
    var upcoming = all.filter(function (r) { return billState(r) === 'upcoming'; });
    var unmatched = all.filter(function (r) { return billState(r) === 'unmatched'; });
    var upSum = upcoming.reduce(function (a, r) { return a + total(r); }, 0);
    var unSum = unmatched.reduce(function (a, r) { return a + total(r); }, 0);
    var hasEst = all.some(function (r) { var e = estimated(r); return e && !e.exact; });

    $('#pendHero').className = 'budget-hero' + (all.length ? '' : ' done');
    $('#pendHero').innerHTML = all.length
      ? '<div class="bh-k">已刷、還沒出帳</div>' +
        '<div class="bh-v">' + (hasEst ? '~' : '') + 'NT$ ' + money(upSum) + '</div>' +
        '<div class="bh-sub">' + upcoming.length + ' 筆，會出現在下一期帳單' +
          (unmatched.length ? '<br>另有 ' + unmatched.length + ' 筆（' + money(unSum) +
            '）照理已出帳但還沒對到，要處理' : '') + '</div>'
      : '<div class="bh-k">帳單</div><div class="bh-v">全部對完了 🎉</div>' +
        '<div class="bh-sub">每一筆都對到帳單期別了</div>';

    // 各卡的結帳／繳款日與未出帳金額
    var cards = db.cards.filter(function (c) {
      return db.records.some(function (r) { return r.card === c; });
    });
    $('#cardCycles').innerHTML = '<div class="tbl-scroll"><table><thead><tr>' +
      '<th>卡片</th><th>結帳</th><th>繳款</th><th>下次結帳</th><th>未出帳</th></tr></thead><tbody>' +
      cards.map(function (c) {
        var m = cardMeta(c);
        var up = upcoming.filter(function (r) { return r.card === c; })
          .reduce(function (a, r) { return a + total(r); }, 0);
        return '<tr><td>' + esc(c) + (m.guess ? ' <span class="pill">推測</span>' : '') + '</td>' +
          '<td class="num">' + m.close + ' 號</td><td class="num">' + m.due + ' 號</td>' +
          '<td class="num">' + toROC(nextClose(c)) + '</td>' +
          '<td class="num">' + (up ? '<b>' + money(up) + '</b>' : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="hint" style="margin:10px 0 0">標「推測」的是我從入帳日反推的，' +
      '請對照實際帳單到<b>設定 → 信用卡</b>改成正確的日期，這頁才會準。</p>';

    $('#pendAmount').innerHTML = upcoming.length ? upcoming.map(recRow).join('')
      : '<p class="empty">目前沒有結帳後才刷的消費</p>';
    $('#pendDate').innerHTML = unmatched.length ? unmatched.map(recRow).join('')
      : '<p class="empty">沒有待對帳的紀錄 🎉</p>';

    updatePendBadge();
  }

  function renderList() {
    var list = filteredRecords();
    var sum = list.reduce(function (a, r) { return a + total(r); }, 0);
    $('#listTotal').innerHTML = list.length ? '共 ' + list.length + ' 筆 · 合計 <b>NT$ ' + money(sum) + '</b>' : '';

    if (!list.length) {
      $('#records').innerHTML = '<p class="empty">沒有符合的紀錄。<br>試著切換上方月份，或勾選「顯示所有期間」。</p>';
      return;
    }

    var byDate = $('#sortBy').value.indexOf('date') === 0;
    var html = '', lastYM = null, catIdx = {};
    db.categories.forEach(function (c, i) { catIdx[c] = i; });

    list.forEach(function (r) {
      if (byDate) {
        var ym = ymOf(r.date);
        if (ym !== lastYM) {
          lastYM = ym;
          var mSum = list.filter(function (x) { return ymOf(x.date) === ym; })
            .reduce(function (a, x) { return a + total(x); }, 0);
          html += '<div class="month-sep"><span>' + (ym ? rocYM(ym) : '無日期') +
            '</span><span>NT$ ' + money(mSum) + '</span></div>';
        }
      }
      var ci = catIdx[r.category] != null ? catIdx[r.category] : 8;
      var meta = [toROC(r.date) || '無日期'];
      if (r.card) meta.push('<span class="pill">' + esc(r.card) + '</span>');
      if (r.artist) meta.push(esc(r.artist));
      meta.push(billPill(r));
      if (r.memberId) meta.push('#' + esc(r.memberId));
      var t = total(r);
      var est = (r.twd == null && t) ? estimated(r) : null;   // 關掉估算時就不要再印匯率
      // 推算出來的前面加 ~，不要讓它看起來像已經確定的金額；台幣是確定的，不加
      var amtTxt = r.twd == null
        ? (t ? (est && est.exact ? money(t) : '~' + money(t)) : '待入帳')
        : money(t);

      html += '<div class="rec-wrap">' +
        '<button class="rec-copy" type="button" data-copy="' + r.id + '" title="複製這筆">⊕</button>' +
        '<button class="rec" type="button" data-id="' + r.id + '">' +
        '<span class="rec-chip" style="background:' + color(ci) + '">' + esc((r.category || '其他').slice(0, 3)) + '</span>' +
        '<span class="rec-body"><span class="rec-title">' + esc(r.item || '(未命名)') + '</span>' +
          '<span class="rec-meta">' + meta.join('<span>·</span>') + '</span></span>' +
        '<span class="rec-amt"><span class="rec-twd' + (r.twd == null ? ' pending' : (t < 0 ? ' credit' : '')) + '">' +
          amtTxt + '</span><br>' +
          '<span class="rec-orig">' + (r.currency && r.currency !== 'TWD' ? esc(r.currency) + ' ' + money2(num(r.amount)) : '') +
          (est && !est.exact ? '<br>估算 @' + est.rate.toFixed(4) : '') +
          (num(r.fee) ? '<br>費 ' + money2(num(r.fee)) : '') + '</span></span></button>' +
        '</div>';
    });
    $('#records').innerHTML = html;
  }

  /* ─────────────── 貼上帳單 ─────────────── */
  var SKIP_RE = /繳款|轉帳|已收到|自動轉帳|網銀行動繳|本期應繳|上期|小計|總計|本期消費|應繳總額|信用額度|循環|帳單分期\s*\d+\/\d+期(本金|利息)|期本金|期利息/;
  var FEE_RE = /手續費|服務費|結匯/;

  var AMT_RE = /^-?\d[\d,]*(?:\.\d+)?$/;
  var CODE_RE = /^(TW|JP|US|KR|HK|SG|IE|GB|CN|AU|TWD|JPY|USD|KRW|HKD|EUR|CNY|SGD|AUD)$/i;
  var DATE_RE = /^\d{1,2}[\/-]\d{1,2}$/;

  /* 帳單每行的欄位順序各家不同：
     台新／國泰／寰宇 → 消費日 入帳日 店名 台幣 [折算日 消費地 幣別 外幣]  → 取店名後「第一個」金額
     聯邦             → 入帳日 消費日 店名 [消費地 折算日 幣別 外幣] 台幣  → 取整行「最後一個」金額 */
  function parseStatement(text, opts) {
    var lines = toHalf(text).split(/\r?\n/);
    var out = [], skipped = 0;
    var D = '(\\d{7}|\\d{1,4}[\\/-]\\d{1,2}[\\/-]\\d{1,2}|\\d{1,2}[\\/-]\\d{1,2})';
    var re = new RegExp('^\\s*' + D + '(?:\\s+' + D + ')?\\s+(.+?)$');
    var union = opts.format === 'union';

    lines.forEach(function (raw) {
      var line = raw.replace(/\t/g, '  ').trim();
      if (!line) return;
      var m = line.match(re);
      if (!m) { skipped++; return; }

      var toks = m[3].split(/\s+/).filter(Boolean);
      var amtIdx = -1;
      if (union) {
        for (var i = toks.length - 1; i >= 0; i--) { if (AMT_RE.test(toks[i])) { amtIdx = i; break; } }
      } else {
        for (var j = 0; j < toks.length; j++) { if (AMT_RE.test(toks[j])) { amtIdx = j; break; } }
      }
      if (amtIdx < 0) { skipped++; return; }
      var amount = parseFloat(toks[amtIdx].replace(/,/g, ''));
      if (!isFinite(amount)) { skipped++; return; }

      // 店名 = 金額前面、且還沒碰到消費地／幣別／折算日的那些 token
      var stop = amtIdx;
      for (var k = 0; k < amtIdx; k++) {
        if (CODE_RE.test(toks[k]) || DATE_RE.test(toks[k]) || AMT_RE.test(toks[k])) { stop = k; break; }
      }
      var desc = toks.slice(0, stop).join(' ').trim() || '(未命名)';
      if (SKIP_RE.test(desc)) { skipped++; return; }

      if (FEE_RE.test(desc) && out.length) { out[out.length - 1].fee += amount; return; }

      var d1 = toISO(m[1]), d2 = m[2] ? toISO(m[2]) : '';
      if (union && d2) { var t = d1; d1 = d2; d2 = t; }
      out.push({ id: uid(), date: d1, postDate: d2, item: desc, twd: amount, fee: 0,
                 currency: '', amount: 0, card: opts.card, category: opts.category,
                 note: '', memberId: '', nextDue: '', artist: '' });
    });
    return { rows: out, skipped: skipped };
  }

  function detectStatement(text) {
    var result = { card: null, format: null };
    var last4Map = {};
    db.cards.forEach(function (c) {
      var m = c.match(/(\d{4})$/);
      if (m) last4Map[m[1]] = c;
    });
    var patterns = [
      /末四碼[：:]\s*(\d{4})/,
      /卡號末四碼[：:]\s*(\d{4})/,
      /帳單卡號[^0-9\n]*(\d{4})/,
      /信用卡號[^0-9\n]*(\d{4})/,
      /[\*×✕]{4,}(\d{4})/,
      /\*{2,}(\d{4})\b/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m && last4Map[m[1]]) { result.card = last4Map[m[1]]; break; }
    }
    if (/聯邦/.test(text)) result.format = 'union';
    else if (/台新|國泰|新光|富邦|中信|中國信託/.test(text)) result.format = 'std';
    return result;
  }

  function renderPastePreview() {
    var res = parseStatement($('#pasteBox').value, {
      card: $('#pasteCard').value, category: $('#pasteCat').value, format: $('#pasteFormat').value
    });
    pasteDraft = res.rows;
    $('#pasteCommit').disabled = !res.rows.length;
    if (!res.rows.length) {
      $('#pasteResult').innerHTML = '<p class="empty">沒有解析出任何消費。每一行需要「日期　店名　金額」，' +
        '中間用 Tab 或兩個以上空白分隔。</p>';
      return;
    }
    var sum = res.rows.reduce(function (a, r) { return a + r.twd + r.fee; }, 0);
    $('#pasteResult').innerHTML =
      '<p class="hint" style="margin:10px 0 6px">解析出 <b>' + res.rows.length + '</b> 筆，合計 <b>NT$ ' + money(sum) +
      '</b>（略過 ' + res.skipped + ' 行）。確認沒問題再按「加入這些紀錄」，加入後可以逐筆改分類。</p>' +
      '<div class="tbl-scroll"><table><thead><tr><th>消費日</th><th>入帳</th><th>項目</th><th>金額</th></tr></thead><tbody>' +
      res.rows.map(function (r) {
        return '<tr><td>' + (toROC(r.date) || '<span style="color:var(--danger)">?</span>') + '</td>' +
          '<td>' + toROC(r.postDate) + '</td><td>' + esc(r.item) + '</td>' +
          '<td class="num">' + money(r.twd + r.fee) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ─────────────── 匯出 / 匯入 ─────────────── */
  var CSV_COLS = [
    ['date', '消費日'], ['postDate', '入帳日'], ['item', '項目'], ['twd', '本幣'],
    ['currency', '幣別'], ['amount', '原幣'], ['fee', '手續費'], ['card', '刷卡'],
    ['note', '備註'], ['memberId', '會員卡號'], ['nextDue', '下次付款日'],
    ['category', '分類'], ['artist', '藝人']
  ];

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function exportCsv() {
    var q = function (v) {
      v = String(v == null ? '' : v);
      return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    var rows = [CSV_COLS.map(function (c) { return c[1]; }).join(',')];
    db.records.slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); })
      .forEach(function (r) {
        rows.push(CSV_COLS.map(function (c) {
          var v = r[c[0]];
          if (c[0] === 'date' || c[0] === 'postDate' || c[0] === 'nextDue') v = toROC(v);
          return q(v);
        }).join(','));
      });
    download('FC記帳_' + todayISO() + '.csv', '﻿' + rows.join('\r\n'), 'text/csv');
    toast('已匯出 CSV');
  }

  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], cur = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch !== '\r') cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); });
  }

  function importCsv(text) {
    var rows = parseCsv(text);
    if (rows.length < 2) throw new Error('CSV 內容不足');
    var head = rows[0].map(function (h) { return h.trim(); }), idx = {};
    CSV_COLS.forEach(function (c) {
      var i = head.indexOf(c[1]);
      if (i === -1) i = head.indexOf(c[0]);
      idx[c[0]] = i;
    });
    if (idx.item === -1 && idx.date === -1) throw new Error('找不到「消費日」或「項目」欄位');
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i], g = function (k) { return idx[k] > -1 ? (r[idx[k]] || '').trim() : ''; };
      out.push({
        id: uid(),
        date: toISO(g('date')), postDate: toISO(g('postDate')), nextDue: toISO(g('nextDue')),
        item: g('item'), currency: g('currency').trim(),
        amount: num(g('amount').replace(/,/g, '')),
        twd: g('twd') === '' ? null : num(g('twd').replace(/,/g, '')),
        fee: num(g('fee').replace(/,/g, '')),
        card: g('card'), note: g('note'), memberId: g('memberId'),
        category: g('category') || '其他', artist: g('artist')
      });
    }
    return out;
  }

  function handleImport(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var text = String(fr.result);
      try {
        var recs;
        if (/\.json$/i.test(file.name) || text.trim()[0] === '{') {
          var d = JSON.parse(text);
          recs = (d.records || d).map(function (r) {
            var c = clone(r);
            c.id = c.id || uid();
            c.date = toISO(c.date); c.postDate = toISO(c.postDate); c.nextDue = toISO(c.nextDue);
            return c;
          });
          if (d.categories && d.categories.length) db.categories = d.categories;
          if (d.cards && d.cards.length) db.cards = d.cards;
          if (d.installments) db.installments = d.installments;
          if (d.subs) db.subs = d.subs;
          if (d.cardMeta) db.cardMeta = d.cardMeta;
          if (d.budget) db.budget = d.budget;
        } else {
          recs = importCsv(text);
        }
        if (!recs.length) throw new Error('沒有讀到任何資料');

        var replace = confirm('讀到 ' + recs.length + ' 筆。\n\n【確定】＝取代目前全部資料\n【取消】＝附加到現有資料後面');
        db.records = replace ? recs : db.records.concat(recs);
        recs.forEach(function (r) {
          if (r.category && db.categories.indexOf(r.category) === -1) db.categories.push(r.category);
          if (r.card && db.cards.indexOf(r.card) === -1) db.cards.push(r.card);
        });
        save(); refreshOptions(); renderAll();
        $('#importMsg').textContent = '✅ 已匯入 ' + recs.length + ' 筆（' + (replace ? '取代' : '附加') + '）';
        toast('匯入完成');
      } catch (e) {
        $('#importMsg').textContent = '❌ 匯入失敗：' + e.message;
      }
    };
    fr.readAsText(file, 'utf-8');
  }

  /* ─────────────── 設定 ─────────────── */
  function renderSettings() {
    function tags(el, arr, onDel) {
      el.innerHTML = arr.map(function (v, i) {
        return '<span class="tag">' + esc(v) + '<button type="button" data-i="' + i + '" aria-label="刪除">×</button></span>';
      }).join('') || '<span class="hint">（無）</span>';
      $$('button', el).forEach(function (b) { b.onclick = function () { onDel(Number(b.dataset.i)); }; });
    }
    tags($('#catEditor'), db.categories, function (i) { db.categories.splice(i, 1); save(); renderSettings(); refreshOptions(); });
    $('#cardEditor').innerHTML = db.cards.map(function (c, i) {
      var m = cardMeta(c);
      return '<div class="row-edit"><input type="text" data-k="name" data-i="' + i + '" value="' + esc(c) + '">' +
        '<input type="number" min="1" max="31" data-k="close" data-i="' + i + '" value="' + m.close + '" title="結帳日" style="width:66px">' +
        '<input type="number" min="1" max="31" data-k="due" data-i="' + i + '" value="' + m.due + '" title="繳款日" style="width:66px">' +
        (m.guess ? '<span class="pill">推測</span>' : '') +
        '<button type="button" data-del="' + i + '" aria-label="刪除">×</button></div>';
    }).join('') + '<p class="hint" style="margin:8px 0 0">欄位依序是：卡片名稱、結帳日、繳款日</p>';
    $$('#cardEditor input').forEach(function (inp) {
      inp.onchange = function () {
        var i = Number(inp.dataset.i), old = db.cards[i];
        var m = db.cardMeta[old] || (db.cardMeta[old] = { close: 31, due: 15, guess: true });
        if (inp.dataset.k === 'name') {
          var nn = inp.value.trim();
          if (!nn || nn === old) return;
          db.cards[i] = nn;
          db.cardMeta[nn] = m; delete db.cardMeta[old];
          db.records.forEach(function (r) { if (r.card === old) r.card = nn; });
          db.subs.forEach(function (x) { if (x.card === old) x.card = nn; });
          db.installments.forEach(function (x) { if (x.card === old) x.card = nn; });
        } else {
          m[inp.dataset.k] = Math.min(31, Math.max(1, num(inp.value) || 1));
          m.guess = false;   // 使用者親自填的就不是推測了
        }
        save(); refreshOptions(); renderSettings();
      };
    });
    $$('#cardEditor button').forEach(function (b) {
      b.onclick = function () {
        var i = Number(b.dataset.del);
        delete db.cardMeta[db.cards[i]];
        db.cards.splice(i, 1); save(); renderSettings(); refreshOptions();
      };
    });
    $('#verLabel').textContent = 'v' + VERSION + '　·　' + db.records.length + ' 筆紀錄';

    // 密碼鎖面板
    renderPinSection();
    $('#pinSetForm').hidden = true;

    // 同步面板
    var tokenEl = $('#syncToken');
    if (tokenEl) {
      tokenEl.value = '';
      tokenEl.placeholder = gistToken() ? 'Token 已設定（貼上新的即可更換）' : 'ghp_xxxx…';
    }
    var autoEl = $('#syncAuto');
    if (autoEl) autoEl.checked = gistAuto();
    var gidEl = $('#syncGistId');
    if (gidEl) { var gid = gistId(); gidEl.value = gid; gidEl.placeholder = gid ? gid : '第一次上傳後會自動填入'; }
    var statusEl = $('#syncStatus');
    if (statusEl && !statusEl.textContent) {
      statusEl.textContent = gistToken() ? (gistId() ? '已連結 Gist，可上傳 / 下載' : 'Token 已設定，點「立即上傳」初始化 Gist') : '';
    }
  }

  /* ─────────────── 預算設定表單 ─────────────── */
  function openBudgetSheet() {
    var b = db.budget;
    $('#bIncome').value = b.income || '';
    $('#bSavings').value = b.savings || '';
    $('#bEstimate').checked = b.estimatePending !== false;
    drawFixed(); drawInstall(); drawSubs(); drawExclude();
    $('#bSheet').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function drawFixed() {
    $('#bFixed').innerHTML = (db.budget.fixed || []).map(function (f, i) {
      return '<div class="row-edit"><input type="text" data-k="name" data-i="' + i + '" value="' + esc(f.name) + '">' +
        '<input type="number" data-k="amount" data-i="' + i + '" value="' + num(f.amount) + '">' +
        '<button type="button" data-del="' + i + '" aria-label="刪除">×</button></div>';
    }).join('') || '<p class="hint">還沒有固定支出</p>';
    $$('#bFixed input').forEach(function (inp) {
      inp.oninput = function () {
        var f = db.budget.fixed[Number(inp.dataset.i)];
        f[inp.dataset.k] = inp.dataset.k === 'amount' ? num(inp.value) : inp.value;
      };
    });
    $$('#bFixed button').forEach(function (btn) {
      btn.onclick = function () { db.budget.fixed.splice(Number(btn.dataset.del), 1); drawFixed(); };
    });
  }
  function drawSubs() {
    db.subs.sort(function (a, b) {
      return (b.active ? 1 : 0) - (a.active ? 1 : 0) || a.cycle.localeCompare(b.cycle);
    });
    $('#bSubs').innerHTML = db.subs.map(function (s, i) {
      return '<div class="row-edit"' + (s.active ? '' : ' style="opacity:.55"') + '>' +
        '<input type="checkbox" data-k="active" data-i="' + i + '"' + (s.active ? ' checked' : '') +
          ' title="生效中" style="flex:0 0 auto;width:auto">' +
        '<input type="text" data-k="name" data-i="' + i + '" value="' + esc(s.name) + '">' +
        '<input type="number" data-k="amount" data-i="' + i + '" value="' + num(s.amount) + '" style="width:84px">' +
        '<select data-k="cycle" data-i="' + i + '" style="width:62px;padding:9px 6px;border:1px solid var(--line);border-radius:9px;background:var(--surface)">' +
          '<option value="month"' + (s.cycle === 'month' ? ' selected' : '') + '>月</option>' +
          '<option value="year"' + (s.cycle === 'year' ? ' selected' : '') + '>年</option></select>' +
        '<button type="button" data-del="' + i + '" aria-label="刪除">×</button></div>';
    }).join('') || '<p class="hint">還沒有訂閱</p>';

    $$('#bSubs input, #bSubs select').forEach(function (el) {
      el.onchange = el.oninput = function () {
        var s = db.subs[Number(el.dataset.i)], k = el.dataset.k;
        if (k === 'active') { s.active = el.checked; el.closest('.row-edit').style.opacity = el.checked ? '' : '.55'; }
        else if (k === 'amount') s.amount = num(el.value);
        else s[k] = el.value;
      };
    });
    $$('#bSubs button').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('刪除這筆訂閱？只是不再追蹤，歷史消費紀錄會留著。')) return;
        db.subs.splice(Number(b.dataset.del), 1); drawSubs();
      };
    });
  }

  function drawExclude() {
    $('#bExclude').innerHTML = db.categories.map(function (c) {
      return '<label class="tag" style="padding-left:8px;cursor:pointer">' +
        '<input type="checkbox" data-cat="' + esc(c) + '"' + (isExcluded(c) ? ' checked' : '') + '> ' + esc(c) + '</label>';
    }).join('');
    $$('#bExclude input').forEach(function (cb) {
      cb.onchange = function () {
        var list = db.budget.excludeCats || (db.budget.excludeCats = []);
        var i = list.indexOf(cb.dataset.cat);
        if (cb.checked && i === -1) list.push(cb.dataset.cat);
        if (!cb.checked && i > -1) list.splice(i, 1);
      };
    });
  }

  function drawInstall() {
    $('#bInstall').innerHTML = db.installments.map(function (it, i) {
      return '<div class="row-edit"><input type="text" data-k="name" data-i="' + i + '" value="' + esc(it.name) + '">' +
        '<input type="number" data-k="monthly" data-i="' + i + '" value="' + (num(it.monthly) + num(it.interest)) + '" title="月付">' +
        '<input type="number" data-k="remaining" data-i="' + i + '" value="' + num(it.remaining) + '" title="剩餘本金">' +
        '<button type="button" data-del="' + i + '" aria-label="刪除">×</button></div>';
    }).join('') || '<p class="hint">目前沒有分期</p>';
    $$('#bInstall input').forEach(function (inp) {
      inp.oninput = function () {
        var it = db.installments[Number(inp.dataset.i)];
        if (inp.dataset.k === 'name') it.name = inp.value;
        else if (inp.dataset.k === 'monthly') { it.monthly = num(inp.value); it.interest = 0; }
        else it.remaining = num(inp.value);
      };
    });
    $$('#bInstall button').forEach(function (btn) {
      btn.onclick = function () { db.installments.splice(Number(btn.dataset.del), 1); drawInstall(); };
    });
  }

  /* ─────────────── 消費表單 ─────────────── */
  function refreshOptions() {
    function fill(sel, arr, keepEmpty, emptyLabel) {
      var v = sel.value;
      sel.innerHTML = (keepEmpty ? '<option value="">' + emptyLabel + '</option>' : '') +
        arr.map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + '</option>'; }).join('');
      if (arr.indexOf(v) > -1 || v === '') sel.value = v;
    }
    fill($('#selCategory'), db.categories, false);
    fill($('#selCard'), db.cards, false);
    fill($('#pasteCat'), db.categories, false);
    fill($('#pasteCard'), db.cards, false);
    fill($('#fCategory'), db.categories, true, '全部分類');
    fill($('#fCard'), db.cards, true, '全部卡別');

    var uniq = function (key) {
      var s = {};
      db.records.forEach(function (r) { if (r[key]) s[r[key]] = 1; });
      return Object.keys(s).sort();
    };
    fill($('#fCurrency'), uniq('currency'), true, '全部幣別');
    var billSel = $('#fBill'), bv = billSel.value, yms = {};
    db.records.forEach(function (r) { if (r.postDate) yms[billYm(r)] = 1; });
    billSel.innerHTML = '<option value="">全部帳單期</option>' +
      '<option value="_up">未出帳</option><option value="_un">待對帳</option>' +
      Object.keys(yms).sort().reverse().map(function (y) {
        return '<option value="' + y + '">' + rocYM(y) + ' 帳單</option>';
      }).join('');
    billSel.value = bv;
    fill($('#fArtist'), uniq('artist'), true, '全部藝人');
    $('#itemList').innerHTML = uniq('item').map(function (x) { return '<option value="' + esc(x) + '">'; }).join('');
    $('#artistList').innerHTML = uniq('artist').map(function (x) { return '<option value="' + esc(x) + '">'; }).join('');
  }

  // form.elements.item 會被 HTMLFormControlsCollection.item() 蓋掉，一律用 namedItem
  function fe(name) { return $('#form').elements.namedItem(name === 'item' ? 'itemName' : name); }

  function openSheet(id) {
    var f = $('#form');
    ui.editingId = id || null;
    f.reset();
    if (id) {
      var r = db.records.filter(function (x) { return x.id === id; })[0];
      if (!r) return;
      $('#sheetTitle').textContent = '編輯紀錄';
      ['item', 'date', 'postDate', 'currency', 'amount', 'twd', 'fee', 'artist', 'memberId', 'nextDue', 'note'].forEach(function (k) {
        fe(k).value = r[k] == null ? '' : r[k];
      });
      if (r.category && db.categories.indexOf(r.category) === -1) { db.categories.push(r.category); refreshOptions(); }
      if (r.card && db.cards.indexOf(r.card) === -1) { db.cards.push(r.card); refreshOptions(); }
      fe('category').value = r.category || db.categories[0];
      fe('card').value = r.card || db.cards[0];
      $('#deleteRec').hidden = false;
    } else {
      $('#sheetTitle').textContent = '新增一筆';
      fe('date').value = todayISO();
      fe('currency').value = 'TWD';
      fe('category').value = db.categories[0] || '';
      fe('card').value = db.cards[0] || '';
      $('#deleteRec').hidden = true;
    }
    updateRocHints(); updateRate();
    $('#sheet').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function copyRec(id) {
    var r = db.records.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    ui.editingId = null;
    var f = $('#form'); f.reset();
    $('#sheetTitle').textContent = '複製新增';
    ['item', 'currency', 'amount', 'fee', 'artist', 'memberId', 'note'].forEach(function (k) {
      fe(k).value = r[k] == null ? '' : r[k];
    });
    fe('date').value = todayISO();
    fe('postDate').value = '';
    fe('twd').value = '';
    fe('nextDue').value = '';
    if (r.category && db.categories.indexOf(r.category) === -1) { db.categories.push(r.category); refreshOptions(); }
    if (r.card && db.cards.indexOf(r.card) === -1) { db.cards.push(r.card); refreshOptions(); }
    fe('category').value = r.category || db.categories[0];
    fe('card').value = r.card || db.cards[0];
    $('#deleteRec').hidden = true;
    updateRocHints(); updateRate();
    $('#sheet').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeSheet() {
    $('#sheet').hidden = true;
    document.body.style.overflow = '';
    ui.editingId = null;
  }

  function saveSheet() {
    var f = $('#form');
    if (!f.reportValidity()) return;
    var v = function (n) { return fe(n).value; };
    var rec = {
      id: ui.editingId || uid(),
      item: v('item').trim(),
      date: v('date'),
      postDate: v('postDate'),
      currency: v('currency').trim().toUpperCase(),
      amount: num(v('amount')),
      twd: v('twd') === '' ? null : num(v('twd')),
      fee: num(v('fee')),
      category: v('category'),
      card: v('card'),
      artist: v('artist').trim(),
      memberId: v('memberId').trim(),
      nextDue: v('nextDue'),
      note: v('note').trim()
    };
    if (ui.editingId) {
      db.records = db.records.map(function (r) { return r.id === ui.editingId ? rec : r; });
    } else {
      db.records.push(rec);
      if (ui.mode === 'month') ui.ym = ymOf(rec.date);
      if (ui.mode === 'year') ui.year = rec.date.slice(0, 4);
    }
    save(); refreshOptions(); closeSheet(); renderAll();
    toast(ui.editingId ? '已更新' : '已新增');
  }

  function updateRocHints() {
    $$('.roc').forEach(function (el) {
      var v = fe(el.dataset.rocFor).value;
      el.textContent = v ? '民國 ' + toROC(v) : '';
    });
  }
  function updateRate() {
    var a = num(fe('amount').value), t = num(fe('twd').value), fee = num(fe('fee').value),
        cur = fe('currency').value.trim().toUpperCase();
    if (a > 0 && t > 0 && cur && cur !== 'TWD') {
      $('#rateHint').textContent = '匯率約 1 ' + cur + ' ≒ ' + (t / a).toFixed(4) + ' TWD　·　含手續費合計 NT$ ' + money(t + fee);
    } else if (t !== 0) {
      $('#rateHint').textContent = '含手續費合計 NT$ ' + money(t + fee);
    } else {
      $('#rateHint').textContent = '';
    }
  }

  /* ─────────────── 期間切換 ─────────────── */
  function shiftPeriod(dir) {
    if (ui.mode === 'month') ui.ym = addMonths(ui.ym + '-01', dir).slice(0, 7);
    else if (ui.mode === 'year') ui.year = String(Number(ui.year) + dir);
    renderAll();
  }
  function cyclePeriodMode() {
    ui.mode = ui.mode === 'month' ? 'year' : (ui.mode === 'year' ? 'all' : 'month');
    renderAll();
  }
  function renderPeriodBar() {
    var lbl = $('#periodLabel');
    if (ui.mode === 'all') lbl.textContent = '全部期間（點我切回月）';
    else if (ui.mode === 'year') lbl.textContent = '民國 ' + (Number(ui.year) - 1911) + ' 年　(' + ui.year + ')';
    else lbl.textContent = '民國 ' + rocYM(ui.ym) + '　(' + ui.ym + ')';
    $('#prevPeriod').style.visibility = ui.mode === 'all' ? 'hidden' : '';
    $('#nextPeriod').style.visibility = ui.mode === 'all' ? 'hidden' : '';
  }

  /* ─────────────── 分頁 / 渲染 ─────────────── */
  function setTab(t) {
    ui.tab = t;
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + t; });
    $$('.tab').forEach(function (b) { b.classList.toggle('is-on', b.dataset.tab === t); });
    $('#periodBar').style.display = (t === 'settings' || t === 'pending') ? 'none' : '';
    $('#fab').hidden = (t === 'settings');
    window.scrollTo(0, 0);
    renderAll();
  }
  function renderAll() {
    renderPeriodBar();
    updatePendBadge();
    if (ui.tab === 'dash') renderDash();
    else if (ui.tab === 'budget') renderBudget();
    else if (ui.tab === 'list') renderList();
    else if (ui.tab === 'pending') renderPending();
    else if (ui.tab === 'settings') renderSettings();
  }

  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  /* ─────────────── 主題 ─────────────── */
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = t === 'dark' ? '#1c1926' : '#7c4dff';
  }
  function initTheme() {
    var t = 'auto';
    try { t = localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) {}
    if (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else applyTheme(t);
  }

  /* ─────────────── 綁定 ─────────────── */
  function bind() {
    $$('.tab').forEach(function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
    $('#prevPeriod').onclick = function () { shiftPeriod(-1); };
    $('#nextPeriod').onclick = function () { shiftPeriod(1); };
    $('#periodLabel').onclick = cyclePeriodMode;

    $('#fab').onclick = function () { openSheet(null); };
    $('#sheetCancel').onclick = closeSheet;
    $('#sheetSave').onclick = saveSheet;
    $('#form').addEventListener('submit', function (e) { e.preventDefault(); saveSheet(); });
    $('#form').addEventListener('input', function (e) {
      if (e.target.type === 'date') updateRocHints();
      updateRate();
    });
    $('#deleteRec').onclick = function () {
      if (!ui.editingId || !confirm('確定刪除這筆紀錄？')) return;
      db.records = db.records.filter(function (r) { return r.id !== ui.editingId; });
      save(); refreshOptions(); closeSheet(); renderAll(); toast('已刪除');
    };
    ['#records', '#pendAmount', '#pendDate'].forEach(function (sel) {
      $(sel).addEventListener('click', function (e) {
        var cp = e.target.closest('.rec-copy');
        if (cp) { e.stopPropagation(); copyRec(cp.dataset.copy); return; }
        var b = e.target.closest('.rec');
        if (b) openSheet(b.dataset.id);
      });
    });

    ['q', 'fCategory', 'fCard', 'fCurrency', 'fArtist', 'fBill', 'sortBy'].forEach(function (id) {
      $('#' + id).addEventListener('input', renderList);
      $('#' + id).addEventListener('change', renderList);
    });
    $('#allPeriods').onchange = function () { ui.allPeriods = this.checked; renderList(); };

    // 預算
    $('#editBudget').onclick = openBudgetSheet;
    $('#bCancel').onclick = function () {
      load(); $('#bSheet').hidden = true; document.body.style.overflow = ''; renderAll();
    };
    $('#bSave').onclick = function () {
      db.budget.income = num($('#bIncome').value);
      db.budget.savings = num($('#bSavings').value);
      db.budget.estimatePending = $('#bEstimate').checked;
      save(); $('#bSheet').hidden = true; document.body.style.overflow = '';
      renderAll(); toast('預算已更新');
    };
    $('#bAdd').onclick = function () {
      var n = $('#bNewName').value.trim(), a = num($('#bNewAmt').value);
      if (!n) return;
      db.budget.fixed.push({ name: n, amount: a });
      $('#bNewName').value = ''; $('#bNewAmt').value = ''; drawFixed();
    };
    $('#iAdd').onclick = function () {
      var n = $('#iNewName').value.trim();
      if (!n) return;
      db.installments.push({ name: n, card: '', total: 0, monthly: num($('#iNewMonthly').value),
                             interest: 0, remaining: num($('#iNewRemain').value), apr: 0 });
      $('#iNewName').value = ''; $('#iNewMonthly').value = ''; $('#iNewRemain').value = ''; drawInstall();
    };
    $('#sAdd').onclick = function () {
      var n = $('#sNewName').value.trim();
      if (!n) return;
      db.subs.push({ name: n, amount: num($('#sNewAmt').value), cycle: $('#sNewCycle').value,
                     card: '', category: '訂閱服務', active: true, artist: '', memberId: '',
                     nextDue: '', note: '' });
      $('#sNewName').value = ''; $('#sNewAmt').value = ''; drawSubs();
    };

    // 貼上帳單
    $('#pastePreview').onclick = renderPastePreview;
    $('#pasteBox').addEventListener('input', function () {
      $('#pasteCommit').disabled = true;
      var text = this.value;
      if (!text.trim()) { $('#pasteDetect').textContent = ''; return; }
      var d = detectStatement(text);
      var hints = [];
      if (d.card) { $('#pasteCard').value = d.card; hints.push('卡片：' + d.card); }
      if (d.format) { $('#pasteFormat').value = d.format; hints.push('格式：' + (d.format === 'union' ? '聯邦' : '一般')); }
      $('#pasteDetect').textContent = hints.length ? '🔍 自動偵測 → ' + hints.join('　') : '';
    });
    $('#pasteCommit').onclick = function () {
      if (!pasteDraft.length) return;
      db.records = db.records.concat(pasteDraft);
      save(); refreshOptions();
      var n = pasteDraft.length;
      pasteDraft = []; $('#pasteBox').value = ''; $('#pasteResult').innerHTML = '';
      $('#pasteCommit').disabled = true;
      renderAll(); toast('已加入 ' + n + ' 筆');
    };

    // 密碼鎖
    $('#lockPin').addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      var pin = this.value.trim();
      if (!pin) return;
      hashPin(pin).then(function(h) {
        if (h === getPinHash()) {
          unlockApp();
        } else {
          $('#lockMsg').textContent = '密碼錯誤，請再試一次';
          $('#lockPin').value = '';
        }
      });
    });
    $('#lockPin').addEventListener('input', function() { $('#lockMsg').textContent = ''; });

    $('#pinSetBtn').onclick = function() {
      $('#pinSetForm').hidden = false;
      $('#pinNew').value = ''; $('#pinConfirm').value = ''; $('#pinMsg').textContent = '';
      $('#pinNew').focus();
    };
    $('#pinCancel').onclick = function() { $('#pinSetForm').hidden = true; };
    $('#pinSave').onclick = function() {
      var p1 = $('#pinNew').value.trim(), p2 = $('#pinConfirm').value.trim();
      if (!p1) { $('#pinMsg').textContent = '請輸入密碼'; return; }
      if (p1.length < 4) { $('#pinMsg').textContent = '密碼至少 4 位'; return; }
      if (p1 !== p2) { $('#pinMsg').textContent = '兩次輸入不一致'; return; }
      hashPin(p1).then(function(h) {
        try { localStorage.setItem(PIN_KEY, h); } catch(e) {}
        $('#pinSetForm').hidden = true;
        renderPinSection();
        toast('密碼已設定');
      });
    };
    $('#pinRemoveBtn').onclick = function() {
      if (!confirm('確定移除密碼鎖？')) return;
      try { localStorage.removeItem(PIN_KEY); } catch(e) {}
      renderPinSection();
      toast('密碼已移除');
    };
    $('#pinLockNow').onclick = lockApp;

    // 雲端同步
    $('#syncToken').addEventListener('change', function () {
      var v = this.value.replace(/[^\x20-\x7E]/g, '').trim();
      try {
        if (v) {
          localStorage.setItem(GIST_TOKEN_KEY, v);
          this.value = '';
          this.placeholder = 'Token 已設定（貼上新的即可更換）';
          setSyncStatus('Token 已儲存', true);
        } else {
          localStorage.removeItem(GIST_TOKEN_KEY);
          localStorage.removeItem(GIST_ID_KEY);
          this.placeholder = 'ghp_xxxx…';
          setSyncStatus('Token 已清除', false);
        }
      } catch(e) {}
    });
    $('#syncAuto').addEventListener('change', function () {
      try { localStorage.setItem(GIST_AUTO_KEY, this.checked ? '1' : '0'); } catch(e) {}
    });
    $('#syncGistId').addEventListener('change', function () {
      var v = this.value.replace(/[^\x20-\x7E]/g, '').trim();
      try { if (v) localStorage.setItem(GIST_ID_KEY, v); else localStorage.removeItem(GIST_ID_KEY); } catch(e) {}
      setSyncStatus(v ? 'Gist ID 已儲存' : 'Gist ID 已清除', !!v);
    });
    $('#syncPush').onclick = function() {
      syncToGist().then(function() {
        var gid = gistId();
        var el = $('#syncGistId');
        if (el && gid) el.value = gid;
      });
    };
    $('#syncPull').onclick = function () {
      if (!confirm('這會用雲端的資料覆蓋目前裝置上的所有資料，確定嗎？')) return;
      syncFromGist();
    };

    // 備份
    $('#exportCsv').onclick = exportCsv;
    $('#exportJson').onclick = function () {
      download('FC記帳備份_' + todayISO() + '.json', JSON.stringify(db, null, 2), 'application/json');
      toast('已匯出 JSON');
    };
    $('#importFile').onchange = function () {
      if (this.files && this.files[0]) handleImport(this.files[0]);
      this.value = '';
    };

    $('#addCat').onclick = function () {
      var v = $('#newCat').value.trim();
      if (v && db.categories.indexOf(v) === -1) { db.categories.push(v); save(); renderSettings(); refreshOptions(); }
      $('#newCat').value = '';
    };
    $('#addCard').onclick = function () {
      var v = $('#newCard').value.trim();
      if (v && db.cards.indexOf(v) === -1) {
        db.cards.push(v);
        db.cardMeta[v] = { close: 31, due: 15, guess: true };
        save(); renderSettings(); refreshOptions();
      }
      $('#newCard').value = '';
    };

    $('#reseed').onclick = function () {
      if (!confirm('這會用帳單初始資料覆蓋目前所有紀錄，確定嗎？')) return;
      seed(); refreshOptions(); renderAll(); toast('已重新載入初始資料');
    };
    $('#wipe').onclick = function () {
      if (!confirm('確定清空所有紀錄？此動作無法復原，建議先匯出備份。')) return;
      db.records = []; save(); refreshOptions(); renderAll(); toast('已清空');
    };

    $('#themeBtn').onclick = function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    };

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('#sheet').hidden) closeSheet();
      else if (!$('#bSheet').hidden) { $('#bSheet').hidden = true; document.body.style.overflow = ''; }
    });
  }

  /* ─────────────── 啟動 ─────────────── */
  initTheme();
  load();
  migrateCardNames();

  var latest = db.records.map(function (r) { return r.date; }).filter(Boolean).sort().pop();
  if (latest && latest < ymOf(todayISO()) + '-01') { ui.ym = ymOf(latest); ui.year = latest.slice(0, 4); }

  refreshOptions();
  bind();

  if (getPinHash()) {
    lockApp();   // 有密碼：先顯示鎖定畫面，unlockApp() 成功後才渲染
  } else {
    setTab('dash');
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
