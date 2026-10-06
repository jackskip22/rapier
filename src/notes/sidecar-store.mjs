// SPDX-License-Identifier: AGPL-3.0-only
// Physical deltas below the folder owner, never another transaction owner. Logical reads and
// backups still see one exact notes.json; only this adapter knows the compact storage record.
import {exactBytes, sha256, BYTE_CHUNK_BYTES, checkByteAbort} from './integrity.mjs';
export const SIDECAR_DELTA_FILE = '.rapier-index.json';
export const SIDECAR_FULL_INTERVAL = 32;
const INDEX = 'notes.json', SMALL = 65536;
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', {fatal:true});
const own = (v,k) => Object.prototype.hasOwnProperty.call(v,k);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const canonical = v => JSON.stringify(v,null,1) + '\n';
const fail = message => Object.assign(new Error(message),{code:'corrupt'});
const same = (a,b) => {if(a==null||b==null)return a==null&&b==null;if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;};
const put = (v,k,x) => Object.defineProperty(v,k,{value:x,enumerable:true,writable:true,configurable:true});
function changes(before, after, path = [], rows = []) {
 if (before === after) return rows;
 if (object(before) && object(after)) {
  for (const key of new Set([...Object.keys(before),...Object.keys(after)])) changes(own(before,key)?before[key]:undefined,own(after,key)?after[key]:undefined,[...path,key],rows);
  const keys=Object.keys(after), natural=[...Object.keys(before).filter(k=>own(after,k)),...keys.filter(k=>!own(before,k))];
  if (JSON.stringify(keys)!==JSON.stringify(natural)) rows.push({path,keys});
 } else if (JSON.stringify(before) !== JSON.stringify(after)) rows.push(after === undefined ? {path,remove:true} : {path,value:after});
 return rows;
}
function replay(base, rows, orders) {
 if (!Array.isArray(rows)) throw fail('The notes metadata changes are unreadable. Their files were kept.');
 for (const row of rows) {
  if (!object(row) || !Array.isArray(row.path) || row.path.some(k=>typeof k !== 'string') || row.order === undefined && ((row.remove === true) === own(row,'value') || row.remove !== undefined && row.remove !== true)) throw fail('The notes metadata change has no exact path. Its files were kept.');
  if (row.order !== undefined) {
   let at=base; for(const key of row.path) { if(!own(at,key)||!object(at[key])) throw fail('The notes metadata order has no base. Its files were kept.'); at=at[key]; }
   const keys=Number.isSafeInteger(row.order)&&row.order>=0&&Array.isArray(orders)?orders[row.order]:null;
   if(!Array.isArray(keys)||keys.some(k=>typeof k!=='string'||!own(at,k))||new Set(keys).size!==Object.keys(at).length||keys.length!==Object.keys(at).length) throw fail('The notes metadata order is unreadable. Its files were kept.');
   const values=keys.map(k=>at[k]); for(const key of keys)delete at[key]; keys.forEach((key,i)=>put(at,key,values[i])); continue;
  }
  if (!row.path.length) { if (row.remove || !object(row.value)) throw fail('The notes metadata root is unreadable. Its files were kept.'); base=row.value; continue; }
  let at = base;
  for (const key of row.path.slice(0,-1)) { if (!own(at,key) || !object(at[key])) throw fail('The notes metadata change has no base. Its files were kept.'); at = at[key]; }
  const key = row.path.at(-1); if (row.remove) delete at[key]; else put(at,key,row.value);
 }
 return base;
}
// A lease view is never exposed as the public store. Its receipt is one-use and invalidated
// by any intervening logical index access through either view; every read still hits storage.
const views = new WeakMap(), states = new WeakMap();
export function createSidecarStore(raw) {
 if (views.has(raw)) return views.get(raw).publicStore;
 let state=states.get(raw);
 if(!state) {state={raw,epoch:0};states.set(raw,state);state.publicStore=sidecarView(state).store;}
 return state.publicStore;
}
export function createSidecarLease(store, active) {
 const state=views.get(store);
 if (!state || typeof active !== 'function') throw new TypeError('A sidecar lease needs its owner.');
 active();
 return sidecarView(state,active);
}
function sidecarView(state, active = null) {
 const raw=state.raw;
 let receipt=null,decoded=null;
 const clear=()=>{receipt=null;decoded=null;};
 const physicalBytes=async name=>{const bytes=await raw.read(name);return bytes==null?null:exactBytes(bytes);};
 const physical = async () => {
  if(active) { active(); return {full:await physicalBytes(INDEX),pending:await physicalBytes(SIDECAR_DELTA_FILE)}; }
  for(let attempt=0;attempt<3;attempt++) {
   const full=await physicalBytes(INDEX),pending=await physicalBytes(SIDECAR_DELTA_FILE);
   if(same(full,await physicalBytes(INDEX))&&same(pending,await physicalBytes(SIDECAR_DELTA_FILE)))return {full,pending};
  }
  throw Object.assign(new Error('The notes metadata is changing. Try opening Notes again.'),{code:'busy'});
 };
 const materialize = async ({full,pending}) => {
  if (pending == null) return {full,bytes:full,record:null};
  let record;
  try { record = JSON.parse(dec.decode(pending)); } catch (_) { throw fail('The notes metadata changes are unreadable. Their files were kept.'); }
  if (!object(record) || record.format !== 'rapier-index-delta' || !Number.isSafeInteger(record.count) || record.count < 1 || record.count > SIDECAR_FULL_INTERVAL || !(record.base===null||/^[a-f0-9]{64}$/.test(record.base)) || !/^[a-f0-9]{64}$/.test(record.after) || !Array.isArray(record.changes) || record.replacement!==undefined&&typeof record.replacement!=='string') throw fail('The notes metadata changes have no exact base. Their files were kept.');
  const digest = full==null?null:await sha256(full);
  // A cut after the verified full write but before retirement is already complete.
  if (digest === record.after) return {full,bytes:full,record:null,stale:true};
  if (digest !== record.base) throw Object.assign(new Error('The notes metadata base changed. Both files were kept.'),{code:'changed'});
  let bytes;
  try { bytes = record.replacement!==undefined ? enc.encode(record.replacement) : enc.encode(canonical(replay(JSON.parse(dec.decode(full)),record.changes,record.orders))); } catch (e) { if (e.code === 'corrupt') throw e; throw fail('The notes metadata changes cannot be replayed. Their files were kept.'); }
  if (await sha256(bytes) !== record.after) throw fail('The notes metadata changes failed verification. Their files were kept.');
  return {full,bytes,record};
 };
 const snapshot = async () => {
  const epoch=++state.epoch;
  receipt=null;
  const pair=await physical();
  // Always reread both physical files. Only their byte-for-byte equality licenses reusing
  // this job's already verified reconstruction; no decoded state survives a lease job.
  const value=active && decoded && same(pair.full,decoded.full) && same(pair.pending,decoded.pending)
   ? decoded.value : await materialize(pair);
  if(active && epoch===state.epoch) {receipt={epoch,value};decoded={...pair,value};}
  return value;
 };
 const verified = async (name,bytes) => {
  await raw.write(name,bytes);
  const saved = await raw.read(name);
  if (saved == null || await sha256(saved) !== await sha256(bytes)) throw fail('The notes metadata write failed verification. Its recovery files were kept.');
 };
 const read = async name => {
  if(name===INDEX)return (await snapshot()).bytes;
  if(name===SIDECAR_DELTA_FILE) {clear();state.epoch++;}
  return raw.read(name);
 };
 const write = async (name,value) => {
  if (name !== INDEX) {if(name===SIDECAR_DELTA_FILE) {clear();state.epoch++;}return raw.write(name,value);}
  active?.();
  const prior=active && receipt?.epoch===state.epoch ? receipt.value : await snapshot();
  clear();state.epoch++;
  const bytes = exactBytes(value);
  if (prior.bytes && await sha256(prior.bytes) === await sha256(bytes)) return;
  // A small full sidecar needs one atomic write, cheaper than a separate replay record.
  if (prior.full == null && !prior.record || bytes.length < SMALL && !prior.record && !prior.stale) return raw.write(INDEX,bytes);
  let before, after;
  try { before = prior.full==null||prior.record?.replacement!==undefined?{}:JSON.parse(dec.decode(prior.full)); after = JSON.parse(dec.decode(bytes)); }
  catch (_) { throw fail('The notes metadata cannot be saved as exact JSON. Its files were kept.'); }
  // Full replacements preserve exact JSON whitespace and a leading BOM. The record
  // is also their atomic publication when an earlier delta still exists.
  const replacement=prior.record?.replacement!==undefined||!same(enc.encode(canonical(after)),bytes) ? new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes) : undefined;
  const rows=changes(before,after), orders=[], byOrder=new Map();
  for (const row of rows) if (row.keys) { const key=JSON.stringify(row.keys); if(!byOrder.has(key)) {byOrder.set(key,orders.length);orders.push(row.keys);} row.order=byOrder.get(key);delete row.keys; }
  const record = {format:'rapier-index-delta',base:prior.full==null?null:await sha256(prior.full),after:await sha256(bytes),count:Math.min((prior.record?.count || 0)+1,SIDECAR_FULL_INTERVAL),changes:replacement===undefined?rows:[],orders,...(replacement===undefined?{}:{replacement})};
  const delta = enc.encode(JSON.stringify(record)+'\n');
  await verified(SIDECAR_DELTA_FILE,delta);
  if (replacement!==undefined || record.count >= SIDECAR_FULL_INTERVAL || delta.length >= bytes.length) {
   // Publish the complete delta first. A cut before, during or after the full write leaves
   // either the delta over its old base or the exact new base; retirement is only cleanup.
   await verified(INDEX,bytes); await raw.remove(SIDECAR_DELTA_FILE);
  }
 };
 const preserveIndex = async (backup,clean) => {
  active?.();clear();state.epoch++;
  const before=await physical(),copies=[[backup,before.full],[backup.replace(/\.json$/,'.changes.json'),before.pending]];
  for(const [name,bytes] of copies) if(bytes!=null) {if(await raw.read(name)!=null)throw fail('The unreadable index backup name is occupied. Nothing was removed.');await verified(name,bytes);}
  const current=await physical();if(!same(current.full,before.full)||!same(current.pending,before.pending))throw fail('The unreadable notes metadata changed. Every copy was kept.');
  const record={format:'rapier-index-delta',base:before.full==null?null:await sha256(before.full),after:await sha256(clean),count:1,changes:[],replacement:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(clean)};
  // Both original physical files are verified under the named recovery copies before one
  // atomic record replaces their unreadable projection. Even a cut before the full write
  // leaves a readable replacement and retains the exact damaged metadata for the person.
  await verified(SIDECAR_DELTA_FILE,enc.encode(JSON.stringify(record)+'\n'));
  await verified(INDEX,clean);await raw.remove(SIDECAR_DELTA_FILE);
  return copies.filter(([,bytes])=>bytes!=null).map(([name])=>name);
 };
 const methods = {sidecarDeltas:true,read,write,preserveIndex,
  list:async (prefix='') => {
   const names=await raw.list(prefix);
   // Interrupted damaged-index recovery can publish a replacement before its first full
   // checkpoint. Backup inventory must enumerate that readable logical sidecar too.
   if(!prefix&&!names.includes(INDEX)&&names.includes(SIDECAR_DELTA_FILE)&&await read(INDEX)!=null)names.push(INDEX);
   return names.filter(name=>prefix || name !== SIDECAR_DELTA_FILE);
  },
  remove:async name => {
   if(name===SIDECAR_DELTA_FILE) {clear();state.epoch++;}
   if (name === INDEX) {
    active?.();clear();state.epoch++;
    const prior=await snapshot();clear();
    // Retire a readable delta before deleting its base. A cut cannot leave an orphan
    // record that prevents the next owned open; the caller already kept its recovery copy.
    if(prior.record || prior.stale) {
     await verified(INDEX,prior.bytes);await raw.remove(SIDECAR_DELTA_FILE);
     if(await raw.read(SIDECAR_DELTA_FILE)!=null)throw fail('The notes metadata changes could not be retired. The complete sidecar was kept.');
    }
   }
   await raw.remove(name);
  },
  stat:async name => { if (name !== INDEX) return raw.stat(name); const bytes=await read(name); return bytes == null ? null : {size:bytes.length,modified:null}; },
  async *readChunks(name,options={}) {
   if (name !== INDEX) { yield* raw.readChunks(name,options); return; }
   const chunkBytes=options.chunkBytes ?? 65536;
   if(!Number.isSafeInteger(chunkBytes)||chunkBytes<1||chunkBytes>BYTE_CHUNK_BYTES)throw new RangeError('File chunks must be between 1 byte and 1 MiB.');
   checkByteAbort(options.signal);
   const bytes=await read(name); if (bytes==null) throw fail('The notes metadata disappeared. Try Backup again.');
   checkByteAbort(options.signal);options.onOpen?.({size:bytes.length,modified:null});
   for(let at=0;at<bytes.length;at+=chunkBytes) {checkByteAbort(options.signal);yield bytes.subarray(at,at+chunkBytes);}
  }
 };
 if (typeof raw.readBlob === 'function') methods.readBlob=async name=>{if(name!==INDEX)return raw.readBlob(name);const bytes=await read(name);return bytes==null?null:new Blob([bytes]);};
 if (typeof raw.statAll === 'function') methods.statAll=async(prefix='')=>{const rows=await raw.statAll(prefix);if(!prefix){rows.delete(SIDECAR_DELTA_FILE);const bytes=await read(INDEX);if(bytes==null)rows.delete(INDEX);else rows.set(INDEX,{size:bytes.length,modified:null});}return rows;};
 if (typeof raw.writeBlob === 'function') methods.writeBlob=async(name,blob,...options)=>name===INDEX?write(name,new Uint8Array(await blob.arrayBuffer())):raw.writeBlob(name,blob,...options);
 if (typeof raw.stat !== 'function') delete methods.stat;
 if (typeof raw.readChunks !== 'function') delete methods.readChunks;
 const store=new Proxy(raw,{get(target,key) {if(own(methods,key))return methods[key];const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;},set(target,key,value) { if(own(methods,key)) {methods[key]=value;return true;} return Reflect.set(target,key,value); }});
 views.set(store,state);
 return {store,clear};
}
