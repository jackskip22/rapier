// SPDX-License-Identifier: AGPL-3.0-only
// Notes owns projection, bags, ranking and literal confirmation. The filesystem owns
// freshness. Checkpoints contain bodyless projections, each bound to exact file bytes.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {relative,dirname,resolve} from 'node:path';
import {beginSearchIndex,hydrateSearchIndex,stepSearchIndex,packSearchProjection,unpackSearchProjection,search,confirmSearch} from '../notes/search.mjs';
import {searchCacheVersion} from '../tools/search-cache-version.mjs';
import acorn from '../agent/vendor/acorn.mjs';
import '../agent/markdown-server.mjs';

export async function searchFingerprint() {
  const root=fileURLToPath(new URL('../',import.meta.url)),sources=new Map();
  const visit=async file=>{
    if(sources.has(file))return;const text=await readFile(file,'utf8');sources.set(file,text);
    const tree=acorn.parse(text,{ecmaVersion:'latest',sourceType:'module'});
    for(const node of tree.body)if(['ImportDeclaration','ExportAllDeclaration','ExportNamedDeclaration'].includes(node.type) && node.source?.value.startsWith('.'))await visit(resolve(dirname(file),node.source.value));
  };
  await visit(fileURLToPath(new URL('../notes/search.mjs',import.meta.url)));
  await visit(fileURLToPath(new URL('../agent/markdown-server.mjs',import.meta.url)));
  return searchCacheVersion([...sources].map(([name,text])=>[relative(root,name),text]).sort(([a],[b])=>a.localeCompare(b)));
}
export class FolderSearch {
  constructor(store,fingerprint) {this.store=store;this.fingerprint=fingerprint;this.pending=Promise.resolve();}
  async query(question,{limit=50}={}) {
    const result=this.pending.then(()=>this.run(question,limit));this.pending=result.catch(()=>{});return result;
  }
  async run(question,limit) {
    const files=await this.store.scan(),texts=new Map(files.map(row=>[row.name,row.text]));
    let checkpoint=null;
    try{checkpoint=await this.store.readPrivate('search.json',true);}catch(error){if(!(error instanceof SyntaxError))throw error;}
    const cached=checkpoint?.fingerprint===this.fingerprint && Array.isArray(checkpoint.rows) ? new Map(checkpoint.rows) : new Map();
    const changed=new Map(),reuse=[];const metadata={notes:Object.fromEntries(files.map(row=>[row.name,{modified:row.stat.mtimeMs,created:row.stat.birthtimeMs || row.stat.mtimeMs}]))};
    for(const row of files) {
      const previous=cached.get(row.name),projection=previous?.hash===row.hash ? unpackSearchProjection(previous.projection) : null;
      if(projection)reuse.push({file:row.name,projection:{search:projection}});else changed.set(row.name,row.text);
    }
    let state=hydrateSearchIndex(beginSearchIndex(changed,metadata),reuse,{own:true});
    while(!state.done){state=stepSearchIndex(state,{notes:64,own:true});await new Promise(resolve=>setImmediate(resolve));}
    const rows=files.map(row=>[row.name,{hash:row.hash,projection:packSearchProjection(state.index.notes.get(row.name))}]);
    if(changed.size || cached.size!==files.length || checkpoint?.fingerprint!==this.fingerprint)await this.store.writePrivate('search.json',{fingerprint:this.fingerprint,rows});
    return confirmSearch(search(state.index,question,{limit}),texts);
  }
}
