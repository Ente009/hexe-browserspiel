/* Titelbildschirm – magische Funken
 * Ein Canvas über der ganzen Bühne in halber Auflösung (768×512, 1 Canvas-Pixel =
 * 2×2 Originalpixel). Wenige Funken steigen langsam auf, pendeln seitlich und
 * blenden in drei harten Farbstufen aus (kein Alpha, kein Glow). Selten blitzt ein
 * Funke für 1–2 Ticks als 3×3-Kreuz auf.
 *
 * Zonen (Originalpixel): S1 Kessel (grün, ≤6), S2 Regal links (gold, ≤3),
 * S3 Kräuter rechts (lavendel, ≤3), zusammen höchstens 12. In den Sperrzonen
 * (Bedienelemente, Gesicht, Hexe, Katze, Kerzen) startet kein Funke, und ein Funke,
 * der hineintreibt, verschwindet sofort.
 *
 * Events: hört auf "blubb" aus potion.js (detail {x, y, strength}, Originalpixel):
 * bei strength >= 0,6 zusätzlich 1–2 Funken im Kessel, höchstens einmal pro Sekunde.
 * Sendet beim Aufblitzen "funkeln" {x, y, strength 0,2–0,3} (optional für light.js).
 *
 * Abhängigkeit: TitleScreen.state.animationsOn und TitleScreen.onTick aus main.js.
 */
