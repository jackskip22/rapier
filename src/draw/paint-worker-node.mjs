// SPDX-License-Identifier: AGPL-3.0-only
// Development transport only; browser bundles never import node:worker_threads.
import {Worker, parentPort, workerData, isMainThread} from 'node:worker_threads';
import {createPaintWorker,createPaintWorkerClient} from './paint-worker.mjs';
import {installPaintRowWorker} from './paint-parallel.mjs';
if(!isMainThread) {
 if(workerData?.row) {
  const scope={postMessage:message=>parentPort.postMessage(message)};
  installPaintRowWorker(scope); parentPort.on('message',data=>scope.onmessage({data}));
 } else {
  const receive=createPaintWorker({isolated:true,postMessage:(m,t)=>parentPort.postMessage(m,t),spawnRows:openNodePaintRow});
  parentPort.on('message',receive);
 }
}
export function openNodePaintRow(init) {
 return new Promise((resolve,reject)=> {
  const worker=new Worker(new URL(import.meta.url),{workerData:{row:true},execArgv:[]});
  const timer=setTimeout(()=>{worker.terminate();reject(new Error('Paint row startup timed out'));},15000);
  worker.once('error',error=>{clearTimeout(timer);worker.terminate();reject(error);});
  worker.once('message',message=>{clearTimeout(timer);if(message.ready)resolve(worker);else {worker.terminate();reject(new Error(message.error||'Paint row not ready'));}});
  worker.postMessage({operation:'init',...init});
 });
}
export async function openNodePaintWorker(options={}) {
 const worker=new Worker(new URL(import.meta.url),{execArgv:[]});
 const client=createPaintWorkerClient({postMessage:(m,t)=>worker.postMessage(m,t),terminate:()=>worker.terminate()});
 worker.on('message',message=>client.receive(message)); worker.on('error',error=>client.fail(error)); worker.on('exit',code=>{client.fail(new Error('Paint worker exited: '+code));});
 try { await client.request('configure',options); return client; } catch(error) {await client.close();throw error;}
}
