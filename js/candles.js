/* Titelbildschirm – Kerzen flackern (K1–K4)
 * Keine Retusche: Ein Canvas in Originalgröße (1536×1024) liegt deckungsgleich über dem
 * Hintergrund und ist bis auf die vier Kerzenzellen durchsichtig. In jede Zelle wird
 * deckend der ganze Ausschnitt (Wand + Flamme) gezeichnet, Frame 0 ist der
 * Originalausschnitt 1:1. (Ein Canvas über der ganzen Bühne statt vier kleiner: so wird
 * es bei jeder Bildschirmgröße exakt wie das Hintergrundbild skaliert, ohne Versatz.) Die Frames liegen in assets/kerzen-sprites.png
 * (erzeugt von /workspace/hexe-tools/kerzen-sprites.py, Aufbau siehe dort):
 *   eine Zeile je Kerze, Spalte = Stufe * 3 + Neigung,
 *   Stufen LEVELS = [1.00, 0.94, 0.97, 1.01, 1.03], Neigungen LEANS = [0, -1, +1].
 *
 * Flackern: flicker springt meist zur Nachbarstufe (selten zwei Stufen, nie 0.94 -> 1.03)
 * und hält 1–4 Ticks. Alle 3–8 s ein
 * kurzer Luftzug (Spitze 2–3 Ticks nach links, danach 1 Tick zurück). K3 (Laterne,
 * hinter Glas) bleibt ruhiger: nur 0.94–1.01, längere Haltezeiten, kein Luftzug.
 *
 * Licht: Es gibt genau eine Schnittstelle. Im selben Tick wie die Flamme ruft das Modul
 *   TitleScreen.light.set('kerze-1' … 'kerze-4', flicker/1.03 linear gestreckt auf 0.75–1.0; aus: 0.97)
 * auf, sofern TitleScreen.light existiert. Die Lichtquellen selbst (Position, Radius,
 * Farbe) legt light.add an anderer Stelle an; set ist bis dahin wirkungslos.
 *
 * Abhängigkeit: TitleScreen.state.animationsOn und TitleScreen.onTick aus main.js.
 */