(function () {
  'use strict';

  // ---------- Einstellungen ----------
  var OW = 1536, OH = 1024, PX = 2;
  var W = OW / PX, H = OH / PX;                   // 768 × 512
  var FPS = 12;
  var SIZE = 2;                                   // Kantenlänge eines Funkens in Canvas-Pixeln (2 = 4×4 Originalpixel)
  var MAX_TOTAL = 12;
  var SPAWN_MS = [400, 1200];
  var RISE = [3, 8];                              // Originalpixel pro Sekunde
  var SWAY = [4, 8];                              // seitliches Pendeln ± Originalpixel
  var SWAY_PERIOD = [2000, 4000];                 // ms
  var LIFE = [3000, 6000];                        // ms
  var STAGES = [0.35, 0.70, 1.0];                 // hell bis 35 %, mittel bis 70 %, dunkel bis 100 %
  var FLASH_CHANCE = 0.10;
  var BLUBB_MIN = 0.6, BLUBB_GAP_MS = 1000;

  var GREEN = ['rgb(236,255,196)', 'rgb(160,228,74)', 'rgb(58,120,34)'];     // wie potion.js
  var GOLD = ['rgb(252,211,108)', 'rgb(248,166,60)', 'rgb(215,103,31)'];     // Flammenpalette
  var LAVENDER = ['rgb(226,200,255)', 'rgb(170,130,220)', 'rgb(100,70,150)'];

  // Zonen: Box (x0,y0,x1,y1 inkl.), Startbereich, Höchstzahl, Farben
  var ZONES = [
    { name: 'S1', box: [540, 110, 750, 345], spawn: [580, 325, 750, 345], max: 6, colors: GREEN },
    { name: 'S2', box: [140, 30, 480, 560],  spawn: [140, 90, 480, 560],  max: 3, colors: GOLD },
    { name: 'S3', box: [1110, 40, 1330, 470], spawn: [1110, 100, 1330, 470], max: 3, colors: LAVENDER }
  ];

  var BLOCKED = [
    [488, 725, 1035, 887],    // Spielen
    [40, 35, 126, 119],       // Zahnrad
    [40, 137, 126, 221],      // Musik
    [865, 255, 940, 320],     // Gesicht
    [790, 95, 1095, 465],     // Hexe
    [1020, 500, 1260, 740],   // Katze
    [170, 244, 192, 291],     // Kerze K1
    [384, 579, 406, 622],     // Kerze K2
    [1411, 57, 1434, 102],    // Kerze K3
    [1433, 654, 1469, 736]    // Kerze K4
  ];

  // ---------- Canvas ----------
  var layer = document.getElementById('layer-sprites');
  if (!layer || !window.TitleScreen) return;
  var canvas = document.createElement('canvas');
  canvas.className = 'sparks';
  canvas.width = W;
  canvas.height = H;
  layer.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rint(a, b) { return Math.floor(rnd(a, b + 1)); }

  // ---------- Zustand ----------
  var sparks = [];
  var spawnIn = rnd(SPAWN_MS[0], SPAWN_MS[1]);
  var lastBlubb = -Infinity;
  var drawn = [];            // zuletzt gezeichnete Rechtecke [x, y, w, h] in Canvas-Pixeln
  var drawnKey = '';

  // Halbe Ausdehnung eines Funkens in Originalpixeln (inkl. Kreuz beim Aufblitzen)
  var REACH = Math.ceil(1.5 * SIZE * PX);

  function hitsBlocked(x, y, margin) {
    var r = REACH + (margin || 0);
    for (var i = 0; i < BLOCKED.length; i++) {
      var b = BLOCKED[i];
      if (x + r >= b[0] && x - r <= b[2] && y + r >= b[1] && y - r <= b[3]) return true;
    }
    return false;
  }

  function countIn(zone) {
    var n = 0;
    for (var i = 0; i < sparks.length; i++) if (sparks[i].zone === zone) n++;
    return n;
  }

  function spawn(zone, x, y) {
    if (sparks.length >= MAX_TOTAL || countIn(zone) >= zone.max) return false;
    var amp = rnd(SWAY[0], SWAY[1]);
    for (var tries = 0; tries < 12; tries++) {
      var sx = x != null ? x + rnd(-15, 15) : rnd(zone.spawn[0], zone.spawn[2]);
      var sy = y != null ? y : rnd(zone.spawn[1], zone.spawn[3]);
      sx = Math.max(zone.box[0], Math.min(zone.box[2], sx));
      if (hitsBlocked(sx, sy, amp)) continue;
      var life = rnd(LIFE[0], LIFE[1]);
      sparks.push({
        zone: zone, x0: sx, x: sx, y: sy,
        vy: rnd(RISE[0], RISE[1]), amp: amp,
        period: rnd(SWAY_PERIOD[0], SWAY_PERIOD[1]), phase: rnd(0, 2 * Math.PI),
        age: 0, life: life,
        flashAt: Math.random() < FLASH_CHANCE ? rnd(0.05, 0.3) * life : -1,
        flashMs: rint(1, 2) * 1000 / FPS, flashSent: false
      });
      return true;
    }
    return false;
  }

  function spawnRandom() {
    // Zone gewichtet nach freien Plätzen
    var free = ZONES.map(function (z) { return Math.max(0, z.max - countIn(z)); });
    var sum = free.reduce(function (a, b) { return a + b; }, 0);
    if (!sum || sparks.length >= MAX_TOTAL) return;
    var r = Math.random() * sum;
    for (var i = 0; i < ZONES.length; i++) {
      if ((r -= free[i]) < 0) { spawn(ZONES[i]); return; }
    }
  }

  function flashing(s) {
    return s.flashAt >= 0 && s.age >= s.flashAt && s.age < s.flashAt + s.flashMs;
  }

  function update(dt) {
    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.age += dt;
      s.y -= s.vy * dt / 1000;
      s.x = s.x0 + s.amp * Math.sin(2 * Math.PI * s.age / s.period + s.phase);
      if (s.age >= s.life || hitsBlocked(s.x, s.y, 0)) { sparks.splice(i, 1); continue; }
      if (flashing(s) && !s.flashSent) {
        s.flashSent = true;
        document.dispatchEvent(new CustomEvent('funkeln', { detail: {
          x: Math.round(s.x), y: Math.round(s.y), strength: Math.round(rnd(0.2, 0.3) * 100) / 100
        } }));
      }
    }
    spawnIn -= dt;
    if (spawnIn <= 0) {
      spawnRandom();
      spawnIn = rnd(SPAWN_MS[0], SPAWN_MS[1]);
    }
  }

  // ---------- Zeichnen ----------
  function render() {
    var list = [];
    for (var i = 0; i < sparks.length; i++) {
      var s = sparks[i], f = s.age / s.life;
      var stage = f < STAGES[0] ? 0 : (f < STAGES[1] ? 1 : 2);
      var cx = Math.round(s.x / PX) - (SIZE >> 1), cy = Math.round(s.y / PX) - (SIZE >> 1);
      var col = s.zone.colors[stage];
      if (flashing(s)) {
        list.push([cx - SIZE, cy, SIZE * 3, SIZE, col]);        // waagerechter Balken
        list.push([cx, cy - SIZE, SIZE, SIZE * 3, col]);        // senkrechter Balken
      } else {
        list.push([cx, cy, SIZE, SIZE, col]);
      }
    }
    var key = list.join('|');
    if (key === drawnKey) return;                               // nichts hat sich bewegt
    for (var d = 0; d < drawn.length; d++) ctx.clearRect(drawn[d][0], drawn[d][1], drawn[d][2], drawn[d][3]);
    for (var j = 0; j < list.length; j++) {
      ctx.fillStyle = list[j][4];
      ctx.fillRect(list[j][0], list[j][1], list[j][2], list[j][3]);
    }
    drawn = list;
    drawnKey = key;
  }

  // ---------- Takt und Events ----------
  window.TitleScreen.onTick(function (now, dt) {
    update(Math.min(dt, 250));
    render();
  }, FPS);

  document.addEventListener('blubb', function (e) {
    if (!window.TitleScreen.state.animationsOn) return;
    var d = e.detail || {};
    if (!(d.strength >= BLUBB_MIN)) return;
    var now = performance.now();
    if (now - lastBlubb < BLUBB_GAP_MS) return;
    lastBlubb = now;
    var z = ZONES[0], n = rint(1, 2);
    var x = Math.max(z.spawn[0], Math.min(z.spawn[2], +d.x || 0));
    for (var k = 0; k < n; k++) spawn(z, x, rnd(z.spawn[1], z.spawn[3]));
  });

  // "Animationen aus": keine Funken, Canvas leer -> Original
  function sync() {
    if (window.TitleScreen.state.animationsOn) return;
    sparks = [];
    drawn = [];
    drawnKey = '';
    ctx.clearRect(0, 0, W, H);
  }
  document.addEventListener('statechange', sync);
  sync();
})();
