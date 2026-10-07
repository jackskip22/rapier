// SPDX-License-Identifier: AGPL-3.0-only
// node --test tools/test-public.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {PUBLIC_TEST_ROWS} from './public-tests.mjs';

for (const name of PUBLIC_TEST_ROWS) test(name, {timeout: 120_000}, async context => {
  const {default: run} = await import(new URL('./witnesses/' + name + '.mjs', import.meta.url));
  const passed = Object.freeze({});
  const result = await run(null, {
    pass(detail) { context.diagnostic(String(detail)); return passed; },
    fail(detail) { assert.fail(String(detail)); },
  });
  assert.equal(result, passed, 'the check must return its passing verdict');
});
