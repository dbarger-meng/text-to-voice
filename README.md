# Robot Voice (text-to-voice)

A web page that speaks text in a robotic, Stephen Hawking-style voice. It runs entirely in
the browser: there's no server and no API key.

- **Speak a random quote**: picks one of the inspirational quotes in `js/quotes.js` and speaks it.
- **Your phrase**: type anything and press **Play** (or Enter).
- **Speak each word as I type**: each word is spoken as soon as you finish it (space or punctuation).
- **Voice**: presets (Robot/Klatt is the default), pitch and speed.

## Run it

Open `index.html` in a browser by double-clicking it, or serve the folder:

```
python3 -m http.server 8000   # then open http://localhost:8000
```

It also works as a GitHub Pages site (Settings → Pages → deploy from branch, root folder).

## Add quotes

Edit `js/quotes.js` and add entries like `{ text: "...", author: "..." }`.

## How it works

- `js/mespeak.bundle.js` contains [meSpeak](http://www.masswerk.at/mespeak/), which is the
  eSpeak speech synthesizer compiled to JavaScript, bundled with its config and the US English
  voice. To rebuild it, run `tools/build-mespeak.sh`.
- `js/app.js` asks meSpeak for a WAV, then plays it through Web Audio. That allows queueing,
  Stop and the oscilloscope display.
- The "Robot" presets use eSpeak's Klatt formant-synthesizer variants. Klatt synthesis is the
  same technique behind DECtalk and the voice Hawking used, so these presets come closest to
  that sound.

## License

meSpeak and eSpeak are GPL, so this project is distributed under the GPL as well.