(function () {
  'use strict';

  // ---------- Einstellungen (müssen zu kerzen-sprites.py und style.css passen) ----------
  var FPS = 12;                                   // gleicher Takt wie die Lichtkarte
  var CELL_W = 37;                                // Spaltenbreite im Sheet
  var LEVELS = [1.00, 0.94, 0.97, 1.01, 1.03];    // Reihenfolge der Spalten im Sheet
  var LEANS = [0, -1, 1];
  var LADDER = [0.94, 0.97, 1.00, 1.01, 1.03];    // aufsteigend, für "Nachbarstufe"
  var MAX_FLICKER = 1.03;                         // Normierung für light.set

  // Zelle im Original (x, y, w, h) und Zeile im Sheet (sy)
  var CANDLES = [
    { id: 'kerze-1', x: 170,  y: 244, w: 23, h: 48, sy: 0,   calm: false },
    { id: 'kerze-2', x: 384,  y: 579, w: 23, h: 44, sy: 48,  calm: false },
    { id: 'kerze-3', x: 1411, y: 57,  w: 24, h: 46, sy: 92,  calm: true  },  // Laterne
    { id: 'kerze-4', x: 1433, y: 654, w: 37, h: 83, sy: 138, calm: false }
  ];

  var layer = document.getElementById('layer-sprites');
  if (!layer || !window.TitleScreen) return;

  var sheet = new Image();
  sheet.src = 'assets/kerzen-sprites.png';

  function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  var canvas = document.createElement('canvas');
  canvas.className = 'kerzen';
  canvas.width = 1536;
  canvas.height = 1024;
  layer.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  CANDLES.forEach(function (c, i) {
    c.step = 2;                                  // Index in LADDER (1.00)
    c.hold = rint(1, 4);
    c.lean = 0;
    c.gust = [];                                 // geplante Neigungen für den Luftzug
    c.nextGust = rint(3 * FPS, 8 * FPS) + i * 7; // nicht alle gleichzeitig
    c.drawn = -1;
  });

  function frameOf(c) {
    return LEVELS.indexOf(LADDER[c.step]) * LEANS.length + LEANS.indexOf(c.lean);
  }

  function draw(c) {
    var f = frameOf(c);
    if (f === c.drawn || !sheet.complete || !sheet.naturalWidth) return;
    ctx.drawImage(sheet, f * CELL_W, c.sy, c.w, c.h, c.x, c.y, c.w, c.h);   // deckend, kein clearRect nötig
    c.drawn = f;
  }

  // Licht: flicker/1.03 liegt nur zwischen 0.913 und 1.0, das ist kleiner als die
  // Hysterese von ±0.03 in light.js. Deshalb wird nur der Lichtwert linear auf
  // 0.75–1.0 gestreckt (Prüfer). Die Flamme selbst bleibt unverändert.
  var LIGHT_LO = LADDER[0] / MAX_FLICKER;        // 0.913
  function sendLight(c) {
    var light = window.TitleScreen.light;
    if (!light || !light.set) return;
    var v = LADDER[c.step] / MAX_FLICKER;
    light.set(c.id, 0.75 + (v - LIGHT_LO) / (1 - LIGHT_LO) * 0.25);
  }
  // Animationen aus: ungestreckter Ruhewert wie bisher (1/1.03 ≈ 0.97)
  function sendRestLight(c) {
    var light = window.TitleScreen.light;
    if (light && light.set) light.set(c.id, 1 / MAX_FLICKER);
  }

  function step(c) {
    // Luftzug: alle 3–8 s 2–3 Ticks nach links geneigt, dann 1 Tick zurückschwingen
    if (!c.calm && --c.nextGust <= 0) {
      var n = rint(2, 3);
      c.gust = [];
      for (var k = 0; k < n; k++) c.gust.push(-1);
      c.gust.push(1);
      c.nextGust = rint(3 * FPS, 8 * FPS);
      c.hold = 0;                                // im Luftzug wechselt auch die Höhe schnell
    }
    if (c.gust.length) {
      c.lean = c.gust.shift();
      if (c.lean < 0) c.step = Math.max(0, Math.min(3, c.step + (Math.random() < 0.5 ? -1 : 1)));
      return;
    }
    c.lean = 0;
    if (--c.hold > 0) return;
    var top = c.calm ? 3 : LADDER.length - 1;    // K3: höchstens 1.01
    var d = Math.random() < 0.15 ? 2 : 1;          // meist Nachbarstufe, selten zwei Stufen
    var s = c.step + (Math.random() < 0.5 ? -d : d);
    if (s < 0) s = c.step + d;
    if (s > top) s = c.step - d;
    s = Math.max(0, Math.min(top, s));
    c.step = s;
    c.hold = c.calm ? rint(2, 6) : rint(1, 4);
  }

  // ---------- Takt ----------
  window.TitleScreen.onTick(function () {
    for (var i = 0; i < CANDLES.length; i++) {
      var c = CANDLES[i];
      step(c);
      draw(c);
      sendLight(c);
    }
  }, FPS);

  // "Animationen aus": Frame 0 (= Original). Die Zellen werden dafür geleert, dann zeigt
  // der Hintergrund selbst das Original – bei jeder Bildschirmgröße 0 Pixel Abweichung.
  // Licht auf den Wert für flicker 1.
  function sync() {
    if (window.TitleScreen.state.animationsOn) return;
    for (var i = 0; i < CANDLES.length; i++) {
      var c = CANDLES[i];
      c.step = 2; c.lean = 0; c.gust = []; c.hold = rint(1, 4);
      ctx.clearRect(c.x, c.y, c.w, c.h);
      c.drawn = -1;
      sendRestLight(c);
    }
  }

  sheet.onload = function () {
    if (!window.TitleScreen.state.animationsOn) return;
    for (var i = 0; i < CANDLES.length; i++) draw(CANDLES[i]);
  };
  document.addEventListener('statechange', sync);
  sync();
})();
