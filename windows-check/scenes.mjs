// SPDX-License-Identifier: AGPL-3.0-only
// Sets up one Store screenshot scene in a running Rapier window and photographs its page, over the DevTools port the app
// opens when RAPIER_TEST_DEVTOOLS_PORT is set. Node 22 or later, no packages.
//   node scenes.mjs <port> <scene> <page.png> [notes dir]
// Scenes: write, source, draw, pages, notes; journey (the fourth argument is then the opened file) prints its rows. The page picture is the page alone at 1366 x 768, twice the pixels
// (2732 x 1536); listing.ps1 photographs the whole window after this returns.
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const [port, scene, out, notesDir] = process.argv.slice(2);
const pageUrl = /^https:\/\/rapier\.local\/rapier\.html/;

async function target() {
	const until = Date.now() + 90000;
	while (Date.now() < until) {
		try {
			const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
			const page = list.find(t => t.type === 'page' && pageUrl.test(t.url) && t.webSocketDebuggerUrl);
			if (page) return page.webSocketDebuggerUrl;
		} catch {}
		await new Promise(r => setTimeout(r, 1000));
	}
	throw new Error('no Rapier page on the DevTools port');
}

function connect(url) {
	const ws = new WebSocket(url), waiting = new Map();
	let id = 0;
	ws.addEventListener('message', e => {
		const m = JSON.parse(e.data);
		if (m.id && waiting.has(m.id)) { const [ok, no] = waiting.get(m.id); waiting.delete(m.id); m.error ? no(new Error(m.error.message)) : ok(m.result); }
	});
	const send = (method, params = {}) => new Promise((ok, no) => { waiting.set(++id, [ok, no]); ws.send(JSON.stringify({id, method, params})); });
	return new Promise((ok, no) => { ws.addEventListener('open', () => ok({ws, send})); ws.addEventListener('error', no); });
}

const wait = ms => new Promise(r => setTimeout(r, ms));
let cdp = await connect(await target());
async function run(expression) {
	const r = await cdp.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
	if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
	return r.result.value;
}
async function until(expression, label, ms = 30000) {
	const end = Date.now() + ms;
	while (Date.now() < end) { try { if (await run(expression)) return; } catch {} await wait(300); }
	throw new Error(`timed out: ${label}`);
}
const ready = () => until(`window.RapierAgentBrowser?.status().ready === true && !!document.getElementById('editor-blocks')`, 'Rapier ready', 60000);
// Put a section's heading near the top of the page, below the bar, as a reader scrolled there.
const toHeading = text => run(`(() => {
	const h = [...document.querySelectorAll('#editor-blocks h1, #editor-blocks h2')].find(e => e.textContent.trim() === ${JSON.stringify(text)});
	if (!h) return false;
	h.scrollIntoView({block: 'start'});
	let box = h.parentElement;
	while (box && !(box.scrollHeight > box.clientHeight + 1 && getComputedStyle(box).overflowY !== 'visible')) box = box.parentElement;
	(box || document.scrollingElement).scrollBy(0, h.getBoundingClientRect().top - 64);
	return true;
})()`);
const unfocus = () => run(`document.activeElement?.blur?.(); getSelection().removeAllRanges(); true`);

