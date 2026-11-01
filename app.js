/* app.js: storage, sync, import/export, screens. Everything stays on this device,
   plus an optional copy in YOUR private GitHub repo. Nothing else is contacted. */
(function () {
  'use strict';
  var S = window.Stats, C = window.Charts;
  var LB = 2.2046226218, DAY = 86400000;
  var KEY = 'wt.v1', SKEY = 'wt.sync', MINDATE = '2000-01-01';
  var DEFAULTS = { unit: 'kg', hunit: 'cm', heightCm: null, goalKg: null, goalDate: '', mode: 'lose', bandKg: 1, bmiScale: 'who' };
  var DEMO = location.hash === '#demo';
  var THEMES = {
    dusk: { name: 'Violet Dusk', meta: '#120b16', swatch: ['#502d55', '#935073', '#f6dbc0', '#f8f4e9'],
      chart: { a: '#c4799f', b: '#f6dbc0', c: '#b58ac0', o: '#ff9f7a', grid: '#2e2038', mute: '#a898b0', line2: '#4a3858', bg: '#21162a' },
      rings: [['#935073', '#c4799f'], ['#f6dbc0', '#ffe9d6'], ['#7b4a85', '#b58ac0']] },
    sunset: { name: 'Sunset', meta: '#17110c', swatch: ['#ea6113', '#f88f22', '#fbb931', '#ffe3b3'],
      chart: { a: '#f88f22', b: '#fbb931', c: '#ffe3b3', o: '#ff4d2e', grid: '#34271c', mute: '#b8a58f', line2: '#4f3d2c', bg: '#261c14' },
      rings: [['#ea6113', '#f88f22'], ['#fbb931', '#ffd36b'], ['#ffe3b3', '#fff1d6']] },
    fitness: { name: 'Fitness', meta: '#000000', swatch: ['#ff2d55', '#a3f408', '#2de3f0', '#ffffff'],
      chart: { a: '#ff2d55', b: '#a3f408', c: '#2de3f0', o: '#ff9f0a', grid: '#2c2c2e', mute: '#8e8e93', line2: '#48484a', bg: '#1c1c1e' },
      rings: [['#ff2d55', '#ff6b8b'], ['#a3f408', '#5fe33b'], ['#2de3f0', '#1fa9ff']] }
  };
  var theme = 'dusk';
  try { var tt = localStorage.getItem('wt.theme'); if (THEMES[tt]) theme = tt; } catch (e) { /* ignore */ }
  function applyTheme(t) {
    theme = THEMES[t] ? t : 'dusk';
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('wt.theme', theme); } catch (e) { /* ignore */ }
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', THEMES[theme].meta);
    window.Charts.setTheme(THEMES[theme].chart);
  }
  function ringCol(i, pct) { var r = THEMES[theme].rings[i]; return { pct: pct, c1: r[0], c2: r[1] }; }
  applyTheme(theme);

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------------------------------------------------------------- store */
  var state = DEMO ? demoState() : loadState();
  var sync = loadSync();
  var ui = { tab: 'summary', range: '30', fc: true, showAll: false, msg: '', cls: '' };
  var lastA = null;

  function loadState() {
    try {
      var j = JSON.parse(localStorage.getItem(KEY));
      if (j && j.entries) { Object.keys(j.entries).forEach(function (k) { if (j.entries[k] && j.entries[k].del) j.entries[k].kg = 0; }); }
      if (j && j.entries) { Object.keys(j.entries).forEach(function (k) { if (k < MINDATE || !/^\d{4}-\d{2}-\d{2}$/.test(k)) delete j.entries[k]; }); }
      if (j && j.entries) return { entries: j.entries, settings: Object.assign({}, DEFAULTS, j.settings), st: j.st || 0 };
    } catch (e) { /* fall through */ }
    return { entries: {}, settings: Object.assign({}, DEFAULTS), st: 0 };
  }
  // Pull in whatever another tab saved, keeping the newest value per date.
  function pull() {
    if (DEMO) return false;
    try {
      var j = JSON.parse(localStorage.getItem(KEY)); if (!j || !j.entries) return false;
      var before = canon(state);
      state = merge(state, { entries: clean(j.entries), settings: j.settings || {}, st: j.st || 0 });
      return canon(state) !== before;
    } catch (e) { return false; }
  }
  function persist(sched) {
    if (DEMO) return;
    pull();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Could not save in this browser'); }
    if (sched !== false) scheduleSync();
  }
  function loadSync() {
    try { var j = JSON.parse(localStorage.getItem(SKEY)); if (j) return j; } catch (e) { /* ignore */ }
    return { owner: '', repo: '', path: 'data.json', token: '', on: false, last: null };
  }
  function saveSync() { try { localStorage.setItem(SKEY, JSON.stringify(sync)); } catch (e) { /* ignore */ } }

  function demoState() {
    var seed = 11, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var today = S.dayNum(S.localToday()), entries = {};
    for (var i = 0; i < 62; i++) {
      var n = today - 62 + i, d = S.dayStr(n);
      if ((i >= 12 && i <= 14) || (i >= 22 && i <= 25)) continue;
      var w = 70 + 12 * Math.exp(-i / 48) + (S.dow(n) === 1 ? 0.45 : 0) + (rnd() - 0.5) * 0.8;
      entries[d] = { kg: +w.toFixed(1), t: 1 };
    }
    return { entries: entries, settings: Object.assign({}, DEFAULTS, { heightCm: 168, goalKg: 68, goalDate: S.dayStr(today + 60) }), st: 1 };
  }

  function live() {
    return Object.keys(state.entries).filter(function (k) { return !state.entries[k].del; }).sort()
      .map(function (k) { return { d: k, kg: state.entries[k].kg }; });
  }
  function cfg() {
    var s = state.settings;
    return { heightCm: s.heightCm, goalKg: s.goalKg, goalDate: s.goalDate, bmiScale: s.bmiScale, mode: s.mode, bandKg: s.bandKg };
  }
  function analyze() { lastA = S.analyze(live(), cfg(), S.localToday()); return lastA; }

  /* ---------------------------------------------------------------- units + formatting */
  function unit() { return state.settings.unit; }
  function dsp(kg) { return unit() === 'lb' ? kg * LB : kg; }
  function fromDsp(v) { return unit() === 'lb' ? v / LB : v; }
  function fw(kg, dec) { return dsp(kg).toFixed(dec === undefined ? 1 : dec); }
  function sgn(x, dec) { dec = dec === undefined ? 1 : dec; var v = +x.toFixed(dec); return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(dec); }
  function fdate(d, year) {
    return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: year ? 'numeric' : undefined, timeZone: 'UTC' });
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  // Accepts 72, 72.4, 72,4 and ".5". Returns NaN for anything else.
  function parseNum(s) {
    s = String(s === null || s === undefined ? '' : s).trim().replace(',', '.');
    return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : NaN;
  }
  function num(n, d) { return +n.toFixed(d === undefined ? 2 : d); }

  /* ---------------------------------------------------------------- toast + sheets */
  var toastT, toastFn = null;
  function toast(msg, label, fn) {
    var t = $('#toast'); t.innerHTML = ''; toastFn = null;
    var sp = document.createElement('span'); sp.className = 'tmsg'; sp.textContent = msg; t.appendChild(sp);
    if (label && fn) {
      var b = document.createElement('button'); b.textContent = label; b.setAttribute('data-toast', '1'); t.appendChild(b); toastFn = fn;
    }
    t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); toastFn = null; }, label ? 8000 : 2800);
  }
  var lastFocus = null;
  function openSheet(html, mount) {
    closeSheet(); lastFocus = document.activeElement;
    var el = document.createElement('div'); el.className = 'scrim'; el.id = 'scrim';
    el.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div>';
    el.addEventListener('click', function (e) { if (e.target === el) closeSheet(); });
    document.body.appendChild(el);
    var hd = $('h2', el); if (hd) { hd.id = 'sheet-title'; $('.sheet', el).setAttribute('aria-labelledby', 'sheet-title'); }
    document.documentElement.classList.add('sheet-open');
    if (mount) mount(el);
  }
  function closeSheet() {
    var s = $('#scrim'); if (s) s.remove();
    document.documentElement.classList.remove('sheet-open');
    var back = lastFocus && document.body.contains(lastFocus) ? lastFocus : $('#view');
    if (back && back.focus) { try { back.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    lastFocus = null;
  }

  /* ---------------------------------------------------------------- logging */
  function prevKgBefore(date) {
    var ks = Object.keys(state.entries).filter(function (k) { return k < date && !state.entries[k].del; }).sort();
    return ks.length ? state.entries[ks[ks.length - 1]].kg : null;
  }
  function entryKg(date) { var e = state.entries[date]; return e && !e.del ? e.kg : null; }
  function openLog(date) {
    var today = S.localToday(); date = date || today;
    var A = lastA || analyze(), hasData = A.series && A.series.length;
    var existing = entryKg(date);
    var start = existing !== null ? existing : (hasData ? A.latestKg : null);
    openSheet(
      '<h2 id="lt">' + (existing !== null ? 'Update weight' : 'Log weight') + '</h2>' +
      '<div class="stepper"><button class="step" id="lm" aria-label="Down 0.1">−</button>' +
      '<input id="lw" class="bigin num" type="text" inputmode="decimal" autocomplete="off" placeholder="0.0" value="' + (start !== null ? fw(start, 1) : '') + '" aria-label="Weight in ' + unit() + '">' +
      '<button class="step" id="lp" aria-label="Up 0.1">+</button></div>' +
      '<div class="sub center" style="margin-top:8px" id="ld-hint">' + unit() + '</div>' +
      '<div class="chips-row"><button class="chip" id="d-today">Today</button><button class="chip" id="d-yest">Yesterday</button>' +
      '<input id="ld" class="datein" type="date" value="' + date + '" min="' + MINDATE + '" max="' + today + '" aria-label="Date"></div>' +
      '<div class="ferr hide" id="lerr"></div>' +
      '<button class="btn primary block" id="lsave">Save</button>' +
      '<button class="btn danger block hide" id="ldel" style="margin-top:10px">Delete this reading</button>',
      function (el) {
        var w = $('#lw', el), d = $('#ld', el), hint = $('#ld-hint', el), err = $('#lerr', el), btn = $('#lsave', el), title = $('h2', el);
        w.focus(); w.select();
        function refresh() {
          var dv = d.value, ex = entryKg(dv), v = parseNum(w.value);
          $('#ldel', el).classList.toggle('hide', ex === null);
          btn.textContent = ex !== null ? 'Update' : 'Save'; title.textContent = ex !== null ? 'Update weight' : 'Log weight';
          var txt = unit();
          var pk = prevKgBefore(dv);
          if (isFinite(v) && pk !== null) txt += ' · ' + sgn(v - dsp(pk)) + ' vs previous reading';
          if (ex !== null) txt += ' · replaces ' + fw(ex, 1);
          hint.textContent = txt;
          $('#d-today', el).classList.toggle('on', dv === today);
          $('#d-yest', el).classList.toggle('on', dv === S.dayStr(S.dayNum(today) - 1));
        }
        function bump(delta) {
          var v = parseNum(w.value); if (!isFinite(v)) v = start !== null ? dsp(start) : 70;
          w.value = (Math.round((v + delta) * 10) / 10).toFixed(1); refresh();
        }
        function hold(btnEl, delta) {
          var t1, t2;
          function stop() { clearTimeout(t1); clearInterval(t2); }
          btnEl.addEventListener('pointerdown', function (e) {
            if (e.button) return; bump(delta);
            t1 = setTimeout(function () { var n = 0; t2 = setInterval(function () { n++; bump(delta * (n > 15 ? 5 : 1)); }, 90); }, 450);
          });
          ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { btnEl.addEventListener(ev, stop); });
          btnEl.addEventListener('click', function (e) { if (e.detail === 0) bump(delta); }); // keyboard
        }
        hold($('#lm', el), -0.1); hold($('#lp', el), 0.1);
        var typed = false; w.addEventListener('input', function () { typed = true; });
        function loadDay() { var ex2 = entryKg(d.value); if (ex2 !== null && !typed) w.value = fw(ex2, 1); refresh(); }
        function setDay(v) { d.value = v; loadDay(); }
        $('#d-today', el).addEventListener('click', function () { setDay(today); });
        $('#d-yest', el).addEventListener('click', function () { setDay(S.dayStr(S.dayNum(today) - 1)); });
        w.addEventListener('input', refresh);
        d.addEventListener('change', loadDay);
        w.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') go();
          else if (e.key === 'ArrowUp') { e.preventDefault(); bump(0.1); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); bump(-0.1); }
        });
        function go() {
          var msg = validateEntry(d.value, w.value);
          if (msg) { err.textContent = msg; err.classList.remove('hide'); return; }
          saveEntry(d.value, w.value); closeSheet();
        }
        btn.addEventListener('click', go);
        $('#ldel', el).addEventListener('click', function () { var dv = d.value; closeSheet(); deleteEntry(dv); });
        refresh(); markDates();
      });
  }
  function validateEntry(date, raw) {
    var v = parseNum(raw);
    if (!isFinite(v)) return 'Enter a number, like 72.4';
    var kg = fromDsp(v);
    if (kg < 25 || kg > 400) return 'That looks off. Check the number and the unit (' + unit() + ').';
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Pick a date';
    if (date < MINDATE) return 'Dates before 2000 are not supported. Check the year.';
    if (date > S.localToday()) return 'Pick today or an earlier date';
    return '';
  }
  function saveEntry(date, raw) {
    var kg = fromDsp(parseNum(raw)), prev = state.entries[date] ? Object.assign({}, state.entries[date]) : null;
    var before = lastA || analyze(), prevTrend = before.series && before.series.length ? before.currentKg : null;
    state.entries[date] = { kg: +kg.toFixed(4), t: Date.now() };
    persist(); var A = analyze(); render();
    var msg = 'Saved.';
    if (A.streak.current > 1 && date >= S.dayStr(A.todayN - 1)) msg = 'Saved. ' + plural(A.streak.current, 'day') + ' streak.';
    if (A.reached && !(before.reached) && !A.maintain && A.goalKg) msg = 'Saved. Your trend is at your goal.';
    else if (prevTrend !== null && A.hasModel && !A.maintain && Math.floor(dsp(A.currentKg)) < Math.floor(dsp(prevTrend)) && date >= S.dayStr(A.todayN - 1)) msg = 'Saved. Trend passed ' + Math.floor(dsp(prevTrend)) + ' ' + unit() + '.';
    toast(msg, 'Undo', function () {
      state.entries[date] = prev ? { kg: prev.kg, t: Date.now(), del: !!prev.del } : { kg: 0, t: Date.now(), del: true };
      persist(); analyze(); render();
    });
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* ignore */ } }
  }
  function deleteEntry(date) {
    var cur = state.entries[date]; if (!cur) return;
    var old = { kg: cur.kg, t: cur.t };
    state.entries[date] = { kg: 0, t: Date.now(), del: true };
    persist(); analyze(); render();
    toast('Deleted ' + fdate(date), 'Undo', function () { state.entries[date] = { kg: old.kg, t: Date.now() }; persist(); analyze(); render(); });
  }

  /* ---------------------------------------------------------------- import / export */
  var DOWNLOAD = function (name, mime, data) {
    var url = URL.createObjectURL(new Blob([data], { type: mime })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  };
  function parseCSV(text) {
    var first = (text.split('\n')[0] || ''), delim = [',', ';', '\t'].map(function (d) { return [d, first.split(d).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += c;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }
  function p2(n) { return String(n).padStart(2, '0'); }
  var SLASH = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/;
  function parseDateCell(v, order) {
    if (v === null || v === undefined || v === '') return null;
    var ds = null;
    if (typeof v === 'number') {
      // small epsilon: some tools write dates as 46266.99999 instead of 46267
      if (v > 20000 && v < 80000) ds = new Date(Date.UTC(1899, 11, 30) + Math.floor(v + 0.001) * DAY).toISOString().slice(0, 10);
    } else if (v instanceof Date) {
      ds = v.getFullYear() + '-' + p2(v.getMonth() + 1) + '-' + p2(v.getDate());
    } else {
      var s = String(v).trim(), m;
      if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) ds = m[1] + '-' + p2(m[2]) + '-' + p2(m[3]);
      else if ((m = s.match(SLASH))) {
        var a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
        var mo = order === 'dmy' ? b : a, da = order === 'dmy' ? a : b;
        if (mo < 1 || mo > 12) return null; // does not fit the chosen order: skipped, never silently swapped
        ds = y + '-' + p2(mo) + '-' + p2(da);
      } else { var t = Date.parse(s); if (!isNaN(t)) { var dd = new Date(t); ds = dd.getFullYear() + '-' + p2(dd.getMonth() + 1) + '-' + p2(dd.getDate()); } }
    }
    if (!ds) return null;
    var yr = +ds.slice(0, 4), chk = new Date(ds + 'T00:00:00Z');
    if (yr < 2000 || yr > 2100 || isNaN(chk.getTime()) || chk.toISOString().slice(0, 10) !== ds) return null;
    return ds;
  }
  function parseWeightCell(v) {
    if (typeof v === 'number') return v;
    if (v === null || v === undefined) return null;
    var m = String(v).match(/-?\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(',', '.')) : null;
  }
  function extractRows(rows, forceOrder) {
    var hdr = -1, dc = 0, wc = 1, i, j;
    for (i = 0; i < Math.min(10, rows.length); i++) {
      var d = -1, w = -1;
      for (j = 0; j < rows[i].length; j++) {
        var s = String(rows[i][j] === null ? '' : rows[i][j]);
        if (/date|day/i.test(s) && d < 0) d = j;
        if (/weight|wt|kg|lb|lbs|pound/i.test(s) && w < 0) w = j;
      }
      if (d >= 0 && w >= 0) { hdr = i; dc = d; wc = w; break; }
    }
    // one date order for the whole file: decided by rows that can only be one way (like 13/04)
    var aBig = 0, bBig = 0, slash = 0;
    for (i = hdr + 1; i < rows.length; i++) {
      var cell = rows[i][dc]; if (typeof cell !== 'string') continue;
      var mm = cell.trim().match(SLASH); if (!mm) continue; slash++;
      if (+mm[1] > 12) aBig++; if (+mm[2] > 12) bBig++;
    }
    var certain = (aBig > 0) !== (bBig > 0), mixed = aBig > 0 && bBig > 0;
    var order = forceOrder || (aBig > 0 && !bBig ? 'dmy' : bBig > 0 && !aBig ? 'mdy' : ((navigator.language || 'en-US').toLowerCase() === 'en-us' ? 'mdy' : 'dmy'));
    var out = {}, skipped = 0, vals = [];
    for (i = hdr + 1; i < rows.length; i++) {
      var ds = parseDateCell(rows[i][dc], order), v = parseWeightCell(rows[i][wc]);
      if (!ds || v === null || !isFinite(v) || v <= 0) {
        // rows with a blank weight cell (like future rows holding only predictions) are not "skipped data"
        var wcell = rows[i][wc];
        if (wcell !== null && wcell !== undefined && String(wcell).trim() !== '') skipped++;
        continue;
      }
      out[ds] = v;
    }
    var keys = Object.keys(out).sort();
    keys.forEach(function (k) { vals.push(out[k]); });
    vals.sort(function (a, b) { return a - b; });
    var col = function (k) { return k < 26 ? String.fromCharCode(65 + k) : '#' + (k + 1); };
    return { map: out, keys: keys, skipped: skipped, median: vals.length ? vals[Math.floor(vals.length / 2)] : null,
      order: order, hasSlash: slash > 0, certain: certain, mixed: mixed,
      info: (hdr >= 0 ? 'Found headers. ' : 'No header row found, assuming ') + 'dates in column ' + col(dc) + ', weights in column ' + col(wc) + '.' };
  }
  function pickSheetRows(wb) {
    var best = null;
    for (var i = 0; i < wb.SheetNames.length; i++) {
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { header: 1, raw: true, defval: null });
      if (!best || rows.length > best.length) best = rows;
      if (rows.length >= 3) return rows;
    }
    return best || [];
  }
  function handleImportFile(file) {
    var name = file.name.toLowerCase();
    var done = function (rows) {
      var p = extractRows(rows);
      if (!p.keys.length) { toast('No dates and weights found in that file'); return; }
      openImportSheet(file.name, rows);
    };
    if (/\.(csv|txt)$/.test(name)) { var fr = new FileReader(); fr.onload = function () { done(parseCSV(String(fr.result))); }; fr.readAsText(file); }
    else if (/\.json$/.test(name)) { restoreBackup(file); }
    else {
      if (!window.XLSX) { toast('Excel reader did not load. Try CSV.'); return; }
      var r = new FileReader();
      r.onload = function () {
        try { done(pickSheetRows(XLSX.read(new Uint8Array(r.result), { type: 'array' }))); }
        catch (e) { toast('Could not read that file'); }
      };
      r.readAsArrayBuffer(file);
    }
  }
  // Decide kg or lb from the typical value. Uses your height when known: a BMI of 14 to 60 is plausible.
  function guessUnit(median) {
    var h = state.settings.heightCm, cur = unit();
    if (h) {
      var m2 = Math.pow(h / 100, 2), bK = median / m2, bL = median / LB / m2, okK = bK >= 14 && bK <= 60, okL = bL >= 14 && bL <= 60;
      if (okK && !okL) return { unit: 'kg', note: '' };
      if (okL && !okK) return { unit: 'lb', note: 'Picked lb because ' + median.toFixed(0) + ' kg would be a BMI of ' + bK.toFixed(0) + ' at your height.' };
      return { unit: cur, note: 'Typical value ' + median.toFixed(0) + ' could be kg or lb. Check "Values are in" before importing.' };
    }
    if (median > 140) return { unit: 'lb', note: 'Values look like lb, so lb is selected.' };
    if (median >= 90) return { unit: cur, note: 'Typical value ' + median.toFixed(0) + ' could be kg or lb. Check "Values are in" before importing.' };
    return { unit: 'kg', note: '' };
  }
  function openImportSheet(fname, rows) {
    var p = extractRows(rows), g = guessUnit(p.median);
    openSheet(
      '<h2>Import readings</h2>' +
      '<div class="list" id="imp-info"></div>' +
      '<div class="list"><div class="li"><label for="iu">Values are in</label><select id="iu"><option value="kg"' + (g.unit === 'kg' ? ' selected' : '') + '>kg</option><option value="lb"' + (g.unit === 'lb' ? ' selected' : '') + '>lb</option></select></div>' +
      '<div class="li' + (p.hasSlash ? '' : ' hide') + '"><label for="io">Dates are written</label><select id="io"><option value="mdy"' + (p.order === 'mdy' ? ' selected' : '') + '>month/day (03/04 is Mar 4)</option><option value="dmy"' + (p.order === 'dmy' ? ' selected' : '') + '>day/month (03/04 is Apr 3)</option></select></div>' +
      '<div class="li"><label for="im">Existing readings</label><select id="im"><option value="merge">Keep, update same dates</option><option value="replace">Replace everything</option></select></div></div>' +
      '<div class="list" id="imp-prev"></div><div class="note" id="imp-sum"></div><div class="note" id="imp-warn"></div>' +
      '<button class="btn primary block" id="idoit">Import</button>',
      function (el) {
        function summary() {
          var iu = $('#iu', el).value, mode = $('#im', el).value, ex = 0, diff = 0;
          $('#imp-info', el).innerHTML =
            '<div class="li"><span>File</span><span class="r">' + esc(fname) + '</span></div>' +
            '<div class="li"><span>Readings</span><span class="r num">' + p.keys.length + '</span></div>' +
            (p.keys.length ? '<div class="li"><span>From</span><span class="r">' + fdate(p.keys[0], true) + ' to ' + fdate(p.keys[p.keys.length - 1], true) + '</span></div>' +
            '<div class="li"><span>Typical value</span><span class="r num">' + p.median.toFixed(1) + ' ' + iu + '</span></div>' : '');
          p.keys.forEach(function (d) {
            var cur = entryKg(d); if (cur === null) return; ex++;
            var kg = iu === 'lb' ? p.map[d] / LB : p.map[d]; if (Math.abs(kg - cur) > 0.05) diff++;
          });
          var keep = {}; p.keys.forEach(function (d) { keep[d] = 1; });
          var gone = mode === 'replace' ? live().filter(function (e) { return !keep[e.d]; }).length : 0;
          var rows2 = p.keys.length <= 6 ? p.keys : p.keys.slice(0, 4), more = p.keys.length - rows2.length;
          $('#imp-prev', el).innerHTML = rows2.map(function (d) { return '<div class="li"><span>' + fdate(d, true) + '</span><span class="r num">' + p.map[d].toFixed(1) + ' ' + iu + '</span></div>'; }).join('') +
            (more > 0 ? '<div class="li"><span class="r">and ' + more + ' more, last is ' + fdate(p.keys[p.keys.length - 1], true) + '</span></div>' : '');
          $('#imp-sum', el).innerHTML = '<b>' + plural(p.keys.length - ex, 'new day') + '</b>, ' + plural(ex, 'day') + ' already ' + (ex === 1 ? 'has' : 'have') + ' a reading (' + diff + ' with a different value, will be overwritten).' +
            (mode === 'replace' ? ' <b class="red">' + plural(gone, 'existing reading') + ' not in this file will be removed.</b>' : '') +
            (iu !== unit() ? ' Values are converted. Your display unit stays ' + unit() + '.' : '');
          var warn = [];
          if (g.note) warn.push(g.note);
          if (p.hasSlash) warn.push(p.mixed ? 'This file mixes day/month and month/day dates. Rows that do not fit the chosen order are skipped.' : p.certain ? 'Date order detected from rows like 13/04.' : 'The file does not say whether 03/04 is Mar 4 or Apr 3. Check the date order above.');
          if (p.skipped) warn.push(plural(p.skipped, 'row') + ' skipped (not readable).');
          warn.push(p.info);
          $('#imp-warn', el).innerHTML = warn.map(esc).join(' ');
          $('#idoit', el).disabled = !p.keys.length;
        }
        $('#iu', el).addEventListener('change', summary); $('#im', el).addEventListener('change', summary);
        $('#io', el).addEventListener('change', function () { p = extractRows(rows, $('#io', el).value); g = guessUnit(p.median || 70); summary(); });
        summary();
        $('#idoit', el).addEventListener('click', function () {
          var iu = $('#iu', el).value, mode = $('#im', el).value, now = Date.now(), n = 0, bad = 0;
          if (mode === 'replace') Object.keys(state.entries).forEach(function (k) { state.entries[k] = { kg: 0, t: now, del: true }; });
          p.keys.forEach(function (k) {
            var kg = iu === 'lb' ? p.map[k] / LB : p.map[k];
            if (kg < 25 || kg > 400) { bad++; return; }
            state.entries[k] = { kg: +kg.toFixed(4), t: now + 1 }; n++;
          });
          persist(); closeSheet(); analyze(); render();
          toast('Imported ' + plural(n, 'reading') + (bad ? ', ' + bad + ' out of range skipped' : ''));
        });
      });
  }
  function exportCSV() {
    var rows = ['date,weight_' + unit()];
    live().forEach(function (e) { rows.push(e.d + ',' + fw(e.kg, 2)); });
    DOWNLOAD('weight.csv', 'text/csv', rows.join('\n'));
  }
  function exportXLSX() {
    if (!window.XLSX) { toast('Excel writer did not load. Use CSV.'); return; }
    var aoa = [['Date', 'Weight (' + unit() + ')']].concat(live().map(function (e) { return [e.d, +fw(e.kg, 2)]; }));
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Weight');
    XLSX.writeFile(wb, 'weight.xlsx');
  }
  function backup() { DOWNLOAD('vim-backup.json', 'application/json', JSON.stringify({ v: 1, entries: state.entries, settings: state.settings, st: state.st }, null, 1)); }
  function restoreBackup(file) {
    var r = new FileReader();
    r.onload = function () {
      var j, ents;
      try { j = JSON.parse(String(r.result)); if (!j || typeof j.entries !== 'object') throw new Error('bad'); ents = clean(j.entries); } catch (e) { toast('That is not a backup file'); return; }
      var keys = Object.keys(ents).filter(function (k) { return !ents[k].del; });
      if (!keys.length) { toast('That backup has no readings in it'); return; }
      // Restoring is an explicit choice, so the backup wins over anything newer here (including an erase).
      var now = Date.now(), added = 0, changed = 0;
      keys.forEach(function (k) {
        var cur = state.entries[k];
        if (!cur || cur.del) added++; else if (Math.abs(cur.kg - ents[k].kg) > 0.0005) changed++;
        state.entries[k] = { kg: ents[k].kg, t: now };
      });
      if (j.settings) { state.settings = Object.assign({}, DEFAULTS, j.settings); state.st = Math.max(Date.now(), state.st || 0); }
      persist(); analyze(); render();
      toast('Restored ' + plural(keys.length, 'reading') + (added || changed ? ' (' + added + ' added, ' + changed + ' changed)' : ''));
    };
    r.readAsText(file);
  }
  function clean(entries) {
    var o = {}; Object.keys(entries || {}).forEach(function (k) {
      var v = entries[k];
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k >= MINDATE && v && typeof v.kg === 'number' && isFinite(v.kg)) o[k] = { kg: v.del ? 0 : v.kg, t: +v.t || 0, del: !!v.del };
    });
    return o;
  }
  function merge(a, b) {
    var out = { entries: Object.assign({}, a.entries), settings: Object.assign({}, a.settings), st: a.st || 0 };
    Object.keys(b.entries || {}).forEach(function (k) {
      var l = out.entries[k], r = b.entries[k];
      if (!l || (r.t || 0) > (l.t || 0)) out.entries[k] = r.del ? { kg: 0, t: r.t, del: true } : { kg: r.kg, t: r.t };
    });
    if ((b.st || 0) > out.st) { out.settings = Object.assign({}, DEFAULTS, b.settings); out.st = b.st; }
    return out;
  }

  /* ---------------------------------------------------------------- GitHub sync (private repo) */
  var syncing = false, again = false, syncTimer;
  function scheduleSync() { if (DEMO || !sync.on) return; clearTimeout(syncTimer); syncTimer = setTimeout(function () { doSync(); }, 2000); }
  function setStatus(msg, cls) {
    ui.msg = msg; ui.cls = cls || '';
    var el = $('#sync-status'); if (el) { el.textContent = msg; el.className = 'status ' + (cls || ''); }
    updateChip();
  }
  function updateChip() {
    $$('.sync-chip').forEach(function (c) {
      var busy = syncing, bad = ui.cls === 'bad';
      c.className = 'sync-chip' + (busy ? ' busy' : bad ? ' bad' : sync.on ? ' ok' : '');
      c.lastChild.textContent = busy ? 'Syncing' : bad ? 'Sync problem' : sync.on ? 'Synced' : 'This device only';
    });
  }
  function chipHtml() { return '<button class="sync-chip" data-tab="settings" aria-label="Sync status"><i></i><span>This device only</span></button>'; }
  function canon(s) {
    var sk = Object.keys(s.settings || {}).sort().map(function (k) { return [k, s.settings[k]]; });
    return JSON.stringify({ e: Object.keys(s.entries).sort().map(function (k) { var v = s.entries[k]; return [k, v.kg, v.t, !!v.del]; }), st: s.st || 0, s: sk });
  }
  function b64enc(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64dec(b) { return decodeURIComponent(escape(atob(b.replace(/\s/g, '')))); }
  function ghUrl() { return 'https://api.github.com/repos/' + encodeURIComponent(sync.owner) + '/' + encodeURIComponent(sync.repo) + '/contents/' + sync.path.split('/').map(encodeURIComponent).join('/'); }
  function ghHeaders() { return { 'Authorization': 'Bearer ' + sync.token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }; }
  function mkErr(msg, fatal) { var e = new Error(msg); e.fatal = !!fatal; return e; }
  function ghErr(r) {
    if (r.status === 401) return mkErr('GitHub does not accept that token. Check it was copied in full and has not expired.', true);
    if (r.status === 403 || r.status === 429) {
      if (r.headers.get('x-ratelimit-remaining') === '0' || r.status === 429) {
        var reset = +r.headers.get('x-ratelimit-reset'), mins = reset ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60000)) : null;
        return mkErr('GitHub is rate limiting this token' + (mins ? '. Try again in about ' + plural(mins, 'minute') : '') + '. Your data is safe on this device.', false);
      }
      return mkErr('GitHub refused the write. The token needs Contents: read and write on that repo.', true);
    }
    if (r.status === 404) return mkErr('GitHub cannot find that repo or file. Check the username and repo name, and that the token covers this repo.', true);
    return mkErr('GitHub error ' + r.status + '. Will retry.', false);
  }
  function ghGet() {
    return fetch(ghUrl(), { headers: ghHeaders(), cache: 'no-store' }).then(function (r) {
      if (r.status === 404) return { data: null, sha: null };
      if (!r.ok) throw ghErr(r);
      return r.json().then(function (j) {
        if (Array.isArray(j)) throw mkErr('That file path is a folder in your repo. Use a file name like data.json.', true);
        // files over 1 MB come back without content: fetch the raw text instead
        var textP = j.content && j.encoding !== 'none' ? Promise.resolve(b64dec(j.content)) :
          (j.size > 0 ? fetch(ghUrl(), { headers: Object.assign({}, ghHeaders(), { 'Accept': 'application/vnd.github.raw+json' }), cache: 'no-store' }).then(function (rr) { if (!rr.ok) throw ghErr(rr); return rr.text(); }) : Promise.resolve(''));
        return textP.then(function (text) {
          var data;
          if (!text.trim()) data = { entries: {} };
          else { try { data = JSON.parse(text); } catch (e) { throw mkErr('The sync file in your repo is not valid. Open it on GitHub and fix or delete it, then sync again.', true); } }
          if (!data || typeof data.entries !== 'object') throw mkErr('The sync file in your repo does not look like Vim data. Pick another file name or delete it.', true);
          return { data: { entries: clean(data.entries), settings: data.settings || {}, st: data.st || 0 }, sha: j.sha };
        });
      });
    });
  }
  function ghPut(sha) {
    var body = { message: 'sync ' + new Date().toISOString(), content: b64enc(JSON.stringify({ v: 1, entries: state.entries, settings: state.settings, st: state.st })) };
    if (sha) body.sha = sha;
    return fetch(ghUrl(), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()), body: JSON.stringify(body) }).then(function (r) {
      if (r.status === 409 || r.status === 422) return 409;
      if (!r.ok) throw ghErr(r);
      return 200;
    });
  }
  // The repo must be private: this app writes your weights into it.
  function checkPrivate() {
    return fetch('https://api.github.com/repos/' + encodeURIComponent(sync.owner) + '/' + encodeURIComponent(sync.repo), { headers: ghHeaders(), cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw ghErr(r);
      return r.json();
    }).then(function (j) {
      if (j.private !== true) throw mkErr('That repo is public, so anyone could read your weights. Create a private repo and use that.', true);
    });
  }
  var retryMs = 0, retryT;
  function doSync() {
    if (DEMO || !sync.on || !sync.token || !sync.owner || !sync.repo) return Promise.resolve();
    if (syncing) { again = true; return Promise.resolve(); }
    syncing = true; setStatus('Syncing...');
    var attempt = 0;
    var step = function () {
      return ghGet().then(function (r) {
        var before = canon(state);
        if (r.data) state = merge(state, r.data);
        var after = canon(state);
        if (after !== before) { persist(false); analyze(); render(); }
        if (r.data && canon(r.data) === after) return 200;
        return ghPut(r.sha);
      }).then(function (code) {
        if (code === 409 && attempt++ < 2) return step();
        if (code === 409) throw mkErr('Sync conflict, will retry', false);
        sync.last = Date.now(); saveSync(); retryMs = 0;
        syncing = false;
        setStatus('Synced at ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 'ok');
      });
    };
    return step().catch(function (e) {
      syncing = false;
      var msg = e && e.fatal !== undefined ? e.message : (e instanceof TypeError ? 'Could not reach GitHub. Will retry when you are online.' : 'Sync problem. Will retry.');
      setStatus('Sync failed: ' + msg, 'bad');
      if (!(e && e.fatal)) { retryMs = Math.min(300000, (retryMs || 15000) * 2); clearTimeout(retryT); retryT = setTimeout(doSync, retryMs); }
    }).then(function () { syncing = false; updateChip(); if (again) { again = false; scheduleSync(); } });
  }
  window.addEventListener('online', function () { if (sync.on) doSync(); });

  /* ---------------------------------------------------------------- charts */
  var builders = {};
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  function fcHorizon(A) {
    if (!ui.fc || !A.fc) return 0;
    if (A.maintain) return 28;
    if (A.eta && A.eta.median) return clamp(S.dayNum(A.eta.late || A.eta.median) - A.last.n + 7, 21, 180);
    return 30;
  }
  function weightChart(id, H, opts) {
    opts = opts || {};
    return function (W) {
      var A = lastA, ser = A.series, last = A.last, h = effH(A);
      var days = ui.range === 'all' ? ser.length : parseInt(ui.range, 10);
      var n0 = Math.max(ser[0].n, last.n - days + 1), n1 = last.n;
      var vis = ser.filter(function (p) { return p.n >= n0; });
      var fc = null, fpts = null, k = A.calib || 1, z = A.Z80;
      if (h) {
        fpts = A.fc.points.filter(function (p) { return p.h <= h; });
        var mk = function (f) { return fpts.map(function (p) { return { n: last.n + p.h, v: dsp(f(p)) }; }); };
        fc = { mid: mk(function (p) { return p.mean; }), lo: mk(function (p) { return p.mean - z * p.sdRc; }), hi: mk(function (p) { return p.mean + z * p.sdRc; }),
          straight: A.maintain ? null : mk(function (p) { return p.straight; }) };
        n1 = last.n + h;
      }
      var byN = {}; ser.forEach(function (p) { byN[p.n] = p; });
      var u = unit();
      var readout = function (n) {
        if (n === null) return '<b class="num">' + fw(last.trend) + '</b>' + u + ' trend<br><span>' + (window.matchMedia && matchMedia('(hover: hover)').matches ? 'Hover over' : 'Touch and drag across') + ' the chart for any day</span>';
        if (n <= last.n && byN[n]) {
          var p = byN[n];
          return '<b class="num">' + fw(p.trend) + '</b>' + u + ' trend<br><span>' + fdate(p.d) + (p.raw !== null ? ' &middot; reading ' + fw(p.raw) : ' &middot; no reading (estimated)') + '</span>';
        }
        var f = fpts && fpts[n - last.n];
        return f ? '<b class="num">' + fw(f.mean) + '</b>' + u + ' forecast<br><span>' + fdate(S.dayStr(n)) + ' &middot; likely ' + fw(f.mean - z * f.sdRc) + ' to ' + fw(f.mean + z * f.sdRc) + '</span>' : '';
      };
      var withBand = vis.filter(function (p) { return p.lo !== undefined; });
      var refs = [];
      if (opts.bmi && A.bmiRefs) {
        var sc = S.SCALES[state.settings.bmiScale] || S.SCALES.who;
        A.bmiRefs.forEach(function (r) { refs.push({ v: dsp(r.kg), label: 'BMI ' + r.cut }); });
        void sc;
      }
      return '<div class="readout num" id="ro-' + id + '">' + readout(null) + '</div>' + C.lineChart({
        id: id, W: W, H: H, n0: n0, n1: n1, readout: readout, goal: A.goalKg ? dsp(A.goalKg) : null, fc: fc, refs: refs, today: fc && A.gap >= 2 ? A.todayN : null,
        band: withBand.length > 1 ? { lo: withBand.map(function (p) { return { n: p.n, v: dsp(p.lo) }; }), hi: withBand.map(function (p) { return { n: p.n, v: dsp(p.hi) }; }) } : null,
        label: 'Weight over time. Latest trend ' + fw(last.trend) + ' ' + u,
        trend: vis.map(function (p) { return { n: p.n, v: dsp(p.trend) }; }),
        raw: vis.map(function (p) { return { n: p.n, v: dsp(p.w), est: p.est, out: p.out }; })
      });
    };
  }
  function paceBuilder(H) {
    return function (W) {
      var A = lastA, ph = A.paceHist; if (!ph || ph.length < 3) return '';
      var days = ui.range === 'all' ? ph.length : parseInt(ui.range, 10);
      var vis = ph.slice(-Math.max(8, days));
      return C.paceChart({ W: W, H: H, n0: vis[0].n, n1: vis[vis.length - 1].n, target: A.goalKg && !A.maintain ? dsp(A.paceTarget.kgPerWeek) : null,
        label: 'Weight lost per week over time',
        pts: vis.map(function (p) { return { n: p.n, v: dsp(p.loss), lo: dsp(p.lo), hi: dsp(p.hi) }; }) });
    };
  }
  function probBuilder(H) {
    return function (W) {
      var A = lastA, sim = A.eta && A.eta.sim; if (!sim) return '';
      var hmax = clamp((A.eta.late ? S.dayNum(A.eta.late) - A.last.n : 120) + 14, 30, sim.H), pts = [], i;
      for (i = 0; i <= hmax; i++) pts.push({ n: A.last.n + i, p: sim.cumTrend[i] });
      var marks = [];
      if (state.settings.goalDate && S.dayNum(state.settings.goalDate) > A.todayN) marks.push({ n: S.dayNum(state.settings.goalDate), label: 'Target', color: C.T.o });
      if (A.eta.median) marks.push({ n: S.dayNum(A.eta.median), label: 'Median', color: '#fff' });
      return C.probChart({ W: W, H: H, n0: A.last.n, n1: A.last.n + hmax, pts: pts, marks: marks });
    };
  }
  function slot(id, builder) { builders[id] = builder; return '<div class="cslot" data-slot="' + id + '"></div>'; }
  var lastW = 0;
  function drawCharts() {
    var v = $('#view'), changed = false;
    $$('.cslot', v).forEach(function (el) {
      var b = builders[el.getAttribute('data-slot')], W = Math.floor(el.clientWidth);
      if (!b || W < 120 || !lastA || !lastA.series || !lastA.series.length) return;
      el.innerHTML = b(W); changed = true;
    });
    if (changed) C.bind(v);
  }

  function rangeControls() {
    var b = function (v, l) { return '<button data-range="' + v + '" class="' + (ui.range === v ? 'on' : '') + '">' + l + '</button>'; };
    return '<div class="toolbar"><div class="seg">' + b('30', '1M') + b('90', '3M') + b('all', 'All') + '</div>' +
      '<div class="seg"><button data-action="fc" class="' + (ui.fc ? 'on' : '') + '">Forecast</button></div></div>';
  }
  function rangeDays(A) { return ui.range === 'all' ? A.series.length : parseInt(ui.range, 10); }
  function effH(A) { var full = fcHorizon(A); return full ? Math.min(full, Math.max(14, rangeDays(A))) : 0; }
  function legend(A) {
    return '<div class="legend"><span><i style="background:var(--red)"></i>Trend</span><span><i class="dot" style="background:#fff;opacity:.6"></i>Reading</span>' +
      '<span><i class="box"></i>Usual scatter</span>' +
      (A.estCount ? '<span><i class="dot" style="border:1px solid #8e8e93"></i>Filled in</span>' : '') +
      (ui.fc && A.fc ? '<span class="green"><i class="dash"></i>Forecast</span>' + (A.maintain ? '' : '<span class="cyan"><i class="dot2"></i>Straight line</span>') : '') + '</div>' +
      (ui.fc && A.fc && fcHorizon(A) > effH(A) ? '<div class="sub" style="margin-top:6px">The forecast continues past this chart. Pick a longer range to see all of it.</div>' : '');
  }

  /* ---------------------------------------------------------------- screens */
  function header(title) {
    var d = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return '<div class="head"><div><div class="date">' + d + '</div><h1>' + title + '</h1></div>' + chipHtml() + '</div>' + (DEMO ? '<div class="warn" style="margin-bottom:14px">Demo data. Nothing here is saved.</div>' : '');
  }
  function emptyState(title) {
    return header(title) + '<div class="card empty">' + C.rings([ringCol(0, 0), ringCol(1, 0), ringCol(2, 0)]).replace('<svg ', '<svg class="ring-art" ') +
      '<h2>Start your first ring</h2><p class="sub">Import your Excel sheet once, or log today\'s weight.</p>' +
      '<div class="row-btns"><button class="btn primary" data-action="pick-import">Import Excel or CSV</button><button class="btn" data-action="log">Log a weight</button></div></div>';
  }
  function etaText(A) {
    var e = A.eta; if (!e || e.reached || !e.median) return null;
    var win = e.early ? fdate(e.early) + ' to ' + (e.late ? fdate(e.late) : 'later than 8 months out') : null;
    return { date: fdate(e.median, true), short: fdate(e.median), win: win };
  }

  function viewSummary(A) {
    if (!A.series || !A.series.length) return emptyState('Today');
    var u = unit(), st = A.streak, h = header('Today'), goal = A.goalKg;

    var r1, r2, r3, c7 = A.change7;
    if (A.maintain) {
      r1 = { pct: A.maint ? A.maint.pct : 0, k: 'In range, last 14 days', v: A.maint ? Math.round(A.maint.pct * 100) : 0, unitLabel: '%', n: A.maint ? A.maint.inRange + ' of ' + plural(A.maint.of, 'day') + ' within \u00b1' + fw(A.maint.band) + ' ' + u : '' };
      r2 = { pct: c7 === null ? 0 : Math.max(0, 1 - Math.abs(c7) / A.maint.band), k: 'Last 7 days', v: c7 === null ? '--' : sgn(dsp(c7)), unitLabel: u, n: 'closer to 0 is steadier' };
      if (A.maint && A.maint.inRange === 0) r1.n = 'You are ' + fw(Math.abs(A.currentKg - goal)) + ' ' + u + (A.currentKg > goal ? ' above' : ' below') + ' your range, so it starts counting once you are inside';
    } else {
      var gt = A.lostKg <= 0 ? 'Trend is not below your start yet' : goal ? fw(A.lostKg) + ' of ' + fw(A.startKg - goal) + ' ' + u : fw(A.lostKg) + ' of ' + fw(A.startKg * 0.05) + ' ' + u + ' (first 5%)';
      r1 = { pct: A.goalProgress || 0, k: goal ? 'Goal progress' : 'First 5%', v: Math.round((A.goalProgress || 0) * 100), unitLabel: '%', n: gt };
      var loss7 = c7 === null ? null : -c7;
      r2 = { pct: loss7 === null ? 0 : clamp(loss7 / A.paceTarget.kgPerWeek, 0, 1), k: 'Last 7 days', v: loss7 === null ? '--' : fw(Math.abs(loss7)), unitLabel: loss7 !== null && loss7 < 0 ? u + ' gained' : u + ' lost',
        n: 'weekly target ' + dsp(A.paceTarget.kgPerWeek).toFixed(2) + ' ' + u };
    }
    r3 = { pct: st.today ? 1 : 0, k: 'Today', v: st.current, unitLabel: st.current === 1 ? 'day streak' : 'day streak', n: st.today ? 'Logged. Ring closed' : 'Log to close the ring' };
    var rings = C.rings([ringCol(0, r1.pct), ringCol(1, r2.pct), ringCol(2, r3.pct)]);
    var rs = function (o, cls) { return '<div class="rstat"><div class="k ' + cls + '">' + o.k + '</div><div class="v ' + cls + ' num">' + o.v + '<small>' + o.unitLabel + '</small></div><div class="n num">' + o.n + '</div></div>'; };

    var warns = '';
    if (A.goalAbove) {
      warns += '<div class="card"><h3>Your goal is above your weight</h3><div class="sub">Your goal of ' + fw(goal) + ' ' + u + ' is higher than where you started (' + fw(Math.max(A.startKg, A.firstRawKg)) + ' ' + u + '), so there is nothing to lose toward. Change the goal, or switch to keeping your weight steady.</div>' +
        '<div class="row-btns"><button class="btn primary" data-tab="settings">Open settings</button><button class="btn" data-action="to-maintain">Keep it steady</button></div></div>';
    } else if (A.reached && !A.maintain && goal) {
      warns += '<div class="card"><h3>You reached your goal</h3><div class="sub">Your trend weight is at or below ' + fw(goal) + ' ' + u + '. Pick what comes next.</div>' +
        '<div class="row-btns"><button class="btn primary" data-action="to-maintain">Keep it steady</button><button class="btn" data-tab="settings">Set a new goal</button></div></div>';
    }
    if (!A.maintain && A.paceTarget.tooFast && A.paceTarget.source === 'date') warns += '<div class="warn" style="margin-bottom:14px">Your target date needs ' + dsp(A.paceTarget.kgPerWeek).toFixed(2) + ' ' + u + ' per week, above the 1% of body weight per week that is usually treated as an upper limit. A later date in Settings is safer.</div>';
    if (A.fastPace) warns += '<div class="warn" style="margin-bottom:14px">Your pace is above 1% of body weight per week. Early loss often includes water, but if it stays this fast it is worth mentioning to a doctor or dietitian.</div>';
    if (A.thin) warns += '<div class="info" style="margin-bottom:14px">Trend, pace and forecast switch on after 7 readings. You have ' + A.realCount + '.</div>';
    if (A.daysSinceLast >= 4) warns += '<div class="info" style="margin-bottom:14px">Last reading was ' + A.daysSinceLast + ' days ago. One reading is enough to get back on track.</div>';

    h += warns;
    h += '<div class="grid"><div class="card c-5"><div class="rings">' + rings + '<div class="rstats">' + rs(r1, 'red') + rs(r2, 'green') + rs(r3, 'cyan') + '</div></div></div>';

    h += '<div class="card c-7"><div class="sub" style="font-weight:600">Trend weight</div><div class="big num">' + fw(A.currentKg) + '<small>' + u + '</small></div>' +
      '<div class="chips"><span class="chip num">' + sgn(dsp(-A.lostKg)) + ' ' + u + ' since start</span>' +
      (A.change7 !== null ? '<span class="chip num">' + sgn(dsp(A.change7)) + ' last 7 days</span>' : '') +
      (A.bmi ? '<span class="chip num">BMI ' + A.bmi.value.toFixed(1) + '</span>' : '') + '</div>' +
      '<div class="sub" style="margin-top:10px">Latest reading <b class="num">' + fw(A.latestKg) + ' ' + u + '</b>, ' + fdate(A.last.d) + (A.daysSinceLast >= 3 ? ' (' + A.daysSinceLast + ' days ago)' : '') + '. The trend smooths out daily noise, so it moves slower than the scale.</div>' +
      '<div class="row-btns"><button class="btn primary" data-action="log">' + (st.today ? 'Update today' : 'Log today\'s weight') + '</button></div></div></div>';

    h += '<div class="card">' + rangeControls() + slot('sum', weightChart('sum', 240)) + legend(A) + '</div>';

    var t = '';
    if (A.maintain) t += '<div class="card tile"><div class="k">Drift</div><div class="v green num">' + (A.maint.drift !== null ? sgn(dsp(A.maint.drift), 2) : '--') + '<small>' + u + '/wk</small></div><div class="n">best streak ' + plural(st.longest, 'day') + '</div></div>';
    else t += '<div class="card tile"><div class="k">Pace</div><div class="v green num">' + (A.rate ? dsp(A.rate.lossPerWeek).toFixed(2) : '--') + '<small>' + u + '/wk</small></div><div class="n">' + (A.rate ? 'best streak ' + plural(st.longest, 'day') : 'needs 7 readings') + '</div></div>';
    if (A.maintain) {
      t += '<div class="card tile"><div class="k">Goal range</div><div class="v num">' + fw(goal) + '<small>±' + fw(A.maint.band) + '</small></div><div class="n">' + (A.maint.drift !== null ? 'drifting ' + sgn(dsp(A.maint.drift), 2) + ' ' + u + '/wk' : '') + '</div></div>';
    } else {
      t += A.lostKg < 0 ? '<div class="card tile"><div class="k">Gained so far</div><div class="v orange num">' + fw(-A.lostKg) + '<small>' + u + '</small></div><div class="n num">' + Math.abs(A.lostPct).toFixed(1) + '% above start</div></div>'
        : '<div class="card tile"><div class="k">Lost so far</div><div class="v red num">' + fw(A.lostKg) + '<small>' + u + '</small></div><div class="n num">' + A.lostPct.toFixed(1) + '% of start</div></div>';
    }
    if (A.bmi) t += '<div class="card tile"><div class="k">BMI</div><div class="v num">' + A.bmi.value.toFixed(1) + '</div><div class="n">' + A.bmi.label + (A.bmi.next ? '. ' + fw(A.bmi.next.kgToGo) + ' ' + u + ' to ' + A.bmi.next.label : '') + '</div></div>';
    else t += '<div class="card tile"><div class="k">BMI</div><div class="v">--</div><div class="n"><button class="chip" data-tab="settings">Add height</button></div></div>';
    var e = etaText(A);
    if (!A.maintain) {
      if (e) t += '<div class="card tile"><div class="k">Goal around</div><div class="v cyan">' + e.short + '</div><div class="n">' + (e.win ? 'likely ' + e.win : '') + '</div></div>';
      else if (A.eta && A.eta.reached) t += '<div class="card tile"><div class="k">Goal</div><div class="v cyan">Reached</div><div class="n">Trend is at or below goal</div></div>';
      else t += '<div class="card tile"><div class="k">Goal date</div><div class="v">--</div><div class="n">' + (goal ? (A.hasModel ? (A.rate && A.rate.lossPerWeek > 0.05 ? 'More than 8 months away at this pace' : 'Pace is flat or rising') : 'Needs 7 readings') : '<button class="chip" data-tab="settings">Set a goal</button>') + '</div></div>';
    }
    h += '<div class="tiles">' + t + '</div>';
    return h;
  }

  function viewTrends(A) {
    if (!A.series || !A.series.length) return emptyState('Trends');
    var u = unit(), h = header('Trends');
    h += '<div class="card"><h3>Weight</h3>' + rangeControls() + slot('tr', weightChart('tr', 280, { bmi: true })) + legend(A) +
      (A.bmi ? '<div class="sub" style="margin-top:8px">Dotted lines are BMI category edges at your height. BMI is a rough screen: it ignores muscle, frame and where weight sits.</div>' : '') + '</div>';
    if (A.paceHist && A.paceHist.length > 3) {
      h += '<div class="card"><h3>Pace</h3><div class="sub">Weight lost per week (' + u + '), with the shaded range the data can support. Wide shading means the pace is not pinned down yet.</div>' +
        slot('pc', paceBuilder(200)) + '</div>';
    }
    var ents = live().reverse(), shown = ui.showAll ? ents : ents.slice(0, 14);
    h += '<div class="h2">Readings (' + ents.length + ')</div><div class="list">' + shown.map(function (x) {
      return '<button class="li" data-action="edit" data-date="' + x.d + '" aria-label="Edit reading from ' + fdate(x.d, true) + '"><span>' + fdate(x.d, true) + '</span><span class="r num">' + fw(x.kg) + ' ' + u + ' &rsaquo;</span></button>';
    }).join('') + '</div>';
    if (ents.length > 14 && !ui.showAll) h += '<div class="row-btns"><button class="btn small" data-action="showall">Show all ' + ents.length + '</button></div>';
    return h;
  }

  function viewInsights(A) {
    if (!A.series || !A.series.length) return emptyState('Insights');
    var u = unit(), h = header('Insights'), cards = '';

    // forecast
    var f = '<div class="card c-7"><h3>' + (A.maintain ? 'Staying in range' : 'When you could reach your goal') + '</h3>';
    if (A.stale && A.hasModel) f += '<div class="lead">Forecast paused.</div><div class="sub">Your last reading was ' + A.gap + ' days ago, too long to project from. Log a reading and it picks up again.</div>';
    else if (!A.fc) f += '<div class="lead">Not enough data yet.</div><div class="sub">Needs 7 readings.</div>';
    else if (A.maintain) {
      f += '<div class="lead num">' + A.maint.inRange + ' of ' + A.maint.of + ' recent days inside your range</div><div class="sub">Range is ' + fw(A.goalKg - A.maint.band) + ' to ' + fw(A.goalKg + A.maint.band) + ' ' + u + '. ' +
        (A.maint.drift !== null ? 'Trend is moving ' + sgn(dsp(A.maint.drift), 2) + ' ' + u + ' per week.' : '') + '</div>';
    } else if (A.goalAbove) {
      f += '<div class="lead">Goal is above your weight.</div><div class="sub">Pick a goal below ' + fw(Math.max(A.startKg, A.firstRawKg)) + ' ' + u + ' in Settings to get a date.</div>';
    } else if (!A.goalKg) {
      var p30 = A.fc.points[30];
      f += '<div class="lead num">In 30 days: about ' + fw(p30.mean) + ' ' + u + '</div><div class="sub num">Likely range ' + fw(p30.mean - A.Z80 * p30.sdRc) + ' to ' + fw(p30.mean + A.Z80 * p30.sdRc) + ' ' + u + '. Set a goal weight in Settings to get a date.</div>';
    } else if (A.eta && A.eta.reached) f += '<div class="lead">Your trend is at or below your goal.</div>';
    else if (!A.eta || !A.eta.median) f += A.rate && A.rate.lossPerWeek > 0.05
      ? '<div class="lead">More than 8 months away.</div><div class="sub">At your recent pace of ' + dsp(A.rate.lossPerWeek).toFixed(2) + ' ' + u + ' per week, most simulated futures do not reach ' + fw(A.goalKg) + ' ' + u + ' within 8 months.</div>'
      : '<div class="lead">No date yet.</div><div class="sub">Your recent trend is flat or rising, so there is no date to estimate. A slow or flat stretch can do that.</div>';
    else {
      var e = etaText(A), dip = null;
      if (A.eta.sim && A.eta.sim.cumRead) for (var qh = 0; qh < A.eta.sim.cumRead.length; qh++) if (A.eta.sim.cumRead[qh] >= 0.1) { dip = S.dayStr(Math.max(A.todayN, A.last.n + qh)); break; }
      f += '<div class="lead">Most likely ' + e.date + '</div>';
      if (A.gap >= 2) f += '<div class="sub">Counted from today. Your last reading was ' + A.gap + ' days ago' + (A.eta.maybeNow >= 0.5 ? ', and there is a ' + Math.round(A.eta.maybeNow * 100) + '% chance you are already there. Log a reading to check.' : '.') + '</div>';
      f += '<div class="sub">' + (e.win ? 'Likely window <b>' + e.win + '</b> (10th to 90th percentile). ' : '') +
        (dip ? 'There is a 1 in 10 chance a single reading has already dipped under your goal by ' + fdate(dip) + ', but the trend is the number that counts.' : '') + '</div>';
      if (A.eta.straight) f += '<div class="sub" style="margin-top:6px">' + (A.eta.straight < A.eta.median ? 'A straight line at today\'s pace says ' + fdate(A.eta.straight) + '. Real loss usually slows, which is why the likely date is later.'
        : A.eta.straight === A.eta.median ? 'A straight line at today\'s pace gives the same date.' : 'A straight line at today\'s pace says ' + fdate(A.eta.straight) + ', later than the likely date because your pace has been picking up.') + '</div>';
      if (state.settings.goalDate && A.targetProb !== undefined) {
        var pc = Math.round(A.targetProb * 100);
        f += '<div class="chips"><span class="chip ' + (pc >= 50 ? 'green' : 'orange') + ' num">' + pc + '% chance by ' + fdate(state.settings.goalDate, true) + '</span></div>';
      }
      f += '<div style="margin-top:12px"><div class="sub" style="font-weight:600">Chance of being there by each date</div>' + slot('pb', probBuilder(160)) + '</div>';
      var v0 = A.rate ? clamp(A.rate.lossPerWeek, 0.1, 1.2) : 0.5;
      f += '<div style="margin-top:16px"><div class="sub" style="font-weight:600">What if my pace were...</div>' +
        '<input type="range" id="wi" style="width:100%" min="' + dsp(0.1).toFixed(2) + '" max="' + dsp(1.2).toFixed(2) + '" step="any" value="' + dsp(v0) + '" data-level="' + A.fc.points[Math.min(A.gap, A.fc.points.length - 1)].straight + '" data-goal="' + A.goalKg + '" data-last="' + A.todayN + '" aria-label="Weekly pace">' +
        '<div class="lead num" id="wi-out" style="margin:4px 0 0"></div></div>';
    }
    f += '</div>';
    cards += f;

    // reliability
    var rel = '<div class="card c-5"><h3>How far to trust this</h3>';
    if (A.backtest) {
      var b = A.backtest, better = b.maeNaive > 0 ? 1 - b.maeModel / b.maeNaive : 0;
      rel += '<div class="lead num">Past ' + b.h + ' day forecasts were off by ' + dsp(b.maeModel).toFixed(2) + ' ' + u + ' on average</div>' +
        '<div class="sub">I replayed your history: at each point, forecast ' + b.h + ' days ahead, then compared with what happened (' + b.n + ' tests). Guessing "no change" would have been off by ' + dsp(b.maeNaive).toFixed(2) + ' ' + u + (better > 0.03 ? ', so the model is ' + Math.round(better * 100) + '% closer.' : '. The model is not clearly better than that yet.') + '</div>' +
        (Math.abs(A.calib - 1) > 0.03 ? '<div class="sub" style="margin-top:6px">Ranges are ' + (A.calib > 1 ? 'widened' : 'narrowed') + ' by ' + Math.round(Math.abs(A.calib - 1) * 100) + '% because past forecasts were ' + (A.calib > 1 ? 'too confident' : 'more careful than needed') + '.</div>' : '') +
        '<div class="sub" style="margin-top:6px">Those ' + b.n + ' tests overlap, so they count as only about ' + Math.max(1, Math.round(b.neff || 1)) + ' independent checks. The 80% range covered ' + Math.round(b.cover80 * 100) + '% of them before adjusting. Treat this as a rough guide until you have more history.</div>' +
        (Math.abs(b.bias) > 0.15 ? '<div class="sub" style="margin-top:6px">Forecasts have tended to run ' + dsp(Math.abs(b.bias)).toFixed(2) + ' ' + u + (b.bias > 0 ? ' too low' : ' too high') + '.</div>' : '');
    } else rel += '<div class="sub">Needs about 3 weeks of readings to test itself against your history.</div>';
    rel += '</div>';
    cards += rel;

    // weekday
    var wd = '<div class="card c-6"><h3>Day of week</h3>';
    if (!A.weekday) wd += '<div class="sub">Needs about 4 weeks of readings.</div>';
    else {
      var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], order = [1, 2, 3, 4, 5, 6, 0];
      if (A.weekdaySig.length) { var t = A.weekdaySig[0]; wd += '<div class="lead">' + names[t.dow] + ' readings run ' + dsp(Math.abs(t.mean)).toFixed(1) + ' ' + u + (t.mean > 0 ? ' higher' : ' lower') + ' than your trend.</div>'; }
      else wd += '<div class="lead">No clear weekday pattern.</div>';
      if (!A.weekdaySig.length) wd += '<div class="sub">Day to day differences are smaller than normal scale noise, so no weekday pattern is shown.</div>';
      else {
      var mx = Math.max(0.3, Math.max.apply(null, A.weekday.map(function (x) { return Math.abs(x.mean); })));
      wd += '<div class="wd">' + order.map(function (i) {
        var x = A.weekday[i], pct = Math.min(100, Math.abs(x.mean) / mx * 100), col = !A.weekdaySig.length ? '#48484a' : x.mean >= 0 ? 'var(--orange)' : 'var(--cyan)';
        return '<div class="col"><div class="up">' + (x.mean > 0 ? '<div class="bar" style="height:' + pct + '%;background:' + col + '"></div>' : '') + '</div><div class="dn">' + (x.mean < 0 ? '<div class="bar" style="height:' + pct + '%;background:' + col + '"></div>' : '') + '</div><div class="lab">' + names[i] + '</div></div>';
      }).join('') + '</div><div class="sub" style="margin-top:6px">Reading minus trend, by weekday. Under about ' + dsp(0.2).toFixed(1) + ' ' + u + ' is mostly noise.</div>';
      }
    }
    wd += '</div>';
    cards += wd;

    // flat stretch
    var fl = '<div class="card c-6"><h3>Flat stretches</h3>';
    if (!A.stall) fl += '<div class="sub">' + (A.maintain ? 'Not used while keeping steady.' : 'Needs about 3 weeks of readings.') + '</div>';
    else if (A.stall.now && A.stall.change10 > 0.15) fl += '<div class="lead">Your trend has gone up ' + dsp(A.stall.change10).toFixed(2) + ' ' + u + ' in 10 days.</div><div class="sub">Rises like this are usually water, salt or a few heavier days, not fat. Keep logging and look at the trend over a few weeks.</div>';
    else if (A.stall.now) fl += '<div class="lead">Your trend has moved only ' + dsp(Math.abs(A.stall.change10)).toFixed(2) + ' ' + u + ' in 10 days.</div><div class="sub">Short flat spells are common and often water. Keep logging so the trend can show what happens next.</div>';
    else fl += '<div class="lead">Moving as expected.</div><div class="sub">Trend changed ' + sgn(dsp(A.stall.change10), 2) + ' ' + u + ' over 10 days.</div>';
    fl += '</div>';
    if (!A.maintain) cards += fl;

    // data quality + outliers
    var outs = A.series.filter(function (p) { return p.out; }).slice(-5).reverse();
    var q = '<div class="card c-12"><h3>Your data</h3><div class="lead num">' + plural(A.realCount, 'reading') + ' over ' + plural(A.spanDays, 'day') + '</div>';
    var longGaps = A.gaps.filter(function (g) { return g.days >= 2; }).sort(function (a, b) { return b.days - a.days; }).slice(0, 3);
    q += '<div class="sub">' + (A.estCount ? plural(A.estCount, 'missing day') + (A.estCount === 1 ? ' is' : ' are') + ' filled in with a straight line between readings (hollow dots), and they do not count as data. ' : 'No gaps. ') +
      (longGaps.length ? 'Longest gaps: ' + longGaps.map(function (g) { return fdate(g.from) + ' to ' + fdate(g.to); }).join(', ') + '.' : '') + '</div>';
    if (outs.length) q += '<div class="sub" style="margin-top:8px">Unusual readings, well away from the trend (usually water, salt or timing): ' + outs.map(function (p) { return fdate(p.d) + ' (' + sgn(dsp(p.raw - p.trend)) + ')'; }).join(', ') + '.</div>';
    q += '</div>';
    cards += q;
    return h + '<div class="grid top">' + cards + '</div>';
  }

  function viewSettings() {
    var s = state.settings, u = unit(), h = header('Settings');
    var tin = s.heightCm ? s.heightCm / 2.54 : null, ft = tin ? Math.floor(tin / 12) : '', inch = tin ? num(tin - ft * 12, 1) : '';
    var opt = function (v, l, cur) { return '<option value="' + v + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + l + '</option>'; };
    var hcm = s.hunit !== 'ftin';

    h += '<div class="grid"><div class="c-6">';
    h += '<div class="h2" style="margin-top:6px">Profile and goal</div>' +
      '<div class="list"><div class="li"><label for="f-u">Weight unit</label><select id="f-u" data-unit="1">' + opt('kg', 'kg', s.unit) + opt('lb', 'lb', s.unit) + '</select></div>' +
      '<div class="li"><label for="f-hu">Height unit</label><select id="f-hu">' + opt('cm', 'cm', s.hunit) + opt('ftin', 'ft and in', s.hunit) + '</select></div>' +
      '<div class="li' + (hcm ? '' : ' hide') + '" id="hrow-cm"><label for="f-h">Height (cm)</label><input id="f-h" class="num w1" type="text" inputmode="decimal" placeholder="169.5" value="' + (s.heightCm ? num(s.heightCm, 1) : '') + '"></div>' +
      '<div class="li' + (hcm ? ' hide' : '') + '" id="hrow-ft"><label for="f-ft">Height</label><span class="pair"><input id="f-ft" class="num w2" type="text" inputmode="decimal" placeholder="5" value="' + ft + '"> ft <input id="f-in" class="num w2" type="text" inputmode="decimal" placeholder="6.5" value="' + inch + '"> in</span></div>' +
      '<div class="li"><label for="f-m">I am</label><select id="f-m">' + opt('lose', 'Losing weight', s.mode) + opt('maintain', 'Keeping weight steady', s.mode) + '</select></div>' +
      '<div class="li"><label for="f-g" id="f-g-l">' + (s.mode === 'maintain' ? 'Target weight' : 'Goal weight') + ' (' + u + ')</label><input id="f-g" class="num w1" type="text" inputmode="decimal" placeholder="optional" value="' + (s.goalKg ? fw(s.goalKg, 1) : '') + '"></div>' +
      '<div class="li' + (s.mode === 'maintain' ? ' hide' : '') + '" id="row-gd"><label for="f-gd">Target date</label><span class="pair"><input id="f-gd" class="w3" type="date" value="' + esc(s.goalDate || '') + '"><button class="chip" data-action="clear-date" aria-label="Clear target date">Clear</button></span></div>' +
      '<div class="li' + (s.mode === 'maintain' ? '' : ' hide') + '" id="row-band"><label for="f-b">Stay within ± (' + u + ')</label><input id="f-b" class="num w1" type="text" inputmode="decimal" value="' + fw(s.bandKg || 1, 1) + '"></div>' +
      '<div class="li"><label for="f-bs">BMI categories</label><select id="f-bs">' + opt('who', 'Standard (WHO)', s.bmiScale) + opt('asia', 'Asia-Pacific cut-offs', s.bmiScale) + '</select></div></div>' +
      '<div class="ferr hide" id="perr"></div><div class="note" id="psaved">Changes here save automatically.</div>';

    h += '<div class="h2">Your data</div><div class="list">' +
      '<button class="li" data-action="pick-import"><span>Import Excel or CSV</span><span class="r">&rsaquo;</span></button>' +
      '<button class="li" data-action="export-xlsx"><span>Export to Excel</span><span class="r">&rsaquo;</span></button>' +
      '<button class="li" data-action="export-csv"><span>Export to CSV</span><span class="r">&rsaquo;</span></button>' +
      '<button class="li" data-action="backup"><span>Backup file (JSON)</span><span class="r">&rsaquo;</span></button>' +
      '<button class="li" data-action="pick-restore"><span>Restore backup</span><span class="r">&rsaquo;</span></button>' +
      '<button class="li" data-action="erase"><span class="red">Erase all readings</span><span class="r">&rsaquo;</span></button></div>' +
      '<div class="note">Import looks for a Date column and a Weight column and merges by date, so you can re-import an updated sheet any time.</div>';
    h += '</div><div class="c-6">';

    h += '<div class="h2" style="margin-top:6px">Appearance</div><div class="themes">' + ['dusk', 'sunset', 'fitness'].map(function (k) {
      var T = THEMES[k];
      return '<button class="theme-opt' + (k === theme ? ' on' : '') + '" data-theme-pick="' + k + '" aria-pressed="' + (k === theme) + '"><span class="sw">' + T.swatch.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span>' + T.name + '</button>';
    }).join('') + '</div>';

    h += '<div class="h2">Private sync</div><div class="note" style="margin-top:0">Optional. Keeps a copy of your data in a <b>private</b> GitHub repo so your phone and laptop match, with no daily committing.</div>' +
      '<div class="list">' +
      '<div class="li"><label for="y-o">GitHub username</label><input id="y-o" name="vim-gh-user" class="w3" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="your-name" value="' + esc(sync.owner) + '"></div>' +
      '<div class="li"><label for="y-r">Private repo</label><input id="y-r" name="vim-gh-repo" class="w3" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="vim-data" value="' + esc(sync.repo) + '"></div>' +
      '<div class="li"><label for="y-p">File</label><input id="y-p" class="w3" autocapitalize="off" autocomplete="off" value="' + esc(sync.path) + '"></div>' +
      '<div class="li"><label for="y-t">Access token</label><input id="y-t" name="vim-gh-token" class="w3" type="password" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" data-form-type="other" spellcheck="false" placeholder="github_pat_..." value="' + esc(sync.token) + '"></div></div>' +
      '<div class="row-btns" style="margin-top:0"><button class="btn primary small" data-action="sync-on">' + (sync.on ? 'Save and sync now' : 'Connect and sync') + '</button>' + (sync.on ? '<button class="btn small" data-action="sync-off">Disconnect</button>' : '') + '</div>' +
      '<div id="sync-status" class="status ' + ui.cls + '">' + esc(ui.msg || (sync.on && sync.last ? 'Last synced ' + new Date(sync.last).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : (sync.on ? 'Connected' : 'Not connected'))) + '</div>' +
      '<div class="note">The token stays in this browser only. Use a fine-grained token limited to that one repo with Contents: read and write.</div>';
    h += '<div class="h2">About the numbers</div><div class="note" style="margin-top:0">Trend weight comes from a Kalman filter: it treats each reading as the true weight plus scale noise, and learns how noisy your scale is from your own data. Forecasts are simulated from that model, then checked against your history and widened when past forecasts were too confident. Nothing leaves this device except the optional sync above.</div>';
    h += '</div></div>';
    return h;
  }

  // Saves the profile form. Returns true when saved. Untouched fields keep their stored value, so
  // converting through lb or ft/in never drifts the numbers.
  function saveProfile() {
    var s = state.settings, errs = [], u = unit(), hu = s.hunit || 'cm', mode = $('#f-m').value, A0 = lastA;
    var heightCm = s.heightCm, goalKg = s.goalKg, goalDate = '', bandKg = s.bandKg || 1;
    if (hu === 'cm') {
      var hv = $('#f-h').value.trim();
      if (!hv) heightCm = null;
      else if (!s.heightCm || hv !== String(num(s.heightCm, 1))) { var c = parseNum(hv); if (!isFinite(c) || c < 100 || c > 230) errs.push('Height should be between 100 and 230 cm (decimals are fine, like 169.5).'); else heightCm = c; }
    } else {
      var ft = $('#f-ft').value.trim(), inc = $('#f-in').value.trim(), tin = s.heightCm ? s.heightCm / 2.54 : null;
      var ft0 = tin ? String(Math.floor(tin / 12)) : '', in0 = tin ? String(num(tin - Math.floor(tin / 12) * 12, 1)) : '';
      if (!ft && !inc) heightCm = null;
      else if (!(s.heightCm && ft === ft0 && inc === in0)) {
        var f = ft ? parseNum(ft) : 0, i = inc ? parseNum(inc) : 0, cm = (f * 12 + i) * 2.54;
        if (!isFinite(f) || !isFinite(i) || f < 0 || i < 0 || cm < 100 || cm > 230) errs.push('Height should be between 3 ft 4 in and 7 ft 7 in (decimals are fine, like 5 ft 6.5 in).'); else heightCm = cm;
      }
    }
    var g = $('#f-g').value.trim();
    if (!g) goalKg = null;
    else if (!s.goalKg || g !== fw(s.goalKg, 1)) { var gv = parseNum(g), gk = fromDsp(gv); if (!isFinite(gv) || gk < 30 || gk > 400) errs.push('Goal weight looks off. Check the number and the unit (' + u + ').'); else goalKg = gk; }
    var gd = mode === 'lose' ? $('#f-gd').value : '';
    if (mode === 'maintain') {
      var bt = $('#f-b').value.trim();
      if (!s.bandKg || bt !== fw(s.bandKg, 1)) { var bv = parseNum(bt), bk = fromDsp(bv); if (!isFinite(bv) || bk <= 0 || bk > 20) errs.push('The range should be a positive number, like 1.0.'); else bandKg = bk; }
      if (!goalKg) errs.push('Enter the weight you want to keep.');
    }
    var cur = A0 && A0.series && A0.series.length ? A0.currentKg : null;
    if (goalKg && heightCm && !errs.length) {
      var bmiG = goalKg / Math.pow(heightCm / 100, 2);
      if (bmiG < 18.5) errs.push('A goal of ' + fw(goalKg) + ' ' + u + ' is a BMI of ' + bmiG.toFixed(1) + ', below the healthy range. The lowest healthy weight at your height is ' + fw(18.5 * Math.pow(heightCm / 100, 2)) + ' ' + u + '.');
    }
    if (mode === 'lose' && goalKg && cur !== null && goalKg > cur + 0.5 && !errs.length) errs.push('Your goal (' + fw(goalKg) + ' ' + u + ') is above your current weight (' + fw(cur) + ' ' + u + '). Switch to "Keeping weight steady", or set a lower goal.');
    if (gd) {
      if (!goalKg) errs.push('A target date needs a goal weight. Add one, or clear the date.');
      else if (gd <= S.localToday()) errs.push('Target date should be in the future.');
      else if (cur !== null && cur > goalKg && !errs.length) {
        var wks = (S.dayNum(gd) - S.dayNum(S.localToday())) / 7, need = (cur - goalKg) / wks, lim = 0.01 * cur;
        if (need > lim) errs.push('That date needs ' + dsp(need).toFixed(2) + ' ' + u + ' per week, above the 1% of body weight per week that is usually treated as an upper limit. The earliest date at that limit is ' + fdate(S.dayStr(S.dayNum(S.localToday()) + Math.ceil((cur - goalKg) / lim * 7)), true) + '.');
      }
      if (!errs.length) goalDate = gd;
    }
    var box = $('#perr'), note = $('#psaved');
    if (errs.length) { box.innerHTML = errs.map(esc).join('<br>'); box.classList.remove('hide'); if (note) note.textContent = 'Not saved yet. Fix the message above.'; return false; }
    box.classList.add('hide');
    var relayout = mode !== s.mode;
    s.heightCm = heightCm === null ? null : +heightCm.toFixed(2); s.goalKg = goalKg === null ? null : +goalKg.toFixed(3);
    s.goalDate = goalDate; s.mode = mode; s.bandKg = +bandKg.toFixed(3); s.bmiScale = $('#f-bs').value;
    state.st = Date.now(); persist(); analyze();
    if (relayout) render(); else if (note) note.textContent = 'Saved.';
    return true;
  }
  function saveSyncForm() {
    var o = $('#y-o').value.trim(), r = $('#y-r').value.trim(), p = $('#y-p').value.trim() || 'data.json', t = $('#y-t').value.trim();
    if (!o || !r || !t) { toast('Fill in username, repo and token'); return; }
    sync.owner = o; sync.repo = r; sync.path = p; sync.token = t; saveSync();
    setStatus('Checking the repo...');
    checkPrivate().then(function () { sync.on = true; saveSync(); return doSync(); }).then(function () {
      if (ui.cls === 'bad') { sync.on = false; saveSync(); ui.msg += ' Sync is off until this works.'; }
    }, function (e) { sync.on = false; saveSync(); setStatus(e && e.fatal !== undefined ? e.message : 'Could not reach GitHub. Check your connection and try again.', 'bad'); })
      .then(function () { if (ui.tab === 'settings') render(); });
  }

  var VIEWS = { summary: viewSummary, trends: viewTrends, insights: viewInsights, settings: viewSettings };

  function render() {
    var A = lastA || analyze(), v = $('#view'), c = $('#content');
    var y = window.scrollY, cy = c ? c.scrollTop : 0;
    builders = {};
    v.innerHTML = VIEWS[ui.tab](A);
    $$('.tab[data-tab]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === ui.tab); });
    markDates(); hints(); drawCharts(); C.animateRings(v); updateChip(); updateWhatIf();
    window.scrollTo(0, y); if (c) c.scrollTop = cy;
  }
  function hints() { $$('#view input[id^="f-"], #view input[id^="y-"]').forEach(function (el) { el.setAttribute('enterkeyhint', 'done'); }); }
  function markDates() { $$('input[type=date]').forEach(function (el) { el.classList.toggle('is-empty', !el.value); }); }
  function updateWhatIf() {
    var el = $('#wi'); if (!el) return;
    var out = $('#wi-out'), rate = fromDsp(parseFloat(el.value)), level = +el.dataset.level, goal = +el.dataset.goal, last = +el.dataset.last;
    var days = (level - goal) / (rate / 7);
    out.textContent = dsp(rate).toFixed(2) + ' ' + unit() + '/wk reaches goal ' + (days > 730 ? 'in over 2 years' : 'around ' + fdate(S.dayStr(last + Math.ceil(days)), true) + ' (' + plural(Math.ceil(days / 7), 'week') + ')');
  }

  /* ---------------------------------------------------------------- events */
  function goTab(t) { ui.tab = t; ui.showAll = false; render(); window.scrollTo(0, 0); var c = $('#content'); if (c) c.scrollTop = 0; }
  document.addEventListener('click', function (e) {
    var tb = e.target.closest('[data-toast]'); if (tb) { var fn = toastFn; $('#toast').classList.remove('show'); toastFn = null; if (fn) fn(); return; }
    var tp = e.target.closest('[data-theme-pick]'); if (tp) { applyTheme(tp.dataset.themePick); render(); return; }
    var t = e.target.closest('[data-action],[data-tab],[data-range]'); if (!t) return;
    if (t.dataset.tab) { goTab(t.dataset.tab); return; }
    if (t.dataset.range) { ui.range = t.dataset.range; render(); return; }
    var a = t.dataset.action;
    if (a === 'log') openLog();
    else if (a === 'fc') { ui.fc = !ui.fc; render(); }
    else if (a === 'edit') openLog(t.dataset.date);
    else if (a === 'del') deleteEntry(t.dataset.date);
    else if (a === 'showall') { ui.showAll = true; render(); }
    else if (a === 'pick-import') $('#file-import').click();
    else if (a === 'pick-restore') $('#file-restore').click();
    else if (a === 'export-csv') exportCSV();
    else if (a === 'export-xlsx') exportXLSX();
    else if (a === 'backup') backup();
    else if (a === 'clear-date') { var gdI = $('#f-gd'); if (gdI) { gdI.value = ''; markDates(); saveProfile(); } }
    else if (a === 'to-maintain') {
      state.settings.mode = 'maintain'; state.settings.goalDate = ''; state.st = Date.now(); persist(); analyze(); render(); toast('Now keeping weight steady around ' + fw(state.settings.goalKg) + ' ' + unit());
    }
    else if (a === 'erase') {
      openSheet('<h2>Erase all readings?</h2><div class="sub">This clears every reading on this device, and the sync file in your repo is overwritten with an empty one. Older versions stay in the private repo git history until you delete the repo. A backup file first is a good idea.</div>' +
        '<div class="row-btns"><button class="btn danger" id="erase-go">Erase everything</button><button class="btn" id="erase-no">Cancel</button></div>', function (el) {
        $('#erase-no', el).addEventListener('click', closeSheet);
        $('#erase-go', el).addEventListener('click', function () {
          var now = Date.now(); Object.keys(state.entries).forEach(function (k) { state.entries[k] = { kg: 0, t: now, del: true }; });
          persist(); closeSheet(); analyze(); render(); toast('All readings erased');
        });
      });
    }
    else if (a === 'sync-on') saveSyncForm();
    else if (a === 'sync-off') { sync.on = false; sync.token = ''; saveSync(); setStatus('Disconnected. Local data kept.'); render(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target, id = t.id || '';
    if (id === 'f-u') {
      var nu = t.value;
      if (!saveProfile()) { t.value = unit(); return; }
      state.settings.unit = nu; state.st = Date.now(); persist(); analyze(); render(); return;
    }
    if (id === 'f-hu') { state.settings.hunit = t.value; state.st = Date.now(); persist(); render(); return; }
    if (id === 'f-m') {
      var m = t.value === 'maintain'; $('#row-gd').classList.toggle('hide', m); $('#row-band').classList.toggle('hide', !m);
      $('#f-g-l').textContent = (m ? 'Target weight' : 'Goal weight') + ' (' + unit() + ')';
    }
    if (id.indexOf('f-') === 0) { saveProfile(); return; }
    if (id.indexOf('y-') === 0) { var key = { 'y-o': 'owner', 'y-r': 'repo', 'y-p': 'path', 'y-t': 'token' }[id]; if (key) { sync[key] = t.value.trim(); if (key === 'path' && !sync.path) sync.path = 'data.json'; saveSync(); } }
  });
  document.addEventListener('input', function (e) { if (e.target.id === 'wi') updateWhatIf(); if (e.target.type === 'date') markDates(); });
  document.addEventListener('change', function (e) { if (e.target.type === 'date') markDates(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeSheet(); return; }
    if (e.key === 'Tab' && $('#scrim')) {
      var f = $$('button, input, select, [href]', $('#scrim')).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
      if (f.length) {
        var first = f[0], last = f[f.length - 1];
        if (!$('#scrim').contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !$('#scrim')) {
      var iid = e.target.id || '';
      if (iid.indexOf('f-') === 0) { e.preventDefault(); saveProfile(); return; }
      if (iid.indexOf('y-') === 0) { e.preventDefault(); saveSyncForm(); return; }
    }
    var tag = (e.target.tagName || '').toLowerCase();
    if ((e.key === 'l' || e.key === 'L') && !e.metaKey && !e.ctrlKey && !e.altKey && tag !== 'input' && tag !== 'select' && tag !== 'textarea' && !$('#scrim')) { e.preventDefault(); openLog(); }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { pull(); analyze(); render(); doSync(); } });
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY || !pull()) return;
    analyze();
    var ae = document.activeElement;
    if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName) && $('#view').contains(ae)) return; // do not wipe a half-typed form
    render();
  });

  function init() {
    ['import', 'restore'].forEach(function (k) {
      var f = document.createElement('input'); f.type = 'file'; f.id = 'file-' + k; f.className = 'hide';
      f.accept = k === 'import' ? '.xlsx,.xls,.csv,.txt,.json' : '.json';
      f.addEventListener('change', function () { if (f.files[0]) { if (k === 'import') handleImportFile(f.files[0]); else restoreBackup(f.files[0]); } f.value = ''; });
      document.body.appendChild(f);
    });
    analyze(); render();
    // charts are drawn at real pixel width, so redraw when the window or frame changes size
    var c = $('#content'); lastW = c.clientWidth;
    var pending = false, onSize = function () {
      var w = c.clientWidth; if (Math.abs(w - lastW) < 2 || pending) return; lastW = w; pending = true;
      requestAnimationFrame(function () { pending = false; drawCharts(); });
    };
    if (window.ResizeObserver) new ResizeObserver(onSize).observe(c); else window.addEventListener('resize', onSize);
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && !DEMO) {
      var hadSW = !!navigator.serviceWorker.controller, reloaded = false;
      // when a new version takes over, reload once so you are never stuck on old files
      navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadSW && !reloaded) { reloaded = true; location.reload(); } });
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (r) { r.update(); }).catch(function () { /* offline cache is optional */ });
    }
    doSync();
    var dayNow = S.localToday();
    setInterval(function () { var d2 = S.localToday(); if (d2 !== dayNow) { dayNow = d2; analyze(); render(); } }, 60000);
  }
  init();
  window.__wt = { state: function () { return state; }, setTab: function (t) { goTab(t); }, ui: ui, render: render, analyze: function () { return lastA; }, rerun: function () { return analyze(); } };
})();
