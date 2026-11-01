/* charts.js: small dependency-free SVG charts and the activity rings. */
(function () {
  'use strict';
  var DAY = 86400000;
  var registry = {};

  function dateShort(n) {
    return new Date(n * DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
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

  /* opts: id, W, H, n0, n1, trend[{n,v}], raw[{n,v,est}], fc{mid,lo,hi,damped:[{n,v}]}|null, goal, readout(n)->html, label */
  function lineChart(o) {
    var W = o.W || 360, H = o.H || 220, padL = 8, padR = 38, padT = 10, padB = 22;
    var pw = W - padL - padR, ph = H - padT - padB;
    var vals = [];
    o.trend.forEach(function (p) { vals.push(p.v); });
    o.raw.forEach(function (p) { vals.push(p.v); });
    if (o.fc) { o.fc.lo.forEach(function (p) { vals.push(p.v); }); o.fc.hi.forEach(function (p) { vals.push(p.v); }); o.fc.damped.forEach(function (p) { vals.push(p.v); }); }
    if (o.goal != null) {
      var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), span = Math.max(1, mx - mn);
      if (o.fc || (o.goal > mn - span * 0.6 && o.goal < mx + span * 0.6)) vals.push(o.goal);
    }
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var pad = (hi - lo) * 0.06 || 0.5; lo -= pad; hi += pad;
    var T = niceTicks(lo, hi, 4);
    var x = function (n) { return padL + (n - o.n0) / Math.max(1, (o.n1 - o.n0)) * pw; };
    var y = function (v) { return padT + (1 - (v - T.min) / (T.max - T.min)) * ph; };
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (o.label || 'Weight chart') + '" data-chart="' + o.id + '">';
    s += '<defs><linearGradient id="ar-' + o.id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff2d55" stop-opacity=".32"/><stop offset="1" stop-color="#ff2d55" stop-opacity="0"/></linearGradient></defs>';
    T.ticks.forEach(function (t) {
      s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(y(t)) + '" y2="' + f1(y(t)) + '" stroke="#2c2c2e" stroke-width="1"/>';
      s += '<text x="' + (W - padR + 5) + '" y="' + f1(y(t) + 3.5) + '">' + fmtTick(t, T.step) + '</text>';
    });
    var xt = 4;
    for (var i = 0; i <= xt; i++) {
      var n = Math.round(o.n0 + (o.n1 - o.n0) * i / xt);
      var anchor = i === 0 ? 'start' : i === xt ? 'end' : 'middle';
      s += '<text x="' + f1(x(n)) + '" y="' + (H - 6) + '" text-anchor="' + anchor + '">' + dateShort(n) + '</text>';
    }
    if (o.fc) {
      var up = o.fc.hi.map(function (p) { return f1(x(p.n)) + ',' + f1(y(p.v)); });
      var dn = o.fc.lo.slice().reverse().map(function (p) { return f1(x(p.n)) + ',' + f1(y(p.v)); });
      s += '<polygon points="' + up.concat(dn).join(' ') + '" fill="#a3f408" fill-opacity=".13"/>';
    }
    if (o.goal != null && y(o.goal) >= padT && y(o.goal) <= padT + ph) {
      s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(y(o.goal)) + '" y2="' + f1(y(o.goal)) + '" stroke="#fff" stroke-opacity=".45" stroke-dasharray="4 4"/>';
      s += '<text x="' + (padL + 2) + '" y="' + f1(y(o.goal) - 4) + '" style="fill:#fff;fill-opacity:.7">Goal</text>';
    }
    if (o.trend.length > 1) {
      var tp = o.trend.map(function (p) { return f1(x(p.n)) + ',' + f1(y(p.v)); });
      var first = o.trend[0], last = o.trend[o.trend.length - 1];
      s += '<polygon points="' + tp.join(' ') + ' ' + f1(x(last.n)) + ',' + (padT + ph) + ' ' + f1(x(first.n)) + ',' + (padT + ph) + '" fill="url(#ar-' + o.id + ')"/>';
      s += '<polyline points="' + tp.join(' ') + '" fill="none" stroke="#ff2d55" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
    }
    if (o.fc) {
      s += '<polyline points="' + o.fc.damped.map(function (p) { return f1(x(p.n)) + ',' + f1(y(p.v)); }).join(' ') + '" fill="none" stroke="#2de3f0" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/>';
      s += '<polyline points="' + o.fc.mid.map(function (p) { return f1(x(p.n)) + ',' + f1(y(p.v)); }).join(' ') + '" fill="none" stroke="#a3f408" stroke-width="2" stroke-dasharray="6 5" stroke-linecap="round"/>';
    }
    o.raw.forEach(function (p) {
      if (p.est) s += '<circle cx="' + f1(x(p.n)) + '" cy="' + f1(y(p.v)) + '" r="2.4" fill="none" stroke="#8e8e93" stroke-width="1"/>';
      else s += '<circle cx="' + f1(x(p.n)) + '" cy="' + f1(y(p.v)) + '" r="2.6" fill="#fff" fill-opacity=".6"/>';
    });
    if (o.trend.length) {
      var lp = o.trend[o.trend.length - 1];
      s += '<circle cx="' + f1(x(lp.n)) + '" cy="' + f1(y(lp.v)) + '" r="5" fill="#ff2d55" stroke="#fff" stroke-width="2"/>';
    }
    s += '<line id="hl-' + o.id + '" y1="' + padT + '" y2="' + (padT + ph) + '" stroke="#fff" stroke-opacity=".5" visibility="hidden"/>';
    s += '<rect x="' + padL + '" y="' + padT + '" width="' + pw + '" height="' + ph + '" fill="transparent" style="cursor:crosshair"/>';
    s += '</svg>';
    registry[o.id] = { n0: o.n0, n1: o.n1, padL: padL, pw: pw, W: W, readout: o.readout };
    return s;
  }

  /* weekly loss bars. data: [{label, v}] (positive = lost). target: number|null */
  function barsChart(o) {
    var W = o.W || 360, H = o.H || 170, padL = 8, padR = 38, padT = 14, padB = 22;
    var pw = W - padL - padR, ph = H - padT - padB;
    var vs = o.data.map(function (d) { return d.v; }); if (o.target != null) vs.push(o.target);
    var lo = Math.min(0, Math.min.apply(null, vs)), hi = Math.max(0.1, Math.max.apply(null, vs));
    var T = niceTicks(lo, hi * 1.1, 3);
    var y = function (v) { return padT + (1 - (v - T.min) / (T.max - T.min)) * ph; };
    var bw = pw / o.data.length, s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (o.label || 'Weekly change') + '">';
    T.ticks.forEach(function (t) {
      s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(y(t)) + '" y2="' + f1(y(t)) + '" stroke="' + (t === 0 ? '#48484a' : '#2c2c2e') + '"/>';
      s += '<text x="' + (W - padR + 5) + '" y="' + f1(y(t) + 3.5) + '">' + fmtTick(t, T.step) + '</text>';
    });
    o.data.forEach(function (d, i) {
      var h = Math.abs(y(d.v) - y(0)), top = d.v >= 0 ? y(d.v) : y(0);
      s += '<rect x="' + f1(padL + i * bw + bw * 0.18) + '" y="' + f1(top) + '" width="' + f1(bw * 0.64) + '" height="' + f1(Math.max(1, h)) + '" rx="4" fill="' + (d.v >= 0 ? '#a3f408' : '#ff2d55') + '"/>';
      if (i % 2 === (o.data.length - 1) % 2) s += '<text x="' + f1(padL + i * bw + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + d.label + '</text>';
    });
    if (o.target != null) {
      s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(y(o.target)) + '" y2="' + f1(y(o.target)) + '" stroke="#2de3f0" stroke-dasharray="5 4" stroke-width="1.5"/>';
    }
    return s + '</svg>';
  }

  /* BMI trend over coloured category bands. */
  function bmiChart(o) {
    var W = o.W || 360, H = o.H || 190, padL = 8, padR = 38, padT = 10, padB = 22;
    var pw = W - padL - padR, ph = H - padT - padB;
    var vs = o.points.map(function (p) { return p.v; });
    var lo = Math.min.apply(null, vs) - 1, hi = Math.max.apply(null, vs) + 1;
    var T = niceTicks(lo, hi, 4);
    var x = function (n) { return padL + (n - o.n0) / Math.max(1, (o.n1 - o.n0)) * pw; };
    var y = function (v) { return padT + (1 - (v - T.min) / (T.max - T.min)) * ph; };
    var colors = ['#1fa9ff', '#a3f408', '#ff9f0a', '#ff2d55', '#ff2d55'];
    var edges = [-Infinity].concat(o.cuts).concat([Infinity]);
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="BMI over time">';
    for (var i = 0; i < edges.length - 1; i++) {
      var a = Math.max(edges[i], T.min), b = Math.min(edges[i + 1], T.max);
      if (b <= a) continue;
      s += '<rect x="' + padL + '" y="' + f1(y(b)) + '" width="' + pw + '" height="' + f1(y(a) - y(b)) + '" fill="' + colors[i] + '" fill-opacity=".14"/>';
      if (y(a) - y(b) > 14) s += '<text x="' + (padL + 6) + '" y="' + f1(y(b) + 12) + '" style="fill:' + colors[i] + '">' + o.labels[i] + '</text>';
    }
    T.ticks.forEach(function (t) { s += '<text x="' + (W - padR + 5) + '" y="' + f1(y(t) + 3.5) + '">' + fmtTick(t, T.step) + '</text>'; });
    for (var k = 0; k <= 3; k++) {
      var n = Math.round(o.n0 + (o.n1 - o.n0) * k / 3);
      s += '<text x="' + f1(x(n)) + '" y="' + (H - 6) + '" text-anchor="' + (k === 0 ? 'start' : k === 3 ? 'end' : 'middle') + '">' + dateShort(n) + '</text>';
    }
    s += '<polyline points="' + o.points.map(function (p) { return f1(x(p.n)) + ',' + f1(y(p.v)); }).join(' ') + '" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
    var lp = o.points[o.points.length - 1];
    s += '<circle cx="' + f1(x(lp.n)) + '" cy="' + f1(y(lp.v)) + '" r="5" fill="#fff" stroke="#000" stroke-width="2"/>';
    return s + '</svg>';
  }

  /* vals: [{pct 0..1, c1, c2}] outermost first */
  function rings(vals, size) {
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

  /* hover / touch scrubbing for line charts */
  function bind(root) {
    root.querySelectorAll('svg[data-chart]').forEach(function (svg) {
      var id = svg.getAttribute('data-chart'), m = registry[id]; if (!m) return;
      var line = svg.querySelector('#hl-' + id), ro = root.querySelector('#ro-' + id);
      function move(ev) {
        var r = svg.getBoundingClientRect(), vx = (ev.clientX - r.left) / r.width * m.W;
        var n = Math.round(m.n0 + (vx - m.padL) / m.pw * (m.n1 - m.n0));
        n = Math.max(m.n0, Math.min(m.n1, n));
        var xx = m.padL + (n - m.n0) / Math.max(1, (m.n1 - m.n0)) * m.pw;
        line.setAttribute('x1', xx); line.setAttribute('x2', xx); line.setAttribute('visibility', 'visible');
        if (ro && m.readout) ro.innerHTML = m.readout(n);
      }
      function leave() { line.setAttribute('visibility', 'hidden'); if (ro && m.readout) ro.innerHTML = m.readout(null); }
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerdown', move);
      svg.addEventListener('pointerleave', leave);
    });
  }

  window.Charts = { lineChart: lineChart, barsChart: barsChart, bmiChart: bmiChart, rings: rings, animateRings: animateRings, bind: bind, dateShort: dateShort };
})();
