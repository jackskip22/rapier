import {readFileSync} from 'node:fs';

const source = JSON.parse(readFileSync(new URL('./bottom-surfaces.json', import.meta.url), 'utf8'));
// Six placement facts per surface; the rest stays in the JSON (tools/check-bottom-surfaces.mjs).
export const surfaces = source.surfaces.map(({id, file, selector, role, interactive, on}) =>
	({id, file, selector, role, interactive, ...(on === undefined ? {} : {on})}));
export const inventory = Object.freeze({version: source.version, surfaces});
