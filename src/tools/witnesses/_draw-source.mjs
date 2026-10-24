// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync} from 'node:fs';
export const DRAW_CORE_FILES = Object.freeze(['draw/door.js', 'draw/reader.js']);
export const drawSource = (root = new URL('../../', import.meta.url)) =>
	[...DRAW_CORE_FILES, 'draw/draw.js'].map(file => readFileSync(new URL(file, root), 'utf8')).join('\n');
