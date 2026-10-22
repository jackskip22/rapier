// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp, readFile, writeFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
const executable=process.env.RAPIER_FOLDER_BROKER;
assert(executable,'RAPIER_FOLDER_BROKER required');
const dir=await mkdtemp(join(tmpdir(),'rapier-interrupted-'));
const hash=b=>createHash('sha256').update(b).digest('hex');
function broker(){
  const child=spawn(executable,[dir],{stdio:['pipe','pipe','inherit']});
  let serial=0;const pending=new Map();
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{const r=JSON.parse(line), p=pending.get(r.id);pending.delete(r.id);r.error?p.reject(Error(r.error)):p.resolve(r.value);});
  child.on('exit',()=>{for(const p of pending.values())p.reject(Error('broker exited'));pending.clear();lines.close();});
  return {child,call:(method,args={})=>new Promise((resolve,reject)=>{
    const id=++serial;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,args})+'\n');
  })};
}
let first,second;
try {
  const original=Buffer.from('untouched original\n'),draft=Buffer.alloc(32768,65);
  await writeFile(join(dir,'note.md'),original);
  first=broker();
  const row=await first.call('lookup',{path:'note.md'});
  const write=await first.call('writeStart',{id:row.id,size:draft.length,digest:hash(draft),expected:{size:original.length,version:row.version,digest:hash(original)}});
  await first.call('writeChunk',{write,offset:0,data:draft.subarray(0,4096).toString('base64')});
  const dead=once(first.child,'exit');first.child.kill('SIGKILL');await dead;
  assert.deepEqual(await readFile(join(dir,'note.md')),original);
  const remnants=(await readdir(dir)).filter(n=>n.startsWith('.rapier-save-'));
  assert.equal(remnants.length,1);
  second=broker();
  const reopened=await second.call('lookup',{path:'note.md'});
  const opened=await second.call('readStart',{id:reopened.id});
  const part=await second.call('readChunk',{read:opened.read,offset:0,length:original.length});
  assert.deepEqual(Buffer.from(part.data,'base64'),original);
  await second.call('readClose',{read:opened.read});
  console.log(JSON.stringify({pass:true,interruption:'SIGKILL after 4096 of 32768 staged bytes',originalSha256:hash(original),reopenExact:true,uncommittedHiddenStages:remnants.length,note:'A hard kill leaves its hidden partial stage; no cleanup or save success is fabricated.'}));
} finally {
  for(const b of [first,second])if(b&&b.child.exitCode===null&&b.child.signalCode===null){const done=once(b.child,'exit');b.child.kill();await done;}
  await rm(dir,{recursive:true,force:true});
}
