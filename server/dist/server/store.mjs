// SPDX-License-Identifier: AGPL-3.0-only
// DocumentStore contract (FileStore and BucketStore):
// open()/close(), healthy(), credentials {token,editorKeySecret}, poisoned;
// read(name,{missing}) -> {name,text,hash,bytes,stat:{mtimeMs,birthtimeMs}} or null;
// scan() -> those rows in name order, with document/count/aggregate byte limits;
// readPrivate(name,missing)/writePrivate(name,value) for credentials and search;
// binding(kind,environment,scope)/expire(environment) for the unchanged MCP owners.
// Source and durable workspace state are one publication. A failed write is never
// acknowledged; a late filesystem edit is either refused or retained separately; reopening loads the committed kernel (including retry and Undo).
// WorkspaceStore owns that adapter; the two stores supply persistence, not editors.
import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {join, dirname, basename, resolve, relative, sep} from 'node:path';
import {createHash, randomBytes} from 'node:crypto';
import {RapierDocument, RapierBudget, readWorkspaceState} from '../mcp/worker.mjs';

const utf8 = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true});
const NOFOLLOW = constants.O_NOFOLLOW || 0;
export const STATE_BYTES = 256 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const PUBLICATION = /^[a-f0-9]{48}$/;
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const refusal = (code, message, status = 409) => Object.assign(new Error(message), {code, status, public:true});
const absent = error => error?.code === 'ENOENT';

