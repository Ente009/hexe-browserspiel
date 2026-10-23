/* HEX-019b Umgebungsanimationen im Spiel (Schnittstelle Spiel.deko aus HEX-019a, Craft „Schnittstelle Spiel.deko“).
 *   Spiel.deko.init(karte)          bei jedem Karteneintritt, nach Spiel.licht.setzeKarte
 *   Spiel.deko.tick(spielzeitMs)    je Bild, nicht in der Pause (Logikschritte × 1000/60)
 *   Spiel.deko.zeichne(ctx, kamera) jedes Bild, auch in der Pause (nach Ebene ueber, vor Licht); Kartenkoordinaten → Math.round(x) - kamera.x
 *   Spiel.deko.clear()              vor jedem Kartenwechsel
 * core ruft nur bei Spiel.einstellungen.animationen === true; bei „aus“ passiert hier nichts, Laternen bleiben auf 1 (rest).
 * Beim Laden: nichts zeichnen, Spiel.licht nicht anfassen.
 * Teile intern im Schema {init, tick, clear} wie js/ambient.js, zusätzlich zeichne:
 *   Laternen  Spiel.licht.set('laterne-n', v) 6/s, synchron zum Sprite-Frame der Laterne floor(spielzeit_s × 6) % 3
 *             (werkstatt-objekte.json laterne frames 3, fps 6; core zeichnet den Frame). Frame-Farbe → Helligkeit im Bereich 0,55–1,0:
 *             Frame 0 gelb 0,80 · Frame 1 hell 1,00 · Frame 2 orange 0,55. set() nur bei Frame-Wechsel (≤ 6/s, teilt den 12-fps-Lichttakt).
 * F-021: Orte kommen nur aus der Karte (Format mit HP abgestimmt), Pixel in Kartenkoordinaten, alle Felder optional:
 *   karte.daten.deko = { katze: {x, y, w, h}, dampf: [{x, y}], blaetter: bool }
 *   Fehlt deko oder ein Unterfeld, macht der Teil nichts. Keine festen Plätze, keine Abfrage der Karten-id.
 *   Blätter   nur bei deko.blaetter === true: wenige fallende Blätter über die ganze Karte (12 fps), nur Bild.
 *   Dampf     je Punkt in deko.dampf Puffs, die von (x, y) aufsteigen (6 fps).
 *   Katze     in deko.katze: Fußlinie = y + h, läuft nur zwischen x und x + w; Idle 4 fps, ab und zu ein paar Schritte (keine KI).
 * HEX-023 Katzen-Reaktion (Craft HEX-023, Block „Schnittstelle Katzen-Reaktion (HP, fest)“):
 *   Spiel.deko.reagiere(id)         von interaktion.js 1× je E auf einer sprechen-Zone, vor deko.tick desselben Bildes.
 *             Nur id === "katze" zählt, alles andere: nichts. Wirft nie. Siehe Teil Katze unten.
 * HEX-023b Statische Deko bei Animationen aus (Craft Block 9035b5a5 „Schnittstelle statische Deko (HP, fest)“):
 *   Spiel.deko.spritesStatisch(karte) core ruft sie nur bei animationen !== true, jedes Bild (auch Pause/Blende).
 *             Reine Funktion: liest nur karte.daten.deko.katze, kein Zustand, kein init/tick, kein Zufall, kein Spiel.licht, keine Zeit.
 *             Mit gültiger deko.katze genau 1 Eintrag [{x, y_fuss, zeichne(ctx, kamera)}], sonst []. Wirft nie.
 *             Bild = Ruhebild der Katze wie beim Start mit Animationen an: sitzend, Blick rechts, Schwanz-Frame 0 (Idle f = 0),
 *             x = round(katze.x + katze.w / 2), y_fuss = katze.y + katze.h. Gleiche Zeichenfunktion wie die animierte Katze.
 * Laternen: keine eigenen Ruhe-/Fallbackwerte. Ruhe stellt licht.setzeKarte beim Karteneintritt her; getRest wird hier nicht gebraucht.
 * Alles deterministisch aus der Spielzeit (eigener Zufall mit festem Startwert je Karteneintritt), keine Uhrzeit.
 * Farben aus der Palette von Karte/Objekten (HEX-015), harte Pixel (fillRect ganzzahlig). */
