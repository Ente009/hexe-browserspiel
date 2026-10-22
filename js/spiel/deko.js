/* HEX-019b Umgebungsanimationen im Spiel (Schnittstelle Spiel.deko aus HEX-019a, Craft „Schnittstelle Spiel.deko“).
 *   Spiel.deko.init(karte)          bei jedem Karteneintritt, nach Spiel.licht.setzeKarte
 *   Spiel.deko.tick(spielzeitMs)    je Bild, nicht in der Pause (Logikschritte × 1000/60)
 *   Spiel.deko.zeichne(ctx, kamera) jedes Bild, auch in der Pause (nach Ebene ueber, vor Licht); Kartenkoordinaten → Math.round(x) - kamera.x
 *   Spiel.deko.clear()              vor jedem Kartenwechsel
 * core ruft nur bei Spiel.einstellungen.animationen === true; bei „aus“ passiert hier nichts, Laternen bleiben auf 1 (rest).
 * Beim Laden: nichts zeichnen, Spiel.licht nicht anfassen.
 * Teile intern im Schema {init, tick, clear} wie js/ambient.js, zusätzlich zeichne:
 *   Laternen  Spiel.licht.set('laterne-n', v) 6/s, synchron zum Sprite-Frame der Laterne floor(spielzeit_s × 6) % 3
 *             (werkstatt-objekte.json laterne frames 3, fps 6; core zeichnet den Frame). Frame-Farbe → Helligkeit im Bereich 0,55–1,0:
 *             Frame 0 gelb 0,80 · Frame 1 hell 1,00 · Frame 2 orange 0,55. set() nur bei Frame-Wechsel (≤ 6/s, teilt den 12-fps-Lichttakt).
 * F-021: Orte kommen nur aus der Karte (Format mit HP abgestimmt), Pixel in Kartenkoordinaten, alle Felder optional:
 *   karte.daten.deko = { katze: {x, y, w, h}, dampf: [{x, y}], blaetter: bool }
 *   Fehlt deko oder ein Unterfeld, macht der Teil nichts. Keine festen Plätze, keine Abfrage der Karten-id.
 *   Blätter   nur bei deko.blaetter === true: wenige fallende Blätter über die ganze Karte (12 fps), nur Bild.
 *   Dampf     je Punkt in deko.dampf Puffs, die von (x, y) aufsteigen (6 fps).
 *   Katze     in deko.katze: Fußlinie = y + h, läuft nur zwischen x und x + w; Idle 4 fps, ab und zu ein paar Schritte (keine KI).
 * Laternen: keine eigenen Ruhe-/Fallbackwerte. Ruhe stellt licht.setzeKarte beim Karteneintritt her; getRest wird hier nicht gebraucht.
 * Alles deterministisch aus der Spielzeit (eigener Zufall mit festem Startwert je Karteneintritt), keine Uhrzeit.
 * Farben aus der Palette von Karte/Objekten (HEX-015), harte Pixel (fillRect ganzzahlig). */
