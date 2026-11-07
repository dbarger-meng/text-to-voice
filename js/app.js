// Text-to-voice app: meSpeak (eSpeak compiled to JavaScript) synthesizes a WAV,
// which we play through our own Web Audio graph so we can queue, stop and
// draw the waveform.
(function () {
  "use strict";

  // ---- voice presets ------------------------------------------------------
  // "variant" is an eSpeak voice variant. The klatt variants use the Klatt
  // formant synthesizer, the same family of technique as DECtalk.
  var PRESETS = {
    robot:    { label: "Robot (Klatt)",     variant: "klatt",  pitch: 35, speed: 145 },
    robot2:   { label: "Robot 2 (Klatt 2)", variant: "klatt2", pitch: 40, speed: 150 },
    robot3:   { label: "Robot 3 (Klatt 3)", variant: "klatt3", pitch: 40, speed: 150 },
    standard: { label: "Standard eSpeak",   variant: "",       pitch: 50, speed: 165 },
    deep:     { label: "Deep",              variant: "m3",     pitch: 15, speed: 140 },
    croak:    { label: "Croak",             variant: "croak",  pitch: 45, speed: 150 },
    whisper:  { label: "Whisper",           variant: "whisper",pitch: 50, speed: 150 }
  };

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    preset: $("preset"), pitch: $("pitch"), speed: $("speed"),
    pitchVal: $("pitchVal"), speedVal: $("speedVal"),
    randomBtn: $("randomBtn"), quoteText: $("quoteText"), quoteAuthor: $("quoteAuthor"),
    phrase: $("phrase"), playBtn: $("playBtn"), stopBtn: $("stopBtn"),
    live: $("live"), status: $("status"), scope: $("scope")
  };

  // ---- audio engine -------------------------------------------------------
  var ctx = null, analyser = null, current = null, queue = [], playing = false;

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

  function settings() {
    var p = PRESETS[els.preset.value] || PRESETS.robot;
    var opts = { pitch: +els.pitch.value, speed: +els.speed.value, rawdata: "arraybuffer" };
    if (p.variant) opts.variant = p.variant;
    return opts;
  }

  function synth(text) {
    return window.meSpeak.speak(text, settings()); // ArrayBuffer (WAV) or null
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
    var text = queue.shift();
    setStatus("Speaking: " + text);
    var wav = synth(text);
    if (!wav) { setStatus("Could not synthesize that text."); next(); return; }
    ctx.decodeAudioData(wav).then(function (buf) {
      if (!playing) return; // stopped while decoding
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(analyser);
      src.onended = function () { if (current === src) { current = null; next(); } };
      current = src;
      src.start();
    }, function () { setStatus("Audio decode failed."); next(); });
  }

  function stop() {
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
      g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#f5a623";
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

  // ---- wiring -------------------------------------------------------------
  function applyPreset() {
    var p = PRESETS[els.preset.value];
    els.pitch.value = p.pitch; els.speed.value = p.speed;
    showVals();
  }
  function showVals() { els.pitchVal.textContent = els.pitch.value; els.speedVal.textContent = els.speed.value; }

  Object.keys(PRESETS).forEach(function (k) {
    var o = document.createElement("option");
    o.value = k; o.textContent = PRESETS[k].label;
    els.preset.appendChild(o);
  });
  els.preset.value = "robot";
  applyPreset();

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
})();
