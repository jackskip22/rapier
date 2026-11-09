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
