// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import {copyFile, mkdtemp, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {stageLinuxPublic, stageLinuxPackage, verifyLinuxArtifact} from '../../../tools/stage-linux.mjs';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const dir=await mkdtemp(join(tmpdir(),'rapier-linux-staging-'));
const candidate=join(dir,'candidate'),out=join(dir,'public');
const source=join(repo,'dist/linux/rapier-linux');
const report=[];
const note=(name)=>{report.push(name);console.log('PASS',name);};
await mkdir(candidate);
const file=join(candidate,'rapier-linux'),manifest=join(candidate,'BUILT.json');
const built=JSON.parse(await readFile(join(repo,'dist/linux/BUILT.json')));
const originalManifest=JSON.stringify(built);
try {
  assert.equal(await stageLinuxPublic(out,file),null);
  note('absent artifact is omitted');
  await writeFile(manifest,originalManifest);
  await assert.rejects(stageLinuxPublic(out,file),/ENOENT/);
  note('manifest without executable refuses');
  await rm(manifest);await copyFile(source,file);
  await assert.rejects(stageLinuxPublic(out,file),/ENOENT/);
  note('executable without manifest refuses');
  await writeFile(manifest,originalManifest);
  await stageLinuxPublic(out,file);
  assert.deepEqual(await readFile(join(out,'rapier-linux')),await readFile(source));
  assert.equal((await stat(join(out,'rapier-linux'))).mode&0o777,0o755);
  assert.equal(JSON.parse(await readFile(join(out,'rapier-linux.json'))).sha256,built.sha256);
  note('public root contains exact ELF, manifest and executable mode');
  const wrong=await readFile(file);wrong[wrong.length-1]^=1;await writeFile(file,wrong);
  await assert.rejects(stageLinuxPublic(out,file),/not the build its manifest names/);
  assert.deepEqual(await readFile(join(out,'rapier-linux')),await readFile(source));
  note('corrupt ELF cannot replace a verified staged executable');
  const published=join(dir,'published'),again=join(dir,'again');
  await mkdir(published);await copyFile(source,join(published,'rapier-linux'));
  await writeFile(join(published,'rapier-linux.json'),JSON.stringify({...built,version:'1.0.0'}));
  assert.equal((await stageLinuxPublic(again,join(dir,'none'),published)).version,'1.0.0');
  assert.deepEqual(await readFile(join(again,'rapier-linux')),await readFile(source));
  note('without a recorded build the published pair stays, with its own version');
  await copyFile(source,file);
  await writeFile(manifest,JSON.stringify({...built,version:'0.0.0'}));
  await assert.rejects(verifyLinuxArtifact(file),/stale/);
  note('old manifest version cannot be relabeled');
  await writeFile(manifest,JSON.stringify({...built,resources:[]}));
  await assert.rejects(verifyLinuxArtifact(file),/resources differ/);
  note('wrong resource inventory refuses');
  await writeFile(manifest,originalManifest);
  for(const path of ['linux/app/src/main.rs','rapier.html']){
    const full=join(repo,path),bytes=await readFile(full);
    try {
      await writeFile(full,Buffer.concat([bytes,Buffer.from('\n')]));
      await assert.rejects(verifyLinuxArtifact(file),/stale|differs|input/i);
      note('changed '+path+' refuses same-version artifact');
    } finally {await writeFile(full,bytes);}
  }
  await stageLinuxPackage(join(dir,'arch'));
  const pkg=await readFile(join(dir,'arch/PKGBUILD'),'utf8');
  assert(pkg.includes("arch=('x86_64')"));
  assert(pkg.includes("'glibc>="+built.runtime.glibc+"'"));
  assert(pkg.includes(built.sha256));assert(!pkg.includes('python'));
  note('Arch package pins exact ELF, architecture and glibc floor without Python');
  await verifyLinuxArtifact();
  note('restored original inputs verify');
  console.log(JSON.stringify({elf:built.sha256,checks:report}));
} finally {await rm(dir,{recursive:true,force:true});}
