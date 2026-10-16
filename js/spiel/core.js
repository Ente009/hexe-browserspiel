/* HEX-011 Kern: rAF-Schleife mit fester Logik-Schrittweite (60 Hz) und dt-Begrenzung, Zustand, Pause, Zeichnen.
   Platzhalter-Rechteck bewegt sich, um die Kamera zu zeigen (echte Hexe + Kollision beim Laufen: HEX-013). */
(function () {
  'use strict';
  var S = window.Spiel;
  var BREITE = 480, HOEHE = 320;
  var SCHRITT = 1000 / 60;      // ms je Logikschritt
  var DT_MAX = 100;             // ms, wie TitleScreen.onTick in main.js
  var TEMPO = 60;               // px/s (Plan §2, Vorschlag)

  var canvas = document.getElementById('spiel');
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  var elPause = document.getElementById('pause');
  var btnWeiter = document.getElementById('btn-weiter');

  var karte = null, KB = 0, KH = 0;   // HEX-012: wird per Spiel.karte.lade('test') gesetzt
  var zustand = {
    pausiert: false,
    figur: { x: 0, y: 0, w: 12, h: 16 },
    schritte: 0,
    faktor: 1
  };

  // ---------- Ganzzahlige Skalierung ----------
  // Faktor ganzzahlig in Gerätepixeln (devicePixelRatio), damit Handys hochkant nicht abschneiden.
  function skaliere() {
    var dpr = window.devicePixelRatio || 1;
    var w = window.innerWidth * dpr, h = window.innerHeight * dpr;
    var f = Math.max(1, Math.floor(Math.min(w / BREITE, h / HOEHE)));
    zustand.faktor = f;
    canvas.style.width = (BREITE * f / dpr) + 'px';
    canvas.style.height = (HOEHE * f / dpr) + 'px';
  }
  window.addEventListener('resize', skaliere);
  skaliere();

  // ---------- Pause ----------
  function setzePause(an) {
    zustand.pausiert = an;
    elPause.hidden = !an;
    if (an) btnWeiter.focus(); else canvas.focus && canvas.focus();
  }
  btnWeiter.addEventListener('click', function () { setzePause(false); });

  // ---------- Logik ----------
  function update(dt) {
    if (!karte) return;
    var r = S.eingabe.richtung(), f = zustand.figur, s = TEMPO * dt / 1000;
    f.x = Math.max(f.w / 2, Math.min(KB - f.w / 2, f.x + r.x * s));
    f.y = Math.max(f.h / 2, Math.min(KH - f.h / 2, f.y + r.y * s));
    S.kamera.folge(f, KB, KH);
    zustand.schritte++;
  }

  // ---------- Zeichnen ----------
  function zeichne() {
    var k = S.kamera, t, x, y;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, BREITE, HOEHE);
    if (!karte) return;
    t = karte.tile;
    var x0 = Math.max(0, Math.floor(k.x / t)), x1 = Math.min(karte.breite, Math.ceil((k.x + BREITE) / t));
    var y0 = Math.max(0, Math.floor(k.y / t)), y1 = Math.min(karte.hoehe, Math.ceil((k.y + HOEHE) / t));
    for (y = y0; y < y1; y++) {
      for (x = x0; x < x1; x++) {
        // Platzhalter-Grafik: Boden Schachbrett, Wand-Tiles dunkler Stein (echte Grafik: HEX-015)
        ctx.fillStyle = karte.tileBlockiert(x, y) ? ((x + y) % 2 ? '#4a4038' : '#433a33') : ((x + y) % 2 ? '#2a3324' : '#26301f');
        ctx.fillRect(x * t - k.x, y * t - k.y, t, t);
      }
    }
    // Kartenrand sichtbar machen
    ctx.strokeStyle = '#7a5a2a';
    ctx.strokeRect(0.5 - k.x, 0.5 - k.y, KB - 1, KH - 1);
    // Objekte (Platzhalter): Fuß als Kiste
    karte.fuesse.forEach(function (f) { ctx.fillStyle = '#6b4a2a'; ctx.fillRect(Math.round(f.x) - k.x, Math.round(f.y) - k.y, f.w, f.h); });
    // Platzhalter-Figur (ganzzahlig gezeichnet)
    var f = zustand.figur;
    ctx.fillStyle = '#c8a0e0';
    ctx.fillRect(Math.round(f.x - f.w / 2) - k.x, Math.round(f.y - f.h / 2) - k.y, f.w, f.h);
    if (S.karte.debug) zeichneDebug(k, t);
  }

  // HEX-012: Kollisions-Debug-Ansicht (Taste K): blockierte Tiles rot, Objekt-Füße gelb, Rasterlinien
  function zeichneDebug(k, t) {
    var x, y;
    var x0 = Math.max(0, Math.floor(k.x / t)), x1 = Math.min(karte.breite, Math.ceil((k.x + BREITE) / t));
    var y0 = Math.max(0, Math.floor(k.y / t)), y1 = Math.min(karte.hoehe, Math.ceil((k.y + HOEHE) / t));
    ctx.fillStyle = 'rgba(255, 40, 40, 0.45)';
    for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) if (karte.tileBlockiert(x, y)) ctx.fillRect(x * t - k.x, y * t - k.y, t, t);
    ctx.fillStyle = 'rgba(255, 220, 0, 0.6)';
    karte.fuesse.forEach(function (f) { ctx.fillRect(Math.round(f.x) - k.x, Math.round(f.y) - k.y, f.w, f.h); });
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    for (x = x0; x <= x1; x++) ctx.fillRect(x * t - k.x, 0, 1, HOEHE);
    for (y = y0; y <= y1; y++) ctx.fillRect(0, y * t - k.y, BREITE, 1);
    ctx.fillStyle = '#fff'; ctx.font = '8px monospace'; ctx.fillText('KOLLISION (K)', 4, 10);
  }

  // ---------- Schleife ----------
  var letzte = null, rest = 0;
  function takt(jetzt) {
    if (S.eingabe.gedrueckt('pause')) setzePause(!zustand.pausiert);
    if (S.eingabe.gedrueckt('debug')) S.karte.debug = !S.karte.debug;
    if (letzte === null) letzte = jetzt;
    var dt = Math.min(DT_MAX, jetzt - letzte);
    letzte = jetzt;
    if (!zustand.pausiert) {
      rest += dt;
      while (rest >= SCHRITT) { update(SCHRITT); rest -= SCHRITT; }
    } else {
      rest = 0;
    }
    zeichne();
    requestAnimationFrame(takt);
  }

  S.zustand = zustand;
  requestAnimationFrame(takt);
  // HEX-012: Testkarte laden
  S.karte.lade('test').then(function (k) {
    karte = k; KB = k.pxBreite; KH = k.pxHoehe;
    zustand.figur.x = k.einstiege.start.x; zustand.figur.y = k.einstiege.start.y;
    S.kamera.folge(zustand.figur, KB, KH);
    S.aktuelleKarte = k;
  }, function (e) {
    var el = document.getElementById('spiel-fehler');
    el.textContent = e.message; el.hidden = false;
    console.error(e.message);
  });
})();
