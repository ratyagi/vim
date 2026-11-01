/* charts.js: dependency-free SVG charts and the activity rings.
   Charts are drawn at the real pixel width of their card, so text stays the same size
   on a phone and on a wide desktop window. */
(function () {
  'use strict';
  var DAY = 86400000;
  var registry = {};

  function dateShort(n) { return new Date(n * DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
  function niceTicks(lo, hi, target) {
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    var raw = (hi - lo) / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
    var a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, ticks = [];
    for (var v = a; v <= b + step * 1e-6; v += step) ticks.push(+v.toFixed(6));
    return { ticks: ticks, min: a, max: b, step: step };
  }
  function fmtTick(v, step) { return step >= 1 ? String(Math.round(v)) : v.toFixed(step >= 0.1 ? 1 : 2); }
  function f1(x) { return x.toFixed(1); }
  function pts(arr, x, y) { return arr.map(function (p) { return f1(x(p.n)) + ',' + f1(y(p.v)); }); }
  function xticks(s, o, x, W, H, padB) {
    var xt = Math.max(2, Math.min(5, Math.floor(W / 110)));
    for (var i = 0; i <= xt; i++) {
      var n = Math.round(o.n0 + (o.n1 - o.n0) * i / xt);
      s.push('<text x="' + f1(x(n)) + '" y="' + (H - 7) + '" text-anchor="' + (i === 0 ? 'start' : i === xt ? 'end' : 'middle') + '">' + dateShort(n) + '</text>');
    }
  }

  /* o: id, W, H, n0, n1, trend[{n,v}], raw[{n,v,est,out}], band{lo[],hi[]}|null, fc{mid,lo,hi,straight}|null,
        goal, refs[{v,label}], readout(n), label */
  function lineChart(o) {
    var W = o.W, H = o.H, padL = 8, padR = 40, padT = 12, padB = 24, pw = W - padL - padR, ph = H - padT - padB;
    var vals = [];
    o.trend.forEach(function (p) { vals.push(p.v); });
    o.raw.forEach(function (p) { vals.push(p.v); });
    if (o.band) { o.band.lo.forEach(function (p) { vals.push(p.v); }); o.band.hi.forEach(function (p) { vals.push(p.v); }); }
    if (o.fc) { o.fc.lo.forEach(function (p) { vals.push(p.v); }); o.fc.hi.forEach(function (p) { vals.push(p.v); }); }
    if (o.goal != null) {
      var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), span = Math.max(1, mx - mn);
      if (o.fc || (o.goal > mn - span * 0.6 && o.goal < mx + span * 0.6)) vals.push(o.goal);
    }
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = (hi - lo) * 0.05 || 0.5;
    var T = niceTicks(lo - pad, hi + pad, Math.max(3, Math.min(6, Math.round(ph / 48))));
    var x = function (n) { return padL + (n - o.n0) / Math.max(1, o.n1 - o.n0) * pw; };
    var y = function (v) { return padT + (1 - (v - T.min) / (T.max - T.min)) * ph; };
    var s = ['<svg class="chart" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (o.label || 'Weight chart') + '" data-chart="' + o.id + '">'];
    s.push('<defs><linearGradient id="ar-' + o.id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff2d55" stop-opacity=".28"/><stop offset="1" stop-color="#ff2d55" stop-opacity="0"/></linearGradient></defs>');
    T.ticks.forEach(function (t) {
      s.push('<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(y(t)) + '" y2="' + f1(y(t)) + '" stroke="#2c2c2e"/>');
      s.push('<text x="' + (W - padR + 6) + '" y="' + f1(y(t) + 3.5) + '">' + fmtTick(t, T.step) + '</text>');
    });
    xticks(s, o, x, W, H, padB);
    (o.refs || []).forEach(function (r) {
      if (r.v > T.min + (T.max - T.min) * 0.03 && r.v < T.max - (T.max - T.min) * 0.03) {
        s.push('<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(y(r.v)) + '" y2="' + f1(y(r.v)) + '" stroke="#8e8e93" stroke-opacity=".5" stroke-dasharray="1 4" stroke-linecap="round"/>');
        s.push('<text x="' + (W - padR - 4) + '" y="' + f1(y(r.v) - 4) + '" text-anchor="end" style="fill:#8e8e93">' + r.label + '</text>');
      }
    });
    if (o.band && o.band.hi.length > 1) {
      s.push('<polygon points="' + pts(o.band.hi, x, y).concat(pts(o.band.lo.slice().reverse(), x, y)).join(' ') + '" fill="#fff" fill-opacity=".07"/>');
    }
    if (o.fc) {
      s.push('<polygon points="' + pts(o.fc.hi, x, y).concat(pts(o.fc.lo.slice().reverse(), x, y)).join(' ') + '" fill="#a3f408" fill-opacity=".12"/>');
    }
    if (o.goal != null && y(o.goal) >= padT && y(o.goal) <= padT + ph) {
      s.push('<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(y(o.goal)) + '" y2="' + f1(y(o.goal)) + '" stroke="#fff" stroke-opacity=".5" stroke-dasharray="4 4"/>');
      s.push('<text x="' + (padL + 2) + '" y="' + f1(y(o.goal) - 5) + '" style="fill:#fff;fill-opacity:.75">Goal</text>');
    }
    if (o.trend.length > 1) {
      var tp = pts(o.trend, x, y), a = o.trend[0], z = o.trend[o.trend.length - 1];
      s.push('<polygon points="' + tp.join(' ') + ' ' + f1(x(z.n)) + ',' + (padT + ph) + ' ' + f1(x(a.n)) + ',' + (padT + ph) + '" fill="url(#ar-' + o.id + ')"/>');
      s.push('<polyline points="' + tp.join(' ') + '" fill="none" stroke="#ff2d55" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>');
    }
    if (o.fc) {
      if (o.fc.straight) s.push('<polyline points="' + pts(o.fc.straight, x, y).join(' ') + '" fill="none" stroke="#2de3f0" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/>');
      s.push('<polyline points="' + pts(o.fc.mid, x, y).join(' ') + '" fill="none" stroke="#a3f408" stroke-width="2.2" stroke-dasharray="6 5" stroke-linecap="round"/>');
    }
    o.raw.forEach(function (p) {
      var cx = f1(x(p.n)), cy = f1(y(p.v));
      if (p.est) s.push('<circle cx="' + cx + '" cy="' + cy + '" r="2.4" fill="none" stroke="#8e8e93"/>');
      else if (p.out) s.push('<circle cx="' + cx + '" cy="' + cy + '" r="3.6" fill="#ff9f0a" stroke="#000" stroke-width="1"/>');
      else s.push('<circle cx="' + cx + '" cy="' + cy + '" r="2.7" fill="#fff" fill-opacity=".65"/>');
    });
    if (o.trend.length) {
      var lp = o.trend[o.trend.length - 1];
      s.push('<circle cx="' + f1(x(lp.n)) + '" cy="' + f1(y(lp.v)) + '" r="5" fill="#ff2d55" stroke="#fff" stroke-width="2"/>');
    }
    s.push('<line id="hl-' + o.id + '" y1="' + padT + '" y2="' + (padT + ph) + '" stroke="#fff" stroke-opacity=".5" visibility="hidden"/>');
    s.push('<rect x="' + padL + '" y="' + padT + '" width="' + pw + '" height="' + ph + '" fill="transparent" style="cursor:crosshair"/></svg>');
    registry[o.id] = { n0: o.n0, n1: o.n1, padL: padL, pw: pw, W: W, readout: o.readout };
    return s.join('');
  }

  /* pace over time: o.pts [{n,v,lo,hi}] (kg or lb lost per week), o.target */
  function paceChart(o) {
    var W = o.W, H = o.H, padL = 8, padR = 40, padT = 12, padB = 24, pw = W - padL - padR, ph = H - padT - padB, vs = [0], i;
    o.pts.forEach(function (p) { vs.push(p.lo, p.hi, p.v); }); if (o.target != null) vs.push(o.target);
    var T = niceTicks(Math.min.apply(null, vs), Math.max.apply(null, vs) * 1.05, 4);
    var x = function (n) { return padL + (n - o.n0) / Math.max(1, o.n1 - o.n0) * pw; };
    var y = function (v) { return padT + (1 - (v - T.min) / (T.max - T.min)) * ph; };
    var s = ['<svg class="chart" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (o.label || 'Pace over time') + '">'];
    T.ticks.forEach(function (t) {
      s.push('<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(y(t)) + '" y2="' + f1(y(t)) + '" stroke="' + (t === 0 ? '#48484a' : '#2c2c2e') + '"/>');
      s.push('<text x="' + (W - padR + 6) + '" y="' + f1(y(t) + 3.5) + '">' + fmtTick(t, T.step) + '</text>');
    });
    xticks(s, o, x, W, H, padB);
    var up = o.pts.map(function (p) { return f1(x(p.n)) + ',' + f1(y(p.hi)); }), dn = o.pts.slice().reverse().map(function (p) { return f1(x(p.n)) + ',' + f1(y(p.lo)); });
    s.push('<polygon points="' + up.concat(dn).join(' ') + '" fill="#2de3f0" fill-opacity=".16"/>');
    if (o.target != null) {
      s.push('<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(y(o.target)) + '" y2="' + f1(y(o.target)) + '" stroke="#fff" stroke-opacity=".5" stroke-dasharray="4 4"/>');
      s.push('<text x="' + (padL + 2) + '" y="' + f1(y(o.target) - 5) + '" style="fill:#fff;fill-opacity:.75">Target pace</text>');
    }
    s.push('<polyline points="' + o.pts.map(function (p) { return f1(x(p.n)) + ',' + f1(y(p.v)); }).join(' ') + '" fill="none" stroke="#2de3f0" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>');
    var lp = o.pts[o.pts.length - 1];
    s.push('<circle cx="' + f1(x(lp.n)) + '" cy="' + f1(y(lp.v)) + '" r="4.5" fill="#2de3f0" stroke="#000" stroke-width="2"/></svg>');
    return s.join('');
  }

  /* chance of reaching the goal by each date: o.pts [{n,p}], o.marks [{n,label,color}] */
  function probChart(o) {
    var W = o.W, H = o.H, padL = 8, padR = 40, padT = 18, padB = 24, pw = W - padL - padR, ph = H - padT - padB;
    var x = function (n) { return padL + (n - o.n0) / Math.max(1, o.n1 - o.n0) * pw; };
    var y = function (p) { return padT + (1 - p) * ph; };
    var s = ['<svg class="chart" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (o.label || 'Chance of reaching goal by date') + '">'];
    s.push('<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a3f408" stop-opacity=".3"/><stop offset="1" stop-color="#a3f408" stop-opacity="0"/></linearGradient></defs>');
    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      s.push('<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(y(t)) + '" y2="' + f1(y(t)) + '" stroke="#2c2c2e"/>');
      s.push('<text x="' + (W - padR + 6) + '" y="' + f1(y(t) + 3.5) + '">' + Math.round(t * 100) + '%</text>');
    });
    xticks(s, o, x, W, H, padB);
    var line = o.pts.map(function (p) { return f1(x(p.n)) + ',' + f1(y(p.p)); });
    s.push('<polygon points="' + line.join(' ') + ' ' + f1(x(o.pts[o.pts.length - 1].n)) + ',' + f1(y(0)) + ' ' + f1(x(o.pts[0].n)) + ',' + f1(y(0)) + '" fill="url(#pg)"/>');
    s.push('<polyline points="' + line.join(' ') + '" fill="none" stroke="#a3f408" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>');
    (o.marks || []).forEach(function (m) {
      if (m.n < o.n0 || m.n > o.n1) return;
      s.push('<line x1="' + f1(x(m.n)) + '" x2="' + f1(x(m.n)) + '" y1="' + (padT - 4) + '" y2="' + (padT + ph) + '" stroke="' + m.color + '" stroke-dasharray="3 4"/>');
      var right = x(m.n) > W - 90;
      s.push('<text x="' + f1(x(m.n) + (right ? -4 : 4)) + '" y="' + (padT + 6) + '" text-anchor="' + (right ? 'end' : 'start') + '" style="fill:' + m.color + '">' + m.label + '</text>');
    });
    return s.join('') + '</svg>';
  }

  /* vals: [{pct 0..1, c1, c2}] outermost first */
  function rings(vals) {
    var sw = 22, radii = [86, 62, 38], defs = '', g = '';
    vals.forEach(function (v, i) {
      var r = radii[i], c = 2 * Math.PI * r, pct = Math.max(0, Math.min(1, v.pct || 0));
      defs += '<linearGradient id="rg' + i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + v.c1 + '"/><stop offset="1" stop-color="' + v.c2 + '"/></linearGradient>';
      g += '<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="' + v.c1 + '" stroke-opacity=".22" stroke-width="' + sw + '"/>';
      g += '<circle class="ring-arc" cx="100" cy="100" r="' + r + '" fill="none" stroke="url(#rg' + i + ')" stroke-width="' + sw + '" stroke-linecap="round" transform="rotate(-90 100 100)" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + c.toFixed(2) + '" data-off="' + (c * (1 - pct)).toFixed(2) + '" style="' + (pct < 0.01 ? 'opacity:0' : '') + '"/>';
    });
    return '<svg viewBox="0 0 200 200" role="img" aria-label="Progress rings"><defs>' + defs + '</defs>' + g + '</svg>';
  }
  function animateRings(root) {
    var arcs = root.querySelectorAll('.ring-arc');
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      arcs.forEach(function (a) { a.style.strokeDashoffset = a.getAttribute('data-off'); });
    }); });
  }

  /* hover and touch scrubbing for line charts */
  function bind(root) {
    root.querySelectorAll('svg[data-chart]').forEach(function (svg) {
      var id = svg.getAttribute('data-chart'), m = registry[id]; if (!m) return;
      var line = svg.querySelector('#hl-' + id), card = svg.closest('.card') || document, ro = card.querySelector('#ro-' + id);
      function move(ev) {
        var r = svg.getBoundingClientRect(), vx = (ev.clientX - r.left) / r.width * m.W;
        var n = Math.max(m.n0, Math.min(m.n1, Math.round(m.n0 + (vx - m.padL) / m.pw * (m.n1 - m.n0))));
        var xx = m.padL + (n - m.n0) / Math.max(1, m.n1 - m.n0) * m.pw;
        line.setAttribute('x1', xx); line.setAttribute('x2', xx); line.setAttribute('visibility', 'visible');
        if (ro && m.readout) ro.innerHTML = m.readout(n);
      }
      function leave() { line.setAttribute('visibility', 'hidden'); if (ro && m.readout) ro.innerHTML = m.readout(null); }
      svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move); svg.addEventListener('pointerleave', leave);
    });
  }

  window.Charts = { lineChart: lineChart, paceChart: paceChart, probChart: probChart, rings: rings, animateRings: animateRings, bind: bind, dateShort: dateShort };
})();
