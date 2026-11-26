Just run this in your site's folder:

```sh
npx jpegxl add emdash
```

Or tell your coding agent:

"Add jpegxl to my EmDash site with npx jpegxl add emdash."

Or install `jpegxl`, then in `astro.config.mjs` wrap your EmDash setup:

```js
import {jxl} from 'jpegxl/emdash';

jxl(emdash, {database, storage});
```
