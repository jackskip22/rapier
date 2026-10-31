// SPDX-License-Identifier: AGPL-3.0-only
import {readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unobservedBuildIO} from './build-reuse.mjs';
import {join} from 'node:path';
import {DOORS, GUIDES, doorAssetPath, doorPage} from '../door-worker.js';
import {createGroupPacker} from './packed-group.mjs';
import {guideSection} from './seo-page.mjs';
import {firstScreenElement} from './first-screen-record.mjs';

export const DOOR_ASSET_NAMES = Object.freeze(Object.keys(DOORS).map(path => doorAssetPath(path).slice(1)));
export const GUIDE_ASSET_NAMES = Object.freeze(Object.keys(GUIDES).map(path => doorAssetPath(path).slice(1)));

export async function readGuides(docs, transform = text => text) {
	return Object.fromEntries(await Promise.all(Object.entries(GUIDES).map(async ([path, guide]) =>
		[path, transform(await readFile(join(docs, guide.file), 'utf8'), guide.file)])));
}

async function removeDoorAssets(directory, keep = null) {
	await unobservedBuildIO(async () => {
		const runtimes = (await readdir(directory)).filter(name => SITE_RUNTIME_FILE.test(name) && name !== keep);
		await Promise.all(['index.html', ...DOOR_ASSET_NAMES, ...GUIDE_ASSET_NAMES, ...runtimes].map(name => rm(join(directory, name), {force: true})));
	});
}

export const SITE_RUNTIME_IDS = Object.freeze(['lib-markdownit', 'lib-gpu-lexer', 'rapier-editor-runtime', 'lib-acorn', 'rapier-jxl-worker']);
export const SITE_RUNTIME_FILE = /^rapier-editor-[0-9a-f]{16}\.txt$/;
const RUNTIME_META = /<meta name="rapier-runtime-file" content="(rapier-editor-[0-9a-f]{16}\.txt) (sha384-[A-Za-z0-9+/=]+) ([a-z -]+)">\n/;
export function siteRuntimeFile(text) { return RUNTIME_META.exec(text)?.[1] ?? null; }
export function siteRuntimePin(text) {
	const match = RUNTIME_META.exec(text);
	return match ? {file: match[1], integrity: match[2]} : null;
}
export function splitSitePage(text) {
	if (RUNTIME_META.test(text)) throw new Error('The site page is already split');
	let page = text, body = '';
	for (const id of SITE_RUNTIME_IDS) {
		const element = new RegExp('<script type="(?:application/rapier-runtime|application/rapier-jxl-worker|text/rapier-vendor)" id="' + id + '">[^<]*</script>\n', 'g');
		const found = page.match(element);
		if (found?.length !== 1) throw new Error('The site page needs exactly one ' + id + ' element');
		body += found[0];
		page = page.replace(element, '');
	}
	const bytes = Buffer.from(body);
	const name = 'rapier-editor-' + createHash('sha256').update(bytes).digest('hex').slice(0, 16) + '.txt';
	const integrity = 'sha384-' + createHash('sha384').update(bytes).digest('base64');
	const charset = '<meta charset="UTF-8">\n';
	if (page.split(charset).length !== 2) throw new Error('The site page needs its one charset');
	page = page.replace(charset, () => charset + '<meta name="rapier-runtime-file" content="' + name + ' ' + integrity + ' ' + SITE_RUNTIME_IDS.join(' ') + '">\n');
	return {page, file: {name, bytes}};
}

export async function writeDoorAssets(directory, page, guides = null, firstPaint = null, firstScreen = null) {
	let bytes = page instanceof Uint8Array ? page : new Uint8Array(page), runtime = null;
	{
		const text = new TextDecoder().decode(bytes), named = siteRuntimeFile(text);
		if (named) runtime = {name: named, bytes: null};
		else {
			const split = splitSitePage(text);
			bytes = new TextEncoder().encode(split.page);
			runtime = split.file;
		}
	}
	const produced = [];
	const pictures = createGroupPacker();
	const sitePage = async (body, path) => {
		let text = new TextDecoder().decode(body).replace(/<script type="application\/rapier-runtime" id="rapier-first-paint-runtime">[^<]*<\/script>\n?/g, '');
		{
			const anchor = text.indexOf('<div id="rapier-first-screen"></div>'), start = text.lastIndexOf('<template id="rapier-first-early" ', anchor);
			if (start >= 0 && text.slice(start, anchor).endsWith('</template>')) text = text.slice(0, start) + text.slice(anchor);
		}
		const views = firstPaint?.paths?.[path];
		if (views) {
			const record = {version: firstPaint.version, css: firstPaint.css || [], paths: {[path]: views}};
			const element = await pictures.pack('rapier-first-paint-runtime', 'application/rapier-runtime',
				[{name: 'rapier-first-paint.json', source: JSON.stringify(record)}]);
			const slot = '<div id="rapier-first-screen"></div>';
			if (text.split(slot).length !== 2) throw new Error('The site page needs its first-screen anchor');
			text = text.replace(slot, () => element + slot);
		}
		const early = firstScreen?.paths?.[path];
		if (early) {
			const slot = '<div id="rapier-first-screen"></div>';
			const version = /<meta name="rapier-version" content="([^"]+)">/.exec(text)?.[1];
			if (text.split(slot).length !== 2 || !version) throw new Error('The site page needs its first-screen anchor and version');
			text = text.replace(slot, () => firstScreenElement(early, version) + slot);
		}
		return text;
	};
	for (const path of Object.keys(DOORS)) {
		const body = doorPage(bytes, path);
		if (body === bytes) continue;
		produced.push([doorAssetPath(path).slice(1), await sitePage(body, path)]);
	}
	if (guides) for (const path of Object.keys(GUIDES)) {
		const body = doorPage(bytes, path, guideSection(guides[path], path));
		if (body !== bytes) produced.push([doorAssetPath(path).slice(1), await sitePage(body, path)]);
	}
	await removeDoorAssets(directory, runtime.name);
	if (produced.length !== DOOR_ASSET_NAMES.length + (guides ? GUIDE_ASSET_NAMES.length : 0)) return [];
	try {
		if (runtime.bytes) await writeFile(join(directory, runtime.name), runtime.bytes);
		for (const [name, body] of produced) await writeFile(join(directory, name), body);
		await writeFile(join(directory, 'index.html'), await sitePage(bytes, '/'));
	} catch (error) {
		await removeDoorAssets(directory);
		throw error;
	}
	return produced.map(([name]) => name);
}
