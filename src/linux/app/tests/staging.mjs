// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import {copyFile, mkdtemp, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
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
  const licenseHash=createHash('sha256').update(await readFile(join(repo,'LICENSE'))).digest('hex');
  const servedAs=hashes=>async url=>{const hit=Object.entries(hashes).find(([name])=>url.endsWith('/'+name));if(!hit)throw new Error('refused: '+url+' answers HTTP 404');return hit[1];};
  await assert.rejects(stageLinuxPackage(join(dir,'refused'),{served:servedAs({LICENSE:licenseHash})}),/rapier-linux answers HTTP 404/);
  await assert.rejects(stageLinuxPackage(join(dir,'refused'),{served:servedAs({'rapier-linux':'0'.repeat(64),LICENSE:licenseHash})}),/not the pinned/);
  note('no package recipe until its tag serves the pinned executable and license');
  await stageLinuxPackage(join(dir,'arch'),{served:servedAs({'rapier-linux':built.sha256,LICENSE:licenseHash})});
  const pkg=await readFile(join(dir,'arch/aur/rapier-bin/PKGBUILD'),'utf8');
  assert(pkg.includes("arch=('x86_64')"));
  assert(pkg.includes("'glibc>="+built.runtime.glibc+"'"));
  assert(pkg.includes("'gcc-libs' 'xdg-desktop-portal'")&&pkg.includes("'shared-mime-info' 'xdg-utils' 'perl-file-mimeinfo')")&&/^optdepends=\('chromium: /m.test(pkg)&&pkg.includes("'brave-bin: ")&&pkg.includes("'google-chrome: ")&&!pkg.includes("'perl-file-mimeinfo: "));
  assert(pkg.includes('pkgver='+built.version+'\n')&&pkg.includes('_tag=v${pkgver}'));
  assert(pkg.includes(built.sha256));assert(!pkg.includes('python'));
  assert(pkg.includes('$pkgdir/opt/rapier/rapier-linux')&&pkg.includes('hicolor/scalable/apps/rapier.svg'));
  assert.equal(await readFile(join(dir,'arch/omarchy-pkgs/rapier-bin/PKGBUILD'),'utf8'),pkg);
  assert.equal(JSON.parse(await readFile(join(dir,'arch/omarchy-pkgs/rapier-bin/.omarchy/package.json'),'utf8')).source,'local');
  assert((await readFile(join(dir,'arch/aur/rapier-bin/.SRCINFO'),'utf8')).includes('sha256sums = '+built.sha256));
  {// package() as makepkg runs it: the executable, launcher, both entries, MIME types, icon and license land where Arch keeps them.
    const src=join(dir,'arch/aur/rapier-bin'),pkgdir=join(dir,'pkg');
    await writeFile(join(src,'rapier-linux-'+built.version),'#!/bin/sh\n');await writeFile(join(src,'LICENSE-'+built.version),'license\n');
    const made=spawnSync('bash',['-euc','cd "$1"; source ./PKGBUILD; package','bash',src],{env:{...process.env,pkgdir},encoding:'utf8'});
    assert.equal(made.status,0,made.stderr);
    for(const [path,mode] of [['opt/rapier/rapier-linux',0o755],['usr/bin/rapier',0o755],['usr/share/applications/rapier.desktop',0o644],
      ['usr/share/applications/chrome-rapier.local__rapier.html-Default.desktop',0o644],['usr/share/mime/packages/rapier.xml',0o644],
      ['usr/share/icons/hicolor/scalable/apps/rapier.svg',0o644],['usr/share/licenses/rapier-bin/LICENSE',0o644]])
      assert.equal((await stat(join(pkgdir,path))).mode&0o777,mode,path);
    assert.match(await readFile(join(pkgdir,'usr/share/applications/chrome-rapier.local__rapier.html-Default.desktop'),'utf8'),/^NoDisplay=true$/m);
    assert.match(await readFile(join(pkgdir,'usr/bin/rapier'),'utf8'),/exec \/opt\/rapier\/rapier-linux "\$@"/);
  }
  note('AUR and omarchy-pkgs recipes pin the exact ELF and its tag from one version, /opt and /usr/bin, perl-file-mimeinfo, shared-mime-info and xdg-utils required, a choice of browser, without Python');
  await verifyLinuxArtifact();
  note('restored original inputs verify');
  console.log(JSON.stringify({elf:built.sha256,checks:report}));
} finally {await rm(dir,{recursive:true,force:true});}
