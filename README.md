# Hexe-Browserspiel – Titelbildschirm

Start: `index.html` direkt im Browser öffnen (kein Server, kein Build nötig).

## Struktur
- `index.html` – Bühne mit drei Ebenen: `#layer-bg` (Hintergrundbild), `#layer-sprites` (Animationen), `#layer-ui` (Klickflächen), plus zwei native `<dialog>`-Fenster.
- `css/style.css` – 3:2-Bühne per contain (`min(100vw, 150dvh)`), `image-rendering: pixelated`, Klickflächen in Prozent relativ zur Bühne.
- `js/main.js` – zentrales `state`-Objekt (`musicOn`, `volume`, `animationsOn`), gespeichert in `localStorage`. Änderungen über `TitleScreen.setState(...)`, die das Event `statechange` auf `document` auslösen.
- `assets/titelbild-original.png` – Original, bleibt unverändert. Retuschierte Hintergründe kommen nach `assets/titelbild-bg.png`.

## Für Animationen
Eigene Datei pro Animation (z. B. `js/steam.js`, Styles in `css/style.css` unter eigener Überschrift), Elemente in `#layer-sprites` einhängen und `TitleScreen.state.animationsOn` beachten bzw. auf `statechange` reagieren.
