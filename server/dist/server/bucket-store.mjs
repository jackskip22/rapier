// SPDX-License-Identifier: AGPL-3.0-only
// Each Markdown name is a small S3 head, not a partially updated source file. Its body
// names immutable source and workspace parts. One conditional PUT publishes both.
// Workspace locator objects are only an index: a locator without a head entry is absent.
import {randomBytes} from 'node:crypto';
import {WorkspaceStore,STATE_BYTES,stateText,documentName,sha256,refusal} from './store.mjs';
import {S3} from './s3.mjs';

const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const HASH=/^[a-f0-9]{64}$/;
const PREFIX='.rapier-server/';
const damaged=()=>refusal('STATE_DAMAGED','A bucket document or workspace is incomplete or damaged.',503);
const conflict=()=>refusal('FILE_CONFLICT','The file changed outside this workspace. Reopen the current document before editing.',409);
function json(bytes) {try{return JSON.parse(utf8.decode(bytes));}catch{throw damaged();}}
function packed(value) {
  const bytes=Buffer.from(JSON.stringify(value));
  if(bytes.length>STATE_BYTES)throw refusal('STATE_TOO_LARGE','A workspace exceeds the durable state limit.',413);
  return bytes;
}
function privateKey(name) {
  if(!/^(?:credentials|lock|pending|search)\.json$|^workspaces\/[a-f0-9]{64}\.json$/.test(name))throw new TypeError('Unknown private state path');
  return PREFIX+name;
}
function workspaceKey(name) {return /^workspaces\/([a-f0-9]{64})\.json$/.exec(name)?.[1] || null;}

