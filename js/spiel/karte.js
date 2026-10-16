/* HEX-012 Karten-Lader und Kollision.
   Format: assets/spiel/karten/<id>.json, Schema karte.schema.json (Plan HEX-010 §2).
   Kollision = Tile-Raster (0/1) + Fuß-Rechtecke der Objekte. Debug-Ansicht per Taste K (Belegung in eingabe.js). */
(function () {
  'use strict';
  var PFAD = 'assets/spiel/karten/';

  // Prüft das Format vollständig nach karte.schema.json (F-009); wirft Error „Karte "<id>": …“
  var TILE = 16, RICHTUNGEN = ['hoch', 'runter', 'links', 'rechts'];
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
    function frei(x, y) { var tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return k.kollision[ty].charAt(tx) === '0'; }

    liste(k.objekte, 'objekte').forEach(function (o, i) {
      var wo = 'objekte[' + i + ']';
      if (!istObj(o)) fehler(wo + ' muss ein Objekt sein');
      text(o.typ, wo + '.typ'); zahl(o.x, wo + '.x'); zahl(o.y, wo + '.y');
      if ('sprite' in o) textOderNull(o.sprite, wo + '.sprite');
      if ('fuss' in o) rechteck(o.fuss, wo + '.fuss');
    });
    var iids = {};
    liste(k.interaktionen, 'interaktionen').forEach(function (z, i) {
      var wo = 'interaktionen[' + i + ']';
      rechteck(z, wo); text(z.id, wo + '.id');
      if (iids[z.id] !== undefined) fehler(wo + '.id "' + z.id + '" doppelt (schon bei interaktionen[' + iids[z.id] + '])');
      iids[z.id] = i;
      if ('text' in z) text(z.text, wo + '.text');
      if ('aktion' in z) text(z.aktion, wo + '.aktion');
    });
    liste(k.ausgaenge, 'ausgaenge').forEach(function (a, i) {
      var wo = 'ausgaenge[' + i + ']';
      if (!istObj(a)) fehler(wo + ' muss ein Objekt sein');
      rechteck(a.zone, wo + '.zone');
      text(a.ziel, wo + '.ziel'); text(a.einstieg, wo + '.einstieg');
    });
    if (!istObj(k.einstiege)) fehler('einstiege fehlt oder ist kein Objekt');
    if (!('start' in k.einstiege)) fehler('einstiege.start fehlt');
    Object.keys(k.einstiege).forEach(function (n) {
      var e = k.einstiege[n], wo = 'einstiege.' + n;
      if (!istObj(e)) fehler(wo + ' muss ein Objekt {x,y} sein');
      zahl(e.x, wo + '.x'); zahl(e.y, wo + '.y');
      if ('richtung' in e && RICHTUNGEN.indexOf(e.richtung) < 0) fehler(wo + '.richtung muss hoch/runter/links/rechts sein');
      if (e.x < 0 || e.y < 0 || e.x >= B || e.y >= H) fehler(wo + ' (' + e.x + ',' + e.y + ') liegt außerhalb der Karte (0–' + (B - 1) + ', 0–' + (H - 1) + ')');
      if (!frei(e.x, e.y)) fehler(wo + ' (' + e.x + ',' + e.y + ') liegt in einer Wand');
    });
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
      return new Karte(k);
    });
  }

  window.Spiel = window.Spiel || {};
  window.Spiel.karte = { lade: lade, pruefe: pruefe, Karte: Karte, debug: false };
})();
