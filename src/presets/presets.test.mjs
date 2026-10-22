// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {admitPreset, PRESET_BYTES} from './record.mjs';
import {portable, presentation, applyPresentation, insertPassage, preparePreset} from './presets.mjs';
import {applyMarkdownSpec} from '../agent/markdown-spec.mjs';
import {installMarkdownImages} from '../spec/md-assets.mjs';
import {layoutTargets} from '../layout/markdown.mjs';
import {createPersonalOwner, admitPersonal, mergePersonal} from '../notes/personal.mjs';
const context = vm.createContext({atob, btoa});
for (const name of ['markdown-it-15.0.2.es2022.umd', 'markdown-it-task-lists-2.1.1.min', 'markdown-it-footnote-4.0.0.min', 'markdown-it-mark-4.0.0.min', 'markdown-it-sup-2.0.0.min', 'markdown-it-emoji-3.1.0-light.min', 'markdown-it-abbr-2.0.0.min', 'markdown-it-ins-4.0.0.min', 'markdown-it-deflist-4.0.0.min'])
  vm.runInContext(readFileSync(new URL('../shell/vendor/' + name + '.js', import.meta.url), 'utf8'), context);
const md = applyMarkdownSpec(context.markdownit({html: true}), context); installMarkdownImages(md);
const sample = () => ({version: 1, id: 'p' + 'a'.repeat(24), name: 'My passage', content: {scope: 'selection', text: '\ufeffA\r\n\r\n**B**\r\n'}});
test('record admission is bounded, closed and detached from caller mutation', () => {
  const record = sample(), admitted = admitPreset(record); record.content.text = 'later';
  assert.equal(admitted.content.text, sample().content.text);
  assert.throws(() => admitPreset({...sample(), execute: 'alert(1)'}));
  assert.throws(() => admitPreset({...sample(), name: '../escape'}));
  assert.throws(() => admitPreset({...sample(), content: {scope: 'document', text: 'x'.repeat(PRESET_BYTES)}}));
  assert.throws(() => admitPreset({...sample(), presentation: {settings: {geometry: '1in'}, fonts: ''}}));
});
test('page templates are pages: a locked border behind the words and no example text', async () => {
  const {templateMarkdown} = await import('./ornaments.mjs'), {admitTemplate} = await import('../draw/ornaments.mjs');
  const {readFileSync, readdirSync} = await import('node:fs');
  const files = readdirSync(new URL('../draw/templates/', import.meta.url)).filter(name => /^border-\d+\.json$/.test(name));
  const {BORDER_PINS} = await import('./pins.mjs');
  assert.equal(files.length, BORDER_PINS.length);
  for (const file of files) {
    const row = admitTemplate(readFileSync(new URL('../draw/templates/' + file, import.meta.url)));
    assert.ok(row, file + ' is a template');
    for (const paper of ['letter', 'a4']) {
      const text = templateMarkdown(row, {paper});
      portable(text, md);
      assert.match(text, new RegExp('^---\\ntemplate: page\\npapersize: ' + paper + '\\ngeometry: (margin=[\\d.]+in|top=[\\d.]+in,right=[\\d.]+in,bottom=[\\d.]+in,left=[\\d.]+in)\\n'));
      const size = paper === 'a4' ? {width: 8.27, height: 11.69} : {width: 8.5, height: 11};
      const geometry = /^geometry: (.*)$/m.exec(text)[1], side = name => Number((new RegExp('(?:' + name + '|margin)=([\\d.]+)in').exec(geometry) || [])[1]);
      const {x, y, w, h} = row.content, need = {top: y / row.h * size.height, right: (row.w - x - w) / row.w * size.width, bottom: (row.h - y - h) / row.h * size.height, left: x / row.w * size.width};
      for (const [name, inches] of Object.entries(need)) {
        assert.ok(side(name) + 1e-9 >= Math.min(6, inches), row.id + ' ' + paper + ' ' + name + ': the words reach the art');
        assert.ok(side(name) <= Math.max(.5, inches) + .1 + 1e-9, row.id + ' ' + paper + ' ' + name + ': ' + side(name) + 'in where ' + inches.toFixed(2) + 'in is the writing area');
      }
      assert.equal(layoutTargets(text, md).filter(r => r.imageOnly && r.marker && !r.reason).length, 1);
      assert.match(text, /wrap=behind lock=on-->/);
      assert.equal(text.replace(/^---[\s\S]*?---\n/, '').replace(/^\[[a-z-]+\]: data:.*$/gm, '').replace(/!\[[^\]]*\]\[[a-z-]+\] <!--md-layout:v1 [^>]*-->/g, '').trim(), '');
    }
  }
});
test('style updates preserve unrelated YAML, exact body and line endings', () => {
  const source = '\ufeff---\r\ncustom: "Keep: this" # yes\r\nmainfont: serif # mine\r\nlinestretch: 1.5\r\n---\r\n\r\n# Me\r\n\r\nA  B\r\n';
  const style = presentation('---\nmainfont: sans-serif\nlinestretch: 1.8\n---\nprivate prose', md);
  assert.equal(style.fonts, ''); assert.ok(!JSON.stringify(style).includes('private prose'));
  const result = applyPresentation(source, style, md);
  assert.equal(result, source.replace('serif #', '"sans-serif" #').replace('1.5', '1.8'));
  assert.equal(applyPresentation(result, style, md), result);
  assert.throws(() => applyPresentation(source, {...style, fonts: 'hidden words'}, md));
  assert.throws(() => applyPresentation('---\nmainfont: a\nmainfont: b\n---\nBody', style, md));
});
test('passages keep surrounding bytes and refuse conflicting reference ownership', () => {
  const before = '\ufeffA\r\n\r\nB\r\n', splice = insertPassage(before, 'hello', 1, 2, md);
  assert.deepEqual(splice, {pos: 1, removed: 'A', inserted: 'hello'});
  assert.equal(before.slice(0, splice.pos) + splice.inserted + before.slice(2), '\ufeffhello\r\n\r\nB\r\n');
  assert.throws(() => insertPassage('[x]: https://a.example\n', '[word][x]\n\n[x]: https://b.example\n', 0, 0, md));
  assert.throws(() => insertPassage('Waiting [x]', '[word][x]\n\n[x]: https://b.example\n', 0, 0, md));
  assert.throws(() => insertPassage('Waiting [A  B] here', '[A B]: https://b.example\n', 0, 0, md), /already belongs/, 'untouched [A  B] must not become a link');
  assert.throws(() => insertPassage('Waiting [a\tb] here', '[A B]: https://b.example\n', 0, 0, md));
  assert.doesNotThrow(() => portable('![j](data:image/jxl;base64,AAAA)\n', md), 'JPEG XL pictures are admitted like spec/md-assets.mjs admits them');
  assert.throws(() => insertPassage(before, 'x', 999, 999, md));
  assert.throws(() => insertPassage('<!-- rapier-block:mark rapier-draw -->\n', '<!-- rapier-block:mark rapier-draw -->\n', 0, 0, md));
  assert.equal(portable('<!-- rapier-block:mark rapier-draw -->\n', md), '<!-- rapier-block:mark rapier-draw -->\n');
});
test('hostile HTML, remote/private images, local attachments and history refuse before use', () => {
  for (const text of ['<script>globalThis.pwned=1</script>', '<img src="https://tracking.example/a">', '![a](https://tracking.example/a.png)', '![a](file:///private.png)', '[secret](./private.pdf)', '[[Private note]]', '<!-- rapier-ledger -->']) assert.throws(() => portable(text, md), text);
  assert.equal(globalThis.pwned, undefined);
});
function storage() {
  let data = null, failing = false;
  return {read: async () => structuredClone(data), update: async change => { if (failing) throw new Error('disk full'); data = structuredClone(change(structuredClone(data))); return structuredClone(data); }, fail: value => { failing = value; }};
}
test('personal storage persists, isolates input, keeps failed writes and rechecks admission at commit', async () => {
  const disk = storage(), options = {storage: disk, validateAsset: (_key, value) => admitPreset(value)};
  const first = createPersonalOwner(options); await first.ready;
  const record = sample(), write = first.putAsset('preset/' + record.id, record); record.content.text = 'mutation'; await write;
  const cold = createPersonalOwner(options); await cold.ready; assert.deepEqual(cold.values('preset/')[record.id], sample());
  const before = await disk.read(); disk.fail(true);
  await assert.rejects(first.putAsset('preset/' + record.id, record), /disk full/); disk.fail(false);
  assert.deepEqual(await disk.read(), before);
  await assert.rejects(first.putAsset('preset/' + record.id, record, () => { throw new Error('stale or Pro revoked'); }), /stale/);
  assert.deepEqual(await disk.read(), before);
  await cold.set('preset/' + record.id, null); await first.snapshot(); assert.deepEqual(first.values('preset/'), {});
  assert.deepEqual(mergePersonal(before.records, (await disk.read()).records), (await disk.read()).records);
  assert.throws(() => admitPersonal({'preset/bad': {by: 'a'.repeat(32), n: 1, value: null}}));
});
test('a missing named font refuses before a preset can be stored or applied', async () => {
  await assert.rejects(preparePreset({...sample(), presentation: {settings: {mainfont: 'Unavailable custom family'}, fonts: ''}}, md), /missing/);
  await assert.rejects(preparePreset({...sample(), presentation: {settings: {defaultfont: 'rapier-f' + '0'.repeat(24)}, fonts: ''}}, md), /missing/);
});
