// SPDX-License-Identifier: AGPL-3.0-only
const closeFrames=value=>{for(const row of value?.surfaces??[value])row?.display?.bitmap?.close();};
export function createWorkerClient({postMessage,terminate=()=>{}}){
 let serial=0,closed=false,failure=null,failureListener=null;const pending=new Map();
 const fail=error=>{if(failure)return;failure=error;for(const job of pending.values()){job.cleanup?.();job.reject(error);}pending.clear();failureListener?.(error);};
 return {
  watchFailure(listener){failureListener=listener;if(failure)listener(failure);},
  request(operation,payload={},transfer=[],onProgress=null,{signal}={}){
   if(failure)return Promise.reject(failure);
   if(closed)return Promise.reject(new Error('The painter is closed'));
   if(signal?.aborted)return Promise.reject(Object.assign(new Error('Painting canceled'),{name:'AbortError'}));
   const id=++serial;return new Promise((resolve,reject)=>{
    const abort=()=>postMessage({operation:'cancel',requestId:id}),cleanup=()=>signal?.removeEventListener('abort',abort);
    pending.set(id,{resolve,reject,onProgress,cleanup,abort});signal?.addEventListener('abort',abort,{once:true});
    try{postMessage({...payload,id,operation,progress:typeof onProgress==='function'},transfer);}catch(error){pending.delete(id);cleanup();reject(error);}
   });
  },
  receive(message){if(message?.capture)globalThis.__rapierWaterCaptureLost=message.capture;if(closed){closeFrames(message?.value);return false;}if(message?.failure){fail(Object.assign(new Error(message.failure.message),message.failure));return true;}if(message?.displayState){this.onDisplay?.(message.displayState);return true;}const job=pending.get(message?.id);if(!job){closeFrames(message?.value);return false;}if(message.progress){job.onProgress?.(message.value);return true;}pending.delete(message.id);job.cleanup?.();if(message.error)job.reject(Object.assign(new Error(message.error.message),message.error,{recoverable:message.recoverable===true}));else job.resolve(message.value);return true;},
  fail,async close(){closed=true;failureListener=null;for(const job of pending.values())job.abort?.();fail(new Error('The painter is closed'));await terminate();}
 };
}
