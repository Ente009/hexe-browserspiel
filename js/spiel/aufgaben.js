/* HEX-028 Aufgabenliste (HP). Text-HUD, Taste Q / Touch-Knopf.
   Schnittstelle:
   - Spiel.aufgaben.offen, liste(), erledigt(), setzeStand(ids), pruefe(), meldeSprechen(zonenId), zeichneHud(ctx), umschalten()
   Daten: assets/spiel/aufgaben.json (id, text, optional abhakbar:false).
   Abhakbar: kuerbis (einmal sprechen Zone id kuerbis), mondkraut (Anzahl >= 3).
   trank/fluss: sichtbar, nie abhakbar (Hooks später). Speichern bei neuem Abhaken via speichereJetzt.
   F-031: Fortschritt vor Definitionsbereitschaft behalten (erledigtIds liefert pending; abhaken vor JSON ok).
   F-032: speichereJetzt-Fehlschlag → speichernOffen, Retry in pruefe(). */
(function () {
  'use strict';
  var S = window.Spiel = window.Spiel || {};
  var PFAD = 'assets/spiel/aufgaben.json';
  var BREITE = 480;
  var ABHAKBAR_VORHER = { kuerbis: true, mondkraut: true };  // bekannt vor JSON
  var definitionen = [];   // [{id,text,abhakbar}]
  var erledigt = {};       // id -> true (auch vor Definitionsbereitschaft)
  var offen = false;
  var bereit = false;
  var speichernOffen = false;  // F-032: Retry wenn speichereJetzt false

  function findeDef(id) {
    for (var i = 0; i < definitionen.length; i++) if (definitionen[i].id === id) return definitionen[i];
    return null;
  }
  function istAbhakbar(id) {
    var def = findeDef(id);
    if (def) return !!def.abhakbar;
    if (id === 'trank' || id === 'fluss') return false;
    return !!ABHAKBAR_VORHER[id];
  }

  function lade() {
    fetch(PFAD).then(function (r) {
      if (!r.ok) throw new Error('aufgaben.json ' + r.status);
      return r.json();
    }).then(function (data) {
      var L = (data && data.aufgaben) || [];
      definitionen = L.map(function (a) {
        return {
          id: String(a.id),
          text: String(a.text || a.id),
          abhakbar: a.abhakbar !== false
        };
      }).filter(function (a) { return !!a.id; });
      // Nicht-abhakbare IDs aus Restore entfernen
      Object.keys(erledigt).forEach(function (id) {
        if (!istAbhakbar(id)) delete erledigt[id];
      });
      bereit = true;
      pruefe();
    }).catch(function (e) {
      console.error('HEX-028: aufgaben.json fehlt oder kaputt: ' + (e && e.message));
      bereit = true;
      pruefe();
    });
  }

  function liste() { return definitionen.slice(); }

  // F-031: auch vor bereit die gemerkten IDs liefern (sonst überschreibt Kartenwechsel mit [])
  function erledigtIds() {
    var L = [], seen = {};
    function add(id) {
      if (!id || seen[id] || !erledigt[id] || !istAbhakbar(id)) return;
      seen[id] = true; L.push(id);
    }
    if (definitionen.length) {
      definitionen.forEach(function (a) { add(a.id); });
    }
    Object.keys(erledigt).forEach(add);
    return L;
  }

  function setzeStand(ids) {
    erledigt = {};
    (ids || []).forEach(function (id) {
      if (typeof id !== 'string' || !id) return;
      if (!istAbhakbar(id)) return;
      erledigt[id] = true;
    });
    pruefe();
  }
  function umschalten() { offen = !offen; }

  function versucheSpeichern() {
    if (!S.speicher || typeof S.speicher.speichereJetzt !== 'function') return false;
    return !!S.speicher.speichereJetzt();
  }

  function abhaken(id) {
    if (!id || erledigt[id]) return false;
    if (!istAbhakbar(id)) return false;
    erledigt[id] = true;
    if (!versucheSpeichern()) speichernOffen = true;  // F-032
    return true;
  }

  function meldeSprechen(zonenId) {
    if (zonenId === 'kuerbis') abhaken('kuerbis');
  }

  function pruefe() {
    if (S.inventar && typeof S.inventar.anzahl === 'function' && S.inventar.anzahl('mondkraut') >= 3) {
      abhaken('mondkraut');
    }
    // F-032: Retry sobald Karte/Inventar bereit (core ruft pruefe je Tick)
    if (speichernOffen && versucheSpeichern()) speichernOffen = false;
  }

  function zeichneHud(ctx) {
    if (!offen || !definitionen.length) return;
    ctx.save();
    ctx.font = '8px monospace';
    ctx.textBaseline = 'top';
    var zeilen = definitionen.map(function (a) {
      var mark = a.abhakbar ? (erledigt[a.id] ? '[x] ' : '[ ] ') : '[–] ';
      return mark + a.text;
    });
    var maxW = 0;
    zeilen.forEach(function (t) { maxW = Math.max(maxW, Math.ceil(ctx.measureText(t).width)); });
    var pad = 4, zeileH = 11, boxW = maxW + pad * 2, boxH = zeilen.length * zeileH + pad * 2;
    var x = BREITE - boxW - 4, y = 4;
    ctx.fillStyle = 'rgba(20, 14, 24, 0.85)';
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeStyle = '#c8873a';
    ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);
    for (var i = 0; i < zeilen.length; i++) {
      ctx.fillStyle = definitionen[i].abhakbar && erledigt[definitionen[i].id] ? '#a8d08d' : '#f3dca0';
      if (!definitionen[i].abhakbar) ctx.fillStyle = '#a09080';
      ctx.fillText(zeilen[i], x + pad, y + pad + i * zeileH);
    }
    ctx.restore();
  }

  lade();

  S.aufgaben = {
    get offen() { return offen; },
    liste: liste,
    erledigt: erledigtIds,
    setzeStand: setzeStand,
    pruefe: pruefe,
    meldeSprechen: meldeSprechen,
    zeichneHud: zeichneHud,
    umschalten: umschalten
  };
})();
