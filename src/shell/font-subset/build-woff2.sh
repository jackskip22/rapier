#!/bin/sh
set -eu
mkdir -p /output/objects
cd /output/objects
for source in /sources/brotli/c/common/*.c /sources/brotli/c/dec/*.c; do
 emcc -O3 -I/sources/brotli/c/include -c "$source" -o "$(basename "$source").o"
done
for name in table_tags variable_length woff2_common woff2_dec woff2_out; do
 em++ -O3 -std=c++11 -I/sources/woff2/include -I/sources/brotli/c/include -c "/sources/woff2/src/$name.cc" -o "$name.o"
done
em++ -O3 -std=c++11 --bind -I/sources/woff2/include /binding/woff2-binding.cpp ./*.o \
 -sDYNAMIC_EXECUTION=0 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker \
 -sSINGLE_FILE=1 -sSINGLE_FILE_BINARY_ENCODE=0 -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=268435456 \
 -sINITIAL_MEMORY=16777216 -sFILESYSTEM=0 -sMALLOC=emmalloc \
 -o /output/woff2-decoder.mjs
