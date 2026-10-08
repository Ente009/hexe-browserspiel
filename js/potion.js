/* Titelbildschirm – Trank im Kessel: Blubbern, Blasen, Kräuseln, Ring am Löffel
 * Ein kleines Canvas (gleiche Pixelgröße wie der Dampf) liegt über der
 * Trankoberfläche. Alles wird pixelweise gezeichnet. Keine Retusche nötig:
 * es liegt nur über dem gemalten Trank.
 *
 * Ereignis: Jede platzende Blase meldet
 *   document.dispatchEvent(new CustomEvent('blubb', {detail: {x, y, strength}}))
 *   x, y = Pixel im Originalbild (1536×1024), strength 0..1.
 *   Kleine Blasen 0,1–0,25, nur die gelegentliche große Blase 0,8–1.
 *
 * Das Leuchten über dem Trank ist vorläufig und wandert später nach light.js.
 * Abhängigkeit: TitleScreen.state.animationsOn und TitleScreen.onTick aus main.js.
 */
(function () {
  'use strict';

  // ---------- Einstellungen ----------
  // Ausschnitt im Originalbild (1536×1024), muss zu .potion in style.css passen
  var AREA = { x: 560, y: 330, w: 330, h: 66 };
  var PX = 2;                        // 1 Canvas-Pixel = 2 Bildpixel (wie Dampf)
  var W = AREA.w / PX;               // 165
  var H = AREA.h / PX;               // 33
  var FPS = 10;

  // Trankoberfläche als Ellipse (Canvas-Pixel)
  var SURF = { cx: (726 - AREA.x) / PX, cy: (380 - AREA.y) / PX, rx: 140 / PX, ry: 8 / PX };
  // Eintauchstelle des Löffels (Original x 792, y 384)
  var DIP = { x: Math.round((792 - AREA.x) / PX), y: Math.round((384 - AREA.y) / PX) };
  var RING_EVERY = 9;                // Ticks: etwa eine halbe Rührrunde (8 × 110 ms)

  var GLOW = [0.06, 0.11, 0.17];     // vorläufig, kommt nach light.js
  var GLOW_RGB = 'rgb(190, 255, 120)';
  var C_RIM = 'rgb(58, 120, 34)';    // dunkler Blasenrand
  var C_FILL = 'rgb(160, 228, 74)';  // Blaseninneres
  var C_SHINE = 'rgb(236, 255, 196)';// Glanzpixel
  var C_RIPPLE = 'rgb(198, 246, 112)'; // Kräuselpixel auf der Oberfläche
  var MAX_SMALL = 7;
  var BIG_MIN_S = 4, BIG_MAX_S = 9;  // Abstand der großen Blasen in Sekunden

  // ---------- Canvas anlegen ----------
  var layer = document.getElementById('layer-sprites');
  if (!layer || !window.TitleScreen) return;
  var canvas = document.createElement('canvas');
  canvas.className = 'potion';
  canvas.width = W;
  canvas.height = H;
  layer.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rint(a, b) { return Math.floor(rnd(a, b + 1)); }

  // ---------- Zustand ----------
  var bubbles = [];
  var drops = [];
  var ripples = [];
  var rings = [];
  var tick = 0;
  var nextBig = rint(BIG_MIN_S * FPS, BIG_MAX_S * FPS);

  function surfacePoint(spread) {
    var a = rnd(-1, 1) * spread;                      // über die Breite
    var x = Math.round(SURF.cx + a * SURF.rx);
    var span = SURF.ry * Math.sqrt(1 - a * a) * 0.7;
    var y = Math.round(SURF.cy + rnd(-1, 1) * span);
    return { x: x, y: y };
  }

  function spawnBubble(big) {
    var p = surfacePoint(big ? 0.6 : 0.85);
    return big
      ? { x: p.x, y: p.y, age: 0, max: rint(3, 4), grow: 7, big: true }
      : { x: p.x, y: p.y, age: 0, max: rint(1, 2), grow: rint(3, 5), big: false };
  }

  function blubb(b) {
    var strength = b.big ? rnd(0.8, 1) : rnd(0.1, 0.25);
    document.dispatchEvent(new CustomEvent('blubb', { detail: {
      x: Math.round(AREA.x + b.x * PX),
      y: Math.round(AREA.y + b.y * PX),
      strength: Math.round(strength * 100) / 100
    } }));
  }

  function update() {
    tick += 1;
    // Blasen wachsen und platzen
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      b.age += 1;
      if (b.age > b.grow + (b.big ? 2 : 1)) {
        var n = b.big ? rint(2, 3) : (Math.random() < 0.4 ? 1 : 0);
        for (var k = 0; k < n; k++) {
          drops.push({ x: b.x + (b.big ? rint(-2, 2) : 0), y: b.y - 1,
                       vy: b.big ? -rnd(1.5, 2.5) : -1, life: rint(3, b.big ? 6 : 4) });
        }
        if (b.big) rings.push({ x: b.x, y: b.y, r: b.max + 1, life: 3 });
        blubb(b);
        bubbles.splice(i, 1);
      }
    }
    var small = 0;
    for (var s = 0; s < bubbles.length; s++) if (!bubbles[s].big) small++;
    if (small < MAX_SMALL && Math.random() < 0.55) bubbles.push(spawnBubble(false));
    if (--nextBig <= 0) {
      bubbles.push(spawnBubble(true));
      nextBig = rint(BIG_MIN_S * FPS, BIG_MAX_S * FPS);
    }
    // Spritzer
    for (var j = drops.length - 1; j >= 0; j--) {
      var d = drops[j];
      d.y += d.vy; d.vy += 0.5; d.life -= 1;
      if (d.life <= 0) drops.splice(j, 1);
    }
    // Kräuseln: helle Pixel treiben langsam über die Oberfläche
    if (ripples.length < 6 && Math.random() < 0.3) {
      var p = surfacePoint(0.8);
      ripples.push({ x: p.x, y: p.y, len: rint(2, 4), vx: Math.random() < 0.5 ? -0.5 : 0.5, life: rint(8, 16) });
    }
    for (var r = ripples.length - 1; r >= 0; r--) {
      var q = ripples[r];
      q.x += q.vx; q.life -= 1;
      if (q.life <= 0) ripples.splice(r, 1);
    }
    // Ring an der Eintauchstelle des Löffels
    if (tick % RING_EVERY === 0) rings.push({ x: DIP.x, y: DIP.y, r: 2, life: 3, dip: true });
    for (var g = rings.length - 1; g >= 0; g--) {
      rings[g].r += 1; rings[g].life -= 1;
      if (rings[g].life <= 0) rings.splice(g, 1);
    }
  }

  // ---------- Zeichnen ----------
  function px(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  function onSurface(x, y) {
    var dx = (x - SURF.cx) / SURF.rx, dy = (y - SURF.cy) / (SURF.ry + 1);
    return dx * dx + dy * dy <= 1;
  }

  function drawGlow() {
    // vorläufig: langsames Pulsieren in drei festen Stufen (~3 s)
    var s = (Math.sin(tick * (2 * Math.PI / (3 * FPS))) + 1) / 2;
    var level = s < 0.33 ? 0 : (s < 0.66 ? 1 : 2);
    ctx.globalAlpha = GLOW[level];
    ctx.fillStyle = GLOW_RGB;
    for (var dy = -SURF.ry - 1; dy <= SURF.ry; dy++) {
      var k = dy / (SURF.ry + 1);
      var half = Math.round(SURF.rx * Math.sqrt(Math.max(0, 1 - k * k)));
      var x0 = Math.round(SURF.cx - half), x1 = x0 + half * 2, y = Math.round(SURF.cy + dy);
      ctx.fillRect(x0, y, x1 - x0, 1);   // Löffel liegt als Hexen-Sprite darüber
    }
    ctx.globalAlpha = 1;
  }

  // Große Blase: Kuppel, die sich aus der Oberfläche wölbt (untere Hälfte steckt im Trank).
  // Zeilenbreite aus einem Pixelkreis -> gekappte Ecken, oben schmal, kein Kästchen.
  function drawDome(x, y, r) {
    for (var dy = -r; dy <= 0; dy++) {
      var hw = Math.floor(Math.sqrt((r + 0.5) * (r + 0.5) - dy * dy));
      ctx.fillStyle = dy === -r ? C_RIM : C_FILL;
      ctx.fillRect(x - hw, y + dy, hw * 2 + 1, 1);
      if (dy > -r) { px(x - hw, y + dy, C_RIM); px(x + hw, y + dy, C_RIM); }
    }
    var base = Math.floor(Math.sqrt((r + 0.5) * (r + 0.5)));
    ctx.fillStyle = C_RIM;                              // Kontaktschatten auf der Oberfläche
    ctx.fillRect(x - base + 1, y + 1, base * 2 - 1, 1);
    px(r >= 2 ? x - 1 : x, y - r + 1, C_SHINE);         // Glanz: 2 Pixel schräg oben links (r=1: Mitte, Rand bleibt zu)
    if (r >= 3) px(x - 2, y - r + 2, C_SHINE);
  }

  function drawBubble(b) {
    var x = b.x, y = b.y;
    if (b.big && b.age <= b.grow) {
      if (b.age < 2) { px(x, y, C_FILL); px(x, y + 1, C_RIM); return; }
      // wächst bis max, steht, und wächst kurz vor dem Platzen noch 1 Stufe
      drawDome(x, y, b.age >= b.grow ? b.max + 1 : Math.min(b.max, b.age - 1));
      return;
    }
    if (b.age <= b.grow) {
      var r = b.age < 2 ? 0 : Math.min(b.max, b.age - 1);  // erst Punkt, dann wachsen
      if (r === 0) { px(x, y, C_FILL); px(x, y + 1, C_RIM); return; }
      ctx.fillStyle = C_RIM;
      ctx.fillRect(x - r, y - r + 1, 1, r * 2 - 1);
      ctx.fillRect(x + r, y - r + 1, 1, r * 2 - 1);
      ctx.fillRect(x - r + 1, y - r, r * 2 - 1, 1);
      ctx.fillRect(x - r + 1, y + r, r * 2 - 1, 1);
      ctx.fillStyle = C_FILL;
      ctx.fillRect(x - r + 1, y - r + 1, r * 2 - 1, r * 2 - 1);
      px(x - r + 1, y - r + 1, C_SHINE);
      if (b.big && r >= 3) px(x - r + 2, y - r + 1, C_SHINE);
    } else {
      // Platzen: kurzer heller Ring
      var R = b.max + (b.big ? 2 : 1);
      px(x - R, y, C_SHINE); px(x + R, y, C_SHINE);
      px(x, y - R, C_SHINE); px(x - 1, y - R + 1, C_FILL); px(x + 1, y - R + 1, C_FILL);
    }
  }

  function drawRing(g) {
    // flacher Pixelring (Oberfläche von schräg oben: doppelt so breit wie hoch)
    var c = g.life >= 2 ? C_RIPPLE : C_FILL;
    var ry = Math.max(1, Math.round(g.r / 2));
    for (var a = 0; a < 16; a++) {
      var t = a * Math.PI / 8;
      var x = g.x + Math.round(Math.cos(t) * g.r), y = g.y + Math.round(Math.sin(t) * ry);
      if (onSurface(x, y)) px(x, y, c);
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawGlow();
    for (var r = 0; r < ripples.length; r++) {
      var q = ripples[r];
      for (var i = 0; i < q.len; i++) if (onSurface(q.x + i, q.y)) px(q.x + i, q.y, C_RIPPLE);
    }
    for (var g = 0; g < rings.length; g++) drawRing(rings[g]);
    for (var b = 0; b < bubbles.length; b++) drawBubble(bubbles[b]);
    for (var j = 0; j < drops.length; j++) px(drops[j].x, drops[j].y, C_FILL);
  }

  // ---------- Takt ----------
  // Der gemeinsame Takt läuft nur bei eingeschalteten Animationen.
  window.TitleScreen.onTick(function () { update(); render(); }, FPS);

  function sync() {
    if (!window.TitleScreen.state.animationsOn) {
      bubbles = []; drops = []; ripples = []; rings = [];
      ctx.clearRect(0, 0, W, H);   // nur der gemalte Trank bleibt sichtbar
    }
  }
  document.addEventListener('statechange', sync);
  sync();
})();
