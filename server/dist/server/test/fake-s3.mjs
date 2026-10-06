// SPDX-License-Identifier: AGPL-3.0-only
// The packet's one protocol peer: real HTTP, independent SigV4 verification and
// body-only ETags. It never stores authorization headers in its diagnostic receipts.
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
const encode=value=>encodeURIComponent(value).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
const xml=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export const witnessKey='rapier-witness-key-not-a-real-key';
export const witnessSecret='rapier-witness-secret-not-a-real-secret';
export const witnessSession='rapier-witness-session-not-a-real-session';
export async function fakeS3(bucket='rapier-witness') {
  const objects=new Map(),requests=[],faults=[];
  const peer={bucket,objects,requests,faults,before:null,after:null,listPage:null,pageSize:3};
  function verify(request,body) {
    const url=new URL(request.url,'http://'+request.headers.host);
    const auth=/^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([a-f0-9]{64})$/.exec(request.headers.authorization || '');
    if(!auth || auth[1]!==witnessKey || auth[3]!=='us-east-1')return false;
    const [,,date,region,signed,signature]=auth,headers=signed.split(';');
    if(headers.join(';')!==[...headers].sort().join(';') || !headers.includes('host') || !headers.includes('x-amz-date') || !headers.includes('x-amz-content-sha256'))return false;
    if(request.headers['x-amz-content-sha256']!==sha(body) || !request.headers['x-amz-date']?.startsWith(date) || request.headers['x-amz-security-token']!==witnessSession)return false;
    if(request.method==='PUT' && !headers.includes(request.headers['if-match'] ? 'if-match' : 'if-none-match'))return false;
    const canonicalHeaders=headers.map(name=>name+':'+String(request.headers[name] || '').trim().replace(/\s+/g,' ')+'\n').join('');
    const query=[...url.searchParams].map(([k,v])=>[encode(k),encode(v)]).sort(([ak,av],[bk,bv])=>ak<bk?-1:ak>bk?1:av<bv?-1:av>bv?1:0).map(([k,v])=>k+'='+v).join('&');
    const path=url.pathname.split('/').map(part=>encode(decodeURIComponent(part))).join('/');
    const canonical=[request.method,path,query,canonicalHeaders,signed,sha(body)].join('\n');
    const scope=date+'/'+region+'/s3/aws4_request',toSign=['AWS4-HMAC-SHA256',request.headers['x-amz-date'],scope,sha(canonical)].join('\n');
    const signing=hmac(hmac(hmac(hmac('AWS4'+witnessSecret,date),region),'s3'),'aws4_request');
    return timingSafeEqual(hmac(signing,toSign),Buffer.from(signature,'hex'));
  }
  peer.seed=(key,body)=>{body=Buffer.from(body);objects.set(key,{body,etag:'"'+createHash('md5').update(body).digest('hex')+'"'});};
  peer.barrier=(key,count=2)=>{
    let arrived=0,release;const gate=new Promise(resolve=>{release=resolve;});
    const timer=setTimeout(()=>release(),5000);timer.unref();
    peer.before=async row=>{if(row.method==='PUT' && row.key===key){arrived++;if(arrived===count){clearTimeout(timer);release();}await gate;}};
    return ()=>{clearTimeout(timer);release();peer.before=null;assert.equal(arrived,count,'both writers reached the conditional head PUT');};
  };
  const server=http.createServer(async(request,response)=>{
    try {
      const chunks=[];for await(const chunk of request)chunks.push(chunk);const body=Buffer.concat(chunks);
      if(!verify(request,body)){faults.push('invalid SigV4');response.writeHead(403);response.end('SignatureDoesNotMatch');return;}
      const url=new URL(request.url,'http://'+request.headers.host),path=decodeURIComponent(url.pathname);
      assert(path.startsWith('/'+bucket+'/'),'path-style bucket is exact');const key=path.slice(bucket.length+2);
      const receipt={method:request.method,key,condition:request.headers['if-match'] || request.headers['if-none-match'] || null,status:null,list:url.searchParams.get('list-type')==='2',prefix:url.searchParams.get('prefix')};
      requests.push(receipt);
      await peer.before?.(receipt,response);
      if(response.writableEnded || response.destroyed)return;
      if(receipt.list && request.method==='GET') {
        const prefix=url.searchParams.get('prefix') || '',delimiter=url.searchParams.get('delimiter'),token=url.searchParams.get('continuation-token');
        const all=new Map();
        for(const name of [...objects.keys()].sort()) {
          if(!name.startsWith(prefix))continue;
          const at=delimiter ? name.indexOf(delimiter,prefix.length) : -1;
          if(at>=0)all.set(name.slice(0,at+delimiter.length),true);else all.set(name,false);
        }
        const offset=token===null ? 0 : Number(/^opaque\+\/=(&\d+)$/.exec(token)?.[1].slice(1));
        assert(Number.isSafeInteger(offset) && offset>=0,'opaque continuation token is returned byte for byte');
        const page=[...all].slice(offset,offset+peer.pageSize),next=offset+page.length<all.size ? 'opaque+/=&'+(offset+page.length) : null;
        let text='<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>'+xml(bucket)+'</Name><Prefix>'+xml(encode(prefix))+'</Prefix><EncodingType>url</EncodingType><KeyCount>'+page.length+'</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>'+Boolean(next)+'</IsTruncated>';
        if(delimiter!==null)text+='<Delimiter>'+xml(encode(delimiter))+'</Delimiter>';
        if(token!==null)text+='<ContinuationToken>'+xml(token)+'</ContinuationToken>';
        if(next!==null)text+='<NextContinuationToken>'+xml(next)+'</NextContinuationToken>';
        for(const [name,group] of page)text+=group ? '<CommonPrefixes><Prefix>'+xml(encode(name))+'</Prefix></CommonPrefixes>' : '<Contents><Key>'+xml(encode(name))+'</Key><Size>'+objects.get(name).body.length+'</Size><ETag>'+xml(objects.get(name).etag)+'</ETag></Contents>';
        text+='</ListBucketResult>';text=peer.listPage?.(text) ?? text;
        receipt.status=200;response.writeHead(200,{'content-type':'application/xml'});response.end(text);return;
      }
      const current=objects.get(key);
      if(request.method==='GET') {
        receipt.status=current ? 200 : 404;response.writeHead(receipt.status,current ? {etag:current.etag,'content-length':current.body.length} : {});response.end(current?.body);return;
      }
      assert.equal(request.method,'PUT','only the requested S3 subset is used');
      const none=request.headers['if-none-match'],match=request.headers['if-match'];
      assert(none==='*' && !match || !none && /^"[^"]+"$/.test(match || ''),'every write is conditional');
      if(none==='*' && current || match && match!==current?.etag){receipt.status=412;response.writeHead(412);response.end('PreconditionFailed');return;}
      peer.seed(key,body);receipt.status=200;
      await peer.after?.(receipt,response);
      if(response.writableEnded || response.destroyed)return;
      response.writeHead(200,{etag:objects.get(key).etag});response.end();
    } catch(error) {faults.push(error.message);if(!response.headersSent)response.writeHead(500);response.end('Witness endpoint rejected a protocol request.');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  peer.endpoint='http://127.0.0.1:'+server.address().port;
  peer.close=async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  return peer;
}
