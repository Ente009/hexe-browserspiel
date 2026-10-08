/* Titelbildschirm – Trank im Kessel: leichtes Leuchten und Blubberblasen
 * Ein kleines Canvas (gleiche Pixelgröße wie der Dampf) liegt über der
 * Trankoberfläche. Das Leuchten pulsiert in wenigen festen Stufen, die Blasen
 * werden pixelweise gezeichnet. Keine Retusche nötig: alles liegt nur über
 * dem gemalten Trank.
 *
 * Abhängigkeit: TitleScreen.state.animationsOn aus main.js (nur gelesen).
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

  var GLOW = [0.06, 0.11, 0.17];     // Deckkraft der drei Leuchtstufen
  var GLOW_RGB = 'rgb(190, 255, 120)';
  var C_RIM = 'rgb(58, 120, 34)';    // dunkler Blasenrand
  var C_FILL = 'rgb(160, 228, 74)';  // Blaseninneres
  var C_SHINE = 'rgb(236, 255, 196)';// Glanzpixel
  var MAX_BUBBLES = 6;

  // ---------- Canvas anlegen ----------
  var layer = document.getElementById('layer-sprites');
  if (!layer) return;
  var canvas = document.createElement('canvas');
  canvas.className = 'potion';
  canvas.width = W;
  canvas.height = H;
  layer.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  // ---------- Blasen ----------
  var bubbles = [];
  var drops = [];
  var tick = 0;

  function randomSurfacePoint() {
    for (var i = 0; i < 20; i++) {
      var a = Math.random() * 2 - 1;                 // -1..1 über die Breite
      var x = Math.round(SURF.cx + a * SURF.rx * 0.85);
      var span = SURF.ry * Math.sqrt(1 - a * a) * 0.7;
      var y = Math.round(SURF.cy + (Math.random() * 2 - 1) * span);
      return { x: x, y: y };
    }
    return { x: Math.round(SURF.cx - SURF.rx * 0.4), y: Math.round(SURF.cy) };
  }

  function spawnBubble() {
    var p = randomSurfacePoint();
    return { x: p.x, y: p.y, age: 0, max: 2 + Math.floor(Math.random() * 2), grow: 4 + Math.floor(Math.random() * 2) };
  }

  function update() {
    tick += 1;
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      b.age += 1;
      if (b.age > b.grow + 1) {               // geplatzt
        if (Math.random() < 0.5) {
          drops.push({ x: b.x, y: b.y - 1, vy: -1, life: 3 + Math.floor(Math.random() * 2) });
        }
        bubbles.splice(i, 1);
      }
    }
    if (bubbles.length < MAX_BUBBLES && Math.random() < 0.5) bubbles.push(spawnBubble());
    for (var j = drops.length - 1; j >= 0; j--) {
      var d = drops[j];
      d.y += d.vy;
      d.vy += 0.5;                            // fällt nach kurzem Sprung zurück
      d.life -= 1;
      if (d.life <= 0) drops.splice(j, 1);
    }
  }

  // ---------- Zeichnen ----------
  function px(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  }

  function drawGlow() {
    // langsames Pulsieren: ~3 s pro Zyklus, in drei festen Stufen
    var s = (Math.sin(tick * (2 * Math.PI / (3 * FPS))) + 1) / 2;
    var level = s < 0.33 ? 0 : (s < 0.66 ? 1 : 2);
    ctx.globalAlpha = GLOW[level];
    ctx.fillStyle = GLOW_RGB;
    // Ellipse zeilenweise, damit die Kanten pixelig bleiben
    for (var dy = -SURF.ry - 1; dy <= SURF.ry; dy++) {
      var k = dy / (SURF.ry + 1);
      var half = Math.round(SURF.rx * Math.sqrt(Math.max(0, 1 - k * k)));
      var x0 = Math.round(SURF.cx - half), x1 = x0 + half * 2, y = Math.round(SURF.cy + dy);
      ctx.fillRect(x0, y, x1 - x0, 1);   // Löffel liegt als Hexen-Sprite darüber
    }
    ctx.globalAlpha = 1;
  }

  function drawBubble(b) {
    var x = b.x, y = b.y;
    if (b.age <= b.grow) {
      var r = b.age < 2 ? 0 : Math.min(b.max, b.age - 1); // erst Punkt, dann wachsen
      if (r === 0) { px(x, y, C_FILL); px(x, y + 1, C_RIM); return; }
      // kleine Pixelblase: Rand + Füllung + Glanz
      ctx.fillStyle = C_RIM;
      ctx.fillRect(x - r, y - r + 1, 1, r * 2 - 1);
      ctx.fillRect(x + r, y - r + 1, 1, r * 2 - 1);
      ctx.fillRect(x - r + 1, y - r, r * 2 - 1, 1);
      ctx.fillRect(x - r + 1, y + r, r * 2 - 1, 1);
      ctx.fillStyle = C_FILL;
      ctx.fillRect(x - r + 1, y - r + 1, r * 2 - 1, r * 2 - 1);
      px(x - r + 1, y - r + 1, C_SHINE);
    } else {
      // Platzen: kurzer heller Ring
      var R = b.max + 1;
      ctx.fillStyle = C_SHINE;
      px(x - R, y, C_SHINE); px(x + R, y, C_SHINE);
      px(x, y - R, C_SHINE); px(x - 1, y - R + 1, C_FILL); px(x + 1, y - R + 1, C_FILL);
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawGlow();
    for (var i = 0; i < bubbles.length; i++) drawBubble(bubbles[i]);
    for (var j = 0; j < drops.length; j++) px(Math.round(drops[j].x), Math.round(drops[j].y), C_FILL);
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
    if (rafId === null) { last = -Infinity; rafId = requestAnimationFrame(loop); }
  }

  function stop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    ctx.clearRect(0, 0, W, H); // nur der gemalte Trank bleibt sichtbar
  }

  function sync() {
    var on = !window.TitleScreen || window.TitleScreen.state.animationsOn;
    if (on) start(); else stop();
  }

  document.addEventListener('statechange', sync);
  sync();
})();
