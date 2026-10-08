/* Animation: schwarze Katze (Schwanz, Blinzeln, Kopf)
 * Alle Teile stammen aus dem Originalbild und liegen in assets/katze-sprites.png
 * (erzeugt von /workspace/hexe-tools/katze-sprites.py). Jede Zelle ist 240x240
 * und deckt denselben Bildausschnitt ab (Original x=1020..1260, y=500..740).
 *   0-11 Schwanz (eine Schwingung, zeilenweise verbogen) | 12 Kopf | 13 Lider halb | 14 Lider zu
 * Der Schwanz ist aus titelbild-bg.png entfernt und wird deshalb immer gezeichnet.
 */
(function () {
  'use strict';

  var CELL = 240;
  var FPS = 8;
  var TAIL_FRAMES = 12;                      // eine volle Schwingung
  var TAIL_REST = 0;                         // Frame 0 = wie im Original
  var TAIL_STEP_MS = 220;
  var HEAD = 12, LID_HALF = 13, LID_SHUT = 14;

  var layer = document.getElementById('layer-sprites');
  if (!layer || !window.TitleScreen) return;

  var canvas = document.createElement('canvas');
  canvas.id = 'cat';
  canvas.width = CELL;
  canvas.height = CELL;
  layer.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  var sheet = new Image();
  sheet.src = 'assets/katze-sprites.png';

  function rand(min, max) { return min + Math.random() * (max - min); }

  // Zeitpläne für Blinzeln und Kopf, relativ zu performance.now()
  var t0 = performance.now();
  var nextBlink = t0 + rand(2000, 4000);
  var blink = null;   // [{lid, until}, ...]
  var nextHead = t0 + rand(6000, 10000);
  var head = null;    // [{dy, until}, ...]

  function startBlink(now) {
    var seq = [[LID_HALF, 60], [LID_SHUT, 120], [LID_HALF, 60]];
    if (Math.random() < 0.25) seq = seq.concat([[-1, 140]], seq); // ab und zu doppelt
    blink = schedule(seq, now);
    nextBlink = now + rand(3000, 6000);
  }

  function startHead(now) {
    var dy = Math.random() < 0.5 ? -2 : -1;  // kurz den Kopf heben
    head = schedule([[-1, 120], [dy, rand(900, 1600)], [-1, 120]], now);
    nextHead = now + rand(8000, 15000);
  }

  function schedule(seq, now) {
    var t = now;
    return seq.map(function (s) { t += s[1]; return { v: s[0], until: t }; });
  }

  function current(seq, now) {
    while (seq && seq.length && seq[0].until <= now) seq.shift();
    return seq && seq.length ? seq[0].v : null;
  }

  function cell(i, dy) {
    ctx.drawImage(sheet, i * CELL, 0, CELL, CELL, 0, dy || 0, CELL, CELL);
  }

  var lastKey = '';
  function draw(tail, dy, lid) {
    var key = tail + '|' + dy + '|' + lid;
    if (key === lastKey) return;            // nur zeichnen, wenn sich etwas ändert
    lastKey = key;
    ctx.clearRect(0, 0, CELL, CELL);
    cell(tail);
    if (dy) cell(HEAD, dy);
    if (lid !== null && lid >= 0) cell(lid, dy);
  }

  // Schleife läuft nur bei eingeschalteten Animationen (wie beim Dampf)
  var lastTick = 0;
  var rafId = null;

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    if (!sheet.complete || !sheet.naturalWidth) return;
    if (now - lastTick < 1000 / FPS) return;
    lastTick = now;

    if (!blink && now >= nextBlink) startBlink(now);
    if (!head && now >= nextHead) startHead(now);

    var lid = current(blink, now);
    if (lid === null) blink = null;
    var dy = current(head, now);
    if (dy === null) { head = null; dy = 0; }
    var tail = Math.floor((now - t0) / TAIL_STEP_MS) % TAIL_FRAMES;

    draw(tail, dy, lid);
  }

  function start() {
    if (rafId === null) rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    blink = head = null;
    if (sheet.complete && sheet.naturalWidth) draw(TAIL_REST, 0, null);  // stehende Katze wie im Original
  }

  function sync() {
    if (window.TitleScreen.state.animationsOn) start(); else stop();
  }

  sheet.onload = sync;
  document.addEventListener('statechange', sync);
  sync();
})();
