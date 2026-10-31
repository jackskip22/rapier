// SPDX-License-Identifier: AGPL-3.0-only

if (window.self !== window.top) {
	const held = [];
	const hold = event => { if (event.source === window.parent && event.data?.type === 'rapier-connect' && held.length < 4) held.push(event); };
	addEventListener('message', hold);
	globalThis.RapierEarlyConnects = Object.freeze({take() { removeEventListener('message', hold); return held.splice(0); }});
}

async function readerUnpack(id) {
	const text = document.getElementById(id).textContent;
	const end = text.indexOf('\n'), header = JSON.parse(text.slice(0, end));
	const stream = new Blob([decodeBase124(text.slice(end + 1))]).stream().pipeThrough(new DecompressionStream('gzip'));
	const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
	if (bytes.length !== header.bytes) throw new Error('unpacked length does not match');
	const decoder = new TextDecoder('utf-8', {fatal: true});
	let at = 0;
	return header.spans.map(([kind, name, length]) => ({kind, name, text: decoder.decode(bytes.subarray(at, at += length))}));
}

function readerRun(name, source) {
	const element = document.createElement('script');
	element.textContent = source + '\n;document.currentScript._done = true;\n//# sourceURL=' + name;
	let thrown = null;
	const caught = event => { if (event.filename === name || document.currentScript === element) thrown = event.error || new Error(event.message); };
	addEventListener('error', caught);
	try { document.head.append(element); } finally { removeEventListener('error', caught); element.remove(); }
	if (element._done !== true) throw new Error(name, {cause: thrown || new Error('script did not finish')});
}

globalThis.RapierUnpack = readerUnpack;

async function readerBoot() {
	try {
		const spans = await readerUnpack('rapier-pack');
		document.getElementById('rapier-pack').textContent = '';
		for (const {kind, name, text} of spans) {
			if (kind === 'css') {
				const style = document.createElement('style');
				style.id = name;
				style.textContent = text;
				document.head.append(style);
			} else if (kind === 'html') document.body.insertAdjacentHTML('afterbegin', text);
			else readerRun(name, text);
		}
	} catch (error) {
		document.body.classList.add('rapier-boot-failed');
		try { console.error('[rapier-reader] startup failed', error); } catch (_) {}
		if (window.self !== window.top) try { window.parent.postMessage({type: 'rapier-boot-failed'}, '*'); } catch (_) {}
	}
}
void readerBoot();
