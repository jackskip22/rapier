# The JPEG XL decoder serves the hosted paint owner and byte checks

`rapier.html` carries no JPEG XL decoder. The browser reads the format itself,
including straight RGBA when the Paint tool picks up a saved layer.

The hosted paint owner has no browser image decoder. `mcp/paint-raster.mjs`
uses this audited binding, and `mcp/cloudflare.mjs` supplies its precompiled
WebAssembly module. The development painter uses the same binding. Neither
the binding nor the WebAssembly enters a page or an offline paint worker.

What it is worth: a witness can now decode what Rapier WROTE and check the pixels, instead of
trusting a signature. `paint-picture-lossless` uses it to prove a painting round-trips exactly --
which is the actual content of "full quality", and the harness's own Chromium (140, and the format
landed in 145) can never show us.

The provenance hashes and original licence notices remain beside the unmodified
upstream files. The hosted wrapper bounds the image before rendering and returns
straight pixels through Paint's PNG owner.
