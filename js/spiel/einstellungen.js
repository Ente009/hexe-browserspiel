/* HEX-019a Spiel-Einstellungen: liest die Titel-Einstellung „Animationen“ (nur lesen, Titel-Code unverändert).
 * Quelle: js/main.js speichert seinen state (ohne musicOn) als JSON unter localStorage 'hexe-titel-settings', Feld animationsOn (bool).
 * Gleiche Regel wie main.js (F-021 d): state = Object.assign(defaults, JSON.parse(gespeichert) || {}), danach Wahrheitswert.
 * → Feld animationsOn vorhanden (auch 0, null, "", "false") = gespeichert, gilt nach JS-Wahrheitswert (0/null/"" aus, "false" an).
 * Fehlt das Feld, ist der Wert kein Objekt, JSON kaputt oder localStorage gesperrt → Standard wie main.js:
 * an, außer das System verlangt „Bewegung reduzieren“ (prefers-reduced-motion).
 * Gelesen einmal beim Laden von spiel.html; Umschalten im Titel wirkt beim nächsten Öffnen des Spiels.
 *   Spiel.einstellungen.animationen   bool
 *   Spiel.einstellungen.quelle        'gespeichert' | 'standard'  (für Tests)
 */
(function () {
  'use strict';
  var S = window.Spiel = window.Spiel || {};
  var KEY = 'hexe-titel-settings';
  var reduziert = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var wert = null;
  try {
    var d = JSON.parse(localStorage.getItem(KEY));
    d = d || {};
    if (typeof d === 'object' && Object.prototype.hasOwnProperty.call(d, 'animationsOn')) wert = !!d.animationsOn;
  } catch (e) { /* kaputt oder gesperrt → Standard */ }
  S.einstellungen = { animationen: wert === null ? !reduziert : wert, quelle: wert === null ? 'standard' : 'gespeichert' };
})();