await ready();
// A window remembers its view between starts: each scene sets the one it shows.
const startView = scene === 'source' ? 'source' : 'wysiwyg';
const inSource = `(() => { const s = document.getElementById('source-mode'); return !!s && getComputedStyle(s).display !== 'none'; })()`;
if (await run(inSource) !== (scene === 'source')) await run(`document.getElementById('view-btn-${startView}').click(), true`);
await until(`${inSource} === ${scene === 'source'}`, `${startView} view`);
if (scene === 'draw' || scene === 'pages') {
	const heading = scene === 'draw' ? 'Drawing' : 'Paint';
	const hasHeading = `[...document.querySelectorAll('#editor-blocks h1, #editor-blocks h2')].some(e => e.textContent.trim() === ${JSON.stringify(heading)})`;
	// A window that starts on another document opens Welcome from its own "open user guide" button.
	try { await until(hasHeading, 'Welcome', 4000); } catch {
		await run(`document.querySelector('[data-action="welcome"]').click(), true`);
		await wait(1000);
		const asked = `(() => { const o = document.getElementById('confirm-overlay'); return !!o && !o.inert && o.getAttribute('aria-hidden') !== 'true'; })()`;
		if (await run(asked)) await run(`document.getElementById('confirm-secondary').click(), true`);
	}
	await until(`[...document.querySelectorAll('#editor-blocks h1, #editor-blocks h2')].some(e => e.textContent.trim() === ${JSON.stringify(heading)})`, `Welcome's ${heading}`);
	await toHeading(heading);
} else if (scene === 'notes') {
	const files = (await readdir(notesDir)).filter(f => f.endsWith('.md')).sort();
	const notes = await Promise.all(files.map(async f => [f, await readFile(join(notesDir, f), 'utf8')]));
	// The notes folder is the app's own storage; the seven notes are written there as files, then the app reloads to read them.
	await run(`(async () => { const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('notes', {create: true});
		for (const [name, text] of ${JSON.stringify(notes)}) { const w = await (await dir.getFileHandle(name, {create: true})).createWritable(); await w.write(text); await w.close(); }
		return true; })()`);
	await run(`location.reload(), true`);
	await wait(1500);
	cdp.ws.close();
	cdp = await connect(await target());
	await ready();
	await until(`!!document.getElementById('notes-open-btn')`, 'Notes installed');
	await run(`document.getElementById('notes-open-btn').click(), true`);
	await until(`(() => { const s = document.getElementById('rapier-notes-surface'); return !!s && !s.hidden && document.querySelectorAll('#rapier-notes-surface [data-note-id], #rapier-notes-surface .rapier-notes-card').length >= ${notes.length}; })()`, 'seven cards');
} else if (scene === 'journey') {
	// Open, write, Undo, through the page as a person does: the file's text in source view, a sentence typed into the first
	// paragraph in the formatted view, then Ctrl+Z gives the file's text back exactly.
	const source = `document.getElementById('source-textarea').value.replace(/\\r\\n/g, '\\n')`;
	const view = async mode => {
		if (await run(inSource) !== (mode === 'source')) await run(`document.getElementById('view-btn-${mode}').click(), true`);
		await until(`${inSource} === ${mode === 'source'}`, `${mode} view`);
		await wait(500);
	};
	const key = (key, code, keyCode, modifiers = 0) => ['keyDown', 'keyUp'].reduce((p, type) => p.then(() =>
		cdp.send('Input.dispatchKeyEvent', {type, key, code, windowsVirtualKeyCode: keyCode, modifiers})), Promise.resolve());
	const rows = {};
	const file = (await readFile(notesDir, 'utf8')).replace(/\r\n/g, '\n');
	await view('source');
	const opened = await run(source);
	rows.opened = opened === file;
	await view('wysiwyg');
	const at = await run(`(() => { const p = [...document.querySelectorAll('#editor-blocks p')].find(e => e.textContent.startsWith('The bed by the fence'));
		p.scrollIntoView({block: 'center'}); const r = p.getBoundingClientRect(); return {x: r.right - 4, y: r.bottom - 6}; })()`);
	for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', {type, x: at.x, y: at.y, button: 'left', clickCount: 1});
	await wait(800);
	await key('End', 'End', 35, 2);
	await cdp.send('Input.insertText', {text: ' Mulch the beds in May.'});
	await wait(500);
	await key('Escape', 'Escape', 27);
	await wait(800);
	await view('source');
	const written = await run(source);
	rows.written = written.includes('easy to pick. Mulch the beds in May.') || written.includes('Mulch the beds in May.');
	await run(`document.getElementById('source-textarea').blur(), true`);
	await key('z', 'KeyZ', 90, 2);
	await wait(1000);
	rows.undone = (await run(source)) === opened;
	rows.ok = rows.opened && rows.written && rows.undone;
	console.log(JSON.stringify({journey: rows}));
	await view('wysiwyg');
} else if (scene !== 'write' && scene !== 'source') throw new Error(`unknown scene ${scene}`);
await unfocus();
await wait(2500);

// The page alone at the Store's own size, then back to the window's size for the window photograph.
await cdp.send('Emulation.setDeviceMetricsOverride', {width: 1366, height: 768, deviceScaleFactor: 2, mobile: false});
await wait(1500);
if (scene === 'draw' || scene === 'pages') await toHeading(scene === 'draw' ? 'Drawing' : 'Paint');
await wait(1000);
const shot = await cdp.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
await writeFile(out, Buffer.from(shot.data, 'base64'));
await cdp.send('Emulation.clearDeviceMetricsOverride');
if (scene === 'draw' || scene === 'pages') { await wait(800); await toHeading(scene === 'draw' ? 'Drawing' : 'Paint'); }
await wait(1500);
cdp.ws.close();
console.log(`${scene} ${out}`);
