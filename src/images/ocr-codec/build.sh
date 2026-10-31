#!/bin/sh
set -eu
emcmake cmake -S /sources/libjxl -B /output/build -DCMAKE_BUILD_TYPE=Release \
 -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF -DJPEGXL_ENABLE_TOOLS=OFF \
 -DJPEGXL_ENABLE_DEVTOOLS=OFF -DJPEGXL_ENABLE_EXAMPLES=OFF -DJPEGXL_ENABLE_MANPAGES=OFF \
 -DJPEGXL_ENABLE_BENCHMARK=OFF -DJPEGXL_ENABLE_SJPEG=OFF -DJPEGXL_ENABLE_SKCMS=ON \
 -DJPEGXL_ENABLE_PLUGINS=OFF -DJPEGXL_ENABLE_VIEWERS=OFF -DJPEGXL_ENABLE_DOXYGEN=OFF \
 -DJPEGXL_ENABLE_JPEGLI=OFF -DJPEGXL_ENABLE_TRANSCODE_JPEG=ON -DJPEGXL_BUNDLE_LIBPNG=OFF
cmake --build /output/build --target jxl_dec jxl_cms -j4
em++ -O3 -std=c++17 --bind -I/sources/libjxl -I/sources/libjxl/lib/include -I/output/build/lib/include \
 -I/sources/libjxl/third_party/skcms /binding/binding.cpp \
 /output/build/lib/libjxl_dec.a /output/build/lib/libjxl_cms.a \
 /output/build/third_party/highway/libhwy.a \
 /output/build/third_party/brotli/libbrotlidec.a /output/build/third_party/brotli/libbrotlicommon.a \
 -sDYNAMIC_EXECUTION=0 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker \
 -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=2147483648 -sINITIAL_MEMORY=16777216 \
 -sFILESYSTEM=0 -sMALLOC=emmalloc -o /output/jxl_dec.mjs
