/* HEX-027 Spielstand (HP). localStorage-Schlüssel hexe-spielstand, Schema v1.
   Schnittstelle:
   - Spiel.speicher.KEY, SCHEMA_V = 1
   - existiert() → true nur bei gültigem v1-Stand (für Titel „Fortsetzen“)
   - lies() → Stand oder null (unbekanntes v / kaputt → null)
   - speichereJetzt() → schreibt Ort+Inventar+weg aus dem laufenden Spiel; false wenn nicht möglich
   Kein beforeunload. Geöffnete Wege absichtlich nicht in v1. */
(function () {
  'use strict';
  var S = window.Spiel = window.Spiel || {};
  var KEY = 'hexe-spielstand';
  var SCHEMA_V = 1;
  var SORTEN = ['mondkraut', 'gluehpilz', 'nebelfarn'];

  function liesRoh() {
    try {
      var t = localStorage.getItem(KEY);
      if (t == null || t === '') return null;
      return JSON.parse(t);
    } catch (e) { return null; }
  }

  function gueltig(o) {
    if (!o || typeof o !== 'object' || o.v !== SCHEMA_V) return false;
    var ort = o.ort;
    if (!ort || typeof ort.karte !== 'string' || !ort.karte || typeof ort.einstieg !== 'string' || !ort.einstieg) return false;
    var inv = o.inventar;
    if (!inv || typeof inv !== 'object') return false;
    for (var i = 0; i < SORTEN.length; i++) {
      var n = inv[SORTEN[i]];
      if (typeof n !== 'number' || !isFinite(n) || n < 0 || Math.floor(n) !== n) return false;
    }
    if (!Array.isArray(o.weg)) return false;
    for (var j = 0; j < o.weg.length; j++) {
      var e = o.weg[j];
      if (!e || typeof e.karte !== 'string' || !e.karte || typeof e.zone !== 'string' || !e.zone) return false;
    }
    return true;
  }

  function lies() {
    var o = liesRoh();
    return gueltig(o) ? o : null;
  }

  function existiert() { return lies() !== null; }

  function speichereJetzt() {
    if (!S.aktuelleKarte || !S.zustand || !S.inventar) return false;
    var einstieg = S.zustand.einstieg;
    if (typeof einstieg !== 'string' || !einstieg) return false;
    var stand = {
      v: SCHEMA_V,
      ort: { karte: S.aktuelleKarte.id, einstieg: einstieg },
      inventar: S.inventar.stand(),
      weg: S.inventar.gesammelt()
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
