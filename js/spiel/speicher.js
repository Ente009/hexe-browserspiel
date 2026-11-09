/* HEX-027/028 Spielstand (HP). localStorage-Schlüssel hexe-spielstand.
   Schema v2: {v:2, ort:{karte,einstieg}, inventar:{…}, weg:[{karte,zone},…], aufgaben:[id,…]}
   v1 lesen → v2 mit aufgaben=[]; Schreiben immer v2. Unbekannte v → kein Fortsetzen.
   Schnittstelle: KEY, SCHEMA_V=2, existiert(), lies(), speichereJetzt(), gueltig() */
(function () {
  'use strict';
  var S = window.Spiel = window.Spiel || {};
  var KEY = 'hexe-spielstand';
  var SCHEMA_V = 2;
  var SORTEN = ['mondkraut', 'gluehpilz', 'nebelfarn'];

  function liesRoh() {
    try {
      var t = localStorage.getItem(KEY);
      if (t == null || t === '') return null;
      return JSON.parse(t);
    } catch (e) { return null; }
  }

  function ortOk(ort) {
    return !!(ort && typeof ort.karte === 'string' && ort.karte && typeof ort.einstieg === 'string' && ort.einstieg);
  }
  function inventarOk(inv) {
    if (!inv || typeof inv !== 'object') return false;
    for (var i = 0; i < SORTEN.length; i++) {
      var n = inv[SORTEN[i]];
      if (typeof n !== 'number' || !isFinite(n) || n < 0 || Math.floor(n) !== n) return false;
    }
    return true;
  }
  function wegOk(weg) {
    if (!Array.isArray(weg)) return false;
    for (var j = 0; j < weg.length; j++) {
      var e = weg[j];
      if (!e || typeof e.karte !== 'string' || !e.karte || typeof e.zone !== 'string' || !e.zone) return false;
    }
    return true;
  }
  function aufgabenOk(a) {
    if (!Array.isArray(a)) return false;
    for (var i = 0; i < a.length; i++) if (typeof a[i] !== 'string' || !a[i]) return false;
    return true;
  }

  function gueltigV1(o) {
    return !!(o && typeof o === 'object' && o.v === 1 && ortOk(o.ort) && inventarOk(o.inventar) && wegOk(o.weg));
  }
  function gueltigV2(o) {
    return !!(o && typeof o === 'object' && o.v === 2 && ortOk(o.ort) && inventarOk(o.inventar) && wegOk(o.weg) && aufgabenOk(o.aufgaben));
  }
  function gueltig(o) { return gueltigV2(o); }

  function lies() {
    var o = liesRoh();
    if (!o) return null;
    if (gueltigV2(o)) return o;
    if (gueltigV1(o)) {
      return {
        v: 2,
        ort: { karte: o.ort.karte, einstieg: o.ort.einstieg },
        inventar: o.inventar,
        weg: o.weg.slice(),
        aufgaben: []
      };
    }
    return null;
  }

  function existiert() { return lies() !== null; }

  function speichereJetzt() {
    if (!S.aktuelleKarte || !S.zustand || !S.inventar) return false;
    var einstieg = S.zustand.einstieg;
    if (typeof einstieg !== 'string' || !einstieg) return false;
    var aufg = (S.aufgaben && typeof S.aufgaben.erledigt === 'function') ? S.aufgaben.erledigt() : [];
    var stand = {
      v: SCHEMA_V,
      ort: { karte: S.aktuelleKarte.id, einstieg: einstieg },
      inventar: S.inventar.stand(),
      weg: S.inventar.gesammelt(),
      aufgaben: aufg
    };
    if (!gueltig(stand)) return false;
    try {
      localStorage.setItem(KEY, JSON.stringify(stand));
      return true;
    } catch (e) { return false; }
  }

  S.speicher = {
    KEY: KEY, SCHEMA_V: SCHEMA_V,
    existiert: existiert, lies: lies, speichereJetzt: speichereJetzt, gueltig: gueltig
  };
})();
