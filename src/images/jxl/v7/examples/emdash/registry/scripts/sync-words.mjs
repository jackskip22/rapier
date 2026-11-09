import {readFile, writeFile} from 'node:fs/promises';
import {WORDS, listingWords} from '../../media-words.mjs';
const root = new URL('../', import.meta.url);
const manifest = new URL('emdash-plugin.jsonc', root);
let source = await readFile(manifest, 'utf8');
source = source.replace(/"slug": "[^"]+"/, '"slug": "jxl"')
  .replace(/"name": "[^"]+"/, '"name": ' + JSON.stringify(WORDS.name))
  .replace(/"description": "[^"]+"/, '"description": ' + JSON.stringify(WORDS.listing))
  .replace(/"label": "[^"]+"/, '"label": ' + JSON.stringify(WORDS.name));
await writeFile(manifest, source);
const listing = listingWords();
for (const [name, content] of Object.entries({
  './docs/description.md': listing.description, './docs/installation.md': listing.installation,
  './docs/faq.md': listing.faq, 'README.md': listing.readme,
})) await writeFile(new URL(name, root), content);
