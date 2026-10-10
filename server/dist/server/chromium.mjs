// SPDX-License-Identifier: AGPL-3.0-only
// The installed browser is a DOM/print host, not a second renderer. DevTools uses pipes,
// never a listening debugging port. Retained bytes enter an in-memory document;
// every document network request is refused; no document can turn this process into a URL fetcher.
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {refusal, sha256} from './store.mjs';
import {VERSION} from '../version.mjs';

const execute=promisify(execFile);
const MAX_FRAME=128*1024*1024;
class Pipe {
  constructor(process,timeout) {
    this.process=process;this.timeout=timeout;this.next=0;this.pending=new Map();this.listeners=new Set();
    let chunks=[],size=0;
    process.stdio[4].on('data',chunk=>{
      let from=0;
      while(from<chunk.length) {
        const end=chunk.indexOf(0,from),piece=chunk.subarray(from,end<0 ? chunk.length : end);
        chunks.push(piece);size+=piece.length;
        if(size>MAX_FRAME){this.fail(refusal('RENDER_LIMIT','The browser response exceeded the byte limit.',413));process.kill('SIGKILL');return;}
        if(end<0)break;
        try {const message=JSON.parse(Buffer.concat(chunks,size).toString());this.message(message);}
        catch(error){this.fail(error);process.kill('SIGKILL');return;}
        chunks=[];size=0;from=end+1;
      }
    });
    // A failed browser can reset either DevTools pipe before its exit event arrives.
    for(const stream of [process.stdio[3],process.stdio[4]])stream.on('error',error=>this.fail(error));
    process.on('error',error=>this.fail(error));
    process.on('exit',()=>this.fail(refusal('BROWSER_EXITED','The render browser exited; retry after checking its sandbox and resource limits.',503)));
  }
  message(message) {
    if(message.id) {
      const pending=this.pending.get(message.id);if(!pending)return;
      this.pending.delete(message.id);pending.clear();
      if(message.error)pending.reject(Object.assign(refusal('BROWSER_COMMAND_FAILED','The browser could not complete this export.',422),{cause:message.error}));
      else pending.resolve(message.result);
    } else for(const listener of this.listeners)listener(message);
  }
  fail(error) {for(const pending of this.pending.values()){pending.clear();pending.reject(error);}this.pending.clear();this.closed=error;}
  call(method,params={},sessionId,signal) {
    if(this.closed)return Promise.reject(this.closed);if(signal?.aborted)return Promise.reject(signal.reason);
    const id=++this.next;
    return new Promise((resolve,reject)=>{
      const abort=()=>{const pending=this.pending.get(id);if(!pending)return;this.pending.delete(id);pending.clear();reject(signal.reason || refusal('RENDER_CANCELLED','The export was cancelled.',499));};
      const timer=setTimeout(()=>{
        const pending=this.pending.get(id);if(!pending)return;this.pending.delete(id);pending.clear();reject(refusal('RENDER_TIMEOUT','The export exceeded its time limit.',504));
      },this.timeout);timer.unref();
      const clear=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
      this.pending.set(id,{resolve,reject,clear});signal?.addEventListener('abort',abort,{once:true});
      this.process.stdio[3].write(JSON.stringify({id,method,params,...(sessionId ? {sessionId} : {})})+'\0',error=>{if(error){this.pending.delete(id);clear();reject(error);}});
    });
  }
}
export class Renderer {
  constructor({chromium,chromiumVersion,noSandbox=false,runtimeFile,timeoutMs=45000,concurrency=2}={}) {
    if(typeof chromium!=='string' || !chromium || !/^\d+\.\d+\.\d+\.\d+$/.test(chromiumVersion || ''))
      throw refusal('CHROMIUM_PIN_REQUIRED','Provide the installed Chromium executable and its exact four-part version.',503);
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>300000||!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>8)
      throw new TypeError('Invalid renderer limits');
    this.executable=resolve(chromium);this.version=chromiumVersion;this.noSandbox=noSandbox;this.timeout=timeoutMs;this.concurrency=concurrency;
    this.runtimeFile=runtimeFile ? resolve(runtimeFile) : fileURLToPath(new URL('../rapier-document.html',import.meta.url));
    this.active=0;this.waiters=[];this.stopping=new AbortController();this.starting=null;this.cache=new Map();this.cacheBytes=0;
  }
  async check() {
    let result;try{result=await execute(this.executable,['--version'],{timeout:10000,maxBuffer:16384});}
    catch(error){throw Object.assign(refusal('CHROMIUM_UNAVAILABLE','The configured Chromium executable could not be run.',503),{cause:error});}
    const actual=/\b(\d+\.\d+\.\d+\.\d+)\b/.exec(result.stdout)?.[1];
    if(actual!==this.version)throw refusal('CHROMIUM_VERSION_MISMATCH','The installed Chromium version differs from the configured pin.',503);
    this.runtime=await readFile(this.runtimeFile,'utf8');
    // The bridge is inside the compressed authored runtime; the generated profile/version
    // is additionally recorded by staging, not guessed from an arbitrary HTML document.
    if(!this.runtime.includes('name="rapier-version" content="'+VERSION+'"'))throw refusal('RENDER_RUNTIME_MISSING','Build the document profile before starting the server.',503);
    const bundled=await readFile(new URL('../dist/chatgpt/rapier-app.html',import.meta.url),'utf8');
    if(!bundled.includes('name="rapier-version" content="'+VERSION+'"'))throw refusal('RENDER_RUNTIME_MISSING','Build the matching full profile before starting the server.',503);
    const script=id=>{
      const found=[...bundled.matchAll(new RegExp('<script\\b[^>]*id="'+id+'"[^>]*>([^<]*)<\\/script>','g'))];
      if(found.length!==1)throw refusal('RENDER_RUNTIME_MISSING','The retained render resource is missing: '+id,503);
      return found[0];
    };
    const groups=JSON.parse(script('rapier-builtin-plugins')[1]).filter(group=>['math','mermaid','font-subset'].includes(group.id));
    if(groups.length!==3)throw refusal('RENDER_RUNTIME_MISSING','The retained render resources are incomplete.',503);
    const inventory='<script type="application/json" id="rapier-server-plugins">'+JSON.stringify(groups)+'</script>';
    const payload=groups.map(group=>script(group.element)[0]).join('');
    // The page's own scripts name the tag inside a string; the document ends at the last one.
    const end=this.runtime.lastIndexOf('</body>');
    if(end<0)throw refusal('RENDER_RUNTIME_MISSING','The render runtime has no document end.',503);
    this.runtime=this.runtime.slice(0,end)+inventory+payload+this.runtime.slice(end);
    this.runtimeHash=sha256(this.runtime);return this;
  }
  async start() {
    if(this.stopping.signal.aborted)throw refusal('SERVER_CLOSED','The renderer is closing.',503);
    if(this.starting && !this.pipe?.closed)return this.starting;
    const previous=this.process;this.pipe=null;
    this.starting=(async()=>{
      if(previous)await this.stopProcess();
      this.profile=await mkdtemp(join(tmpdir(),'rapier-render-'));
      const args=['--headless=new','--remote-debugging-pipe','--no-first-run','--no-default-browser-check',
        '--enable-features=JXLImageFormat','--disable-background-networking','--disable-component-update','--disable-domain-reliability','--disable-sync',
        '--disable-extensions','--disable-default-apps','--disable-client-side-phishing-detection','--no-pings',
        '--metrics-recording-only','--disable-breakpad','--disable-crash-reporter','--disable-quic',
        '--disable-features=MediaRouter,OptimizationHints,AutofillServerCommunication,Translate',
        '--password-store=basic','--use-mock-keychain','--host-resolver-rules=MAP * ~NOTFOUND',
        '--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>',
        '--user-data-dir='+this.profile,...(this.noSandbox ? ['--no-sandbox'] : []),'about:blank'];
      this.process=spawn(this.executable,args,{detached:true,stdio:['ignore','ignore','pipe','pipe','pipe']});
      this.diagnostic='';this.process.stderr.on('data',bytes=>{this.diagnostic=(this.diagnostic+bytes.toString()).slice(-4096);});
      this.pipe=new Pipe(this.process,this.timeout);
      try {await this.pipe.call('Browser.getVersion',{},undefined,this.stopping.signal);}
      catch(error){await this.stopProcess();throw error;}
      return this.pipe;
    })();
    this.starting.catch(()=>{this.starting=null;});return this.starting;
  }
  async slot(signal) {
    if(signal.aborted)throw signal.reason;
    if(this.active>=this.concurrency) {
      if(this.waiters.length>=32)throw refusal('RENDER_BUSY','The bounded render queue is full. Retry later.',503);
      await new Promise((resolve,reject)=>{
        const item={resolve,reject,signal};
        item.abort=()=>{this.waiters=this.waiters.filter(row=>row!==item);reject(signal.reason);};
        this.waiters.push(item);signal.addEventListener('abort',item.abort,{once:true});
      });
    } else this.active++;
  }
  release() {
    let next;
    while((next=this.waiters.shift())) {
      next.signal.removeEventListener('abort',next.abort);
      if(!next.signal.aborted){next.resolve();return;}
    }
    this.active--;
  }
  async withPage(operation,signal) {
    const deadline=AbortSignal.timeout(this.timeout);
    const combined=AbortSignal.any([this.stopping.signal,deadline,...(signal ? [signal] : [])]);
    await this.slot(combined);let contextId,sessionId,pipe,listener;
    try {
      pipe=await this.start();contextId=(await pipe.call('Target.createBrowserContext',{},undefined,combined)).browserContextId;
      const targetId=(await pipe.call('Target.createTarget',{url:'about:blank',browserContextId:contextId,background:true},undefined,combined)).targetId;
      sessionId=(await pipe.call('Target.attachToTarget',{targetId,flatten:true},undefined,combined)).sessionId;
      const call=(method,params={})=>pipe.call(method,params,sessionId,combined);
      const attempts=[],errors=[];
      listener=message=>{
        if(message.sessionId!==sessionId)return;
        if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
        if(message.method==='Runtime.bindingCalled' && message.params.name==='__rapierHostDigest') {
          // about:blank has no secure origin. SHA is a narrow Node WebCrypto port, not a
          // DOM or renderer substitute; random values remain the browser's native API.
          let request;
          try {
            request=JSON.parse(message.params.payload);
            if(!Number.isSafeInteger(request.id) || !['SHA-256','SHA-384','SHA-512'].includes(request.algorithm) ||
               typeof request.base64!=='string' || request.base64.length>32*1024*1024)throw new Error('Invalid digest request');
            const digest=createHash(request.algorithm.replace('-','').toLowerCase()).update(Buffer.from(request.base64,'base64')).digest('base64');
            pipe.call('Runtime.evaluate',{expression:'globalThis.__rapierDigestDone('+request.id+','+JSON.stringify(digest)+')',contextId:message.params.executionContextId},sessionId,combined).catch(()=>{});
          } catch(error) {
            if(Number.isSafeInteger(request?.id))pipe.call('Runtime.evaluate',{expression:'globalThis.__rapierDigestDone('+request.id+',null)',contextId:message.params.executionContextId},sessionId,combined).catch(()=>{});
          }
          return;
        }
        if(message.method!=='Fetch.requestPaused')return;
        const event=message.params;
        attempts.push({type:event.resourceType,origin:(()=>{try{return new URL(event.request.url).origin;}catch{return 'invalid';}})()});
        pipe.call('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'},sessionId,combined).catch(()=>{});
      };
      pipe.listeners.add(listener);
      await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
      await call('Network.setBypassServiceWorker',{bypass:true});await call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
      await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
      await call('Runtime.addBinding',{name:'__rapierHostDigest'});
      const evaluate=async expression=>{
        const response=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
        if(response.exceptionDetails)throw Object.assign(refusal('DOCUMENT_RENDER_REFUSED','The document could not be exported without changing or losing its content.',422),{cause:response.exceptionDetails.exception?.description || response.exceptionDetails.text});
        return response.result?.value;
      };
      const wait=async expression=>{
        while(!await evaluate(expression)) {
          if(combined.aborted)throw combined.reason;
          if(errors.length)throw Object.assign(refusal('RENDER_RUNTIME_FAILED','The generated render runtime did not start.',503),{cause:errors.join('\n')});
          await new Promise(resolve=>setTimeout(resolve,25));
        }
      };
      await evaluate(`(()=>{
        globalThis.__rapierServerRenderHost=true;
        if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>{
          const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
          const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
          return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
        }});
        let sequence=0;const pending=new Map();
        Object.defineProperty(globalThis,'__rapierDigestDone',{value:(id,base64)=>{
          const item=pending.get(id);if(!item)return;pending.delete(id);
          if(base64===null)item.reject(new Error('Digest refused'));
          else item.resolve(Uint8Array.from(atob(base64),character=>character.charCodeAt(0)).buffer);
        }});
        if(!crypto.subtle)Object.defineProperty(crypto,'subtle',{value:Object.freeze({digest:(algorithm,value)=>{
          const name=typeof algorithm==='string' ? algorithm : algorithm.name;
          const bytes=ArrayBuffer.isView(value) ? new Uint8Array(value.buffer,value.byteOffset,value.byteLength) : new Uint8Array(value);
          let binary='';for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
          return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});__rapierHostDigest(JSON.stringify({id,algorithm:name,base64:btoa(binary)}));});
        }})});
        return true;
      })()`);
      const initialTree=await call('Page.getFrameTree');
      await call('Page.setDocumentContent',{frameId:initialTree.frameTree.frame.id,html:this.runtime});
      await wait('!!globalThis.RapierServerRenderer');
      const print=async html=>{
        await call('Emulation.setEmulatedMedia',{media:'print'});
        const tree=await call('Page.getFrameTree');
        await call('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html});
        await wait('document.readyState === "complete"');
        await evaluate('(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true;})()');
        const pdf=await call('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,generateTaggedPDF:true});
        return Buffer.from(pdf.data,'base64');
      };
      return await operation({evaluate,print,attempts,call});
    } finally {
      if(listener)pipe?.listeners.delete(listener);
      if(contextId)await pipe.call('Target.disposeBrowserContext',{browserContextId:contextId}).catch(()=>{});
      this.release();
    }
  }
  async render(source,filename,format='html',{signal}={}) {
    if(!['html','docx','pdf','semantic'].includes(format))throw new TypeError('Unknown export format');
    const key=sha256(JSON.stringify([this.runtimeHash,source,filename,format]));
    const found=this.cache.get(key);
    if(found){this.cache.delete(key);this.cache.set(key,found);return found;}
    const result=await this.withPage(async({evaluate,print})=>{
      const artifact=await evaluate('globalThis.RapierServerRenderer.render('+JSON.stringify({source,filename,format})+')');
      const bytes=format==='pdf' ? await print(artifact.html) : artifact.base64 ? Buffer.from(artifact.base64,'base64') : Buffer.from(artifact.html);
      return {bytes,filename:artifact.filename || filename,type:format==='pdf' ? 'application/pdf' : format==='docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/html; charset=utf-8'};
    },signal);
    if(result.bytes.length<=16*1024*1024){this.cache.set(key,result);this.cacheBytes+=result.bytes.length;
      while(this.cache.size>64 || this.cacheBytes>64*1024*1024){const oldest=this.cache.keys().next().value;this.cacheBytes-=this.cache.get(oldest).bytes.length;this.cache.delete(oldest);}}
    return result;
  }
  async readWord(bytes,{signal}={}) {
    return this.withPage(({evaluate})=>evaluate('globalThis.RapierServerRenderer.readWord('+JSON.stringify(Buffer.from(bytes).toString('base64'))+')'),signal);
  }
  async stopProcess() {
    const child=this.process;
    if(child?.pid) {
      const signalGroup=signal=>{try{process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}};
      signalGroup('SIGTERM');
      if(child.exitCode===null && child.signalCode===null)
        await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,1500))]);
      // Reap the browser's process group as well as its launcher. A killed launcher can
      // leave a renderer holding the profile; none of those descendants belongs to a user.
      signalGroup('SIGKILL');
    }
    if(this.profile)await rm(this.profile,{recursive:true,force:true,maxRetries:8,retryDelay:100});
    this.process=null;
  }
  async close() {
    if(this.stopping.signal.aborted)return;this.stopping.abort(refusal('SERVER_CLOSED','The server is closing.',503));
    for(const waiter of this.waiters.splice(0)){waiter.signal.removeEventListener('abort',waiter.abort);waiter.reject(this.stopping.signal.reason);}
    await this.stopProcess();this.cache.clear();this.cacheBytes=0;
  }
}
