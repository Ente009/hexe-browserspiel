/* Titelbildschirm – Ambient-Animationen (ein gemeinsamer 12-fps-Tick für mehrere kleine Teile)
 *
 * WICHTIG: ambient.js muss in index.html NACH candles.js und fire.js stehen. Es zeichnet in deren
 * Canvas .kerzen (1536×1024, z1, deckungsgleich mit dem Hintergrund). Jeder Teil löscht und zeichnet
 * nur seine eigenen Zellen; Kerzen- und Feuerzellen werden nie berührt.
 *
 * Aufbau: Jeder Teil ist ein Objekt { init(ctx), tick(), clear() }.
 *   init(ctx)  einmal beim Start, ctx = 2D-Kontext von .kerzen, zeichnet nichts (Ruhe = Original).
 *   tick()     pro Tick (12 fps, nur bei Animationen an; der Takt steht sonst, siehe main.js).
 *   clear()    bei "Animationen aus": eigene Zellen leeren, Zustand zurücksetzen.
 * Teile bisher:
 *   AmbientFenster  Sterne + Fledermaus in den oberen Fensterscheiben (Clip x630–746/x760–886, y85–273)
 * Später dazu (je als eigener Teil unten in PARTS eintragen): Glint, Kugel, Pflanzen.
 *
 * Abhängigkeit: TitleScreen.state.animationsOn, TitleScreen.onTick aus main.js, Event "statechange".
 */

/* ---------- Teil "Fenster": Sterne funkeln + ab und zu eine Fledermaus ----------
 * (Plan und Nachweise: /workspace/hexe-tools/fledermaus/)
 *
 * Schnittstelle (window.AmbientFenster):
 *   init(ctx)   ctx = 2D-Kontext des vorhandenen Canvas .kerzen (1536×1024, z1). Zeichnet nichts.
 *   tick()      einmal pro Tick des gemeinsamen 12-fps-Takts (vom Verteiler unten).
 *   clear()     bei "Animationen aus" (statechange): eigene Zellen leeren, Sterne in Ruhe,
 *               Fledermaus weg, Zeitgeber zurück auf Anfang.
 *
 * Zeichenbereich: NUR innerhalb eines Clip-Pfads aus zwei Rechtecken = die oberen Scheiben
 *   links  x630–746, rechts x760–886, jeweils y85–273 (Mittelsprosse x747–759 ausgespart,
 *   Querholz ab y274). Gelöscht wird ebenfalls nur im Clip (clearRect beachtet den Clip).
 *   Kerzenzellen K1–K4 und Feuerzellen x586–871/y610–719 liegen weit außerhalb und werden
 *   nie berührt. Kein getImageData/putImageData, kein Compositing, kein weiteres Canvas.
 * Die Fledermaus liegt damit hinter Rahmen, Sprosse und Querholz (dort wird nicht gezeichnet),
 *   hinter Dampf (z2) und Hexe (z3, eigene Canvases darüber) und vor Mond und Sternen.
 *   Jeder Flug kreuzt die Mondsichel (siehe startFlight). Die Bahn bleibt im Band y152–253 (Sprite eingeschlossen): 18 px (links, Scheibe frei ab
 *   y134) bzw. 12 px (rechts, frei ab y140) unter den runden Ecken des Bogens. Unterkante 253
 *   statt ~262: bei x839–866 / y254–262 liegen Schulter/Haar der Hexe im bg selbst (nicht im
 *   Sprite hexe-koerper.png), darüber darf die Fledermaus nicht gezeichnet werden.
 *
 * Pro Tick (Reihenfolge wie im Plan):
 *   1. Sterne weiterschalten (jeder Stern eigener Zufallstakt), geänderte Sternzellen merken.
 *   2. Fledermaus weiterbewegen bzw. starten; alter und neuer Fledermaus-Rahmen merken.
 *   3. Clip setzen, alle gemerkten Rechtecke löschen, darin liegende Sterne im aktuellen
 *      Frame neu zeichnen, Fledermaus zuletzt zeichnen, Clip aufheben.
 * Ruhe: Sterne im Frame 0 zeichnen nichts -> Hintergrund = Original, 0 px Abweichung.
 *
 * Zufall: eigener kleiner Zufallsgenerator (mulberry32), damit Math.random für Kerzen,
 * Feuer usw. unverändert bleibt.
 */
