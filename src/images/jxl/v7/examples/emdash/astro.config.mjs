import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import {d1, r2} from '@emdash-cms/cloudflare';
import {defineConfig} from 'astro/config';
import emdash from 'emdash/astro';
import {rapierStorage} from './storage.mjs';
import {rapierMediaPlugin} from './media-plugin.mjs';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [react(), emdash({
    database: d1({binding: 'DB'}),
    storage: rapierStorage(r2({binding: 'MEDIA'})),
    plugins: [rapierMediaPlugin()]
  })],
  devToolbar: {enabled: false}
});
