#!/bin/bash
# libjxl 0.12.0's static tools into $1 (checked by SHA-256; lzip or Python's raw LZMA unpacks the archive).
set -euo pipefail
mkdir -p "$1" && cd "$1"
curl -sSLf -o jxl.tar.lz https://github.com/libjxl/libjxl/releases/download/v0.12.0/jxl-linux-x86_64-static.tar.lz
echo "5318a1ea40adad76d023e0c17a03d4627f8282f83cb2b575e69be8e74f1ff456  jxl.tar.lz" | sha256sum -c -
if command -v lzip >/dev/null; then lzip -dc jxl.tar.lz | tar x; else python3 - <<'PY'
import lzma
d = open('jxl.tar.lz', 'rb').read(); ds = 1 << (d[5] & 0x1f); ds -= (ds // 16) * ((d[5] >> 5) & 7)
open('jxl.tar', 'wb').write(lzma.LZMADecompressor(lzma.FORMAT_RAW, filters=[{"id": lzma.FILTER_LZMA1, "dict_size": ds, "lc": 3, "lp": 0, "pb": 2}]).decompress(d[6:]))
PY
tar xf jxl.tar; fi
ls tools
