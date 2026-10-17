// SPDX-License-Identifier: AGPL-3.0-only
import {readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {DOORS, GUIDES, doorAssetPath, doorPage} from '../door-worker.js';
import {guideSection} from './seo-page.mjs';

export const DOOR_ASSET_NAMES = Object.freeze(Object.keys(DOORS).map(path => doorAssetPath(path).slice(1)));
export const GUIDE_ASSET_NAMES = Object.freeze(Object.keys(GUIDES).map(path => doorAssetPath(path).slice(1)));

export async function readGuides(docs, transform = text => text) {
	return Object.fromEntries(await Promise.all(Object.entries(GUIDES).map(async ([path, guide]) =>
		[path, transform(await readFile(join(docs, guide.file), 'utf8'), guide.file)])));
}

async function removeDoorAssets(directory) {
	await Promise.all([...DOOR_ASSET_NAMES, ...GUIDE_ASSET_NAMES].map(name => rm(join(directory, name), {force: true})));
}

export async function writeDoorAssets(directory, page, guides = null) {
	const bytes = page instanceof Uint8Array ? page : new Uint8Array(page);
	const produced = [];
	for (const path of Object.keys(DOORS)) {
		const body = doorPage(bytes, path);
		if (body === bytes) continue;
		produced.push([doorAssetPath(path).slice(1), body]);
	}
	if (guides) for (const path of Object.keys(GUIDES)) {
		const body = doorPage(bytes, path, guideSection(guides[path], path));
		if (body !== bytes) produced.push([doorAssetPath(path).slice(1), body]);
	}
	await removeDoorAssets(directory);
	if (produced.length !== DOOR_ASSET_NAMES.length + (guides ? GUIDE_ASSET_NAMES.length : 0)) return [];
	try {
		for (const [name, body] of produced) await writeFile(join(directory, name), body);
	} catch (error) {
		await removeDoorAssets(directory);
		throw error;
	}
	return produced.map(([name]) => name);
}
