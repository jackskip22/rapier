// SPDX-License-Identifier: AGPL-3.0-only
// Original-owner byte receipts plus real DOM Word round trips. No appearance metrics.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
export async function renderCorpusCells(renderer,{word=true}={}) {
  if(word)await renderCorpusCells(renderer,{word:false});
  const rows=JSON.parse(await readFile(new URL('./render-corpus.json',import.meta.url),'utf8'));
  const baseline=JSON.parse(await readFile(new URL('./render-baseline.json',import.meta.url),'utf8'));
  assert.deepEqual(rows.map(row=>row.name),baseline.cases.map(row=>row.name));
  const records=await renderer.withPage(async({evaluate})=>{
    const records=[];
    for(const row of rows) {
      try { records.push(await evaluate(`(async()=>{
        const input=${JSON.stringify({...row,source:row.text,filename:row.name+'.md'})};
        const semantic=await RapierServerRenderer.render({...input,format:'semantic'});
        if(!${JSON.stringify(word)})return {name:input.name,semantic:semantic.html};
        const snapshot=html=>{
          const root=document.createElement('div');root.innerHTML=html;
          // The renderer's source-only softbreak carrier is a word separator, not an authored word-joiner.
          for(const carrier of root.querySelectorAll('.rapier-source-token--softbreak'))carrier.replaceWith(document.createTextNode(' '));
          const text=node=>node.textContent.replace(/\\s+/g,' ').trim();
          return {headings:[...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(node=>[node.tagName,text(node)]),
            cells:[...root.querySelectorAll('th,td')].map(text)};
        };
        let exported;try {exported=await RapierServerRenderer.render({...input,format:'docx'});}
        catch(error) {if(error.code==='IMAGE_JXL_UNREADABLE' && input.source.includes('data:image/jxl;base64,'))return {name:input.name,semantic:semantic.html,refused:error.code};throw error;}
        const imported=await RapierServerRenderer.readWord(exported.base64);
        if(!exported.base64.startsWith('UEsD'))throw new Error('Word export is not a ZIP package');
        return {name:input.name,semantic:semantic.html,expected:snapshot(semantic.html),actual:snapshot(imported.html)};
      })()`)); } catch(error) { throw new Error(row.name+': '+(error.cause || error.stack),{cause:error}); }
    }
    return records;
  });
  const whole=createHash('sha256');
  for(let i=0;i<records.length;i++) {
    const row=records[i];if(!word)assert.equal(digest(row.semantic),baseline.cases[i].sha256,row.name+': original Markdown owner HTML bytes');
    whole.update(String(Buffer.byteLength(row.semantic))+':'+row.semantic);
    if(row.refused)assert.equal(row.refused,'IMAGE_JXL_UNREADABLE');
    else if(word)assert.deepEqual(row.actual,row.expected,row.name+': Word headings and table-cell words round trip through the actual owner');
  }
  if(!word)assert.equal(whole.digest('hex'),baseline.sha256);
  return {cases:records.length,semanticIdentity:baseline.sha256,wordRoundTrips:word ? records.filter(row=>!row.refused).length : 0, codecRefusals:records.filter(row=>row.refused).map(row=>({name:row.name,reason:row.refused}))};
}
