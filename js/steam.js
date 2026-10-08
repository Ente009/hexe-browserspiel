/* Titelbildschirm – Dampf über dem Kessel
 * Ein kleines Canvas in niedriger Auflösung liegt über der Kesselöffnung und
 * wird per CSS pixelig hochskaliert. Pro Frame wird aus mehreren aufsteigenden
 * "Wölkchen" ein Dichtefeld berechnet und in wenige feste Farbstufen
 * eingeteilt. So entsteht Dampf im Pixel-Art-Stil statt weicher Verläufe.
 *
 * Abhängigkeit: TitleScreen.state.animationsOn aus main.js (nur gelesen).
 */
(function () {
  'use strict';

  // ---------- Einstellungen ----------
  // Ausschnitt im Originalbild (1536×1024), muss zu .steam in style.css passen
  var AREA = { x: 500, y: 20, w: 288, h: 352 };
  var PX = 2;                       // 1 Canvas-Pixel = 2 Bildpixel
  var W = AREA.w / PX;              // 144
  var H = AREA.h / PX;              // 176
  var K = 4 / PX;                   // Maßstab: Bewegungswerte unten sind für PX = 4 abgestimmt
  var FPS = 10;                     // bewusst ruckelig wie klassische Pixel-Art
  var MAX_PUFFS = 40;

  // Farbstufen (RGBA): von dünn nach dicht; unten etwas grünlich vom Trank
  var LEVELS = [
    { a: 0.20, rgb: [190, 176, 210] },
    { a: 0.34, rgb: [200, 186, 218] },
    { a: 0.64, rgb: [218, 207, 230] }
  ];
  var THRESHOLDS = [0.30, 0.62, 1.0];  // Dichte ab der eine Stufe gilt
  var GREEN = [176, 214, 120];
  // Kleines, kachelbares Rauschfeld für fransige Dampfränder
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
  var density = new Float32Array(W * H);

  // ---------- Wölkchen ----------
  // Positionen in Canvas-Pixeln. Start an der Trankoberfläche links vom Löffel.
  var puffs = [];

  function spawnPuff(age) {
    return {
      x0: (22 + Math.random() * 32) * K,   // Startpunkt (≈ Bild-x 590–720)
      y: H + 2 * K,
      vy: (0.8 + Math.random() * 0.4) * K, // Steiggeschwindigkeit pro Frame
      drift: -(0.08 + Math.random() * 0.14) * K, // Dampf zieht leicht nach links
      phase: Math.random() * Math.PI * 2,
      r0: (4 + Math.random() * 3) * K,
      age: age || 0,
      life: 80 + Math.random() * 25  // Frames bis zum Verschwinden
    };
  }

  function stepPuff(p) {
    p.age += 1;
    p.y -= p.vy;
  }

  var tick = 0; // globaler Frame-Zähler für die gemeinsame Schlängelbewegung

  function puffX(p) {
    // eigene leichte Schwankung + gemeinsame Welle, damit die Säule sich windet
    return p.x0 + p.drift * p.age +
      (Math.sin(p.phase + p.age * 0.1) * 1.5 +
       Math.sin(tick * 0.05 + p.y / K * 0.09) * 4) * K;
  }

  // Zu Beginn schon "laufenden" Dampf erzeugen statt leerem Kessel
  function prefill() {
    puffs = [];
    for (var i = 0; i < MAX_PUFFS; i++) {
      var p = spawnPuff();
      var pre = Math.floor((i / MAX_PUFFS) * p.life);
      for (var k = 0; k < pre; k++) stepPuff(p);
      puffs.push(p);
    }
  }

  function update() {
    tick += 1;
    for (var i = 0; i < puffs.length; i++) {
      stepPuff(puffs[i]);
      if (puffs[i].age >= puffs[i].life || puffs[i].y < -10 * K) puffs[i] = spawnPuff();
    }
  }

  // ---------- Zeichnen ----------
  function render() {
    density.fill(0);

    for (var i = 0; i < puffs.length; i++) {
      var p = puffs[i];
      var t = p.age / p.life;                    // 0..1
      var r = p.r0 + t * 11 * K;                     // wächst beim Aufsteigen
      var strength = (t < 0.12 ? t / 0.12 : 1) * (1 - t) * 0.75;
      var cx = puffX(p), cy = p.y;
      var x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
      var y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
      for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
          var dx = (x - cx) / r, dy = (y - cy) / (r * 0.85);
          var d = 1 - (dx * dx + dy * dy);
          if (d > 0) density[y * W + x] += d * d * strength;
        }
      }
    }

    var data = img.data;
    for (var y2 = 0; y2 < H; y2++) {
      // oben ausblenden, damit der Dampf nicht hart am Canvasrand endet
      var fadeTop = Math.min(1, y2 / (H * 0.35));
      // unterer Bereich leicht grün vom Trank
      var green = Math.max(0, (y2 - H * 0.72) / (H * 0.28));
      // rechter Rand: oben Mond frei lassen, unten Hand und Löffel der Hexe
      var edge = W * (0.5 + 0.28 * (y2 / H));
      for (var x2 = 0; x2 < W; x2++) {
        var idx = y2 * W + x2;
        var fadeRight = x2 > edge ? Math.max(0, 1 - (x2 - edge) / (W * 0.2)) : 1;
        var fadeLeft = Math.min(1, x2 / (8 * K));      // kein harter Schnitt am linken Rand
        // Rauschen wandert mit nach oben -> fransige, ziehende Schwaden
        var n = noiseAt(x2 / K * 0.22, (y2 / K + tick * 0.9) * 0.16);
        var dens = density[idx] * fadeTop * fadeRight * fadeLeft * (0.45 + n * 1.1);
        var v = dens;
        var level = -1;
        for (var l = 0; l < THRESHOLDS.length; l++) {
          if (v >= THRESHOLDS[l] * 0.55) level = l;
        }
        var o = idx * 4;
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

  // ---------- Schleife ----------
  var rafId = null;
  var last = 0;

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    if (now - last < 1000 / FPS) return;
    last = now;
    update();
    render();
  }

  function start() {
    if (rafId === null) { last = 0; rafId = requestAnimationFrame(loop); }
  }

  function stop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    render(); // stehendes Dampfbild bleibt sichtbar
  }

  function sync() {
    var on = !window.TitleScreen || window.TitleScreen.state.animationsOn;
    if (on) start(); else stop();
  }

  document.addEventListener('statechange', sync);

  prefill();
  render();
  sync();
})();