export function documentName(name) {
  if (typeof name !== 'string' || !name || name.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(name))
    throw refusal('DOCUMENT_PATH_REFUSED', 'Use a relative Markdown document path.', 403);
  const parts=name.split('/');
  if (parts.some(part => !part || part.startsWith('.') || /[:]/.test(part) || /[. ]$/.test(part)) || !/\.md$/i.test(parts.at(-1)))
    throw refusal('DOCUMENT_PATH_REFUSED', 'Only non-hidden Markdown files inside the configured folder are served.',403);
  return parts.join('/');
}
async function syncDirectory(path) {
  const handle=await fs.open(path,constants.O_RDONLY | (constants.O_DIRECTORY || 0) | NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function regularBytes(path, limit, {privateFile=false, missing=false}={}) {
  let handle;
  try {
    const before=await fs.lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || (privateFile && (before.mode & 0o077)))
      throw refusal('FILE_REFUSED','A source or state file is not a private, ordinary unlinked file.',403);
    if (before.size > limit) throw refusal('FILE_TOO_LARGE','A file exceeds the configured byte limit.',413);
    handle=await fs.open(path,constants.O_RDONLY | NOFOLLOW);
    const opened=await handle.stat({bigint:true});
    if (!opened.isFile() || opened.nlink !== 1n || opened.ino !== BigInt(before.ino) || opened.dev !== BigInt(before.dev))
      throw refusal('FILE_CHANGED','The file changed while it was being opened. Retry.',409);
    const bytes=await handle.readFile();
    const after=await handle.stat({bigint:true});
    if (bytes.length > limit) throw refusal('FILE_TOO_LARGE','A file exceeds the configured byte limit.',413);
    if (after.size !== opened.size || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs)
      throw refusal('FILE_CHANGED','The file changed while it was being read. Retry.',409);
    return {bytes, stat:before};
  } catch (error) {
    if (missing && absent(error)) return null;
    if (error.code === 'ELOOP') throw refusal('FILE_REFUSED','Symbolic links are not document files.',403);
    if (absent(error)) throw refusal('DOCUMENT_NOT_FOUND','The document was not found.',404);
    throw error;
  } finally { await handle?.close(); }
}
async function atomicFile(path, bytes, {mode=0o600, create=false, beforePublish}={}) {
  const temp=join(dirname(path),'.rapier-write-'+randomBytes(18).toString('hex'));
  let handle;
  try {
    handle=await fs.open(temp,constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | NOFOLLOW,mode);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle=null;
    await beforePublish?.();
    if (create) { await fs.link(temp,path); await fs.unlink(temp); }
    else await fs.rename(temp,path);
    await syncDirectory(dirname(path));
  } finally { await handle?.close(); await fs.unlink(temp).catch(error=>{if(!absent(error))throw error;}); }
}
export function stateText(record) {
  const values=new Map(record.values), head=values.get('head');
  if (!head) return null;
  if (!Number.isSafeInteger(head.parts) || head.parts < 1) throw refusal('STATE_DAMAGED','A workspace state is incomplete.',503);
  let packed='';
  for(let index=0;index<head.parts;index++) {
    const part=values.get('state:'+index);
    if(typeof part !== 'string') throw refusal('STATE_DAMAGED','A workspace state is incomplete.',503);
    packed+=part;
  }
  let state;
  try {state=readWorkspaceState(head,JSON.parse(packed));}
  catch(error) {
    if(error.code==='UNSUPPORTED_WORKSPACE_FORMAT')
      throw refusal(error.code,'The workspace history format is unsupported. Its current file and stored state were kept.',503);
    throw refusal('STATE_DAMAGED','The workspace source and metadata history do not replay.',503);
  }
  if(typeof state.text !== 'string' || state.docKind !== 'markdown' || state.filename !== basename(record.document))
    throw refusal('DOCUMENT_IDENTITY_REFUSED','A filesystem workspace cannot change its bound filename or document kind.',409);
  return state.text;
}

class WorkspaceStorage {
  #transactionDepth=0;
  constructor(store, key, record) {
    this.store=store; this.key=key; this.record=record; this.values=new Map(record.values); this.alarm=record.alarm;
    this.failed=false;this.failure=null;
    this.kv={
      get:key=>structuredClone(this.values.get(key)),
      put:(key,value)=>{if(typeof key !== 'string' || value === undefined) throw new TypeError('A state key/value is required'); this.values.set(key,structuredClone(value));},
      delete:key=>this.values.delete(key),
    };
  }
  transactionSync(fn) {
    if(this.failed) throw refusal('STATE_RELOAD_REQUIRED','The workspace must be reloaded after a storage failure.',503);
    const before=structuredClone(this.values),alarm=this.alarm;
    this.#transactionDepth++;
    try { const result=fn(); if(result?.then) throw new TypeError('A storage transaction must be synchronous'); return result; }
    catch(error) {this.values=before;this.alarm=alarm;throw error;}
    finally {this.#transactionDepth--;}
  }
  async transaction(fn) {
    if(this.failed) throw refusal('STATE_RELOAD_REQUIRED','The workspace must be reloaded after a storage failure.',503);
    const before=structuredClone(this.values),alarm=this.alarm;
    this.#transactionDepth++;
    try { return await fn(); }
    catch(error) {this.values=before;this.alarm=alarm;throw error;}
    finally {this.#transactionDepth--;}
  }
  async sync() {
    if(this.failed) throw refusal('STATE_RELOAD_REQUIRED','The workspace must be reloaded after a storage failure.',503);
    // Values and alarms inside a transaction publish together at the caller's outer sync.
    if(this.#transactionDepth)return;
    const next={...this.record,values:[...structuredClone(this.values)],alarm:this.alarm};
    try { await this.store.commit(this.key,next,this.record); this.record=next; }
    catch(error) {this.failed=true;this.failure=error;throw error;}
  }
  async setAlarm(at) {if(!Number.isSafeInteger(at) || at<0)throw new TypeError('Invalid alarm');this.alarm=at;await this.sync();}
  async getAlarm() {return this.alarm;}
  async deleteAll() {this.values.clear();this.alarm=null;await this.sync();}
}

export class WorkspaceStore {
  constructor({maxDocumentBytes=16*1024*1024,maxDocuments=10000,maxFolderBytes=256*1024*1024,onCommitStep}={}) {
    for(const value of [maxDocumentBytes,maxDocuments,maxFolderBytes]) if(!Number.isSafeInteger(value) || value<1)throw new TypeError('Positive integer folder limits are required');
    this.maxDocumentBytes=maxDocumentBytes;this.maxDocuments=maxDocuments;this.maxFolderBytes=maxFolderBytes;this.onCommitStep=onCommitStep;
    this.entries=new Map();this.activeKeys=new Map();this.tail=Promise.resolve();this.poisoned=false;this.closed=false;
  }
  healthy() {if(this.closed || this.poisoned)throw refusal('RECOVERY_REQUIRED','The service stopped writing after a storage failure. Restart to recover the pending commit.',503);}
  queue(operation) {const result=this.tail.then(operation);this.tail=result.catch(()=>{});return result;}
  async checkRecord(_key,record) {
    if(record.document) {
      const current=await this.read(record.document,{missing:true});
      if((current?.hash || null)!==record.fileHash)throw refusal('FILE_CONFLICT','This workspace is stale. Reopen the current file before using it.',409);
    }
  }
  cacheRoom() {
    for(const key of this.entries.keys()) {
      if(this.entries.size<128)return;
      if(!this.activeKeys.get(key))this.entries.delete(key);
    }
    if(this.entries.size>=128)throw refusal('WORKSPACE_BUSY','The live workspace limit has been reached. Retry after an outstanding call finishes.',503);
  }
  // Another server on the same store may spend from a shared allowance first. The take then reloads the
  // current allowance and runs again; nothing was spent by the attempt that lost.
  binding(kind,environment,scope=null) {
    const bound=this.#binding(kind,environment,scope);
    if(kind!=='budget')return bound;
    return {idFromName:bound.idFromName,get:id=>({fetch:async request=>{
      for(let attempt=1;;attempt++) {
        try {return await bound.get(id).fetch(request.clone());}
        catch(error) {if(error.code!=='FILE_CONFLICT' || attempt===4)throw error;}
      }
    }})};
  }
  #binding(kind,environment,scope=null) {
    return {idFromName:name=>String(name),get:id=>({fetch:async request=>{
      this.healthy();const key=sha256(kind+':'+String(id));
      this.activeKeys.set(key,(this.activeKeys.get(key) || 0)+1);
      try {
      let entryPromise=this.entries.get(key);
      if(!entryPromise) {
        this.cacheRoom();
        entryPromise=(async()=>{
          let record=await this.readPrivate('workspaces/'+key+'.json',true);
          if(!record) {
            let name=null,hash=null;
            if(kind==='document') {
              const input=await request.clone().json();
              if(input.create===true) {
                name=documentName(scope || input.args?.filename || 'Untitled.md');
                const existing=await this.read(name,{missing:true});
                if(scope) {if(!existing || existing.text!==input.args?.text)throw refusal('FILE_CONFLICT','The selected file changed before the workspace opened.',409);hash=existing.hash;}
                else if(existing)throw refusal('DOCUMENT_EXISTS','A new document cannot overwrite an existing file. Open that file through its scoped MCP URL.',409);
              }
            }
            record={version:1,kind,document:name,fileHash:hash,values:[],alarm:null};
          }
          if(record.version!==1 || record.kind!==kind || !Array.isArray(record.values))throw refusal('STATE_DAMAGED','A workspace state file is invalid.',503);
          const storage=new WorkspaceStorage(this,key,record);
          const owner=kind==='document' ? new RapierDocument({storage},environment) : new RapierBudget({storage},environment);
          return {storage,owner};
        })();this.entries.set(key,entryPromise);
        entryPromise.catch(()=>{if(this.entries.get(key)===entryPromise)this.entries.delete(key);});
      }
      const entry=await entryPromise;
      if(scope && entry.storage.record.document!==scope)throw refusal('WORKSPACE_SCOPE_REFUSED','This capability belongs to another document path.',403);
      try {
        await this.checkRecord(key,entry.storage.record);
        const answer=await entry.owner.fetch(request);
        // The allowance owner answers a lost conditional write as unavailable; the store surfaces the conflict itself.
        if(kind==='budget' && entry.storage.failure?.code==='FILE_CONFLICT')throw entry.storage.failure;
        return answer;
      }
      catch(error) {if(error.code==='FILE_CONFLICT' && this.entries.get(key)===entryPromise)this.entries.delete(key);throw error;}
      finally {if((entry.storage.failed || kind==='document' && !entry.storage.record.document) && this.entries.get(key)===entryPromise)this.entries.delete(key);}
      } finally {const active=this.activeKeys.get(key)-1;if(active)this.activeKeys.set(key,active);else this.activeKeys.delete(key);}
    }})};
  }
  async expire(environment) {
    if(this.closed || this.poisoned)return;
    for(const entry of await this.workspaceFiles()) {
      if(!/^[a-f0-9]{64}\.json$/.test(entry))continue;
      const key=entry.slice(0,-5);if(this.activeKeys.get(key))continue;let active=this.entries.get(key);
      const loaded=!!active;
      const record=active ? (await active).storage.record : await this.readPrivate('workspaces/'+entry);
      if(!record || !record.alarm || record.alarm>Date.now())continue;
      if(!active) {
        this.cacheRoom();
        const storage=new WorkspaceStorage(this,key,record);const owner=record.kind==='document' ? new RapierDocument({storage},environment) : new RapierBudget({storage},environment);
        active=Promise.resolve({storage,owner});this.entries.set(key,active);
      }
      this.activeKeys.set(key,1);
      try {const {owner,storage}=await active;await this.checkRecord(key,storage.record);await owner.alarm();}
      catch(error) {if(this.entries.get(key)===active)this.entries.delete(key);throw error;}
      finally {const count=this.activeKeys.get(key)-1;if(count)this.activeKeys.set(key,count);else {this.activeKeys.delete(key);if(!loaded && this.entries.get(key)===active)this.entries.delete(key);}}
    }
  }
  async close() {if(this.closed)return;await this.tail;this.closed=true;this.entries.clear();}
}

export class FileStore extends WorkspaceStore {
  constructor(options={}) {
    super(options);
    if(!options.root) throw new TypeError('A document folder is required');
    this.root=resolve(options.root);this.private=join(this.root,'.rapier-server');this.lock=null;
  }
  async workspaceFiles() {return fs.readdir(join(this.private,'workspaces'));}
  async open() {
    if(process.platform === 'win32') throw refusal('FILESYSTEM_UNSUPPORTED','This filesystem host requires POSIX directory fsync and no-follow opens.',503);
    this.root=await fs.realpath(this.root);this.private=join(this.root,'.rapier-server');
    this.rootStat=await fs.lstat(this.root);if(!this.rootStat.isDirectory())throw refusal('FOLDER_REQUIRED','The document root must be a folder.',400);
    try {
      await fs.mkdir(this.private,{mode:0o700});await syncDirectory(this.root);
    } catch(error) {if(error.code!=='EEXIST')throw error;}
    const stateDir=await fs.lstat(this.private);
    if(!stateDir.isDirectory() || stateDir.isSymbolicLink() || (stateDir.mode & 0o077) || (process.getuid && stateDir.uid !== process.getuid()))
      throw refusal('STATE_DIRECTORY_REFUSED','The state directory must belong to the service user and have mode 0700.',403);
    await this.acquireLock();
    try {
      await fs.mkdir(join(this.private,'workspaces'),{mode:0o700});
    } catch(error) {if(error.code!=='EEXIST'){await this.close();throw error;}}
    const workspaceDir=await fs.lstat(join(this.private,'workspaces'));
    if(!workspaceDir.isDirectory() || workspaceDir.isSymbolicLink() || (workspaceDir.mode & 0o077)) {await this.close();throw refusal('STATE_DIRECTORY_REFUSED','The workspace directory is not private.',403);}
    try {
      const preserved=join(this.private,'preserved');
      await fs.mkdir(preserved,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
      const kept=await fs.lstat(preserved);
      if(!kept.isDirectory() || kept.isSymbolicLink() || (kept.mode & 0o077))throw refusal('STATE_DIRECTORY_REFUSED','Preserved publications need a private directory.',403);
      await syncDirectory(this.private);
      await this.recover();
      let credentials=await this.readPrivate('credentials.json',true);
      if(!credentials) {
        credentials={token:randomBytes(32).toString('base64url'),editorKeySecret:randomBytes(32).toString('base64')};
        await this.writePrivate('credentials.json',credentials);
      }
      if(!/^[A-Za-z0-9_-]{43}$/.test(credentials.token || '') || Buffer.from(credentials.editorKeySecret || '', 'base64').length !== 32)
        throw refusal('CREDENTIALS_DAMAGED','The private credentials file is invalid; restore its backed-up copy.',503);
      this.credentials=credentials;return this;
    } catch(error) {await this.close();throw error;}
  }
  async acquireLock() {
    const path=join(this.private,'lock.json');
    for(let attempt=0;attempt<2;attempt++) {
      try {
        const handle=await fs.open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|NOFOLLOW,0o600);
        const lock={pid:process.pid,token:randomBytes(24).toString('hex')};
        try {await handle.writeFile(JSON.stringify(lock));await handle.sync();} finally {await handle.close();}
        await syncDirectory(this.private);this.lock=lock;return;
      } catch(error) {
        if(error.code!=='EEXIST')throw error;
        const old=await this.readPrivate('lock.json');
        if(!Number.isSafeInteger(old?.pid) || old.pid<1)throw refusal('ROOT_LOCKED','The root lock is invalid. An administrator must verify no service is running before removing it.',503);
        let dead=false;
        try {process.kill(old.pid,0);} catch(e) {if(e.code==='ESRCH')dead=true;}
        if(!dead)throw refusal('ROOT_LOCKED','Another service already owns this document folder.',503);
        const current=await this.readPrivate('lock.json');
        if(current?.token!==old.token)throw refusal('ROOT_LOCKED','The root lock changed while it was checked.',503);
        await fs.unlink(path);await syncDirectory(this.private);
      }
    }
    throw refusal('ROOT_LOCKED','The document folder could not be locked.',503);
  }
  privatePath(name) {
    if(!/^(?:credentials|lock|pending|search)\.json$|^workspaces\/[a-f0-9]{64}\.json$/.test(name))throw new TypeError('Unknown private state path');
    return join(this.private,...name.split('/'));
  }
  async readPrivate(name, missing=false) {
    const row=await regularBytes(this.privatePath(name),STATE_BYTES,{privateFile:true,missing});
    return row ? JSON.parse(utf8.decode(row.bytes)) : null;
  }
  async writePrivate(name, value) {
    const bytes=Buffer.from(JSON.stringify(value));if(bytes.length>STATE_BYTES)throw refusal('STATE_TOO_LARGE','A workspace exceeds the durable state limit.',413);
    const path=this.privatePath(name),existing=await fs.lstat(path).catch(error=>{if(absent(error))return null;throw error;});
    if(existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink!==1 || (existing.mode&0o077)))throw refusal('STATE_FILE_REFUSED','A private state file has unsafe permissions or links.',403);
    await atomicFile(path,bytes);
  }
  async checkedPath(name) {
    const parts=documentName(name).split('/');let path=this.root;
    const root=await fs.lstat(path);
    if(root.isSymbolicLink() || root.ino!==this.rootStat.ino || root.dev!==this.rootStat.dev)throw refusal('ROOT_CHANGED','The configured folder was replaced.',503);
    for(const part of parts.slice(0,-1)) {
      path=join(path,part);const state=await fs.lstat(path).catch(error=>{if(absent(error))throw refusal('DOCUMENT_NOT_FOUND','The document folder does not exist.',404);throw error;});
      if(!state.isDirectory() || state.isSymbolicLink())throw refusal('DOCUMENT_PATH_REFUSED','Document paths cannot traverse symbolic links.',403);
    }
    return join(path,parts.at(-1));
  }
  async read(name,{missing=false}={}) {
    this.healthy();const path=await this.checkedPath(name);
    const row=await regularBytes(path,this.maxDocumentBytes,{missing});if(!row)return null;
    await this.checkedPath(name);
    let text;try{text=utf8.decode(row.bytes);}catch{throw refusal('INVALID_UTF8','A document must contain valid UTF-8, without replacement of damaged bytes.',422);}
    return {name,text,hash:sha256(row.bytes),bytes:row.bytes.length,stat:row.stat};
  }
  async scan() {
    this.healthy();const names=[];
    const visit=async name=>{
      const directory=name ? await this.checkedPath(name+'/probe.md') : join(this.root,'probe.md');
      for(const entry of await fs.readdir(dirname(directory),{withFileTypes:true})) {
        if(entry.name.startsWith('.') || entry.isSymbolicLink())continue;
        const child=name ? name+'/'+entry.name : entry.name;
        if(entry.isDirectory())await visit(child);
        else if(entry.isFile() && /\.md$/i.test(entry.name)) {
          names.push(documentName(child));if(names.length>this.maxDocuments)throw refusal('FOLDER_TOO_LARGE','The folder exceeds the configured document count.',413);
        }
      }
    };
    await visit('');let total=0;const rows=[];
    for(const name of names.sort()) {const row=await this.read(name);total+=row.bytes;if(total>this.maxFolderBytes)throw refusal('FOLDER_TOO_LARGE','The folder exceeds the configured indexing byte limit.',413);rows.push(row);}
    return rows;
  }
  // Node's POSIX rename is replacement, not compare-and-swap. Move the actual incumbent
  // inode into private custody, sync it and both directories, then LINK into an empty name.
  // A late in-place write follows that retained inode; a late rename is the inode we move;
  // a new entry in the gap defeats link(). Neither path is ever replaced by publication.
  // Receipts keep the proposed text too. Retention is deliberate: even an old open editor FD
  // may write the displaced inode later, so equality is never permission to unlink it.
  publicationPaths(id) {
    if(!PUBLICATION.test(id || ''))throw refusal('RECOVERY_RECORD_DAMAGED','The publication identity is invalid.',503);
    const base=join(this.private,'preserved',id);
    return {receipt:base+'.json',before:base+'.before',candidate:base+'.next'};
  }
  async syncPreserved(path) {
    const stat=await fs.lstat(path);
    if(!stat.isFile() || stat.isSymbolicLink() || stat.nlink!==1)throw refusal('FILE_REFUSED','The displaced entry was kept but is not an ordinary document.',403);
    const handle=await fs.open(path,constants.O_RDONLY | NOFOLLOW);
    try {await handle.sync();} finally {await handle.close();}
  }
  async publishDocument(name,text,expected,publication=randomBytes(24).toString('hex')) {
    this.healthy();
    const path=await this.checkedPath(name),bytes=Buffer.from(text),places=this.publicationPaths(publication);
    if(bytes.length>this.maxDocumentBytes)throw refusal('FILE_TOO_LARGE','The document exceeds the configured byte limit.',413);
    // A document in a separate mounted filesystem is refused before moving any entry.
    if((await fs.stat(dirname(path))).dev!==(await fs.stat(dirname(places.before))).dev)
      throw refusal('FILESYSTEM_UNSUPPORTED','Document publication and its private recovery directory must share one local filesystem.',503);
    const saved=await regularBytes(places.receipt,STATE_BYTES,{privateFile:true,missing:true});
    let receipt=saved ? JSON.parse(utf8.decode(saved.bytes)) : null;
    if(receipt && (receipt.version!==1 || receipt.document!==name || receipt.before!==expected || receipt.text!==text || !Number.isInteger(receipt.mode) || receipt.mode<0 || receipt.mode>0o777))
      throw refusal('RECOVERY_RECORD_DAMAGED','The retained publication does not match its journal.',503);
    let kept=await fs.lstat(places.before).catch(error=>{if(absent(error))return null;throw error;});
    if(kept && !receipt)throw refusal('RECOVERY_RECORD_DAMAGED','The retained inode has no publication receipt.',503);
    const current=await this.read(name,{missing:true});
    if(!kept && (current?.hash || null)!==expected || kept && current)
      throw refusal('FILE_CONFLICT','The file changed outside this workspace. Its current and retained versions were kept.',409);
    if(!receipt) {
      receipt={version:1,document:name,before:expected,text,mode:current ? current.stat.mode&0o777 : 0o600};
      await atomicFile(places.receipt,Buffer.from(JSON.stringify(receipt)));
    }
    await atomicFile(places.candidate,bytes,{mode:receipt.mode});
    await this.onCommitStep?.('candidate');
    if(expected!==null && !kept) {
      const last=await this.read(name,{missing:true});
      if((last?.hash || null)!==expected)throw refusal('FILE_CONFLICT','The file changed before its update was published; the proposal was kept.',409);
      await this.checkedPath(name);
      await fs.rename(path,places.before);
      kept=true;
    }
    if(kept) {
      await this.syncPreserved(places.before);
      await syncDirectory(dirname(places.before));await syncDirectory(dirname(path));
      await this.onCommitStep?.('displaced');
    }
    await this.checkedPath(name);
    try {await fs.link(places.candidate,path);}
    catch(error) {if(error.code==='EEXIST')throw refusal('FILE_CONFLICT','Another file arrived during publication. It and both retained versions were kept.',409);throw error;}
    await this.onCommitStep?.('linked');
    await fs.unlink(places.candidate);
    await syncDirectory(dirname(path));await syncDirectory(dirname(places.candidate));
    await this.retirePreserved(places,expected);
  }
  // Retention is for late external work only. A displaced inode that still holds exactly the incumbent
  // the journal named carries nothing the service did not already have, so it and its receipt retire;
  // anything else (a late edit, an unreadable or oversized entry) is kept for an administrator.
  async retirePreserved(places,expected) {
    let late=true;
    try {const row=await regularBytes(places.before,STATE_BYTES,{missing:true});late=row ? sha256(row.bytes)!==expected : false;} catch {late=true;}
    if(late)return;
    for(const path of [places.before,places.receipt])await fs.unlink(path).catch(error=>{if(!absent(error))throw error;});
    await syncDirectory(dirname(places.receipt));
  }
  async recover() {
    const pending=await this.readPrivate('pending.json',true);if(!pending)return;
    if(pending.version!==1 || !HASH.test(pending.key || '') || !PUBLICATION.test(pending.publication || '') || typeof pending.text!=='string' ||
       !(pending.before===null || HASH.test(pending.before || '')) || pending.record?.document!==pending.document ||
       pending.record?.fileHash!==sha256(Buffer.from(pending.text)) || stateText(pending.record)!==pending.text)
      throw refusal('RECOVERY_RECORD_DAMAGED','The pending commit is invalid; keep it and restore from a verified backup.',503);
    const places=this.publicationPaths(pending.publication),path=await this.checkedPath(pending.document);
    // A kill between link and unlink leaves two names for the proposal. Retire ONLY its
    // journal-named staging link before ordinary nlink validation. The journal and receipt
    // retain the candidate text even if link never happened. This is idempotent after a cut.
    await fs.unlink(places.candidate).catch(error=>{if(!absent(error))throw error;});
    await syncDirectory(dirname(places.candidate));
    const current=await this.read(pending.document,{missing:true}),hash=current?.hash || null;
    const kept=await fs.lstat(places.before).catch(error=>{if(absent(error))return null;throw error;});
    if(hash!==pending.record.fileHash && hash!==pending.before && !(hash===null && kept))
      throw refusal('RECOVERY_CONFLICT','The document changed after an interrupted commit. Its current file, retained versions and pending journal were kept.',503);
    if(hash!==pending.record.fileHash)await this.publishDocument(pending.document,pending.text,pending.before,pending.publication);
    else {
      // A process may have died after link but before directory fsync or acknowledgement.
      if(kept)await this.syncPreserved(places.before);
      await this.syncPreserved(path);await syncDirectory(dirname(path));await syncDirectory(dirname(places.before));
      await this.retirePreserved(places,pending.before);
    }
    await this.writePrivate('workspaces/'+pending.key+'.json',pending.record);
    await fs.unlink(this.privatePath('pending.json'));await syncDirectory(this.private);
  }
  async commit(key,record) {
    return this.queue(async()=>{
      this.healthy();
      const text=record.document ? stateText(record) : null;
      if(record.document) {
        const current=await this.read(record.document,{missing:true});
        if((current?.hash || null)!==record.fileHash)throw refusal('FILE_CONFLICT','The file changed outside this workspace. Reopen its current source.',409);
        // Deleting or expiring a capability discards only its workspace, never the plain file.
        if(text!==null && text!==current?.text) {
          const before=record.fileHash,publication=randomBytes(24).toString('hex');record.fileHash=sha256(Buffer.from(text));
          try {
            if(await this.readPrivate('pending.json',true))throw refusal('RECOVERY_REQUIRED','An interrupted commit requires recovery.',503);
            await this.writePrivate('pending.json',{version:1,key,document:record.document,before,text,record,publication});
            await this.onCommitStep?.('prepared');
            await this.publishDocument(record.document,text,before,publication);
            await this.onCommitStep?.('document');
            await this.writePrivate('workspaces/'+key+'.json',record);
            await this.onCommitStep?.('state');
            await fs.unlink(this.privatePath('pending.json'));await syncDirectory(this.private);return;
          } catch(error) {this.poisoned=true;throw error;}
        }
      }
      await this.writePrivate('workspaces/'+key+'.json',record);
    });
  }
  async close() {
    if(this.closed)return;await this.tail;this.closed=true;
    if(this.lock) {
      const current=await this.readPrivate('lock.json',true);
      if(current?.token===this.lock.token) {await fs.unlink(this.privatePath('lock.json'));await syncDirectory(this.private);}
      this.lock=null;
    }
  }
}
