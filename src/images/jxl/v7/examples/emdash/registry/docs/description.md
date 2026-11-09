Every upload gets a JPEG XL copy, served to compatible browsers. Browsers which cannot display it get served the original file.

The rapier-jxl encoder makes smaller files than libjxl at the same quality and automatically keeps text sharp inside compressed screenshots.

JPEGs are kept as JPEG XL, then converted back losslessly when needed. Other formats always keep the original file.

```sh
npx rapier-jxl add emdash
```

Works with Cloudflare R2 and Node local storage.
