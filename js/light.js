/* Titelbildschirm – Licht: eine Lichtkarte für alle Lichtquellen
 *
 * Eine einzige Ebene über den Sprites (unter der Bedienoberfläche) mit
 * mix-blend-mode: soft-light. 50 % Grau ist neutral, darunter dunkelt es ab,
 * darüber hellt es auf. 1 Zelle = 4×4 Originalpixel, ausgerichtet an (0,0)
 * des Originalbilds (1536×1024 -> 384×256 Zellen).
 *
 * Pro Zelle: Summe aller Quellen -> begrenzen -> 4 harte Stufen (0..3) mit
 * Hysterese. Die Farbe kommt aus der Palette der stärksten Quelle in der Zelle,
 * es entstehen keine Mischfarben. Kein Weichzeichnen, kein Verlauf.
 *
 * Schnittstelle (für andere Module):
 *   TitleScreen.light.add({ id, x, y, radius, rx, ry, intensity, color, flicker, speed, rest, event })
 *       x, y, radius in Originalpixeln; intensity 0..1; color 'gruen' | 'warm' | 'kuehl'
 *       rx, ry: Halbachsen für eine Ellipse (fehlen sie, gilt radius)
 *       flicker 0..1, speed in Wellen pro Sekunde: nur für Quellen ohne eigenen Wert
 *       rest: Wert bei "Animationen aus" (Standard 1)
 *       event: 'blubb' -> Wert folgt den Kessel-Blasen (siehe onBlubb)
 *   TitleScreen.light.set(id, v)   v 0..1, z. B. aus dem Kerzenmodul im selben Takt wie die Flamme
 *   TitleScreen.light.remove(id)
 * light.js würfelt nie: Flackern ohne eigenen Wert ist eine feste Summe aus drei Sinuswellen.
 *
 * Abhängigkeit: TitleScreen.state.animationsOn und TitleScreen.onTick aus main.js.
 */
