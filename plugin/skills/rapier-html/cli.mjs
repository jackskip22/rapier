#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {main} from './page.mjs';
main(process.argv.slice(2), dirname(fileURLToPath(import.meta.url))).catch(error => { console.error(String(error?.message || error)); process.exit(1); });
