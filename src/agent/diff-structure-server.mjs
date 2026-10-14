// SPDX-License-Identifier: AGPL-3.0-only
import {diffStructure as readStructure} from './diff-structure.mjs';
import {js} from '../packages/rapier-diff/js.mjs';
import acorn from './vendor/acorn.mjs';
import './markdown-server.mjs';

export const diffStructure = (source, options = {}) => readStructure(source, {...options, code: js(acorn)});
