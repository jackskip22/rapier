import {fail, generation} from './core.mjs';

export async function browserTree(rootHandle) {
  if (!rootHandle || rootHandle.kind !== 'directory') throw fail('not_directory');
  let active=true,serial=0,bodyReserved=0,inflight=0;
  const bounded = operation => async (...args) => {
    if (!active) throw fail('revoked');
    if (inflight >= 32) throw fail('request_limit');
    inflight++;
    try { return await operation(...args); } finally { inflight--; }
  };
  const pins=new Map(),cursors=new Map(),listingWork=new Set();
  const metrics={entries:0,bodyReads:0,bodyBytes:0,pinsPeak:0};
  async function current(mode = 'read') {
    if(!active) throw fail('revoked');
    if(typeof rootHandle.queryPermission!=='function' ||
      await rootHandle.queryPermission({mode})!=='granted') throw fail('unavailable');
    if(!active) throw fail('revoked');
  }
  const check=signal=>{if(signal?.aborted)throw fail('cancelled');if(!active)throw fail('revoked');};
  function pathParts(path) {
    if(typeof path!=='string'||path.length>8192||path.includes('\\'))throw fail('invalid_path');
    const parts=path?path.split('/'):[];
    if(parts.length>64||parts.some(p=>!p||p==='.'||p==='..'||/[\0\ud800-\udfff]/u.test(p)))throw fail('invalid_path');
    return parts;
  }
  async function exactChild(parent,name) {
    let handle;
    try {handle=await parent.getFileHandle(name);}
    catch(error){if(error.name!=='TypeMismatchError')throw error;handle=await parent.getDirectoryHandle(name);}
    if(handle.name!==name)throw fail('ambiguous_name');
    return handle;
  }
  async function resolve(path) {
    await current();let handle=rootHandle;
    for(const name of pathParts(path)){handle=await exactChild(handle,name);await current();}
    const found=await rootHandle.resolve(handle);
    if(!found||found.join('/')!==path)throw fail('stale_locator');
    await current();return handle;
  }
  const metadata = file => ({size:file.size, version:file.size + ':' + file.lastModified});
  async function pin(handle,path) {
    const info = handle.kind === 'file' ? metadata(await handle.getFile()) : {size:0,version:''};
    const parents=[];
    for (let parts=pathParts(path).slice(0,-1), i=1;i<=parts.length;i++) {
      const path=parts.slice(0,i).join('/'); parents.push({path,handle:await resolve(path)});
    }
    check();
    if(pins.size>=256)throw fail('pin_limit');
    const id=String(++serial),row=Object.freeze({id,name:handle.name,kind:handle.kind,displayPath:path,...info});
    pins.set(id,{handle,path,parents});metrics.pinsPeak=Math.max(metrics.pinsPeak,pins.size);return row;
  }
  async function parentOf(row) {
    const saved=pins.get(row.id);if(!saved)throw fail('stale_locator');
    await current();
    for(const parent of saved.parents)if(!await (await resolve(parent.path)).isSameEntry(parent.handle))throw fail('stale_locator');
    return saved.parents.at(-1)?.handle || rootHandle;
  }
  async function validate(row) {
    const saved=pins.get(row.id);if(!saved)throw fail('stale_locator');
    await parentOf(row);
    const now=await resolve(saved.path);
    if(!await now.isSameEntry(saved.handle))throw fail('stale_locator');
    await current();return now;
  }
  await current();
  const root=await pin(rootHandle,'');
  const api = {root,capabilities:Object.freeze({conditionalCommit:false,checkedSave:true,verifiedWriteBack:true,
    pinnedIdentity:false,confinedRead:true,boundedEnumeration:false,coherentRead:false,parentAnchored:true,provider:'browser'}),
    async lookup(path){return pin(await resolve(path),path);},
    async retain(row,{forSave=false}={}){
      if(!forSave)return pin(await validate(row),row.displayPath);
      await parentOf(row);check();
      if(pins.size>=256)throw fail('pin_limit');
      const id=String(++serial),saved=pins.get(row.id);if(!saved)throw fail('stale_locator');
      pins.set(id,saved);return Object.freeze({...row,id});
    },
    async release(rows){for(const row of rows)if(row!==root)pins.delete(row.id);},
    async validate(row){const handle=await validate(row);return handle.kind==='file'?metadata(await handle.getFile()):{size:0,version:''};},
    async relative(row,path){await validate(row);const entry=await pin(await resolve(path),path);try{await validate(row);return entry;}catch(error){pins.delete(entry.id);throw error;}},
    async listStart(row){
      const handle=await validate(row);if(handle.kind!=='directory')throw fail('not_directory');
      if(listingWork.size>=4)throw fail('cursor_limit');
      const id=String(++serial),cursor={row,iterator:handle.entries(),closed:false,busy:false};
      cursors.set(id,cursor);listingWork.add(cursor);return id;
    },
    async listNext(id,limit){
      if(!Number.isInteger(limit)||limit<1||limit>128)throw fail('invalid_limit');
      const cursor=cursors.get(id);if(!cursor||cursor.closed)throw fail('stale_cursor');
      if(cursor.busy)throw fail('request_limit');cursor.busy=true;
      const entries=[];let done=false;
      try{
        await validate(cursor.row);
        for(let n=0;n<limit;n++){
          await current();if(cursor.closed)throw fail('cancelled');
          const next=await cursor.iterator.next();await current();if(cursor.closed)throw fail('cancelled');
          if(next.done){done=true;break;}
          const [name,handle]=next.value;
          if(name!==handle.name)throw fail('ambiguous_name');
          pathParts(name);
          const entry=await pin(handle,[cursor.row.displayPath,name].filter(Boolean).join('/'));
          if(cursor.closed){pins.delete(entry.id);throw fail('cancelled');}
          entries.push(entry);metrics.entries++;
        }
        return {entries,done};
      }catch(error){for(const row of entries)pins.delete(row.id);throw error;}
      finally{cursor.busy=false;if(cursor.closed)listingWork.delete(cursor);}
    },
    async listClose(id){
      const cursor=cursors.get(id);cursors.delete(id);if(!cursor)return;
      cursor.closed=true;if(!cursor.busy)listingWork.delete(cursor);
      Promise.resolve(cursor.iterator.return?.()).catch(()=>{});
    },
    async read(row,{signal,maxBytes=64*1024*1024}={}){
      check(signal);
      if(!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes>64*1024*1024)throw fail('too_large');
      const handle=await validate(row);if(handle.kind!=='file')throw fail('not_file');
      const file=await handle.getFile();check(signal);
      if(file.size>maxBytes)throw fail('too_large');
      if(bodyReserved+file.size>64*1024*1024)throw fail('read_limit');
      bodyReserved+=file.size;
      try {
      const bytes=new Uint8Array(file.size);
      for(let at=0;at<file.size;at+=65536){
        check(signal);const chunk=new Uint8Array(await file.slice(at,at+65536).arrayBuffer());check(signal);
        if(chunk.length!==Math.min(65536,file.size-at))throw fail('changed_during_read');
        bytes.set(chunk,at);metrics.bodyReads++;metrics.bodyBytes+=chunk.length;
      }
      const after=await (await validate(row)).getFile();
      if(metadata(after).version!==metadata(file).version)throw fail('changed_during_read');
      check(signal);return bytes;
      } finally {bodyReserved-=file.size;}
    },
    async save(row,bytes,expected,{signal}={}){
      check(signal);await current('readwrite');
      const saved=pins.get(row.id);if(!saved)throw fail('stale_locator');
      const parent=await parentOf(row);
      const matches=async(handle,want)=>{
        const file=await handle.getFile();check(signal);
        if(file.size!==want.size||metadata(file).version!==want.version)return false;
        const content=new Uint8Array(await file.arrayBuffer());check(signal);
        return (await generation(content)).split(':')[1]===want.digest&&metadata(await handle.getFile()).version===want.version;
      };
      let handle,matched=false;
      try{handle=await validate(row);matched=await matches(handle,expected);}
      catch(error){if(!['stale_locator','NotFoundError','NotReadableError'].includes(error.code||error.name))throw error;}
      const digest=(await generation(bytes)).split(':')[1];
      if(matched&&digest===expected.digest)return {status:'unchanged',metadata:expected};
      let stream;
      try{
        if(matched){
          stream=await handle.createWritable({mode:'exclusive'});
          try{matched=await matches(await validate(row),expected);}
          catch(error){if(!['stale_locator','NotFoundError','NotReadableError'].includes(error.code||error.name))throw error;matched=false;}
          if(!matched){await stream.abort();stream=null;}
        }
        let name=row.name;
        if(!matched){
          const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
          for(let n=1;n<1000;n++){
            name=stem+(n===1?' (edited)':' (edited '+n+')')+ext;
            try{await parent.getFileHandle(name);continue;}catch(error){if(error.name==='TypeMismatchError')continue;if(error.name!=='NotFoundError')throw error;}
            handle=await parent.getFileHandle(name,{create:true});
            const empty=await handle.getFile();
            if(empty.size!==0)continue;
            stream=await handle.createWritable({mode:'exclusive',keepExistingData:true});
            if(!await matches(handle,{...metadata(empty),digest:(await generation(new Uint8Array())).split(':')[1]})){
              await stream.abort();stream=null;continue;
            }
            break;
          }
          if(!stream)throw fail('copy_name_limit');
        }
        await parentOf(row);check(signal);await current('readwrite');
        await stream.write(bytes);check(signal);await stream.truncate(bytes.length);await stream.close();stream=null;
        await parentOf(row);check(signal);
        if(!await (await parent.getFileHandle(name)).isSameEntry(handle))throw fail('write_unverified');
        const file=await handle.getFile(),content=new Uint8Array(await file.arrayBuffer());
        if(content.length!==bytes.length||!content.every((v,i)=>v===bytes[i]))throw fail('write_unverified');
        if(!matched)return {status:'kept-both',destinationName:name};
        return {status:'saved',metadata:metadata(file),destinationName:name};
      }finally{if(stream)await stream.abort().catch(()=>{});}
    },
    stats(){return {...metrics,pins:pins.size,cursors:cursors.size,pendingBodyBytes:bodyReserved,pendingRequests:inflight};},
    async close(){
      if(!active)return;active=false;pins.clear();
      const all=[...cursors.values()];cursors.clear();
      for(const c of all){c.closed=true;Promise.resolve(c.iterator.return?.()).catch(()=>{});if(!c.busy)listingWork.delete(c);}
    }
  };
  for (const name of ['lookup','retain','validate','relative','listStart','listNext','read','save']) api[name] = bounded(api[name]);
  return Object.freeze(api);
}

