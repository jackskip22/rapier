// SPDX-License-Identifier: AGPL-3.0-only
// Device-local receipt custody. The sidecar holds a descriptor, never an embedded receipt.
// Open imports are immutable linked deltas; only terminal receipts occupy <id>.json.
import {exactBytes, sha256} from './integrity.mjs';
const copy = value => JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const error = (file, why) => Object.assign(new Error('Import receipt ' + file + ' ' + why + '. Nothing was undone.'), {code:'import-receipt'});
const idOK = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id);
export const importReceiptFile = id => {
 if (!idOK(id)) throw error(String(id), 'has an invalid identity');
 return 'imports/' + id + '.json';
};
// Add backup may allocate a collision-safe filename for byte-exact, unreferenced evidence.
// Only assertImportReference grants active receipt authority, at its identity's exact path.
export const isImportReceiptFile = file => typeof file === 'string' && /^imports\/[^/\\\x00-\x1f\x7f]+\.json$/.test(file) && file.isWellFormed();
export const IMPORT_RECEIPT_LIMIT = 5;
const counts = receipt => ({notes:receipt.notes.length,written:receipt.written.length,refused:(receipt.refused || []).length});
export function assertImportReference(row) {
 const file = row?.file || (idOK(row?.id) ? importReceiptFile(row.id) : 'notes.json');
 if (!object(row) || !idOK(row.id) || !integer(row.stamp) || !hash(row.digest) || !integer(row.byteLength) || !object(row.counts)
  || !['planned','writing','complete','cancelled','failed','undone'].includes(row.status)
  || !['notes','written','refused'].every(key=>integer(row.counts[key])) || row.counts.written>row.counts.notes
  || Object.keys(row.counts).some(key=>!['notes','written','refused'].includes(key))
  || Object.keys(row).some(key=>!['id','stamp','status','counts','file','digest','byteLength','journal'].includes(key))
  || (row.journal === undefined ? row.file !== importReceiptFile(row.id) || ['planned','writing'].includes(row.status)
   : !Number.isSafeInteger(row.journal) || row.journal < 1 || row.file !== 'imports/.'+row.id+'-'+row.journal+'.json' || !['planned','writing'].includes(row.status)))
  throw error(file,'has an unreadable file reference');
 return row;
}
function assertReceipt(receipt,file) {
 if (!object(receipt) || receipt.version!==1 || !idOK(receipt.id) || !integer(receipt.stamp) || !Array.isArray(receipt.notes) || !Array.isArray(receipt.written)
  || !['planned','writing','complete','cancelled','failed'].includes(receipt.status)) throw error(file,'is not a readable receipt');
}
const reference = (receipt,file,bytes,digest,journal) => ({id:receipt.id,stamp:receipt.stamp,status:receipt.undo?'undone':receipt.status,counts:counts(receipt),file,digest,byteLength:bytes.length,...(journal===undefined?{}:{journal})});
// Changes are top-level replacements or an exact array suffix. Prefix comparison prevents a
// changed earlier proof from silently disappearing into an append-only checkpoint.
function delta(before,after) {
 const set={},append={},remove=[];
 for(const key of new Set([...Object.keys(before),...Object.keys(after)])) {
  const a=before[key],b=after[key];
  if(same(a,b))continue;
  if(b===undefined){remove.push(key);continue;}
  if(Array.isArray(a)&&Array.isArray(b)&&b.length>=a.length&&a.every((row,i)=>same(row,b[i])))append[key]=b.slice(a.length);
  else Object.defineProperty(set,key,{value:b,enumerable:true,writable:true,configurable:true});
 }
 return {set,append,remove};
}
function apply(receipt,patch,file) {
 if(!object(patch)||!object(patch.set)||!object(patch.append)||!Array.isArray(patch.remove))throw error(file,'has an unreadable journal delta');
 const keys=[...Object.keys(patch.set),...Object.keys(patch.append),...patch.remove];
 if(keys.some(key=>typeof key!=='string')||new Set(keys).size!==keys.length||keys.some(key=>['id','stamp','version'].includes(key)))throw error(file,'changes its journal identity');
 for(const key of patch.remove)delete receipt[key];
 for(const [key,value]of Object.entries(patch.set))Object.defineProperty(receipt,key,{value,enumerable:true,writable:true,configurable:true});
 for(const [key,rows]of Object.entries(patch.append)){
  if(!Array.isArray(receipt[key])||!Array.isArray(rows))throw error(file,'has an invalid journal append');
  // No spread argument limit on an import of many notes.
  for(const row of rows)receipt[key].push(row);
 }
 return receipt;
}
export async function encodeImportReceipt(receipt,{previous,reference:parent,generation}={}) {
 const file=importReceiptFile(receipt?.id);assertReceipt(receipt,file);
 if(parent){assertImportReference(parent);if(parent.id!==receipt.id||parent.stamp!==receipt.stamp)throw error(file,'changed identity');}
 const terminal=!['planned','writing'].includes(receipt.status);
 let value=receipt,path=file,journal;
 if(!terminal){
  if(!Number.isSafeInteger(generation)||generation<1)throw error(file,'has no journal generation');
  journal=generation;path='imports/.'+receipt.id+'-'+journal+'.json';
  if(parent){
   if(!parent.journal||parent.journal>=journal||!previous||previous.id!==receipt.id||previous.stamp!==receipt.stamp)throw error(file,'cannot continue this journal');
   value={version:1,id:receipt.id,stamp:receipt.stamp,parent,patch:delta(previous,receipt)};
  }else value={version:1,id:receipt.id,stamp:receipt.stamp,receipt};
 }
 const bytes=exactBytes(JSON.stringify(value)),digest=await sha256(bytes);
 return {bytes,reference:reference(receipt,path,bytes,digest,journal)};
}
// The live folder calls this only through its owner, holding the same lease as body reads.
// Restore uses it over its already-admitted source inventory, before any destination effect.
export async function readImportReceiptFile(row,read) {
 assertImportReference(row);
 const parts=[],members=[],seen=new Set();let current=row,receipt;
 while(current){
  assertImportReference(current);
  if(current.id!==row.id||current.stamp!==row.stamp||seen.has(current.file))throw error(current.file,'has a cyclic or unrelated journal');
  seen.add(current.file);
  let raw;try{raw=await read(current.file);}catch(cause){throw error(current.file,'could not be read: '+String(cause?.message||cause));}
  if(raw==null)throw error(current.file,'is missing');
  const bytes=exactBytes(raw);
  if(bytes.length!==current.byteLength||await sha256(bytes)!==current.digest)throw error(current.file,'failed digest or length verification');
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(_){throw error(current.file,'is not readable JSON');}
  members.push({file:current.file,digest:current.digest,byteLength:current.byteLength});
  if(current.journal===undefined){receipt=value;assertReceipt(receipt,current.file);break;}
  if(!object(value)||value.version!==1||value.id!==row.id||value.stamp!==row.stamp)throw error(current.file,'has an unreadable journal');
  if(value.parent){
   assertImportReference(value.parent);
   if(!value.parent.journal||value.parent.journal>=current.journal)throw error(current.file,'has an invalid journal predecessor');
   parts.push({patch:value.patch,row:current});current=value.parent;
  }else{receipt=value.receipt;assertReceipt(receipt,current.file);break;}
 }
 for(const part of parts.reverse())receipt=apply(receipt,part.patch,part.row.file);
 assertReceipt(receipt,row.file);
 if(receipt.id!==row.id||receipt.stamp!==row.stamp||row.status!==(receipt.undo?'undone':receipt.status)||!same(row.counts,counts(receipt)))throw error(row.file,'does not match its sidecar reference');
 return {receipt,reference:copy(row),members};
}

export function assertImportReferences(index) {
 const rows = index.imports === undefined ? [] : index.imports;
 if (!Array.isArray(rows) || rows.length > IMPORT_RECEIPT_LIMIT || new Set(rows.map(row => row?.id)).size !== rows.length)
  throw error('notes.json', 'has a duplicated or invalid receipt list');
 for (const row of rows) assertImportReference(row);
 return rows;
}
// One reference set, including open journals, for a full backup. No legacy inline shape.
export async function importReceiptMembers(index, readReceipt) {
 const members = new Map();
 for (const row of assertImportReferences(index)) {
  const held = await readReceipt(row);
  if (!same(held.reference, row)) throw error(row.file, 'changed while its backup was read');
  for (const member of held.members) {
   const prior = members.get(member.file);
   if (prior && !same(prior, member)) throw error(member.file, 'has conflicting references');
   members.set(member.file, member);
  }
 }
 return [...members.values()];
}
