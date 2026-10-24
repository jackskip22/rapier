// SPDX-License-Identifier: MIT
// Rebuild unchanged published WOFF2/Brotli sources with the bounded host binding.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const here=dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2),check=args.includes('--check');
const sourceArg=args.find(x=>x.startsWith('--sources='));
if(!sourceArg||args.some(x=>x!=='--check'&&!x.startsWith('--sources=')))throw new Error('Usage: node shell/font-subset/build-woff2.mjs --sources=<verified source directory> [--check]');
const sources=resolve(sourceArg.slice(10)),manifest=JSON.parse(await readFile(join(here,'woff2-sources.json'),'utf8'));
for(const file of manifest){const bytes=await readFile(join(sources,file.local));const sha=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');if(sha!==file.sha)throw new Error('Source differs: '+file.local);}
const pin=JSON.parse(await readFile(join(here,'woff2-provenance.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(hash(await readFile(join(here,'woff2-binding.cpp')))!==pin.bindingSha256)throw new Error('The binding differs from its provenance.');
const output=await mkdtemp(join(tmpdir(),'rapier-woff2-'));
const env={...process.env};for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[name];
try{
 execFileSync('docker',['--host=unix:///var/run/docker.sock','run','--rm','--network=none','--user',process.getuid()+':'+process.getgid(),
  '--mount','type=bind,src='+sources+',dst=/sources,readonly','--mount','type=bind,src='+output+',dst=/output',
  '--mount','type=bind,src='+here+',dst=/binding,readonly',pin.compiler,'sh','/binding/build-woff2.sh'],{env,stdio:'inherit'});
 const bytes=await readFile(join(output,'woff2-decoder.mjs'));
 if(hash(bytes)!==pin.moduleSha256)throw new Error('The rebuilt decoder differs from its pin.');
 if(check){if(!(await readFile(join(here,'woff2-decoder.mjs'))).equals(bytes))throw new Error('The stored decoder differs.');}
 else await writeFile(join(here,'woff2-decoder.mjs'),bytes);
 console.log(JSON.stringify({sourceFiles:manifest.length,compiler:pin.compiler,sha256:hash(bytes),checked:check}));
}finally{await rm(output,{recursive:true,force:true});}
