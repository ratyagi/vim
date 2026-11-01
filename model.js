/* model.js: the statistical engine. No DOM, no network. Runs in the browser and in Node.

   Model: a local linear trend (a Kalman filter with a smoother).
     true weight  mu(t)  drifts by  beta(t) kg per day
     pace         beta(t) itself wanders slowly
     each reading = mu(t) + scale noise (water, salt, timing)
   The three noise sizes are learned from your own readings by maximum likelihood.
   Missing days need no filling: the filter simply skips the update on those days.

   What this gives that a moving average cannot:
     - a trend with no lag (a moving average sits behind a falling weight)
     - a pace with an honest uncertainty
     - a forecast whose range widens the way real uncertainty does
     - probabilities ("chance of reaching goal by date") from simulating that forecast
     - a back-test: how wrong would this method have been on your past data? */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Model = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var Z80 = 1.2816, LN2PI = Math.log(2 * Math.PI);
  var SLOPE_PRIOR_VAR = 0.15 * 0.15;   // (kg/day)^2, deliberately loose

  /* 2x2 matrices as [a,b,c,d] row-major */
  function mul(A, B) { return [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]]; }
  function tr(A) { return [A[0], A[2], A[1], A[3]]; }
  function add(A, B) { return [A[0] + B[0], A[1] + B[1], A[2] + B[2], A[3] + B[3]]; }
  function sub(A, B) { return [A[0] - B[0], A[1] - B[1], A[2] - B[2], A[3] - B[3]]; }
  function sq(x) { return x * x; }

  /* Forward pass. obs: daily array of kg or null, obs[0] must be a number.
     p = {r, ql, qs}: reading variance, level noise per day, pace noise per day. */
  function filter(obs, p, keep) {
    var N = obs.length, r = p.r, phi = p.phi || 1, qa = p.ql + p.qs / 3, qb = p.qs / 2, qc = p.qs, ll = 0, t;
    var mu = obs[0], b = 0, P11 = 1e4, P12 = 0, P22 = SLOPE_PRIOR_VAR;
    var xf, Pf, xp, Pp;
    if (keep) { xf = new Array(N); Pf = new Array(N); xp = new Array(N); Pp = new Array(N); }
    for (t = 0; t < N; t++) {
      if (t > 0) {
        mu += b; b *= phi;
        var n11 = P11 + 2 * P12 + P22 + qa, n12 = phi * (P12 + P22) + qb, n22 = phi * phi * P22 + qc;
        P11 = n11; P12 = n12; P22 = n22;
      }
      if (keep) { xp[t] = [mu, b]; Pp[t] = [P11, P12, P12, P22]; }
      var y = obs[t];
      if (y !== null) {
        var S = P11 + r, v = y - mu, K1 = P11 / S, K2 = P12 / S;
        ll += -0.5 * (LN2PI + Math.log(S) + v * v / S);
        mu += K1 * v; b += K2 * v;
        var m11 = (1 - K1) * P11, m12 = (1 - K1) * P12, m22 = P22 - K2 * P12;
        P11 = m11; P12 = m12; P22 = m22;
      }
      if (keep) { xf[t] = [mu, b]; Pf[t] = [P11, P12, P12, P22]; }
    }
    return { ll: ll, xf: xf, Pf: Pf, xp: xp, Pp: Pp, last: { mu: mu, b: b, P11: P11, P12: P12, P22: P22 } };
  }

  /* Rauch-Tung-Striebel backward pass: uses future readings to sharpen the past. */
  function smooth(f, phi) {
    phi = phi || 1;
    var N = f.xf.length, xs = new Array(N), Ps = new Array(N), t;
    xs[N - 1] = f.xf[N - 1].slice(); Ps[N - 1] = f.Pf[N - 1].slice();
    for (t = N - 2; t >= 0; t--) {
      var Pf = f.Pf[t], Pp = f.Pp[t + 1];
      var A = [Pf[0] + Pf[1], phi * Pf[1], Pf[1] + Pf[3], phi * Pf[3]];  // Pf * F'
      var det = Pp[0] * Pp[3] - Pp[1] * Pp[2];
      var inv = [Pp[3] / det, -Pp[1] / det, -Pp[2] / det, Pp[0] / det];
      var C = mul(A, inv);
      var d0 = xs[t + 1][0] - f.xp[t + 1][0], d1 = xs[t + 1][1] - f.xp[t + 1][1];
      xs[t] = [f.xf[t][0] + C[0] * d0 + C[1] * d1, f.xf[t][1] + C[2] * d0 + C[3] * d1];
      Ps[t] = add(Pf, mul(mul(C, sub(Ps[t + 1], Pp)), tr(C)));
    }
    return { xs: xs, Ps: Ps };
  }

  function logPrior(p) {   // weak priors keep short data sets from picking silly extremes
    return -0.5 * (sq(Math.log(p.r / 0.2) / 1.0) + sq(Math.log(p.ql / 1e-4) / 2.3) + sq(Math.log(p.qs / 1e-6) / 2.3) + sq(((p.phi || 1) - 0.99) / 0.03));
  }
  function geo(a, b, n) { var o = [], i; for (i = 0; i < n; i++) o.push(a * Math.pow(b / a, i / (n - 1))); return o; }
  var GRID_FULL = { r: geo(0.03, 1.5, 12), ql: [1e-6, 1e-5, 1e-4, 1e-3, 1e-2], qs: [1e-8, 1e-7, 1e-6, 1e-5, 1e-4], phi: [1, 0.995, 0.99, 0.98, 0.96, 0.93] };
  var GRID_FAST = { r: [0.06, 0.12, 0.25, 0.5, 1.0], ql: [1e-5, 1e-4, 1e-3], qs: [1e-7, 1e-6, 1e-5], phi: [1, 0.99, 0.97] };

  function fitParams(obs, grid) {
    var best = null, bs = -Infinity, i, j, k, p, s, a;
    for (a = 0; a < grid.phi.length; a++) for (i = 0; i < grid.r.length; i++) for (j = 0; j < grid.ql.length; j++) for (k = 0; k < grid.qs.length; k++) {
      p = { r: grid.r[i], ql: grid.ql[j], qs: grid.qs[k], phi: grid.phi[a] };
      s = filter(obs, p, false).ll + logPrior(p);
      if (s > bs) { bs = s; best = p; }
    }
    var f = [0.6, 1, 1.6], base = best;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) for (k = 0; k < 3; k++) {
      p = { r: base.r * f[i], ql: base.ql * f[j], qs: base.qs * f[k], phi: base.phi };
      s = filter(obs, p, false).ll + logPrior(p);
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }

  /* obs: daily array of kg or null. Returns null when there is too little data. */
  function fit(obs, opts) {
    var s0 = 0; while (s0 < obs.length && obs[s0] === null) s0++;
    var o = obs.slice(s0), cnt = 0, i;
    for (i = 0; i < o.length; i++) if (o[i] !== null) cnt++;
    if (cnt < 5) return null;
    var params = fitParams(o, opts && opts.fast ? GRID_FAST : GRID_FULL);
    var f = filter(o, params, true), sm = smooth(f, params.phi), N = o.length;
    var m = { params: params, offset: s0, N: N, lvl: new Array(N), lvlSd: new Array(N), slope: new Array(N), slopeSd: new Array(N), last: f.last, ll: f.ll };
    for (i = 0; i < N; i++) {
      m.lvl[i] = sm.xs[i][0]; m.slope[i] = sm.xs[i][1];
      m.lvlSd[i] = Math.sqrt(Math.max(0, sm.Ps[i][0])); m.slopeSd[i] = Math.sqrt(Math.max(0, sm.Ps[i][3]));
    }
    return m;
  }

  /* Forecast from the last day. Returns points h = 0..H with the expected weight (using the pace
     slowing the model learned from your data), the spread of the trend (sdT), the spread of a single
     reading (sdR), and a reference line where the pace never slows (straight). */
  function forecast(m, H) {
    var p = m.params, phi = p.phi || 1, qa = p.ql + p.qs / 3, qb = p.qs / 2, qc = p.qs;
    var mu = m.last.mu, b = m.last.b, P11 = m.last.P11, P12 = m.last.P12, P22 = m.last.P22, pts = [], h;
    var mu0 = mu, b0 = b;
    pts.push({ h: 0, mean: mu, sdT: Math.sqrt(P11), sdR: Math.sqrt(P11 + p.r), straight: mu });
    for (h = 1; h <= H; h++) {
      mu += b; b *= phi;
      var n11 = P11 + 2 * P12 + P22 + qa, n12 = phi * (P12 + P22) + qb, n22 = phi * phi * P22 + qc;
      P11 = n11; P12 = n12; P22 = n22;
      pts.push({ h: h, mean: mu, sdT: Math.sqrt(P11), sdR: Math.sqrt(P11 + p.r), straight: mu0 + b0 * h });
    }
    return pts;
  }

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* Monte Carlo: draw many futures consistent with the fitted model and record when the TREND
     first reaches the goal, and when a single READING first does (readings dip under the goal
     before the trend does, because of scale noise). Seeded, so numbers do not jump on re-render. */
  function simulate(m, goal, H, nSim, seed, scale) {
    scale = scale || 1;
    var rand = mulberry(seed || 7), spare = null;
    function gauss() {
      if (spare !== null) { var s = spare; spare = null; return s; }
      var u = 0; while (u === 0) u = rand();
      var v = rand(), mag = Math.sqrt(-2 * Math.log(u));
      spare = mag * Math.sin(2 * Math.PI * v); return mag * Math.cos(2 * Math.PI * v);
    }
    var p = m.params, phi = p.phi || 1, qa = p.ql + p.qs / 3, qb = p.qs / 2, qc = p.qs, sr = Math.sqrt(p.r);
    var l11 = Math.sqrt(Math.max(m.last.P11, 1e-12)), l21 = m.last.P12 / l11, l22 = Math.sqrt(Math.max(m.last.P22 - l21 * l21, 1e-14));
    var q11 = Math.sqrt(Math.max(qa, 1e-14)), q21 = qb / q11, q22 = Math.sqrt(Math.max(qc - q21 * q21, 1e-18));
    l11 *= scale; l21 *= scale; l22 *= scale; q11 *= scale; q21 *= scale; q22 *= scale; sr *= scale;
    var cntT = new Int32Array(H + 2), cntR = new Int32Array(H + 2), s, t;
    for (s = 0; s < nSim; s++) {
      var z1 = gauss(), z2 = gauss();
      var mu = m.last.mu + l11 * z1, b = m.last.b + l21 * z1 + l22 * z2, ht = -1, hr = -1;
      for (t = 1; t <= H; t++) {
        var w1 = gauss(), w2 = gauss(), nm = mu + b + q11 * w1, nb = phi * b + q21 * w1 + q22 * w2;
        mu = nm; b = nb;
        if (ht < 0 && mu <= goal) ht = t;
        if (hr < 0 && mu + sr * gauss() <= goal) hr = t;
        if (ht >= 0 && hr >= 0) break;
      }
      cntT[ht < 0 ? H + 1 : ht]++; cntR[hr < 0 ? H + 1 : hr]++;
    }
    var cumT = new Array(H + 1), cumR = new Array(H + 1), aT = 0, aR = 0, h;
    for (h = 0; h <= H; h++) { aT += cntT[h]; aR += cntR[h]; cumT[h] = aT / nSim; cumR[h] = aR / nSim; }
    function q(cum, pr) { for (var i = 0; i <= H; i++) if (cum[i] >= pr) return i; return null; }
    return { cumTrend: cumT, cumRead: cumR, H: H,
      p10: q(cumT, 0.1), p50: q(cumT, 0.5), p90: q(cumT, 0.9), r50: q(cumR, 0.5) };
  }

  function linFit(xs, ys) {
    var n = xs.length, sx = 0, sy = 0, i; if (n < 3) return null;
    for (i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    var mx = sx / n, my = sy / n, sxx = 0, sxy = 0;
    for (i = 0; i < n; i++) { sxx += sq(xs[i] - mx); sxy += (xs[i] - mx) * (ys[i] - my); }
    if (sxx === 0) return null;
    var s = sxy / sxx; return { slope: s, at: function (x) { return my + s * (x - mx); } };
  }

  /* Rolling-origin back-test. For each past reading (from the 14th on), pretend it is "today",
     refit using only data up to then, forecast h days ahead, and compare with what happened.
     Baselines: "same as the last reading" and "straight line through the last 14 days". */
  function backtest(obs, h) {
    var N = obs.length, origins = [], i, cnt = 0;
    for (i = 0; i < N; i++) {
      if (obs[i] !== null) cnt++;
      if (cnt >= 14 && i + h < N && obs[i + h] !== null && obs[i] !== null) origins.push(i);
    }
    origins = origins.slice(-60);
    var res = { n: 0, h: h, eM: 0, eN: 0, eL: 0, nL: 0, inside: 0, bias: 0 }, zs = [], k;
    for (k = 0; k < origins.length; k++) {
      var t0 = origins[k], lo = Math.max(0, t0 - 119), win = obs.slice(lo, t0 + 1);
      var m = fit(win, { fast: true }); if (!m) continue;
      var pt = forecast(m, h)[h], actual = obs[t0 + h];
      res.n++; res.eM += Math.abs(actual - pt.mean); res.bias += (actual - pt.mean);
      res.eN += Math.abs(actual - obs[t0]);
      if (Math.abs(actual - pt.mean) <= Z80 * pt.sdR) res.inside++;
      zs.push(Math.abs(actual - pt.mean) / pt.sdR);
      var xs = [], ys = [], j;
      for (j = Math.max(0, win.length - 14); j < win.length; j++) if (win[j] !== null) { xs.push(j); ys.push(win[j]); }
      var lf = linFit(xs, ys);
      if (lf) { res.eL += Math.abs(actual - lf.at(win.length - 1 + h)); res.nL++; }
    }
    if (res.n < 8) return null;
    zs.sort(function (a, b) { return a - b; });
    var k80 = zs[Math.min(zs.length - 1, Math.floor(0.8 * zs.length))];
    return { k80: k80, n: res.n, h: h, maeModel: res.eM / res.n, maeNaive: res.eN / res.n, maeLinear: res.nL ? res.eL / res.nL : null, cover80: res.inside / res.n, bias: res.bias / res.n };
  }

  return { fit: fit, forecast: forecast, simulate: simulate, backtest: backtest, filter: filter, smooth: smooth, Z80: Z80 };
});
