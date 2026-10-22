/* HEX-016 Interaktion: Zonen aus der Karte (interaktionen[]), Erkennung über die Fußbox der Figur,
   Hinweis „E – <text>“, E/Touch-E löst genau einmal pro Druck aus, Handler je Zonen-id (sonst je aktion).
   Einfache Textblase (kein Dialogsystem). */
(function () {
  'use strict';
  var S = window.Spiel = window.Spiel || {};
  var BREITE = 480, HOEHE = 320;
  var BLASE_MS = 3000;

  var nachId = {}, nachAktion = {};
  var zonen = [], aktiv = null, blase = null, zeit = 0;
  var zaehler = { ausgeloest: 0 };

  function ueberlappt(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

  // Handler je id (Vorrang) oder je aktion (z. B. 'sprechen', 'sammeln'). fn(zone, api)
  function registriere(id, fn) { nachId[id] = fn; }
  function registriereAktion(aktion, fn) { nachAktion[aktion] = fn; }

  // Zonen der Karte übernehmen (Kopie, Karte bleibt unverändert)
  function setzeKarte(karte) {
    zonen = ((karte && karte.interaktionen) || []).map(function (z) {
      return { id: z.id, x: z.x, y: z.y, w: z.w, h: z.h, text: z.text, aktion: z.aktion, daten: z, aus: false };
    });
    aktiv = null; blase = null;
  }

  // Zone in Reichweite: Fußbox überlappt die Zone; bei mehreren die nächste (Fußpunkt zur Zonenmitte)
  function finde(x, y) {
    var box = S.karte.fussRechteck(x, y), best = null, bd = Infinity;
    zonen.forEach(function (z) {
      if (z.aus || !ueberlappt(box, z)) return;
      var dx = z.x + z.w / 2 - x, dy = z.y + z.h / 2 - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = z; }
    });
    return best;
  }

  var api = {
    sage: function (text, ms) { blase = { text: String(text), bis: zeit + (ms || BLASE_MS) }; },
    entferne: function (z) { z.aus = true; if (aktiv === z) aktiv = null; }
  };

  function loese(z) {
    var fn = nachId[z.id] || nachAktion[z.aktion];
    zaehler.ausgeloest++;
    if (fn) fn(z, api); else console.warn('Interaktion ohne Handler: ' + z.id);
  }

  // Je Logikschritt: Reichweite prüfen; e = E in diesem Schritt neu gedrückt
  function aktualisiere(figur, e, dt) {
    zeit += dt || 0;
    aktiv = figur ? finde(figur.x, figur.y) : null;
    if (blase && (zeit >= blase.bis)) blase = null;
    if (e && aktiv) loese(aktiv);
    return aktiv;
  }

  function hinweisText() { return aktiv ? 'E – ' + aktiv.text : null; }

  function kasten(ctx, text, mx, y) {
    ctx.font = '8px monospace';
    var w = Math.ceil(ctx.measureText(text).width) + 10, x = Math.round(Math.max(2, Math.min(BREITE - w - 2, mx - w / 2)));
    ctx.fillStyle = 'rgba(20, 14, 24, 0.85)'; ctx.fillRect(x, y, w, 14);
    ctx.fillStyle = '#c8873a'; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + 13, w, 1); ctx.fillRect(x, y, 1, 14); ctx.fillRect(x + w - 1, y, 1, 14);
    ctx.fillStyle = '#f3dca0'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 5, y + 7.5); ctx.textBaseline = 'alphabetic';
  }

  // Bildschirm-UI: Textblase über der Figur, Hinweis unten mittig
  function zeichne(ctx, figur, kamera) {
    if (blase && figur) kasten(ctx, blase.text, figur.x - kamera.x, Math.max(2, Math.round(figur.y - kamera.y) - 52));
    var h = hinweisText();
    if (h) kasten(ctx, h, BREITE / 2, HOEHE - 22);
  }

  function zeichneDebug(ctx, kamera) {
    zonen.forEach(function (z) {
      ctx.fillStyle = z.aus ? 'rgba(120,120,120,0.3)' : 'rgba(0, 220, 255, 0.35)';
      ctx.fillRect(z.x - kamera.x, z.y - kamera.y, z.w, z.h);
    });
  }

  // Standard-Handler (satz aus der Karte, Pflicht laut karte.js, F-017/F-018):
  // sprechen = Textblase; sammeln = Textblase, danach verschwindet die Zone
  registriereAktion('sprechen', function (z, a) { a.sage(z.daten.satz); });
  registriereAktion('sammeln', function (z, a) { a.sage(z.daten.satz); a.entferne(z); });

  S.interaktion = {
    registriere: registriere, registriereAktion: registriereAktion, setzeKarte: setzeKarte,
    aktualisiere: aktualisiere, zeichne: zeichne, zeichneDebug: zeichneDebug, finde: finde,
    hinweisText: hinweisText,
    get aktiv() { return aktiv; }, get blase() { return blase && blase.text; }, get zonen() { return zonen; }, zaehler: zaehler
  };
})();
