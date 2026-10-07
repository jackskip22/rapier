// SPDX-License-Identifier: AGPL-3.0-only
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,timingSafeEqual} from 'node:crypto';
import {once} from 'node:events';
import {FileStore,documentName,refusal} from './store.mjs';
import {BucketStore} from './bucket-store.mjs';
import {Renderer} from './chromium.mjs';
import {FolderSearch,searchFingerprint} from './search.mjs';
import {handleMcp,handleAuthenticatedMcp,deployment,MAX_RPC_BODY_BYTES} from '../mcp/worker.mjs';
import {VERSION} from '../version.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
function json(response,value,status=200,extra={}) {
  const body=Buffer.from(JSON.stringify(value));response.writeHead(status,{...HEADERS,'Content-Type':'application/json; charset=utf-8','Content-Length':body.length,...extra});response.end(response.req?.method==='HEAD' ? undefined : body);
}
async function bodyOf(request,limit) {
  const declared=Number(request.headers['content-length'] || 0);
  if(!Number.isSafeInteger(declared) || declared<0 || declared>limit)throw refusal('BODY_TOO_LARGE','The request exceeds the server byte limit.',413);
  let size=0;const chunks=[];
  for await(const chunk of request) {size+=chunk.length;if(size>limit)throw refusal('BODY_TOO_LARGE','The request exceeds the server byte limit.',413);chunks.push(chunk);}
  return Buffer.concat(chunks,size);
}
async function forward(response,reply) {
  response.writeHead(reply.status,{...HEADERS,...Object.fromEntries(reply.headers)});
  if(reply.body)for await(const chunk of reply.body) {
    if(response.destroyed)break;
    if(!response.write(chunk))await Promise.race([once(response,'drain'),once(response,'close')]);
  }
  response.end();
}
function exactOrigin(value) {
  const origin=new URL(value);
  if(origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash ||
     !(origin.protocol==='https:' || origin.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(origin.hostname)))
    throw new TypeError('publicOrigin must be an exact HTTPS origin (HTTP is allowed only for loopback)');
  return origin.origin;
}

