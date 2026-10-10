// SPDX-License-Identifier: AGPL-3.0-only
// Exact HTML source custody plus document heading/cell data through the real HTML and Word owners.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readSharedPage} from '../../tools/read-shared-page.mjs';
export async function renderCorpusCells(renderer,{word=true}={}) {
  const rows=JSON.parse(await readFile(new URL('./render-corpus.json',import.meta.url),'utf8'));
  const malformed='```mermaid\nflowchart TD\nA[missing delimiter\n```\n';
  const unclosed='# Diagram\n\n```mermaid\nflowchart TD\nA --> B\n\nTrailing authored source.\n';
  const {records,diagram}=await renderer.withPage(async({evaluate})=>{
    const records=[];
    for(const row of rows) {
      try { const record=await evaluate(`(async()=>{
        const input=${JSON.stringify({...row,source:row.text,filename:row.name+'.md'})};
        const semantic=await RapierServerRenderer.render({...input,format:'semantic'});
        const snapshot=html=>{
          const root=document.createElement('div');root.innerHTML=html;
          // The renderer's source-only softbreak carrier is a word separator, not an authored word-joiner.
          for(const carrier of root.querySelectorAll('.rapier-source-token--softbreak'))carrier.replaceWith(document.createTextNode(' '));
          const text=node=>node.textContent.replace(/\\s+/g,' ').trim();
          return {headings:[...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(node=>[node.tagName,text(node)]),
            cells:[...root.querySelectorAll('th,td')].map(text)};
        };
        const page=await RapierServerRenderer.render({...input,format:'html'});
        const template=document.createElement('template');template.innerHTML=page.html;
        const main=template.content.querySelector('main.rapier-page');
        if(!main)throw new Error('HTML export lost its document');
        const record={name:input.name,page:page.html,filename:page.filename,expected:snapshot(semantic.html),html:snapshot(main.innerHTML)};
        if(!${JSON.stringify(word)})return record;
        let exported;try {exported=await RapierServerRenderer.render({...input,format:'docx'});}
        catch(error) {if(error.code==='IMAGE_JXL_UNREADABLE' && input.source.includes('data:image/jxl;base64,'))return {...record,refused:error.code};throw error;}
        const imported=await RapierServerRenderer.readWord(exported.base64);
        if(!exported.base64.startsWith('UEsD'))throw new Error('Word export is not a ZIP package');
        return {...record,actual:snapshot(imported.html)};
      })()`);
        assert.equal(readSharedPage(record.page),row.text,row.name+': HTML source bytes including BOM survive the actual server writer and client reader');
        assert.equal(record.filename,row.name+'.html',row.name+': HTML artifact filename');
        delete record.page;
        records.push(record);
      } catch(error) { throw new Error(row.name+': '+(error.cause || error.stack),{cause:error}); }
    }
    const diagram=await evaluate(`(async()=>{
      let refusal=null;
      try {await RapierServerRenderer.render({source:${JSON.stringify(malformed)},filename:'malformed.md',format:'html'});}
      catch(error) {refusal=error.code || error.message;}
      const page=await RapierServerRenderer.render({source:${JSON.stringify(unclosed)},filename:'unclosed.md',format:'html'});
      return {refusal,page:page.html};
    })()`);
    return {records,diagram};
  });
  for(const row of records) {
    assert.deepEqual(row.html,row.expected,row.name+': HTML headings and table-cell data survive projection');
    if(row.refused)assert.equal(row.refused,'IMAGE_JXL_UNREADABLE');
    else if(word)assert.deepEqual(row.actual,row.expected,row.name+': Word headings and table-cell words round trip through the actual owner');
  }
  assert.equal(diagram.refusal,'EXPORT_DIAGRAM_UNAVAILABLE','Malformed completed diagrams cannot become an incomplete offline page');
  assert.equal(readSharedPage(diagram.page),unclosed,'An unfinished diagram fence retains every source byte including following prose');
  return {cases:records.length,htmlSourceRoundTrips:records.length,diagramRefusals:1,unclosedSourceRoundTrips:1,
    wordRoundTrips:word ? records.filter(row=>!row.refused).length : 0, codecRefusals:records.filter(row=>row.refused).map(row=>({name:row.name,reason:row.refused}))};
}
