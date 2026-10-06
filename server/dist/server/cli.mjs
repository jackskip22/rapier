#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from './index.mjs';

const HELP=`rapier-server serve <folder> --chromium <absolute executable> --chromium-version <four-part version>

rapier-server serve --bucket <name> --endpoint <https origin> [browser options]

Options:
  --bucket <name>        S3-compatible bucket instead of a document folder
  --endpoint <url>       Bucket endpoint origin (HTTPS; HTTP only on loopback)
  --host <address>       Listener, default 127.0.0.1
  --port <number>        Port, default 8383
  --origin <https URL>   Exact business origin; required off loopback
  --timeout <ms>         Per-export deadline, 1000–300000; default 45000
  --concurrency <n>      Isolated document realms, 1–8; default 2
  --no-sandbox          Explicit development-only browser exception; never implied
  --help                Show this text

RAPIER_SERVER_CHROMIUM and RAPIER_SERVER_CHROMIUM_VERSION supply the two browser options.
Bucket access uses only RAPIER_BUCKET_KEY_ID and RAPIER_BUCKET_SECRET from the environment.
RAPIER_BUCKET_REGION and RAPIER_BUCKET_SESSION_TOKEN are optional environment settings.
No browser, parser or plug-in is downloaded. Bucket mode contacts only its configured
storage endpoint. The administrator supplies TLS and network access policy. MCP requires
the bearer in .rapier-server/credentials.json inside the folder (0600) or private bucket.
Keys and endpoint credentials are never printed at startup.
`;
export async function main(argv=process.argv.slice(2),{log=console.log}={}) {
  if(!argv.length || argv.includes('--help')) {log(HELP);return null;}
  if(argv[0]!=='serve')throw new TypeError('Use rapier-server serve with a folder or bucket; see --help.');
  const options={chromium:process.env.RAPIER_SERVER_CHROMIUM,chromiumVersion:process.env.RAPIER_SERVER_CHROMIUM_VERSION};
  let at=1;
  if(argv[at] && !argv[at].startsWith('--'))options.root=resolve(argv[at++]);
  const names={'--bucket':'bucket','--endpoint':'endpoint','--chromium':'chromium','--chromium-version':'chromiumVersion','--host':'host','--port':'port','--origin':'publicOrigin','--timeout':'timeoutMs','--concurrency':'concurrency'};
  const seen=new Set();
  for(;at<argv.length;at++) {
    const flag=argv[at];if(seen.has(flag))throw new TypeError('An option was repeated; see --help.');seen.add(flag);
    if(flag==='--no-sandbox'){options.noSandbox=true;continue;}
    const name=names[flag],value=argv[++at];
    if(!name || value===undefined || value.startsWith('--'))throw new TypeError('Unknown option or missing value; see --help.');
    options[name]=['port','timeoutMs','concurrency'].includes(name) ? Number(value) : value;
  }
  if(options.root===undefined && options.bucket===undefined)throw new TypeError('Supply a document folder or --bucket with --endpoint; see --help.');
  const server=await createServer(options);
  try {await server.listen();}catch(error){await server.close();throw error;}
  log('Rapier serves '+server.origin+(options.bucket===undefined ? '; document root '+options.root : '; private bucket storage.'));
  log('MCP bearer: .rapier-server/credentials.json inside the configured storage. Keep it private.');
  if(options.noSandbox)log('WARNING: Chromium sandbox explicitly disabled. This is not a production security configuration.');
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;try{await server.close();}catch{process.exitCode=1;}finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);}};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  return server;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{await main();}catch(error){console.error(error.public || error instanceof TypeError ? error.message : 'The service could not start. Check the retained build, filesystem permissions and Chromium configuration.');process.exitCode=1;}
}