export async function createServer(options={}) {
  const {host='127.0.0.1',port=8383,publicOrigin,assetsDirectory=resolve(ROOT,'dist/chatgpt')}=options;
  if(!Number.isSafeInteger(port) || port<0 || port>65535)throw new TypeError('The port must be an integer from 0 to 65535');
  if(!['127.0.0.1','::1','localhost'].includes(host) && !publicOrigin)throw new TypeError('A non-loopback listener requires its public HTTPS origin');
  const configuredOrigin=publicOrigin ? exactOrigin(publicOrigin) : null;
  if(options.bucket!==undefined && options.root!==undefined)throw new TypeError('Choose a document folder or a bucket, not both.');
  if(options.endpoint!==undefined && options.bucket===undefined)throw new TypeError('A bucket endpoint requires a bucket.');
  const store=options.bucket===undefined ? new FileStore(options) : new BucketStore(options);
  const renderer=new Renderer(options);await renderer.check();
  let closing=null,timer,origin=null;const controllers=new Set(),tasks=new Set();
  try {
    await store.open();
    const authority=Object.freeze({
      ownerId:'owner_'+createHash('sha256').update('rapier-server-owner\0').update(store.credentials.token).digest('base64url'),
      scopes:Object.freeze(['rapier:read','rapier:write']),source:'server',
    });
    const assets=new Map();
    for(const name of ['rapier-app.html','rapier-skills.json','icon-192.png','icon-512.png']) {
      const path=resolve(assetsDirectory,name);
      const bytes=await readFile(path).catch(error=>{
        if(error.code==='ENOENT')throw refusal('SERVER_ASSETS_MISSING','Build both profiles, full last, and stage the server before starting it.',503);throw error;
      });
      assets.set('/'+name,{bytes,type:name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.json') ? 'application/json; charset=utf-8' : 'image/png'});
    }
    const app=assets.get('/rapier-app.html').bytes.toString();
    if(!app.includes('globalThis.RAPIER_APPS_HOST = true') && !/globalThis\.RAPIER_APPS_HOST\s*=\s*true/.test(app))throw refusal('SERVER_ASSETS_MISMATCH','The server requires the built MCP App, not an editor-page substitute.',503);
    if(!app.includes('name="rapier-version" content="'+VERSION+'"'))throw refusal('SERVER_ASSETS_MISMATCH','The server and its editor resource have different versions.',503);
    const assetBinding={fetch:async request=>{
      const value=assets.get(new URL(request.url).pathname);
      return value ? new Response(value.bytes,{headers:{'Content-Type':value.type,...HEADERS}}) : new Response('Not found',{status:404});
    }};
    const environment=scope=>{
      const env={EDITOR_KEY_SECRET:store.credentials.editorKeySecret,UI_ORIGIN:origin,ALLOWED_ORIGINS:origin,
        FILE_DOWNLOAD_ORIGINS:'',RETURN_ORIGIN:origin,ASSETS:assetBinding};
      env.DOCUMENTS=store.binding('document',env,scope);env.BUDGET=store.binding('budget',env);return env;
    };
    const search=new FolderSearch(store,await searchFingerprint());
    const authorized=request=>{
      const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(String(request.headers.authorization || ''))?.[1];
      return !!token && timingSafeEqual(Buffer.from(token),Buffer.from(store.credentials.token));
    };
    const server=http.createServer({maxHeaderSize:16384},(request,response)=>{
      const control=new AbortController();controllers.add(control);
      request.once('aborted',()=>control.abort());response.once('close',()=>{if(!response.writableFinished)control.abort();});
      const run=(async()=>{
        if(closing)throw refusal('SERVER_CLOSED','The server is closing.',503);
        if(controllers.size>64)throw refusal('SERVER_BUSY','The server request limit has been reached. Retry later.',503);
        if(request.headers.host!==new URL(origin).host)throw refusal('HOST_REFUSED','This Host is not the configured server origin.',403);
        if(!request.url?.startsWith('/') || request.url.startsWith('//'))throw refusal('PATH_REFUSED','Use a local server path.',400);
        const url=new URL(request.url,origin);
        const isMcp=url.pathname==='/mcp',isReturn=url.pathname.startsWith('/return/'),isExport=url.pathname.startsWith('/export/');
        if(isMcp || isReturn || isExport) {
          // Workspace, export and return addresses name resources; the deployment bearer grants access.
          if(request.method!=='OPTIONS' && !authorized(request))return json(response,{error:'AUTHORIZATION_REQUIRED',message:'A server bearer token is required.'},401,{'WWW-Authenticate':'Bearer realm="rapier-server"'});
          const methods=isExport ? ['GET','HEAD'] : ['POST','OPTIONS'];
          if(!methods.includes(request.method))return json(response,{error:'METHOD_NOT_ALLOWED'},405,{Allow:methods.join(', ')});
          let scope=null;
          if(isMcp && url.searchParams.has('document'))scope=documentName(url.searchParams.get('document'));
          if(isMcp && [...url.searchParams.keys()].some(key=>key!=='document'))throw refusal('QUERY_REFUSED','The MCP URL accepts only a document path.',400);
          let bytes=request.method==='POST' ? await bodyOf(request,MAX_RPC_BODY_BYTES) : null;
          if(scope && bytes) {
            let message;try{message=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw refusal('INVALID_JSON','The request is not valid UTF-8 JSON.',400);}
            if(message?.method==='tools/call' && message.params?.name==='rapier.open' && !message.params.arguments?.document) {
              const args=message.params.arguments || {};
              if(!args || Array.isArray(args) || typeof args!=='object')throw refusal('INVALID_SCOPE_ARGUMENTS','The scoped open needs an arguments object.',400);
              const document=await store.read(scope);
              if(('text' in args && args.text!==document.text) || ('filename' in args && args.filename!==basename(scope)) ||
                 ('docKind' in args && args.docKind!=='markdown') || 'file' in args)
                throw refusal('SCOPED_SOURCE_REFUSED','A scoped open reads that file; it cannot substitute other source, a filename or a host download.',409);
              message.params.arguments={...args,text:document.text,filename:basename(scope),docKind:'markdown'};
              bytes=Buffer.from(JSON.stringify(message));
            }
          }
          const headers=new Headers();
          for(const [name,value] of Object.entries(request.headers))if(value!==undefined && !['host','content-length','connection','authorization','cookie','cf-connecting-ip','x-forwarded-for'].includes(name))headers.set(name,Array.isArray(value) ? value.join(', ') : value);
          headers.set('CF-Connecting-IP',request.socket.remoteAddress || '127.0.0.1');
          const incoming=new Request(url,{method:request.method,headers,...(bytes ? {body:bytes} : {}),signal:control.signal}),env=environment(scope);
          const reply=request.method==='OPTIONS' ? await handleMcp(incoming,env) : await handleAuthenticatedMcp(incoming,env,authority);
          if(request.method==='OPTIONS' && reply.status<300)reply.headers.set('Access-Control-Allow-Methods','POST');
          return forward(response,reply);
        }
        if(!['GET','HEAD'].includes(request.method))return json(response,{error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, HEAD'});
        if(url.pathname==='/health')return json(response,{service:'rapier-server',version:VERSION,...deployment(environment(),{authentication:'server-bearer'}),...(api.maintenanceError ? {maintenanceError:api.maintenanceError} : {}),renderer:{version:renderer.version,runtime:renderer.runtimeHash},...(store.poisoned ? {ready:false,recoveryRequired:true} : {})},store.poisoned ? 503 : 200);
        if(url.pathname==='/search') {
          const q=url.searchParams.get('q') || '',limit=Number(url.searchParams.get('limit') || 50);
          if(q.length>2048 || !Number.isSafeInteger(limit) || limit<1 || limit>200)throw refusal('QUERY_REFUSED','Use a query of at most 2048 characters and a limit from 1 to 200.',400);
          return json(response,await search.query(q,{limit}));
        }
        if(url.pathname.startsWith('/d/')) {
          let name;try{name=url.pathname.slice(3).split('/').map(part=>{const decoded=decodeURIComponent(part);if(decoded.includes('/'))throw new Error();return decoded;}).join('/');}
          catch{throw refusal('DOCUMENT_PATH_REFUSED','The document URL has an invalid encoded path.',403);}
          let format='html';
          if(/\.md\.(docx|pdf)$/i.test(name)) {format=name.slice(name.lastIndexOf('.')+1).toLowerCase();name=name.slice(0,name.lastIndexOf('.'));}
          name=documentName(name);const document=await store.read(name);
          const artifact=await renderer.render(document.text,basename(name),format,{signal:control.signal});
          response.writeHead(200,{...HEADERS,'Content-Type':artifact.type,'Content-Length':artifact.bytes.length,
            'Content-Disposition':(format==='html' ? 'inline' : 'attachment')+"; filename*=UTF-8''"+encodeURIComponent(artifact.filename),
            ...(format==='html' ? {'Content-Security-Policy':"connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'"} : {}),
          });return response.end(request.method==='HEAD' ? undefined : artifact.bytes);
        }
        if(assets.has(url.pathname) && url.pathname.endsWith('.png'))return forward(response,await assetBinding.fetch(new Request(url)));
        return json(response,{error:'NOT_FOUND'},404);
      })().catch(error=>{
        if(response.destroyed)return;
        if(response.headersSent){response.destroy();return;}
        json(response,{error:error.public ? error.code : 'REQUEST_FAILED',message:error.public ? error.message : 'The request could not be completed. No filesystem paths or private exception data are returned.'},error.public ? error.status : 503);
      }).finally(()=>{controllers.delete(control);tasks.delete(run);});
      tasks.add(run);
    });
    server.headersTimeout=10000;server.requestTimeout=30000;server.keepAliveTimeout=5000;
    server.on('clientError',(_error,socket)=>{socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');});
    const api={
      store,renderer,get origin(){return origin;},get token(){return store.credentials.token;},
      async listen(){
        if(server.listening)return api;
        await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);resolve();});});
        const address=server.address();origin=configuredOrigin || 'http://'+(address.address.includes(':') ? '['+address.address+']' : address.address)+':'+address.port;
        timer=setInterval(()=>store.expire(environment()).catch(error=>{api.maintenanceError=error.public ? error.code : 'MAINTENANCE_FAILED';}),60000);timer.unref();return api;
      },
      async close(){
        if(closing)return closing;
        closing=(async()=>{
          clearInterval(timer);for(const control of controllers)control.abort();
          const stopped=server.listening ? new Promise(resolve=>server.close(resolve)) : Promise.resolve();
          server.closeAllConnections();await renderer.close();await Promise.allSettled([...tasks]);await stopped;
          await search.pending;await store.close();
        })();return closing;
      },
    };
    return api;
  } catch(error){await renderer.close();await store.close();throw error;}
}
