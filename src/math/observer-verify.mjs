// SPDX-License-Identifier: MIT
// Functional browser proof: exact authored source and independent observation lifetimes.
// No appearance, geometry or timing assertions. The caller supplies its installed browser.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export async function verifyMathObservers(page, bundle) {
  await page.setContent('<!doctype html><main><section id="first"></section><section id="second"></section><section id="diagnostics"></section></main>');
  await page.evaluate(() => {
    const probe=window.mathObserverProbe={capture:false,listeners:[],resizes:[],mutations:[],frames:new Set()};
    const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
    const watched=target=>target===window || target===document.fonts || target instanceof MediaQueryList;
    EventTarget.prototype.addEventListener=function(type,callback,options) {
      if(probe.capture && watched(this))probe.listeners.push({target:this,type,callback,active:true});
      return add.call(this,type,callback,options);
    };
    EventTarget.prototype.removeEventListener=function(type,callback,options) {
      for(const entry of probe.listeners)if(entry.target===this && entry.type===type && entry.callback===callback)entry.active=false;
      return remove.call(this,type,callback,options);
    };
    const Resize=ResizeObserver,Mutation=MutationObserver;
    window.ResizeObserver=class extends Resize {
      constructor(callback) {super(callback);this.callback=callback;this.targets=new Set();this.disconnected=false;if(probe.capture)probe.resizes.push(this);}
      observe(target,options) {this.disconnected=false;this.targets.add(target);return super.observe(target,options);}
      unobserve(target) {this.targets.delete(target);return super.unobserve(target);}
      disconnect() {this.disconnected=true;this.targets.clear();return super.disconnect();}
    };
    window.MutationObserver=class extends Mutation {
      constructor(callback) {super(callback);this.callback=callback;this.active=false;if(probe.capture)probe.mutations.push(this);}
      observe(target,options) {this.active=true;return super.observe(target,options);}
      disconnect() {this.active=false;return super.disconnect();}
    };
    const request=requestAnimationFrame.bind(window),cancel=cancelAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>{
      const id=request(time=>{probe.frames.delete(id);callback(time);});if(probe.capture)probe.frames.add(id);return id;
    };
    window.cancelAnimationFrame=id=>{probe.frames.delete(id);cancel(id);};
    probe.settle=()=>new Promise(resolve=>request(()=>request(resolve)));
  });
  await page.addScriptTag({content:bundle});
  return page.evaluate(async () => {
    const probe=window.mathObserverProbe,api=window.RapierMath,checks=[],failures=[];
    probe.capture=true;
    const check=(condition,message)=>{checks.push(message);if(!condition)failures.push(message);};
    const source='\ufeff\\frac{x_i}{2}\t% keep this CRLF\r\n+\\text{café Ω <\\&> "\'}';
    const other='\\sqrt{2}+y';
    const main=document.querySelector('main'),first=document.getElementById('first'),second=document.getElementById('second');
    const insert=(parent,text)=>{
      const rendered=api.render(text,{displayMode:true});
      if(rendered.errors.length)throw new Error(JSON.stringify(rendered.errors));
      parent.innerHTML=rendered.svg;return parent.firstElementChild;
    };
    const svg=insert(first,source),peer=insert(second,other),writes=new Map([[svg,0],[peer,0]]);
    for(const node of writes.keys()) {
      const replace=node.replaceChildren;
      node.replaceChildren=function(...children) {writes.set(this,writes.get(this)+1);return replace.apply(this,children);};
    }
    const malformed='x\u0000\ud800\ufffey',diagnostics=document.getElementById('diagnostics');
    diagnostics.innerHTML=api.renderToString(malformed);
    const diagnostic=diagnostics.firstElementChild,carrier=diagnostic.getAttribute('data-tex-utf16'),alternative=diagnostic.getAttribute('aria-label');
    const kept=(node,text)=>node.getAttribute('aria-label')===text && node.querySelector('title')?.textContent===text;
    const bump=()=>Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:window.devicePixelRatio+1});
    const activeResources=()=>probe.listeners.filter(entry=>entry.active).length+
      probe.mutations.filter(observer=>observer.active).length+
      probe.resizes.filter(observer=>!observer.disconnected).length+probe.frames.size;

    const emptyStop=api.observe(document.createElement('div'));
    emptyStop();emptyStop();
    check(activeResources()===0,'An empty observation owns no document resources.');
    const stopOuter=api.observe(main),stopInner=api.observe(svg);
    await probe.settle();
    check(writes.get(svg)>0 && writes.get(peer)>0,'Observed equations execute real browser rendering.');
    check(kept(svg,source) && kept(peer,other),'Initial observation preserves exact TeX and title, including BOM, CRLF, tab and XML metacharacters.');

    stopOuter();stopOuter();
    const sharedBefore=writes.get(svg),peerBefore=writes.get(peer);
    bump();document.fonts.dispatchEvent(new Event('loadingdone'));
    await probe.settle();
    check(writes.get(svg)>sharedBefore,'Cleaning one overlapping observation leaves the other subscription active.');
    check(writes.get(peer)===peerBefore,'Cleaning an observation releases equations with no remaining subscriber.');
    check(kept(svg,source),'The remaining subscriber preserves the authored source.');

    const edited=source+'\r\n+z';
    svg.setAttribute('aria-label',edited);
    bump();window.dispatchEvent(new Event('resize'));
    await probe.settle();
    check(kept(svg,edited),'A queued refresh reads the currently authored TeX rather than a captured earlier source.');

    bump();window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('beforeprint'));
    check(kept(svg,edited),'Printing preserves the exact current TeX.');
    window.dispatchEvent(new Event('afterprint'));
    await probe.settle();
    check(kept(svg,edited),'Leaving print preserves the exact current TeX.');
    check(kept(diagnostic,alternative) && diagnostic.getAttribute('data-tex-utf16')===carrier &&
      carrier.match(/.{4}/g).map(value=>String.fromCharCode(parseInt(value,16))).join('')===malformed,
      'Observation and print retain every malformed UTF-16 source code unit in its diagnostic carrier.');

    svg.remove();window.dispatchEvent(new Event('resize'));await probe.settle();
    first.append(svg);const detachedBefore=writes.get(svg);
    bump();window.dispatchEvent(new Event('resize'));await probe.settle();
    check(writes.get(svg)>detachedBefore && kept(svg,edited),'A live subscription survives temporary detachment without losing its source.');

    bump();window.dispatchEvent(new Event('resize'));
    const staleListeners=probe.listeners.map(entry=>entry.callback),staleResizes=probe.resizes.map(observer=>observer.callback),
      staleMutations=probe.mutations.map(observer=>observer.callback);
    stopInner();stopInner();
    check(activeResources()===0,'Final cleanup removes window, font, media and print listeners, disconnects document observers and cancels queued work.');
    const releasedBefore=writes.get(svg);
    for(const callback of staleListeners)if(typeof callback==='function')callback(new Event('change'));
    for(const callback of staleResizes)callback([]);
    for(const callback of staleMutations)callback([{target:first}]);
    await probe.settle();
    check(writes.get(svg)===releasedBefore && activeResources()===0,'Callbacks queued before disposal cannot revive a disposed observation.');

    const stopAgain=api.observe(svg);stopOuter();stopInner();
    const againBefore=writes.get(svg);
    bump();document.fonts.dispatchEvent(new Event('loadingdone'));await probe.settle();
    check(writes.get(svg)>againBefore && kept(svg,edited),'A new observation works after final cleanup and old cleanups cannot disable it.');
    stopAgain();
    check(activeResources()===0,'The replacement document observation also tears down completely.');
    const linked=insert(second,String.raw`\href{https://example.com/math}{x}`);
    linked.querySelector('a').focus();
    api.fit(linked);
    check(document.activeElement===linked.querySelector('a') && document.activeElement.getAttribute('href')==='https://example.com/math',
      'Fitting retains keyboard focus on the same authored link destination.');
    return {checks:checks.length,failures,sourceCustody:'BOM, CRLF, tab, XML metacharacters, current source, malformed UTF-16',
      lifecycle:'overlap, partial release, print, detachment, final disposal, stale callbacks, idempotence, reobservation'};
  });
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const bundle=process.argv[2]?await readFile(resolve(process.argv[2]),'utf8'):
    '(function(){\n"use strict";\n'+(await Promise.all(['font','symbols','parser','layout','fallbacks','responsive','browser','api']
      .map(name=>readFile(resolve(root,'math',name+'.js'),'utf8')))).join('\n')+'\n})();\n';
  const {chromium}=await import(process.env.RAPIER_MATH_PLAYWRIGHT || 'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.RAPIER_MATH_BROWSER?{executablePath:process.env.RAPIER_MATH_BROWSER}:{})});
  try {
    const page=await browser.newPage();
    const result=await verifyMathObservers(page,bundle);
    console.log(JSON.stringify({node:process.version,browser:browser.version(),sha256:createHash('sha256').update(bundle).digest('hex'),...result}));
    assert.deepEqual(result.failures,[],'Math observer/source custody failures');
  } finally {await browser.close();}
}
