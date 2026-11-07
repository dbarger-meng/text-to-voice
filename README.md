# Robot Voice (text-to-voice)

A web page that speaks text in a robotic, Stephen Hawking-style voice. It runs entirely in
the browser: there's no server and no API key.

It has two speech engines:
- **DECtalk**: the classic 1990s synthesizer, compiled to WebAssembly. Its "Perfect Paul" voice is the
  well-known Stephen Hawking-style voice. Nine voices: Paul, Harry, Frank, Dennis, Betty, Ursula,
  Wendy, Rita, Kit.
- **eSpeak** (meSpeak): robot, standard, deep, croak and whisper voices.

- **Speak a random quote**: picks one of the inspirational quotes in `js/quotes.js` and speaks it.
- **Your phrase**: type anything and press **Play** (or Enter).
- **Speak each word as I type**: each word is spoken as soon as you finish it (space or punctuation).
- **Voice**: presets (Robot/Klatt is the default), pitch and speed.

## Run it

- **GitHub Pages:** Settings → Pages → Deploy from a branch → `main`, `/ (root)`. Everything works there.
- **Locally:** run `python3 serve.py`, then open http://localhost:8000.
- **Double-clicking `index.html`** also works, but only the eSpeak voices are available. DECtalk
  uses threads, and browsers allow those only on a "cross-origin isolated" page. `serve.py`
  sends the headers for that, and on GitHub Pages `coi-serviceworker.js` adds them. The first
  visit reloads the page once while it installs.

In the text box you can use DECtalk's square-bracket commands, for example `[:np]` (Paul),
`[:nh]` (Harry), `[:rate 250]`, or `[:dv ap 90]` to change the average pitch in Hz.

## Add quotes

Edit `js/quotes.js` and add entries like `{ text: "...", author: "..." }`.

## How it works

- `js/dectalk/` is DECtalk built with Emscripten from https://github.com/dectalk/dectalk, using
  `tools/build-dectalk.sh` and the small entry point `tools/dectalk/dtweb.c`.

- `js/mespeak.bundle.js` contains [meSpeak](http://www.masswerk.at/mespeak/), which is the
  eSpeak speech synthesizer compiled to JavaScript, bundled with its config and the US English
  voice. To rebuild it, run `tools/build-mespeak.sh`.
- `js/app.js` asks meSpeak for a WAV, then plays it through Web Audio. That allows queueing,
  Stop and the oscilloscope display.
- The "Robot" presets use eSpeak's Klatt formant-synthesizer variants. Klatt synthesis is the
  same technique behind DECtalk and the voice Hawking used, so these presets come closest to
  that sound.

## License

- meSpeak and eSpeak are GPL.
- DECtalk is **not** open source. Its source was shared publicly by one of its original developers
  and is preserved by the community at github.com/dectalk/dectalk, but its LICENCE file still says
  it is proprietary to Fonix. Use the DECtalk voices for personal and hobby use only. If that
  matters for you (for example, a public site), delete `js/dectalk/` and the app falls back to
  the eSpeak voices.
- `coi-serviceworker.js` is MIT (Guido Zuidhof).