(function () {
  'use strict';
  var S = window.Spiel = window.Spiel || {};
  var PAL = { nacht: '#161422', holz0: '#362016', orange: '#ce7024', laub3: '#a05622', rot1: '#962c30', gelb: '#f6c45c',
    stein1: '#68646a', stein2: '#8e8888', creme: '#e0ceb4' };
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  // Deko-Daten der Karte: nur karte.daten.deko (Pfad laut HP, F-021)
  function dekoDaten(karte) { var d = karte && karte.daten && karte.daten.deko; return d && typeof d === 'object' ? d : {}; }
  function zahl(v) { return typeof v === 'number' && isFinite(v); }
  function px(ctx, k, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x) - k.x, Math.round(y) - k.y, w, h); }

  // ---------- Laternen ----------
  var LATERNE_FPS = 6, LATERNE_FRAMES = 3, HELL = [0.80, 1.00, 0.55];
  var Laternen = {
    ids: [], frame: -1,
    init: function () {
      this.ids = (S.licht && S.licht.liste ? S.licht.liste() : []).filter(function (q) { return q.typ === 'laterne'; }).map(function (q) { return q.id; });
      this.frame = -1;
    },
    tick: function (ms) {
      // gleiche Rechnung wie core.js (zeit = schritte / 60): Schritte aus ms zurückgewinnen, sonst Rundungsabweichung an Frame-Grenzen
      var schritte = Math.round(ms * 60 / 1000), f = Math.floor(schritte / 60 * LATERNE_FPS) % LATERNE_FRAMES;
      if (f === this.frame) return;
      this.frame = f;
      for (var i = 0; i < this.ids.length; i++) S.licht.set(this.ids[i], HELL[f]);
    },
    zeichne: function () {},
    clear: function () { this.ids = []; this.frame = -1; }
  };

  // ---------- Blätter ----------
  var BLATT_FPS = 12, BLATT_ANZAHL = 6, BLATT_FARBEN = [PAL.orange, PAL.laub3, PAL.rot1];
  var Blaetter = {
    liste: [], b: 0, h: 0, schritt: -1, zufall: null,
    neu: function (oben) {
      var r = this.zufall;
      return { x: 8 + r() * (this.b - 16), y: oben ? -4 - r() * 40 : r() * this.h, v: 0.35 + r() * 0.35, ph: r() * 6.28, c: BLATT_FARBEN[Math.floor(r() * 3)] };
    },
    init: function (karte) {
      this.b = karte.pxBreite; this.h = karte.pxHoehe; this.zufall = rng(1907); this.schritt = -1; this.liste = [];
      if (dekoDaten(karte).blaetter !== true) return;
      for (var i = 0; i < BLATT_ANZAHL; i++) this.liste.push(this.neu(false));
    },
    tick: function (ms) {
      var s = Math.floor(ms / 1000 * BLATT_FPS);
      if (this.schritt < 0) { this.schritt = s; return; }
      while (this.schritt < s) {                     // je 12-fps-Schritt; nach Pause kein Sprung (Spielzeit stand)
        this.schritt++;
        for (var i = 0; i < this.liste.length; i++) {
          var l = this.liste[i]; l.y += l.v; l.ph += 0.25;
          if (l.y > this.h + 4) this.liste[i] = this.neu(true);
        }
      }
    },
    zeichne: function (ctx, k) {
      for (var i = 0; i < this.liste.length; i++) {
        var l = this.liste[i], x = l.x + Math.round(Math.sin(l.ph) * 3);
        px(ctx, k, x, l.y, 2, 2, l.c); px(ctx, k, x + (Math.sin(l.ph) > 0 ? 2 : -1), l.y + 1, 1, 1, l.c);
      }
    },
    clear: function () { this.liste = []; this.schritt = -1; }
  };

  // ---------- Dampf ----------
  var DAMPF_FPS = 6, DAMPF_LEBEN = 9;           // Schritte bis ein Puff verschwindet (1,5 s)
  var Dampf = {
    punkte: [], schritt: -1,
    init: function (karte) {
      var d = dekoDaten(karte).dampf;
      this.punkte = Array.isArray(d) ? d.filter(function (p) { return p && zahl(p.x) && zahl(p.y); }) : [];
      this.schritt = -1;
    },
    tick: function (ms) { if (this.punkte.length) this.schritt = Math.floor(ms / 1000 * DAMPF_FPS); },
    zeichne: function (ctx, k) {
      if (this.schritt < 0) return;
      for (var q = 0; q < this.punkte.length; q++) {
        var o = this.punkte[q];
        for (var p = 0; p < 3; p++) {              // 3 Puffs zeitversetzt, steigen von (x, y) auf
          var a = (this.schritt + p * 3) % DAMPF_LEBEN, x = o.x - 4 + p * 4 + ((a >> 1) % 2 ? 1 : 0), y = o.y - 2 - a * 2;
          px(ctx, k, x, y, a < 3 ? 2 : 3, 2, a < 6 ? PAL.stein2 : PAL.stein1);
        }
      }
    },
    clear: function () { this.punkte = []; this.schritt = -1; }
  };

  // ---------- Katze ----------
  var KATZE_FPS = 4;
  var Katze = {
    aktiv: false, platz: null, schritt: -1, x: 0, ziel: 0, blick: 1, pause: 0, frame: 0, zufall: null,
    init: function (karte) {
      var p = dekoDaten(karte).katze;
      this.aktiv = !!(p && zahl(p.x) && zahl(p.y) && zahl(p.w) && zahl(p.h) && p.w > 0 && p.h > 0);
      this.platz = this.aktiv ? { x0: p.x, x1: p.x + p.w, y: p.y + p.h } : null;
      this.zufall = rng(1911); this.schritt = -1; this.blick = 1; this.pause = 12; this.frame = 0;
      this.x = this.aktiv ? Math.round(p.x + p.w / 2) : 0; this.ziel = this.x;
    },
    tick: function (ms) {
      if (!this.aktiv) return;
      var s = Math.floor(ms / 1000 * KATZE_FPS);
      if (this.schritt < 0) { this.schritt = s; return; }
      while (this.schritt < s) {
        this.schritt++; this.frame++;
        if (this.x !== this.ziel) { var d = this.ziel > this.x ? 1 : -1; this.blick = d; this.x += d * 2; if ((this.ziel - this.x) * d < 0) this.x = this.ziel; }
        else if (--this.pause <= 0) {               // nach 3–6 s Sitzen ein paar Schritte innerhalb des Platzes
          var rand = 8, breite = Math.max(0, this.platz.x1 - this.platz.x0 - 2 * rand);   // Katze ±7 px um x bleibt im Platz
          this.ziel = Math.round(this.platz.x0 + (breite > 0 ? rand + this.zufall() * breite : (this.platz.x1 - this.platz.x0) / 2)); this.pause = 12 + Math.floor(this.zufall() * 13);
        }
      }
    },
    zeichne: function (ctx, k) {
      if (!this.aktiv) return;
      var b = this.blick, x = this.x, y = this.platz.y, laeuft = this.x !== this.ziel, f = this.frame % 2, c = PAL.nacht;
      function r(dx, dy, w, h, col) { px(ctx, k, b > 0 ? x + dx : x - dx - w, y + dy, w, h, col || c); }
      if (laeuft) {
        r(-5, -6, 9, 4); r(3, -9, 4, 4); r(3, -10, 1, 1); r(6, -10, 1, 1); r(5, -8, 1, 1, PAL.gelb);   // Körper, Kopf, Ohren, Auge
        r(-4, -2, 1, 2 - f); r(-2, -2, 1, 1 + f); r(1, -2, 1, 2 - f); r(3, -2, 1, 1 + f);              // Beine im Wechsel
        r(-7, -8 + f, 2, 1); r(-6, -7 + f, 1, 1);                                                      // Schwanz
      } else {
        r(-3, -7, 6, 7); r(-2, -11, 5, 4); r(-2, -12, 1, 1); r(2, -12, 1, 1);                         // sitzend: Körper, Kopf, Ohren
        r(-1, -10, 1, 1, PAL.gelb); r(1, -10, 1, 1, PAL.gelb);                                       // Augen
        if (f) { r(-6, -2, 3, 1); r(-7, -4, 1, 2); } else { r(-6, -1, 3, 1); r(-6, -3, 1, 2); }        // Schwanz wippt (Idle)
      }
    },
    clear: function () { this.aktiv = false; this.platz = null; this.schritt = -1; }
  };

  var TEILE = [Laternen, Blaetter, Dampf, Katze];
  S.deko = {
    init: function (karte) { for (var i = 0; i < TEILE.length; i++) TEILE[i].init(karte); },
    tick: function (ms) { for (var i = 0; i < TEILE.length; i++) TEILE[i].tick(ms); },
    zeichne: function (ctx, k) {
      ctx.save();
      for (var i = 0; i < TEILE.length; i++) TEILE[i].zeichne(ctx, k);
      ctx.restore();
    },
    clear: function () { for (var i = 0; i < TEILE.length; i++) TEILE[i].clear(); },
    _teile: { laternen: Laternen, blaetter: Blaetter, dampf: Dampf, katze: Katze }   // nur für Tests
  };
})();
