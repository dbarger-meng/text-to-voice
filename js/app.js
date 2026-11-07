// Text-to-voice app. Two speech engines, both running entirely in the browser:
//  - DECtalk (WebAssembly build of the 1990s DECtalk synthesizer; "Perfect Paul" is the
//    classic Stephen Hawking-style voice). Needs a cross-origin-isolated page for threads.
//  - meSpeak (eSpeak compiled to JavaScript), always available.
// Each engine returns a WAV, which we play through our own Web Audio graph so we can
// queue, stop and draw the waveform.
(function () {
  "use strict";

  // ---- voice presets ------------------------------------------------------
  // DECtalk: "voice" is the DECtalk speaker command; "pitch" is the voice's own average
  // pitch on the 0-99 slider (DECtalk average pitch Hz = 60 + 2 * slider).
  // eSpeak: "variant" is an eSpeak voice variant; klatt variants use the Klatt formant
  // synthesizer, the same technique DECtalk is built on.
  var PRESETS = {
    paul:     { group: "DECtalk", label: "Perfect Paul (Hawking)", engine: "dectalk", voice: "np", pitch: 31, speed: 160 },
    harry:    { group: "DECtalk", label: "Huge Harry",     engine: "dectalk", voice: "nh", pitch: 15, speed: 160 },
    frank:    { group: "DECtalk", label: "Frail Frank",    engine: "dectalk", voice: "nf", pitch: 48, speed: 160 },
    dennis:   { group: "DECtalk", label: "Doctor Dennis",  engine: "dectalk", voice: "nd", pitch: 25, speed: 160 },
    betty:    { group: "DECtalk", label: "Beautiful Betty",engine: "dectalk", voice: "nb", pitch: 74, speed: 160 },
    ursula:   { group: "DECtalk", label: "Uppity Ursula",  engine: "dectalk", voice: "nu", pitch: 90, speed: 160 },
    wendy:    { group: "DECtalk", label: "Whispering Wendy", engine: "dectalk", voice: "nw", pitch: 70, speed: 160 },
    rita:     { group: "DECtalk", label: "Rough Rita",     engine: "dectalk", voice: "nr", pitch: 23, speed: 160 },
    kit:      { group: "DECtalk", label: "Kit the Kid",    engine: "dectalk", voice: "nk", pitch: 99, speed: 160 },
    robot:    { group: "eSpeak", label: "Robot (Klatt)",     engine: "espeak", variant: "klatt",  pitch: 35, speed: 145 },
    robot2:   { group: "eSpeak", label: "Robot 2 (Klatt 2)", engine: "espeak", variant: "klatt2", pitch: 40, speed: 150 },
    robot3:   { group: "eSpeak", label: "Robot 3 (Klatt 3)", engine: "espeak", variant: "klatt3", pitch: 40, speed: 150 },
    standard: { group: "eSpeak", label: "Standard eSpeak",   engine: "espeak", variant: "",       pitch: 50, speed: 165 },
    deep:     { group: "eSpeak", label: "Deep",              engine: "espeak", variant: "m3",     pitch: 15, speed: 140 },
    croak:    { group: "eSpeak", label: "Croak",             engine: "espeak", variant: "croak",  pitch: 45, speed: 150 },
    whisper:  { group: "eSpeak", label: "Whisper",           engine: "espeak", variant: "whisper",pitch: 50, speed: 150 }
  };

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    preset: $("preset"), pitch: $("pitch"), speed: $("speed"),
    pitchVal: $("pitchVal"), speedVal: $("speedVal"), engineNote: $("engineNote"),
    randomBtn: $("randomBtn"), quoteText: $("quoteText"), quoteAuthor: $("quoteAuthor"),
    phrase: $("phrase"), playBtn: $("playBtn"), stopBtn: $("stopBtn"),
    live: $("live"), status: $("status"), scope: $("scope")
  };

  // ---- DECtalk engine -----------------------------------------------------
  var dectalk = { available: false, module: null, loading: null, error: "" };
  if (!window.crossOriginIsolated) {
    dectalk.error = "DECtalk voices need the hosted page (GitHub Pages or serve.py), not a file opened directly.";
  } else if (typeof window.DECtalkModule !== "function") {
    dectalk.error = "DECtalk engine files are missing.";
  } else {
    dectalk.available = true;
    dectalk.loading = window.DECtalkModule().then(function (m) { dectalk.module = m; return m; },
      function (e) { dectalk.available = false; dectalk.error = "DECtalk failed to load."; refreshPresetList(); throw e; });
  }

  function dectalkSynth(text, p) {
    return dectalk.loading.then(function (M) {
      var cmd = "[:" + p.voice + "][:rate " + els.speed.value + "]";
      if (+els.pitch.value !== p.pitch) cmd += "[:dv ap " + (60 + 2 * +els.pitch.value) + "]";
      var rc = M.ccall("dt_speak", "number", ["string", "string"], [cmd + " " + text, "/out.wav"]);
      if (rc !== 0) throw new Error("DECtalk error " + rc);
      var bytes = M.FS.readFile("/out.wav");
      M.FS.unlink("/out.wav");
      return bytes.slice().buffer; // copy out of shared wasm memory
    });
  }

  // ---- eSpeak engine ------------------------------------------------------
  function espeakSynth(text, p) {
    var opts = { pitch: +els.pitch.value, speed: +els.speed.value, rawdata: "arraybuffer" };
    if (p.variant) opts.variant = p.variant;
    var wav = window.meSpeak.speak(text, opts);
    return wav ? Promise.resolve(wav) : Promise.reject(new Error("eSpeak could not synthesize that text."));
  }

  function synth(text) {
    var p = PRESETS[els.preset.value] || PRESETS.robot;
    return p.engine === "dectalk" ? dectalkSynth(text, p) : espeakSynth(text, p);
  }

  // ---- audio playback -----------------------------------------------------
  var ctx = null, analyser = null, current = null, queue = [], playing = false, gen = 0;

  function ensureAudio() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.connect(ctx.destination);
      drawScope();
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  function say(text, opts) {
    text = (text || "").trim();
    if (!text) return;
    ensureAudio();
    if (!opts || !opts.queue) stop();
    queue.push(text);
    if (!playing) next();
  }

  function next() {
    if (!queue.length) { playing = false; setStatus(""); return; }
    playing = true;
    var myGen = gen;
    var text = queue.shift();
    setStatus("Speaking: " + text);
    synth(text)
      .then(function (wav) { return ctx.decodeAudioData(wav); })
      .then(function (buf) {
        if (myGen !== gen) return; // stopped meanwhile
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(analyser);
        src.onended = function () { if (current === src) { current = null; next(); } };
        current = src;
        src.start();
      })
      .catch(function (e) {
        if (myGen !== gen) return;
        setStatus(e && e.message ? e.message : "Could not speak that text.");
        playing = false;
      });
  }

  function stop() {
    gen++;
    queue = [];
    playing = false;
    if (current) { var c = current; current = null; try { c.stop(); } catch (e) {} }
    setStatus("");
  }

  function setStatus(msg) {
    els.status.textContent = msg;
    document.body.classList.toggle("speaking", !!msg && msg.indexOf("Speaking") === 0);
  }

  // ---- oscilloscope -------------------------------------------------------
  function drawScope() {
    var c = els.scope, g = c.getContext("2d");
    var data = new Uint8Array(analyser.fftSize);
    (function frame() {
      var dpr = window.devicePixelRatio || 1;
      var w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      analyser.getByteTimeDomainData(data);
      g.lineWidth = 2;
      g.strokeStyle = "#f5a623";
      g.beginPath();
      for (var i = 0; i < data.length; i++) {
        var x = (i / (data.length - 1)) * w;
        var y = (data[i] / 255) * h;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      requestAnimationFrame(frame);
    })();
  }

  // ---- quotes -------------------------------------------------------------
  var lastQuote = -1;
  function randomQuote() {
    var qs = window.QUOTES || [];
    if (!qs.length) return;
    var i;
    do { i = Math.floor(Math.random() * qs.length); } while (qs.length > 1 && i === lastQuote);
    lastQuote = i;
    var q = qs[i];
    els.quoteText.textContent = "“" + q.text + "”";
    els.quoteAuthor.textContent = "— " + q.author;
    say(q.text);
  }

  // ---- live "speak each word as you type" ---------------------------------
  var BOUNDARY = /[\s.,!?;:]/;
  function onPhraseInput(e) {
    if (!els.live.checked) return;
    var typedBoundary =
      (e.inputType === "insertText" && e.data && BOUNDARY.test(e.data.slice(-1))) ||
      e.inputType === "insertLineBreak";
    if (!typedBoundary) return;
    var upToCursor = els.phrase.value.slice(0, els.phrase.selectionStart);
    // Only speak when the boundary directly follows a word ("world." then " " speaks once).
    if (BOUNDARY.test(upToCursor.slice(-2, -1) || " ")) return;
    var before = upToCursor.replace(/[\s.,!?;:]+$/, "");
    var m = before.match(/[^\s.,!?;:]+$/);
    if (m) say(m[0], { queue: true });
  }

  // ---- preset list --------------------------------------------------------
  function refreshPresetList() {
    var keep = els.preset.value;
    els.preset.innerHTML = "";
    var groups = {};
    Object.keys(PRESETS).forEach(function (k) {
      var p = PRESETS[k];
      if (!groups[p.group]) {
        groups[p.group] = document.createElement("optgroup");
        groups[p.group].label = p.group === "DECtalk" ? "DECtalk (classic 1990s)" : "eSpeak";
        els.preset.appendChild(groups[p.group]);
      }
      var o = document.createElement("option");
      o.value = k; o.textContent = p.label;
      if (p.engine === "dectalk" && !dectalk.available) { o.disabled = true; o.textContent += " (unavailable)"; }
      groups[p.group].appendChild(o);
    });
    var sel = PRESETS[keep] && !(PRESETS[keep].engine === "dectalk" && !dectalk.available) ? keep
      : (dectalk.available ? "paul" : "robot");
    els.preset.value = sel;
    if (sel !== keep) applyPreset();
    els.engineNote.textContent = dectalk.available ? "" : dectalk.error;
    els.engineNote.hidden = dectalk.available;
  }

  function applyPreset() {
    var p = PRESETS[els.preset.value];
    els.pitch.value = p.pitch; els.speed.value = p.speed;
    showVals();
  }
  function showVals() { els.pitchVal.textContent = els.pitch.value; els.speedVal.textContent = els.speed.value; }

  refreshPresetList();

  els.preset.addEventListener("change", applyPreset);
  els.pitch.addEventListener("input", showVals);
  els.speed.addEventListener("input", showVals);
  els.randomBtn.addEventListener("click", randomQuote);
  els.playBtn.addEventListener("click", function () { say(els.phrase.value); });
  els.stopBtn.addEventListener("click", stop);
  els.phrase.addEventListener("input", onPhraseInput);
  els.phrase.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !els.live.checked) { e.preventDefault(); say(els.phrase.value); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); say(els.phrase.value); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") stop(); });

  // Expose for testing / console use: speak("hello")
  window.speak = say;
  window.stopSpeaking = stop;
  window.__synth = synth;
})();
