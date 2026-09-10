/* FC 記帳本 — 純前端、離線可用、資料存於 localStorage */
(function () {
  'use strict';

  var STORE_KEY = 'fcLedger.v1';
  var THEME_KEY = 'fcLedger.theme';
  var VERSION = '1.0.0';
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
  function money2(n) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function color(i) { return 'var(' + PALETTE[i % PALETTE.length] + ')'; }

  /* ─────────────── 日期（含民國） ─────────────── */
  function toROC(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    if (p.length !== 3) return iso;
    return (Number(p[0]) - 1911) + '/' + p[1] + '/' + p[2];
  }
  // 接受 2026-04-06、2026/4/6、115/04/06、2026.04.06
  function toISO(raw) {
    if (!raw) return '';
    var s = String(raw).trim().replace(/[.年月]/g, '/').replace(/日/g, '');
    var m = s.match(/^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (!m) return '';
    var y = Number(m[1]);
    if (y < 1911) y += 1911;               // 民國年
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return y + '-' + pad(Number(m[2])) + '-' + pad(Number(m[3]));
  }
  function ymOf(iso) { return iso ? iso.slice(0, 7) : ''; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysBetween(aISO, bISO) {
    return Math.round((Date.parse(bISO) - Date.parse(aISO)) / 86400000);
  }
  function addMonths(iso, n) {
    var p = iso.split('-'), d = new Date(Number(p[0]), Number(p[1]) - 1 + n, Number(p[2]));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function labelYM(ym) {
    var p = ym.split('-');
    return '民國 ' + (Number(p[0]) - 1911) + ' 年 ' + Number(p[1]) + ' 月　(' + ym + ')';
  }

  /* ─────────────── 狀態 ─────────────── */
  var db = { version: 1, records: [], categories: [], cards: [] };
  var ui = {
    tab: 'dash',
    mode: 'month',          // month | year | all
    ym: ymOf(todayISO()),
    year: todayISO().slice(0, 4),
    editingId: null,
    allPeriods: false
  };

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { /* 隱私模式 */ }
    if (raw) {
      try {
        var d = JSON.parse(raw);
        db.records = Array.isArray(d.records) ? d.records : [];
        db.categories = d.categories && d.categories.length ? d.categories : window.SEED.categories.slice();
        db.cards = d.cards && d.cards.length ? d.cards : window.SEED.cards.slice();
        return;
      } catch (e) { /* 壞掉就重種 */ }
    }
    seed();
  }
  function seed() {
    db.records = window.SEED.records.map(function (r) {
      var c = {}; for (var k in r) c[k] = r[k];
      c.id = uid();
      return c;
    });
    db.categories = window.SEED.categories.slice();
    db.cards = window.SEED.cards.slice();
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
      .sort(function (a, b) { return b.value - a.value; });
  }

  /* ─────────────── 圖表 ─────────────── */
  function renderBars(el, rows) {
    if (!rows.length) { el.innerHTML = '<p class="empty">這段期間沒有資料</p>'; return; }
    var max = rows[0].value || 1;
    el.innerHTML = rows.map(function (r, i) {
      var pct = Math.max(2, (r.value / max) * 100);
      return '<div class="bar-row">' +
        '<span class="bar-name" title="' + esc(r.name) + '">' + esc(r.name) + '</span>' +
        '<span class="bar-track"><span class="bar-fill" style="width:' + pct.toFixed(1) + '%;background:' + color(i) + '"></span></span>' +
        '<span class="bar-val">' + money(r.value) + '</span>' +
        '</div>';
    }).join('');
  }

  function renderDonut(el, legendEl, rows) {
    var sum = rows.reduce(function (a, r) { return a + r.value; }, 0);
    if (!sum) {
      el.innerHTML = '';
      legendEl.innerHTML = '<li class="empty" style="padding:12px">沒有資料</li>';
      return;
    }
    var R = 60, C = 2 * Math.PI * R, off = 0, segs = '';
    rows.forEach(function (r, i) {
      var len = (r.value / sum) * C;
      segs += '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + color(i) + '" stroke-width="19"' +
        ' stroke-dasharray="' + (len - 1.5).toFixed(2) + ' ' + (C - len + 1.5).toFixed(2) + '"' +
        ' stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)"></circle>';
      off += len;
    });
    el.innerHTML = '<svg viewBox="0 0 140 140" role="img" aria-label="分類佔比">' + segs +
      '<text x="70" y="66" text-anchor="middle" font-size="10" fill="currentColor" opacity=".6">合計</text>' +
      '<text x="70" y="82" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">' + money(sum) + '</text>' +
      '</svg>';
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
    // 補滿中間沒消費的月份，最多顯示最近 12 個月
    var all = [], cur = keys[0] + '-01', last = keys[keys.length - 1] + '-01', guard = 0;
    while (cur <= last && guard++ < 240) { all.push(cur.slice(0, 7)); cur = addMonths(cur, 1); }
    var show = all.slice(-12);
    var max = Math.max.apply(null, show.map(function (k) { return map[k] || 0; })) || 1;

    var W = 320, H = 130, pad = 18, bw = (W - pad * 2) / show.length;
    var bars = show.map(function (k, i) {
      var v = map[k] || 0;
      var h = Math.max(v ? 3 : 0, (v / max) * (H - 40));
      var x = pad + i * bw + bw * 0.16, w = bw * 0.68, y = H - 22 - h;
      var on = (ui.mode === 'month' && k === ui.ym);
      return '<g><rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) +
        '" rx="3" fill="' + (on ? 'var(--accent)' : 'var(--c1)') + '" opacity="' + (on ? 1 : .42) + '"></rect>' +
        '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" text-anchor="middle" font-size="7.5" fill="currentColor" opacity=".75">' +
        (v ? money(v) : '') + '</text>' +
        '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="8" fill="currentColor" opacity=".55">' +
        Number(k.slice(5)) + '月</text></g>';
    }).join('');
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="每月支出">' + bars + '</svg>';
  }

  /* ─────────────── 總覽 ─────────────── */
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
    renderBars($('#chartArtist'), groupSum(list, function (r) { return r.artist; }).slice(0, 8));
    renderBars($('#chartCard'), groupSum(list, function (r) { return r.card; }));

    // 幣別表
    var cm = {};
    list.forEach(function (r) {
      var c = r.currency || '—';
      if (!cm[c]) cm[c] = { orig: 0, twd: 0, n: 0 };
      cm[c].orig += num(r.amount); cm[c].twd += total(r); cm[c].n++;
    });
    var keys = Object.keys(cm).sort(function (a, b) { return cm[b].twd - cm[a].twd; });
    $('#tblCurrency').innerHTML = keys.length
      ? '<div class="tbl-scroll"><table><thead><tr><th>幣別</th><th>筆數</th><th>原幣合計</th><th>台幣合計</th><th>均價</th></tr></thead><tbody>' +
        keys.map(function (k) {
          var c = cm[k];
          var rate = c.orig ? (c.twd / c.orig) : 0;
          return '<tr><td><b>' + esc(k) + '</b></td><td class="num">' + c.n + '</td>' +
            '<td class="num">' + money2(c.orig) + '</td><td class="num">' + money(c.twd) + '</td>' +
            '<td class="num">' + (rate ? rate.toFixed(4) : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="empty">沒有資料</p>';
  }

  function periodText() {
    if (ui.mode === 'all') return '全部期間';
    if (ui.mode === 'year') return '民國 ' + (Number(ui.year) - 1911) + ' 年';
    return '民國 ' + (Number(ui.ym.slice(0, 4)) - 1911) + '/' + ui.ym.slice(5);
  }

  /* ─────────────── 明細 ─────────────── */
  function filteredRecords() {
    var q = $('#q').value.trim().toLowerCase();
    var fc = $('#fCategory').value, fk = $('#fCard').value,
        fu = $('#fCurrency').value, fa = $('#fArtist').value;

    var list = db.records.filter(function (r) {
      if (!ui.allPeriods && !inPeriod(r)) return false;
      if (fc && (r.category || '') !== fc) return false;
      if (fk && (r.card || '') !== fk) return false;
      if (fu && (r.currency || '') !== fu) return false;
      if (fa && (r.artist || '') !== fa) return false;
      if (q) {
        var hay = [r.item, r.note, r.memberId, r.artist, r.category, r.card].join(' ').toLowerCase();
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
    $('#listTotal').innerHTML = list.length
      ? '共 ' + list.length + ' 筆 · 合計 <b>NT$ ' + money(sum) + '</b>'
      : '';

    if (!list.length) {
      $('#records').innerHTML = '<p class="empty">沒有符合的紀錄。<br>試著切換上方月份，或勾選「顯示所有期間」。</p>';
      return;
    }

    var byDate = $('#sortBy').value.indexOf('date') === 0;
    var html = '', lastYM = null;
    var catIdx = {};
    db.categories.forEach(function (c, i) { catIdx[c] = i; });

    list.forEach(function (r) {
      if (byDate) {
        var ym = ymOf(r.date);
        if (ym !== lastYM) {
          lastYM = ym;
          var mSum = list.filter(function (x) { return ymOf(x.date) === ym; })
            .reduce(function (a, x) { return a + total(x); }, 0);
          html += '<div class="month-sep"><span>' + (ym ? (Number(ym.slice(0, 4)) - 1911) + ' 年 ' + Number(ym.slice(5)) + ' 月' : '無日期') +
            '</span><span>NT$ ' + money(mSum) + '</span></div>';
        }
      }
      var ci = catIdx[r.category] != null ? catIdx[r.category] : 8;
      var chipTxt = (r.category || '其他').slice(0, 2);
      var meta = [];
      meta.push(toROC(r.date) || '無日期');
      if (r.card) meta.push('<span class="pill">' + esc(r.card) + '</span>');
      if (r.artist) meta.push(esc(r.artist));
      if (!r.postDate) meta.push('<span class="pill">未入帳</span>');
      if (r.memberId) meta.push('#' + esc(r.memberId));

      html += '<button class="rec" type="button" data-id="' + r.id + '">' +
        '<span class="rec-chip" style="background:' + color(ci) + '">' + esc(chipTxt) + '</span>' +
        '<span class="rec-body">' +
          '<span class="rec-title">' + esc(r.item || '(未命名)') + '</span>' +
          '<span class="rec-meta">' + meta.join('<span>·</span>') + '</span>' +
        '</span>' +
        '<span class="rec-amt">' +
          '<span class="rec-twd' + (r.twd == null ? ' pending' : '') + '">' +
            (r.twd == null ? '待入帳' : money(total(r))) + '</span><br>' +
          '<span class="rec-orig">' + (r.currency ? esc(r.currency) + ' ' + money2(num(r.amount)) : '') +
          (num(r.fee) ? '<br>費 ' + money2(num(r.fee)) : '') + '</span>' +
        '</span>' +
        '</button>';
    });
    $('#records').innerHTML = html;
  }

  /* ─────────────── 訂閱 / 提醒 ─────────────── */
  function subscriptionGroups() {
    var map = {};
    db.records.forEach(function (r) {
      if (r.category !== '訂閱月費' && r.category !== '年費會員') return;
      var key = (r.item || '') + '||' + (r.memberId || '');
      if (!map[key]) map[key] = { item: r.item, memberId: r.memberId, artist: r.artist, category: r.category, recs: [] };
      map[key].recs.push(r);
    });
    return Object.keys(map).map(function (k) {
      var g = map[k];
      g.recs.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      var last = g.recs[0];
      g.last = last;
      g.lastDate = last.date;
      var billed = g.recs.filter(function (r) { return r.twd != null; });
      g.avg = billed.length ? billed.reduce(function (a, r) { return a + total(r); }, 0) / billed.length : null;
      g.count = g.recs.length;
      g.monthly = g.category === '訂閱月費';
      g.next = last.nextDue || addMonths(last.date, g.monthly ? 1 : 12);
      g.yearly = g.avg == null ? null : (g.monthly ? g.avg * 12 : g.avg);
      return g;
    }).sort(function (a, b) { return (a.next || '').localeCompare(b.next || ''); });
  }

  function renderSub() {
    var groups = subscriptionGroups();
    var today = todayISO();

    var due = groups.filter(function (g) {
      var d = daysBetween(today, g.next);
      return d <= 90;
    });
    $('#dueList').innerHTML = due.length ? due.map(function (g) {
      var d = daysBetween(today, g.next);
      var cls = d < 0 ? 'over' : (d <= 14 ? 'soon' : '');
      var txt = d < 0 ? '已過 ' + (-d) + ' 天' : (d === 0 ? '今天' : d + ' 天後');
      return '<div class="due"><div class="due-body">' +
        '<div class="due-name">' + esc(g.item) + '</div>' +
        '<div class="due-sub">' + toROC(g.next) + '　·　' + (g.avg == null ? '金額待補' : '約 NT$ ' + money(g.avg)) +
        (g.memberId ? '　·　#' + esc(g.memberId) : '') + '</div>' +
        '</div><span class="due-badge ' + cls + '">' + txt + '</span></div>';
    }).join('') : '<p class="empty">未來 90 天內沒有到期的訂閱 🎉</p>';

    $('#subList').innerHTML = groups.length
      ? '<div class="tbl-scroll"><table><thead><tr><th>項目</th><th>週期</th><th>次數</th><th>平均</th><th>年估</th></tr></thead><tbody>' +
        groups.map(function (g) {
          return '<tr><td>' + esc(g.item.length > 26 ? g.item.slice(0, 26) + '…' : g.item) +
            (g.artist ? '<br><span class="pill">' + esc(g.artist) + '</span>' : '') + '</td>' +
            '<td>' + (g.monthly ? '月' : '年') + '</td>' +
            '<td class="num">' + g.count + '</td>' +
            '<td class="num">' + (g.avg == null ? '—' : money(g.avg)) + '</td>' +
            '<td class="num"><b>' + (g.yearly == null ? '—' : money(g.yearly)) + '</b></td></tr>';
        }).join('') +
        '<tr><td><b>年度固定支出合計</b></td><td></td><td></td><td></td><td class="num"><b>' +
        money(groups.reduce(function (a, g) { return a + (g.yearly || 0); }, 0)) + '</b></td></tr>' +
        '</tbody></table></div>'
      : '<p class="empty">還沒有訂閱型的紀錄</p>';
  }

  /* ─────────────── 設定 ─────────────── */
  function renderSettings() {
    function tags(el, arr, onDel) {
      el.innerHTML = arr.map(function (v, i) {
        return '<span class="tag">' + esc(v) + '<button type="button" data-i="' + i + '" aria-label="刪除">×</button></span>';
      }).join('') || '<span class="hint">（無）</span>';
      $$('button', el).forEach(function (b) {
        b.onclick = function () { onDel(Number(b.dataset.i)); };
      });
    }
    tags($('#catEditor'), db.categories, function (i) {
      db.categories.splice(i, 1); save(); renderSettings(); refreshOptions();
    });
    tags($('#cardEditor'), db.cards, function (i) {
      db.cards.splice(i, 1); save(); renderSettings(); refreshOptions();
    });
    $('#verLabel').textContent = 'v' + VERSION + '　·　' + db.records.length + ' 筆紀錄';
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
    var head = rows[0].map(function (h) { return h.trim(); });
    var idx = {};
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
            var c = {}; for (var k in r) c[k] = r[k];
            c.id = c.id || uid();
            c.date = toISO(c.date); c.postDate = toISO(c.postDate); c.nextDue = toISO(c.nextDue);
            return c;
          });
          if (d.categories && d.categories.length) db.categories = d.categories;
          if (d.cards && d.cards.length) db.cards = d.cards;
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

  /* ─────────────── 表單 ─────────────── */
  function refreshOptions() {
    function fill(sel, arr, keepEmpty, emptyLabel) {
      var v = sel.value;
      sel.innerHTML = (keepEmpty ? '<option value="">' + emptyLabel + '</option>' : '') +
        arr.map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + '</option>'; }).join('');
      if (arr.indexOf(v) > -1 || v === '') sel.value = v;
    }
    fill($('#selCategory'), db.categories, false);
    fill($('#selCard'), db.cards, false);
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

  // form.elements.item 會被 HTMLFormControlsCollection.item() 蓋掉，一律用 namedItem 取值
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
      if (db.categories.indexOf(r.category) === -1 && r.category) { db.categories.push(r.category); refreshOptions(); }
      if (db.cards.indexOf(r.card) === -1 && r.card) { db.cards.push(r.card); refreshOptions(); }
      fe('category').value = r.category || db.categories[0];
      fe('card').value = r.card || db.cards[0];
      $('#deleteRec').hidden = false;
    } else {
      $('#sheetTitle').textContent = '新增一筆';
      fe('date').value = todayISO();
      fe('currency').value = 'JPY';
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
    } else if (t > 0) {
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
    else lbl.textContent = labelYM(ui.ym);
    $('#prevPeriod').style.visibility = ui.mode === 'all' ? 'hidden' : '';
    $('#nextPeriod').style.visibility = ui.mode === 'all' ? 'hidden' : '';
  }

  /* ─────────────── 分頁 / 渲染 ─────────────── */
  function setTab(t) {
    ui.tab = t;
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + t; });
    $$('.tab').forEach(function (b) { b.classList.toggle('is-on', b.dataset.tab === t); });
    $('#periodBar').style.display = (t === 'dash' || t === 'list') ? '' : 'none';
    $('#fab').hidden = (t === 'settings');
    window.scrollTo(0, 0);
    renderAll();
  }
  function renderAll() {
    renderPeriodBar();
    if (ui.tab === 'dash') renderDash();
    else if (ui.tab === 'list') renderList();
    else if (ui.tab === 'sub') renderSub();
    else if (ui.tab === 'settings') renderSettings();
  }

  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2000);
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
    $('#form').addEventListener('submit', function (ev) { ev.preventDefault(); saveSheet(); });
    $('#form').addEventListener('input', function (ev) {
      if (ev.target.type === 'date') updateRocHints();
      updateRate();
    });
    $('#deleteRec').onclick = function () {
      if (!ui.editingId || !confirm('確定刪除這筆紀錄？')) return;
      db.records = db.records.filter(function (r) { return r.id !== ui.editingId; });
      save(); refreshOptions(); closeSheet(); renderAll(); toast('已刪除');
    };

    $('#records').addEventListener('click', function (ev) {
      var b = ev.target.closest('.rec');
      if (b) openSheet(b.dataset.id);
    });

    ['q', 'fCategory', 'fCard', 'fCurrency', 'fArtist', 'sortBy'].forEach(function (id) {
      $('#' + id).addEventListener('input', renderList);
      $('#' + id).addEventListener('change', renderList);
    });
    $('#allPeriods').onchange = function () { ui.allPeriods = this.checked; renderList(); };

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
      if (!confirm('這會用 Excel 的 24 筆初始資料覆蓋目前所有紀錄，確定嗎？')) return;
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

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !$('#sheet').hidden) closeSheet();
    });
  }

  /* ─────────────── 啟動 ─────────────── */
  initTheme();
  load();

  // 開啟時預設停在「最新一筆消費」所在的月份
  var latest = db.records.map(function (r) { return r.date; }).filter(Boolean).sort().pop();
  if (latest) { ui.ym = ymOf(latest); ui.year = latest.slice(0, 4); }

  refreshOptions();
  bind();
  setTab('dash');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 本機 file:// 會失敗，忽略 */ });
    });
  }
})();
