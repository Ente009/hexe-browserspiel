/* Titelbildschirm – Lichtquellen (Block 3)
 *
 * Legt die festen Lichtquellen des Bilds über TitleScreen.light.add an (js/light.js).
 * Koordinaten in Originalpixeln (1536×1024). Alle Quellen ohne eigenes Flackern
 * (flicker 0): Kerzen und Feuer bekommen ihren Wert später über light.set aus dem
 * Kerzenmodul, bis dahin stehen sie ruhig auf rest. Der Kessel folgt dem Event 'blubb'.
 * Die Kugel steht leicht an (rest 0.35) und wird beim Aufleuchten auf 1 gesetzt.
 */
(function () {
  'use strict';

  var light = window.TitleScreen && window.TitleScreen.light;
  if (!light) return;

  var SOURCES = [
    { id: 'kessel',       x: 726,  y: 372, rx: 200, ry: 100, color: 'gruen', intensity: 0.55, rest: 1,    flicker: 0, event: 'blubb' },
    { id: 'kessel-feuer', x: 731,  y: 684, rx: 200, ry: 100, color: 'warm',  intensity: 0.597, rest: 0.922, flicker: 0 },
    { id: 'kerze-1',      x: 181,  y: 268, radius: 110,      color: 'warm',  intensity: 0.45, rest: 0.97, flicker: 0 },
    { id: 'kerze-2',      x: 395,  y: 600, radius: 100,      color: 'warm',  intensity: 0.45, rest: 0.97, flicker: 0 },
    { id: 'kerze-3',      x: 1421, y: 86,  radius: 120,      color: 'warm',  intensity: 0.40, rest: 0.97, flicker: 0 },  // Laterne
    { id: 'kerze-4',      x: 1450, y: 700, radius: 160,      color: 'warm',  intensity: 0.55, rest: 0.97, flicker: 0 },
    { id: 'mond',         x: 765,  y: 300, rx: 160, ry: 60,  color: 'kuehl', intensity: 0.40, rest: 1,    flicker: 0 },  // y 300: feste Grün/Kühl-Grenze
    { id: 'kugel',        x: 1360, y: 800, radius: 60,       color: 'kuehl', intensity: 0.45, rest: 0.35, flicker: 0 }
  ];

  for (var i = 0; i < SOURCES.length; i++) light.add(SOURCES[i]);
})();
