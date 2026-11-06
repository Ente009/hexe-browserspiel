/* HEX-026 Inventar: Kräuter sammeln + Zähler (HP). Nur für diese Sitzung im Speicher, kein Speichern (kommt mit HEX-027).
   Schnittstelle:
   - Spiel.inventar.SORTEN = ['mondkraut', 'gluehpilz', 'nebelfarn'] (feste Reihenfolge: HUD und Sheet)
   - sammle(karteId, zone) zählt zone.daten.gegenstand +1 und merkt sich karteId + zone.id (aufgerufen von interaktion.js, aktion sammeln)
   - schonGesammelt(karteId, zoneId) → true: Zone bleibt bei erneutem Betreten der Karte weg (interaktion.setzeKarte)
   - anzahl(sorte), stand() → {mondkraut: n, …}
   - zeichneKraeuter(ctx, kamera, zonen): offene sammeln-Zonen mit gegenstand in Kartenkoordinaten (nach Boden, vor Objekten)
   - zeichneHud(ctx): oben links, je Sorte Symbol + Zahl, eine Sorte erst ab dem ersten Fund; ohne Fund wird nichts gezeichnet.
   Grafik (Unter): assets/spiel/kraeuter.png, 48×24: Zeile 0 = Karte 16×16 je Sorte (x = 16·i, Anker unten mittig = Fußpunkt der Zone),
   darunter bei y 16 HUD-Symbol 8×8 je Sorte (x = 16·i). Erst angefragt, wenn eine Karte Kräuter hat. Fehlt sie: Platzhalter, Spiel läuft. */
(function () {
  'use strict';
  var S = window.Spiel = window.Spiel || {};
  var SORTEN = ['mondkraut', 'gluehpilz', 'nebelfarn'];
  var PFAD = 'assets/spiel/kraeuter.png';
  // Platzhalter-Farben je Sorte: [Stiel/Blatt, Kopf]
  var FARBE = { mondkraut: ['#5f8f4a', '#dfe6ff'], gluehpilz: ['#e8d8b0', '#ff9a3c'], nebelfarn: ['#4e7a5a', '#a9c8c0'] };
  var zahl = {}, weg = {}, bild = null, bildStatus = 'nein';   // nein | laedt | da | fehlt
  SORTEN.forEach(function (s) { zahl[s] = 0; });

  function schluessel(k, id) { return k + '\u0000' + id; }
  function sammle(karteId, z) {
    var s = z && z.daten && z.daten.gegenstand;
    if (SORTEN.indexOf(s) < 0) return false;
    var key = schluessel(karteId, z.id);
    if (weg[key]) return false;   // doppelt zählen geht nicht
    weg[key] = true; zahl[s]++;
    return true;
  }
  function schonGesammelt(karteId, zoneId) { return !!weg[schluessel(karteId, zoneId)]; }
  function anzahl(s) { return zahl[s] || 0; }
  function stand() { var o = {}; SORTEN.forEach(function (s) { o[s] = zahl[s]; }); return o; }

  function ladeBild() {
    if (bildStatus !== 'nein') return;
    bildStatus = 'laedt';
    var b = new Image();
    b.onload = function () { bild = b; bildStatus = 'da'; };
    b.onerror = function () { bildStatus = 'fehlt'; };
    b.src = PFAD;
  }
  function istKraut(z) { return z.aktion === 'sammeln' && SORTEN.indexOf(z.daten && z.daten.gegenstand) >= 0; }

  function platzhalterKarte(ctx, s, x, y) {   // x, y = Fußpunkt (unten mittig), ca. 9×10 px
    var f = FARBE[s];
    ctx.fillStyle = f[0];
    if (s === 'gluehpilz') { ctx.fillRect(x - 1, y - 5, 2, 5); ctx.fillStyle = f[1]; ctx.fillRect(x - 4, y - 8, 8, 3); ctx.fillRect(x - 3, y - 9, 6, 1); return; }
    if (s === 'nebelfarn') { ctx.fillRect(x, y - 9, 1, 9); ctx.fillRect(x - 4, y - 7, 4, 1); ctx.fillRect(x + 1, y - 5, 4, 1); ctx.fillRect(x - 4, y - 3, 4, 1); ctx.fillStyle = f[1]; ctx.fillRect(x - 1, y - 10, 3, 1); return; }
    ctx.fillRect(x, y - 6, 1, 6); ctx.fillRect(x - 3, y - 3, 3, 1); ctx.fillRect(x + 1, y - 4, 3, 1);
    ctx.fillStyle = f[1]; ctx.fillRect(x - 2, y - 9, 5, 3); ctx.fillRect(x - 1, y - 10, 3, 1);
  }
  function platzhalterHud(ctx, s, x, y) {     // 8×8 ab x, y
    var f = FARBE[s];
    ctx.fillStyle = f[1]; ctx.fillRect(x + 1, y + 1, 6, 4);
    ctx.fillStyle = f[0]; ctx.fillRect(x + 3, y + 5, 2, 3);
  }

  function zeichneKraeuter(ctx, kamera, zonen) {
    (zonen || []).forEach(function (z) {
      if (z.aus || !istKraut(z)) return;
      ladeBild();
      var s = z.daten.gegenstand, i = SORTEN.indexOf(s), x = Math.round(z.x + z.w / 2 - kamera.x), y = Math.round(z.y + z.h - kamera.y);
      if (bild) ctx.drawImage(bild, 16 * i, 0, 16, 16, x - 8, y - 16, 16, 16);
      else platzhalterKarte(ctx, s, x, y);
    });
  }

  function zeichneHud(ctx) {
    var x = 4, y = 4, n = 0;
    SORTEN.forEach(function (s) { if (zahl[s] > 0) n++; });
    if (!n) return;
    ctx.font = '8px monospace';
    var w = 0; SORTEN.forEach(function (s) { if (zahl[s] > 0) w += 12 + Math.ceil(ctx.measureText(String(zahl[s])).width) + 6; });
    ctx.fillStyle = 'rgba(20, 14, 24, 0.85)'; ctx.fillRect(x, y, w + 4, 14);
    ctx.fillStyle = '#c8873a'; ctx.fillRect(x, y, w + 4, 1); ctx.fillRect(x, y + 13, w + 4, 1); ctx.fillRect(x, y, 1, 14); ctx.fillRect(x + w + 3, y, 1, 14);
    var cx = x + 4;
    SORTEN.forEach(function (s, i) {
      if (!zahl[s]) return;
      if (bild) ctx.drawImage(bild, 16 * i, 16, 8, 8, cx, y + 3, 8, 8); else platzhalterHud(ctx, s, cx, y + 3);
      ctx.fillStyle = '#f3dca0'; ctx.textBaseline = 'middle'; ctx.fillText(String(zahl[s]), cx + 11, y + 7.5); ctx.textBaseline = 'alphabetic';
      cx += 12 + Math.ceil(ctx.measureText(String(zahl[s])).width) + 6;
    });
  }

  S.inventar = {
    SORTEN: SORTEN.slice(), sammle: sammle, schonGesammelt: schonGesammelt, anzahl: anzahl, stand: stand,
    zeichneKraeuter: zeichneKraeuter, zeichneHud: zeichneHud,
    get bildStatus() { return bildStatus; }
  };
})();
