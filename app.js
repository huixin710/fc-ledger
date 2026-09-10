/* FC 記帳本 — 純前端、離線可用、資料存於 localStorage */
(function () {
  'use strict';

  var STORE_KEY = 'fcLedger.v1';
  var THEME_KEY = 'fcLedger.theme';
  var VERSION = '2.0.0';
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
  var db = { version: 2, records: [], categories: [], cards: [], installments: [], budget: null };
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
        db.budget = d.budget || defaultBudget();
        if (!db.budget.excludeCats) db.budget.excludeCats = [];
        return;
      } catch (e) {}
    }
    seed();
  }
  function seed() {
    db.records = window.SEED.records.map(function (r) { var c = clone(r); c.id = uid(); return c; });
    db.categories = window.SEED.categories.slice();
    db.cards = window.SEED.cards.slice();
    db.installments = clone(window.SEED.installments);
    db.budget = defaultBudget();
    save();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
    catch (e) { toast('儲存失敗，瀏覽器空間可能已滿'); }
  }

  /* ─────────────── 計算 ─────────────── */
  function total(r) { return num(r.twd) + num(r.fee); }

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
    rows = rows.filter(function (r) { return r.value > 0; });
    var sum = rows.reduce(function (a, r) { return a + r.value; }, 0);
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
      '<text x="70" y="82" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">' + money(sum) + '</text></svg>';
    legendEl.innerHTML = rows.map(function (r, i) {
      return '<li><span class="dot" style="background:' + color(i) + '"></span>' +
        '<span class="lg-name">' + esc(r.name) + '</span>' +
        '<span class="lg-val">' + money(r.value) + '　' + ((r.value / sum) * 100).toFixed(0) + '%</span></li>';
    }).join('');
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

  function subscriptionGroups() {
    var map = {};
    db.records.forEach(function (r) {
      if (r.category !== 'FC月費' && r.category !== 'FC年費' && r.category !== '訂閱服務') return;
      var key = (r.item || '') + '||' + (r.memberId || '');
      if (!map[key]) map[key] = { item: r.item, memberId: r.memberId, artist: r.artist, category: r.category, recs: [] };
      map[key].recs.push(r);
    });
    return Object.keys(map).map(function (k) {
      var g = map[k];
      g.recs.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      var last = g.recs[0];
      g.lastDate = last.date;
      g.monthly = g.category !== 'FC年費';
      var billed = g.recs.filter(function (r) { return r.twd != null; });
      g.avg = billed.length ? billed.reduce(function (a, r) { return a + total(r); }, 0) / billed.length : null;
      g.count = g.recs.length;
      g.next = last.nextDue || addMonths(last.date, g.monthly ? 1 : 12);
      g.yearly = g.avg == null ? null : (g.monthly ? g.avg * 12 : g.avg);
      return g;
    }).sort(function (a, b) { return (a.next || '').localeCompare(b.next || ''); });
  }

  function renderDue() {
    var groups = subscriptionGroups(), today = todayISO();
    var due = groups.filter(function (g) { return daysBetween(today, g.next) <= 90; });
    $('#dueList').innerHTML = due.length ? due.map(function (g) {
      var d = daysBetween(today, g.next);
      var cls = d < 0 ? 'over' : (d <= 14 ? 'soon' : '');
      var txt = d < 0 ? '已過 ' + (-d) + ' 天' : (d === 0 ? '今天' : d + ' 天後');
      return '<div class="due"><div class="due-body">' +
        '<div class="due-name">' + esc(g.item) + '</div>' +
        '<div class="due-sub">' + toROC(g.next) + '　·　' + (g.avg == null ? '金額待補' : '約 NT$ ' + money(g.avg)) +
        (g.memberId ? '　·　#' + esc(g.memberId) : '') + '</div></div>' +
        '<span class="due-badge ' + cls + '">' + txt + '</span></div>';
    }).join('') : '<p class="empty">未來 90 天內沒有到期的訂閱 🎉</p>';
  }

  function renderSubTable() {
    var groups = subscriptionGroups();
    var yearSum = groups.reduce(function (a, g) { return a + (g.yearly || 0); }, 0);
    $('#subList').innerHTML = groups.length
      ? '<div class="tbl-scroll"><table><thead><tr><th>項目</th><th>週期</th><th>次數</th><th>平均</th><th>年估</th></tr></thead><tbody>' +
        groups.map(function (g) {
          return '<tr><td>' + esc(g.item.length > 24 ? g.item.slice(0, 24) + '…' : g.item) +
            (g.artist ? '<br><span class="pill">' + esc(g.artist) + '</span>' : '') + '</td>' +
            '<td>' + (g.monthly ? '月' : '年') + '</td><td class="num">' + g.count + '</td>' +
            '<td class="num">' + (g.avg == null ? '—' : money(g.avg)) + '</td>' +
            '<td class="num"><b>' + (g.yearly == null ? '—' : money(g.yearly)) + '</b></td></tr>';
        }).join('') +
        '<tr><td><b>年度合計</b></td><td></td><td></td><td class="num">每月約 ' + money(yearSum / 12) + '</td>' +
        '<td class="num"><b>' + money(yearSum) + '</b></td></tr></tbody></table></div>'
      : '<p class="empty">還沒有訂閱型的紀錄</p>';
  }

  /* ─────────────── 明細 ─────────────── */
  function filteredRecords() {
    var q = toHalf($('#q').value).trim().toLowerCase();
    var fc = $('#fCategory').value, fk = $('#fCard').value,
        fu = $('#fCurrency').value, fa = $('#fArtist').value;

    var list = db.records.filter(function (r) {
      if (!ui.allPeriods && !inPeriod(r)) return false;
      if (fc && (r.category || '') !== fc) return false;
      if (fk && (r.card || '') !== fk) return false;
      if (fu && (r.currency || '') !== fu) return false;
      if (fa && (r.artist || '') !== fa) return false;
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
      if (!r.postDate) meta.push('<span class="pill">未入帳</span>');
      if (r.memberId) meta.push('#' + esc(r.memberId));
      var t = total(r);

      html += '<button class="rec" type="button" data-id="' + r.id + '">' +
        '<span class="rec-chip" style="background:' + color(ci) + '">' + esc((r.category || '其他').slice(0, 3)) + '</span>' +
        '<span class="rec-body"><span class="rec-title">' + esc(r.item || '(未命名)') + '</span>' +
          '<span class="rec-meta">' + meta.join('<span>·</span>') + '</span></span>' +
        '<span class="rec-amt"><span class="rec-twd' + (r.twd == null ? ' pending' : (t < 0 ? ' credit' : '')) + '">' +
          (r.twd == null ? '待入帳' : money(t)) + '</span><br>' +
          '<span class="rec-orig">' + (r.currency && r.currency !== 'TWD' ? esc(r.currency) + ' ' + money2(num(r.amount)) : '') +
          (num(r.fee) ? '<br>費 ' + money2(num(r.fee)) : '') + '</span></span></button>';
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
    tags($('#cardEditor'), db.cards, function (i) { db.cards.splice(i, 1); save(); renderSettings(); refreshOptions(); });
    $('#verLabel').textContent = 'v' + VERSION + '　·　' + db.records.length + ' 筆紀錄';
  }

  /* ─────────────── 預算設定表單 ─────────────── */
  function openBudgetSheet() {
    var b = db.budget;
    $('#bIncome').value = b.income || '';
    $('#bSavings').value = b.savings || '';
    drawFixed(); drawInstall(); drawExclude();
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
    $('#periodBar').style.display = (t === 'settings') ? 'none' : '';
    $('#fab').hidden = (t === 'settings');
    window.scrollTo(0, 0);
    renderAll();
  }
  function renderAll() {
    renderPeriodBar();
    if (ui.tab === 'dash') renderDash();
    else if (ui.tab === 'budget') renderBudget();
    else if (ui.tab === 'list') renderList();
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
    $('#records').addEventListener('click', function (e) {
      var b = e.target.closest('.rec');
      if (b) openSheet(b.dataset.id);
    });

    ['q', 'fCategory', 'fCard', 'fCurrency', 'fArtist', 'sortBy'].forEach(function (id) {
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

    // 貼上帳單
    $('#pastePreview').onclick = renderPastePreview;
    $('#pasteBox').addEventListener('input', function () { $('#pasteCommit').disabled = true; });
    $('#pasteCommit').onclick = function () {
      if (!pasteDraft.length) return;
      db.records = db.records.concat(pasteDraft);
      save(); refreshOptions();
      var n = pasteDraft.length;
      pasteDraft = []; $('#pasteBox').value = ''; $('#pasteResult').innerHTML = '';
      $('#pasteCommit').disabled = true;
      renderAll(); toast('已加入 ' + n + ' 筆');
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
      if (v && db.cards.indexOf(v) === -1) { db.cards.push(v); save(); renderSettings(); refreshOptions(); }
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

  var latest = db.records.map(function (r) { return r.date; }).filter(Boolean).sort().pop();
  if (latest && latest < ymOf(todayISO()) + '-01') { ui.ym = ymOf(latest); ui.year = latest.slice(0, 4); }

  refreshOptions();
  bind();
  setTab('dash');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
