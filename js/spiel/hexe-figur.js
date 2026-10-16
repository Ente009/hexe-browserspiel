/* HEX-013 Hexenfigur: Bewegung und achsweise Kollision (Plan HEX-010 §2).
   - x/y = Fußpunkt (Mitte unten) in Weltpixeln; Kollision nur mit der Fußbox (10×6 px, Definition in karte.js).
   - Eingabe-Richtung ist schon normalisiert (diagonal nicht schneller), konstant 60 px/s, sofortiger Start/Stopp.
   - Erst x, dann y getrennt: an Wänden gleiten statt hängen bleiben.
   Schnittstelle für Sprites (HEX-014): figur.richtung ('hoch'|'runter'|'links'|'rechts'), figur.laeuft (bool),
   figur.laufzeit (ms seit Laufbeginn, für Animationsbilder). Zeichnen über Spiel.hexeFigur.zeichne(ctx, figur, kamera);
   HEX-014 ersetzt nur diese Funktion, Bewegung/Kollision bleiben hier. */
(function () {
  'use strict';
  var TEMPO = 60;                 // px/s
  var FUSS = window.Spiel.karte.FUSS;   // gemeinsame Fußbox aus karte.js (F-011)
  var BREITE = 14, HOEHE = 32;    // Platzhalter-Größe (Hexe ca. 32 px, Entscheidung Boss)
  var TEIL = 8;                   // Kontakt auf 1/8 px genau annähern

  function neu(x, y, richtung) {
    return { x: x, y: y, w: BREITE, h: HOEHE, richtung: richtung || 'runter', laeuft: false, laufzeit: 0 };
  }
  function fussRechteck(f, x, y) { return window.Spiel.karte.fussRechteck(x, y); }

  // Eine Achse bewegen; bei Kollision so weit wie möglich heranrücken.
  // F-011: Erlaubt ist ein Schritt nur, wenn die Fußbox danach frei ist oder (falls sie schon überlappt)
  // die Überlappung echt kleiner wird – also nur heraus, nie tiefer, nie hindurch, nie aus der Karte (außen = Wand).
  function erlaubt(karte, alt, x, y) {
    var neu = karte.fussUeberlappung(x, y);
    return neu === 0 || neu < alt - 1e-9;
  }
  function achse(f, karte, dx, dy) {
    if (!dx && !dy) return;
    var alt = karte.fussUeberlappung(f.x, f.y);
    for (var i = TEIL; i > 0; i--) {
      var tx = f.x + dx * i / TEIL, ty = f.y + dy * i / TEIL;
      if (erlaubt(karte, alt, tx, ty)) { f.x = tx; f.y = ty; return; }
    }
  }

  // dt in ms; r = {x,y} normalisierte Richtung
  function bewege(f, karte, r, dt) {
    var s = TEMPO * dt / 1000;
    var schritte = Math.max(1, Math.ceil(s));      // nie mehr als 1 px je Teilschritt (kein Tunneln)
    for (var i = 0; i < schritte; i++) {
      achse(f, karte, r.x * s / schritte, 0);
      achse(f, karte, 0, r.y * s / schritte);
    }
    var laeuft = !!(r.x || r.y);
    if (laeuft) {
      // Blickrichtung: bei diagonal zählt die waagrechte Achse
      f.richtung = r.x > 0 ? 'rechts' : r.x < 0 ? 'links' : r.y < 0 ? 'hoch' : 'runter';
      f.laufzeit = f.laeuft ? f.laufzeit + dt : 0;
    } else {
      f.laufzeit = 0;
    }
    f.laeuft = laeuft;
  }

  // Platzhalter: Körper-Rechteck, kleiner Punkt zeigt die Blickrichtung (Pixel ganzzahlig)
  function zeichne(ctx, f, k) {
    var x = Math.round(f.x - f.w / 2) - k.x, y = Math.round(f.y - f.h) - k.y;
    ctx.fillStyle = '#c8a0e0';
    ctx.fillRect(x, y, f.w, f.h);
    ctx.fillStyle = '#2a1838';
    var d = { hoch: [6, 1], runter: [6, 27], links: [1, 14], rechts: [11, 14] }[f.richtung];
    ctx.fillRect(x + d[0], y + d[1], 2, 2);
  }

  window.Spiel = window.Spiel || {};
  window.Spiel.hexeFigur = { neu: neu, bewege: bewege, zeichne: zeichne, fussRechteck: fussRechteck, TEMPO: TEMPO, FUSS: FUSS };
})();
