/* Titelbildschirm – Feuer unter dem Kessel (Zungen Z1–Z11, Glut G1–G3, Steinflanken S1–S3)
 *
 * WICHTIG: fire.js muss in index.html NACH candles.js geladen werden. Es zeichnet in das
 * vorhandene Kerzen-Canvas `.kerzen` (1536×1024, deckungsgleich mit dem Hintergrund) und
 * leert/zeichnet dort NUR die eigenen Feuerzellen innerhalb x586–871 / y610–719:
 *   Zungen  x622–829 / y610–676 (11 Scheiben, s. TONGUES)
 *   Glut    x586–871 / y685–712 (G1–G3, S1–S3)
 * Die Kerzenzellen K1–K4 werden nie berührt (keine Überschneidung, candles.js leert nur seine).
 * Fehlt `.kerzen` (candles.js nicht geladen), legt fire.js ein gleiches Canvas an.
 *
 * Keine Retusche: Der Hintergrund ist im Feuerbereich das Original. Die Frames liegen in
 * assets/feuer-sprites.png (erzeugt von /workspace/hexe-tools/feuer/feuer-sprites.py, Aufbau dort):
 *   Block A ab Sheet-y 0: 45 Zeilen à 67 px (Original-y 610–676), Sheet-x = Original-x − 586,
 *           Zeile = Glut·15 + Stufe·3 + Neigung mit
 *           LEVELS = [1.00, 0.90, 0.95, 1.05, 1.10], LEANS = [0, −1, +1], GLOWS = [1.00, 0.95, 1.05].
 *   Block B ab Sheet-y 3015: 3 Zeilen à 28 px (Original-y 685–712), Zeile = Glut.
 *   Zeile 0 = Original 1:1. Jede Scheibe ist einzeln gültig (Ränder = Original).
 *
 * Planer (12 fps): Jede Zunge hält eine Stufe 1–3 Ticks und geht dann meist eine Stufe, selten
 * zwei weiter. Nachbarzungen liegen nie mehr als 1 Stufe auseinander (Prüfer). Z1, Z10, Z11 nur
 * 0.95–1.05. Alle 4–9 s ein Luftzug: alle Zungen 2–3 Ticks Neigung −1, dann 1 Tick +1.
 * Glut wechselt alle 6–18 Ticks eine Stufe (gilt für Kern und G1–G3/S1–S3 gemeinsam).
 * Gezeichnet werden pro Tick nur Scheiben, deren Frame sich geändert hat.
 *
 * Licht: im selben Tick, sofern TitleScreen.light existiert:
 *   TitleScreen.light.set('kessel-feuer', (0.7 · mittlere Stufe Z2–Z9 + 0.3 · Glut) / 1.085)
 *   Ruhebild (Stufe 1, Glut 1) = 1/1.085 ≈ 0.922 -> in light-sources.js rest 0.922, intensity 0.597.
 * Animationen aus: Feuerzellen leeren (Hintergrund = Original, 0 px) und 1/1.085 senden.
 *
 * Abhängigkeit: TitleScreen.state.animationsOn und TitleScreen.onTick aus main.js.
 */
