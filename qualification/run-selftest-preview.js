/* The preview gate is the primary suite runner with one additional non-negotiable assertion.
   Keeping execution in run-selftest2.js means injection, digests, origin checks, census,
   network policy, and error policy have one owner rather than two copies to reconcile. */
const { spawnSync } = require('child_process');
const { join } = require('path');

const mode = process.argv[2] || 'desktop';
const result = spawnSync(process.execPath, [join(__dirname, 'run-selftest2.js'), mode], {
  env: {
    ...process.env,
    RAPIER_URL: process.env.RAPIER_URL || 'http://127.0.0.1:8199/rapier.html?preview=phone',
    RAPIER_REQUIRE_PREVIEW_PHONE: '1',
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error('HARNESS FAILURE', result.error);
  process.exit(1);
}
process.exit(result.status == null ? 1 : result.status);
