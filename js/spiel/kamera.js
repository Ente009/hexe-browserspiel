/* HEX-011 Kamera: folgt einem Ziel, an den Kartenrand geklemmt, ganzzahlige Positionen. */
(function () {
  'use strict';
  var kamera = {
    x: 0, y: 0, breite: 480, hoehe: 320,
    // ziel {x,y} = Mittelpunkt in Weltpixeln; karteB/karteH in Pixeln
    folge: function (ziel, karteB, karteH) {
      var x = Math.round(ziel.x - kamera.breite / 2);
      var y = Math.round(ziel.y - kamera.hoehe / 2);
      // Karte kleiner als Bild: zentrieren; sonst klemmen
      kamera.x = karteB <= kamera.breite ? Math.round((karteB - kamera.breite) / 2) : Math.max(0, Math.min(x, karteB - kamera.breite));
      kamera.y = karteH <= kamera.hoehe ? Math.round((karteH - kamera.hoehe) / 2) : Math.max(0, Math.min(y, karteH - kamera.hoehe));
    }
  };
  window.Spiel = window.Spiel || {};
  window.Spiel.kamera = kamera;
})();
