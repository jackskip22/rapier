#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
import {preservationCells} from './preservation.mjs';
import {serverCells} from './integration.mjs';
import {bucketCells} from './bucket.mjs';
try { await preservationCells(); await bucketCells(); console.log('PASS rapier-server: '+await serverCells()); }
catch(error) { console.error(error.stack || error); process.exitCode=1; }
