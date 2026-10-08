/* Musik: Platzhalter-Melodie für den Musik-Button
 * Ein einfaches <audio loop> mit .ogg und .mp3 (älteres Safari kann kein .ogg).
 * Läuft auch per Doppelklick unter file://, weil nichts per fetch geladen wird.
 * Erzeugt von /workspace/hexe-tools/musik-platzhalter.py (eigene Chiptune-Schleife, 16 s).
 *
 * Abhängigkeit: TitleScreen.state.musicOn / volume aus main.js. musicOn startet immer auf "aus",
 * Browser spielen Ton ohnehin erst nach einem Klick ab. Symbol und Ton stimmen damit immer überein.
 * Hinweis: iOS ignoriert die Lautstärke von <audio>, dort regeln die Gerätetasten.
 */
(function () {
  'use strict';

  if (!window.TitleScreen) return;
  var TS = window.TitleScreen;

  var audio = document.createElement('audio');
  audio.id = 'music';
  audio.loop = true;
  audio.preload = 'auto';
  [['assets/musik-platzhalter.ogg', 'audio/ogg'], ['assets/musik-platzhalter.mp3', 'audio/mpeg']]
    .forEach(function (s) {
      var src = document.createElement('source');
      src.src = s[0];
      src.type = s[1];
      audio.appendChild(src);
    });
  document.body.appendChild(audio);

  function applyVolume() {
    audio.volume = Math.max(0, Math.min(1, TS.state.volume / 100));
  }

  function play() {
    var p = audio.play();
    if (p && p.catch) {
      p.catch(function () {
        // Browser hat das Abspielen verweigert: Symbol zurück auf "aus", damit es zum Ton passt
        if (TS.state.musicOn) TS.setMusic(false);
      });
    }
  }

  function sync() {
    applyVolume();
    var want = TS.state.musicOn && !document.hidden;   // im Hintergrund-Tab pausieren
    if (want && audio.paused) play();
    else if (!want && !audio.paused) audio.pause();
  }

  document.addEventListener('statechange', sync);
  document.addEventListener('visibilitychange', sync);
  sync();
})();
