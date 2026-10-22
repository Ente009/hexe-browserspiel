/* HEX-011 Kern: rAF-Schleife mit fester Logik-Schrittweite (60 Hz) und dt-Begrenzung, Zustand, Pause, Zeichnen.
   HEX-015: Zeichnen Boden (Bild aus karte.boden) → Objekte + Hexe nach Fußpunkt-y sortiert (gleiches y: Objekt zuerst) → Ebene "ueber".
   Objekt-Sprites "<sheet>#<name>" aus assets/spiel/<sheet>.png + .json (Format sprites{name:{x,y,w,h,anker,frames,fps}}).
   Startkarte: werkstatt; ?karte=<id> lädt eine andere Karte (für Tests mit test.json).
   HEX-018: Licht (licht.js) nach den Objekten/Ebene ueber, vor Textblase, Debug und Abblende; Lichttakt aus der Spielzeit (steht in der Pause).
   HEX-017: Ausgänge (Fußbox überlappt zone) → wechsleStandort(ziel, einstieg) mit kurzer Abblende; Einstieg nur, wenn fussUeberlappung = 0. */
(function () {
  'use strict';
  var S = window.Spiel;
  var BREITE = 480, HOEHE = 320;
  var SCHRITT = 1000 / 60;      // ms je Logikschritt
  var DT_MAX = 100;             // ms, wie TitleScreen.onTick in main.js

  var canvas = document.getElementById('spiel');
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  var elPause = document.getElementById('pause');
  var btnWeiter = document.getElementById('btn-weiter');

  var START = new URLSearchParams(location.search).get('karte') || 'werkstatt';
  var karte = null, KB = 0, KH = 0;   // wird per Spiel.karte.lade(START) gesetzt
  var GRAFIK = 'assets/spiel/';
  var boden = null;                   // geladenes Bodenbild oder null (dann Platzhalter-Raster)
  var sheets = {};                    // HEX-015: name -> { meta, bild } (bild null bis geladen)

  // ---------- HEX-015 Grafik laden ----------
  function ladeBoden(pfad) {
    boden = null;
    if (typeof pfad !== 'string') return;
    var b = new Image();
    b.onload = function () { boden = b; };
    b.onerror = function () { console.warn('HEX-015: Bodenbild ' + pfad + ' fehlt, Platzhalter-Raster bleibt'); };
    b.src = pfad;
  }
  function ladeSheet(name) {
    if (sheets[name]) return;
    var sh = sheets[name] = { meta: null, bild: null };
    fetch(GRAFIK + name + '.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (m) {
      var b = new Image();
      b.onload = function () { sh.meta = m; sh.bild = b; };
      b.onerror = function () { console.warn('HEX-015: ' + m.bild + ' fehlt, Objekt-Platzhalter bleibt'); };
      b.src = GRAFIK + m.bild;    // bild relativ zur JSON
    }).catch(function (e) { console.warn('HEX-015: ' + name + '.json nicht ladbar (' + e.message + '), Objekt-Platzhalter bleibt'); });
  }
  function spriteVon(o) {
    if (typeof o.sprite !== 'string') return null;
    var t = o.sprite.split('#'), sh = sheets[t[0]];
    return sh && sh.bild && sh.meta.sprites[t[1]] ? { bild: sh.bild, s: sh.meta.sprites[t[1]] } : null;
  }
  // Zeichenliste: Ebene objekt + Hexe nach y sortiert (gleiches y: Objekt vor Hexe), danach Ebene ueber in Kartenreihenfolge
  function zeichenListe(objekte, figur) {
    var liste = [], ueber = [];
    objekte.forEach(function (o, i) { (o.ebene === 'ueber' ? ueber : liste).push({ o: o, y: o.y, n: i, hexe: false }); });
    liste.push({ o: figur, y: figur.y, n: objekte.length, hexe: true });
    liste.sort(function (a, b) { return a.y - b.y || (a.hexe - b.hexe) || (a.n - b.n); });
    return liste.concat(ueber.map(function (e) { e.ueber = true; return e; }));
  }
  var zustand = {
    pausiert: false,
    figur: S.hexeFigur.neu(0, 0),
    schritte: 0,
    faktor: 1,
    wechsel: null,     // HEX-017: { ziel, einstieg, t, phase 'aus'|'ein' } während der Abblende
    blende: 0,         // 0 = klar, 1 = schwarz
    wechsel_anzahl: 0
  };
  var BLENDE_MS = 150;            // je Richtung
  var ausgangSperre = false;      // nach Ankunft: erst wieder auslösen, wenn die Fußbox keine Ausgangszone mehr berührt

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
    var f = zustand.figur;
    if (zustand.wechsel) { blendeSchritt(dt); eDruck = false; zustand.schritte++; return; }   // HEX-017: während der Abblende keine Bewegung
    S.hexeFigur.bewege(f, karte, S.eingabe.richtung(), dt);   // HEX-013: achsweise Kollision
    pruefeAusgang(f);
    S.interaktion.aktualisiere(f, eDruck, dt);   // HEX-016: Hinweis in Reichweite, E einmal pro Druck
    eDruck = false;
    folgeKamera();
    zustand.schritte++;
  }

  // ---------- HEX-017 Standortwechsel ----------
  function ausgangAn(f) {
    var box = S.karte.fussRechteck(f.x, f.y);
    for (var i = 0; i < karte.ausgaenge.length; i++) {
      var z = karte.ausgaenge[i].zone;
      if (box.x < z.x + z.w && z.x < box.x + box.w && box.y < z.y + z.h && z.y < box.y + box.h) return karte.ausgaenge[i];
    }
    return null;
  }
  function pruefeAusgang(f) {
    var a = ausgangAn(f);
    if (!a) { ausgangSperre = false; return; }
    if (ausgangSperre) return;
    // F-019: genau ein Versuch je Betreten der Zone – Sperre sofort setzen, gilt bei Erfolg und Fehler;
    // frei erst, wenn die Fußbox keine Ausgangszone mehr berührt (betrete() setzt sie bei Ankunft neu)
    ausgangSperre = true;
    wechsleStandort(a.ziel, a.einstieg).catch(function () {});   // Fehler zeigt zeigeFehler() einmal
  }
  // Abblenden, Karte laden, Hexe auf Einstieg setzen, aufblenden. Promise<Karte>
  function wechsleStandort(ziel, einstieg) {
    if (zustand.wechsel) return Promise.reject(new Error('Wechsel läuft schon'));
    var w = zustand.wechsel = { ziel: ziel, einstieg: einstieg, t: 0, phase: 'aus', karte: null, fertig: null };
    var laden = S.karte.lade(ziel).then(function (k) { w.karte = k; return k; });
    return new Promise(function (ok, nein) {
      w.fertig = ok; w.nein = nein;
      laden.catch(function (e) { zustand.wechsel = null; zustand.blende = 0; zeigeFehler(e); nein(e); });
    });
  }
  function blendeSchritt(dt) {
    var w = zustand.wechsel;
    w.t += dt;
    if (w.phase === 'aus') {
      zustand.blende = Math.min(1, w.t / BLENDE_MS);
      if (w.t >= BLENDE_MS && w.karte) {
        try { betrete(w.karte, w.einstieg); } catch (e) { zustand.wechsel = null; zustand.blende = 0; zeigeFehler(e); w.nein(e); return; }
        w.phase = 'ein'; w.t = 0;
      }
    } else {
      zustand.blende = Math.max(0, 1 - w.t / BLENDE_MS);
      if (w.t >= BLENDE_MS) { zustand.wechsel = null; zustand.blende = 0; w.fertig(karte); }
    }
  }
  // Karte aktiv setzen und Hexe auf den Einstieg; nie in Kollision (dieselbe Regel wie Lader und Bewegung)
  function betrete(k, einstieg) {
    var e = k.einstiege[einstieg];
    if (!e) throw new Error('Karte "' + k.id + '": einstiege.' + einstieg + ' fehlt');
    var tiefe = k.fussUeberlappung(e.x, e.y);
    if (tiefe > 0) throw new Error('Karte "' + k.id + '": einstiege.' + einstieg + ' (' + e.x + ',' + e.y + ') liegt in Kollision (' + tiefe + ' px²) – nicht gesetzt');
    ladeBoden(k.daten.boden);
    k.objekte.forEach(function (o) { if (typeof o.sprite === 'string') ladeSheet(o.sprite.split('#')[0]); });
    karte = k; KB = k.pxBreite; KH = k.pxHoehe;
    S.interaktion.setzeKarte(k);
    S.licht.setzeKarte(k);   // HEX-018: Lichtquellen aus den Kartenobjekten
    zustand.figur = S.hexeFigur.neu(e.x, e.y, e.richtung);
    ausgangSperre = !!ausgangAn(zustand.figur);
    zustand.einstieg = einstieg;
    if (S.aktuelleKarte) zustand.wechsel_anzahl++;
    folgeKamera();
    S.aktuelleKarte = k;
  }
  function zeigeFehler(e) {
    var el = document.getElementById('spiel-fehler');
    el.textContent = e.message; el.hidden = false;
    console.error(e.message);
  }

  // Kamera auf die Körpermitte der Figur (x/y ist der Fußpunkt)
  function folgeKamera() { var f = zustand.figur; S.kamera.folge({ x: f.x, y: f.y - f.h / 2 }, KB, KH); }

  // ---------- Zeichnen ----------
  function zeichne() {
    var k = S.kamera, t;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, BREITE, HOEHE);
    if (!karte) return;
    t = karte.tile;
    if (boden) ctx.drawImage(boden, -k.x, -k.y); else zeichneRaster(k, t);
    // Objekte + Hexe y-sortiert, dann Ebene ueber
    var zeit = zustand.schritte / 60;   // Spielzeit in s, steht in der Pause
    zeichenListe(karte.objekte, zustand.figur).forEach(function (e) {
      if (e.hexe) { S.hexeFigur.zeichne(ctx, e.o, k); return; }
      var sp = spriteVon(e.o);
      if (sp) {
        var s = sp.s, n = s.frames || 1, i = n > 1 ? Math.floor(zeit * (s.fps || 1)) % n : 0;
        ctx.drawImage(sp.bild, s.x + i * s.w, s.y, s.w, s.h, Math.round(e.o.x) - s.anker[0] - k.x, Math.round(e.o.y) - s.anker[1] - k.y, s.w, s.h);
      } else if (e.o.fuss) {
        // Platzhalter ohne Grafik: Fuß als Kiste
        ctx.fillStyle = '#6b4a2a'; ctx.fillRect(Math.round(e.o.x + e.o.fuss.x) - k.x, Math.round(e.o.y + e.o.fuss.y) - k.y, e.o.fuss.w, e.o.fuss.h);
      }
    });
    S.licht.zeichne(ctx, k);   // HEX-018: Licht/Abdunklung in Kartenkoordinaten, um die Kamera verschoben
    S.interaktion.zeichne(ctx, zustand.figur, k);   // HEX-016: Textblase + „E – …“ über allen Ebenen
    if (S.karte.debug) zeichneDebug(k, t);
    if (zustand.blende > 0) { ctx.fillStyle = 'rgba(0,0,0,' + zustand.blende + ')'; ctx.fillRect(0, 0, BREITE, HOEHE); }   // HEX-017 Abblende
  }

  // Platzhalter-Raster ohne Bodenbild: Boden Schachbrett, Wand-Tiles dunkler Stein, Kartenrand sichtbar
  function zeichneRaster(k, t) {
    var x, y;
    var x0 = Math.max(0, Math.floor(k.x / t)), x1 = Math.min(karte.breite, Math.ceil((k.x + BREITE) / t));
    var y0 = Math.max(0, Math.floor(k.y / t)), y1 = Math.min(karte.hoehe, Math.ceil((k.y + HOEHE) / t));
    for (y = y0; y < y1; y++) {
      for (x = x0; x < x1; x++) {
        ctx.fillStyle = karte.tileBlockiert(x, y) ? ((x + y) % 2 ? '#4a4038' : '#433a33') : ((x + y) % 2 ? '#2a3324' : '#26301f');
        ctx.fillRect(x * t - k.x, y * t - k.y, t, t);
      }
    }
    ctx.strokeStyle = '#7a5a2a';
    ctx.strokeRect(0.5 - k.x, 0.5 - k.y, KB - 1, KH - 1);
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
    S.interaktion.zeichneDebug(ctx, k);   // HEX-016: Interaktionszonen cyan
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    for (x = x0; x <= x1; x++) ctx.fillRect(x * t - k.x, 0, 1, HOEHE);
    for (y = y0; y <= y1; y++) ctx.fillRect(0, y * t - k.y, BREITE, 1);
    ctx.fillStyle = '#fff'; ctx.font = '8px monospace'; ctx.fillText('KOLLISION (K)', 4, 10);
  }

  // ---------- Schleife ----------
  var letzte = null, rest = 0, eDruck = false;
  function takt(jetzt) {
    if (S.eingabe.gedrueckt('pause')) setzePause(!zustand.pausiert);
    if (S.eingabe.gedrueckt('debug')) S.karte.debug = !S.karte.debug;
    if (S.eingabe.gedrueckt('aktion') && !zustand.pausiert) eDruck = true;   // HEX-016: in der Pause verworfen
    if (letzte === null) letzte = jetzt;
    var dt = Math.min(DT_MAX, jetzt - letzte);
    letzte = jetzt;
    if (!zustand.pausiert) {
      rest += dt;
      while (rest >= SCHRITT) { update(SCHRITT); rest -= SCHRITT; }
      S.licht.tick(zustand.schritte * SCHRITT);   // HEX-018: 12-fps-Lichttakt aus der Spielzeit
    } else {
      rest = 0;
    }
    zeichne();
    requestAnimationFrame(takt);
  }

  S.zustand = zustand;
  S.zeichenListe = zeichenListe;   // HEX-015: für Tests der y-Sortierung
  requestAnimationFrame(takt);
  // HEX-016: Standard-Aktionen sprechen/sammeln stehen in interaktion.js (Satz aus der Karte).

  S.wechsleStandort = wechsleStandort;   // HEX-017
  S.karte.lade(START).then(function (k) { betrete(k, 'start'); }).catch(zeigeFehler);
})();
