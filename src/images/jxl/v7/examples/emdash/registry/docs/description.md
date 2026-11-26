Every upload gets a JPEG XL copy, served to compatible browsers. Browsers which cannot display it get served the original file.

New in 8.5.0: Sizes makes JPEG XL copies at EmDash's own widths and keeps the full-size file, about seven times faster and with a third of the storage. A slot close to a stored width gets that copy. Pictures are never enlarged. Node hosts need Node 22.3 or later.

rapier-jxl encodes JPEG XL with WebAssembly. Efforts 6–9 measure photo quality. Efforts 1–5 measure only where it earns its time.

rapier-jxl is the encoder inside [rapier.website](https://rapier.website), the free Markdown editor and painting app. Rapier is also a free [Android app](https://play.google.com/store/apps/details?id=app.rapier&referrer=utm_source%3Demdash) that opens and converts JPEG XL pictures.

JPEGs are kept as JPEG XL, then converted back losslessly when needed. Other formats always keep the original file.

```sh
npx jpegxl add emdash
```

Works with Cloudflare R2 and Node local storage.
