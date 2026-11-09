# JPEG XL Image Optimizer

Automatic JPEG XL for every image.

## Description

Every upload gets a JPEG XL copy, served to compatible browsers. Browsers which cannot display it get served the original file.

The rapier-jxl encoder makes smaller files than libjxl at the same quality and automatically keeps text sharp inside compressed screenshots.

JPEGs are kept as JPEG XL, then converted back losslessly when needed. Other formats always keep the original file.

```sh
npx rapier-jxl add emdash
```

Works with Cloudflare R2 and Node local storage.

## Installation

Just run this in your site's folder:

```sh
npx rapier-jxl add emdash
```

Or tell your coding agent:

"Add rapier-jxl to my EmDash site with npx rapier-jxl add emdash."

Or install `rapier-jxl`, then in `astro.config.mjs` wrap your EmDash setup:

```js
import {jxl} from 'rapier-jxl/emdash';

jxl(emdash, {database, storage});
```

## FAQ

- **Does it change the original files?** JPEGs are kept as JPEG XL, then converted back losslessly when needed. Other formats always keep the original file. Switch on "Keep original JPEG files" to keep JPEGs too.
- **Which browsers receive the JPEG XL?** Every browser that supports it. Browsers which cannot display it get served the original file.
- **How do I remove it?** `npx rapier-jxl remove emdash` restores every original file.
- **What storage works?** Cloudflare R2 and Node local storage.