(function () {
  'use strict';

  var OW = 1536, OH = 1024, CELL = 4;
  var GW = OW / CELL, GH = OH / CELL;          // 384 × 256
  var FPS = 12;
  var STEPS = [0.15, 0.40, 0.70];              // Schwellen für Stufe 1, 2, 3
  var HYST = 0.03;                             // gegen Zittern an den Schwellen
  var HOLD = 150;                              // ms, die eine Zelle mindestens auf ihrer Stufe bleibt
  var AMBIENT = 0.485;                         // Stufe 0: minimal abdunkeln (0.5 = neutral)

  // soft-light-Werte je Farbe und Stufe 1..3 (R, G, B in 0..255, 128 = neutral)
  var PALETTE = {
    gruen: [[128, 150, 120], [134, 172, 120], [142, 196, 122]],
    warm:  [[150, 136, 118], [170, 146, 116], [192, 158, 114]],
    kuehl: [[122, 132, 150], [120, 138, 168], [124, 148, 190]]
  };
  var COLORS = ['gruen', 'warm', 'kuehl'];

  var stage = document.getElementById('stage');
  var layer = document.getElementById('layer-sprites');
  if (!stage || !layer || !window.TitleScreen) return;

  var canvas = document.createElement('canvas');
  canvas.id = 'light';
  canvas.width = GW;
  canvas.height = GH;
  canvas.hidden = true;                        // ohne Quellen bleibt das Bild unverändert
  layer.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  var img = ctx.createImageData(GW, GH);

  var sum = new Float32Array(GW * GH);
  var best = new Float32Array(GW * GH);
  var pulseSum = new Float32Array(GW * GH);    // Blubb-Pulsanteil, zählt nur in Kesselzellen
  var owner = new Int16Array(GW * GH);
  var level = new Uint8Array(GW * GH);
  var since = new Float64Array(GW * GH);       // Zeitpunkt des letzten Stufenwechsels
  var drawnLevel = new Uint8Array(GW * GH);
  var drawnColor = new Int8Array(GW * GH);

  var lights = [];
  var dirty = true;

  // ---------- Quellen ----------
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997; return h; }

  function add(cfg) {
    remove(cfg.id);
    var L = {
      id: String(cfg.id), x: +cfg.x, y: +cfg.y, radius: +cfg.radius,
      rx: +cfg.rx || +cfg.radius, ry: +cfg.ry || +cfg.radius,
      intensity: cfg.intensity == null ? 1 : +cfg.intensity,
      color: COLORS.indexOf(cfg.color) >= 0 ? COLORS.indexOf(cfg.color) : 1,
      flicker: +cfg.flicker || 0, speed: +cfg.speed || 1,
      rest: cfg.rest == null ? 1 : +cfg.rest,
      event: cfg.event || null,
      value: cfg.rest == null ? 1 : +cfg.rest,
      external: false, phase: hash(String(cfg.id)) / 997 * 2 * Math.PI,
      base: 0, pulse: 0
    };
    lights.push(L);
    canvas.hidden = false;
    dirty = true;
    redrawIfStill();
    return L.id;
  }

  function remove(id) {
    for (var i = lights.length - 1; i >= 0; i--) if (lights[i].id === String(id)) lights.splice(i, 1);
    canvas.hidden = lights.length === 0;
    dirty = true;
    redrawIfStill();
  }

  function set(id, v) {
    for (var i = 0; i < lights.length; i++) {
      if (lights[i].id === String(id)) {
        lights[i].value = Math.max(0, Math.min(1, +v));
        lights[i].external = true;
      }
    }
    redrawIfStill();
  }

  // Bei "Animationen aus" läuft kein Takt: Änderungen sofort einmal zeichnen.
  function redrawIfStill() {
    if (!window.TitleScreen.state.animationsOn && lights.length) restAndDraw();
  }

  // Kessel: kleine Blasen nur in einen geglätteten Grundwert, große geben einen Impuls,
  // der über etwa 1,2 s abklingt ("kurzer Höhepunkt, Licht fällt langsam zurück").
  document.addEventListener('blubb', function (e) {
    var s = e.detail && +e.detail.strength;
    if (!(s >= 0)) return;
    for (var i = 0; i < lights.length; i++) {
      var L = lights[i];
      if (L.event !== 'blubb') continue;
      if (s >= 0.6) L.pulse = Math.max(L.pulse, s);
      else L.base += (s - L.base) * 0.08;
    }
  });

  function update(now, dt) {
    var t = now / 1000;
    for (var i = 0; i < lights.length; i++) {
      var L = lights[i];
      if (L.event === 'blubb') {
        L.pulse *= Math.exp(-dt / 400);                 // nach ~1,2 s auf 5 %
        L.value = Math.min(1, L.rest * (0.7 + L.base * 0.6) + L.pulse * 0.4);
      } else if (!L.external && L.flicker > 0) {
        var w = 2 * Math.PI * L.speed * t + L.phase;
        var n = (Math.sin(w) + 0.6 * Math.sin(w * 1.731 + 1.3) + 0.35 * Math.sin(w * 2.917 + 2.1)) / 1.95;
        L.value = L.rest * (1 - L.flicker * (0.5 + 0.5 * n));
      }
    }
  }

  // ---------- Lichtkarte ----------
  function compute(now) {                      // now = null: ohne Hysterese (Ruhebild)
    sum.fill(0); best.fill(0); owner.fill(-1); pulseSum.fill(0);
    for (var k = 0; k < lights.length; k++) {
      var L = lights[k];
      var amp = L.intensity * L.value;
      if (amp <= 0) continue;
      // Farbe (owner) ohne Blubb-Puls: feste Farbgrenze; der Puls zählt nur in Zellen mit Kesselfarbe
      var own = L.event === 'blubb' ? L.intensity * Math.min(1, L.rest * (0.7 + L.base * 0.6)) : amp;
      var rx = L.rx, ry = L.ry, rx2 = rx * rx, ry2 = ry * ry;
      var gx0 = Math.max(0, Math.floor((L.x - rx) / CELL)), gx1 = Math.min(GW - 1, Math.floor((L.x + rx) / CELL));
      var gy0 = Math.max(0, Math.floor((L.y - ry) / CELL)), gy1 = Math.min(GH - 1, Math.floor((L.y + ry) / CELL));
      for (var gy = gy0; gy <= gy1; gy++) {
        var dy = gy * CELL + CELL / 2 - L.y;
        for (var gx = gx0; gx <= gx1; gx++) {
          var dx = gx * CELL + CELL / 2 - L.x;
          // normierter Abstand; Kreis (rx = ry) genau wie bisher gerechnet -> bitgleiche Karte
          var d2 = rx === ry ? (dx * dx + dy * dy) / rx2 : dx * dx / rx2 + dy * dy / ry2;
          if (d2 >= 1) continue;
          var c = amp * (1 - d2);                    // Größe fest, nur die Stärke ändert sich
          var j = gy * GW + gx;
          var o = own * (1 - d2);
          sum[j] += o; pulseSum[j] += c - o;
          if (o > best[j]) { best[j] = o; owner[j] = k; }
        }
      }
    }
    for (var i = 0; i < sum.length; i++) {
      var v = Math.min(1, sum[i] + (owner[i] >= 0 && lights[owner[i]].event === 'blubb' ? pulseSum[i] : 0)), lv = level[i];
      if (now === null) {
        lv = v >= STEPS[2] ? 3 : v >= STEPS[1] ? 2 : v >= STEPS[0] ? 1 : 0;
        since[i] = 0;
      } else if (now - since[i] >= HOLD) {
        while (lv < 3 && v >= STEPS[lv] + HYST) lv++;
        while (lv > 0 && v < STEPS[lv - 1] - HYST) lv--;
        if (lv !== level[i]) since[i] = now;
      }
      level[i] = lv;
    }
  }

  // Farbe einer Zelle: Palette der stärksten Quelle. Hält eine Zelle ihre Stufe nur noch
  // durch Hysterese/Haltezeit (keine Quelle trägt mehr bei), bleibt die zuletzt gezeichnete
  // Farbe; gibt es keine, fällt die Zelle auf Stufe 0.
  function colorOf(j) {
    if (owner[j] >= 0) return lights[owner[j]].color;
    if (drawnColor[j] >= 0) return drawnColor[j];
    level[j] = 0;
    return -1;
  }

  function paint() {
    var d = img.data, a = Math.round(AMBIENT * 255), changed = dirty;
    for (var i = 0; !changed && i < level.length; i++) {
      var col = level[i] ? colorOf(i) : -1, lv = level[i];
      if (lv !== drawnLevel[i] || col !== drawnColor[i]) { changed = true; break; }
    }
    if (!changed) return;
    for (var j = 0, p = 0; j < level.length; j++, p += 4) {
      var ci = level[j] ? colorOf(j) : -1, l = level[j];
      if (l === 0) { d[p] = d[p + 1] = d[p + 2] = a; drawnColor[j] = -1; }
      else {
        var rgb = PALETTE[COLORS[ci]][l - 1];
        d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; drawnColor[j] = ci;
      }
      d[p + 3] = 255;
      drawnLevel[j] = l;
    }
    ctx.putImageData(img, 0, 0);
    dirty = false;
  }

  function restAndDraw() {
    for (var i = 0; i < lights.length; i++) {
      var L = lights[i];
      L.pulse = 0;
      L.base = 0;                                  // Ruhebild immer gleich, unabhängig vom Verlauf
      if (!L.external || L.event) L.value = L.event === 'blubb' ? L.rest * (0.7 + L.base * 0.6) : L.rest;
    }
    dirty = true;
    compute(null);
    paint();
  }

  window.TitleScreen.onTick(function (now, dt) {
    if (!lights.length) return;
    update(now, dt);
    compute(now);
    paint();
  }, FPS);

  document.addEventListener('statechange', function () {
    if (!window.TitleScreen.state.animationsOn && lights.length) restAndDraw();
  });

  window.TitleScreen.light = { add: add, set: set, remove: remove };
})();
