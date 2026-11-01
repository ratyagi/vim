/* stats.js: turns your readings into everything the screens show. No DOM, no network.
   All weights are kg here. The UI converts to lb for display.
   The heavy maths (trend, pace, forecast, probabilities, back-test) lives in model.js. */
(function (root, factory) {
  var M = (typeof module === 'object' && module.exports) ? require('./model.js') : root.Model;
  if (typeof module === 'object' && module.exports) module.exports = factory(M);
  else root.Stats = factory(M);
})(typeof self !== 'undefined' ? self : this, function (Model) {
  'use strict';

  var DAY = 86400000, Z80 = Model.Z80, HORIZON = 240;
  var cache = { sig: null, m: null, bt: undefined }, simCache = { key: null, sim: null };

  function pad(n) { return String(n).padStart(2, '0'); }
  function dayNum(s) { var p = s.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY); }
  function dayStr(n) { return new Date(n * DAY).toISOString().slice(0, 10); }
  function localToday() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dow(n) { return (n + 4) % 7; } // 0 = Sunday

  /* entries: [{d:'YYYY-MM-DD', kg}] sorted, unique by date. One point per calendar day. */
  function buildSeries(entries) {
    if (!entries.length) return [];
    var real = {}, ns = [];
    entries.forEach(function (e) { var n = dayNum(e.d); real[n] = e.kg; ns.push(n); });
    ns.sort(function (a, b) { return a - b; });
    var n0 = ns[0], n1 = ns[ns.length - 1], out = [], n;
    for (n = n0; n <= n1; n++) {
      var has = Object.prototype.hasOwnProperty.call(real, n), w;
      if (has) w = real[n];
      else {
        var p = n - 1; while (!(p in real)) p--;
        var q = n + 1; while (!(q in real)) q++;
        w = real[p] + (real[q] - real[p]) * (n - p) / (q - p);
      }
      out.push({ n: n, d: dayStr(n), raw: has ? real[n] : null, est: !has, w: w });
    }
    return out;
  }

  var SCALES = {
    who:  { cuts: [18.5, 25, 30],     labels: ['Underweight', 'Healthy range', 'Overweight', 'Obesity'] },
    asia: { cuts: [18.5, 23, 25, 30], labels: ['Underweight', 'Healthy range', 'Overweight', 'Obesity I', 'Obesity II'] }
  };
  function bmi(kg, cm) { return kg / Math.pow(cm / 100, 2); }
  function bmiBand(b, scale) {
    var sc = SCALES[scale] || SCALES.who, i = 0;
    while (i < sc.cuts.length && b >= sc.cuts[i]) i++;
    return { idx: i, label: sc.labels[i] };
  }
  function norm(x) { // standard normal CDF (Abramowitz-Stegun)
    var t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
    var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  function analyze(entries, cfg, today) {
    cfg = cfg || {}; today = today || localToday();
    var A = { count: entries.length, today: today, todayN: dayNum(today), Z80: Z80, horizon: HORIZON };
    var series = buildSeries(entries);
    A.series = series;
    if (!series.length) return A;
    var N = series.length, first = series[0], last = series[N - 1], i;
    A.first = first; A.last = last; A.startKg = entries[0].kg; A.latestKg = entries[entries.length - 1].kg;
    A.daysSinceLast = A.todayN - last.n;
    A.gap = Math.max(0, A.daysSinceLast); A.stale = A.gap > 30; // blind for over a month: a forecast would be a guess
    A.realCount = entries.length; A.estCount = N - entries.length; A.spanDays = N;
    A.thin = entries.length < 7;

    // ---- fit the model (cached until the readings change)
    var sig = entries.map(function (e) { return e.d + ':' + e.kg; }).join('|');
    var W = Math.min(N, 365), off = N - W, m = null;
    if (!A.thin) {
      if (cache.sig === sig) m = cache.m;
      else { m = Model.fit(series.slice(off).map(function (p) { return p.raw; })); cache = { sig: sig, m: m, bt: undefined }; }
    }
    series.forEach(function (p) { p.trend = p.w; p.lvl = p.w; });
    if (m) {
      var r = m.params.r;
      for (i = 0; i < m.N; i++) {
        var p = series[off + m.offset + i], sd = Math.sqrt(m.lvlSd[i] * m.lvlSd[i] + r);
        p.trend = p.lvl = m.lvl[i]; p.slope = m.slope[i]; p.slopeSd = m.slopeSd[i];
        p.lo = p.lvl - 1.96 * sd; p.hi = p.lvl + 1.96 * sd;
        p.out = p.raw !== null && (p.raw < p.lo || p.raw > p.hi);
      }
      A.noiseSd = Math.sqrt(r); A.params = m.params;
      A.trendSd = m.lvlSd[m.N - 1];
    }
    A.hasModel = !!m;
    A.firstRawKg = A.startKg; if (m) A.startKg = series[0].trend;
    A.currentKg = last.trend;
    A.change7 = N >= 8 ? last.trend - series[N - 8].trend : null;
    A.lostKg = A.startKg - A.currentKg;
    A.lostPct = A.lostKg / A.startKg * 100;

    // ---- pace
    if (m) {
      var sdB = Math.sqrt(m.last.P22);
      A.rate = { lossPerWeek: -7 * m.last.b, se80: Z80 * 7 * sdB };
    }
    A.fastPace = !!(A.rate && entries.length >= 14 && A.spanDays >= 14 && A.rate.lossPerWeek > 0.01 * A.currentKg && (A.rate.lossPerWeek - A.rate.se80) > 0.008 * A.currentKg);

    // ---- goal and pace target
    var goal = cfg.goalKg || null, maintain = cfg.mode === 'maintain' && !!goal;
    A.goalKg = goal; A.maintain = maintain;
    // a lose goal must sit below where you started; otherwise there is nothing to "reach"
    A.goalAbove = !!goal && !maintain && Math.max(A.startKg, A.firstRawKg) <= goal;
    A.reached = !!goal && !A.goalAbove && A.currentKg <= goal;
    if (goal && A.startKg > goal) A.goalProgress = Math.max(0, Math.min(1, (A.startKg - A.currentKg) / (A.startKg - goal)));
    else if (!goal) { A.goalProgress = Math.max(0, Math.min(1, A.lostKg / (A.startKg * 0.05))); A.goalIsDefault = true; }
    else A.goalProgress = 1;
    if (A.goalAbove) A.goalProgress = 0;
    A.paceTarget = { kgPerWeek: 0.005 * A.currentKg, source: 'default' };
    if (goal && cfg.goalDate && A.currentKg > goal) {
      var wks = (dayNum(cfg.goalDate) - A.todayN) / 7;
      if (wks > 0.5) A.paceTarget = { kgPerWeek: (A.currentKg - goal) / wks, source: 'date' };
    }
    A.paceTarget.tooFast = A.paceTarget.kgPerWeek > 0.01 * A.currentKg;
    A.pacePct = A.rate ? Math.max(0, Math.min(1, A.rate.lossPerWeek / A.paceTarget.kgPerWeek)) : 0;

    // ---- back-test on your own history, then widen ranges if past forecasts were too confident
    A.calib = 1;
    if (m && entries.length >= 21) {
      if (cache.bt === undefined) cache.bt = Model.backtest(series.slice(off).map(function (p) { return p.raw; }), 7);
      A.backtest = cache.bt;
      if (A.backtest && A.backtest.n >= 12) {
        // Test points overlap (each looks h days ahead from consecutive days), so they carry about n/h
        // independent checks. Move toward what the tests say in proportion to that, in either direction.
        var neff = A.backtest.n / A.backtest.h, w = neff / (neff + 8), raw = Math.max(0.2, A.backtest.k80 / Z80);
        A.backtest.neff = neff;
        A.calib = Math.max(0.75, Math.min(2, Math.exp(w * Math.log(raw))));
        A.calibRaw = raw;
      }
    }

    // ---- forecast + goal probabilities (simulation)
    if (m && !A.stale) {
      A.fc = { points: Model.forecast(m, HORIZON), level: m.last.mu, slope: m.last.b };
      A.fc.points.forEach(function (q) { q.sdTc = q.sdT * A.calib; q.sdRc = q.sdR * A.calib; });
      if (goal && !maintain && !A.goalAbove && A.currentKg > goal) {
        var key = sig + '|' + goal + '|' + A.calib.toFixed(3);
        if (simCache.key !== key) simCache = { key: key, sim: Model.simulate(m, goal, HORIZON, 2000, 7, A.calib) };
        var sim = simCache.sim, dh = null, h;
        for (h = 0; h <= HORIZON; h++) if (A.fc.points[h].straight <= goal) { dh = h; break; }
        var at = function (k) { return k === null ? null : dayStr(Math.max(A.todayN, last.n + k)); };
        A.eta = { reached: false, maybeNow: sim.cumTrend[Math.min(A.gap, sim.H)], median: at(sim.p50), early: at(sim.p10), late: at(sim.p90), firstReading: at(sim.r50), straight: at(dh), sim: sim };
        A.pBy = function (dateStr) { var o = dayNum(dateStr) - last.n; return o < 0 ? 0 : sim.cumTrend[Math.min(o, sim.H)]; };
        if (cfg.goalDate && dayNum(cfg.goalDate) > A.todayN) A.targetProb = A.pBy(cfg.goalDate);
      } else if (goal && !maintain && !A.goalAbove) A.eta = { reached: true };
    }

    // ---- BMI
    if (cfg.heightCm) {
      var b = bmi(A.currentKg, cfg.heightCm), band = bmiBand(b, cfg.bmiScale), sc = SCALES[cfg.bmiScale] || SCALES.who, below = null, k;
      A.bmi = { value: b, label: band.label, idx: band.idx };
      for (k = sc.cuts.length - 1; k >= 0; k--) if (b >= sc.cuts[k]) { below = sc.cuts[k]; break; }
      if (below !== null && band.idx >= 2) A.bmi.next = { cut: below, kgAt: below * Math.pow(cfg.heightCm / 100, 2), kgToGo: A.currentKg - below * Math.pow(cfg.heightCm / 100, 2), label: sc.labels[Math.max(0, band.idx - 1)] };
      A.bmiRefs = sc.cuts.map(function (c) { return { cut: c, kg: c * Math.pow(cfg.heightCm / 100, 2) }; });
    }

    // ---- weekday pattern (reported only when it is real)
    var res = [];
    series.forEach(function (p) { if (p.raw !== null) res.push({ dow: dow(p.n), r: p.raw - p.trend }); });
    if (res.length >= 28) {
      var by = [0, 1, 2, 3, 4, 5, 6].map(function () { return []; });
      res.forEach(function (x) { by[x.dow].push(x.r); });
      var sd2 = Math.sqrt(res.reduce(function (s, x) { return s + x.r * x.r; }, 0) / res.length);
      A.weekday = by.map(function (arr, j) {
        var mn = arr.length ? arr.reduce(function (s, v) { return s + v; }, 0) / arr.length : 0;
        return { dow: j, mean: mn, n: arr.length, se: arr.length ? sd2 / Math.sqrt(arr.length) : null };
      });
      A.weekdaySig = A.weekday.filter(function (x) { return x.n >= 4 && Math.abs(x.mean) > Math.max(0.2, 2 * x.se); })
        .sort(function (a, b) { return Math.abs(b.mean) - Math.abs(a.mean); });
    }

    // ---- flat stretch (only meaningful while losing)
    if (!maintain && m && N >= 21) {
      var run = 0;
      for (i = N - 1; i >= 10 && series[i].trend - series[i - 10].trend >= -0.15; i--) run++;
      A.stall = { change10: last.trend - series[N - 11].trend, now: run >= 1, days: run };
    }

    // ---- pace history (kg lost per week, with an 80% band)
    if (m) {
      A.paceHist = [];
      for (i = 7; i < m.N; i++) {
        var q = series[off + m.offset + i];
        A.paceHist.push({ n: q.n, d: q.d, loss: -7 * m.slope[i], lo: -7 * (m.slope[i] + Z80 * m.slopeSd[i]), hi: -7 * (m.slope[i] - Z80 * m.slopeSd[i]) });
      }
    }

    // ---- maintenance
    if (maintain) {
      var band2 = cfg.bandKg || 1, l14 = series.slice(-14), inR = l14.filter(function (p) { return Math.abs(p.trend - goal) <= band2; }).length;
      A.maint = { band: band2, inRange: inR, of: l14.length, pct: inR / l14.length, drift: m ? 7 * m.last.b : null };
    }

    // ---- logging streaks
    var set = {}, ns = [];
    entries.forEach(function (e) { var n = dayNum(e.d); set[n] = true; ns.push(n); });
    var cur = 0, n2 = A.todayN; if (!set[n2]) n2--;
    while (set[n2]) { cur++; n2--; }
    var longest = 0, run2 = 0, prev = null;
    ns.sort(function (a, b) { return a - b; }).forEach(function (x) { run2 = prev !== null && x === prev + 1 ? run2 + 1 : 1; if (run2 > longest) longest = run2; prev = x; });
    var wk = 0; for (i = 0; i < 7; i++) if (set[A.todayN - i]) wk++;
    A.streak = { current: cur, longest: longest, week: wk, today: !!set[A.todayN] };
    A.gaps = []; var gs = -1, g;
    for (g = 0; g <= N; g++) {
      if (g < N && series[g].est) { if (gs < 0) gs = g; }
      else if (gs >= 0) { A.gaps.push({ from: series[gs].d, to: series[g - 1].d, days: g - gs }); gs = -1; }
    }
    return A;
  }

  return { analyze: analyze, buildSeries: buildSeries, bmi: bmi, bmiBand: bmiBand, norm: norm, dayNum: dayNum, dayStr: dayStr, localToday: localToday, dow: dow, SCALES: SCALES };
});
