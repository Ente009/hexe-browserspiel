/* Animation: schwarze Katze (Schwanz, Blinzeln, Ohr, Atemzug, Kopf heben)   – v2, Testkopie
 * Alle Teile stammen aus dem Originalbild und liegen in assets/katze-sprites.png (3600×480,
 * erzeugt von /workspace/hexe-tools/katze/katze-sprites-v2.py). Jede Zelle ist 240×240 und deckt
 * denselben Bildausschnitt ab (Original x=1020..1259, y=500..739).
 *   Zeile 0: 0-11 Schwanz (eine Schwingung) | 12 Kopf (alt, unbenutzt) | 13 Lider halb | 14 Lider zu
 *   Zeile 1: 0 E1 Ohr 2 px | 1 E2 Ohr 3 px | 2 A1 Atemzug | 3 H1 Kopf +1 | 4 H2 Kopf +2
 * Zeile-1-Zellen enthalten nur die gegenüber titelbild-bg.png geänderten Pixel (deckend, inkl. Wand).
 * Der Schwanz ist aus titelbild-bg.png entfernt und wird deshalb immer gezeichnet (nach dem Overlay,
 * damit er beim Atemzug nie verdeckt wird).
 *
 * Ablaufplaner: immer nur EINE Aktion (Blinzeln, Ohr, Atem, Kopf) gleichzeitig, danach 400–900 ms Pause.
 * Abstände (Start bis nächste Fälligkeit): Blinzeln 2,5–6 s, Ohr 4–10 s, Atem 7–14 s, Kopf 9–16 s.
 * Sind mehrere fällig: Blinzeln > Ohr > Atem > Kopf, die anderen warten. Ohr/Atem laufen dadurch nie
 * bei gehobenem Kopf. Alle Folgen zählen Ticks (12 fps = 83 ms), kein Schritt kann verloren gehen.
 * Schwanz: je Schwingung 180–280 ms pro Frame, nach 30 % der Schwingungen 0,6–2,5 s Pause auf Frame 0.
 */
