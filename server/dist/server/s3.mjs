// SPDX-License-Identifier: AGPL-3.0-only
// Node owns I/O; Notes owns SigV4 and the bounded S3 XML grammar. No SDK, redirect,
// provider error body, signed request or credential is retained in a diagnostic.
import {webcrypto} from 'node:crypto';
import {signV4,encodeObjectKey,canonicalQuery,readS3XML,s3XMLScalar as scalar} from '../notes/transport-s3.mjs';
import {sha256,refusal} from './store.mjs';

const decode=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const responseError=()=>refusal('BUCKET_RESPONSE_INVALID','The bucket returned an invalid or incomplete response.',503);
const conflict=()=>refusal('FILE_CONFLICT','The file changed outside this workspace. Reopen the current document before editing.',409);
const stop=async response=>{try{await response.body?.cancel();}catch{}};
const etagOf=response=>{
  const etag=response.headers.get('etag');
  if(!etag || !/^"[^"\r\n]+"$/.test(etag))throw responseError();
  return etag;
};
export class S3 {
  #origin; #path; #region; #key; #secret; #session; #timeout;
  constructor({bucket,endpoint,bucketRegion=process.env.RAPIER_BUCKET_REGION,bucketTimeoutMs=30000}={}) {
    if(typeof bucket!=='string' || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || /\.\.|\.-|-\./.test(bucket))
      throw new TypeError('A valid S3 bucket name is required.');
    let url;
    try {
      if(typeof endpoint!=='string' || !/^https?:\/\/[^/?#@\\\s]+\/?$/.test(endpoint))throw new Error();
      url=new URL(endpoint);
      if(url.protocol!=='https:' && !(url.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw new Error();
    } catch {throw new TypeError('Use an HTTPS S3 endpoint origin without credentials, path, query or fragment; HTTP is allowed only on loopback.');}
    this.#region=bucketRegion || (url.hostname.endsWith('.r2.cloudflarestorage.com') ? 'auto' : 'us-east-1');
    if(!/^[a-z0-9-]{1,63}$/.test(this.#region) || !Number.isSafeInteger(bucketTimeoutMs) || bucketTimeoutMs<1 || bucketTimeoutMs>300000)
      throw new TypeError('The bucket region or request timeout is invalid.');
    this.#key=process.env.RAPIER_BUCKET_KEY_ID;this.#secret=process.env.RAPIER_BUCKET_SECRET;this.#session=process.env.RAPIER_BUCKET_SESSION_TOKEN;
    if(!/^[A-Za-z0-9_-]{1,256}$/.test(this.#key || '') || !/^[\x21-\x7e]{1,4096}$/.test(this.#secret || '') ||
       this.#session!==undefined && !/^[\x21-\x7e]{1,65536}$/.test(this.#session))
      throw new TypeError('Set RAPIER_BUCKET_KEY_ID and RAPIER_BUCKET_SECRET in the environment; an optional session token must also be valid.');
    this.#origin=url.origin;this.#path='/'+bucket+'/';this.#timeout=bucketTimeoutMs;this.bucket=bucket;
  }
  async request(method,key,{body=Buffer.alloc(0),query=[],condition,limit=0,limitCode='STATE_TOO_LARGE',missing=false,list=false}={}) {
    try {
      const path=this.#path+key,date=new Date().toISOString().replace(/[-:]|\.\d{3}/g,''),hash=sha256(body);
      const headers={host:new URL(this.#origin).host,'x-amz-date':date,'x-amz-content-sha256':hash,
        ...(this.#session ? {'x-amz-security-token':this.#session} : {})};
      if(method==='PUT') {
        if(condition===null)headers['if-none-match']='*';
        else if(typeof condition==='string' && /^"[^"\r\n]+"$/.test(condition))headers['if-match']=condition;
        else throw new TypeError('A conditional object revision is required.');
      }
      const signed=await signV4({method,path,query,headers,payloadHash:hash,region:this.#region,
        accessKeyId:this.#key,secretAccessKey:this.#secret,crypto:webcrypto});
      headers.authorization=signed.authorization;
      const response=await fetch(this.#origin+encodeObjectKey(path)+(query.length ? '?'+canonicalQuery(query) : ''),
        {method,headers,...(method==='PUT' ? {body} : {}),redirect:'error',signal:AbortSignal.timeout(this.#timeout)});
      if(response.status!==200) {
        await stop(response);
        if(response.status===404 && missing)return null;
        if(response.status===409 || response.status===412)throw conflict();
        if(response.status===404)throw refusal('DOCUMENT_NOT_FOUND','The document was not found.',404);
        throw refusal('BUCKET_REQUEST_FAILED','The bucket request failed. Check its access policy and availability.',503);
      }
      let etag;
      try {etag=list ? null : etagOf(response);}catch(error){await stop(response);throw error;}
      if(method==='PUT'){await stop(response);return {etag};}
      const length=response.headers.get('content-length');
      if(length!==null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))){await stop(response);throw responseError();}
      if(length!==null && Number(length)>limit){await stop(response);throw refusal(limitCode,'A file exceeds the configured byte limit.',413);}
      const chunks=[];let size=0;
      if(response.body)for await(const chunk of response.body) {
        size+=chunk.length;
        if(size>limit)throw refusal(limitCode,'A file exceeds the configured byte limit.',413);
        chunks.push(chunk);
      }
      return {etag,bytes:Buffer.concat(chunks,size)};
    } catch(error) {
      if(error.public)throw error;
      throw refusal('BUCKET_REQUEST_FAILED','The bucket request could not be completed.',503);
    }
  }
  get(key,limit,{missing=false,limitCode='STATE_TOO_LARGE'}={}) {return this.request('GET',key,{limit,missing,limitCode});}
  put(key,bytes,condition) {return this.request('PUT',key,{body:bytes,condition});}
  async *list(prefix='',{delimiter=null}={}) {
    const cursors=new Set();let cursor=null;
    do {
      const query=[['list-type','2'],['encoding-type','url'],['prefix',prefix],['max-keys','1000'],
        ...(delimiter===null ? [] : [['delimiter',delimiter]]),...(cursor===null ? [] : [['continuation-token',cursor]])];
      const response=await this.request('GET','',{query,limit:4*1024*1024,limitCode:'BUCKET_RESPONSE_INVALID',list:true});
      let entries,next;
      try {
        const xml=readS3XML(decode.decode(response.bytes)),encoding=scalar(xml,'EncodingType');
        if(encoding!==null && encoding!=='url')throw responseError();
        const unescape=value=>encoding==='url' ? decodeURIComponent(value) : value;
        if(scalar(xml,'Name',true)!==this.bucket || unescape(scalar(xml,'Prefix',true))!==prefix || xml.text.trim())throw responseError();
        const allowed=new Set(['Name','Prefix','KeyCount','MaxKeys','IsTruncated','EncodingType','ContinuationToken','NextContinuationToken','Contents','Delimiter',...(delimiter===null ? [] : ['CommonPrefixes'])]);
        if(xml.children.some(row=>!allowed.has(row.name)))throw responseError();
        const echoed=scalar(xml,'Delimiter'),echoedCursor=scalar(xml,'ContinuationToken');
        if(echoed!==null && unescape(echoed)!==delimiter || echoedCursor!==null && echoedCursor!==(cursor || ''))throw responseError();
        const flag=scalar(xml,'IsTruncated',true);next=scalar(xml,'NextContinuationToken');
        if(!['true','false'].includes(flag) || flag==='false' && next || flag==='true' && (!next || next.length>8192 || cursors.has(next)))throw responseError();
        if(flag==='false')next=null;
        const seen=new Set();entries=[];
        for(const row of xml.children) {
          if(!['Contents','CommonPrefixes'].includes(row.name))continue;
          const group=row.name==='CommonPrefixes',name=unescape(scalar(row,group ? 'Prefix' : 'Key',true));
          if(row.text.trim() || !name.startsWith(prefix) || seen.has(name) || Buffer.byteLength(name)>1024 ||
             group && (delimiter===null || !name.endsWith(delimiter) || name===prefix))throw responseError();
          seen.add(name);
          if(!group) {const size=scalar(row,'Size',true);if(!/^\d+$/.test(size) || !Number.isSafeInteger(Number(size)))throw responseError();}
          entries.push(group ? {prefix:name} : {key:name});
        }
        const count=scalar(xml,'KeyCount'),max=scalar(xml,'MaxKeys');
        if(entries.length>1000 || count!==null && (!/^\d+$/.test(count) || Number(count)!==entries.length) ||
           max!==null && (!/^\d+$/.test(max) || Number(max)>1000 || Number(max)<entries.length))throw responseError();
      } catch {throw responseError();}
      for(const entry of entries)yield entry;
      cursor=next;if(cursor!==null)cursors.add(cursor);
    } while(cursor!==null);
  }
}
