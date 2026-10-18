// SPDX-License-Identifier: AGPL-3.0-only
import {readFile, rm, writeFile} from 'node:fs/promises';
import {unobservedBuildIO} from './build-reuse.mjs';
import {join} from 'node:path';
import {DOORS, GUIDES, doorAssetPath, doorPage} from '../door-worker.js';
import {createGroupPacker} from './packed-group.mjs';
import {guideSection} from './seo-page.mjs';

export const DOOR_ASSET_NAMES = Object.freeze(Object.keys(DOORS).map(path => doorAssetPath(path).slice(1)));
export const GUIDE_ASSET_NAMES = Object.freeze(Object.keys(GUIDES).map(path => doorAssetPath(path).slice(1)));

export async function readGuides(docs, transform = text => text) {
	return Object.fromEntries(await Promise.all(Object.entries(GUIDES).map(async ([path, guide]) =>
		[path, transform(await readFile(join(docs, guide.file), 'utf8'), guide.file)])));
}

async function removeDoorAssets(directory) {
	await unobservedBuildIO(() => Promise.all(['index.html', ...DOOR_ASSET_NAMES, ...GUIDE_ASSET_NAMES].map(name => rm(join(directory, name), {force: true}))));
}

export async function writeDoorAssets(directory, page, guides = null, firstPaint = null) {
	const bytes = page instanceof Uint8Array ? page : new Uint8Array(page);
	const produced = [];
	const pictures = createGroupPacker();
	const sitePage = async (body, path) => {
		let text = new TextDecoder().decode(body).replace(/<script type="application\/rapier-runtime" id="rapier-first-paint-runtime">[^<]*<\/script>\n?/g, '');
		const views = firstPaint?.paths?.[path];
		if (views) {
			const record = {version: firstPaint.version, css: firstPaint.css || [], paths: {[path]: views}};
			const element = await pictures.pack('rapier-first-paint-runtime', 'application/rapier-runtime',
				[{name: 'rapier-first-paint.json', source: JSON.stringify(record)}]);
			const slot = '<div id="rapier-first-screen"></div>';
			if (text.split(slot).length !== 2) throw new Error('The site page needs its first-screen anchor');
			text = text.replace(slot, () => element + slot);
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
	await removeDoorAssets(directory);
	if (produced.length !== DOOR_ASSET_NAMES.length + (guides ? GUIDE_ASSET_NAMES.length : 0)) return [];
	try {
		for (const [name, body] of produced) await writeFile(join(directory, name), body);
		await writeFile(join(directory, 'index.html'), await sitePage(bytes, '/'));
	} catch (error) {
		await removeDoorAssets(directory);
		throw error;
	}
	return produced.map(([name]) => name);
}
