/* HEX-018 Spiel-Licht: einfaches Licht nach dem Prinzip von js/light.js (Titelbild), eigenes Modul; light.js bleibt unverändert.
 *
 * Prinzip (wie light.js): eine Lichtkarte über den Sprites, verrechnet mit soft-light. 50 % Grau = neutral,
 * darunter dunkelt es ab (AMBIENT = Abdunklung außerhalb der Lichter = Schatten), darüber hellt es warm auf.
 * Pro Zelle: Summe aller Quellen (1 - d²) → begrenzen → 4 harte Stufen (0..3) mit Hysterese, Farbe aus der Palette,
 * keine Mischfarben, kein Weichzeichnen.
 *
 * Kamera: Zellen und Quellen liegen in KARTENKOORDINATEN (1 Zelle = 4×4 Kartenpixel, ausgerichtet an (0,0) der Karte).
 * Die Lichtkarte wird nur beim Zeichnen um die Kamera verschoben (ganzzahlig) → beim Laufen wandert nichts relativ
 * zum Boden, kein Flimmern, keine Sprünge. Die Hexe beeinflusst das Licht nicht.
 *
 * Rückkehr zum Ruhebild (F-020 Nachtrag, wie light.js Regel 2): Zellen mit stillstehendem Rohwert bekommen nach HOLD
 * Takten ihre Stufe ohne Hysterese; solange eine Zelle nur durch Hysterese abweicht, wird je Takt neu gerechnet.
 *
 * Takt: 12 fps aus der Spielzeit (Logikschritte von core.js). In der Pause steht die Spielzeit → kein Lichttakt,
 * das zuletzt berechnete Bild bleibt stehen. Ohne veränderliche Werte (kein flicker, kein set()) wird nichts neu gemalt.
 *
 * Quellen der Karte (F-020: Werte aus den Daten, nicht aus dem Code): jedes Objekt in karte.objekte mit Feld
 * licht { dx, dy, rx, ry, intensity, rest? } (F-021 b: rest 0..1, Standard 1 = Ruhewert für Ruhebild und Regel 2) ist eine Quelle; Lichtpunkt = (x + dx, y + dy), Ellipse rx/ry, alles in Kartenpixeln.
 * Geprüft wird das Feld in karte.js (Schema karte.schema.json). Karten ohne licht-Objekte (test, waldpfad) bekommen
 * keine Lichtebene → Bild unverändert. Hier stehen nur Prinzip-Konstanten (Zelle, Takt, Stufen, Abdunklung, Palette).
 *
 * Schnittstelle (z. B. für HEX-019 Laternenflackern):
 *   Spiel.licht.liste()            -> [{id, typ, x, y}]   ids der Kartenquellen: '<typ>-<n>' (laterne-0, laterne-1, …)
 *   Spiel.licht.getRest(id)        -> Ruhewert der Quelle (licht.rest, Standard 1) oder null bei unbekannter id (F-021 b)
 *   Spiel.licht.set(id, v)         v 0..1, Helligkeit einer Quelle (z. B. im selben Takt wie die Flamme); Farbgrenze bleibt
 *   Spiel.licht.add({ id, x, y, radius | rx, ry, intensity, rest })   x, y, Radien in Kartenpixeln; Farbe immer warm
 *   Spiel.licht.remove(id)
 *   Spiel.licht.an(bool)           Lichtebene ein/aus (für Tests/Vergleich)
 *   Spiel.licht.stats              { ticks, malen }  Zähler für Messungen
 *   Spiel.licht.zellen(), ebene(), HOLD   nur für Tests (Stufen je Zelle, Lichtebene, Ruhe-Takte)
 * Beim Kartenwechsel werden alle Quellen neu aus der Zielkarte gesetzt (add()-Quellen gelten nur für die aktuelle Karte).
 */
