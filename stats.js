/* stats.js: all the math. No DOM, no network. Runs in the browser and in Node (for tests).
   All weights are in kg here. The UI converts to lb for display. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Stats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 86400000;
  var KCAL_PER_KG = 7700;     // rough energy content of body weight change
  var Z80 = 1.2816;           // 80% interval
  var PHI = 0.985;            // daily damping for the "it slows down" scenario
  var WINDOW = 28;            // days used to estimate current pace

  function pad(n) { return String(n).padStart(2, '0'); }
  function dayNum(s) { var p = s.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY); }
  function dayStr(n) { return new Date(n * DAY).toISOString().slice(0, 10); }
  function localToday() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dow(n) { return (n + 4) % 7; } // 0 = Sunday (1970-01-01 was a Thursday)

  function linreg(pts) {
    var n = pts.length; if (n < 3) return null;
    var sx = 0, sy = 0, i;
    for (i = 0; i < n; i++) { sx += pts[i].x; sy += pts[i].y; }
    var mx = sx / n, my = sy / n, sxx = 0, sxy = 0;
    for (i = 0; i < n; i++) { sxx += (pts[i].x - mx) * (pts[i].x - mx); sxy += (pts[i].x - mx) * (pts[i].y - my); }
    if (sxx === 0) return null;
    var slope = sxy / sxx, icpt = my - slope * mx, sse = 0;
    for (i = 0; i < n; i++) { var r = pts[i].y - (icpt + slope * pts[i].x); sse += r * r; }
    var s = Math.sqrt(sse / Math.max(1, n - 2));
    return { n: n, mx: mx, my: my, sxx: sxx, slope: slope, icpt: icpt, s: s, se: s / Math.sqrt(sxx) };
  }

  /* entries: [{d:'YYYY-MM-DD', kg:Number}] sorted, unique by date.
     Returns one point per calendar day from first to last entry.
     raw = real reading or null, est = true when filled by interpolation,
     w = raw or interpolated, trend = exponentially smoothed weight,
     ma7 = trailing 7 day mean, cma = centered 7 day mean (null near edges). */
  function buildSeries(entries, alpha) {
    alpha = alpha || 0.2;
    if (!entries.length) return [];
    var real = {}, ns = [];
    entries.forEach(function (e) { var n = dayNum(e.d); real[n] = e.kg; ns.push(n); });
    ns.sort(function (a, b) { return a - b; });
    var n0 = ns[0], n1 = ns[ns.length - 1], out = [], n;
    for (n = n0; n <= n1; n++) {
      var raw = Object.prototype.hasOwnProperty.call(real, n) ? real[n] : null, w;
      if (raw !== null) w = raw;
      else {
        var p = n - 1; while (!(p in real)) p--;
        var q = n + 1; while (!(q in real)) q++;
        w = real[p] + (real[q] - real[p]) * (n - p) / (q - p);
      }
      out.push({ n: n, d: dayStr(n), raw: raw, est: raw === null, w: w });
    }
    var i, j;
    for (i = 0; i < out.length; i++) {
      out[i].trend = i === 0 ? out[i].w : out[i - 1].trend + alpha * (out[i].w - out[i - 1].trend);
      var s = 0, c = 0;
      for (j = Math.max(0, i - 6); j <= i; j++) { s += out[j].w; c++; }
      out[i].ma7 = s / c;
      if (i >= 3 && i + 3 < out.length) {
        var t = 0; for (j = i - 3; j <= i + 3; j++) t += out[j].w;
        out[i].cma = t / 7;
      } else out[i].cma = null;
    }
    return out;
  }

  var SCALES = {
    who:  { cuts: [18.5, 25, 30],        labels: ['Underweight', 'Healthy range', 'Overweight', 'Obesity'] },
    asia: { cuts: [18.5, 23, 25, 30],    labels: ['Underweight', 'Healthy range', 'Overweight', 'Obesity I', 'Obesity II'] }
  };
  function bmi(kg, cm) { return kg / Math.pow(cm / 100, 2); }
  function bmiBand(b, scale) {
    var sc = SCALES[scale] || SCALES.who, i = 0;
    while (i < sc.cuts.length && b >= sc.cuts[i]) i++;
    return { idx: i, label: sc.labels[i] };
  }
  function bmr(kg, cm, age, sex) {
    var base = 10 * kg + 6.25 * cm - 5 * age;
    return base + (sex === 'm' ? 5 : sex === 'f' ? -161 : -78);
  }
  function etaDaysLinear(level, goal, slope) {
    if (level <= goal) return 0;
    if (slope >= 0) return null;
    return (level - goal) / (-slope);
  }
  function etaDaysDamped(level, goal, slope) {
    if (level <= goal) return 0;
    if (slope >= 0) return null;
    var k = (goal - level) * (1 - PHI) / (slope * PHI);
    if (k >= 1) return null;
    return Math.log(1 - k) / Math.log(PHI);
  }

  function analyze(entries, cfg, today) {
    cfg = cfg || {}; today = today || localToday();
    var A = { count: entries.length, today: today, todayN: dayNum(today) };
    var series = buildSeries(entries);
    A.series = series;
    if (!series.length) return A;
    var last = series[series.length - 1], first = series[0], L = series.length - 1;
    A.first = first; A.last = last;
    A.startKg = entries[0].kg;
    A.currentKg = last.trend;
    A.latestKg = entries[entries.length - 1].kg;
    A.daysSinceLast = A.todayN - last.n;
    A.change7 = L >= 7 ? last.trend - series[L - 7].trend : null;
    A.lostKg = A.startKg - A.currentKg;
    A.lostPct = A.lostKg / A.startKg * 100;
    A.lowestTrend = series.reduce(function (m, p) { return p.trend < m ? p.trend : m; }, Infinity);
    A.atLowestTrend = last.trend <= A.lowestTrend + 1e-9 && series.length > 7;

    // ---- pace + forecast (regression on real readings in the last WINDOW days)
    var pts = series.filter(function (p) { return p.raw !== null && p.n >= last.n - WINDOW + 1; })
      .map(function (p) { return { x: p.n - last.n, y: p.raw }; });
    var reg = pts.length >= 7 ? linreg(pts) : null;
    A.reg = reg;
    if (reg) {
      A.rate = { lossPerWeek: -reg.slope * 7, sePerWeek: reg.se * 7, n: reg.n };
    }

    // ---- goal, pace target
    var goal = cfg.goalKg || null;
    A.goalKg = goal;
    if (goal && A.startKg > goal) {
      A.goalProgress = Math.max(0, Math.min(1, (A.startKg - A.currentKg) / (A.startKg - goal)));
    } else if (!goal) {
      var five = A.startKg * 0.05; // fallback ring: first 5% of starting weight
      A.goalProgress = Math.max(0, Math.min(1, A.lostKg / five));
      A.goalIsDefault = true;
    }
    var def = 0.005 * A.currentKg;
    A.paceTarget = { kgPerWeek: def, source: 'default' };
    if (goal && cfg.goalDate && A.currentKg > goal) {
      var wks = (dayNum(cfg.goalDate) - A.todayN) / 7;
      if (wks > 0.5) A.paceTarget = { kgPerWeek: (A.currentKg - goal) / wks, source: 'date' };
    }
    A.paceTarget.tooFast = A.paceTarget.kgPerWeek > 0.01 * A.currentKg;
    A.pacePct = A.rate ? Math.max(0, Math.min(1, A.rate.lossPerWeek / A.paceTarget.kgPerWeek)) : 0;

    if (reg) {
      var level = reg.icpt, slope = reg.slope, fc = [], h, H = 180;
      for (h = 0; h <= H; h++) {
        var se = reg.s * Math.sqrt(1 / reg.n + Math.pow(h - reg.mx, 2) / reg.sxx);
        var damp = level + slope * PHI * (1 - Math.pow(PHI, h)) / (1 - PHI);
        fc.push({ h: h, n: last.n + h, mid: level + slope * h, lo: level + slope * h - Z80 * se, hi: level + slope * h + Z80 * se, damped: damp });
      }
      A.fc = { level: level, slope: slope, points: fc };
      if (goal) {
        var dc = etaDaysLinear(level, goal, slope);
        var dopt = etaDaysLinear(level, goal, slope - Z80 * reg.se);
        var dpes = etaDaysLinear(level, goal, slope + Z80 * reg.se);
        var dd = etaDaysDamped(level, goal, slope);
        var toDate = function (d) { return d === null ? null : dayStr(last.n + Math.ceil(d)); };
        A.eta = {
          reached: level <= goal,
          central: toDate(dc), optimistic: toDate(dopt), pessimistic: toDate(dpes), damped: toDate(dd),
          centralDays: dc, damped_days: dd
        };
      }
    }

    // ---- BMI
    if (cfg.heightCm) {
      var b = bmi(A.currentKg, cfg.heightCm), band = bmiBand(b, cfg.bmiScale);
      A.bmi = { value: b, label: band.label, idx: band.idx, startValue: bmi(A.startKg, cfg.heightCm) };
      var sc = SCALES[cfg.bmiScale] || SCALES.who, below = null;
      for (var k = sc.cuts.length - 1; k >= 0; k--) if (b >= sc.cuts[k]) { below = sc.cuts[k]; break; }
      if (below !== null) {
        var kgAt = below * Math.pow(cfg.heightCm / 100, 2);
        A.bmi.next = { cut: below, kgAt: kgAt, kgToGo: A.currentKg - kgAt, label: sc.labels[Math.max(0, band.idx - 1)] };
      }
      A.bmiCrossings = [];
      sc.cuts.forEach(function (cut) {
        if (bmi(first.trend, cfg.heightCm) >= cut) {
          for (var i = 0; i < series.length; i++) if (bmi(series[i].trend, cfg.heightCm) < cut) { A.bmiCrossings.push({ cut: cut, date: series[i].d }); break; }
        }
      });
    }

    // ---- energy
    if (cfg.heightCm && cfg.age) {
      var act = cfg.activity || 1.375;
      var bm = bmr(A.currentKg, cfg.heightCm, cfg.age, cfg.sex), td = bm * act;
      A.energy = { bmr: bm, tdee: td };
      if (A.rate) {
        var def2 = A.rate.lossPerWeek * KCAL_PER_KG / 7;
        A.energy.deficit = def2; A.energy.intake = td - def2;
        A.energy.lowIntake = A.energy.intake < bm;
      }
    }
    A.fastPace = !!(A.rate && A.rate.lossPerWeek > 0.01 * A.currentKg);

    // ---- weekday effect
    var res = [];
    series.forEach(function (p) { if (p.raw !== null && p.cma !== null) res.push({ dow: dow(p.n), r: p.raw - p.cma }); });
    if (res.length >= 28) {
      var by = [0, 1, 2, 3, 4, 5, 6].map(function () { return []; });
      res.forEach(function (x) { by[x.dow].push(x.r); });
      var msq = res.reduce(function (s, x) { return s + x.r * x.r; }, 0) / res.length, sd = Math.sqrt(msq);
      A.weekday = by.map(function (arr, i) {
        var m = arr.length ? arr.reduce(function (s, v) { return s + v; }, 0) / arr.length : 0;
        return { dow: i, mean: m, n: arr.length, se: arr.length ? sd / Math.sqrt(arr.length) : null };
      });
      A.residSd = sd;
      A.anomalies = [];
      for (var i2 = res.length - 1; i2 >= 0; i2--) { /* filled below with dates */ }
      series.forEach(function (p) {
        if (p.raw !== null && p.cma !== null) {
          var r = p.raw - p.cma;
          if (Math.abs(r) > Math.max(0.8, 2.5 * sd)) A.anomalies.push({ d: p.d, diff: r });
        }
      });
      A.anomalies = A.anomalies.slice(-5).reverse();
    }

    // ---- stalls (trend moved less than 0.15 kg in 10 days)
    var flags = series.map(function (p, i) { return i >= 10 && (p.trend - series[i - 10].trend) >= -0.15; });
    A.stalls = []; var s0 = -1;
    for (var m = 0; m <= flags.length; m++) {
      if (m < flags.length && flags[m]) { if (s0 < 0) s0 = m; }
      else if (s0 >= 0) {
        if (m - s0 >= 4) A.stalls.push({ from: series[s0 - 10].d, to: series[m - 1].d, days: m - 1 - (s0 - 10) + 1 });
        s0 = -1;
      }
    }
    A.stalledNow = flags[flags.length - 1] === true && A.stalls.length > 0 && A.stalls[A.stalls.length - 1].to === last.d;

    // ---- logging streaks
    var set = {}, ns = [];
    entries.forEach(function (e) { var n = dayNum(e.d); set[n] = true; ns.push(n); });
    var cur = 0, n = A.todayN; if (!set[n]) n--;
    while (set[n]) { cur++; n--; }
    var longest = 0, run = 0, prev = null;
    ns.sort(function (a, b) { return a - b; }).forEach(function (x) { run = prev !== null && x === prev + 1 ? run + 1 : 1; if (run > longest) longest = run; prev = x; });
    var wk = 0; for (var q = 0; q < 7; q++) if (set[A.todayN - q]) wk++;
    A.streak = { current: cur, longest: longest, week: wk, today: !!set[A.todayN], aliveToday: !!set[A.todayN] };

    // ---- weekly pace history (loss per 7 day block, from smoothed trend)
    A.weekly = [];
    for (var e = L; e - 7 >= 0 && A.weekly.length < 12; e -= 7) A.weekly.unshift({ end: series[e].d, loss: series[e - 7].trend - series[e].trend });

    // ---- data quality
    A.gaps = []; var gs = -1;
    for (var g = 0; g <= series.length; g++) {
      if (g < series.length && series[g].est) { if (gs < 0) gs = g; }
      else if (gs >= 0) { A.gaps.push({ from: series[gs].d, to: series[g - 1].d, days: g - gs }); gs = -1; }
    }
    A.realCount = entries.length; A.estCount = series.length - entries.length; A.spanDays = series.length;

    // ---- awards
    var aw = [], have;
    var pctDate = function (pct) {
      for (var i = 0; i < series.length; i++) if ((A.startKg - series[i].trend) / A.startKg * 100 >= pct) return series[i].d;
      return null;
    };
    aw.push({ id: 'first', icon: '⭐', title: 'First entry', earned: true });
    [3, 7, 14, 30].forEach(function (d) { aw.push({ id: 's' + d, icon: '🔥', title: d + ' day streak', earned: longest >= d, have: Math.min(longest, d), need: d }); });
    [30, 60, 100].forEach(function (d) { aw.push({ id: 'l' + d, icon: '📅', title: d + ' days logged', earned: entries.length >= d, have: Math.min(entries.length, d), need: d }); });
    [1, 2, 3, 5, 7, 10].forEach(function (p) { aw.push({ id: 'p' + p, icon: '📉', title: p + '% lost', earned: A.lostPct >= p, date: pctDate(p), have: Math.max(0, +A.lostPct.toFixed(1)), need: p, pct: true }); });
    (A.bmiCrossings || []).forEach(function (c) { aw.push({ id: 'b' + c.cut, icon: '🎯', title: 'BMI under ' + c.cut, earned: true, date: c.date }); });
    if (goal) aw.push({ id: 'goal', icon: '🏁', title: 'Goal reached', earned: A.currentKg <= goal });
    A.awards = aw;

    return A;
  }

  return {
    analyze: analyze, buildSeries: buildSeries, linreg: linreg, bmi: bmi, bmiBand: bmiBand, bmr: bmr,
    dayNum: dayNum, dayStr: dayStr, localToday: localToday, dow: dow, SCALES: SCALES, KCAL_PER_KG: KCAL_PER_KG, WINDOW: WINDOW
  };
});
