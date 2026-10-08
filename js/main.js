/* Titelbildschirm – Interaktionen
 * Ein zentrales state-Objekt hält alle Einstellungen. Spätere Module
 * (Animationen, Audio) lesen es aus und reagieren auf das Event "statechange".
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'hexe-titel-settings';

  // ---------- Zustand ----------
  // Wer im System "Bewegung reduzieren" eingestellt hat, startet ohne Animationen.
  // Eine gespeicherte Wahl in den Einstellungen hat Vorrang.
  var prefersReducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var defaults = { musicOn: false, volume: 70, animationsOn: !prefersReducedMotion };

  // musicOn wird nicht gespeichert: Musik startet immer auf "aus", erst ein Klick schaltet sie ein
  var state = Object.assign({}, defaults, loadSettings(), { musicOn: false });

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {}; // z. B. localStorage gesperrt
    }
  }

  function saveSettings() {
    var saved = Object.assign({}, state);
    delete saved.musicOn;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch (e) { /* ignorieren */ }
  }

  /** Zustand ändern, speichern und allen Interessierten Bescheid geben. */
  function setState(patch) {
    Object.assign(state, patch);
    saveSettings();
    document.dispatchEvent(new CustomEvent('statechange', { detail: Object.assign({}, state) }));
  }

  // ---------- Elemente ----------
  var $ = function (id) { return document.getElementById(id); };
  var btnPlay = $('btn-play');
  var btnSettings = $('btn-settings');
  var btnMusic = $('btn-music');
  var dlgPlay = $('dialog-play');
  var dlgSettings = $('dialog-settings');
  var inVolume = $('set-volume');
  var outVolume = $('set-volume-value');
  var inAnimations = $('set-animations');

  // ---------- Musik ----------
  // Abspielen übernimmt js/music.js (hört auf statechange).
  function setMusic(on) {
    setState({ musicOn: on });
  }

  function renderMusic() {
    btnMusic.setAttribute('aria-pressed', String(state.musicOn));
    btnMusic.setAttribute('aria-label', state.musicOn ? 'Musik ausschalten' : 'Musik einschalten');
  }

  // ---------- Einstellungen ----------
  function renderSettings() {
    inVolume.value = state.volume;
    outVolume.textContent = state.volume;
    inAnimations.checked = state.animationsOn;
  }

  // ---------- Dialoge ----------
  function openDialog(dlg) {
    if (!dlg.open) dlg.showModal();
  }

  // Klick auf den abgedunkelten Bereich schließt den Dialog
  [dlgPlay, dlgSettings].forEach(function (dlg) {
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) dlg.close();
    });
  });

  // ---------- Ereignisse ----------
  btnPlay.addEventListener('click', function () { openDialog(dlgPlay); });

  btnSettings.addEventListener('click', function () {
    renderSettings();
    openDialog(dlgSettings);
  });

  btnMusic.addEventListener('click', function () { setMusic(!state.musicOn); });

  inVolume.addEventListener('input', function () {
    outVolume.textContent = inVolume.value;
    setState({ volume: Number(inVolume.value) });
  });

  inAnimations.addEventListener('change', function () {
    setState({ animationsOn: inAnimations.checked });
  });

  document.addEventListener('statechange', renderMusic);

  // ---------- Start ----------
  renderMusic();
  renderSettings();

  // Für spätere Module und zum Debuggen erreichbar
  window.TitleScreen = { state: state, setState: setState, setMusic: setMusic };
})();
