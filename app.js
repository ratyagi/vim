/* app.js: storage, sync, import/export, screens. Everything stays on this device,
   plus an optional copy in YOUR private GitHub repo. Nothing else is contacted. */
(function () {
  'use strict';
  var S = window.Stats, C = window.Charts;
  var LB = 2.2046226218, DAY = 86400000;
  var KEY = 'wt.v1', SKEY = 'wt.sync';
  var DEFAULTS = { unit: 'kg', heightCm: null, age: null, sex: '', activity: 1.375, goalKg: null, goalDate: '', bmiScale: 'who' };
  var DEMO = location.hash === '#demo';

  function $(s, el) { return (el || document).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------------------------------------------------------------- store */
  var state = DEMO ? demoState() : loadState();
  var sync = loadSync();
  var ui = { tab: 'summary', range: '30', fc: true, showAll: false, msg: '', cls: '' };
  var lastA = null;

  function loadState() {
    try {
      var j = JSON.parse(localStorage.getItem(KEY));
      if (j && j.entries) return { entries: j.entries, settings: Object.assign({}, DEFAULTS, j.settings), st: j.st || 0 };
    } catch (e) { /* fall through */ }
    return { entries: {}, settings: Object.assign({}, DEFAULTS), st: 0 };
  }
  function persist(sched) {
    if (DEMO) return;
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
      var gap = (i >= 12 && i <= 14) || (i >= 22 && i <= 25);
      if (gap) continue;
      var w = 70 + 12 * Math.exp(-i / 48) + (S.dow(n) === 1 ? 0.45 : 0) + (rnd() - 0.5) * 0.8;
      entries[d] = { kg: +w.toFixed(1), t: 1 };
    }
    return { entries: entries, settings: Object.assign({}, DEFAULTS, { heightCm: 168, age: 30, goalKg: 68, goalDate: S.dayStr(today + 60) }), st: 1 };
  }

  function live() {
    return Object.keys(state.entries).filter(function (k) { return !state.entries[k].del; }).sort()
      .map(function (k) { return { d: k, kg: state.entries[k].kg }; });
  }
  function cfg() {
    var s = state.settings;
    return { heightCm: s.heightCm, age: s.age, sex: s.sex, activity: s.activity, goalKg: s.goalKg, goalDate: s.goalDate, bmiScale: s.bmiScale };
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

  /* ---------------------------------------------------------------- toast + sheets */
  var toastT;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }
  function openSheet(html, mount) {
    closeSheet();
    var el = document.createElement('div'); el.className = 'scrim'; el.id = 'scrim';
    el.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div>';
    el.addEventListener('click', function (e) { if (e.target === el) closeSheet(); });
    document.body.appendChild(el);
    if (mount) mount(el);
  }
  function closeSheet() { var s = $('#scrim'); if (s) s.remove(); }

  /* ---------------------------------------------------------------- logging */
  function openLog(date, kg) {
    var today = S.localToday(); date = date || today;
    var existing = kg !== undefined ? kg : (state.entries[date] && !state.entries[date].del ? state.entries[date].kg : null);
    openSheet(
      '<h2>' + (existing !== null ? 'Update weight' : 'Log weight') + '</h2>' +
      '<input id="lw" class="bigin num" type="number" step="0.1" inputmode="decimal" placeholder="0.0" value="' + (existing !== null ? fw(existing, 1) : '') + '" aria-label="Weight in ' + unit() + '">' +
      '<div class="sub" style="text-align:center;margin-top:6px">' + unit() + '</div>' +
      '<input id="ld" class="datein" type="date" value="' + date + '" max="' + today + '" aria-label="Date">' +
      '<button class="btn primary block" id="lsave">Save</button>',
      function (el) {
        var w = $('#lw', el); w.focus(); w.select();
        var go = function () {
          var d = $('#ld', el).value;
          if (saveEntry(d, w.value)) closeSheet();
        };
        $('#lsave', el).addEventListener('click', go);
        w.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      });
  }
  function saveEntry(date, raw) {
    var v = parseFloat(String(raw).replace(',', '.'));
    if (!isFinite(v)) { toast('Enter a number'); return false; }
    var kg = fromDsp(v);
    if (kg < 25 || kg > 400) { toast('That looks off. Check the number and unit.'); return false; }
    if (!date || date > S.localToday()) { toast('Pick today or an earlier date'); return false; }
    var before = lastA || analyze();
    var earned = {}; (before.awards || []).forEach(function (a) { if (a.earned) earned[a.id] = 1; });
    var prevLow = before.lowestTrend;
    state.entries[date] = { kg: +kg.toFixed(4), t: Date.now() };
    persist(); var A = analyze(); render();
    var msg = 'Saved.';
    if (A.streak.current > 1 && date >= S.dayStr(A.todayN - 1)) msg = 'Saved. ' + A.streak.current + ' day streak.';
    var fresh = (A.awards || []).filter(function (a) { return a.earned && !earned[a.id]; });
    if (fresh.length) msg = fresh[0].icon + ' New award: ' + fresh[0].title;
    else if (A.series.length > 7 && A.currentKg < prevLow - 1e-6) msg = 'Saved. New lowest trend weight.';
    toast(msg);
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* ignore */ } }
    return true;
  }
  function deleteEntry(date) {
    if (!state.entries[date]) return;
    state.entries[date] = { kg: state.entries[date].kg, t: Date.now(), del: true };
    persist(); analyze(); render(); toast('Deleted ' + fdate(date));
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
  function parseDateCell(v) {
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
      else if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/))) {
        var a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
        var mo = a, da = b; if (a > 12 && b <= 12) { mo = b; da = a; }
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
  function extractRows(rows) {
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
    var out = {}, skipped = 0, vals = [];
    for (i = hdr + 1; i < rows.length; i++) {
      var ds = parseDateCell(rows[i][dc]), v = parseWeightCell(rows[i][wc]);
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
      openImportSheet(file.name, p);
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
  function openImportSheet(fname, p) {
    var guessLb = p.median > 140 && unit() === 'kg';
    var u = guessLb ? 'lb' : unit();
    openSheet(
      '<h2>Import readings</h2>' +
      '<div class="list"><div class="li"><span>File</span><span class="r">' + esc(fname) + '</span></div>' +
      '<div class="li"><span>Readings</span><span class="r num">' + p.keys.length + '</span></div>' +
      '<div class="li"><span>From</span><span class="r">' + fdate(p.keys[0], true) + ' to ' + fdate(p.keys[p.keys.length - 1], true) + '</span></div>' +
      '<div class="li"><span>Typical value</span><span class="r num">' + p.median.toFixed(1) + '</span></div>' +
      '<div class="li"><label for="iu">Values are in</label><select id="iu"><option value="kg"' + (u === 'kg' ? ' selected' : '') + '>kg</option><option value="lb"' + (u === 'lb' ? ' selected' : '') + '>lb</option></select></div>' +
      '<div class="li"><label for="im">Existing readings</label><select id="im"><option value="merge">Keep, update same dates</option><option value="replace">Replace everything</option></select></div></div>' +
      '<div class="note">' + esc(p.info) + (p.skipped ? ' ' + plural(p.skipped, 'row') + ' skipped (empty or not readable).' : '') + (guessLb ? ' Values look like lb, so I picked lb.' : '') + '</div>' +
      '<button class="btn primary block" id="idoit">Import</button>',
      function (el) {
        $('#idoit', el).addEventListener('click', function () {
          var iu = $('#iu', el).value, mode = $('#im', el).value, now = Date.now(), n = 0, bad = 0;
          if (mode === 'replace') Object.keys(state.entries).forEach(function (k) { state.entries[k] = { kg: state.entries[k].kg, t: now, del: true }; });
          p.keys.forEach(function (k) {
            var kg = iu === 'lb' ? p.map[k] / LB : p.map[k];
            if (kg < 25 || kg > 400) { bad++; return; }
            state.entries[k] = { kg: +kg.toFixed(4), t: now + 1 }; n++;
          });
          if (iu !== unit()) { state.settings.unit = iu; state.st = now; }
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
      try {
        var j = JSON.parse(String(r.result));
        if (!j || typeof j.entries !== 'object') throw new Error('bad');
        state = merge(state, { entries: clean(j.entries), settings: j.settings || {}, st: j.st || 0 });
        persist(); analyze(); render(); toast('Backup restored');
      } catch (e) { toast('That is not a backup file'); }
    };
    r.readAsText(file);
  }
  function clean(entries) {
    var o = {}; Object.keys(entries || {}).forEach(function (k) {
      var v = entries[k];
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v.kg === 'number' && isFinite(v.kg)) o[k] = { kg: v.kg, t: +v.t || 0, del: !!v.del };
    });
    return o;
  }
  function merge(a, b) {
    var out = { entries: Object.assign({}, a.entries), settings: Object.assign({}, a.settings), st: a.st || 0 };
    Object.keys(b.entries || {}).forEach(function (k) {
      var l = out.entries[k], r = b.entries[k];
      if (!l || (r.t || 0) > (l.t || 0)) out.entries[k] = r.del ? { kg: r.kg, t: r.t, del: true } : { kg: r.kg, t: r.t };
    });
    if ((b.st || 0) > out.st) { out.settings = Object.assign({}, DEFAULTS, b.settings); out.st = b.st; }
    return out;
  }

  /* ---------------------------------------------------------------- GitHub sync (private repo) */
  var syncing = false, again = false, syncTimer;
  function scheduleSync() { if (DEMO || !sync.on) return; clearTimeout(syncTimer); syncTimer = setTimeout(function () { doSync(); }, 2000); }
  function setStatus(msg, cls) { ui.msg = msg; ui.cls = cls || ''; var el = $('#sync-status'); if (el) { el.textContent = msg; el.className = 'status ' + (cls || ''); } }
  function canon(s) {
    var sk = Object.keys(s.settings || {}).sort().map(function (k) { return [k, s.settings[k]]; });
    return JSON.stringify({ e: Object.keys(s.entries).sort().map(function (k) { var v = s.entries[k]; return [k, v.kg, v.t, !!v.del]; }), st: s.st || 0, s: sk });
  }
  function b64enc(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64dec(b) { return decodeURIComponent(escape(atob(b.replace(/\s/g, '')))); }
  function ghUrl() { return 'https://api.github.com/repos/' + encodeURIComponent(sync.owner) + '/' + encodeURIComponent(sync.repo) + '/contents/' + sync.path.split('/').map(encodeURIComponent).join('/'); }
  function ghHeaders() { return { 'Authorization': 'Bearer ' + sync.token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }; }
  function ghGet() {
    return fetch(ghUrl(), { headers: ghHeaders(), cache: 'no-store' }).then(function (r) {
      if (r.status === 404) return { data: null, sha: null };
      if (r.status === 401 || r.status === 403) throw new Error('GitHub refused the token. Check it has Contents read and write on that repo.');
      if (!r.ok) throw new Error('GitHub error ' + r.status);
      return r.json().then(function (j) {
        var data = JSON.parse(b64dec(j.content || ''));
        return { data: { entries: clean(data.entries), settings: data.settings || {}, st: data.st || 0 }, sha: j.sha };
      });
    });
  }
  function ghPut(sha) {
    var body = { message: 'sync ' + new Date().toISOString(), content: b64enc(JSON.stringify({ v: 1, entries: state.entries, settings: state.settings, st: state.st })) };
    if (sha) body.sha = sha;
    return fetch(ghUrl(), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()), body: JSON.stringify(body) }).then(function (r) {
      if (r.status === 409 || r.status === 422) return 409;
      if (r.status === 401 || r.status === 403 || r.status === 404) throw new Error('GitHub refused the write. Is the repo private, spelled right, and the token allowed to write to it?');
      if (!r.ok) throw new Error('GitHub error ' + r.status);
      return 200;
    });
  }
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
        if (code === 409) throw new Error('Sync conflict, try again');
        sync.last = Date.now(); saveSync();
        setStatus('Synced at ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 'ok');
      });
    };
    return step().catch(function (e) { setStatus('Sync failed: ' + (e.message || e), 'bad'); })
      .then(function () { syncing = false; if (again) { again = false; scheduleSync(); } });
  }

  /* ---------------------------------------------------------------- settings */
  function setSetting(key, val) {
    var s = state.settings, n;
    if (key === 'unit') s.unit = val;
    else if (key === 'sex') s.sex = val;
    else if (key === 'bmiScale') s.bmiScale = val;
    else if (key === 'activity') s.activity = +val;
    else if (key === 'goalDate') s.goalDate = val || '';
    else if (key === 'heightCm') { n = parseFloat(val); s.heightCm = n >= 100 && n <= 230 ? +n.toFixed(1) : null; if (val && !s.heightCm) toast('Height should be 100 to 230 cm'); }
    else if (key === 'height-imp') {
      var ft = parseFloat($('#h-ft').value) || 0, inch = parseFloat($('#h-in').value) || 0, cm = (ft * 12 + inch) * 2.54;
      s.heightCm = cm >= 100 && cm <= 230 ? +cm.toFixed(1) : null; if ((ft || inch) && !s.heightCm) toast('Height looks off');
    }
    else if (key === 'age') { n = parseInt(val, 10); s.age = n >= 10 && n <= 110 ? n : null; if (val && !s.age) toast('Age should be 10 to 110'); }
    else if (key === 'goal') {
      n = parseFloat(val); var kg = fromDsp(n);
      s.goalKg = isFinite(kg) && kg >= 25 && kg <= 400 ? +kg.toFixed(3) : null; if (val && !s.goalKg) toast('Goal weight looks off');
    }
    state.st = Date.now(); persist(); analyze();
    // Only re-draw for unit changes. Re-drawing on every field would steal focus
    // when you tap from one field to the next. Other screens refresh when you switch tabs.
    if (key === 'unit') render();
  }

  /* ---------------------------------------------------------------- chart assembly */
  function chartFor(A, id, H) {
    var ser = A.series, last = A.last;
    var days = ui.range === 'all' ? ser.length : parseInt(ui.range, 10);
    var h = 60;
    if (ui.fc && A.fc) {
      if (A.eta && A.eta.centralDays !== null && !A.eta.reached) h = Math.min(180, Math.max(21, Math.ceil(A.eta.centralDays * 1.25) + 7));
      days = Math.max(days, Math.round(h * 0.8)); // keep history readable next to a long forecast
    }
    var n0 = Math.max(ser[0].n, last.n - days + 1), n1 = last.n;
    var vis = ser.filter(function (p) { return p.n >= n0; });
    var fc = null, fpts = null;
    if (ui.fc && A.fc) {
      fpts = A.fc.points.filter(function (p) { return p.h <= h; });
      fc = {
        mid: fpts.map(function (p) { return { n: p.n, v: dsp(p.mid) }; }), lo: fpts.map(function (p) { return { n: p.n, v: dsp(p.lo) }; }),
        hi: fpts.map(function (p) { return { n: p.n, v: dsp(p.hi) }; }), damped: fpts.map(function (p) { return { n: p.n, v: dsp(p.damped) }; })
      };
      n1 = last.n + h;
    }
    var byN = {}; ser.forEach(function (p) { byN[p.n] = p; });
    var readout = function (n) {
      if (n === null) return '<b class="num">' + fw(last.trend) + '</b>' + unit() + ' trend<br><span>Drag across the chart for any day</span>';
      if (n <= last.n && byN[n]) {
        var p = byN[n];
        return '<b class="num">' + fw(p.trend) + '</b>' + unit() + ' trend<br><span>' + fdate(p.d) + (p.raw !== null ? ' &middot; reading ' + fw(p.raw) : ' &middot; no reading (estimated)') + '</span>';
      }
      var f = fpts && fpts[n - last.n];
      return f ? '<b class="num">' + fw(f.mid) + '</b>' + unit() + ' forecast<br><span>' + fdate(S.dayStr(n)) + ' &middot; likely range ' + fw(f.lo) + ' to ' + fw(f.hi) + '</span>' : '';
    };
    return '<div class="readout num" id="ro-' + id + '">' + readout(null) + '</div>' + C.lineChart({
      id: id, H: H, n0: n0, n1: n1, readout: readout, goal: A.goalKg ? dsp(A.goalKg) : null, fc: fc,
      label: 'Weight over time. Latest trend ' + fw(last.trend) + ' ' + unit(),
      trend: vis.map(function (p) { return { n: p.n, v: dsp(p.trend) }; }),
      raw: vis.filter(function (p) { return true; }).map(function (p) { return { n: p.n, v: dsp(p.w), est: p.est }; })
    });
  }
  function rangeControls() {
    var b = function (v, l) { return '<button data-range="' + v + '" class="' + (ui.range === v ? 'on' : '') + '">' + l + '</button>'; };
    return '<div class="toolbar"><div class="seg">' + b('30', '1M') + b('90', '3M') + b('all', 'All') + '</div>' +
      '<div class="seg"><button data-action="fc" class="' + (ui.fc ? 'on' : '') + '">Forecast</button></div></div>';
  }
  function legend(A) {
    return '<div class="legend"><span><i style="background:#ff2d55"></i>Trend</span><span><i class="dot" style="background:#fff;opacity:.6"></i>Reading</span>' +
      (A.estCount ? '<span><i class="dot" style="border:1px solid #8e8e93"></i>Filled in</span>' : '') +
      (ui.fc && A.fc ? '<span class="green"><i class="dash"></i>Same pace</span><span class="cyan"><i class="dash"></i>If it slows</span>' : '') + '</div>';
  }

  /* ---------------------------------------------------------------- screens */
  function header(title) {
    var d = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return '<div class="head"><div><div class="date">' + d + '</div><h1>' + title + '</h1></div></div>' + (DEMO ? '<div class="warn">Demo data. Nothing here is saved.</div>' : '');
  }
  function emptyState() {
    return header('Summary') + '<div class="card empty">' + C.rings([{ pct: .0, c1: '#ff2d55', c2: '#ff6b8b' }, { pct: 0, c1: '#a3f408', c2: '#5fe33b' }, { pct: 0, c1: '#2de3f0', c2: '#1fa9ff' }]).replace('<svg ', '<svg class="ring-art" ') +
      '<h2>Start your first ring</h2><p class="sub">Import your Excel sheet once, or log today\'s weight.</p>' +
      '<div class="row-btns" style="justify-content:center"><button class="btn primary" data-action="pick-import">Import Excel or CSV</button><button class="btn" data-action="log">Log a weight</button></div></div>';
  }

  function viewSummary(A) {
    if (!A.series || !A.series.length) return emptyState();
    var u = unit(), st = A.streak;
    var goalTxt = A.goalKg ? fw(A.lostKg) + ' of ' + fw(A.startKg - A.goalKg) + ' ' + u : fw(A.lostKg) + ' of ' + fw(A.startKg * 0.05) + ' ' + u + ' (first 5%)';
    var rings = C.rings([
      { pct: A.goalProgress || 0, c1: '#ff2d55', c2: '#ff6b8b' },
      { pct: st.week / 7, c1: '#a3f408', c2: '#5fe33b' },
      { pct: A.pacePct || 0, c1: '#2de3f0', c2: '#1fa9ff' }
    ]);
    var h = header('Summary');
    h += '<div class="card"><div class="rings">' + rings + '<div class="rstats">' +
      '<div class="rstat"><div class="k">' + (A.goalKg ? 'Goal progress' : 'First 5%') + '</div><div class="v red num">' + Math.round((A.goalProgress || 0) * 100) + '<small>%</small></div><div class="n num">' + goalTxt + '</div></div>' +
      '<div class="rstat"><div class="k">Logged this week</div><div class="v green num">' + st.week + '<small>/7 days</small></div><div class="n">' + (st.aliveToday ? 'Today is in' : 'Today is open') + '</div></div>' +
      '<div class="rstat"><div class="k">Pace</div><div class="v cyan num">' + (A.rate ? dsp(A.rate.lossPerWeek).toFixed(2) : '--') + '<small>' + u + '/wk</small></div><div class="n num">' + (A.rate ? 'target ' + dsp(A.paceTarget.kgPerWeek).toFixed(2) : 'needs 7 readings in 4 weeks') + '</div></div>' +
      '</div></div></div>';
    if (A.paceTarget.tooFast && A.paceTarget.source === 'date') h += '<div class="warn">Your target date needs ' + dsp(A.paceTarget.kgPerWeek).toFixed(2) + ' ' + u + ' per week, which is above the 1% of body weight per week that is usually treated as an upper limit. Consider a later date in Data.</div>';
    if (A.fastPace) h += '<div class="warn">Your current pace is above 1% of body weight per week. Early loss often includes water, but if it stays this fast it is worth mentioning to a doctor or dietitian.</div>';

    h += '<div class="card"><div class="k sub" style="font-weight:600">Trend weight</div><div class="big num">' + fw(A.currentKg) + '<small>' + u + '</small></div>' +
      '<div class="chips">' + '<span class="chip num">' + sgn(dsp(-A.lostKg)) + ' ' + u + ' since start</span>' +
      (A.change7 !== null ? '<span class="chip num">' + sgn(dsp(A.change7)) + ' last 7 days</span>' : '') +
      (A.bmi ? '<span class="chip num">BMI ' + A.bmi.value.toFixed(1) + '</span>' : '') + '</div>' +
      '<div class="sub" style="margin-top:10px">Latest reading ' + fw(A.latestKg) + ' ' + u + ', ' + fdate(A.last.d) + (A.daysSinceLast >= 3 ? ' (' + A.daysSinceLast + ' days ago)' : '') + '</div>' +
      '<div class="row-btns"><button class="btn primary" data-action="log">' + (st.today ? 'Update today' : 'Log today\'s weight') + '</button></div></div>';

    h += '<div class="card">' + rangeControls() + chartFor(A, 'sum', 220) + legend(A) + '</div>';

    h += '<div class="grid2">';
    h += '<div class="card tile"><div class="k">Streak</div><div class="v green num">' + st.current + '<small>days</small></div><div class="n">longest ' + st.longest + '</div></div>';
    h += '<div class="card tile"><div class="k">Lost so far</div><div class="v red num">' + fw(A.lostKg) + '<small>' + u + '</small></div><div class="n num">' + A.lostPct.toFixed(1) + '% of start</div></div>';
    if (A.bmi) {
      h += '<div class="card tile"><div class="k">BMI</div><div class="v num">' + A.bmi.value.toFixed(1) + '</div><div class="n">' + A.bmi.label + (A.bmi.next ? '. ' + fw(A.bmi.next.kgToGo) + ' ' + u + ' to ' + A.bmi.next.label : '') + '</div></div>';
    } else {
      h += '<div class="card tile"><div class="k">BMI</div><div class="v">--</div><div class="n"><button class="chip" data-tab="data">Add height</button></div></div>';
    }
    if (A.eta && A.eta.central && !A.eta.reached) {
      h += '<div class="card tile"><div class="k">Goal around</div><div class="v cyan">' + fdate(A.eta.central) + '</div><div class="n">' + (A.eta.optimistic && A.eta.pessimistic ? fdate(A.eta.optimistic) + ' to ' + fdate(A.eta.pessimistic) : 'at this pace') + '</div></div>';
    } else if (A.eta && A.eta.reached) {
      h += '<div class="card tile"><div class="k">Goal</div><div class="v cyan">Reached</div><div class="n">Trend is at or below goal</div></div>';
    } else {
      h += '<div class="card tile"><div class="k">Goal date</div><div class="v">--</div><div class="n">' + (A.goalKg ? 'Pace is flat or rising' : '<button class="chip" data-tab="data">Set a goal</button>') + '</div></div>';
    }
    h += '</div>';

    var aw = A.awards.filter(function (a) { return a.earned; }).reverse().concat(A.awards.filter(function (a) { return !a.earned; }).slice(0, 4));
    h += '<div class="h2">Awards</div><div class="awards">' + aw.map(function (a) {
      return '<div class="award' + (a.earned ? '' : ' off') + '"><div class="b">' + a.icon + '</div><div class="t">' + a.title + '</div>' +
        '<div class="p">' + (a.earned ? (a.date ? fdate(a.date) : 'Earned') : (a.have !== undefined ? a.have + ' / ' + a.need : '')) + '</div></div>';
    }).join('') + '</div>';
    return h;
  }

  function viewTrends(A) {
    if (!A.series || !A.series.length) return emptyState().replace('Summary', 'Trends');
    var u = unit(), h = header('Trends');
    h += '<div class="card"><h3>Weight</h3>' + rangeControls() + chartFor(A, 'tr', 260) + legend(A) + '</div>';
    if (A.weekly.length >= 2) {
      var data = A.weekly.map(function (w) { return { label: C.dateShort(S.dayNum(w.end)), v: dsp(w.loss) }; });
      h += '<div class="card"><h3>Weekly change</h3><div class="sub">Lost per week (' + u + '), from the smoothed trend. Dashed line is your target pace.</div>' +
        C.barsChart({ data: data, target: dsp(A.paceTarget.kgPerWeek), label: 'Weight lost per week' }) + '</div>';
    }
    if (A.bmi) {
      var sc = S.SCALES[state.settings.bmiScale] || S.SCALES.who, hc = state.settings.heightCm;
      var vis = A.series.filter(function (p) { return true; });
      h += '<div class="card"><h3>BMI</h3><div class="sub">Trend BMI against category bands. BMI is a rough screen. It ignores muscle, frame and where weight sits.</div>' +
        C.bmiChart({ points: vis.map(function (p) { return { n: p.n, v: S.bmi(p.trend, hc) }; }), n0: vis[0].n, n1: vis[vis.length - 1].n, cuts: sc.cuts, labels: sc.labels }) + '</div>';
    } else {
      h += '<div class="card"><h3>BMI</h3><div class="sub">Add your height in Data to see BMI over time.</div><div class="row-btns"><button class="btn small" data-tab="data">Add height</button></div></div>';
    }
    // consistency calendar: last 8 weeks, Monday first
    var real = {}; A.series.forEach(function (p) { if (p.raw !== null) real[p.n] = 1; });
    var dowT = (A.todayN + 3) % 7; // Monday = 0
    var startN = A.todayN - dowT - 49, cells = '';
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(function (x) { cells += '<div class="dow">' + x + '</div>'; });
    for (var i = 0; i < 56; i++) {
      var n = startN + i, cls = 'd' + (real[n] ? ' on' : '') + (n === A.todayN ? ' today' : '') + (n > A.todayN ? ' fut' : '');
      cells += '<div class="' + cls + '" title="' + fdate(S.dayStr(n)) + '">' + (n > A.todayN ? '' : new Date(n * DAY).getUTCDate()) + '</div>';
    }
    h += '<div class="card"><h3>Consistency</h3><div class="sub">Green days have a reading. Last 8 weeks.</div><div class="cal">' + cells + '</div></div>';
    return h;
  }

  function viewInsights(A) {
    if (!A.series || !A.series.length) return emptyState().replace('Summary', 'Insights');
    var u = unit(), h = header('Insights');

    // forecast + what-if
    h += '<div class="card"><h3>Forecast</h3>';
    if (!A.fc) h += '<div class="lead">Not enough recent data yet.</div><div class="sub">Needs 7 readings within the last 4 weeks.</div>';
    else {
      var f30 = A.fc.points[30];
      if (!A.goalKg) {
        h += '<div class="lead">In 30 days at this pace: ' + fw(f30.mid) + ' ' + u + '</div><div class="sub num">Likely range ' + fw(f30.lo) + ' to ' + fw(f30.hi) + ' ' + u + '. Set a goal weight in Data to get a date.</div>';
      } else if (A.eta.reached) {
        h += '<div class="lead">Your trend is at or below your goal.</div>';
      } else if (!A.eta.central) {
        h += '<div class="lead">Your pace is flat or rising, so there is no date yet.</div><div class="sub">The forecast needs the last 4 weeks to trend down.</div>';
      } else {
        h += '<div class="lead">Goal weight around ' + fdate(A.eta.central, true) + '</div>' +
          '<div class="sub">' + (A.eta.optimistic ? 'Likely window ' + fdate(A.eta.optimistic) + ' to ' + (A.eta.pessimistic ? fdate(A.eta.pessimistic) : 'later than we can estimate') + '. ' : '') +
          (A.eta.damped ? 'If loss slows down the way it usually does, closer to ' + fdate(A.eta.damped, true) + '.' : 'If loss slows down the way it usually does, you may not reach it at this pace without a change.') + '</div>';
        var need = A.paceTarget.source === 'date' ? A.paceTarget.kgPerWeek : null;
        if (need) h += '<div class="sub" style="margin-top:8px">Your target date of ' + fdate(state.settings.goalDate, true) + ' needs ' + dsp(need).toFixed(2) + ' ' + u + '/wk. You are at ' + dsp(A.rate.lossPerWeek).toFixed(2) + '.</div>';
        var v0 = Math.max(0.1, Math.min(1.2, A.rate.lossPerWeek));
        h += '<div style="margin-top:14px"><div class="sub" style="font-weight:600">What if my pace were...</div>' +
          '<input type="range" id="wi" min="' + dsp(0.1).toFixed(2) + '" max="' + dsp(1.2).toFixed(2) + '" step="' + (u === 'lb' ? '0.1' : '0.05') + '" value="' + dsp(v0).toFixed(2) + '" data-level="' + A.fc.level + '" data-goal="' + A.goalKg + '" data-last="' + A.last.n + '" aria-label="Weekly pace">' +
          '<div class="lead num" id="wi-out" style="margin:4px 0 0"></div></div>';
      }
      h += '<div class="sub" style="margin-top:10px">Based on ' + plural(A.rate.n, 'reading') + ' from the last 4 weeks. A forecast is a guess from your own recent pace, not a promise.</div>';
    }
    h += '</div>';

    // weekday
    h += '<div class="card"><h3>Day of week</h3>';
    if (!A.weekday) h += '<div class="sub">Needs about 4 weeks of readings.</div>';
    else {
      var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], order = [1, 2, 3, 4, 5, 6, 0];
      var sig = A.weekday.filter(function (x) { return x.n >= 4 && Math.abs(x.mean) > Math.max(0.2, 2 * x.se); });
      if (sig.length) {
        sig.sort(function (a, b) { return Math.abs(b.mean) - Math.abs(a.mean); });
        var t = sig[0];
        h += '<div class="lead">' + names[t.dow] + ' readings run ' + dsp(Math.abs(t.mean)).toFixed(1) + ' ' + u + (t.mean > 0 ? ' higher' : ' lower') + ' than your weekly average.</div>';
      } else h += '<div class="lead">No clear weekday pattern.</div>';
      var mx = Math.max(0.3, Math.max.apply(null, A.weekday.map(function (x) { return Math.abs(x.mean); })));
      h += '<div class="wd">' + order.map(function (i) {
        var x = A.weekday[i], pct = Math.min(100, Math.abs(x.mean) / mx * 100), col = x.mean >= 0 ? 'var(--orange)' : 'var(--cyan)';
        return '<div class="col"><div class="up">' + (x.mean > 0 ? '<div class="bar" style="height:' + pct + '%;background:' + col + '"></div>' : '') + '</div><div class="dn">' + (x.mean < 0 ? '<div class="bar" style="height:' + pct + '%;background:' + col + '"></div>' : '') + '</div><div class="lab">' + names[i] + '</div></div>';
      }).join('') + '</div><div class="sub" style="margin-top:6px">Difference from your 7 day average. Under about ' + dsp(0.2).toFixed(1) + ' ' + u + ' is mostly noise.</div>';
    }
    h += '</div>';

    // stalls
    h += '<div class="card"><h3>Flat stretches</h3>';
    if (A.stalledNow) {
      var cs = A.stalls[A.stalls.length - 1];
      h += '<div class="lead">Your trend has barely moved since ' + fdate(cs.from) + '.</div><div class="sub">Under ' + dsp(0.15).toFixed(2) + ' ' + u + ' of change in 10 days. Short flat stretches are common and often come from water. Keep logging so the trend can show what happens next.</div>';
    } else h += '<div class="lead">Moving as expected.</div>';
    var past = A.stalls.filter(function (s) { return !A.stalledNow || s !== A.stalls[A.stalls.length - 1]; });
    if (past.length) h += '<div class="sub" style="margin-top:8px">Earlier flat stretches: ' + past.map(function (s) { return fdate(s.from) + ' to ' + fdate(s.to) + ' (' + s.days + ' days)'; }).join(', ') + '.</div>';
    h += '</div>';

    // energy
    h += '<div class="card"><h3>Energy balance</h3>';
    if (!A.energy) h += '<div class="sub">Add height and age in Data to estimate calories.</div><div class="row-btns"><button class="btn small" data-tab="data">Add details</button></div>';
    else if (!A.energy.deficit && A.energy.deficit !== 0) h += '<div class="sub">Needs a recent pace to compare against.</div>';
    else {
      h += '<div class="lead num">Your pace implies about ' + Math.round(Math.abs(A.energy.deficit) / 10) * 10 + ' kcal/day ' + (A.energy.deficit >= 0 ? 'below' : 'above') + ' what you burn.</div>' +
        '<div class="list" style="background:var(--card2);margin:10px 0 0"><div class="li"><span>Resting (BMR)</span><span class="r num">' + Math.round(A.energy.bmr) + ' kcal</span></div>' +
        '<div class="li"><span>Total burn (TDEE)</span><span class="r num">' + Math.round(A.energy.tdee) + ' kcal</span></div>' +
        '<div class="li"><span>Implied intake</span><span class="r num">' + Math.round(A.energy.intake / 10) * 10 + ' kcal</span></div></div>' +
        '<div class="sub" style="margin-top:8px">Uses the Mifflin-St Jeor equation and about 7,700 kcal per kg of change. These are estimates and can be off by a few hundred kcal. Use the implied intake to sanity check your own food log, not as a target.</div>';
      if (A.energy.lowIntake) h += '<div class="warn" style="margin-top:10px">The implied intake is below your estimated resting needs. Often that means a short burst of water loss or a missing input, but if it holds, check in with a doctor or dietitian.</div>';
    }
    h += '</div>';

    // anomalies + data quality
    h += '<div class="card"><h3>Unusual readings</h3>';
    if (!A.anomalies) h += '<div class="sub">Needs about 4 weeks of readings.</div>';
    else if (!A.anomalies.length) h += '<div class="lead">Nothing stands out.</div>';
    else h += '<div class="sub" style="margin-bottom:6px">Far from the 7 day average. Usually water, salt or timing, not fat.</div><div class="list" style="background:var(--card2);margin:0">' +
      A.anomalies.map(function (a) { return '<div class="li"><span>' + fdate(a.d) + '</span><span class="r num">' + sgn(dsp(a.diff)) + ' ' + u + '</span></div>'; }).join('') + '</div>';
    h += '</div>';

    h += '<div class="card"><h3>Data quality</h3><div class="lead num">' + A.realCount + ' readings over ' + A.spanDays + ' days</div>';
    var longGaps = A.gaps.filter(function (g) { return g.days >= 2; });
    h += '<div class="sub">' + (A.estCount ? A.estCount + ' missing days are filled in with a straight line between your readings (hollow dots). ' : 'No gaps. ') +
      (longGaps.length ? 'Longest gaps: ' + longGaps.sort(function (a, b) { return b.days - a.days; }).slice(0, 3).map(function (g) { return fdate(g.from) + ' to ' + fdate(g.to); }).join(', ') + '.' : '') + '</div></div>';
    return h;
  }

  function viewData(A) {
    var s = state.settings, u = unit(), h = header('Data');
    h += '<div class="row-btns" style="margin:0 4px 14px"><button class="btn primary" data-action="log">Log a weight</button></div>';

    h += '<div class="h2">Import and export</div><div class="list">' +
      '<button class="li" style="width:100%" data-action="pick-import"><span>Import Excel or CSV</span><span class="r">&rsaquo;</span></button>' +
      '<button class="li" style="width:100%" data-action="export-xlsx"><span>Export to Excel</span><span class="r">&rsaquo;</span></button>' +
      '<button class="li" style="width:100%" data-action="export-csv"><span>Export to CSV</span><span class="r">&rsaquo;</span></button>' +
      '<button class="li" style="width:100%" data-action="backup"><span>Backup file (JSON)</span><span class="r">&rsaquo;</span></button>' +
      '<button class="li" style="width:100%" data-action="pick-restore"><span>Restore backup</span><span class="r">&rsaquo;</span></button></div>' +
      '<div class="note">Import reads the first sheet. It looks for a Date column and a Weight column, and merges by date, so you can re-import an updated sheet any time.</div>';

    var ht;
    if (u === 'lb') {
      var tin = s.heightCm ? s.heightCm / 2.54 : 0, ft = s.heightCm ? Math.floor(tin / 12) : '', inch = s.heightCm ? Math.round(tin % 12) : '';
      if (inch === 12) { ft += 1; inch = 0; }
      ht = '<div class="li"><label>Height</label><span><input class="sm num" id="h-ft" type="number" inputmode="numeric" placeholder="ft" value="' + ft + '" data-set="height-imp"> <input class="sm num" id="h-in" type="number" inputmode="numeric" placeholder="in" value="' + inch + '" data-set="height-imp"></span></div>';
    } else ht = '<div class="li"><label for="s-h">Height (cm)</label><input id="s-h" class="num" type="number" inputmode="decimal" placeholder="170" value="' + (s.heightCm || '') + '" data-set="heightCm"></div>';
    var opt = function (v, l, cur) { return '<option value="' + v + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + l + '</option>'; };
    h += '<div class="h2">Profile and goal</div><div class="list">' +
      '<div class="li"><label for="s-u">Units</label><select id="s-u" data-set="unit">' + opt('kg', 'kg', s.unit) + opt('lb', 'lb', s.unit) + '</select></div>' + ht +
      '<div class="li"><label for="s-a">Age</label><input id="s-a" class="num" type="number" inputmode="numeric" placeholder="optional" value="' + (s.age || '') + '" data-set="age"></div>' +
      '<div class="li"><label for="s-x">Sex (for calorie estimate)</label><select id="s-x" data-set="sex">' + opt('', 'Prefer not to say', s.sex) + opt('f', 'Female', s.sex) + opt('m', 'Male', s.sex) + '</select></div>' +
      '<div class="li"><label for="s-ac">Activity level</label><select id="s-ac" data-set="activity">' + opt(1.2, 'Mostly sitting', s.activity) + opt(1.375, 'Light activity', s.activity) + opt(1.55, 'Moderate', s.activity) + opt(1.725, 'Very active', s.activity) + '</select></div>' +
      '<div class="li"><label for="s-g">Goal weight (' + u + ')</label><input id="s-g" class="num" type="number" step="0.1" inputmode="decimal" placeholder="optional" value="' + (s.goalKg ? fw(s.goalKg) : '') + '" data-set="goal"></div>' +
      '<div class="li"><label for="s-gd">Target date</label><input id="s-gd" type="date" value="' + esc(s.goalDate || '') + '" data-set="goalDate" style="color-scheme:dark"></div>' +
      '<div class="li"><label for="s-b">BMI categories</label><select id="s-b" data-set="bmiScale">' + opt('who', 'Standard (WHO)', s.bmiScale) + opt('asia', 'Asia-Pacific cut-offs', s.bmiScale) + '</select></div></div>';

    h += '<div class="h2">Private sync</div><div class="note" style="margin-top:0">Optional. Keeps a copy of your data in a <b>private</b> GitHub repo so your phone and laptop match, with no daily committing. The app writes the file for you each time you log.</div>' +
      '<div class="list">' +
      '<div class="li"><label for="y-o">GitHub username</label><input id="y-o" data-sync="owner" autocapitalize="off" autocomplete="off" placeholder="your-name" value="' + esc(sync.owner) + '"></div>' +
      '<div class="li"><label for="y-r">Private repo name</label><input id="y-r" data-sync="repo" autocapitalize="off" autocomplete="off" placeholder="vim-data" value="' + esc(sync.repo) + '"></div>' +
      '<div class="li"><label for="y-p">File</label><input id="y-p" data-sync="path" autocapitalize="off" autocomplete="off" value="' + esc(sync.path) + '"></div>' +
      '<div class="li"><label for="y-t">Access token</label><input id="y-t" data-sync="token" type="password" autocomplete="off" placeholder="github_pat_..." value="' + esc(sync.token) + '"></div></div>' +
      '<div class="row-btns" style="margin:0 4px"><button class="btn primary small" data-action="sync-on">' + (sync.on ? 'Sync now' : 'Connect and sync') + '</button>' + (sync.on ? '<button class="btn small" data-action="sync-off">Disconnect</button>' : '') + '</div>' +
      '<div id="sync-status" class="status ' + ui.cls + '">' + esc(ui.msg || (sync.on && sync.last ? 'Last synced ' + new Date(sync.last).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : (sync.on ? 'Connected' : 'Not connected'))) + '</div>' +
      '<div class="note">The token is stored only in this browser. Use a fine-grained token limited to that one repo with Contents: read and write. Setup steps are in the README.</div>';

    var ents = live().reverse(), shown = ui.showAll ? ents : ents.slice(0, 30);
    h += '<div class="h2">Readings (' + ents.length + ')</div>';
    if (!ents.length) h += '<div class="note">Nothing yet.</div>';
    else {
      h += '<div class="list">' + shown.map(function (e) {
        return '<div class="li"><button data-action="edit" data-date="' + e.d + '" style="flex:1;text-align:left;min-height:32px"><span>' + fdate(e.d, true) + '</span></button><span class="r num">' + fw(e.kg) + ' ' + u + '</span><button class="x" data-action="del" data-date="' + e.d + '" aria-label="Delete ' + e.d + '">&times;</button></div>';
      }).join('') + '</div>';
      if (ents.length > 30 && !ui.showAll) h += '<div class="row-btns" style="margin:0 4px"><button class="btn small" data-action="showall">Show all ' + ents.length + '</button></div>';
    }
    h += '<div class="h2">Danger zone</div><div class="row-btns" style="margin:0 4px 20px"><button class="btn danger small" data-action="erase">Erase all readings</button></div>';
    return h;
  }

  var VIEWS = { summary: viewSummary, trends: viewTrends, insights: viewInsights, data: viewData };

  function render() {
    var A = lastA || analyze(), v = $('#view');
    var y = window.scrollY;
    v.innerHTML = VIEWS[ui.tab](A);
    document.querySelectorAll('.tab[data-tab]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === ui.tab); });
    C.bind(v); C.animateRings(v);
    updateWhatIf();
    window.scrollTo(0, y);
  }
  function updateWhatIf() {
    var el = $('#wi'); if (!el) return;
    var out = $('#wi-out'), rate = fromDsp(parseFloat(el.value)), level = +el.dataset.level, goal = +el.dataset.goal, last = +el.dataset.last;
    var days = (level - goal) / (rate / 7);
    out.textContent = dsp(rate).toFixed(2) + ' ' + unit() + '/wk reaches goal ' + (days > 730 ? 'in over 2 years' : 'around ' + fdate(S.dayStr(last + Math.ceil(days)), true) + ' (' + Math.ceil(days / 7) + ' weeks)');
  }

  /* ---------------------------------------------------------------- events */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action],[data-tab],[data-range]'); if (!t) return;
    if (t.dataset.tab) { ui.tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
    if (t.dataset.range) { ui.range = t.dataset.range; render(); return; }
    var a = t.dataset.action;
    if (a === 'log') openLog();
    else if (a === 'fc') { ui.fc = !ui.fc; render(); }
    else if (a === 'edit') openLog(t.dataset.date);
    else if (a === 'del') { if (confirm('Delete the reading from ' + fdate(t.dataset.date, true) + '?')) deleteEntry(t.dataset.date); }
    else if (a === 'showall') { ui.showAll = true; render(); }
    else if (a === 'pick-import') $('#file-import').click();
    else if (a === 'pick-restore') $('#file-restore').click();
    else if (a === 'export-csv') exportCSV();
    else if (a === 'export-xlsx') exportXLSX();
    else if (a === 'backup') backup();
    else if (a === 'erase') {
      if (confirm('Erase every reading on this device? If sync is on, the repo copy is cleared too. Make a backup first if unsure.')) {
        var now = Date.now(); Object.keys(state.entries).forEach(function (k) { state.entries[k] = { kg: state.entries[k].kg, t: now, del: true }; });
        persist(); analyze(); render(); toast('All readings erased');
      }
    }
    else if (a === 'sync-on') {
      if (!sync.owner || !sync.repo || !sync.token) { toast('Fill in username, repo and token'); return; }
      sync.on = true; saveSync(); doSync().then(function () { render(); });
    }
    else if (a === 'sync-off') { sync.on = false; sync.token = ''; saveSync(); setStatus('Disconnected. Local data kept.'); render(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.set) { setSetting(t.dataset.set, t.value); return; }
    if (t.dataset && t.dataset.sync) { sync[t.dataset.sync] = t.value.trim(); if (t.dataset.sync === 'path' && !sync.path) sync.path = 'data.json'; saveSync(); }
  });
  document.addEventListener('input', function (e) { if (e.target.id === 'wi') updateWhatIf(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { analyze(); render(); doSync(); } });

  function init() {
    ['import', 'restore'].forEach(function (k) {
      var f = document.createElement('input'); f.type = 'file'; f.id = 'file-' + k; f.className = 'hide';
      f.accept = k === 'import' ? '.xlsx,.xls,.csv,.txt' : '.json';
      f.addEventListener('change', function () { if (f.files[0]) { if (k === 'import') handleImportFile(f.files[0]); else restoreBackup(f.files[0]); } f.value = ''; });
      document.body.appendChild(f);
    });
    analyze(); render();
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && !DEMO) navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache is optional */ });
    doSync();
  }
  init();
  window.__wt = { state: function () { return state; }, setTab: function (t) { ui.tab = t; render(); }, ui: ui, render: render };
})();