(function () {
  'use strict';

  var FPS = 12;
  // Obere Scheiben (x, y, w, h), gemessen am neuen bg (fledermaus/glasmaske.py)
  var PANES = [[630, 85, 117, 189], [760, 85, 127, 189]];
  var BAND_TOP = 152, BAND_BOTTOM = 253;        // oberste/unterste Pixelzeile des Sprites
  var X_START = 630 - 21, X_END = 760 + 127;    // ganz verdeckt hinter dem Rahmen
  var FLIGHT_TICKS = 54;                         // 4,5 s
  var GAP = [25 * FPS, 60 * FPS];                // Pause zwischen zwei Flügen
  var FIRST = [10 * FPS, 60 * FPS];              // erster Flug frühestens nach 10 s
  var WAVE_A = 9, WAVE_T = 1.1 * FPS, FLUTTER = 2, DRIFT = 15;

  // Fledermaus: 7×4 Zellen à 3 px = 21×12 px, Farben aus den dunklen Fensterfarben des bg
  var CELL = 3;
  var BAT_PAL = { '#': '#080a1c', '+': '#0f132a', '-': '#171e3e' };
  var BAT_FRAMES = [
    ['+.#.#.+', '++###++', '.+-#-+.', '...#...'],   // A Flügel oben
    ['..#.#..', '-++#++-', '+.+#+.+', '.......'],   // B Mitte
    ['..#.#..', '.+###+.', '++.#.++', '+.....+']    // C unten
  ];
  var WING = [0, 1, 2, 1];
  var BAT_W = 7 * CELL, BAT_H = 4 * CELL;

  // <sterne>
  // erzeugt von fledermaus/sterne/sterne-daten.py aus titelbild-bg-neu.png (nicht von Hand ändern)
  var STAR_PAL = ['#8a7f90','#0f1a44','#dbb5a6','#9a8492','#908886','#0e1c4b','#ada198','#6b5b68','#c59e96','#9c8a8d','#32385e','#957b7e','#2a314e','#d3a598','#a08182','#e3c8af','#bb958f','#b59891','#685b66','#555c6f','#e0ac9c','#988684','#ad8f97','#b49699','#9f8798','#938c8e','#c8a49a','#9d7b7e','#aba2a1','#876e74','#4a4c60','#847a81','#101d4b','#847078','#131f4f','#c1a09c','#82778c','#c99f95','#958c8d','#cba598','#bfa79c','#caa097','#2e324f','#212542','#504a5b','#152346','#50485b','#102249','#0d1e4f','#2e314d','#102358','#776c7d','#111c49','#927b84','#3c415e','#9b8489','#766a7b','#9c797a','#424362','#90797c','#323857','#998285','#b69a96','#907f81','#987d82','#504c63','#877e89','#363d65','#958081','#958790','#977f7f','#535168','#978180','#675c6e','#997d82','#928687','#6b6276','#74697a','#222f5a','#7b717c','#161e4b','#927f83','#4c4964','#9e8386','#927b80','#a58685','#85757f','#9e9090','#8b777e','#99898a','#3e3f5c','#90777c','#2a2f5e','#434565','#987f7f','#947d81','#a0878c','#836f7b','#9e898e','#8a7581','#62607c','#5a5468','#8e7c7c','#373b58','#786e7f','#17204e','#111b48','#141d4b','#887682','#131c44','#918891','#7e6a74','#a49495','#8c7681','#625c70','#1c2557','#9f817e','#686376','#4f516b','#18255b','#787287','#12204b','#a88a89','#444469','#0f1f4a','#a68280','#917883','#3a355c','#11204c','#99898d','#95858a','#70687e','#131f53','#142155','#192552','#1c2652','#9d838d','#293455','#78606f','#1d244c','#cb9791','#413e60','#d39994','#454060','#c09895','#3f3c62','#d79e9b','#6e596e','#957178','#2a325a','#0c1947','#daa8a0','#d9bbaf','#a7838b','#333253','#41435f','#142050','#d0a29c','#765e72','#d39b96','#45415d','#18204a','#988791','#303254','#7b6979','#daa9a5','#786475','#d69b95','#494d67','#111a4a','#b58e91','#3f3d58','#d1aeae','#716a7c','#a48a8c','#363657','#16224f','#322e52','#132155','#d19d97','#162456','#212651','#635068','#443c59','#715c71','#463c5a','#624f66','#393653','#93717d','#4f4560','#111e44','#766276','#16224e','#795f6e','#383451','#966d74','#4c3f50','#625360','#131e49','#775b68','#101b42','#dba29d','#836272','#bb8e86','#463c4c','#825f6e','#403552','#b07b7f','#c6928c','#121b45','#da9589','#473d47','#1f2547','#54444e','#32324c','#7c5b55','#554751','#715956','#4f4050','#644e52','#393348','#181f4d','#554f6f','#152456','#706379','#5f5874','#5f5d80','#383c62','#6f6277','#7a697e','#67576f','#7c6c81','#6d607d','#162352','#223165','#474c6c','#695c77','#566089','#635e78','#5c5b7f','#333c6b','#595475','#1a2a62','#736178','#6f6279','#73647d','#5a5a78','#4b4567','#3d4269','#27366b','#344172','#35436f','#2a3567','#59507b','#3d4276','#786a8b','#4d4d7c','#57537a','#5f5780','#4b4b75','#424275','#2e3269','#243572','#403f71','#383a5a','#1f294f','#3f405a','#46435a','#403d5b','#323450'];
  // x, y, w, h = Sternzelle im Bild; f[1] hell, f[2] matt: flache Liste dx,dy,Palettenindex (Frame 0 = Ruhe = nichts zeichnen)
  var STARS = [
    { x: 645, y: 121, w: 11, h: 9, f: [null, [4,0,0,5,0,2,6,0,4,4,1,6,6,1,9,3,2,11,4,2,13,5,2,15,6,2,17,1,3,16,2,3,20,3,3,15,4,3,15,5,3,15,6,3,15,7,3,26,8,3,28,9,3,22,10,3,31,0,4,33,1,4,8,2,4,35,3,4,37,4,4,15,5,4,15,6,4,39,7,4,40,8,4,41,9,4,38,4,5,3,5,5,15,6,5,23,4,6,21,5,6,15,6,6,24,4,7,27,5,7,15,6,7,14,5,8,25,6,8,36], [4,0,1,5,0,3,6,0,5,4,1,7,5,1,8,6,1,10,3,2,12,4,2,14,5,2,16,6,2,18,1,3,19,2,3,21,3,3,22,4,3,23,5,3,24,6,3,25,7,3,27,8,3,29,9,3,30,10,3,32,0,4,34,1,4,33,2,4,36,3,4,31,4,4,38,5,4,9,6,4,4,7,4,0,8,4,11,9,4,42,4,5,43,5,5,17,6,5,44,4,6,45,5,6,6,6,6,46,4,7,47,5,7,28,6,7,48,5,8,49,6,8,50]] },
    { x: 822, y: 116, w: 12, h: 13, f: [null, [6,0,51,7,0,53,8,0,55,9,0,57,6,1,59,8,1,62,9,1,64,6,2,66,7,2,62,8,2,69,9,2,70,6,3,72,7,3,62,8,3,62,9,3,75,0,4,77,1,4,79,2,4,81,3,4,83,4,4,62,5,4,62,6,4,62,7,4,85,8,4,87,9,4,89,10,4,84,11,4,91,2,5,63,3,5,62,4,5,62,5,5,62,6,5,62,7,5,96,8,5,98,9,5,61,10,5,68,11,5,102,2,6,104,3,6,99,4,6,97,5,6,108,6,6,110,7,6,62,8,6,112,9,6,94,10,6,76,6,7,113,7,7,62,8,7,116,9,7,74,10,7,100,6,8,120,7,8,62,8,8,122,9,8,95,6,9,111,7,9,62,8,9,125,9,9,126,6,10,117,7,10,129,8,10,130,9,10,88,7,11,62,8,11,62,9,11,86,7,12,56,8,12,131], [6,0,52,7,0,54,8,0,56,9,0,58,6,1,60,7,1,61,8,1,63,9,1,65,6,2,67,7,2,68,8,2,51,9,2,71,6,3,73,7,3,74,8,3,59,9,3,76,0,4,78,1,4,80,2,4,82,3,4,77,4,4,53,5,4,57,6,4,84,7,4,86,8,4,88,9,4,79,10,4,90,11,4,92,2,5,93,3,5,72,4,5,94,5,5,95,6,5,91,7,5,97,8,5,99,9,5,100,10,5,101,11,5,103,2,6,105,3,6,106,4,6,107,5,6,109,6,6,111,7,6,66,8,6,113,9,6,114,10,6,115,6,7,109,7,7,64,8,7,117,9,7,118,10,7,119,6,8,121,7,8,70,8,8,108,9,8,123,6,9,124,7,9,81,8,9,104,9,9,127,6,10,128,7,10,120,8,10,131,9,10,132,7,11,102,8,11,126,9,11,133,7,12,134,8,12,135]] },
    { x: 726, y: 94, w: 7, h: 10, f: [null, [2,0,136,3,0,138,2,1,140,3,1,142,2,2,144,3,2,146,4,2,148,1,3,143,2,3,151,3,3,152,4,3,153,0,4,155,1,4,157,2,4,152,3,4,152,4,4,159,5,4,147,0,5,162,2,5,152,3,5,152,4,5,165,5,5,167,6,5,158,1,6,170,2,6,152,3,6,172,4,6,174,5,6,160,1,7,164,2,7,152,3,7,152,4,7,166,2,8,179,3,8,152,4,8,168,3,9,173], [2,0,137,3,0,139,2,1,141,3,1,143,2,2,145,3,2,147,4,2,149,1,3,150,2,3,138,3,3,144,4,3,154,0,4,156,1,4,158,2,4,136,3,4,148,4,4,160,5,4,161,0,5,163,1,5,142,2,5,162,3,5,164,4,5,166,5,5,168,6,5,169,1,6,171,2,6,153,3,6,173,4,6,175,5,6,176,1,7,177,2,7,170,3,7,174,4,7,178,2,8,155,3,8,140,4,8,180,3,9,181]] },
    { x: 671, y: 108, w: 3, h: 3, f: [null, [0,0,182,1,0,184,2,0,186,0,1,188,2,1,188,0,2,189,1,2,191,2,2,185], [0,0,183,1,0,185,2,0,187,0,1,186,1,1,184,2,1,182,0,2,190,1,2,189,2,2,192]] },
    { x: 782, y: 106, w: 4, h: 4, f: [null, [1,0,193,2,0,195,3,0,197,0,1,199,1,1,201,3,1,202,0,2,205,1,2,201,2,2,201,3,2,208,0,3,196,1,3,207,2,3,210,3,3,203], [1,0,194,2,0,196,3,0,198,0,1,200,1,1,202,2,1,203,3,1,204,0,2,206,1,2,195,2,2,207,3,2,193,0,3,209,1,3,197,2,3,205,3,3,199]] },
    { x: 857, y: 134, w: 3, h: 4, f: [null, [1,0,211,0,1,213,1,1,215,2,1,217,0,2,219,2,2,215,1,3,216,2,3,218], [1,0,212,0,1,214,1,1,216,2,1,218,0,2,211,1,2,219,2,2,213,1,3,220,2,3,221]] },
    { x: 776, y: 150, w: 7, h: 7, f: [null, [3,0,222,4,0,224,3,1,226,3,2,229,4,2,231,5,2,230,1,3,225,2,3,228,3,3,231,4,3,231,5,3,231,6,3,239,0,4,241,1,4,243,2,4,244,3,4,245,4,4,232,5,4,231,6,4,236,2,5,235,3,5,237,4,5,231,5,5,238,4,6,246], [3,0,223,4,0,225,3,1,227,4,1,228,3,2,230,4,2,232,5,2,233,1,3,234,2,3,235,3,3,236,4,3,237,5,3,238,6,3,240,0,4,242,1,4,241,2,4,222,3,4,246,4,4,247,5,4,239,6,4,248,2,5,249,3,5,250,4,5,226,5,5,251,4,6,252]] },
    { x: 789, y: 215, w: 4, h: 3, f: [null, [0,0,253,1,0,255,0,1,255,2,1,258,3,1,260,0,2,259,1,2,257,2,2,256], [0,0,254,1,0,256,0,1,253,1,1,257,2,1,259,3,1,261,0,2,262,1,2,260,2,2,263]] },
    { x: 685, y: 103, w: 2, h: 3, f: [null, [0,0,264,1,1,267,0,2,266,1,2,268], [0,0,265,0,1,266,1,1,268,0,2,264,1,2,269]] }
  ];
  // </sterne>

  var ctx = null, rnd = mulberry32((Date.now() ^ 0x5bd1e995) >>> 0);
  var flight = null, gap = 0, drawn = null;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function rint(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

  function reset() {
    for (var i = 0; i < STARS.length; i++) { STARS[i].frame = 0; STARS[i].wait = rint(FPS, 9 * FPS); }
    flight = null; drawn = null;
    gap = rint(FIRST[0], FIRST[1]);
  }

  function clipPanes() {
    ctx.beginPath();
    for (var i = 0; i < PANES.length; i++) ctx.rect(PANES[i][0], PANES[i][1], PANES[i][2], PANES[i][3]);
    ctx.clip();
  }

  // ---------- Fledermaus ----------
  // Jeder Flug kreuzt die Mondsichel (Mond x667–738 / y112–191): Beim Tick, in dem die
  // Fledermaus-Mitte über x685 (Mitte des Mondkörpers) steht, liegt die Grundlinie der Bahn in
  // MOON_BASE; mit Welle ±9 und Flattern ±2 ist die Sprite-Oberkante dort y152–184.
  // Die Drift wird so gewählt, dass die Grundlinie sonst nie über MOON_BASE[0] steigt
  // (Welle bleibt voll erhalten, nichts wird oben abgeschnitten).
  var MOON_X = 685, MOON_BASE = [BAND_TOP + WAVE_A + FLUTTER, 173];
  function startFlight(o) {
    o = o || {};
    var dir = o.dir || (rnd() < 0.5 ? 1 : -1);
    var um = dir > 0 ? (MOON_X - BAT_W / 2 - X_START) / (X_END - X_START) : (X_END - MOON_X + BAT_W / 2) / (X_END - X_START);
    var im = Math.round(um * (FLIGHT_TICKS - 1)); um = im / (FLIGHT_TICKS - 1);
    var base = o.base != null ? o.base : rint(MOON_BASE[0], MOON_BASE[1]);
    var room = base - MOON_BASE[0];                         // Grundlinie: nie höher als MOON_BASE[0]
    var dlo = Math.max(-DRIFT, -Math.floor(room / (1 - um))), dhi = Math.min(DRIFT, Math.floor(room / um));
    var drift = o.drift != null ? o.drift : rint(dlo, dhi);
    var phase = o.phase != null ? o.phase : rnd() * 2 * Math.PI;
    var ys = [], fl = 0;
    for (var i = 0; i < FLIGHT_TICKS; i++) {
      if (i % 3 === 0) fl = rint(-FLUTTER, FLUTTER);
      var u = i / (FLIGHT_TICKS - 1);
      var y = Math.round(base + drift * (u - um) + WAVE_A * Math.sin(2 * Math.PI * i / WAVE_T + phase) + fl);
      ys.push(Math.max(BAND_TOP, Math.min(BAND_BOTTOM - BAT_H + 1, y)));   // Sicherheit: nie aus dem Band
    }
    flight = { i: 0, dir: dir, ys: ys, wing: rint(0, 3) };
  }

  function batRect(f) {
    var u = f.i / (FLIGHT_TICKS - 1);
    var x = Math.round(f.dir > 0 ? X_START + u * (X_END - X_START) : X_END - u * (X_END - X_START));
    return { x: x, y: f.ys[f.i], w: BAT_W, h: BAT_H };
  }

  function drawBat(f, r) {
    var rows = BAT_FRAMES[WING[(f.i + f.wing) % WING.length]];
    for (var cy = 0; cy < rows.length; cy++) {
      for (var cx = 0; cx < rows[cy].length; cx++) {
        var c = BAT_PAL[rows[cy].charAt(cx)];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(r.x + cx * CELL, r.y + cy * CELL, CELL, CELL);
      }
    }
  }

  // ---------- Sterne ----------
  function drawStar(s) {
    var f = s.f[s.frame];
    if (!f) return;                                // Frame 0: Hintergrund zeigt das Original
    for (var i = 0; i < f.length; i += 3) {
      ctx.fillStyle = STAR_PAL[f[i + 2]];
      ctx.fillRect(s.x + f[i], s.y + f[i + 1], 1, 1);
    }
  }

  function stepStar(s) {
    if (--s.wait > 0) return false;
    if (s.frame === 0) {                           // funkeln: kurz hell oder kurz matt
      s.frame = rnd() < 0.5 ? 1 : 2;
      s.wait = s.frame === 1 ? rint(2, 3) : rint(3, 5);
    } else {
      s.frame = 0;
      s.wait = rint(3 * FPS, 9 * FPS);
    }
    return true;
  }

  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

  // ---------- Schnittstelle ----------
  function init(context) {
    ctx = context;
    reset();
  }

  function tick() {
    if (!ctx) return;
    var dirty = [], i;
    for (i = 0; i < STARS.length; i++) if (stepStar(STARS[i])) dirty.push(STARS[i]);

    if (flight && ++flight.i >= FLIGHT_TICKS) { flight = null; gap = rint(GAP[0], GAP[1]); }
    else if (!flight && --gap <= 0) startFlight();
    var now = flight ? batRect(flight) : null;
    if (drawn) dirty.push(drawn);
    if (now) dirty.push(now);
    if (!dirty.length) return;

    ctx.save();
    clipPanes();
    for (i = 0; i < dirty.length; i++) ctx.clearRect(dirty[i].x, dirty[i].y, dirty[i].w, dirty[i].h);
    for (i = 0; i < STARS.length; i++) {
      var s = STARS[i];
      if (!s.frame) continue;
      for (var j = 0; j < dirty.length; j++) if (hit(s, dirty[j])) { drawStar(s); break; }
    }
    if (now) drawBat(flight, now);
    ctx.restore();
    drawn = now;
  }

  function clear() {
    if (!ctx) return;
    ctx.save();
    clipPanes();
    for (var i = 0; i < PANES.length; i++) ctx.clearRect(PANES[i][0], PANES[i][1], PANES[i][2], PANES[i][3]);
    ctx.restore();
    reset();
  }

  window.AmbientFenster = { init: init, tick: tick, clear: clear };
})();

/* ---------- Verteiler: ein Tick für alle Teile ---------- */
(function () {
  'use strict';

  var FPS = 12;
  var TS = window.TitleScreen;
  var layer = document.getElementById('layer-sprites');
  if (!layer || !TS) return;

  var canvas = layer.querySelector('canvas.kerzen');
  if (!canvas) {                                  // Rückfall wie in fire.js: gleiches Canvas anlegen
    canvas = document.createElement('canvas');
    canvas.className = 'kerzen';
    canvas.width = 1536;
    canvas.height = 1024;
    layer.appendChild(canvas);
  }
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Reihenfolge = Zeichenreihenfolge im Tick. Neue Teile (Glint, Kugel, Pflanzen) hier anhängen.
  var PARTS = [window.AmbientFenster].filter(Boolean);
  PARTS.forEach(function (p) { p.init(ctx); });

  TS.onTick(function () {
    for (var i = 0; i < PARTS.length; i++) PARTS[i].tick();
  }, FPS);

  function sync() {
    if (TS.state.animationsOn) return;
    for (var i = 0; i < PARTS.length; i++) PARTS[i].clear();
  }
  document.addEventListener('statechange', sync);
  sync();
})();
