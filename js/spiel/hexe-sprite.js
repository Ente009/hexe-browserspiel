/* HEX-014 Hexen-Sprites: ersetzt NUR Spiel.hexeFigur.zeichne (Schnittstelle HEX-013/014b: richtung, laeuft, laufzeit, spielzeit).
   Sheet assets/spiel/hexe-lauf.png + .json (sprites{name:{x,y,w,h,anker,frames,fps}}, Frames waagrecht). Anker [16,32] = Fußpunkt f.x/f.y.
   Lauf (f.laeuft, nur bei echter Bewegung): Frame aus f.laufzeit (ms). Idle: Frame aus f.spielzeit (s, aus hexe-figur.js, steht in der Pause).
   Drückt die Hexe gegen eine Wand ohne Bewegung: Stehpose, Blick in die gedrückte Richtung (f.richtung).
   Solange das Sheet nicht geladen ist (oder bei Ladefehler), zeichnet die alte Platzhalter-Funktion. */
(function () {
  'use strict';
  var S = window.Spiel, alt = S.hexeFigur.zeichne, PFAD = 'assets/spiel/', meta = null, bild = null;
  fetch(PFAD + 'hexe-lauf.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (m) {
    var b = new Image(); b.onload = function () { meta = m; bild = b; };
    b.onerror = function () { console.warn('HEX-014: hexe-lauf.png fehlt, Platzhalter bleibt'); };
    b.src = PFAD + m.bild;
  }).catch(function (e) { console.warn('HEX-014: hexe-lauf.json nicht ladbar (' + e.message + '), Platzhalter bleibt'); });
  function zeichne(ctx, f, k) {
    if (!meta) return alt(ctx, f, k);
    var s = meta.sprites[(f.laeuft ? 'lauf_' : 'idle_') + f.richtung];
    if (!s) return alt(ctx, f, k);
    var n = s.frames || 1, t = f.laeuft ? f.laufzeit : f.spielzeit * 1000;
    var i = n > 1 ? Math.floor(t * (s.fps || 1) / 1000) % n : 0;
    var x = Math.round(f.x) - s.anker[0] - k.x, y = Math.round(f.y) - s.anker[1] - k.y;
    ctx.drawImage(bild, s.x + i * s.w, s.y, s.w, s.h, x, y, s.w, s.h);
  }
  S.hexeFigur.zeichne = zeichne;
})();
