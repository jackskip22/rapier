// Drives the converter page over WebView2 DevTools on loopback: node drive.mjs <port> wait | tab <name> | archive <effort> <minutes>
import {writeSync} from 'node:fs';
const [port, command, ...rest] = process.argv.slice(2);
const say = (...parts) => writeSync(1, parts.join(' ') + '\n');
const sleep = ms => new Promise(next => setTimeout(next, ms));

async function target() {
	for (let i = 0; i < 120; i++) {
		try {
			const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
			const page = list.find(t => t.type === 'page' && t.url.startsWith('https://rapier.local/rapier.html'));
			if (page) return page.webSocketDebuggerUrl;
		} catch (_) {}
		await sleep(1000);
	}
	throw new Error('no converter page on port ' + port);
}
const socket = new WebSocket(await target());
await new Promise((ok, no) => { socket.onopen = ok; socket.onerror = no; });
let serial = 0;
const waiting = new Map();
const heard = [];
const hear = line => { heard.push(line.slice(0, 300)); if (heard.length > 40) heard.shift(); };
socket.onmessage = event => {
	const m = JSON.parse(event.data);
	if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
	if (m.method === 'Runtime.exceptionThrown') hear('exception: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
	else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) hear('console ' + m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
	else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') hear('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
};
const call = (method, params = {}) => new Promise(ok => {
	const id = ++serial;
	const late = setTimeout(() => { waiting.delete(id); ok({result: {exceptionDetails: {exception: {description: 'no answer from the page in 60 s'}}}}); }, 60000);
	waiting.set(id, m => { clearTimeout(late); ok(m); });
	socket.send(JSON.stringify({id, method, params}));
});
await Promise.all([call('Runtime.enable'), call('Log.enable')]);
async function evaluate(expression) {
	const m = await call('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
	if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || 'evaluate failed');
	return m.result?.result?.value;
}
async function until(expression, seconds) {
	for (let i = 0; i < seconds * 2; i++) { if (await evaluate(expression).catch(() => false)) return true; await sleep(500); }
	const seen = await evaluate(`JSON.stringify({url: location.href, readyState: document.readyState, title: document.title, view: !!document.querySelector('.rapier-jxl-view'), body: (document.body?.innerText || '').slice(0, 500)})`).catch(error => 'not readable: ' + error.message);
	throw new Error('timed out: ' + expression + '\n  page: ' + seen + '\n  heard: ' + (heard.length ? heard.join('\n    ') : 'nothing'));
}
const panel = '#rapier-jxl-panel-archive';
const text = selector => `document.querySelector(${JSON.stringify(selector)})?.textContent || ''`;
const press = words => `(() => { const b = [...document.querySelectorAll('${panel} button')].find(b => !b.hidden && b.textContent === ${JSON.stringify(words)}); if (!b) return false; b.click(); return true; })()`;

try {
	if (command === 'wait') { await until(`!!document.querySelector('.rapier-jxl-tabs')`, 120); say('ready'); }
	else if (command === 'tab') { await until(`!!document.querySelector('#rapier-jxl-tab-${rest[0]}')`, 60); await evaluate(`document.querySelector('#rapier-jxl-tab-${rest[0]}').click(), document.querySelector('.rapier-jxl-view__body')?.scrollTo(0, 0), true`); await sleep(1500); say('tab', rest[0]); }
	else if (command === 'eval') say(JSON.stringify(await evaluate(rest[0])));
	else if (command === 'view') { await until(`!!document.querySelector('.rapier-image-lightbox.open canvas')?.dataset.shown`, 180); say('viewer shows', await evaluate(`document.querySelector('.rapier-image-lightbox canvas').width + 'x' + document.querySelector('.rapier-image-lightbox canvas').height`)); }
	else if (command === 'archive') {
		const [effort, minutes] = rest.map(Number);
		await until(`!!document.querySelector('#rapier-jxl-tab-archive')`, 60);
		await evaluate(`document.querySelector('#rapier-jxl-tab-archive').click(), true`);
		await evaluate(`chrome.webview.postMessage({op: 'archive.options', effort: ${effort}}), chrome.webview.postMessage({op: 'archive.scan'}), true`);
		await until(`/JPEGs? ·/.test(${text(panel + ' .rapier-jxl-view__note')}) && !/looking/.test(${text(panel + ' .rapier-jxl-view__note')})`, 1800);
		const scanned = await evaluate(text(panel + ' .rapier-jxl-view__note'));
		say('scanned:', scanned);
		const startShown = `[...document.querySelectorAll('${panel} button')].some(b => !b.hidden && b.textContent === 'Start')`;
		if (/^0 JPEGs ·/.test(scanned)) {
			say('nothing new: ' + scanned);
			if (!await evaluate(press('Start'))) throw new Error('no Start (licence: ' + scanned + ')');
			await until(`/^Nothing new/.test(${text(panel + ' .rapier-jxl-view__count')}) && ${startShown}`, 60);
			const shown = await evaluate(text(panel + ' .rapier-jxl-view__count'));
			say('finished: ' + shown);
			say(JSON.stringify({seconds: 0, count: shown, nothingNew: true, rows: []}));
			socket.close(); process.exit(0);
		}
		await sleep(15000);  // the estimate's few carries
		say('estimate:', await evaluate(text(panel + ' .rapier-jxl-view__note')));
		if (!await evaluate(press('Start'))) throw new Error('no Start (licence: ' + await evaluate(text(panel + ' .rapier-jxl-view__note')) + ')');
		const started = Date.now();
		let last = '';
		for (;;) {
			await sleep(30000);
			const count = await evaluate(text(panel + ' .rapier-jxl-view__count')).catch(error => 'no answer: ' + error.message);
			if (count !== last) { say(Math.round((Date.now() - started) / 1000) + ' s: ' + count); last = count; }
			if (/of|^Nothing new/.test(count) && await evaluate(startShown).catch(() => false)) break;
			if (Date.now() - started > minutes * 60e3) throw new Error('over ' + minutes + ' minutes: ' + count);
		}
		say(JSON.stringify({seconds: Math.round((Date.now() - started) / 1000), count: await evaluate(text(panel + ' .rapier-jxl-view__count')), rows: await evaluate(`[...document.querySelectorAll('${panel} .rapier-jxl-view__row')].map(r => r.textContent)`)}));
	}
	else if (command === 'watchwait') {
		const before = await evaluate(text(panel + ' .rapier-jxl-view__count'));
		const started = Date.now();
		for (;;) { await sleep(2000); const now = await evaluate(text(panel + ' .rapier-jxl-view__count')); if (now !== before && /of/.test(now)) { say('watched:', now); break; } if (Date.now() - started > Number(rest[0]) * 60e3) throw new Error('nothing arrived: ' + now); }
	}
	else throw new Error('unknown command ' + command);
	socket.close();
	process.exit(0);
} catch (error) { say('DRIVE FAILED: ' + error.message); socket.close(); process.exit(1); }
