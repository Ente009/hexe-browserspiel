/* HEX-012 Karten-Lader und Kollision.
   Format: assets/spiel/karten/<id>.json, Schema karte.schema.json (Plan HEX-010 §2).
   Kollision = Tile-Raster (0/1) + Fuß-Rechtecke der Objekte. Debug-Ansicht per Taste K (Belegung in eingabe.js). */
(function () {
  'use strict';
  var PFAD = 'assets/spiel/karten/';
  // Gemeinsame Fußbox der Hexe (F-011): einzige Definition, genutzt von Lader (Einstiege) und hexe-figur.js (Bewegung)
  var FUSS = { w: 10, h: 6 };
  function fussRechteck(x, y) { return { x: x - FUSS.w / 2, y: y - FUSS.h, w: FUSS.w, h: FUSS.h }; }
  // Überlappungsfläche eines Rechtecks mit Blockiertem: Wand-Tiles, Fläche außerhalb der Karte, Fuß-Rechtecke
  function ueberlappung(r, blockiert, breite, hoehe, tile, fuesse) {
    var a = 0, x0 = Math.floor(r.x / tile), x1 = Math.floor((r.x + r.w - 1e-9) / tile), y0 = Math.floor(r.y / tile), y1 = Math.floor((r.y + r.h - 1e-9) / tile);
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= breite || ty >= hoehe || blockiert(tx, ty)) {
        var w = Math.min(r.x + r.w, (tx + 1) * tile) - Math.max(r.x, tx * tile), h = Math.min(r.y + r.h, (ty + 1) * tile) - Math.max(r.y, ty * tile);
        if (w > 0 && h > 0) a += w * h;
      }
    }
    for (var i = 0; i < fuesse.length; i++) {
      var f = fuesse[i], fw = Math.min(r.x + r.w, f.x + f.w) - Math.max(r.x, f.x), fh = Math.min(r.y + r.h, f.y + f.h) - Math.max(r.y, f.y);
      if (fw > 0 && fh > 0) a += fw * fh;
    }
    return a;
  }
  // Überlappung der Fußbox am Fußpunkt x/y – gemeinsame Regel für Lader (Einstiege) und Bewegung (hexe-figur.js)
  function fussUeberlappung(x, y, blockiert, breite, hoehe, tile, fuesse) { return ueberlappung(fussRechteck(x, y), blockiert, breite, hoehe, tile, fuesse); }

  // Prüft das Format vollständig nach karte.schema.json (F-009); wirft Error „Karte "<id>": …“
  var ST = window.Spiel.standorte;   // HEX-017: standorte.js lädt vor karte.js
  var TILE = 16, RICHTUNGEN = ['hoch', 'runter', 'links', 'rechts']; var EBENEN = ['objekt', 'ueber']; var LICHT_FELDER = ['dx', 'dy', 'rx', 'ry', 'intensity'], LICHT_OPTIONAL = ['rest'];   // HEX-018, F-021 b
  var DEKO_FELDER = ['katze', 'dampf', 'blaetter', 'nebel'], KATZE_FELDER = ['x', 'y', 'w', 'h'], DAMPF_FELDER = ['x', 'y'];   // F-021 a
  var NEBEL_FELDER = ['dichte', 'farbe', 'hoehe'];   // HEX-021
  function pruefe(k, id) {
    function fehler(t) { throw new Error('Karte "' + id + '": ' + t); }
    function istObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
    function zahl(v, wo) { if (typeof v !== 'number' || !isFinite(v)) fehler(wo + ' muss eine Zahl sein (ist ' + JSON.stringify(v) + ')'); }
    function ganz(v, wo) { zahl(v, wo); if (v % 1 || v < 1) fehler(wo + ' muss ganze Zahl >= 1 sein (ist ' + v + ')'); }
    function text(v, wo) { if (typeof v !== 'string') fehler(wo + ' muss Text sein (ist ' + JSON.stringify(v) + ')'); }
    function textOderNull(v, wo) { if (v !== null && typeof v !== 'string') fehler(wo + ' muss Text oder null sein'); }
    function liste(v, wo) { if (v === undefined) fehler(wo + ' fehlt (leere Liste [] angeben)'); if (!Array.isArray(v)) fehler(wo + ' muss eine Liste sein'); return v; }
    function rechteck(r, wo) { if (!istObj(r)) fehler(wo + ' muss ein Objekt {x,y,w,h} sein'); zahl(r.x, wo + '.x'); zahl(r.y, wo + '.y'); zahl(r.w, wo + '.w'); zahl(r.h, wo + '.h'); if (r.w < 0 || r.h < 0) fehler(wo + '.w/h dürfen nicht negativ sein'); }

    if (!istObj(k)) fehler('kein JSON-Objekt');
    text(k.id, 'id'); if (k.id !== id) fehler('id "' + k.id + '" passt nicht zum Dateinamen');
    ganz(k.breite, 'breite'); ganz(k.hoehe, 'hoehe'); zahl(k.tile, 'tile');
    if (k.tile !== TILE) fehler('tile muss ' + TILE + ' sein (ist ' + k.tile + ')');
    if ('boden' in k) textOderNull(k.boden, 'boden');
    if (!Array.isArray(k.kollision)) fehler('kollision fehlt oder ist keine Liste');
    if (k.kollision.length !== k.hoehe) fehler('kollision braucht ' + k.hoehe + ' Zeilen (hat ' + k.kollision.length + ')');
    k.kollision.forEach(function (z, y) {
      if (typeof z !== 'string' || z.length !== k.breite || /[^01]/.test(z)) fehler('kollision Zeile ' + y + ' braucht ' + k.breite + ' Zeichen 0/1');
    });
    var B = k.breite * TILE, H = k.hoehe * TILE;

    liste(k.objekte, 'objekte').forEach(function (o, i) {
      var wo = 'objekte[' + i + ']';
      if (!istObj(o)) fehler(wo + ' muss ein Objekt sein');
      text(o.typ, wo + '.typ'); zahl(o.x, wo + '.x'); zahl(o.y, wo + '.y');
      if ('sprite' in o) textOderNull(o.sprite, wo + '.sprite');
      if ('fuss' in o) rechteck(o.fuss, wo + '.fuss');
      // HEX-015: Zeichen-Ebene und Bildrechteck (nur Info, gezeichnet wird über sprite + anker)
      if ('ebene' in o && EBENEN.indexOf(o.ebene) < 0) fehler(wo + '.ebene muss "objekt" oder "ueber" sein (ist ' + JSON.stringify(o.ebene) + ')');
      // HEX-017: sichtbare Absperrung eines gesperrten Standorts
      if ('gesperrt' in o) { text(o.gesperrt, wo + '.gesperrt'); if (!ST.gesperrt(o.gesperrt)) fehler(wo + '.gesperrt "' + o.gesperrt + '" ist kein gesperrter Standort (standorte.js)'); }
      // HEX-018 (F-020): Lichtquelle am Objekt, Werte aus den Daten (licht.js enthält keine Quellwerte)
      if ('licht' in o) {
        var lw = wo + '.licht', l = o.licht;
        if (!istObj(l)) fehler(lw + ' muss ein Objekt {dx, dy, rx, ry, intensity} sein (ist ' + JSON.stringify(l) + ')');
        Object.keys(l).forEach(function (f) { if (LICHT_FELDER.indexOf(f) < 0 && LICHT_OPTIONAL.indexOf(f) < 0) fehler(lw + '.' + f + ' ist kein erlaubtes Feld (erlaubt: ' + LICHT_FELDER.concat(LICHT_OPTIONAL).join(', ') + ')'); });
        LICHT_FELDER.forEach(function (f) { if (!(f in l)) fehler(lw + '.' + f + ' fehlt'); zahl(l[f], lw + '.' + f); });
        if (l.rx <= 0) fehler(lw + '.rx muss > 0 sein (ist ' + l.rx + ')');
        if (l.ry <= 0) fehler(lw + '.ry muss > 0 sein (ist ' + l.ry + ')');
        if (l.intensity < 0 || l.intensity > 1) fehler(lw + '.intensity muss zwischen 0 und 1 liegen (ist ' + l.intensity + ')');
        // F-021 b: optionaler Ruhewert (Ruhebild und Regel 2 in licht.js), Standard 1
        if ('rest' in l) { zahl(l.rest, lw + '.rest'); if (l.rest < 0 || l.rest > 1) fehler(lw + '.rest muss zwischen 0 und 1 liegen (ist ' + l.rest + ')'); }
      }
      if ('bild' in o) {
        if (!Array.isArray(o.bild) || o.bild.length !== 4) fehler(wo + '.bild muss eine Liste [x,y,w,h] sein');
        o.bild.forEach(function (v, j) { zahl(v, wo + '.bild[' + j + ']'); });
        if (o.bild[2] < 0 || o.bild[3] < 0) fehler(wo + '.bild w/h dürfen nicht negativ sein');
      }
    });
    var iids = {};
    liste(k.interaktionen, 'interaktionen').forEach(function (z, i) {
      var wo = 'interaktionen[' + i + ']';
      rechteck(z, wo); text(z.id, wo + '.id');
      if (iids[z.id] !== undefined) fehler(wo + '.id "' + z.id + '" doppelt (schon bei interaktionen[' + iids[z.id] + '])');
      iids[z.id] = i;
      if ('text' in z) text(z.text, wo + '.text');
      if ('aktion' in z) text(z.aktion, wo + '.aktion');
      if ('satz' in z) text(z.satz, wo + '.satz');
      // F-017/F-018: aktion sprechen/sammeln braucht satz (kein stiller Rückfall auf z.text)
      if ((z.aktion === 'sprechen' || z.aktion === 'sammeln') && !('satz' in z)) fehler(wo + '.satz fehlt (Pflicht bei aktion "' + z.aktion + '")');
      // HEX-017: aktion gesperrt braucht satz und ziel = gesperrter Standort
      if (z.aktion === 'gesperrt') {
        if (!('satz' in z)) fehler(wo + '.satz fehlt (Pflicht bei aktion "gesperrt")');
        text(z.ziel, wo + '.ziel'); if (!ST.gesperrt(z.ziel)) fehler(wo + '.ziel "' + z.ziel + '" ist kein gesperrter Standort (standorte.js)');
      }
      if ('platzhalter' in z && typeof z.platzhalter !== 'boolean') fehler(wo + '.platzhalter muss true oder false sein (ist ' + JSON.stringify(z.platzhalter) + ')');
    });
    liste(k.ausgaenge, 'ausgaenge').forEach(function (a, i) {
      var wo = 'ausgaenge[' + i + ']';
      if (!istObj(a)) fehler(wo + ' muss ein Objekt sein');
      rechteck(a.zone, wo + '.zone');
      text(a.ziel, wo + '.ziel'); text(a.einstieg, wo + '.einstieg');
      // HEX-017: fremdes Ziel muss ein offener Standort sein (Datei/Einstieg prüft lade())
      if (a.ziel !== k.id) {
        if (!ST.gib(a.ziel)) fehler(wo + '.ziel "' + a.ziel + '" ist kein Standort (standorte.js)');
        if (!ST.offen(a.ziel)) fehler(wo + '.ziel "' + a.ziel + '" ist gesperrt (standorte.js) – Ausgang nicht erlaubt');
      }
    });
    var objFuesse = k.objekte.filter(function (o) { return o.fuss; }).map(function (o) { return { x: o.x + o.fuss.x, y: o.y + o.fuss.y, w: o.fuss.w, h: o.fuss.h }; });
    if (!istObj(k.einstiege)) fehler('einstiege fehlt oder ist kein Objekt');
    if (!('start' in k.einstiege)) fehler('einstiege.start fehlt');
    Object.keys(k.einstiege).forEach(function (n) {
      var e = k.einstiege[n], wo = 'einstiege.' + n;
      if (!istObj(e)) fehler(wo + ' muss ein Objekt {x,y} sein');
      zahl(e.x, wo + '.x'); zahl(e.y, wo + '.y');
      if ('richtung' in e && RICHTUNGEN.indexOf(e.richtung) < 0) fehler(wo + '.richtung muss hoch/runter/links/rechts sein');
      if (e.x < 0 || e.y < 0 || e.x >= B || e.y >= H) fehler(wo + ' (' + e.x + ',' + e.y + ') liegt außerhalb der Karte (0–' + (B - 1) + ', 0–' + (H - 1) + ')');
      // F-011: ganze Fußbox (gleiche Geometrie wie hexe-figur.js) muss frei sein – Wände, Kartenrand, Objekt-Füße
      // F-012: einzige Regel, dieselbe wie bei der Bewegung: fussUeberlappung() > 0 = blockiert (kein extra Punkttest)
      var fr = fussRechteck(e.x, e.y);
      var tiefe = fussUeberlappung(e.x, e.y, function (tx, ty) { return k.kollision[ty].charAt(tx) === '1'; }, k.breite, k.hoehe, TILE, objFuesse);
      if (tiefe > 0) fehler(wo + ' (' + e.x + ',' + e.y + '): Fußbox ' + FUSS.w + '×' + FUSS.h + ' (x ' + fr.x + '–' + (fr.x + fr.w) + ', y ' + fr.y + '–' + (fr.y + fr.h) + ') überlappt Wand, Kartenrand oder Objekt-Fuß');
    });
    // F-021 a: optionale Deko-Daten für js/spiel/deko.js (HEX-019b), Kartenpixel, ganze Zahlen >= 0 innerhalb der Karte
    if ('deko' in k) {
      var dk = k.deko;
      if (!istObj(dk)) fehler('deko muss ein Objekt {katze, dampf, blaetter, nebel} sein (ist ' + JSON.stringify(dk) + ')');
      var nur = function (o, erlaubt, wo) { Object.keys(o).forEach(function (f) { if (erlaubt.indexOf(f) < 0) fehler(wo + '.' + f + ' ist kein erlaubtes Feld (erlaubt: ' + erlaubt.join(', ') + ')'); }); };
      var px = function (v, wo) { if (typeof v !== 'number' || v % 1 !== 0 || v < 0) fehler(wo + ' muss ganze Zahl >= 0 sein (ist ' + JSON.stringify(v) + ')'); };
      nur(dk, DEKO_FELDER, 'deko');
      if ('katze' in dk) {
        var kz = dk.katze;
        if (!istObj(kz)) fehler('deko.katze muss ein Objekt {x,y,w,h} sein (ist ' + JSON.stringify(kz) + ')');
        nur(kz, KATZE_FELDER, 'deko.katze');
        KATZE_FELDER.forEach(function (f) { if (!(f in kz)) fehler('deko.katze.' + f + ' fehlt'); px(kz[f], 'deko.katze.' + f); });
        if (kz.w <= 0 || kz.h <= 0) fehler('deko.katze.w/h müssen > 0 sein (ist ' + kz.w + '×' + kz.h + ')');
        if (kz.x + kz.w > B || kz.y + kz.h > H) fehler('deko.katze (' + kz.x + ',' + kz.y + ',' + kz.w + '×' + kz.h + ') liegt nicht ganz in der Karte (' + B + '×' + H + ')');
      }
      if ('dampf' in dk) {
        if (!Array.isArray(dk.dampf)) fehler('deko.dampf muss eine Liste [{x,y}] sein (ist ' + JSON.stringify(dk.dampf) + ')');
        dk.dampf.forEach(function (d, i) {
          var wo = 'deko.dampf[' + i + ']';
          if (!istObj(d)) fehler(wo + ' muss ein Objekt {x,y} sein');
          nur(d, DAMPF_FELDER, wo);
          DAMPF_FELDER.forEach(function (f) { if (!(f in d)) fehler(wo + '.' + f + ' fehlt'); px(d[f], wo + '.' + f); });
          if (d.x >= B || d.y >= H) fehler(wo + ' (' + d.x + ',' + d.y + ') liegt außerhalb der Karte (0–' + (B - 1) + ', 0–' + (H - 1) + ')');
        });
      }
      if ('blaetter' in dk && typeof dk.blaetter !== 'boolean') fehler('deko.blaetter muss true oder false sein (ist ' + JSON.stringify(dk.blaetter) + ')');
      // HEX-021: deko.nebel {dichte 0<..1, farbe "#rrggbb", hoehe ganze Zahl 1..Kartenhöhe px} (Format Craft „Format deko.nebel (HP, fest)“)
      if ('nebel' in dk) {
        var nb = dk.nebel;
        if (!istObj(nb)) fehler('deko.nebel muss ein Objekt {dichte, farbe, hoehe} sein (ist ' + JSON.stringify(nb) + ')');
        nur(nb, NEBEL_FELDER, 'deko.nebel');
        NEBEL_FELDER.forEach(function (f) { if (!(f in nb)) fehler('deko.nebel.' + f + ' fehlt'); });
        if (typeof nb.dichte !== 'number' || !(nb.dichte > 0 && nb.dichte <= 1)) fehler('deko.nebel.dichte muss Zahl > 0 und <= 1 sein (ist ' + JSON.stringify(nb.dichte) + ')');
        if (typeof nb.farbe !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(nb.farbe)) fehler('deko.nebel.farbe muss "#rrggbb" sein (ist ' + JSON.stringify(nb.farbe) + ')');
        if (typeof nb.hoehe !== 'number' || nb.hoehe % 1 !== 0 || nb.hoehe < 1 || nb.hoehe > H) fehler('deko.nebel.hoehe muss ganze Zahl 1–' + H + ' sein (ist ' + JSON.stringify(nb.hoehe) + ')');
      }
    }
    // HEX-017: Karte eines Standorts hat alle in standorte.js genannten Einstiege
    var st = ST.gib(k.id);
    if (st) st.einstiege.forEach(function (n) { if (!Object.prototype.hasOwnProperty.call(k.einstiege, n)) fehler('einstiege.' + n + ' fehlt (laut standorte.js)'); });
    // Ausgang auf die eigene Karte muss einen vorhandenen Einstieg nennen (fremde Karten: HEX-017)
    k.ausgaenge.forEach(function (a, i) {
      if (a.ziel === k.id && !Object.prototype.hasOwnProperty.call(k.einstiege, a.einstieg)) fehler('ausgaenge[' + i + '].einstieg "' + a.einstieg + '" gibt es in dieser Karte nicht');
    });
  }

  function Karte(k) {
    this.daten = k;
    this.id = k.id; this.breite = k.breite; this.hoehe = k.hoehe; this.tile = k.tile;
    this.pxBreite = k.breite * k.tile; this.pxHoehe = k.hoehe * k.tile;
    this.objekte = k.objekte || []; this.interaktionen = k.interaktionen || [];
    this.ausgaenge = k.ausgaenge || []; this.einstiege = k.einstiege;
    this.raster = new Uint8Array(k.breite * k.hoehe);
    for (var y = 0; y < k.hoehe; y++) for (var x = 0; x < k.breite; x++) this.raster[y * k.breite + x] = k.kollision[y].charCodeAt(x) === 49 ? 1 : 0;
    // Fuß-Rechtecke in Weltpixeln
    this.fuesse = this.objekte.filter(function (o) { return o.fuss; }).map(function (o) {
      return { x: o.x + o.fuss.x, y: o.y + o.fuss.y, w: o.fuss.w, h: o.fuss.h };
    });
  }
  // Tile blockiert? Außerhalb der Karte zählt als blockiert.
  Karte.prototype.tileBlockiert = function (tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.breite || ty >= this.hoehe) return true;
    return this.raster[ty * this.breite + tx] === 1;
  };
  // Rechteck {x,y,w,h} in Weltpixeln überlappt Wand-Tile oder Objekt-Fuß?
  Karte.prototype.kollidiert = function (r) {
    var t = this.tile, eps = 1e-6;
    var x0 = Math.floor(r.x / t), x1 = Math.floor((r.x + r.w - eps) / t);
    var y0 = Math.floor(r.y / t), y1 = Math.floor((r.y + r.h - eps) / t);
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) if (this.tileBlockiert(tx, ty)) return true;
    for (var i = 0; i < this.fuesse.length; i++) {
      var f = this.fuesse[i];
      if (r.x < f.x + f.w && f.x < r.x + r.w && r.y < f.y + f.h && f.y < r.y + r.h) return true;
    }
    return false;
  };

  // Überlappungsfläche (px²) eines Rechtecks mit Wänden, Außenbereich und Objekt-Füßen
  // Fußbox am Fußpunkt: dieselbe Funktion wie im Lader
  Karte.prototype.fussUeberlappung = function (x, y) {
    var self = this;
    return fussUeberlappung(x, y, function (tx, ty) { return self.raster[ty * self.breite + tx] === 1; }, this.breite, this.hoehe, this.tile, this.fuesse);
  };
  Karte.prototype.ueberlappung = function (r) {
    var self = this;
    return ueberlappung(r, function (tx, ty) { return self.raster[ty * self.breite + tx] === 1; }, this.breite, this.hoehe, this.tile, this.fuesse);
  };

  // Lädt <id>.json; Promise<Karte>. Jeder Fehler (Netz, Syntax, Format) mit Kartenname.
  function lade(id) {
    var name = 'Karte "' + id + '": ';
    return fetch(PFAD + id + '.json', { cache: 'no-cache' }).then(function (a) {
      if (!a.ok) throw new Error(name + 'nicht gefunden (' + a.status + ')');
      return a.text();
    }, function () {
      throw new Error(name + 'nicht ladbar' + (location.protocol === 'file:' ? ' – Spiel über einen Webserver öffnen (file:// erlaubt kein Laden von JSON)' : ''));
    }).then(function (t) {
      var k;
      try { k = JSON.parse(t); } catch (e) { throw new Error(name + 'JSON-Syntaxfehler – ' + e.message); }
      pruefe(k, id);
      return pruefeZiele(k, name).then(function () { return new Karte(k); });
    });
  }

  // HEX-017: Zielkarte jedes fremden Ausgangs muss existieren und den Einstieg haben (nur lesen, nicht rekursiv prüfen)
  function pruefeZiele(k, name) {
    return Promise.all(k.ausgaenge.map(function (a, i) {
      if (a.ziel === k.id) return null;
      var wo = name + 'ausgaenge[' + i + '].ziel "' + a.ziel + '": ';
      var p = fetch(PFAD + a.ziel + '.json', { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) return { fehlt: r.status };
        return r.text().then(function (t) { try { return { k: JSON.parse(t) }; } catch (e) { return { syntax: true }; } });
      }, function () { return { fehlt: 'Netz' }; });
      return p.then(function (z) {
        if (z.fehlt) throw new Error(wo + 'Zielkarte ' + PFAD + a.ziel + '.json nicht gefunden (' + z.fehlt + ')');
        if (z.syntax) throw new Error(wo + 'Zielkarte hat JSON-Syntaxfehler');
        var e = z.k && z.k.einstiege;
        if (!e || typeof e !== 'object' || !Object.prototype.hasOwnProperty.call(e, a.einstieg)) throw new Error(name + 'ausgaenge[' + i + '].einstieg "' + a.einstieg + '" gibt es in Karte "' + a.ziel + '" nicht');
      });
    }));
  }

  window.Spiel = window.Spiel || {};
  window.Spiel.karte = { lade: lade, pruefe: pruefe, Karte: Karte, FUSS: FUSS, fussRechteck: fussRechteck, debug: false };
})();