(function () {
  'use strict';

  var CELL = 240;
  var FPS = 12;
  var TICK = 1000 / FPS;
  var TAIL_FRAMES = 12;                      // eine volle Schwingung
  var TAIL_REST = 0;                         // Frame 0 = wie im Original
  var LID_HALF = 13, LID_SHUT = 14;
  var E1 = 0, E2 = 1, A1 = 2, H1 = 3, H2 = 4; // Zeile 1
  var SHEET = window.KATZE_SHEET || 'assets/katze-sprites.png';
  var DBG = window.KATZE_DEBUG || null;      // nur Testseite: Protokoll + Testzugriff

  var layer = document.getElementById('layer-sprites');
  if (!layer || !window.TitleScreen) return;

  // Ein Canvas in Originalgröße (1536×1024) deckungsgleich über dem Hintergrund (wie die Kerzen):
  // ein 240×240-Canvas an Prozent-Position wurde bei 4 von 6 Bildschirmgrößen anders gerastert als das
  // Hintergrundbild (bis 6000 Gerätepixel Abweichung schon im Ruhebild). Gezeichnet wird nur in die Katzenzelle.
  var OX = 1020, OY = 500;                   // Lage der Katzenzelle im Original
  var canvas = document.createElement('canvas');
  canvas.id = 'cat';
  canvas.width = 1536;
  canvas.height = 1024;
  layer.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  var sheet = new Image();
  sheet.src = SHEET;

  function rand(min, max) { return min + Math.random() * (max - min); }
  function rint(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
  function ticks(ms) { return Math.max(1, Math.round(ms / TICK)); }
  function log(e) { if (DBG) { e.t = Math.round(performance.now()); DBG.log.push(e); } }

  // ---------- Aktionen: Folgen aus Schritten { lid, ov, n (Ticks) } ----------
  var ACTIONS = {
    blink: { range: [2500, 6000], seq: function () {
      var s = [{ lid: LID_HALF, n: 1 }, { lid: LID_SHUT, n: 2 }, { lid: LID_HALF, n: 1 }];   // 83/167/83 ms
      if (Math.random() < 0.25) s = s.concat([{ n: 2 }], s);                                  // ab und zu doppelt
      return s;
    } },
    ear: { range: [4000, 10000], seq: function () {
      return [{ ov: E1, n: 1 }, { ov: E2, n: 2 }, { ov: E1, n: 1 }];                           // E1, E2, E2, E1
    } },
    breath: { range: [7000, 14000], seq: function () {
      return [{ ov: A1, n: rint(10, 16) }];                                                    // 0,8–1,3 s
    } },
    head: { range: [9000, 16000], seq: function () {
      var hold = ticks(rand(900, 1600));
      return Math.random() < 0.5 ? [{ ov: H1, n: hold }]
        : [{ ov: H1, n: 1 }, { ov: H2, n: hold }, { ov: H1, n: 1 }];                          // 2 px über 1 px
    } }
  };
  var ORDER = ['blink', 'ear', 'breath', 'head'];   // Vorrang, wenn mehrere fällig sind

  var due = {}, run = null, pauseUntil = 0, lastTick = -1e9;
  var tail = { f: TAIL_REST, start: 0, step: 220, pauseUntil: 0 };

  function reset(now) {
    ORDER.forEach(function (k) { due[k] = now + rand(ACTIONS[k].range[0], ACTIONS[k].range[1]); });
    run = null; pauseUntil = now;
    tail.f = TAIL_REST; tail.start = now; tail.step = rand(180, 280); tail.pauseUntil = 0;
  }

  function startAction(name, now) {
    var a = ACTIONS[name];
    var gap = rand(a.range[0], a.range[1]);
    log({ ev: 'start', a: name, due: Math.round(due[name]), next: Math.round(gap) });
    due[name] = now + gap;
    run = { name: name, steps: a.seq(), i: 0, left: 0 };
    run.left = run.steps[0].n;
  }

  // Liefert den aktuellen Schritt (oder null) und schaltet die Folge pro Tick weiter.
  function stepActions(now) {
    if (run && --run.left <= 0) {
      if (++run.i >= run.steps.length) {
        var p = rand(400, 900);
        log({ ev: 'end', a: run.name, pause: Math.round(p) });
        run = null; pauseUntil = now + p;
      } else {
        run.left = run.steps[run.i].n;
      }
    }
    if (!run && now >= pauseUntil) {
      for (var i = 0; i < ORDER.length; i++) {
        if (now >= due[ORDER[i]]) { startAction(ORDER[i], now); break; }
      }
    }
    return run ? run.steps[run.i] : null;
  }

  function stepTail(now) {
    if (tail.pauseUntil) {
      if (now < tail.pauseUntil) return TAIL_REST;
      log({ ev: 'tailpause-end' });
      tail.pauseUntil = 0; tail.start = now; tail.step = rand(180, 280);
    }
    if (now - tail.start > 1000) tail.start = now;          // nach Hängern nicht nachholen
    while (now - tail.start >= tail.step) {
      tail.start += tail.step;
      tail.f = (tail.f + 1) % TAIL_FRAMES;
      if (tail.f === TAIL_REST) {                            // Schwingung fertig
        if (Math.random() < 0.3) {
          var p = rand(600, 2500);
          tail.pauseUntil = tail.start + p;
          log({ ev: 'tailpause', ms: Math.round(p) });
          break;
        }
        tail.step = rand(180, 280);
        log({ ev: 'swing', step: Math.round(tail.step) });
      }
    }
    return tail.f;
  }

  function cell(i, row) {
    ctx.drawImage(sheet, i * CELL, row * CELL, CELL, CELL, OX, OY, CELL, CELL);
  }

  var lastKey = '';
  function draw(t, ov, lid) {
    var key = t + '|' + ov + '|' + lid;
    if (key === lastKey) return;            // nur zeichnen, wenn sich etwas ändert
    lastKey = key;
    if (DBG) (DBG.draws = DBG.draws || []).push([Math.round(performance.now()), t, ov, lid]);
    ctx.clearRect(OX, OY, CELL, CELL);
    if (ov != null) cell(ov, 1);            // Ohr / Atem / Kopf (geänderte Pixel)
    cell(t, 0);                             // Schwanz immer, über dem Overlay
    if (lid != null) cell(lid, 0);
  }

  // Gemeinsamer Takt aus main.js: läuft nur bei eingeschalteten Animationen
  function tick(now) {
    if (!sheet.complete || !sheet.naturalWidth) return;
    if (now - lastTick > 500) reset(now);   // erster Tick bzw. nach "Animationen aus" / Pause neu planen
    lastTick = now;
    if (DBG) DBG.ticks = (DBG.ticks || 0) + 1;
    var s = stepActions(now);
    var t = stepTail(now);
    draw(t, s ? s.ov : null, s ? s.lid : null);
  }

  window.TitleScreen.onTick(tick, FPS);

  function sync() {
    if (window.TitleScreen.state.animationsOn) return;
    run = null; lastTick = -1e9;
    if (sheet.complete && sheet.naturalWidth) draw(TAIL_REST, null, null);  // stehende Katze wie im Original
  }

  if (DBG) DBG.api = { draw: function (t, ov, lid) { lastKey = ''; draw(t, ov, lid); } };

  sheet.onload = sync;
  document.addEventListener('statechange', sync);
  sync();
})();
