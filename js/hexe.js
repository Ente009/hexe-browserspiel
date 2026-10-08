/* Animation: Hexe rührt im Kessel
 * Löffel und Hände kippen per Zeilenscherung hin und her, der Ärmel zieht mit.
 * Alle Frames stammen aus dem Originalbild und liegen in assets/hexe-sprites.png
 * (erzeugt von /workspace/hexe-tools/hexe-sprites.py). Jede Zelle ist 210x150
 * und deckt denselben Bildausschnitt ab (Original x=760..970, y=250..400).
 *   0-15 ein Rührzyklus, Frame 0 = wie im Original
 * Löffel und Hände sind aus titelbild-bg.png entfernt und werden deshalb immer gezeichnet.
 *
 * Abhängigkeit: TitleScreen.state.animationsOn aus main.js (nur gelesen).
 */
(function () {
  'use strict';

  var CW = 210, CH = 150;
  var FRAMES = 16;
  var STEP_MS = 110;                         // ca. 1,8 s pro Runde
  var REST = 0;

  var layer = document.getElementById('layer-sprites');
  if (!layer || !window.TitleScreen) return;

  var canvas = document.createElement('canvas');
  canvas.id = 'witch';
  canvas.width = CW;
  canvas.height = CH;
  layer.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  var sheet = new Image();
  sheet.src = 'assets/hexe-sprites.png';

  var shown = -1;
  function draw(i) {
    if (i === shown) return;
    shown = i;
    ctx.clearRect(0, 0, CW, CH);
    ctx.drawImage(sheet, i * CW, 0, CW, CH, 0, 0, CW, CH);
  }

  var t0 = 0;
  var rafId = null;

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    if (!sheet.complete || !sheet.naturalWidth) return;
    draw(Math.floor((now - t0) / STEP_MS) % FRAMES);
  }

  function start() {
    if (rafId === null) { t0 = performance.now(); rafId = requestAnimationFrame(tick); }
  }

  function stop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    if (sheet.complete && sheet.naturalWidth) draw(REST);   // Hexe wie im Original
  }

  function sync() {
    if (window.TitleScreen.state.animationsOn) start(); else stop();
  }

  sheet.onload = function () { shown = -1; sync(); if (rafId === null) draw(REST); };
  document.addEventListener('statechange', sync);
  sync();
})();
