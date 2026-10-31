import {readFileSync} from 'node:fs';

const source = JSON.parse(readFileSync(new URL('./bottom-surfaces.json', import.meta.url), 'utf8'));
export const surfaces = source.surfaces.filter(({interactive, selector}) => interactive === true && selector && !selector.includes('::'))
	.map(({id, file, selector, role, interactive, on}) => ({id, file, selector, role, interactive, ...(on === undefined ? {} : {on})}));
export const inventory = Object.freeze({version: source.version, surfaces});
