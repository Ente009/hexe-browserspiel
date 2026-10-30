/* HEX-025 Tageszeit: Tag-Nacht-Zyklus aus der Spielzeit (zustand.schritte, 60 Logikschritte je s; steht in der Pause).
 * Boss 22.10.: ein Zyklus = 20 echte Minuten Spielzeit, Start am frühen Abend; Zeit läuft über Kartenwechsel weiter.
 * HP 22.10./29.10.: Dunkelung (soft-light, 0,50 = neutral) Tag 0,50 · Abend 0,40 (= Bild vor HEX-025) · Nacht 0,30.
 * Verlauf mit Plateaus, Übergänge mit smoothstep (Sekunden im Zyklus):
 *   0–180 Abend 0,40 (Start) · 180–300 → 0,30 · 300–660 Nacht 0,30 · 660–780 → 0,50 · 780–1080 Tag 0,50 · 1080–1200 → 0,40
 * Nacht-Faktor für Lichtquellen: 1 + 0,25 · Anteil der Dunkelung unter 0,40 (0,40 → 1, 0,30 → 1,25; tagsüber 1).
 * Nur Rechnen, kein Zustand: core.js ruft bei Animationen an Spiel.tageszeit.bei(schritte) und gibt das Ergebnis an
 * Spiel.licht.setzeTageszeit; licht.js übernimmt es im nächsten 12-fps-Lichttakt. Animationen aus: kein Aufruf → fest 0,40.
 *   Spiel.tageszeit.bei(schritte) -> { s, ambient, faktor }   s = Sekunde im Zyklus
 *   Spiel.tageszeit.ambient(s), faktor(ambient), ZYKLUS_S, PUNKTE, SPIELSCHRITTE_JE_S
 */
(function () {
  'use strict';
  var S = window.Spiel = window.Spiel || {};
  var SPIELSCHRITTE_JE_S = 60, ZYKLUS_S = 1200;
  var ABEND = 0.40, NACHT = 0.30, TAG = 0.50, NACHT_FAKTOR = 1.25;
  // [Sekunde, Dunkelung]; zwischen zwei Punkten mit verschiedenem Wert: smoothstep, sonst Plateau
  var PUNKTE = [[0, ABEND], [180, ABEND], [300, NACHT], [660, NACHT], [780, TAG], [1080, TAG], [1200, ABEND]];

  function smooth(t) { return t * t * (3 - 2 * t); }
  function ambient(s) {
    s = ((s % ZYKLUS_S) + ZYKLUS_S) % ZYKLUS_S;
    for (var i = 1; i < PUNKTE.length; i++) {
      var a = PUNKTE[i - 1], b = PUNKTE[i];
      if (s <= b[0]) return a[1] + (b[1] - a[1]) * smooth((s - a[0]) / (b[0] - a[0]));
    }
    return ABEND;
  }
  function faktor(amb) {
    var anteil = Math.max(0, Math.min(1, (ABEND - amb) / (ABEND - NACHT)));
    return 1 + (NACHT_FAKTOR - 1) * anteil;
  }
  function bei(schritte) {
    var s = (schritte / SPIELSCHRITTE_JE_S) % ZYKLUS_S, a = ambient(s);
    return { s: s, ambient: a, faktor: faktor(a) };
  }
  S.tageszeit = { bei: bei, ambient: ambient, faktor: faktor, ZYKLUS_S: ZYKLUS_S, PUNKTE: PUNKTE, SPIELSCHRITTE_JE_S: SPIELSCHRITTE_JE_S };
})();