(function () {
  'use strict';

  // ---------- Einstellungen (müssen zu feuer-sprites.py passen) ----------
  var FPS = 12;
  var CX0 = 586;                                  // Sheet-x 0 = Original-x 586
  var TY0 = 610, TH = 67;                         // Zungenzeilen
  var GX0 = 586, GW = 286, GY0 = 685, GH = 28;    // Glut/Flanken-Streifen
  var GLUT_SY = 3015;                             // Block B im Sheet
  var LEVELS = [1.00, 0.90, 0.95, 1.05, 1.10];    // Reihenfolge im Sheet
  var LEANS = [0, -1, 1];
  var GLOWS = [1.00, 0.95, 1.05];
  var ORDER = [0.90, 0.95, 1.00, 1.05, 1.10];     // aufsteigend, für Nachbarstufe/Nachbarregel
  var GLOW_ORDER = [0.95, 1.00, 1.05];
  var MAX = 1.085;                                // 0.7·1.10 + 0.3·1.05
  var TONGUES = [
    { id: 'Z1', x0: 622, x1: 638, small: true }, { id: 'Z2', x0: 639, x1: 672 }, { id: 'Z3', x0: 673, x1: 688 },
    { id: 'Z4', x0: 689, x1: 701 }, { id: 'Z5', x0: 702, x1: 717 }, { id: 'Z6', x0: 718, x1: 748 },
    { id: 'Z7', x0: 749, x1: 764 }, { id: 'Z8', x0: 765, x1: 778 }, { id: 'Z9', x0: 779, x1: 796 },
    { id: 'Z10', x0: 797, x1: 810, small: true }, { id: 'Z11', x0: 811, x1: 829, small: true }
  ];

  var TS = window.TitleScreen;
  var layer = document.getElementById('layer-sprites');
  if (!layer || !TS) return;

  var canvas = layer.querySelector('canvas.kerzen');
  if (!canvas) {                                  // Rückfall: gleiches Canvas wie candles.js
    canvas = document.createElement('canvas');
    canvas.className = 'kerzen';
    canvas.width = 1536;
    canvas.height = 1024;
    layer.appendChild(canvas);
  }
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  var sheet = new Image();
  sheet.src = 'assets/feuer-sprites.png';

  function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  // ---------- Zustand ----------
  var glow, glowHold, gust, gustIn, lean, glutDrawn;
  function reset() {
    TONGUES.forEach(function (t) {
      t.lo = t.small ? 1 : 0; t.hi = t.small ? 3 : 4;
      t.o = 2;                                     // Index in ORDER (1.00)
      t.hold = rint(1, 3);
      t.drawn = -1;
    });
    glow = 1; glowHold = rint(6, 18);              // Index in GLOW_ORDER (1.00)
    gust = []; gustIn = rint(4 * FPS, 9 * FPS); lean = 0;
    glutDrawn = -1;
  }
  reset();

  function plan() {
    var n = TONGUES.length;
    for (var i = 0; i < n; i++) {
      var t = TONGUES[i];
      if (--t.hold > 0) continue;
      t.hold = rint(1, 3);
      var d = (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.15 ? 2 : 1);
      var want = Math.max(t.lo, Math.min(t.hi, t.o + d));
      // Nachbarregel: höchstens 1 Stufe Abstand zu beiden Nachbarn, sonst so nah wie erlaubt
      var best = -1, bestKey = 1e9;
      for (var v = t.lo; v <= t.hi; v++) {
        if (i > 0 && Math.abs(v - TONGUES[i - 1].o) > 1) continue;
        if (i < n - 1 && Math.abs(v - TONGUES[i + 1].o) > 1) continue;
        var key = Math.abs(v - want) * 10 + Math.abs(v - t.o);
        if (key < bestKey) { bestKey = key; best = v; }
      }
      if (best >= 0) t.o = best;
    }
    if (--glowHold <= 0) {
      glow = Math.max(0, Math.min(2, glow + (Math.random() < 0.5 ? -1 : 1)));
      glowHold = rint(6, 18);
    }
    if (--gustIn <= 0 && !gust.length) {
      var k = rint(2, 3);
      gust = [];
      while (k--) gust.push(-1);
      gust.push(1);
      gustIn = rint(4 * FPS, 9 * FPS);
    }
    lean = gust.length ? gust.shift() : 0;
  }

  function draw() {
    if (!sheet.complete || !sheet.naturalWidth) return;
    var g = GLOW_ORDER[glow], gi = GLOWS.indexOf(g);
    for (var i = 0; i < TONGUES.length; i++) {
      var t = TONGUES[i];
      var row = gi * 15 + LEVELS.indexOf(ORDER[t.o]) * 3 + LEANS.indexOf(lean);
      if (row === t.drawn) continue;
      var w = t.x1 - t.x0 + 1;
      ctx.drawImage(sheet, t.x0 - CX0, row * TH, w, TH, t.x0, TY0, w, TH);   // deckend
      t.drawn = row;
    }
    if (gi !== glutDrawn) {
      ctx.drawImage(sheet, 0, GLUT_SY + gi * GH, GW, GH, GX0, GY0, GW, GH);
      glutDrawn = gi;
    }
  }

  function lightValue() {
    var s = 0;
    for (var i = 1; i <= 8; i++) s += ORDER[TONGUES[i].o];   // Z2–Z9
    return (0.7 * s / 8 + 0.3 * GLOW_ORDER[glow]) / MAX;
  }
  function sendLight(v) {
    var light = TS.light;
    if (light && light.set) light.set('kessel-feuer', v);
  }

  function tick() {
    plan();
    draw();
    sendLight(lightValue());
  }

  // ---------- Takt: genau eine Anmeldung, Abmeldung bei "aus" ----------
  var stopTick = null;                            // Unsubscribe-Funktion von TitleScreen.onTick
  function start() {
    if (!stopTick) stopTick = TS.onTick(tick, FPS);
  }
  function stop() {
    if (stopTick) { stopTick(); stopTick = null; }
  }

  function clearCells() {
    ctx.clearRect(TONGUES[0].x0, TY0, TONGUES[TONGUES.length - 1].x1 - TONGUES[0].x0 + 1, TH);
    ctx.clearRect(GX0, GY0, GW, GH);
  }

  // "Animationen aus": Zellen leeren -> Hintergrund zeigt das Original (0 px), Licht auf Ruhewert.
  function sync() {
    if (TS.state.animationsOn) { start(); return; }
    stop();
    reset();
    clearCells();
    sendLight(1 / MAX);
  }

  sheet.onload = function () {
    if (TS.state.animationsOn) draw();
  };
  document.addEventListener('statechange', sync);
  sync();
})();
