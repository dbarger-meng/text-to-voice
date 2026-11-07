#!/usr/bin/env bash
# Rebuild js/dectalk/{dectalk.js,dectalk.wasm,dectalk.worker.js} from the DECtalk source
# (https://github.com/dectalk/dectalk) with Emscripten. Tested with Ubuntu's emscripten 3.1.6
# (apt-get install emscripten). Output needs a cross-origin-isolated page (threads).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
git clone --depth 1 https://github.com/dectalk/dectalk.git "$work/dectalk"
cd "$work/dectalk/ports/emscripten"

# Same sources, include paths and defines as the upstream emscripten port.
node -e '
const s = require("./package.json").scripts["compile:dapi"];
const files = [...s.matchAll(/"(\.\.\/\.\.\/src\/dapi\/src\/[^"]+\.c)"/g)].map(m => m[1]);
const flags = [...s.matchAll(/-I "([^"]+)"/g)].map(m => "-I" + m[1])
  .concat([...s.matchAll(/-D (\S+)/g)].map(m => "-D" + m[1]));
require("fs").writeFileSync("srcs.txt", files.join("\n"));
require("fs").writeFileSync("flags.txt", flags.join(" "));'

# Upstream type mismatch in the audio-disabled stub.
sed -i 's/UINT16 uFlags, HANDLE16 hDev,/UINT16 uFlags, HWAVEOUT hDev,/' ../../src/dapi/src/nt/disable_audio.c

mkdir -p obj
i=0
for f in $(cat srcs.txt) "$here/tools/dectalk/dtweb.c"; do
  i=$((i+1)); emcc -O2 -pthread -w -c "$f" $(cat flags.txt) -o "obj/$i.o" &
  (( i % 8 == 0 )) && wait
done
wait

mkdir -p "$here/js/dectalk"
emcc -O2 -pthread obj/*.o -o "$here/js/dectalk/dectalk.js" \
  -s PTHREAD_POOL_SIZE=8 -s INITIAL_MEMORY=67108864 -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 -s EXPORT_NAME=DECtalkModule \
  -s EXPORTED_FUNCTIONS=_dt_init,_dt_speak,_main -s EXPORTED_RUNTIME_METHODS=ccall,FS \
  --embed-file fs/dtalk_us.dic@/dtalk_us.dic
echo "wrote $here/js/dectalk/"