(function () {
  'use strict';
  var S = window.Spiel = window.Spiel || {};
  var PAL = { nacht: '#161422', holz0: '#362016', orange: '#ce7024', laub3: '#a05622', rot1: '#962c30', gelb: '#f6c45c',
    stein1: '#68646a', stein2: '#8e8888', creme: '#e0ceb4' };
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  // Deko-Daten der Karte: nur karte.daten.deko (Pfad laut HP, F-021)
  function dekoDaten(karte) { var d = karte && karte.daten && karte.daten.deko; return d && typeof d === 'object' ? d : {}; }
  function zahl(v) { return typeof v === 'number' && isFinite(v); }
  function px(ctx, k, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x) - k.x, Math.round(y) - k.y, w, h); }

  // ---------- Laternen ----------
  var LATERNE_FPS = 6, LATERNE_FRAMES = 3, HELL = [0.80, 1.00, 0.55];
  var Laternen = {
    ids: [], frame: -1,
    init: function () {
      this.ids = (S.licht && S.licht.liste ? S.licht.liste() : []).filter(function (q) { return q.typ === 'laterne'; }).map(function (q) { return q.id; });
      this.frame = -1;
    },
    tick: function (ms) {
      // gleiche Rechnung wie core.js (zeit = schritte / 60): Schritte aus ms zurückgewinnen, sonst Rundungsabweichung an Frame-Grenzen
      var schritte = Math.round(ms * 60 / 1000), f = Math.floor(schritte / 60 * LATERNE_FPS) % LATERNE_FRAMES;
      if (f === this.frame) return;
      this.frame = f;
      for (var i = 0; i < this.ids.length; i++) S.licht.set(this.ids[i], HELL[f]);
    },
    zeichne: function () {},
    clear: function () { this.ids = []; this.frame = -1; }
  };

  // ---------- Blätter ----------
  var BLATT_FPS = 12, BLATT_ANZAHL = 6, BLATT_FARBEN = [PAL.orange, PAL.laub3, PAL.rot1];
  var Blaetter = {
    liste: [], b: 0, h: 0, schritt: -1, zufall: null,
    neu: function (oben) {
      var r = this.zufall;
      return { x: 8 + r() * (this.b - 16), y: oben ? -4 - r() * 40 : r() * this.h, v: 0.35 + r() * 0.35, ph: r() * 6.28, c: BLATT_FARBEN[Math.floor(r() * 3)] };
    },
    init: function (karte) {
      this.b = karte.pxBreite; this.h = karte.pxHoehe; this.zufall = rng(1907); this.schritt = -1; this.liste = [];
      if (dekoDaten(karte).blaetter !== true) return;
      for (var i = 0; i < BLATT_ANZAHL; i++) this.liste.push(this.neu(false));
    },
    tick: function (ms) {
      var s = Math.floor(ms / 1000 * BLATT_FPS);
      if (this.schritt < 0) { this.schritt = s; return; }
      while (this.schritt < s) {                     // je 12-fps-Schritt; nach Pause kein Sprung (Spielzeit stand)
        this.schritt++;
        for (var i = 0; i < this.liste.length; i++) {
          var l = this.liste[i]; l.y += l.v; l.ph += 0.25;
          if (l.y > this.h + 4) this.liste[i] = this.neu(true);
        }
      }
    },
    zeichne: function (ctx, k) {
      for (var i = 0; i < this.liste.length; i++) {
        var l = this.liste[i], x = l.x + Math.round(Math.sin(l.ph) * 3);
        px(ctx, k, x, l.y, 2, 2, l.c); px(ctx, k, x + (Math.sin(l.ph) > 0 ? 2 : -1), l.y + 1, 1, 1, l.c);
      }
    },
    clear: function () { this.liste = []; this.schritt = -1; }
  };

  // ---------- Dampf ----------
  var DAMPF_FPS = 6, DAMPF_LEBEN = 9;           // Schritte bis ein Puff verschwindet (1,5 s)
  var Dampf = {
    punkte: [], schritt: -1,
    init: function (karte) {
      var d = dekoDaten(karte).dampf;
      this.punkte = Array.isArray(d) ? d.filter(function (p) { return p && zahl(p.x) && zahl(p.y); }) : [];
      this.schritt = -1;
    },
    tick: function (ms) { if (this.punkte.length) this.schritt = Math.floor(ms / 1000 * DAMPF_FPS); },
    zeichne: function (ctx, k) {
      if (this.schritt < 0) return;
      for (var q = 0; q < this.punkte.length; q++) {
        var o = this.punkte[q];
        for (var p = 0; p < 3; p++) {              // 3 Puffs zeitversetzt, steigen von (x, y) auf
          var a = (this.schritt + p * 3) % DAMPF_LEBEN, x = o.x - 4 + p * 4 + ((a >> 1) % 2 ? 1 : 0), y = o.y - 2 - a * 2;
          px(ctx, k, x, y, a < 3 ? 2 : 3, 2, a < 6 ? PAL.stein2 : PAL.stein1);
        }
      }
    },
    clear: function () { this.punkte = []; this.schritt = -1; }
  };

  // ---------- Katze ----------
  // HEX-023 Reaktion auf sprechen: reagiere("katze") merkt sich nur die Anfrage (anfrage = true). Der Ablauf entsteht
  // allein im nächsten tick(ms) aus der Spielzeit: Start = Spielschritt dieses ticks, Phase = floor(Schritte seit Start × 8 / 60).
  // Pause: kein tick → Phase steht. Dauer 1,25 s (10 Phasen à 125 ms), danach wieder Ruhebild (sitzen, Idle-Schwanz).
  // Ablauf: Kopf hebt sich (1, dann 2 px), Schwanz steht auf und die Spitze wippt, einmal Augen zu, dann zurück.
  // Während der Reaktion sitzt die Katze an ihrer Stelle (läuft sie gerade, bleibt sie stehen: ziel = x), danach
  // mindestens 3 s Sitzen (pause 12 Schritte à 4 fps), dann wie bisher. x und Fußlinie (platz.y = y + h) ändern sich nicht.
  // E während laufender Reaktion: IGNORIEREN (deterministisch). Reihenfolge im tick: erst Ende prüfen (Spielzeit ≥ Start + 1,25 s
  // → Reaktion vorbei), dann Anfrage: läuft noch eine Reaktion → Anfrage verworfen, sonst Start. Kein Neustart, kein Nachholen.
  // Nur Farben nacht/gelb wie die Katze bisher, harte Pixel.
  var KATZE_FPS = 4, REAKTION_FPS = 8, REAKTION_RUHE = 12, SPIELSCHRITTE_JE_S = 60;   // Spielzeit-Raster wie in tick: 1 Schritt = 1/60 s
  // je Phase: Kopfhub in px, Schwanz (0 = Idle-Lage, 1 = aufgestellt, 2 = aufgestellt + Spitze links), Augen zu
  var REAKTION = [
    { kopf: 1, schwanz: 0, zu: false }, { kopf: 2, schwanz: 1, zu: false }, { kopf: 2, schwanz: 2, zu: false }, { kopf: 2, schwanz: 1, zu: false },
    { kopf: 2, schwanz: 2, zu: true }, { kopf: 2, schwanz: 1, zu: false }, { kopf: 2, schwanz: 2, zu: false }, { kopf: 1, schwanz: 1, zu: false },
    { kopf: 1, schwanz: 0, zu: false }, { kopf: 0, schwanz: 0, zu: false }];
  // F-025: Dauer aus Phasen und FPS abgeleitet statt fest 75: 10 Phasen × 60/8 Schritte = 75 Schritte = 1,25 s.
  // Math.ceil, damit auch bei FPS, die 60 nicht teilen, die letzte Phase ihre volle Zeit bekommt (hier exakt 75).
  var REAKTION_PHASEN = REAKTION.length, REAKTION_SCHRITTE = Math.ceil(REAKTION_PHASEN * SPIELSCHRITTE_JE_S / REAKTION_FPS);
  // Platz aus der Karte (gemeinsam für init und spritesStatisch, HEX-023b): gültig nur mit endlichen Zahlen und w, h > 0
  function katzePlatz(karte) {
    var p = dekoDaten(karte).katze;
    if (!(p && zahl(p.x) && zahl(p.y) && zahl(p.w) && zahl(p.h) && p.w > 0 && p.h > 0)) return null;
    return { x0: p.x, x1: p.x + p.w, y: p.y + p.h, mitte: Math.round(p.x + p.w / 2) };
  }
  // Katzenbild als reine Zeichenfunktion (HEX-023b): alles aus den Argumenten, kein Zustand.
  // b = Blick (1 rechts, -1 links), laeuft = Laufpose, f = Frame-Bit (0/1), rPhase = Reaktionsphase (-1 = keine)
  function katzeBild(ctx, k, x, y, b, laeuft, f, rPhase) {
    var c = PAL.nacht;
    function r(dx, dy, w, h, col) { px(ctx, k, b > 0 ? x + dx : x - dx - w, y + dy, w, h, col || c); }
    if (laeuft) {
      r(-5, -6, 9, 4); r(3, -9, 4, 4); r(3, -10, 1, 1); r(6, -10, 1, 1); r(5, -8, 1, 1, PAL.gelb);   // Körper, Kopf, Ohren, Auge
      r(-4, -2, 1, 2 - f); r(-2, -2, 1, 1 + f); r(1, -2, 1, 2 - f); r(3, -2, 1, 1 + f);              // Beine im Wechsel
      r(-7, -8 + f, 2, 1); r(-6, -7 + f, 1, 1);                                                      // Schwanz
    } else if (rPhase >= 0) {                      // HEX-023: Reaktion (sitzend), Phase aus tick
      var R = REAKTION[rPhase], u = R.kopf;
      r(-3, -7, 6, 7); r(-2, -11 - u, 5, 4); r(-2, -12 - u, 1, 1); r(2, -12 - u, 1, 1);             // Körper, Kopf gehoben, Ohren
      if (u) r(-1, -7 - u, 3, u);                                                                    // Hals füllt die Lücke
      if (!R.zu) { r(-1, -10 - u, 1, 1, PAL.gelb); r(1, -10 - u, 1, 1, PAL.gelb); }                  // Augen (zu = nur nacht)
      if (R.schwanz === 0) { r(-6, -1, 3, 1); r(-6, -3, 1, 2); }                                     // Idle-Lage (wie f = 0)
      else { r(-5, -1, 2, 1); r(-5, -8, 1, 7); if (R.schwanz === 2) r(-6, -9, 1, 1); else r(-5, -9, 1, 1); }   // aufgestellt, Spitze wippt
    } else {
      r(-3, -7, 6, 7); r(-2, -11, 5, 4); r(-2, -12, 1, 1); r(2, -12, 1, 1);                         // sitzend: Körper, Kopf, Ohren
      r(-1, -10, 1, 1, PAL.gelb); r(1, -10, 1, 1, PAL.gelb);                                       // Augen
      if (f) { r(-6, -2, 3, 1); r(-7, -4, 1, 2); } else { r(-6, -1, 3, 1); r(-6, -3, 1, 2); }        // Schwanz wippt (Idle)
    }
  }
  var Katze = {
    aktiv: false, platz: null, schritt: -1, x: 0, ziel: 0, blick: 1, pause: 0, frame: 0, zufall: null,
    anfrage: false, rStart: -1, rPhase: -1,      // HEX-023: Reaktion (rStart = Spielschritt des Starts, -1 = keine)
    reagiere: function () { if (this.aktiv) this.anfrage = true; },
    init: function (karte) {
      this.anfrage = false; this.rStart = -1; this.rPhase = -1;
      var q = katzePlatz(karte);
      this.aktiv = !!q;
      this.platz = q ? { x0: q.x0, x1: q.x1, y: q.y } : null;
      this.zufall = rng(1911); this.schritt = -1; this.blick = 1; this.pause = 12; this.frame = 0;
      this.x = q ? q.mitte : 0; this.ziel = this.x;
    },
    tick: function (ms) {
      if (!this.aktiv) return;
      var jetzt = Math.round(ms * SPIELSCHRITTE_JE_S / 1000);   // Spielschritt (wie Laternen), ganzzahlig → keine Rundungsabweichung
      if (this.rStart >= 0 && jetzt - this.rStart >= REAKTION_SCHRITTE) { this.rStart = -1; this.rPhase = -1; this.pause = Math.max(this.pause, REAKTION_RUHE); }
      if (this.anfrage) { this.anfrage = false; if (this.rStart < 0) { this.rStart = jetzt; this.ziel = this.x; } }   // läuft schon eine → ignoriert
      if (this.rStart >= 0) this.rPhase = Math.min(REAKTION_PHASEN - 1, Math.floor((jetzt - this.rStart) * REAKTION_FPS / SPIELSCHRITTE_JE_S));
      var s = Math.floor(ms / 1000 * KATZE_FPS);
      if (this.schritt < 0) { this.schritt = s; return; }
      while (this.schritt < s) {
        this.schritt++; this.frame++;
        if (this.rStart >= 0) continue;           // HEX-023: während der Reaktion kein Laufen, keine Sitz-Uhr
        if (this.x !== this.ziel) { var d = this.ziel > this.x ? 1 : -1; this.blick = d; this.x += d * 2; if ((this.ziel - this.x) * d < 0) this.x = this.ziel; }
        else if (--this.pause <= 0) {               // nach 3–6 s Sitzen ein paar Schritte innerhalb des Platzes
          var rand = 8, breite = Math.max(0, this.platz.x1 - this.platz.x0 - 2 * rand);   // Katze ±7 px um x bleibt im Platz
          this.ziel = Math.round(this.platz.x0 + (breite > 0 ? rand + this.zufall() * breite : (this.platz.x1 - this.platz.x0) / 2)); this.pause = 12 + Math.floor(this.zufall() * 13);
        }
      }
    },
    zeichne: function () {},                       // HEX-019c: Katze nur noch über sprites() (y-sortiert von core)
    zeichneKatze: function (ctx, k) {
      if (!this.aktiv) return;
      katzeBild(ctx, k, this.x, this.platz.y, this.blick, this.x !== this.ziel, this.frame % 2, this.rPhase);
    },
    sprite: function () {
      if (!this.aktiv) return null;
      var self = this;
      return { x: this.x, y_fuss: this.platz.y, zeichne: function (ctx, k) { self.zeichneKatze(ctx, k); } };   // platz.y = katze.y + katze.h
    },
    clear: function () { this.aktiv = false; this.platz = null; this.schritt = -1; this.anfrage = false; this.rStart = -1; this.rPhase = -1; }
  };

  // ---------- Nebel (HEX-021) ----------
  // deko.nebel = { dichte >0..1, farbe "#rrggbb", hoehe ganze Zahl 1..Kartenhöhe } (Format HP, fest). Ungültig/fehlt → nichts.
  // Bodennebel am unteren Kartenrand, hoehe px hoch. Zwei harte Stufen (unten dichter), Oberkante in 4-px-Säulen gestuft,
  // zwei Lagen treiben gegenläufig langsam seitlich (4 fps, je 1 px → 4 px/s bzw. 2 px/s). Keine Verläufe, Deckkraft je Stufe konstant.
  var NEBEL_FPS = 4, NEBEL_SAEULE = 4, NEBEL_HUB = [0, 2, 3, 2, 0, -2, -1, 1, 3, 1, -1, -3, -2, 0, 2, 1];   // Oberkanten-Muster (Säulen)
  var Nebel = {
    aktiv: false, d: 0, c: '', h: 0, b: 0, kh: 0, schritt: -1, start: -1,
    init: function (karte) {
      var n = dekoDaten(karte).nebel, kh = karte && karte.pxHoehe;
      this.aktiv = !!(n && typeof n === 'object' && zahl(n.dichte) && n.dichte > 0 && n.dichte <= 1 &&
        typeof n.farbe === 'string' && /^#[0-9a-fA-F]{6}$/.test(n.farbe) &&
        zahl(n.hoehe) && Math.floor(n.hoehe) === n.hoehe && n.hoehe >= 1 && zahl(kh) && n.hoehe <= kh);
      this.d = this.aktiv ? n.dichte : 0; this.c = this.aktiv ? n.farbe : ''; this.h = this.aktiv ? n.hoehe : 0;
      this.b = this.aktiv ? karte.pxBreite : 0; this.kh = this.aktiv ? kh : 0; this.schritt = -1; this.start = -1;
    },
    tick: function (ms) {
      if (!this.aktiv) return;
      var s = Math.floor(ms / 1000 * NEBEL_FPS);
      if (this.start < 0) this.start = s;
      this.schritt = s - this.start;               // Pause: Spielzeit steht → Stand eingefroren
    },
    lage: function (ctx, k, versatz, hoeheLage, alpha) {
      if (hoeheLage < 1) return;
      ctx.globalAlpha = alpha; ctx.fillStyle = this.c;
      var x0 = Math.max(0, Math.floor(k.x / NEBEL_SAEULE) * NEBEL_SAEULE), x1 = Math.min(this.b, k.x + ctx.canvas.width + NEBEL_SAEULE);
      for (var x = x0; x < x1; x += NEBEL_SAEULE) {
        var i = Math.floor((x + versatz) / NEBEL_SAEULE), hub = NEBEL_HUB[((i % 16) + 16) % 16];
        var hh = Math.max(1, Math.min(this.h, hoeheLage + hub)), y = this.kh - hh;
        ctx.fillRect(Math.round(x) - k.x, Math.round(y) - k.y, NEBEL_SAEULE, hh);
      }
    },
    zeichne: function (ctx, k) {
      if (!this.aktiv || this.schritt < 0) return;
      var a = this.d / 2;                          // zwei Lagen à dichte/2: unten (Überlappung) ≈ dichte, oben dünner
      // Look-Werte (Unter, HEX-021): obere Lage 0.9 × hoehe (Oberkante knapp unter hoehe, Platz für das Hub-Muster +3 px; darüber auf hoehe begrenzt),
      // untere Lage 0.5 × hoehe (dichter Kern = halbe Höhe). +32 = Startversatz der unteren Lage um 8 Säulen à 4 px,
      // damit ihre Zacken nicht deckungsgleich unter denen der oberen Lage liegen (Hälfte des 16-Säulen-Musters).
      this.lage(ctx, k, this.schritt, Math.round(this.h * 0.9), a);              // obere, breite Lage treibt nach links
      this.lage(ctx, k, -Math.floor(this.schritt / 2) + 32, Math.round(this.h * 0.5), a);   // untere, dichte Lage langsamer nach rechts
      ctx.globalAlpha = 1;
    },
    clear: function () { this.aktiv = false; this.schritt = -1; this.start = -1; }
  };

  var TEILE = [Laternen, Blaetter, Dampf, Katze, Nebel];
  S.deko = {
    init: function (karte) { for (var i = 0; i < TEILE.length; i++) TEILE[i].init(karte); },
    tick: function (ms) { for (var i = 0; i < TEILE.length; i++) TEILE[i].tick(ms); },
    zeichne: function (ctx, k) {
      ctx.save();
      for (var i = 0; i < TEILE.length; i++) TEILE[i].zeichne(ctx, k);
      ctx.restore();
    },
    sprites: function () { var s = Katze.sprite(); return s ? [s] : []; },   // HEX-019c: [{x, y_fuss, zeichne(ctx, kamera)}]
    // HEX-023: nur "katze" (genau dieser Text), nur bei Animationen an, nur mit deko.katze auf der Karte; wirft nie, gibt nichts zurück
    reagiere: function (id) {
      try { if (id === 'katze' && S.einstellungen && S.einstellungen.animationen === true) Katze.reagiere(); } catch (e) { /* nie werfen (Schnittstelle) */ }
    },
    clear: function () { for (var i = 0; i < TEILE.length; i++) TEILE[i].clear(); },
    // HEX-023b: statische Katze bei Animationen aus (Schnittstelle 9035b5a5). Rein: nur aus karte, Werte beim Aufruf festgehalten.
    // Frame = Ruhebild wie beim Start mit an (sitzend, Blick rechts, Schwanz-Frame 0). Ohne gültige deko.katze []. Wirft nie.
    spritesStatisch: function (karte) {
      try {
        var q = katzePlatz(karte);
        if (!q) return [];
        var x = q.mitte, y = q.y;
        if (!isFinite(x) || !isFinite(y)) return [];   // z. B. y + h läuft über → kein gültiger Eintrag
        return [{ x: x, y_fuss: y, zeichne: function (ctx, k) { katzeBild(ctx, k, x, y, 1, false, 0, -1); } }];
      } catch (e) { return []; }   // z. B. Getter in karte wirft → still nichts (Schnittstelle: nie werfen)
    },
    _teile: { laternen: Laternen, blaetter: Blaetter, dampf: Dampf, katze: Katze, nebel: Nebel }   // nur für Tests
  };
})();
