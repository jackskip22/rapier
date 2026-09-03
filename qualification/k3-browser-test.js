#!/usr/bin/env node
'use strict';

/* KERNEL-3's seven public-surface predicates. This registry is intentionally separate from
   the 300-case product suite: it can be run against a served review candidate without
   changing production bytes or inheriting the old red drivers' inverted exit semantics. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO = path.resolve(process.env.RAPIER_REPO || path.join(__dirname, '..'));
const URL = process.env.RAPIER_URL || 'http://127.0.0.1:8199/rapier.html';
const artifact = fs.readFileSync(path.join(REPO, 'rapier.html'));
const shim = fs.readFileSync(path.join(REPO, 'qualification', 'webmcp-shim.js'), 'utf8');
const subjectSha256 = crypto.createHash('sha256').update(artifact).digest('hex');
let chromium;

function assert(condition, message, detail) {
  if (!condition) throw Object.assign(new Error(message), { detail });
}

async function call(page, name, input = {}) {
  const raw = await page.evaluate(async ({ name, input }) => window.__webmcp.call(name, input),
    { name, input });
  const outer = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const text = outer && outer.content && outer.content[0] && outer.content[0].text;
  return typeof text === 'string' ? JSON.parse(text) : text;
}

async function verifyNavigation(response, label) {
  assert(response, label + ' returned no main-document response', { url: URL });
  const bytes = await response.body();
  const servedSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  assert(servedSha256 === subjectSha256,
    label + ' differs from the qualified disk bytes', {
      subjectSha256, servedSha256, status: response.status(), url: response.url(),
    });
  return servedSha256;
}

async function readyPage(browser, init = '') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(shim + '\nwindow.__installWebMcpShim();\n' + init);
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
  const response = await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await verifyNavigation(response, 'executed navigation response');
  await page.waitForFunction(() => window.__webmcp && window.__webmcp.count() > 0,
    null, { timeout: 30000 });
  await page.waitForTimeout(350);
  return { context, page };
}

async function chooseView(page, button) {
  await page.locator('#btn-overflow').click();
  await page.locator(button).click();
}

async function waitTool(page, name, timeout = 10000) {
  await page.waitForFunction(tool => window.__webmcp && window.__webmcp.names().includes(tool),
    name, { timeout });
}

async function sourceFact(page) {
  return page.locator('#source-textarea').evaluate(async node => {
    const value = node.value;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    const sha256 = Array.from(new Uint8Array(digest), byte =>
      byte.toString(16).padStart(2, '0')).join('');
    const mode = document.getElementById('source-mode');
    const overlay = document.getElementById('source-highlight-code');
    return { length: value.length, head: value.slice(0, 16), tail: value.slice(-16), sha256,
      plainCode: mode && mode.dataset.plaincode === 'on',
      overlayChildren: overlay ? overlay.childElementCount : -1 };
  });
}

async function readBlock(page, index) {
  const point = await page.evaluate(i => {
    const wrapper = document.querySelectorAll('#editor-blocks > .block-wrapper')[i];
    if (!wrapper) return null;
    const rect = wrapper.getBoundingClientRect();
    return { x: rect.left + 12, y: rect.top + Math.min(10, rect.height / 2) };
  }, index);
  assert(point, 'block was not rendered', { index });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(120);
  const context = await call(page, 'document.get_context');
  assert(context.focus && context.focus.ref, 'focus did not mint a readable ref', context);
  const read = await call(page, 'document.read_context', {
    ref: context.focus.ref, representation: 'markdown',
  });
  assert(read.outcome === 'read', 'raw block read was refused', read);
  return read.text;
}

async function blockPoint(page, index) {
  return page.evaluate(i => {
    const wrapper = document.querySelectorAll('#editor-blocks > .block-wrapper')[i];
    if (!wrapper) return null;
    const rect = wrapper.getBoundingClientRect();
    return { x: rect.left + 12, y: rect.top + Math.min(10, rect.height / 2) };
  }, index);
}

async function blockTexts(page) {
  const count = await page.locator('#editor-blocks > .block-wrapper').count();
  const texts = [];
  for (let index = 0; index < count; index++) texts.push(await readBlock(page, index));
  return texts;
}

async function waitContext(page, predicate, timeout = 15000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    try {
      last = await call(page, 'document.get_context');
      if (predicate(last)) return last;
    } catch (_) {}
    await page.waitForTimeout(200);
  }
  throw Object.assign(new Error('document context did not reach the expected state'), { detail: last });
}

async function editBlockByUi(page, index, text, blurIndex) {
  const target = await blockPoint(page, index);
  assert(target, 'UI edit target was not rendered', { index });
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(150);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type(text);
  const blur = await blockPoint(page, blurIndex);
  assert(blur, 'UI edit blur target was not rendered', { blurIndex });
  await page.mouse.click(blur.x, blur.y);
  await page.waitForTimeout(350);
}

async function deleteBlockByUi(page, index, blurNeedle) {
  const target = await blockPoint(page, index);
  assert(target, 'UI deletion target was not rendered', { index });
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(150);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  const selected = await page.evaluate(() => String(getSelection()?.toString() || ''));
  assert(selected.length > 0, 'UI deletion selected no block text', { index });
  await page.keyboard.press('Backspace');
  const blur = await page.evaluate(needle => {
    const wrapper = Array.from(document.querySelectorAll('#editor-blocks > .block-wrapper'))
      .find(node => node.textContent.includes(needle));
    if (!wrapper) return null;
    const rect = wrapper.getBoundingClientRect();
    return { x: rect.left + 12, y: rect.top + Math.min(10, rect.height / 2) };
  }, blurNeedle);
  assert(blur, 'UI deletion had no stable blur target', { blurNeedle });
  await page.mouse.click(blur.x, blur.y);
  await page.waitForTimeout(350);
}

async function showChanges(page) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const names = await page.evaluate(() => window.__webmcp.names());
    if (names.includes('document.show_changes')) return call(page, 'document.show_changes');
    await page.waitForTimeout(120);
  }
  throw new Error('show_changes was not admitted');
}

async function findHandle(page, query) {
  const result = await call(page, 'document.find', { query });
  const match = result.matches && result.matches.find(row => row.matched === query || row.handle);
  assert(match && match.handle, 'find did not return an editable handle', result);
  return match.handle;
}

async function openText(page, filename, content) {
  const result = await call(page, 'document.open_text', { filename, content });
  assert(result.outcome === 'opened', 'document did not open', result);
  await page.waitForTimeout(250);
  return result;
}

async function k31(browser) {
  const { context, page } = await readyPage(browser);
  try {
    const before = 'A\nB\r\nC\nD\r\nE';
    const pasted = 'βγ';
    const edited = 'A\n' + pasted + 'B\r\nC\nD\r\nE';
    await openText(page, 'k31.md', before);
    const opened = await call(page, 'document.get_context');
    await chooseView(page, '#view-btn-source');
    await page.locator('#source-mode').waitFor({ state: 'visible' });
    const textarea = page.locator('#source-textarea');
    await textarea.evaluate(node => {
      node.focus();
      node.setSelectionRange(2, 2);
    });
    const paste = await textarea.evaluate((node, text) => {
      const clipboardData = {
        getData: type => /^(?:text\/plain|text\/markdown)$/.test(type) ? text : '',
        types: ['text/plain', 'text/markdown'], files: [], items: [],
      };
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: clipboardData });
      const dispatched = node.dispatchEvent(event);
      return { defaultPrevented: event.defaultPrevented, dispatched, value: node.value };
    }, pasted);
    assert(paste.defaultPrevented === true && paste.value === 'A\n' + pasted + 'B\nC\nD\nE',
      'the source textarea did not own the exact paste', paste);
    await waitContext(page, value => value.documentRevision === opened.documentRevision + 1);
    await chooseView(page, '#view-btn-wysiwyg');
    await page.locator('#editor-blocks').waitFor({ state: 'visible' });
    const after = await readBlock(page, 0);
    assert(after === edited, 'source paste changed untouched EOL bytes', { before, edited, after });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await waitContext(page, value => value.documentRevision >= opened.documentRevision + 2);
    const undone = await readBlock(page, 0);
    assert(undone === before, 'one Undo did not remove exactly the paste', { before, undone });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
    await waitContext(page, value => value.documentRevision >= opened.documentRevision + 3);
    const redone = await readBlock(page, 0);
    assert(redone === edited, 'one Redo did not restore exactly the paste', { edited, redone });
    return { pasteOwned: true, editedBytesExact: true, undoBytesExact: true, redoBytesExact: true };
  } finally { await context.close(); }
}

async function k32(browser) {
  const { context, page } = await readyPage(browser);
  try {
    const before = 'Alpha stays put.\n\nBravo original.';
    const after = 'Bravo recovered edit.';
    await openText(page, 'k32.md', before);
    await editBlockByUi(page, 1, after, 0);
    assert(await readBlock(page, 1) === after, 'rendered recovery fixture edit did not land');
    const editedContext = await call(page, 'document.get_context');
    const durable = await waitContext(page, value =>
      value.documentRevision === editedContext.documentRevision && value.history &&
      value.history.durable && value.history.durable.complete === true, 20000);
    const reload = await page.reload({ waitUntil: 'load', timeout: 30000 });
    await verifyNavigation(reload, 'executed reload response');
    await page.waitForFunction(() => window.__webmcp && window.__webmcp.count() > 0,
      null, { timeout: 30000 });
    await waitContext(page, value => value.filename === 'k32.md');
    const recovered = await readBlock(page, 1);
    assert(recovered === after, 'checkpoint did not restore the edited bytes', { recovered, after });
    const focus = await blockPoint(page, 0);
    await page.mouse.click(focus.x, focus.y);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await page.waitForTimeout(500);
    const restored = await readBlock(page, 1);
    assert(restored === 'Bravo original.', 'recovered Undo did not address restored bytes', restored);
    return { durable: durable.history.durable, recoveredUndo: true };
  } finally { await context.close(); }
}

async function k33(browser) {
  const { context, page } = await readyPage(browser);
  try {
    const original = 'Kilo original text stands here.\n\nLima stays.';
    await openText(page, 'k33.md', original);
    const handle = await findHandle(page, 'original');
    const edit = await call(page, 'document.apply_edits', {
      edits: [{ context_handle: handle, text: 'REVISED' }], label: 'K3 baseline edit',
    });
    assert(/^(applied|rebased)$/.test(edit.outcome), 'baseline fixture edit did not land', edit);
    const revised = await readBlock(page, 0);
    assert(revised === 'Kilo REVISED text stands here.',
      'applied outcome did not change the exact source bytes', revised);

    const opened = await showChanges(page);
    assert(opened.outcome === 'shown' && opened.changes > 0,
      'show_changes did not open Compare over the changed bytes', opened);
    await waitTool(page, 'compare.get_context');
    const comparison = await call(page, 'compare.get_context');
    assert(comparison.open === true && comparison.status === 'ok' &&
      comparison.changeCount >= 1 && comparison.readableChanges >= 1,
    'Compare did not publish a readable exact change', comparison);
    const firstChange = comparison.changes && comparison.changes[0];
    const change = await call(page, 'compare.read_change', {
      index: firstChange && firstChange.index || 1,
    });
    const removed = (change.rows || []).filter(row => row.type === 'remove').map(row => row.text);
    const added = (change.rows || []).filter(row => row.type === 'add').map(row => row.text);
    assert(change.outcome === 'read' && removed.includes('Kilo original text stands here.') &&
      added.includes('Kilo REVISED text stands here.'),
    'Compare did not carry the exact baseline and revision', { change, removed, added });
    const closed = await call(page, 'compare.close');
    assert(closed.outcome === 'closed', 'the public Compare close route did not settle', closed);
    await waitTool(page, 'document.get_context');

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await waitContext(page, value => value.documentRevision > edit.documentRevision);
    const restored = await readBlock(page, 0);
    assert(restored === 'Kilo original text stands here.',
      'inverse commit did not restore the exact baseline bytes', restored);
    const shown = await showChanges(page);
    assert(shown.outcome === 'unchanged', 'byte-identical baseline was not reported unchanged', shown);
    return { compare: { changes: comparison.changeCount, exactRows: true }, baseline: shown };
  } finally { await context.close(); }
}

async function deleteAndTraverse(browser, index, blurNeedle, expected) {
  const { context, page } = await readyPage(browser);
  try {
    const blocks = ['first block', 'middle block', 'last block'];
    await openText(page, 'k34-' + index + '.md', blocks.join('\n\n'));
    await deleteBlockByUi(page, index, blurNeedle);
    const deleted = await blockTexts(page);
    assert(JSON.stringify(deleted) === JSON.stringify(expected),
      'real UI deletion produced the wrong surviving blocks', { index, deleted, expected });
    const shown = await showChanges(page);
    assert(shown.outcome === 'shown', 'first/middle deletion was absent from since-open', shown);
    await page.mouse.click(50, 50).catch(() => {});
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await page.waitForTimeout(350);
    const undone = await blockTexts(page);
    assert(JSON.stringify(undone) === JSON.stringify(blocks),
      'Undo did not restore the real UI deletion', { index, undone });
    await page.mouse.click(50, 50).catch(() => {});
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
    await page.waitForTimeout(350);
    const redone = await blockTexts(page);
    assert(JSON.stringify(redone) === JSON.stringify(expected),
      'Redo did not reapply the real UI deletion', { index, redone, expected });
    return { index, showChanges: shown.outcome, undo: true, redo: true };
  } finally { await context.close(); }
}

async function k34(browser) {
  const first = await deleteAndTraverse(browser, 0, 'middle block', ['middle block', 'last block']);
  const middle = await deleteAndTraverse(browser, 1, 'first block', ['first block', 'last block']);
  return { first, middle };
}

async function hostileLineCase(browser, size, tail, exerciseHistory) {
  const { context, page } = await readyPage(browser);
  try {
    const opened = await page.evaluate(async ({ size, tail }) => {
      const content = 'a'.repeat(size - tail.length) + tail;
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
      const sha256 = Array.from(new Uint8Array(digest), byte =>
        byte.toString(16).padStart(2, '0')).join('');
      const raw = await window.__webmcp.call('document.open_text', {
        filename: 'k35-' + size + '.md', content,
      });
      const outer = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const text = outer && outer.content && outer.content[0] && outer.content[0].text;
      return { result: typeof text === 'string' ? JSON.parse(text) : text, sha256 };
    }, { size, tail });
    assert(opened.result && opened.result.outcome === 'opened',
      'large source fixture did not open through the public tool', opened.result);
    const delay = await page.evaluate(() => new Promise(resolve => {
      const started = performance.now();
      setTimeout(() => resolve(performance.now() - started), 0);
      document.getElementById('btn-overflow').click();
      document.getElementById('view-btn-source').click();
    }));
    assert(delay < 750, 'hostile long-line highlight blocked the main thread', { delay });
    await page.locator('#source-mode').waitFor({ state: 'visible' });
    const initial = await sourceFact(page);
    assert(initial.length === size && initial.tail.endsWith(tail) &&
      initial.sha256 === opened.sha256,
    'source view did not preserve the hostile line exactly', { size, tail, initial });
    assert(initial.plainCode === true && initial.overlayChildren === 0,
      'over-budget highlight did not choose native plain-code geometry', initial);
    if (!exerciseHistory) return { delayMs: delay, source: initial, history: false };

    const textarea = page.locator('#source-textarea');
    await textarea.evaluate(node => {
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
    });
    await page.keyboard.insertText('Z');
    await waitContext(page, value => value.documentRevision > opened.result.documentRevision, 30000);
    const edited = await sourceFact(page);
    assert(edited.length === size + 1 && edited.tail.endsWith(tail + 'Z'),
      'near-limit tail edit was not exact', edited);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await waitContext(page, value => value.documentRevision > opened.result.documentRevision + 1, 30000);
    const undone = await sourceFact(page);
    assert(undone.sha256 === initial.sha256 && undone.length === initial.length,
      'near-limit Undo did not restore exact source bytes', { initial, undone });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
    await waitContext(page, value => value.documentRevision > opened.result.documentRevision + 2, 30000);
    const redone = await sourceFact(page);
    assert(redone.sha256 === edited.sha256 && redone.length === edited.length,
      'near-limit Redo did not restore exact edited bytes', { edited, redone });
    return { delayMs: delay, source: initial, history: true,
      editedSha256: edited.sha256, undoRedoExact: true };
  } finally { await context.close(); }
}

async function k35(browser) {
  const slab = await hostileLineCase(browser, 65536, 'SLAB', false);
  const nearLimit = await hostileLineCase(browser, 25 * 1024 * 1024 - 4096, 'TAIL', true);
  return { slab, nearLimit };
}

async function k36(browser) {
  const { context, page } = await readyPage(browser);
  try {
    const text = 'x\n\n'.repeat(5000);
    await openText(page, 'k36.md', text);
    const contextResult = await call(page, 'document.get_context');
    const wrappers = await page.locator('#editor-blocks > .block-wrapper').count();
    assert(contextResult.mode === 'source' && contextResult.projection &&
      contextResult.projection.wysiwyg === 'unavailable' &&
      contextResult.projection.reason === 'wysiwyg_block_limit' &&
      contextResult.projection.observed === 5000 && contextResult.projection.limit === 4096,
    'structural explosion did not enter named source-only mode', contextResult);
    assert(wrappers === 0, 'a refused WYSIWYG projection left rendered wrappers behind', wrappers);
    const outline = await call(page, 'document.get_outline');
    assert(outline.outcome === 'unavailable' && outline.reason === 'wysiwyg_block_limit',
      'outline invented a successful shape after WYSIWYG refusal', outline);
    await page.locator('#source-mode').waitFor({ state: 'visible' });
    const source = await page.locator('#source-textarea').inputValue();
    assert(source === text, 'source-only projection did not retain exact source bytes', source.length);
    return { wrappers, projection: contextResult.projection, outline: outline.outcome };
  } finally { await context.close(); }
}

async function k37(browser) {
  const init = `
    const NativeWorker = window.Worker;
    window.Worker = class RapierQualificationBrokenWorker {
      constructor() { throw new Error('qualification worker unavailable'); }
      static get nativeWorker() { return NativeWorker; }
    };`;
  const { context, page } = await readyPage(browser, init);
  try {
    const text = '# Worker failure\n\nsource survives';
    await openText(page, 'k37.md', text);
    const result = await call(page, 'document.get_context');
    const wrappers = await page.locator('#editor-blocks > .block-wrapper').count();
    assert(result.mode === 'source' && result.projection &&
      /^wysiwyg_worker_/.test(result.projection.reason),
    'Worker failure did not preserve source with a named projection refusal', result);
    assert(wrappers === 0, 'Worker refusal left rendered wrappers behind', wrappers);
    const outline = await call(page, 'document.get_outline');
    assert(outline.outcome === 'unavailable' && /^wysiwyg_worker_/.test(outline.reason),
      'outline invented a successful shape after Worker refusal', outline);
    await page.locator('#source-mode').waitFor({ state: 'visible' });
    const source = await page.locator('#source-textarea').inputValue();
    assert(source === text, 'Worker refusal did not retain exact source bytes', source);
    return { projection: result.projection, wrappers, outline: outline.outcome };
  } finally { await context.close(); }
}

const K3_BROWSER_ROUTES = Object.freeze([
  'source-paste-mixed-eol-history', 'autosave-reload-history',
  'agent-edit-compare-baseline', 'wysiwyg-delete-history',
  'hostile-source-plaincode-history', 'block-budget-source-refusal',
  'worker-failure-source-refusal',
]);
const K3_BROWSER_CASES = Object.freeze([
  Object.freeze({ id: 'K3-1', route: K3_BROWSER_ROUTES[0], run: k31 }),
  Object.freeze({ id: 'K3-2', route: K3_BROWSER_ROUTES[1], run: k32 }),
  Object.freeze({ id: 'K3-3', route: K3_BROWSER_ROUTES[2], run: k33 }),
  Object.freeze({ id: 'K3-4', route: K3_BROWSER_ROUTES[3], run: k34 }),
  Object.freeze({ id: 'K3-5', route: K3_BROWSER_ROUTES[4], run: k35 }),
  Object.freeze({ id: 'K3-6', route: K3_BROWSER_ROUTES[5], run: k36 }),
  Object.freeze({ id: 'K3-7', route: K3_BROWSER_ROUTES[6], run: k37 }),
]);

function k3RegistryFacts(cases = K3_BROWSER_CASES) {
  const rows = Array.isArray(cases) ? cases : [];
  const ids = rows.map(row => row && row.id);
  const routes = rows.map(row => row && row.route);
  const runs = rows.map(row => row && row.run);
  return {
    ok: rows.length === 7 && new Set(ids).size === 7 && new Set(routes).size === 7
      && new Set(runs).size === 7
      && ids.every((id, index) => id === 'K3-' + (index + 1))
      && routes.every((route, index) => route === K3_BROWSER_ROUTES[index])
      && runs.every(run => typeof run === 'function'),
    count: rows.length, ids, routes,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && args[0] !== '--census')) {
    throw new Error('usage: node qualification/k3-browser-test.js [--census]');
  }
  const registry = k3RegistryFacts();
  assert(registry.ok,
    'KERNEL-3 browser registry must contain exact unique K3-1..K3-7 public routes', registry);
  if (args[0] === '--census') {
    console.log(JSON.stringify({ status: 'census', subjectSha256, ...registry }));
    return;
  }
  try { ({ chromium } = require('playwright')); }
  catch (error) {
    console.log(JSON.stringify({ status: 'not_run', reason: 'playwright_unavailable', subjectSha256 }));
    process.exitCode = 2;
    return;
  }
  let browser;
  try {
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  } catch (error) {
    console.log(JSON.stringify({ status: 'not_run', reason: 'chromium_unavailable',
      subjectSha256, detail: String(error.message || error).slice(0, 240) }));
    process.exit(2);
  }
  const results = [];
  try {
    for (const testCase of K3_BROWSER_CASES) {
      try {
        results.push({ name: testCase.id, status: 'pass', detail: await testCase.run(browser) });
      } catch (error) {
        results.push({ name: testCase.id, status: 'fail', reason: String(error.message || error),
          detail: error.detail || null });
      }
    }
  } finally { await browser.close(); }
  const failed = results.filter(row => row.status !== 'pass');
  console.log(JSON.stringify({ status: failed.length ? 'fail' : 'pass', subjectSha256,
    pass: results.length - failed.length, fail: failed.length, results }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
}

module.exports = Object.freeze({ K3_BROWSER_CASES, K3_BROWSER_ROUTES, k3RegistryFacts });

if (require.main === module) {
  main().catch(error => {
    console.error(error && error.stack || error);
    process.exitCode = 1;
  });
}
