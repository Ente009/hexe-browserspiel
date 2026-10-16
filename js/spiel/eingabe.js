/* HEX-011 Eingabe: Tastatur mit Belegungstabelle (W/↑, A/←, S/↓, D/→, E, Esc, K = Kollisions-Debug)
   + Touch (Pointer Events, Multi-Touch): Steuerkreuz, E-Knopf, Pause-Knopf. */
(function () {
  'use strict';
  var BELEGUNG = {
    KeyW: 'hoch', ArrowUp: 'hoch',
    KeyS: 'runter', ArrowDown: 'runter',
    KeyA: 'links', ArrowLeft: 'links',
    KeyD: 'rechts', ArrowRight: 'rechts',
    KeyE: 'aktion',
    KeyK: 'debug',      // HEX-012: Kollisions-Debug-Ansicht an/aus
    Escape: 'pause'
  };
  var tasten = {};      // Tastatur: Aktion -> gehalten
  var touch = {};       // Touch: Aktion -> gehalten
  var neu = {};         // Aktion -> true, einmal pro Druck (bis abgeholt)

  function druck(a) { if (!tasten[a] && !touch[a]) neu[a] = true; }

  window.addEventListener('keydown', function (e) {
    var a = BELEGUNG[e.code];
    if (!a) return;
    e.preventDefault();
    druck(a);
    tasten[a] = true;
  });
  window.addEventListener('keyup', function (e) {
    var a = BELEGUNG[e.code];
    if (a) tasten[a] = false;
  });
  function allesLos() { tasten = {}; touch = {}; neu = {}; dpadZeiger = {}; knopfZeiger = {}; zeigeDpad(); }
  window.addEventListener('blur', allesLos);

  // ---------- Touch ----------
  var dpad = document.getElementById('dpad');
  var knoepfe = { 'knopf-e': 'aktion', 'knopf-pause': 'pause' };
  var dpadZeiger = {};   // pointerId -> {x,y} Richtung
  var knopfZeiger = {};  // pointerId -> Aktion

  function istTouch() { document.body.classList.add('touch'); }
  if ((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0) istTouch();
  window.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch') istTouch(); }, true);

  // Richtung aus Fingerposition relativ zur Mitte, 8 Richtungen, kleine Totzone
  function dpadRichtung(e) {
    var r = dpad.getBoundingClientRect();
    var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    var tot = r.width * 0.12;
    if (dx * dx + dy * dy < tot * tot) return { x: 0, y: 0 };
    var w = Math.atan2(dy, dx), s = Math.round(w / (Math.PI / 4));   // -4..4
    var ri = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]][s + 4];
    return { x: ri[0], y: ri[1] };
  }
  function zeigeDpad() {
    if (!dpad) return;
    var r = touchRichtung();
    var an = { h: r.y < 0, u: r.y > 0, l: r.x < 0, r: r.x > 0 };
    Array.prototype.forEach.call(dpad.querySelectorAll('.pfeil'), function (el) {
      el.classList.toggle('an', !!an[el.classList[1]]);
    });
  }
  function touchRichtung() {
    var x = 0, y = 0;
    for (var id in dpadZeiger) { x += dpadZeiger[id].x; y += dpadZeiger[id].y; }
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }
  if (dpad) {
    dpad.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { dpad.setPointerCapture(e.pointerId); } catch (x) { /* ignorieren */ }
      dpadZeiger[e.pointerId] = dpadRichtung(e); zeigeDpad();
    });
    dpad.addEventListener('pointermove', function (e) {
      if (dpadZeiger[e.pointerId]) { dpadZeiger[e.pointerId] = dpadRichtung(e); zeigeDpad(); }
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
      dpad.addEventListener(t, function (e) { delete dpadZeiger[e.pointerId]; zeigeDpad(); });
    });
  }
  Object.keys(knoepfe).forEach(function (id) {
    var el = document.getElementById(id), a = knoepfe[id];
    if (!el) return;
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignorieren */ }
      druck(a); knopfZeiger[e.pointerId] = a; touch[a] = true; el.classList.add('an');
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
      el.addEventListener(t, function (e) {
        if (!knopfZeiger[e.pointerId]) return;
        delete knopfZeiger[e.pointerId];
        var noch = false; for (var k in knopfZeiger) if (knopfZeiger[k] === a) noch = true;
        if (!noch) { touch[a] = false; el.classList.remove('an'); }
      });
    });
  });
  // Kein Scrollen/Zoomen/Kontextmenü durch Gesten auf der Spielseite (Pause-Menü bleibt klickbar)
  document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function gehalten(a) { return !!tasten[a] || !!touch[a]; }

  window.Spiel = window.Spiel || {};
  window.Spiel.eingabe = {
    BELEGUNG: BELEGUNG,
    gehalten: gehalten,
    // true genau einmal pro Druck (Taste oder Knopf)
    gedrueckt: function (a) { var v = !!neu[a]; neu[a] = false; return v; },
    // Richtungsvektor aus Tastatur + Steuerkreuz, diagonal normalisiert
    richtung: function () {
      var t = touchRichtung();
      var x = Math.max(-1, Math.min(1, (tasten.rechts ? 1 : 0) - (tasten.links ? 1 : 0) + t.x));
      var y = Math.max(-1, Math.min(1, (tasten.runter ? 1 : 0) - (tasten.hoch ? 1 : 0) + t.y));
      if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x: x, y: y };
    }
  };
})();