(function () {
  'use strict';
  var S = window.Spiel;
  var CELL = 4, FPS = 12, TICK = 1000 / FPS;
  var STEPS = [0.15, 0.40, 0.70], HYST = 0.03;
  // F-020 Nachtrag, Regel 2 aus light.js (fix-v4): steht der ungekappte Rohwert einer Zelle HOLD Lichttakte lang still
  // (|Δ| < STILL), bekommt sie die Stufe ohne Hysterese – wie im Ruhebild. HOLD 2 Takte = 167 ms (light.js: 150 ms).
  var HOLD = 2, STILL = 1e-6;
  var AMBIENT = 0.40;                                   // Abdunklung außerhalb der Lichter (0.5 = neutral)
  var PALETTE = { warm: [[150, 136, 118], [170, 146, 116], [192, 158, 114]] };   // wie light.js 'warm'

  var lights = [], GW = 0, GH = 0, canvas = null, cctx = null, img = null;
  var sum = null, letzt = null, ruhig = null, offen = 0, level = null, aktiv = true, dirty = true, uhr = 0, letzteSpielzeit = null;
  var stats = { ticks: 0, malen: 0 };

  function groesse(w, h) {
    GW = Math.ceil(w / CELL); GH = Math.ceil(h / CELL);
    canvas = document.createElement('canvas'); canvas.width = GW; canvas.height = GH;
    cctx = canvas.getContext('2d'); img = cctx.createImageData(GW, GH);
    sum = new Float32Array(GW * GH); level = new Uint8Array(GW * GH);
    letzt = new Float32Array(GW * GH); ruhig = new Uint8Array(GW * GH);
  }

  function add(cfg) {
    remove(cfg.id, true);
    var r = +cfg.radius || 0;
    lights.push({ id: String(cfg.id), typ: cfg.typ || null, x: +cfg.x, y: +cfg.y, rx: +cfg.rx || r, ry: +cfg.ry || r,
      intensity: cfg.intensity == null ? 1 : +cfg.intensity, rest: cfg.rest == null ? 1 : +cfg.rest,
      value: cfg.rest == null ? 1 : +cfg.rest });
    dirty = true;
    return String(cfg.id);
  }
  function remove(id, still) {
    for (var i = lights.length - 1; i >= 0; i--) if (lights[i].id === String(id)) lights.splice(i, 1);
    if (!still) dirty = true;
  }
  function set(id, v) {
    v = Math.max(0, Math.min(1, +v));
    for (var i = 0; i < lights.length; i++) if (lights[i].id === String(id) && lights[i].value !== v) { lights[i].value = v; dirty = true; }
  }

  // Quellen aus der Karte: Objekte mit Feld licht (core.js ruft das in betrete() auf; karte.js hat das Feld geprüft)
  function setzeKarte(k) {
    lights = []; level = null; letzteSpielzeit = null; uhr = 0;
    groesse(k.pxBreite, k.pxHoehe);
    var n = {};
    k.objekte.forEach(function (o) {
      var l = o.licht;
      if (!l) return;
      var i = n[o.typ] = (n[o.typ] || 0);
      n[o.typ]++;
      add({ id: o.typ + '-' + i, typ: o.typ, x: o.x + l.dx, y: o.y + l.dy, rx: l.rx, ry: l.ry, intensity: l.intensity, rest: l.rest });   // F-021 b: rest aus den Daten (fehlt → 1)
    });
    level = new Uint8Array(GW * GH);
    dirty = true; rechne(true);
  }

  function stepOf(v) { return v >= STEPS[2] ? 3 : v >= STEPS[1] ? 2 : v >= STEPS[0] ? 1 : 0; }

  // Farbgrenze/Größe fest; nur die Helligkeit (value) ändert sich. ruhe = true: Stufen ohne Hysterese (Ruhebild).
  function rechne(ruhe) {
    if (!lights.length) return;
    sum.fill(0); offen = 0;
    for (var k = 0; k < lights.length; k++) {
      var L = lights[k], amp = L.intensity * L.value;
      if (amp <= 0) continue;
      var rx2 = L.rx * L.rx, ry2 = L.ry * L.ry;
      var gx0 = Math.max(0, Math.floor((L.x - L.rx) / CELL)), gx1 = Math.min(GW - 1, Math.floor((L.x + L.rx) / CELL));
      var gy0 = Math.max(0, Math.floor((L.y - L.ry) / CELL)), gy1 = Math.min(GH - 1, Math.floor((L.y + L.ry) / CELL));
      for (var gy = gy0; gy <= gy1; gy++) {
        var dy = gy * CELL + CELL / 2 - L.y;
        for (var gx = gx0; gx <= gx1; gx++) {
          var dx = gx * CELL + CELL / 2 - L.x, d2 = dx * dx / rx2 + dy * dy / ry2;
          if (d2 < 1) sum[gy * GW + gx] += amp * (1 - d2);
        }
      }
    }
    var d = img.data, a = Math.round(AMBIENT * 255), P = PALETTE.warm;
    for (var j = 0, p = 0; j < sum.length; j++, p += 4) {
      var v = Math.min(1, sum[j]), lv = level[j], ziel = stepOf(v);
      if (Math.abs(sum[j] - letzt[j]) < STILL) { if (ruhig[j] < 255) ruhig[j]++; } else ruhig[j] = 0;   // ungekappter Rohwert
      letzt[j] = sum[j];
      if (ruhe || ruhig[j] >= HOLD) lv = ziel;         // Regel 2: Wert steht → Stufe wie im Ruhebild
      else {
        while (lv < 3 && v >= STEPS[lv] + HYST) lv++;
        while (lv > 0 && v < STEPS[lv - 1] - HYST) lv--;
      }
      if (lv !== ziel) offen++;                          // Zelle hält ihre Stufe nur durch Hysterese
      level[j] = lv;
      if (lv === 0) { d[p] = d[p + 1] = d[p + 2] = a; } else { var c = P[lv - 1]; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; }
      d[p + 3] = 255;
    }
    cctx.putImageData(img, 0, 0);
    dirty = offen > 0;                                  // weiterrechnen, bis jede Zelle auf ihrer Ruhestufe ist
    stats.malen++;
  }

  // spielzeit in ms (steht in der Pause). Ein Lichttakt je 1/12 s Spielzeit.
  function tick(spielzeit) {
    if (!lights.length) return;
    if (letzteSpielzeit === null) letzteSpielzeit = spielzeit;
    uhr += Math.max(0, spielzeit - letzteSpielzeit);
    letzteSpielzeit = spielzeit;
    if (uhr < TICK - 1e-6) return;                     // 1e-6: Rundung von 5 × 1000/60 bzw. 1000/12 verschluckt keinen Takt
    uhr = Math.max(0, uhr - TICK);
    stats.ticks++;
    if (dirty) rechne(false);
  }

  // Zeichnen über die Spielfläche (nach den Objekten, vor Textblase/Debug/Abblende)
  function zeichne(ctx, kamera) {
    if (!aktiv || !lights.length || !canvas) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.drawImage(canvas, -kamera.x, -kamera.y, GW * CELL, GH * CELL);
    ctx.restore();
  }

  // F-021 b: Ruhewert einer Quelle (für deko.js), null bei unbekannter id
  function getRest(id) { for (var i = 0; i < lights.length; i++) if (lights[i].id === String(id)) return lights[i].rest; return null; }

  S.licht = {
    getRest: getRest,
    add: function (cfg) { var id = add(cfg); return id; }, set: set, remove: function (id) { remove(id); },
    liste: function () { return lights.map(function (L) { return { id: L.id, typ: L.typ, x: L.x, y: L.y }; }); },
    an: function (b) { aktiv = !!b; }, stats: stats,
    zellen: function () { return level ? Array.from(level) : []; },   // Stufen je Zelle (Tests F-020 Nachtrag)
    ebene: function () { return canvas; }, HOLD: HOLD,                    // Lichtebene GW×GH (Tests)
    setzeKarte: setzeKarte, tick: tick, zeichne: zeichne, CELL: CELL, FPS: FPS
  };
})();
