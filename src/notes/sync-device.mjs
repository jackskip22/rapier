const te = new TextEncoder(), td = new TextDecoder('utf-8', {fatal:true});
const fail = () => Object.assign(new Error('this device could not remember sync; sign in and unlock again.'), {code:'device'});
const revision = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join('');
export function createDeviceStorage({scope = '', factory = globalThis.indexedDB} = {}) {
 let database;
 async function open() {
  if (!factory) throw fail();
  if (!database) database = new Promise((resolve,reject) => {
   const request = factory.open('rapier-sync-device',1);
   request.onupgradeneeded = () => request.result.createObjectStore('devices');
   request.onerror = request.onblocked = () => reject(fail());
   request.onsuccess = () => { const db=request.result;db.onversionchange=()=>{db.close();database=null;};resolve(db); };
  }).catch(error => {database=null;throw error;});
  return database;
 }
 return Object.freeze({
  available: !!factory,
  async update(change) {
   const db=await open();
   return new Promise((resolve,reject) => {
    const tx=db.transaction('devices','readwrite'), store=tx.objectStore('devices');let result,failure;
    tx.onerror=tx.onabort=()=>reject(failure || fail());tx.oncomplete=()=>resolve(result);
    const request=store.get(scope);
    request.onsuccess=()=>{try {result=change(request.result || null);if(result !== undefined) store.put(result,scope);else result=request.result || null;}catch (error) {failure=error;tx.abort();}};
   });
  },
 });
}
export function createRememberedDevice({storage} = {}) {
 if (!storage || typeof storage.update !== 'function') throw fail();
 let observed = null, enabled = true;
 async function readRecord() {
  const record=await storage.update(()=>undefined);
  observed=record?.revision || null;enabled=record?.enabled !== false;return record;
 }
 async function commit(next,before=observed) {
  const id=revision();
  await storage.update(current=>{
   if ((current?.revision || null)!==before) throw fail();
   return {...next,revision:id};
  });observed=id;
 }
 return Object.freeze({
  available: storage.available !== false,
  async read(binding) {
   if (storage.available === false) return {enabled:false,data:null};
   const record=await readRecord();
   if (!enabled || !record?.payload) return {enabled,data:null};
   try {
    if (typeof record.binding!=='string' || record.key?.type!=='secret' || record.key.extractable!==false || record.key.algorithm?.name!=='AES-GCM' || record.nonce?.length!==12) throw fail();
    const bytes=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:record.nonce,additionalData:te.encode(record.binding)},record.key,record.payload));
    try {
     const data=JSON.parse(td.decode(bytes));
     if (record.binding===binding) return {enabled,data,binding:record.binding};
     if (Array.isArray(data.key)) data.key.fill(0);
     return {enabled,data:null,retired:{grant:data.grant,credentials:data.credentials},binding:record.binding};
    } finally {bytes.fill(0);}
   } catch {throw fail();}
  },
  async keep(binding,data) {
   if (!enabled) return;
   const before=observed;
   const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
   const nonce=crypto.getRandomValues(new Uint8Array(12)), plain=te.encode(JSON.stringify(data));
   let payload;
   try {payload=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:te.encode(binding)},key,plain));}
   finally {plain.fill(0);}
   await commit({enabled:true,binding,key,nonce,payload},before);
  },
  async forget(value) {
   if (storage.available === false) return;
   const before=observed,id=revision(),kept=await storage.update(current=>{
    if ((current?.revision || null)!==before) throw Object.assign(fail(),{code:'device_stale'});
    return {enabled:value ?? current?.enabled !== false,revision:id};
   });observed=id;enabled=kept.enabled;
  },
 });
}