export class BucketStore extends WorkspaceStore {
  #s3; #revisions=new WeakMap(); #privateRevisions=new Map();
  constructor(options={}) {super(options);this.#s3=new S3(options);}
  async open() {
    this.healthy();
    let credentials=await this.readPrivate('credentials.json',true);
    if(!credentials) {
      credentials={token:randomBytes(32).toString('base64url'),editorKeySecret:randomBytes(32).toString('base64')};
      try {await this.writePrivate('credentials.json',credentials);}
      catch(error) {if(error.code!=='FILE_CONFLICT')throw error;credentials=await this.readPrivate('credentials.json');}
    }
    if(!credentials || !/^[A-Za-z0-9_-]{43}$/.test(credentials.token || '') || Buffer.from(credentials.editorKeySecret || '','base64').length!==32)
      throw refusal('CREDENTIALS_DAMAGED','The private credentials file is invalid; restore its backed-up copy.',503);
    this.credentials=credentials;return this;
  }
  async head(name,{missing=false}={}) {
    documentName(name);
    const row=await this.#s3.get(name,STATE_BYTES,{missing});if(!row)return null;
    const value=json(row.bytes),source=value?.source;
    if(value?.format!=='rapier-server-document/1' || value.name!==name || !/^[a-f0-9]{32}$/.test(value.revision || '') ||
       !HASH.test(source?.hash || '') || !Number.isSafeInteger(source.bytes) || source.bytes<0 ||
       !Number.isSafeInteger(value.created) || value.created<0 || !Number.isSafeInteger(value.modified) || value.modified<0 ||
       !value.workspaces || typeof value.workspaces!=='object' || Array.isArray(value.workspaces) ||
       Object.entries(value.workspaces).some(([key,hash])=>!HASH.test(key) || !HASH.test(hash)))throw damaged();
    if(source.bytes>this.maxDocumentBytes)throw refusal('FILE_TOO_LARGE','The document exceeds the configured byte limit.',413);
    return {...row,value};
  }
  async part(hash,limit,limitCode='STATE_TOO_LARGE') {
    if(!HASH.test(hash))throw damaged();
    const row=await this.#s3.get(PREFIX+'parts/'+hash,limit,{missing:true,limitCode});
    if(!row || sha256(row.bytes)!==hash)throw damaged();
    return row.bytes;
  }
  async putPart(bytes) {
    const hash=sha256(bytes),key=PREFIX+'parts/'+hash;
    try {await this.#s3.put(key,bytes,null);}
    catch(error) {
      if(error.code!=='FILE_CONFLICT')throw error;
      // A create-only collision is deduplication only after verifying the stored bytes.
      if(!(await this.part(hash,bytes.length)).equals(bytes))throw damaged();
    }
    return hash;
  }
  async read(name,{missing=false}={}) {
    this.healthy();const head=await this.head(name,{missing});if(!head)return null;
    const bytes=await this.part(head.value.source.hash,this.maxDocumentBytes,'FILE_TOO_LARGE');
    if(bytes.length!==head.value.source.bytes)throw damaged();
    let text;try{text=utf8.decode(bytes);}catch{throw refusal('INVALID_UTF8','A document must contain valid UTF-8, without replacement of damaged bytes.',422);}
    return {name,text,hash:head.value.source.hash,bytes:bytes.length,stat:{mtimeMs:head.value.modified,birthtimeMs:head.value.created}};
  }
  async scan() {
    this.healthy();const names=new Set(),directories=[''],visited=new Set(['']);
    while(directories.length) {
      const prefix=directories.pop();
      for await(const entry of this.#s3.list(prefix,{delimiter:'/'})) {
        const name=entry.key || entry.prefix;
        if(name.split('/').some(part=>part.startsWith('.')))continue;
        if(entry.prefix) {
          // A provider may not make recursive listing revisit itself or skip a level.
          const tail=entry.prefix.slice(prefix.length);
          if(!tail || tail.slice(0,-1).includes('/') || visited.has(entry.prefix))throw damaged();
          visited.add(entry.prefix);directories.push(entry.prefix);
        } else if(/\.md$/i.test(name)) {
          documentName(name);if(names.has(name))throw damaged();names.add(name);
          if(names.size>this.maxDocuments)throw refusal('FOLDER_TOO_LARGE','The folder exceeds the configured document count.',413);
        }
      }
    }
    const rows=[];let total=0;
    for(const name of [...names].sort()) {
      const row=await this.read(name);total+=row.bytes;
      if(total>this.maxFolderBytes)throw refusal('FOLDER_TOO_LARGE','The folder exceeds the configured indexing byte limit.',413);
      rows.push(row);
    }
    return rows;
  }
  async readPrivate(name,missing=false) {
    this.healthy();const key=privateKey(name),row=await this.#s3.get(key,STATE_BYTES,{missing});
    const workspace=workspaceKey(name);
    if(!workspace)this.#privateRevisions.set(name,row?.etag || null);if(!row)return null;
    let value=json(row.bytes);
    if(workspace && value?.format==='rapier-server-binding/1') {
      const head=await this.head(documentName(value.document),{missing:true}),hash=head?.value.workspaces[workspace];
      if(!hash)return null; // A crash before head publication left only an unreachable locator.
      value=json(await this.part(hash,STATE_BYTES));
      if(!value || value.document!==head.value.name)throw damaged();
      this.#revisions.set(value,{hash});
    } else {
      if(!value || typeof value!=='object' || Array.isArray(value) || workspace && value.document)throw damaged();
      this.#revisions.set(value,{etag:row.etag});
    }
    return value;
  }
  async writePrivate(name,value) {
    return this.queue(async()=>{
      this.healthy();
      const row=await this.#s3.put(privateKey(name),packed(value),this.#privateRevisions.get(name) ?? null);
      this.#privateRevisions.set(name,row.etag);this.#revisions.set(value,{etag:row.etag});
    });
  }
  async workspaceFiles() {
    const names=[];
    for await(const row of this.#s3.list(PREFIX+'workspaces/'))if(row.key)names.push(row.key.slice((PREFIX+'workspaces/').length));
    return names;
  }
  async checkRecord(key,record) {
    const current=await this.readPrivate('workspaces/'+key+'.json',true),before=this.#revisions.get(record),after=current && this.#revisions.get(current);
    if((before?.hash || before?.etag || null)!==(after?.hash || after?.etag || null))throw conflict();
    await super.checkRecord(key,record);
  }
  async locate(key,document) {
    const path=privateKey('workspaces/'+key+'.json'),binding={format:'rapier-server-binding/1',document};
    try {await this.#s3.put(path,packed(binding),null);}
    catch(error) {
      if(error.code!=='FILE_CONFLICT')throw error;
      const current=json((await this.#s3.get(path,STATE_BYTES)).bytes);
      if(current?.format!==binding.format || current.document!==document)throw conflict();
    }
  }
  sourceBytes(text) {
    const bytes=Buffer.from(text);
    if(bytes.length>this.maxDocumentBytes)throw refusal('FILE_TOO_LARGE','The document exceeds the configured byte limit.',413);
    return bytes;
  }
  nextHead(name,head,source) {
    const at=Date.now();
    return {format:'rapier-server-document/1',name,revision:randomBytes(16).toString('hex'),source,
      created:head?.value.created ?? at,modified:head?.value.source.hash===source.hash ? head.value.modified : at,
      workspaces:{...head?.value.workspaces}};
  }
  async publishDocument(name,text,expected) {
    return this.queue(async()=>{
      this.healthy();const bytes=this.sourceBytes(text),head=await this.head(name,{missing:true});
      if((head?.value.source.hash || null)!==expected)throw conflict();
      const value=this.nextHead(name,head,{hash:await this.putPart(bytes),bytes:bytes.length});
      await this.onCommitStep?.('prepared');
      await this.#s3.put(name,packed(value),head?.etag || null);
      await this.onCommitStep?.('document');
    });
  }
  async commit(key,record,previous) {
    return this.queue(async()=>{
      this.healthy();if(!HASH.test(key))throw damaged();
      const before=this.#revisions.get(previous);
      if(!record.document) {
        const row=await this.#s3.put(privateKey('workspaces/'+key+'.json'),packed(record),before?.etag || null);
        this.#revisions.set(record,{etag:row.etag});return;
      }
      const name=documentName(record.document),head=await this.head(name,{missing:true});
      if((head?.value.source.hash || null)!==record.fileHash || (head?.value.workspaces[key] || null)!==(before?.hash || null))throw conflict();
      const text=stateText(record);
      if(text===null && !head)throw damaged();
      // deleteAll/expiry revokes the workspace, never its source document.
      const bytes=text===null ? null : this.sourceBytes(text);
      const source=bytes===null ? head.value.source : {hash:await this.putPart(bytes),bytes:bytes.length};
      record.fileHash=source.hash;
      const hash=await this.putPart(packed(record)),value=this.nextHead(name,head,source);
      value.workspaces[key]=hash;
      await this.locate(key,name);
      await this.onCommitStep?.('prepared');
      await this.#s3.put(name,packed(value),head?.etag || null);
      // The complete persisted kernel is already visible, even if this response is lost.
      this.#revisions.set(record,{hash});
      await this.onCommitStep?.('document');
    });
  }
}
