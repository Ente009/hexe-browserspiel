/* Titelbildschirm – Dampf über dem Kessel
 * Ein kleines Canvas in niedriger Auflösung liegt über der Kesselöffnung und
 * wird per CSS pixelig hochskaliert. Statt einer durchgehenden Säule steigen
 * einzelne "Schwaden" auf: Jede Schwade besteht aus wenigen Klecksen mit
 * eigener, unregelmäßiger Form. Beim Aufsteigen wird sie größer und lockerer,
 * die Kleckse treiben auseinander, dann franst sie aus und verschwindet.
 * Die Dichte wird in wenige feste Farbstufen eingeteilt (Pixel-Art statt
 * weicher Verläufe). Auch das Verblassen läuft in Stufen: eine Farbstufe
 * tiefer, Kleckse dünnen aus und werden kleiner – keine weiche Transparenz.
 *
 * Abhängigkeiten aus main.js: TitleScreen.state.animationsOn (nur gelesen),
 * TitleScreen.onTick (gemeinsamer Takt) und das Event "statechange".
 * Optional: Event "blubb" aus potion.js, detail {x, y, strength} in Pixeln des
 * Originalbilds, strength 0..1. Starke Blasen lösen eine kleine Extra-Schwade aus.
 */
(function () {
  'use strict';

  // ---------- Einstellungen ----------
  // Ausschnitt im Originalbild (1536×1024), muss zu .steam in style.css passen
  var AREA = { x: 500, y: 20, w: 288, h: 352 };
  var PX = 2;                       // 1 Canvas-Pixel = 2 Bildpixel
  var W = AREA.w / PX;              // 144
  var H = AREA.h / PX;              // 176
  var FPS = 10;                     // bewusst ruckelig wie klassische Pixel-Art

  // Schwaden: Anzahl gleichzeitig und zufälliger Abstand zwischen zwei neuen
  var MIN_WISPS = 6;
  var MAX_WISPS = 9;
  var MIN_RISE = 16;                // Canvas-Pixel, die die vorige Schwade mindestens gestiegen ist
  var SPAWN_GAP = [9, 19];          // Frames (0,9–1,9 s), jedes Mal neu ausgewürfelt
  // Startbereich an der Trankoberfläche links vom Löffel (≈ Bild-x 660–720)
  var SPAWN_X0 = (660 - AREA.x) / PX;   // 80
  var SPAWN_X1 = (720 - AREA.x) / PX;   // 110
  // Linker Fensterrand im Bild (Rahmen bei x ≈ 624). Erreicht eine Schwade diese
  // Linie, löst sie sich auf, damit kein Dampf vor Wand und Kräutern landet.
  var WINDOW_LEFT = (624 - AREA.x) / PX; // 62

  // blubb: nur starke Blasen, höchstens eine Extra-Schwade pro Sekunde
  var BLUBB_MIN = 0.6;
  var BLUBB_GAP_MS = 1000;
  var EXTRA_MAX = 2;                // Extra-Schwaden zusätzlich zu MAX_WISPS

  // Farbstufen (RGBA): von dünn nach dicht; unten etwas grünlich vom Trank
  var LEVELS = [
    { a: 0.24, rgb: [222, 214, 238] },  // heller gefärbt (vorher 190/176/210), sichtbar vor dem blauen Glas
    { a: 0.34, rgb: [200, 186, 218] },
    { a: 0.64, rgb: [218, 207, 230] }
  ];
  var THRESHOLDS = [0.18, 0.42, 0.72]; // Dichte ab der eine Stufe gilt (harte Kanten)
  var GREEN = [176, 214, 120];

  // Kleines, kachelbares Rauschfeld für fransige, unregelmäßige Ränder
  var NOISE_N = 32;
  var noise = (function () {
    var g = new Float32Array(NOISE_N * NOISE_N), seed = 7;
    for (var i = 0; i < g.length; i++) { seed = (seed * 16807) % 2147483647; g[i] = seed / 2147483647; }
    return g;
  })();
  function noiseAt(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    var N = NOISE_N, m = N - 1;
    var a = noise[(yi & m) * N + (xi & m)], b = noise[(yi & m) * N + ((xi + 1) & m)];
    var c = noise[((yi + 1) & m) * N + (xi & m)], d = noise[((yi + 1) & m) * N + ((xi + 1) & m)];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // ---------- Canvas anlegen ----------
  var layer = document.getElementById('layer-sprites');
  if (!layer) return;
  var canvas = document.createElement('canvas');
  canvas.className = 'steam';
  canvas.width = W;
  canvas.height = H;
  layer.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  var img = ctx.createImageData(W, H);
  var levelMap = new Int8Array(W * H);   // höchste Stufe pro Pixel (über alle Schwaden)
  var scratch = new Float32Array(W * H); // Dichte der gerade gezeichneten Schwade

  // Masken pro Zeile/Spalte einmal vorberechnen (hängen nur von x/y ab)
  var rowFadeTop = new Float32Array(H), rowGreen = new Float32Array(H), rowEdge = new Float32Array(H);
  for (var ry = 0; ry < H; ry++) {
    rowFadeTop[ry] = Math.min(1, ry / (H * 0.35));                // oben ausblenden
    rowGreen[ry] = Math.max(0, (ry - H * 0.72) / (H * 0.28));     // unten grün vom Trank
    rowEdge[ry] = W * (0.5 + 0.28 * (ry / H));                    // rechts: Mond und Hexe frei
  }
  function edgeMask(x, y) {
    var e = rowEdge[y];
    var fadeRight = x > e ? Math.max(0, 1 - (x - e) / (W * 0.2)) : 1;
    return rowFadeTop[y] * fadeRight;
  }
  // Links am Fensterrahmen: kein gerader Schnitt, sondern unregelmäßiges Zerfallen.
  // Ab etwa 12 Canvas-Pixel vor dem Rahmen frisst ein mitwanderndes Rauschen
  // zunehmend Löcher in den Dampf; links von Bild-x 616 bleibt nichts übrig.
  var LEFT_ZONE = 16;
  function leftErode(x, y) {
    if (x < WINDOW_LEFT - 4) return 99;                // links von Bild-x 616: nichts
    // Die Grenze wandert pro Zeile mit Rauschen um ±7 Pixel hin und her (steigt mit
    // dem Dampf), dazu feine Löcher -> fransige statt gerader Kante
    var shift = (noiseAt(3.7, (y + tick * 1.5) * 0.28) - 0.5) * 2.6 * 7;
    var f = (WINDOW_LEFT + 12 - x + shift) / LEFT_ZONE; // ohne Versatz: 0 bei Bild-x 648, 1 bei 616
    if (f <= 0) return 0;
    if (f >= 1) return 99;
    var n = noiseAt(x * 0.4 + 11, (y + tick * 1.5) * 0.4 + 5);
    return f * 2.0 * (0.3 + 1.4 * n);
  }

  // ---------- Wind ----------
  // Langsam wechselnder Luftzug: weiches Zufallsrauschen über die Zeit.
  // Alle 3–6 s ein neuer Zielwert, dazwischen weich überblendet. Immer nach links,
  // mal kaum, mal deutlich.
  var wind = { a: rnd(0.06, 0.28), b: rnd(0.06, 0.28), t: 0, len: 40 };
  function windStep() {
    wind.t += 1;
    if (wind.t >= wind.len) { wind.a = wind.b; wind.b = rnd(0.04, 0.3); wind.t = 0; wind.len = Math.round(rnd(30, 60)); }
  }
  function windNow() {
    var f = wind.t / wind.len;
    f = f * f * (3 - 2 * f);
    return -(wind.a + (wind.b - wind.a) * f);   // Pixel pro Frame (negativ = nach links)
  }

  // ---------- Schwaden ----------
  // Positionen in Canvas-Pixeln. Eine Schwade = Mittelpunkt + 4–5 Kleckse (Extra-Schwade: 3).
  var wisps = [];
  var spawnIn = 0;            // Frames bis zur nächsten Schwade
  var side = 0;               // Startseite der letzten Schwade (0 links, 1 rechts)
  var lastWisp = null;        // zuletzt gestartete normale Schwade
  var tick = 0;

  function makeWisp(x, small) {
    var s = small ? 0.65 : rnd(0.85, 1.15);  // Größe
    var n = small ? 3 : 4 + Math.floor(Math.random() * 2);
    var w = {
      x: x, y: H + 4 * s,
      vy: rnd(1.4, 1.9) * (small ? 1.1 : 1),   // Steiggeschwindigkeit pro Frame
      drift: rnd(0.75, 1.35),                        // wie stark der Wind diese Schwade schiebt
      swayAmp: rnd(0.15, 0.4), swayF: rnd(0.06, 0.12), swayP: rnd(0, 6.28),
      nx: rnd(0, 32), ny: rnd(0, 32),              // eigener Rauschausschnitt = eigene Form
      small: !!small,
      age: 0,
      life: Math.round((small ? rnd(40, 55) : rnd(65, 85))),
      blobs: []
    };
    for (var i = 0; i < n; i++) {
      var ang = rnd(0, 6.28), dist = i === 0 ? 0 : rnd(5, 13) * s;
      w.blobs.push({
        ox: Math.cos(ang) * dist, oy: Math.sin(ang) * dist * 0.8,
        vx: Math.cos(ang) * rnd(0.07, 0.16) * s, vy: Math.sin(ang) * rnd(0.03, 0.09) * s - 0.03,
        r0: (i === 0 ? rnd(8, 11) : rnd(4, 8.5)) * s,
        asp: rnd(0.55, 1.0),                       // eher breit als hoch, jeder etwas anders
        grow: rnd(0.12, 0.17) * s,
        // Kleckse lösen sich nacheinander auf (der erste hält am längsten)
        until: i === 0 ? 1 : rnd(0.55, 0.95)
      });
    }
    return w;
  }

  function stepWisp(w) {
    var t = w.age / w.life;
    w.age += 1;
    w.y -= w.vy * (1 - 0.35 * t);                  // oben langsamer, Schwade "steht" mehr
    // linke Kante der Schwade (äußerster noch vorhandener Klecks)
    var left = 999;
    for (var i = 0; i < w.blobs.length; i++) {
      var b = w.blobs[i];
      b.ox += b.vx * (0.6 + t); b.oy += b.vy * (0.6 + t);   // Kleckse treiben auseinander
      if (t <= b.until) left = Math.min(left, w.x + b.ox - (b.r0 + b.grow * w.age) * 0.75);
    }
    // Nahe am linken Fensterrand lässt der Wind nach, die Schwade steigt dann eher
    // gerade hoch. Beim Auflösen schiebt er gar nicht mehr.
    var room = clamp((left - WINDOW_LEFT) / 16, 0.1, 1);
    w.x += (w.fading ? 0 : windNow() * w.drift * room) + Math.sin(w.swayP + w.age * w.swayF) * w.swayAmp;
    // Erreicht sie trotzdem den Rahmen: als Ganzes in die dünnste Stufe, schrumpfen, zerfallen
    if (!w.fading && left < WINDOW_LEFT + 6) {
      w.fading = true;
      w.age = Math.max(w.age, Math.round(w.life * 0.8));
    }
  }

  function spawn(x, small) {
    var w = makeWisp(x, small);
    wisps.push(w);
    return w;
  }

  function update() {
    tick += 1;
    windStep();
    for (var i = wisps.length - 1; i >= 0; i--) {
      stepWisp(wisps[i]);
      if (wisps[i].age >= wisps[i].life || wisps[i].y < -20) {
        if (wisps[i] === lastWisp) lastWisp = null;   // sonst wartet der Nachschub ewig
        wisps.splice(i, 1);
      }
    }
    var normal = 0;
    for (var j = 0; j < wisps.length; j++) if (!wisps[j].small) normal++;
    spawnIn -= 1;
    // die letzte Schwade muss schon ein Stück aufgestiegen sein, sonst kleben sie aneinander
    var risen = lastWisp ? (H - lastWisp.y) : 999;
    if ((spawnIn <= 0 && normal < MAX_WISPS && risen > MIN_RISE) || (normal < MIN_WISPS && risen > MIN_RISE / 2)) {
      // abwechselnd eher links und eher rechts starten, damit die Schwaden versetzt steigen
      side = 1 - side;
      var half = (SPAWN_X1 - SPAWN_X0) / 2;
      lastWisp = spawn(SPAWN_X0 + side * half * 0.8 + rnd(0, half * 1.2), false);
      spawnIn = Math.round(rnd(SPAWN_GAP[0], SPAWN_GAP[1]));
    }
  }

  // Zu Beginn schon "laufenden" Dampf erzeugen statt leerem Kessel
  function prefill() {
    wisps = [];
    spawnIn = 0;
    lastWisp = null;
    for (var k = 0; k < 140; k++) update();
  }

  // ---------- Starke Blasen aus dem Trank ----------
  var lastExtra = -Infinity;
  document.addEventListener('blubb', function (e) {
    var d = e && e.detail;
    if (!d || !(d.strength >= BLUBB_MIN)) return;          // kleine Blasen: kein Extra-Dampf
    if (window.TitleScreen && !window.TitleScreen.state.animationsOn) return;
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (now - lastExtra < BLUBB_GAP_MS) return;            // höchstens etwa eine pro Sekunde
    var extra = 0;
    for (var i = 0; i < wisps.length; i++) if (wisps[i].small) extra++;
    if (extra >= EXTRA_MAX) return;
    lastExtra = now;
    // Bild-x in Canvas-Pixel; rechts vom Ausschnitt (Trank reicht bis x 890) an den Rand setzen
    var x = clamp((Number(d.x) - AREA.x) / PX, SPAWN_X0, SPAWN_X1);
    if (isNaN(x)) x = rnd(SPAWN_X0, SPAWN_X1);
    wisps.push(makeWisp(x, true));
  });

  // ---------- Zeichnen ----------
  // Stufe einer Schwade nach Alter: erst dicht, dann eine Stufe tiefer, dann nur noch dünn
  function maxLevelFor(t) {
    return t < 0.4 ? 2 : (t < 0.75 ? 1 : 0);
  }

  function drawWisp(w) {
    var t = w.age / w.life;
    var cap = maxLevelFor(t);
    // Schrumpfen am Ende in Stufen (keine weiche Überblendung)
    var shrink = t < 0.76 ? 1 : (t < 0.9 ? 0.85 : 0.7);
    // Ausfransen: je älter, desto mehr frisst das Rauschen in die Ränder
    var fray = t < 0.45 ? 0.6 : (t < 0.75 ? 0.75 : 0.9);
    var erode = t < 0.78 ? 0 : (t < 0.9 ? 0.08 : 0.16);   // am Ende zerfällt die Schwade
    var bx0 = W, by0 = H, bx1 = -1, by1 = -1, live = [];
    for (var i = 0; i < w.blobs.length; i++) {
      var b = w.blobs[i];
      if (t > b.until) continue;                   // Klecks hat sich aufgelöst
      var r = (b.r0 + b.grow * w.age) * shrink;
      var cx = w.x + b.ox, cy = w.y + b.oy;
      live.push(cx, cy, r, b.asp);
      bx0 = Math.min(bx0, Math.floor(cx - r)); bx1 = Math.max(bx1, Math.ceil(cx + r));
      by0 = Math.min(by0, Math.floor(cy - r * b.asp)); by1 = Math.max(by1, Math.ceil(cy + r * b.asp));
    }
    bx0 = Math.max(0, bx0); by0 = Math.max(0, by0);
    bx1 = Math.min(W - 1, bx1); by1 = Math.min(H - 1, by1);
    if (bx1 < bx0 || by1 < by0) return;

    // 1) Dichte nur im Begrenzungsrechteck der Kleckse aufsummieren
    var x, y, k;
    for (y = by0; y <= by1; y++) for (x = bx0; x <= bx1; x++) scratch[y * W + x] = 0;
    for (k = 0; k < live.length; k += 4) {
      var lcx = live[k], lcy = live[k + 1], lr = live[k + 2], lry = lr * live[k + 3];
      var x0 = Math.max(bx0, Math.floor(lcx - lr)), x1 = Math.min(bx1, Math.ceil(lcx + lr));
      var y0 = Math.max(by0, Math.floor(lcy - lry)), y1 = Math.min(by1, Math.ceil(lcy + lry));
      for (y = y0; y <= y1; y++) {
        for (x = x0; x <= x1; x++) {
          var dx = (x - lcx) / lr, dy = (y - lcy) / lry;
          var d = 1 - (dx * dx + dy * dy);
          if (d > 0) scratch[y * W + x] += d;
        }
      }
    }

    // 2) In Stufen einteilen; das Rauschen wandert mit der Schwade -> eigene Form
    for (y = by0; y <= by1; y++) {
      for (x = bx0; x <= bx1; x++) {
        var idx = y * W + x;
        var dens = scratch[idx];
        if (dens <= 0) continue;
        // zwei Rauschgrößen: große Beulen + feine Fransen
        var n = 0.6 * noiseAt(w.nx + (x - w.x) * 0.16, w.ny + (y - w.y) * 0.16 + w.age * 0.03) +
                0.4 * noiseAt(w.ny + (x - w.x) * 0.45, w.nx + (y - w.y) * 0.45 + w.age * 0.06);
        n = (n - 0.5) * 2.4;                     // Kontrast: etwa -1..1
        dens = (dens * (1 + n * fray * 0.8) + n * fray * 0.3 - erode - leftErode(x, y)) * edgeMask(x, y);
        var level = -1;
        var lcap = x < WINDOW_LEFT ? 0 : cap;      // links vom Rahmen höchstens die schwächste Stufe
        for (var l = 0; l <= lcap; l++) if (dens >= THRESHOLDS[l]) level = l;
        if (level > levelMap[idx]) levelMap[idx] = level;
      }
    }
  }

  function render() {
    levelMap.fill(-1);
    for (var i = 0; i < wisps.length; i++) drawWisp(wisps[i]);

    var data = img.data;
    for (var y = 0; y < H; y++) {
      var green = rowGreen[y];
      for (var x = 0; x < W; x++) {
        var idx = y * W + x, o = idx * 4, level = levelMap[idx];
        if (level < 0) { data[o + 3] = 0; continue; }
        var c = LEVELS[level].rgb;
        data[o]     = c[0] + (GREEN[0] - c[0]) * green;
        data[o + 1] = c[1] + (GREEN[1] - c[1]) * green;
        data[o + 2] = c[2] + (GREEN[2] - c[2]) * green;
        data[o + 3] = LEVELS[level].a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---------- Takt ----------
  // Gemeinsamer Takt aus main.js; bei "Animationen aus" ruft er uns nicht auf.
  function onFrame(now, dt) {
    // nach kurzem Hänger höchstens 3 Schritte nachholen, damit nichts springt
    var steps = Math.max(1, Math.min(3, Math.round(dt / (1000 / FPS))));
    for (var s = 0; s < steps; s++) update();
    render();
  }

  // Bei "Animationen aus" bleibt ein stehendes Dampfbild sichtbar
  document.addEventListener('statechange', function () { render(); });

  prefill();
  render();
  if (window.TitleScreen && window.TitleScreen.onTick) window.TitleScreen.onTick(onFrame, FPS);
})();
