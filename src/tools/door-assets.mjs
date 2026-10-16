// SPDX-License-Identifier: AGPL-3.0-only
import {rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {DOORS, doorAssetPath, doorPage} from '../door-worker.js';

export const DOOR_ASSET_NAMES = Object.freeze(Object.keys(DOORS).map(path => doorAssetPath(path).slice(1)));

async function removeDoorAssets(directory) {
	await Promise.all(DOOR_ASSET_NAMES.map(name => rm(join(directory, name), {force: true})));
}

export async function writeDoorAssets(directory, page) {
	const bytes = page instanceof Uint8Array ? page : new Uint8Array(page);
	const produced = [];
	for (const path of Object.keys(DOORS)) {
		const body = doorPage(bytes, path);
		if (body === bytes) continue;
		produced.push([doorAssetPath(path).slice(1), body]);
	}
	await removeDoorAssets(directory);
	if (produced.length !== DOOR_ASSET_NAMES.length) return [];
	try {
		for (const [name, body] of produced) await writeFile(join(directory, name), body);
	} catch (error) {
		await removeDoorAssets(directory);
		throw error;
	}
	return produced.map(([name]) => name);
}
