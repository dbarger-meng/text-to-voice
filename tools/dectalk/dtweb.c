/* Minimal web entry for DECtalk: start once, render text to a WAV file in MEMFS. */
#include "ttsapi.h"
#include <stdio.h>
#include <emscripten.h>

static LPTTS_HANDLE_T tts = NULL;

EMSCRIPTEN_KEEPALIVE int dt_init(void) {
  if (tts) return 0;
  return (int)TextToSpeechStartup(&tts, WAVE_MAPPER, DO_NOT_USE_AUDIO_DEVICE, NULL, 0);
}

EMSCRIPTEN_KEEPALIVE int dt_speak(const char *text, const char *outpath) {
  int st;
  if (!tts && (st = dt_init()) != 0) return 1000 + st;
  if ((st = TextToSpeechOpenWaveOutFile(tts, (char *)outpath, WAVE_FORMAT_1M16)) != 0) return 2000 + st;
  TextToSpeechSpeak(tts, (char *)text, TTS_FORCE);
  TextToSpeechSync(tts);
  TextToSpeechCloseWaveOutFile(tts);
  return 0;
}

int main(void) { return 0; }
