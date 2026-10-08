/* Animation: Hexe rührt im Kessel
 * Löffel und Hände kippen per Zeilenscherung hin und her, der Ärmel zieht mit.
 * Kopf, Hut und Haare heben sich dabei leicht (bis 2 px, Naht unter dem Kinn).
 * Alle Frames stammen aus dem Originalbild:
 *   assets/hexe-sprites.png  (hexe-sprites.py)  16 Zellen 210x150, Original x=760..970, y=250..400
 *   assets/hexe-koerper.png  (hexe-koerper.py)  Zelle k = um k px gehoben, je 304x222,
 *                                               Original x=792..1096, y=95..317
 * Frame 0 / Zelle 0 = wie im Original. Löffel, Hände und die frei werdenden Unterkanten
 * von Hut und Krempe sind aus titelbild-bg.png retuschiert, deshalb wird immer gezeichnet.
 *
 * Abhängigkeit: TitleScreen.state.animationsOn und TitleScreen.onTick aus main.js.
 */
(function () {
  'use strict';

  var FRAMES = 16;
  var STEP_MS = 110;                         // ca. 1,8 s pro Runde
  var REST = 0;
  var LIFT = [0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 0, 0];   // Hub je Frame in px

  var layer = document.getElementById('layer-sprites');
  if (!layer || !window.TitleScreen) return;

  function makePart(id, w, h, src) {
    var c = document.createElement('canvas');
    c.id = id; c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var img = new Image();
    var part = { canvas: c, ctx: ctx, img: img, w: w, h: h, shown: -1, ok: false };
    img.onload = function () { part.ok = true; part.shown = -1; drawRest(); };
    img.onerror = function () { c.remove(); };             // fehlt das Bild, bleibt das Original stehen
    img.src = src;
    return part;
  }

  // Körper zuerst einhängen, damit Löffel und Hände darüber liegen
  var body = makePart('witch-body', 304, 222, 'assets/hexe-koerper.png');
  var arm = makePart('witch', 210, 150, 'assets/hexe-sprites.png');
  layer.appendChild(body.canvas);
  layer.appendChild(arm.canvas);

  function show(part, cell) {
    if (!part.ok || cell === part.shown) return;
    part.shown = cell;
    part.ctx.clearRect(0, 0, part.w, part.h);
    part.ctx.drawImage(part.img, cell * part.w, 0, part.w, part.h, 0, 0, part.w, part.h);
  }

  function draw(i) {
    show(body, LIFT[i]);
    show(arm, i);
  }

  function drawRest() {
    if (!window.TitleScreen.state.animationsOn) draw(REST);
    else draw(frame);
  }

  var frame = REST;
  window.TitleScreen.onTick(function () {
    frame = (frame + 1) % FRAMES;
    draw(frame);
  }, 1000 / STEP_MS);

  document.addEventListener('statechange', function () {
    if (!window.TitleScreen.state.animationsOn) { frame = REST; draw(REST); }
  });
  draw(REST);
})();
