/* HEX-017 Standorte: zentrale Liste aller Standorte (Plan HEX-010 §2) mit Status und Einstiegspunkten.
   status "offen" = Karte assets/spiel/karten/<id>.json vorhanden und betretbar; "gesperrt" = noch keine Karte,
   in der Werkstatt als sichtbare Absperrung (Objekt mit gesperrt:<id>) + Zone aktion "gesperrt".
   einstiege = Namen der Einstiegspunkte, die die Karte haben muss (prüft karte.js). Wechsel selbst: core.js wechsleStandort(). */
(function () {
  'use strict';
  var LISTE = {
    werkstatt: { name: 'Hexenwerkstatt', status: 'offen', einstiege: ['start', 'von_waldpfad'] },
    waldpfad:  { name: 'Waldpfad', status: 'offen', platzhalter: true, einstiege: ['start', 'von_werkstatt'] },
    flussufer: { name: 'Flussufer', status: 'gesperrt', einstiege: [] },
    hoehle:    { name: 'Höhle', status: 'gesperrt', einstiege: [] },
    ruinen:    { name: 'Ruinen', status: 'gesperrt', einstiege: [] }
  };
  function gib(id) { return Object.prototype.hasOwnProperty.call(LISTE, id) ? LISTE[id] : null; }
  window.Spiel = window.Spiel || {};
  window.Spiel.standorte = {
    liste: LISTE,
    gib: gib,
    offen: function (id) { var s = gib(id); return !!s && s.status === 'offen'; },
    gesperrt: function (id) { var s = gib(id); return !!s && s.status === 'gesperrt'; }
  };
})();
