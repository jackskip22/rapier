// SPDX-License-Identifier: AGPL-3.0-only
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const here=dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2),check=args.includes('--check');
const sourceArg=args.find(x=>x.startsWith('--sources='));
if(!sourceArg||args.some(x=>x!=='--check'&&!x.startsWith('--sources=')))throw new Error('Usage: node images/ocr-codec/build.mjs --sources=<verified source directory> [--check]');
const sources=resolve(sourceArg.slice(10)),manifest=JSON.parse(await readFile(join(here,'SOURCES.json'),'utf8'));
for(const file of manifest){const bytes=await readFile(join(sources,file.local));const sha=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');if(sha!==file.sha)throw new Error('Source differs: '+file.local);}
const pin=JSON.parse(await readFile(join(here,'PROVENANCE.json'),'utf8')),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [name,key] of [['binding.cpp','bindingSha256'],['build.sh','buildSha256'],['SOURCES.json','sourceManifestSha256']])if(hash(await readFile(join(here,name)))!==pin[key])throw new Error('Build input differs: '+name);
const output=await mkdtemp(join(tmpdir(),'rapier-ocr-codec-')),env={...process.env};
for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[name];
try{
 execFileSync('docker',['--host=unix:///var/run/docker.sock','run','--rm','--network=none','--user',process.getuid()+':'+process.getgid(),
  '--mount','type=bind,src='+sources+',dst=/sources,readonly','--mount','type=bind,src='+output+',dst=/output',
  '--mount','type=bind,src='+here+',dst=/binding,readonly',pin.compiler,'sh','/binding/build.sh'],{env,stdio:'inherit'});
 for(const name of ['jxl_dec.mjs','jxl_dec.wasm']){const bytes=await readFile(join(output,name));if(hash(bytes)!==pin.outputs[name].sha256)throw new Error('Rebuilt decoder differs: '+name);if(check){if(!(await readFile(join(here,name))).equals(bytes))throw new Error('Stored decoder differs: '+name);}else await writeFile(join(here,name),bytes);}
 console.log(JSON.stringify({sourceFiles:manifest.length,compiler:pin.compiler,outputs:pin.outputs,checked:check}));
}finally{await rm(output,{recursive:true,force:true});}
