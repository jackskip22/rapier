// SPDX-License-Identifier: AGPL-3.0-only
const PDF_LIMITS = Object.freeze({bytes: 25 * 1024 * 1024, textPages: 4096,
  imagePages: 256, textItems: 1000000, pageTextCharacters: 4 * 1024 * 1024, pagePixels: 4 * 1024 * 1024,
  pageSide: 4096, sourceImagePixels: 16 * 1024 * 1024,
  temporaryCanvasPixels: 16 * 1024 * 1024, rasterBytes: 20 * 1024 * 1024, operationMs: 45000});
const escape = value => String(value ?? '').replace(/[&<>"']/g,
  c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const failure = (message, code) => Object.assign(new Error(message), {code});
const median = values => { const a = values.slice().sort((a, b) => a - b); return a[a.length >> 1] || 0; };
const multiply = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
  a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
const identity = () => [1, 0, 0, 1, 0, 0];
const point = (m, x, y) => [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
function rectangle(m, x1, y1, x2, y2) {
  const p = [point(m,x1,y1),point(m,x1,y2),point(m,x2,y1),point(m,x2,y2)];
  const x = Math.min(...p.map(p=>p[0])), y = Math.min(...p.map(p=>p[1]));
  return {x, y, w: Math.max(...p.map(p=>p[0]))-x, h: Math.max(...p.map(p=>p[1]))-y};
}
const bounds = rows => rows.reduce((b, r) => ({x: Math.min(b.x,r.x), y: Math.min(b.y,r.y),
  right: Math.max(b.right,r.x+r.w), bottom: Math.max(b.bottom,r.y+r.h)}), {x:Infinity,y:Infinity,right:-Infinity,bottom:-Infinity});
const overlaps = (a, b) => Math.max(0, Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)) *
  Math.max(0, Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
const willLine = text => /^<!-- ?(?:will\/|\/will)/.test(text);
const sourceToken = text => '<span class="rapier-source-token" data-rapier-source="' + escape(encodeURIComponent(text)) +
  '" data-rapier-visible="' + escape(encodeURIComponent(text)) + '">' + escape(text) + '</span>';
const plain = lines => lines.map(l=>l.runs.map(r=>r.str).join('')).join(' ').trim();
const listMarker = text => /^(?:(\d{1,9})[.)]\s+|[•◦▪●○‣](?:\s+|$)|[*+\-–]\s+)/.exec(text);
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
function separator(left, right, wrapped = false) {
  if (!left || !right || /\s$/.test(left) || /^\s/.test(right)) return '';
  if (wrapped && /[-\u2010\u00ad]$/.test(left) && /^\p{L}/u.test(right)) return '';
  if (cjk.test(left.at(-1)) && cjk.test(right[0])) return '';
  return ' ';
}

function linesFrom(runs) {
  const horizontal = runs.filter(r=>!r.vertical), vertical = runs.filter(r=>r.vertical), lines = [];
  for (const [items, isVertical] of [[horizontal,false],[vertical,true]]) {
    items.sort((a,b)=>a.order-b.order);
    const bands=[];
    for (const [i,r] of items.entries()) {
      const next=items[i+1];
      const label=next&&/^[*†‡]$/.test(r.str.trim())&&r.size<next.size*.8&&
        Math.abs(next.x-r.x-r.w)<1&&Math.abs(next.baseline-r.baseline)<next.size*.6;
      const axis = isVertical ? r.x : label?next.baseline:r.baseline;
      let band=bands.filter(b=>{
        const mixed=Math.abs(r.size-b.size)>Math.max(r.size,b.size)*.15;
        return Math.abs(axis-b.axis)<=(mixed?Math.max(r.size,b.size)*.6:1)&&
          (!mixed||isVertical||b.runs.some(t=>r.x<=t.x+t.w+b.size*2&&r.x+r.w>=t.x-b.size*2));
      }).sort((a,b)=>Math.abs(axis-a.axis)-Math.abs(axis-b.axis))[0];
      if (!band) {
        band = {axis, size:r.size, runs: [], vertical:isVertical}; bands.push(band);
      }
      if(r.size>band.size){band.axis=axis;band.size=r.size;}
      band.runs.push(r);
    }
    lines.push(...bands.sort(isVertical?(a,b)=>b.axis-a.axis:(a,b)=>a.axis-b.axis));
  }
  for (const line of lines) {
    line.rtl = line.runs.reduce((n,r)=>n+(r.dir==='rtl'?r.str.length:-r.str.length),0)>0;
    line.runs.sort(line.vertical ? (a,b)=>a.y-b.y : line.rtl ? (a,b)=>b.x-a.x || a.order-b.order : (a,b)=>a.x-b.x || a.order-b.order);
    if(!line.vertical&&!line.rtl)for(let i=0;i<line.runs.length;){
      let end=i+1,right=line.runs[i].x+line.runs[i].w;
      while(end<line.runs.length&&line.runs[end].x<right-.2){right=Math.max(right,line.runs[end].x+line.runs[end].w);end++;}
      line.runs.splice(i,end-i,...line.runs.slice(i,end).sort((a,b)=>a.order-b.order));i=end;
    }
    const b=bounds(line.runs);Object.assign(line,{x:b.x,y:b.y,w:b.right-b.x,h:b.bottom-b.y,
      size:line.runs.reduce((a,b)=>a.str.length>=b.str.length?a:b).size});
  }
  return lines;
}

function inline(line, {code = false, strip = 0} = {}) {
  let html='', last=null, text='';
  for (const run of line.runs) {
    let value=run.str;
    if (strip) {const n=Math.min(strip,value.length);value=value.slice(n);strip-=n;}
    if (!value) continue;
    const gap=last && (line.vertical ? run.y-last.y-last.h : line.rtl ? last.x-run.x-run.w : run.x-last.x-last.w);
    const space=last && gap>run.size*.12 ? separator(text,value) : '';
    let part=escape(value.replace(/\u00ad$/u,''));
    if (!code && run.mono) part='<code>'+part+'</code>';
    if (!code && run.link) part='<a href="'+escape(run.link)+'">'+part+'</a>';
    if (!code && run.note) part='<sup class="footnote-ref"><a href="#fn'+run.note+'" id="fnref'+run.note+'">['+run.note+']</a></sup>';
    html+=space+part; text+=space+value;last=run;
  }
  return {html:html.trim(),text:text.trim()};
}

function paragraph(lines, strip = 0) {
  let html='',text='';
  for (let i=0;i<lines.length;i++) {
    const part=inline(lines[i],{strip:i?0:strip});
    const glue=separator(text,part.text,true);
    html+=glue+part.html;text+=glue+part.text;
  }
  return html;
}

function linkRuns(runs, annotations, viewport) {
  const links=[];
  for (const a of annotations) {
    if (a.subtype!=='Link' || !Array.isArray(a.rect)) continue;
    const url=a.url;
    if (typeof url!=='string' || /[\u0000-\u0020\u007f]/.test(url) || !/^(?:https?:|ftps?:|mailto:|tel:|callto:|sms:|xmpp:|matrix:)/i.test(url)) continue;
    links.push({...rectangle(viewport.transform,...a.rect),url});
  }
  return runs.flatMap(run=>{
    const link=links.find(a=>overlaps(run,a)>run.w*run.h*.12);
    if (!link) return [run];
    if (overlaps(run,link)>run.w*run.h*.65 || run.vertical || run.dir==='rtl') return [{...run,link:link.url}];
    let start=Math.round((link.x-run.x)/run.w*run.str.length),end=Math.round((link.x+link.w-run.x)/run.w*run.str.length);
    start=Math.max(0,Math.min(run.str.length,start));end=Math.max(start,Math.min(run.str.length,end));
    while(start>0 && /\S/.test(run.str[start-1]) && /\S/.test(run.str[start]||''))start--;
    while(end<run.str.length && /\S/.test(run.str[end]) && /\S/.test(run.str[end-1]||''))end++;
    return [[0,start,null],[start,end,link.url],[end,run.str.length,null]].filter(([a,b])=>a<b).map(([a,b,url])=>
      ({...run,str:run.str.slice(a,b),x:run.x+run.w*a/run.str.length,w:run.w*(b-a)/run.str.length,link:url}));
  });
}

function softHyphens(runs, operators, api) {
  let after=-1;
  for(let i=0;i<operators.fnArray.length;i++){
    if(operators.fnArray[i]!==api.OPS.showText)continue;
    const glyphs=operators.argsArray[i]?.[0];if(!Array.isArray(glyphs))continue;
    const text=glyphs.map(g=>typeof g==='object'?g?.unicode||'':'').join('');
    if(!text.endsWith('\u00ad'))continue;
    const stem=text.slice(0,-1).trim();if(!stem)continue;
    const run=runs.find(r=>r.order>after&&r.str.endsWith(stem));
    if(run){run.str+='\u00ad';after=run.order;}
  }
}

function footnotes(pages) {
  const notes=[];
  const ids=node=>node.type==='content'?[node.id]:(node.children||[]).flatMap(ids);
  for(const page of pages){
    const visit=(node,depth=0)=>{
      if(!node||depth>64)return;
      if(node.role==='Note'||node.role==='FENote'){
        const label=node.children?.find(c=>c.role==='Lbl'), labelIds=label?ids(label):[];
        const labelRuns=page.runs.filter(r=>labelIds.includes(r.id));
        const mark=plain(linesFrom(labelRuns));
        if(/^\d{1,9}$/.test(mark)){
          const content=new Set(ids(node)),runs=page.runs.filter(r=>content.has(r.id)),box=bounds(runs);
          notes.push({page,node,label,labelRuns,mark,runs,box});
        }
      }else for(const child of node.children||[])visit(child,depth+1);
    };visit(page.tree);
  }
  for(const page of pages)for(const a of page.annotations){
    if(a.subtype!=='Link'||!Array.isArray(a.dest)||a.dest[1]?.name!=='XYZ'||!Array.isArray(a.rect))continue;
    const note=notes.find(n=>{
      if(a.dest[0]?.num!==n.page.ref?.num||!Number.isFinite(a.dest[2])||!Number.isFinite(a.dest[3]))return false;
      const [x,y]=point(n.page.transform,a.dest[2],a.dest[3]),b=n.box,pad=n.runs[0]?.size||0;
      return x>=b.x-pad&&x<=b.right+pad&&y>=b.y-pad&&y<=b.bottom+pad;
    });
    if(!note)continue;
    const box=rectangle(page.transform,...a.rect);
    const run=page.runs.find(r=>r.str.trim()===note.mark&&!note.labelRuns.includes(r)&&overlaps(r,box)>r.w*r.h*.5);
    if(run){note.node.note ||= String(notes.indexOf(note)+1);run.note=note.node.note;}
  }
}

function tagBlocks(tree, runs, pictures) {
  const groups=new Map(), used=new Set(), usedPictures=new Set();
  for(const run of runs)if(run.id){if(!groups.has(run.id))groups.set(run.id,[]);groups.get(run.id).push(run);}
  const content=node=>node.type==='content'?[node.id]:(node.children||[]).flatMap(content);
  const items=node=>content(node).flatMap(id=>groups.get(id)||[]);
  const block=(type,node,extra={})=>{
    const values=items(node);for(const r of values)used.add(r);
    const lines=[];let group=[];
    for(const r of values){
      const last=group.at(-1);
      if(last&&(last.eol||Math.abs(r.baseline-last.baseline)>Math.max(r.size,last.size)*.6)){
        lines.push(...linesFrom(group));group=[];
      }
      group.push(r);
    }
    lines.push(...linesFrom(group));
    return {type,lines,tagged:true,...extra};
  };
  let visited=0;
  function visit(node,depth=0) {
    if(++visited>100000 || depth>64)throw failure('The PDF structure is too complex to import.','PDF_TEXT_LIMIT');
    const children=node.children||[], role=node.role||'';
    if(/^H[1-6]$/.test(role))return [block(role.toLowerCase(),node)];
    if(role==='Table'){
      const rows=[];
      const find=n=>{if(n.role==='TR')rows.push(n);else for(const c of n.children||[])find(c);};find(node);
      const cells=rows.map(r=>(r.children||[]).filter(c=>c.role==='TD'||c.role==='TH'));
      if(cells.length>=2 && cells[0].length>=2 && cells[0].length<=24 && cells.every(r=>r.length===cells[0].length && r.every(c=>!(c.colSpan>1||c.rowSpan>1)))) {
        const table=cells.map(row=>row.map(c=>block('p',c)));
        return [{type:'table',cells:table,lines:table.flatMap(r=>r.flatMap(c=>c.lines))}];
      }
      return rows.flatMap(r=>(r.children||[]).flatMap(c=>visit(c,depth+1)));
    }
    if(role==='L')return children.flatMap(c=>visit(c,depth+1));
    if(role==='LI'){
      const label=children.find(c=>c.role==='Lbl');
      const nested=[];
      const withoutLists=n=>({ ...n, children:(n.children||[]).filter(c=>{
        if(c.role==='L'){nested.push(c);return false;}return true;
      }).map(withoutLists)});
      const body=withoutLists({children:children.filter(c=>c.role!=='Lbl')});
      const marker=label?plain(linesFrom(items(label))):'';
      if(label)for(const r of items(label))used.add(r);
      const result=block('li',body,{marker});
      return [result,...nested.flatMap(c=>visit(c,depth+1))];
    }
    if(role==='Figure'){
      const ids=new Set(content(node));
      return pictures.filter(p=>ids.has(p.id)).map(p=>{usedPictures.add(p);return {...p,alt:node.alt||p.alt};});
    }
    if(node.note){
      const label=children.find(c=>c.role==='Lbl');
      if(label)for(const r of items(label))used.add(r);
      return [block('footnote',{children:children.filter(c=>c!==label)},{note:node.note})];
    }
    if(['P','H','Caption','Note','FENote','TD','TH','Code','BlockQuote'].includes(role)){
      if(children.some(c=>c.role==='Figure'))return children.flatMap(c=>visit(c,depth+1));
      return [block(role==='Code'?'code':role==='BlockQuote'?'quote':role==='H'?'heading':'p',node)];
    }
    return children.flatMap(c=>visit(c,depth+1));
  }
  const blocks=visit(tree).filter(b=>b.type==='image'||b.lines?.length);
  if(!pictures.length)blocks.sort((a,b)=>Math.min(...a.lines.flatMap(l=>l.runs.map(r=>r.order)))-Math.min(...b.lines.flatMap(l=>l.runs.map(r=>r.order))));
  for(let i=1;i<blocks.length;i++){
    const a=blocks[i-1],b=blocks[i],left=a.lines?.[0],right=b.lines?.[0];
    if(a.type==='p'&&b.type==='p'&&a.lines.length===1&&b.lines.length===1&&
        /^\d{1,3}$/.test(plain(a.lines))&&/^[a-z]$/.test(plain(b.lines))&&
        Math.abs(left.axis-right.axis)<1&&Math.abs(right.x-left.x-left.w)<left.size*.25){
      a.lines=linesFrom([...left.runs,...right.runs]);blocks.splice(i--,1);
    }
  }
  return {blocks,remaining:runs.filter(r=>!used.has(r)),pictures:pictures.filter(p=>!usedPictures.has(p))};
}

function geometricBlocks(runs, pictures, width, height) {
  const rows=linesFrom(runs), lines=[];
  for(const row of rows){
    if(row.vertical){lines.push(row);continue;}
    let segment=[];
    const flush=()=>{if(segment.length)lines.push(...linesFrom(segment));segment=[];};
    for(const run of row.runs){
      const prior=segment.at(-1);
      const gap=prior && (row.rtl?prior.x-run.x-run.w:run.x-prior.x-prior.w);
      if(gap>Math.max(row.size*1.1,6) && !/^(?:\d{1,9}[.)]|[•◦▪●○‣*+\-–])$/.test(plain([{runs:segment}])))flush();
      segment.push(run);
    }
    flush();
  }
  lines.sort((a,b)=>a.y-b.y||a.x-b.x);
  const blocks=[],tables=[],taken=new Set();
  for(let i=0;i<lines.length;i++){
    if(taken.has(lines[i])||lines[i].vertical)continue;
    const first=lines.filter(l=>!taken.has(l)&&Math.abs(l.y-lines[i].y)<l.size*.4);
    if(first.length<2 || first.length>12 || first.some(l=>listMarker(inline(l).text) || plain([l]).length>48 || plain([l]).split(/\s+/).length>7))continue;
    first.sort((a,b)=>a.x-b.x);
    const grid=[first];let y=first[0].y;
    for(const candidate of lines){
      if(candidate.y<=y+first[0].size*.6 || candidate.y>y+first[0].size*2.2)continue;
      const row=lines.filter(l=>!taken.has(l)&&Math.abs(l.y-candidate.y)<l.size*.4).sort((a,b)=>a.x-b.x);
      if(row.length!==first.length || row.some((l,c)=>Math.abs(l.x-first[c].x)>first[0].size || plain([l]).length>48 || plain([l]).split(/\s+/).length>7))break;
      grid.push(row);y=row[0].y;
    }
    if(grid.length<3)continue;
    grid.flat().forEach(l=>taken.add(l));
    tables.push({type:'table',cells:grid.map(row=>row.map(l=>({lines:[l]}))),lines:grid.flat(),y:grid[0][0].y,h:0});
  }
  const free=lines.filter(l=>!taken.has(l));
  const candidates=free.filter(l=>!l.vertical&&l.w>width*.18&&l.w<width*.58), counts=new Map();
  for(const l of candidates){const x=Math.round(l.x/4);counts.set(x,(counts.get(x)||0)+1);}
  const starts=candidates.filter(l=>counts.get(Math.round(l.x/4))>=(candidates.length<12?2:3)).map(l=>l.x).sort((a,b)=>a-b);
  let cut=null,gap=width*.15;
  for(let i=2;i<starts.length-1;i++)if(starts[i]-starts[i-1]>gap){
    const left=free.filter(l=>l.x<starts[i] && l.x+l.w<starts[i]-l.size);
    if(left.length>=2){gap=starts[i]-starts[i-1];cut=(starts[i]+Math.max(...left.map(l=>l.x+l.w)))/2;}
  }
  const rtl=free.reduce((n,l)=>n+(l.rtl?1:-1),0)>0;
  const ordered=[];
  if(cut!==null){
    const body=documentStyles([{runs}]).body;
    const notes=free.filter(l=>l.y>height*.82&&l.size<body*.95);
    const columns=free.filter(l=>!notes.includes(l));
    const left=columns.filter(l=>l.x+l.w<=cut+l.size),right=columns.filter(l=>l.x>=cut-l.size);
    if(left.length>=2&&right.length>=2){
      const spans=columns.filter(l=>!left.includes(l)&&!right.includes(l)).sort((a,b)=>a.y-b.y);
      let floor=-Infinity;
      for(const span of [...spans,{y:Infinity}]){
        for(const column of rtl?[right,left]:[left,right])ordered.push(...column.filter(l=>l.y>=floor&&l.y<span.y).sort((a,b)=>a.y-b.y));
        if(span.y!==Infinity)ordered.push(span);floor=span.y;
      }
      ordered.push(...notes.sort((a,b)=>a.y-b.y||a.x-b.x));
    }
  }
  if(!ordered.length)ordered.push(...free.sort((a,b)=>a.vertical&&b.vertical?b.x-a.x||a.y-b.y:a.y-b.y||a.x-b.x));
  let current=null;
  for(const line of ordered){
    const marker=listMarker(inline(line).text),previous=current?.lines.at(-1);
    const change=!previous || marker || current.type==='li' && Math.abs(line.x-previous.x)>line.size*2 ||
      Math.abs(line.size-previous.size)>line.size*.1 || line.vertical!==previous.vertical ||
      (!line.vertical&&(line.y-previous.y>line.size*1.65 || line.y<previous.y-line.size || Math.abs(line.x-previous.x)>line.size*2 || current.type!=='li'&&line.x>previous.x+line.size*.6)) ||
      (line.vertical&&Math.abs(line.x-previous.x)>line.size*1.65);
    if(change){current={type:marker?'li':'p',marker:marker?.[0]||'',strip:marker?.[0].length||0,isolated:!previous||line.y-previous.y>line.size*1.5,lines:[]};blocks.push(current);}
    current.lines.push(line);
  }
  for(const picture of [...tables,...pictures]){
    let at=blocks.findIndex(b=>b.lines?.length && b.lines[0].y>=picture.y+picture.h*.5);
    if(at<0)at=blocks.length;blocks.splice(at,0,picture);
  }
  return blocks;
}

function documentStyles(pages) {
  const counts=new Map(),sizes=new Set();
  for(const page of pages)for(const run of page.runs){const size=Math.round(run.size*2)/2;counts.set(size,(counts.get(size)||0)+run.str.length);sizes.add(size);}
  const body=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||12;
  return {body,headings:[...sizes].filter(n=>n>body*1.1).sort((a,b)=>b-a)};
}

function runningMatter(pages) {
  const seen=new Map();
  for(const [index,page] of pages.entries())for(const line of [...linesFrom(page.runs),...page.runs.filter(r=>r.str.length>=6).map(r=>({...r,runs:[r]}))]){
    if(line.y>page.height*.08 && line.y+line.h<page.height*.93)continue;
    let text=inline(line).text;
    if(willLine(text))continue;
    const number=/^(?:(?:page\s*)?\d+(?:\s*(?:of|\/|-)\s*\d+)?|[ivxlcdm]+)$/i.test(text);
    if(number)text='#page';
    const key=(line.y<page.height/2?'top:':'bottom:')+text;
    if(!seen.has(key))seen.set(key,[]);seen.get(key).push({index,line});
  }
  const removed=new Set();
  for(const rows of seen.values())if(new Set(rows.map(r=>r.index)).size>=Math.max(2,Math.ceil(pages.length*.6)))
    for(const {line} of rows)for(const run of line.runs)removed.add(run);
  return removed;
}

function renderBlocks(blocks, styles) {
  const output=[],notes=[];let lists=[],code=null;
  const closeLists=()=>{while(lists.length)output.push('</li></'+lists.pop().tag+'>');};
  const flushCode=()=>{if(code){output.push('<pre><code>'+escape(code.lines.join('\n'))+'\n</code></pre>');code=null;}};
  const listIndents=[];
  for(const b of blocks)if(b.type==='li'&&b.lines.length){const x=b.lines[0].x;if(!listIndents.some(n=>Math.abs(n-x)<b.lines[0].size*.6))listIndents.push(x);}
  listIndents.sort((a,b)=>a-b);
  blocks=blocks.flatMap(b=>{
    if(!b.lines?.some(l=>willLine(inline(l).text)))return [b];
    if(b.type==='table'||b.type==='footnote')return [b];
    const out=[];
    for(const line of b.lines){
      if(willLine(inline(line).text))out.push({type:'will',lines:[line]});
      else if(out.at(-1)?.type===b.type&&out.at(-1)!==b)out.at(-1).lines.push(line);
      else out.push({...b,lines:[line],...(out.length?{strip:0}:{})});
    }
    return out;
  });
  for(const b of blocks){
    if(b.type==='will'){closeLists();flushCode();output.push('<p>'+sourceToken(inline(b.lines[0]).text)+'</p>');continue;}
    if(b.type==='image'){closeLists();flushCode();output.push('<p><img data-rapier-asset="'+b.reference+'" alt="'+escape(b.alt)+'"></p>');continue;}
    if(!b.lines.length)continue;
    if(b.type==='footnote'){
      notes.push('<li id="fn'+b.note+'"><p>'+paragraph(b.lines)+' <a class="footnote-backref" href="#fnref'+b.note+'">↩︎</a></p></li>');continue;
    }
    const text=plain(b.lines),size=median(b.lines.map(l=>l.size));
    const mono=b.lines.every(l=>l.runs.every(r=>r.mono));
    if(b.type==='code'||mono&&!/^h[1-6]$/.test(b.type)){
      closeLists();
      if(!code)code={x:b.lines[0].x,unit:Math.max(1,median(b.lines.flatMap(l=>l.runs.map(r=>r.w/Math.max(1,r.str.length))))),lines:[]};
      for(const line of b.lines)code.lines.push(' '.repeat(Math.max(0,Math.min(120,Math.round((line.x-code.x)/code.unit))))+inline(line,{code:true}).text);
      continue;
    }
    flushCode();
    if(b.type==='li'){
      const match=/^\s*(\d{1,9})[.)]?/.exec(b.marker),tag=match?'ol':'ul';
      const depth=Math.min(16,listIndents.findIndex(n=>Math.abs(n-b.lines[0].x)<b.lines[0].size*.6)+1||1);
      while(lists.length>depth)output.push('</li></'+lists.pop().tag+'>');
      if(lists.length===depth&&lists.at(-1).tag!==tag){output.push('</li></'+lists.pop().tag+'>');}
      if(lists.length===depth)output.push('</li><li>');
      else {output.push('<'+tag+(match&&+match[1]!==1?' start="'+Number(match[1])+'"':'')+'><li>');lists.push({tag});}
      output.push(paragraph(b.lines,b.strip||0));continue;
    }
    closeLists();
    if(b.type==='table'){
      output.push('<table><thead><tr>'+b.cells[0].map(c=>'<th>'+paragraph(c.lines)+'</th>').join('')+'</tr></thead><tbody>'+b.cells.slice(1).map(r=>'<tr>'+r.map(c=>'<td>'+paragraph(c.lines)+'</td>').join('')+'</tr>').join('')+'</tbody></table>');continue;
    }
    let tag=b.type;
    if(tag==='p'&&!b.tagged || tag==='heading'){
      const short=text.length<180&&b.lines.length<=2;
      const rank=styles.headings.findIndex(n=>Math.abs(n-size)<.6);
      if(short&&rank>=0&&(tag==='heading'||b.lines.every(l=>l.runs.every(r=>r.bold))))tag='h'+Math.min(6,rank+1);
      else if(short&&(b.lines.every(l=>l.runs.every(r=>r.bold))||b.isolated&&/^[A-Z\s.IVX]+$/.test(text))&&/^(?:[IVX]+\.|\d+(?:\.\d+)*\.?\s|[A-Z][A-Z\s]+$)/.test(text))tag='h'+Math.min(6,styles.headings.length+1);
      else tag='p';
    }
    if(tag==='quote')tag='blockquote';
    if(!/^(?:p|h[1-6]|blockquote)$/.test(tag))tag='p';
    output.push('<'+tag+(b.lines[0].rtl?' dir="rtl"':'')+'>'+paragraph(b.lines)+'</'+tag+'>');
  }
  closeLists();flushCode();
  if(notes.length)output.push('<section class="footnotes"><ol>'+notes.join('')+'</ol></section>');
  return output.join('\n');
}

async function pagePictures(page, viewport, api, operators, ids, {embedImage, step, checkpoint, limits, stats, setRender}) {
  const pictures=[],stack=[],marks=[],ops=api.OPS;let matrix=identity(), invisible=false;
  for(let i=0;i<operators.fnArray.length;i++){
    await checkpoint();
    const op=operators.fnArray[i],args=operators.argsArray[i]||[];
    if(op===ops.save){stack.push(matrix);continue;}
    if(op===ops.restore){matrix=stack.pop()||identity();continue;}
    if(op===ops.transform){matrix=multiply(matrix,args);continue;}
    if(op===ops.paintFormXObjectBegin){stack.push(matrix);if(args[0])matrix=multiply(matrix,args[0]);continue;}
    if(op===ops.paintFormXObjectEnd){matrix=stack.pop()||identity();continue;}
    if(op===ops.beginMarkedContent||op===ops.beginMarkedContentProps){marks.push({id:ids.get(args[1]),artifact:(args[0]?.name||args[0])==='Artifact'});continue;}
    if(op===ops.endMarkedContent){marks.pop();continue;}
    if(op===ops.setTextRenderingMode && args[0]===3)invisible=true;
    const ref=op===ops.paintImageXObject||op===ops.paintImageXObjectRepeat;
    if(!ref && op!==ops.paintInlineImageXObject)continue;
    if(marks.some(m=>m.artifact))continue;
    const image=ref?await step(new Promise(resolve=>(String(args[0]).startsWith('g_')?page.commonObjs:page.objs).get(args[0],resolve)),'decode a picture'):args[0];
    const transforms=op===ops.paintImageXObjectRepeat?Array.from({length:args[3].length/2},(_,n)=>multiply(matrix,[args[1],0,0,args[2],args[3][n*2],args[3][n*2+1]])):[matrix];
    for(const transform of transforms)pictures.push({image,matrix:multiply(viewport.transform,transform),id:marks.findLast(m=>m.id)?.id});
  }
  const groups=[];
  for(const picture of pictures){
    const box=rectangle(picture.matrix,0,0,1,1);
    if(invisible && box.w*box.h>=viewport.width*viewport.height*.8)continue;
    let group={...box,members:[picture],id:picture.id};
    for(let i=groups.length-1;i>=0;i--){
      const other=groups[i];
      if(group.id&&group.id===other.id || overlaps({...group,x:group.x-3,y:group.y-3,w:group.w+6,h:group.h+6},other)){
        const b=bounds([group,other]);group={x:b.x,y:b.y,w:b.right-b.x,h:b.bottom-b.y,members:[...other.members,...group.members],id:group.id===other.id?group.id:null};groups.splice(i,1);
      }
    }
    groups.push(group);
  }
  const result=[];
  for(const group of groups){
    await checkpoint();
    if(!embedImage)continue;
    const picture=group.members[0],image=picture.image,box=group,composite=group.members.length>1;
    const scale=Math.min(2,(limits.pageSide-1)/Math.max(box.w,box.h),Math.sqrt((limits.pagePixels-limits.pageSide*2)/(box.w*box.h)));
    const width=composite?Math.ceil(box.w*scale):image?.width,height=composite?Math.ceil(box.h*scale):image?.height;
    if(!Number.isSafeInteger(width*height)||width<1||height<1||width*height>limits.sourceImagePixels)
      throw failure('A picture in this PDF exceeds the 16 megapixel decoding limit. The import was stopped.','PDF_IMAGE_SIZE');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    try{
      const context=canvas.getContext('2d');if(!context)throw new Error('PDF import needs a 2D canvas.');
      if(composite){
        const task=page.render({canvas,canvasContext:context,viewport:page.getViewport({scale}),
          transform:[1,0,0,1,-box.x*scale,-box.y*scale],background:'rgba(0,0,0,0)',annotationMode:api.AnnotationMode.DISABLE});
        setRender(task);await step(task.promise,'draw a picture');setRender(null);
      }
      else if(image.bitmap)context.drawImage(image.bitmap,0,0);
      else {
        const rgba=context.createImageData(width,height),data=image.data;
        if(!data)throw new Error('The PDF picture has no decoded pixels.');
        if(image.kind===3)rgba.data.set(data);
        else for(let p=0;p<width*height;p++){
          if(!(p%65536))await checkpoint();
          const at=p*4;
          if(image.kind===2){rgba.data[at]=data[p*3];rgba.data[at+1]=data[p*3+1];rgba.data[at+2]=data[p*3+2];}
          else if(image.kind===1){const row=Math.floor(p/width),col=p%width;rgba.data[at]=rgba.data[at+1]=rgba.data[at+2]=(data[row*Math.ceil(width/8)+(col>>3)]>>(7-col%8)&1)*255;}
          else throw new Error('The PDF picture has an unsupported pixel format.');
          rgba.data[at+3]=255;
        }
        context.putImageData(rgba,0,0);
      }
      const pixels=new Uint32Array(context.getImageData(0,0,width,height).data.buffer);
      let uniform=true;for(let p=1;p<pixels.length&&uniform;p++){uniform=pixels[p]===pixels[0];if(!(p%1048576))await checkpoint();}
      if(uniform)continue;
      const blob=await step(new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('The PDF picture could not be encoded.')),'image/png')),'encode a picture');
      if(!blob.size||blob.size>limits.rasterBytes)throw failure('The PDF picture exceeds its image memory limit.','PDF_RASTER_SIZE');
      const m=multiply(picture.matrix,[1,0,0,-1,0,1]);
      const rotation=composite?0:Math.atan2(m[1],m[0])*180/Math.PI,flipV=!composite&&m[0]*m[3]-m[1]*m[2]<0;
      const reference=await step(embedImage({bytes:new Uint8Array(await blob.arrayBuffer()),name:'picture-'+(stats.images+1)+'.png',mime:'image/png',
        alt:'',displayWidth:box.w,displayHeight:box.h,transform:rotation||flipV?{rotation,flipV}:null}),'embed a picture');
      if(typeof reference!=='string'||!/^[a-z0-9-]+$/i.test(reference))throw new Error('The PDF picture did not return an image reference.');
      result.push({x:box.x,y:box.y,w:box.w,h:box.h,type:'image',id:group.id,reference,alt:'',composite});stats.images++;stats.pixels+=width*height;
    }finally{canvas.width=canvas.height=0;}
  }
  return result;
}

export async function readPdf(blob, {mode = 'text', embedImage, checkCurrent = () => {},
  onProgress = () => {}, signal} = {}, plugin) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > PDF_LIMITS.bytes)
    throw failure('Choose a PDF smaller than 25 MiB.', 'PDF_SIZE');
  if (mode !== 'text' && mode !== 'pages') throw new Error('Choose editable text or page images.');
  if (mode === 'pages' && typeof embedImage !== 'function') throw new Error('PDF page import needs image embedding.');
  const encoder = new TextEncoder();
  const html = [], warnings = new Set(), pages = [];
  let yielded = performance.now();
  const checkpoint = async () => {
    check();
    if (performance.now() - yielded > 12) {
      await new Promise(resolve => setTimeout(resolve, 0));
      yielded = performance.now(); check();
    }
  };
  const stats = {pages: 0, pagesWithText: 0, images: 0, pixels: 0, reducedPages: 0,
    textItems: 0, inputBytes: blob.size, outputBytes: 0};
  let session = null, loading = null, pdf = null, render = null, textReader = null, page = null, finished = false, destroying = null;
  let abortReject;
  const aborted = new Promise((_, reject) => { abortReject = reject; });
  aborted.catch(() => {});
  const abortError = () => new DOMException('PDF import cancelled.', 'AbortError');
  const check = () => { if (signal?.aborted) throw abortError(); checkCurrent(); };
  const destroy = () => {
    if (!destroying && loading) {
      try { destroying = loading.destroy().catch(() => {}); } catch (_) {}
    }
  };
  const cancel = () => {
    abortReject(abortError());
    try { render?.cancel(); } catch (_) {}
    try { textReader?.cancel().catch(() => {}); } catch (_) {}
    destroy();
  };
  signal?.addEventListener('abort', cancel, {once: true});
  if (signal?.aborted) cancel();
  const step = async (work, label) => {
    work = Promise.resolve(work);
    work.catch(() => {});
    check();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(failure('The PDF took too long to ' + label + '.', 'PDF_TIMEOUT')), PDF_LIMITS.operationMs);
    });
    try {
      const result = await Promise.race([work, aborted, timeout, ...(session ? [session.failure] : [])]);
      check(); return result;
    } finally { clearTimeout(timer); }
  };
  const append = value => {
    if (html.length) value = '\n' + value;
    if (value.length > PDF_LIMITS.bytes - stats.outputBytes) throw failure('The imported PDF exceeds 25 MiB.', 'PDF_OUTPUT_SIZE');
    stats.outputBytes += encoder.encode(value).length;
    if (stats.outputBytes > PDF_LIMITS.bytes) throw failure('The imported PDF exceeds 25 MiB.', 'PDF_OUTPUT_SIZE');
    html.push(value);
  };

  const canvases = new Map();
  let canvasPixels = 0;
  class BoundedCanvasFactory {
    create(width, height) {
      const canvas = document.createElement('canvas');
      this.reset({canvas}, width, height);
      const context = canvas.getContext('2d', {willReadFrequently: true});
      if (!context) { this.destroy({canvas}); throw new Error('PDF import needs a 2D canvas.'); }
      return {canvas, context};
    }
    reset(target, width, height) {
      width = Math.ceil(width); height = Math.ceil(height);
      const pixels = width * height;
      if (!Number.isSafeInteger(pixels) || width < 1 || height < 1 ||
          width > 16384 || height > 16384 ||
          canvasPixels - (canvases.get(target.canvas) || 0) + pixels > PDF_LIMITS.temporaryCanvasPixels)
        throw failure('A PDF drawing exceeds the image memory limit.', 'PDF_CANVAS_SIZE');
      canvasPixels += pixels - (canvases.get(target.canvas) || 0);
      canvases.set(target.canvas, pixels);
      target.canvas.width = width; target.canvas.height = height;
    }
    destroy(target) {
      if (!target.canvas) return;
      canvasPixels -= canvases.get(target.canvas) || 0;
      canvases.delete(target.canvas);
      target.canvas.width = target.canvas.height = 0;
      target.canvas = target.context = null;
    }
  }

  try {
    check();
    const starting = plugin.createSession().then(value => {
      try {
        if (finished) throw abortError();
        check(); session = value; return value;
      } catch (error) { value.close(); throw error; }
    });
    session = await step(starting, 'start the reader');
    const data = new Uint8Array(await step(blob.arrayBuffer(), 'read the file'));
    loading = session.api.getDocument({data, worker: session.worker, ...session.options,
      stopAtErrors: true, disableFontFace: true, useSystemFonts: false, enableXfa: false,
      disableAutoFetch: true, disableRange: true, disableStream: true,
      maxImageSize: PDF_LIMITS.sourceImagePixels, canvasMaxAreaInBytes: PDF_LIMITS.temporaryCanvasPixels * 4,
      CanvasFactory: BoundedCanvasFactory, verbosity: 0});
    pdf = await step(loading.promise, 'open');
    stats.pages = pdf.numPages;
    const pageLimit = mode === 'text' ? PDF_LIMITS.textPages : PDF_LIMITS.imagePages;
    if (!Number.isSafeInteger(stats.pages) || stats.pages < 1 || stats.pages > pageLimit)
      throw failure('This import supports up to ' + pageLimit + ' PDF pages.', 'PDF_PAGE_LIMIT');
    for (let index = 1; index <= stats.pages; index++) {
      check(); onProgress({page: index, pages: stats.pages});
      page = await step(pdf.getPage(index), 'read page ' + index);
      if (mode === 'text') {
        const viewport = page.getViewport({scale: 1});
        const runs = [], styles = {}, marks = [], ids = new Map();
        let characters = 0, order = 0;
        textReader = page.streamTextContent({includeMarkedContent: true}).getReader();
        while (true) {
          const {done, value} = await step(textReader.read(), 'read text on page ' + index);
          if (done) break;
          Object.assign(styles, value.styles);
          for (const item of value.items || []) {
            if (!(order++ % 256)) await checkpoint();
            if (item.type === 'beginMarkedContent' || item.type === 'beginMarkedContentProps') {
              marks.push(item);
              const id = /_mc(\d+)$/.exec(item.id || ''); if (id) ids.set(Number(id[1]), item.id);
              continue;
            }
            if (item.type === 'endMarkedContent') { marks.pop(); continue; }
            if (typeof item.str !== 'string') continue;
            if (++stats.textItems > PDF_LIMITS.textItems) throw failure('The PDF text layer is too complex to import.', 'PDF_TEXT_LIMIT');
            characters += item.str.length + (item.hasEOL ? 1 : 0);
            if (characters > PDF_LIMITS.pageTextCharacters) throw failure('A PDF page has too much text to import.', 'PDF_TEXT_LIMIT');
            if (marks.some(m => m.tag === 'Artifact')) continue;
            if (!item.str.trim()) {
              if (item.str && runs.at(-1)?.dir==='ltr') runs.at(-1).str += ' ';
              if(item.hasEOL&&runs.length)runs.at(-1).eol=true;
              continue;
            }
            if (!Array.isArray(item.transform) || !item.transform.every(Number.isFinite))
              throw failure('The PDF text has invalid positions.', 'PDF_TEXT_LIMIT');
            const t = multiply(viewport.transform, item.transform), size = Math.hypot(t[2], t[3]) || item.height || 12;
            const vertical = !!styles[item.fontName]?.vertical || item.dir === 'ttb';
            runs.push({str: item.str.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '\ufffd'), dir: item.dir, order, eol:item.hasEOL, font: item.fontName, size, vertical,
              x: t[4], y: vertical ? t[5] : t[5] - size * .8, baseline: t[5],
              w: vertical ? size : Math.abs(item.width), h: vertical ? Math.abs(item.height) : size,
              id: marks.findLast(m => m.id)?.id});
          }
        }
        textReader.releaseLock(); textReader = null;
        const tree = await step(page.getStructTree(), 'read page structure');
        const annotations = await step(page.getAnnotations({intent: 'display'}), 'read links');
        const operators = await step(page.getOperatorList(), 'read pictures');
        softHyphens(runs, operators, session.api);
        for (const run of runs) {
          let font; try { font = page.commonObjs.get(run.font); } catch (_) {}
          run.mono = /Mono|Courier|Consolas/i.test(font?.name || '') || !font?.name && styles[run.font]?.fontFamily === 'monospace';
          run.bold = /Bold|Black|Heavy|Demi|Semibold|(?:^|[.+-])(?:B|Bd|Blk)(?:[.+-]|$)/i.test(font?.name || '');
        }
        const pictures = await pagePictures(page, viewport, session.api, operators, ids,
          {embedImage, step, checkpoint, limits: PDF_LIMITS, stats, setRender:value=>{render=value;}});
        const words=runs.filter(r=>!pictures.some(p=>p.composite&&overlaps(p,r)>r.w*r.h*.8));
        pages.push({runs: linkRuns(words, annotations, viewport), tree, pictures, annotations, ref:page.ref,
          transform:viewport.transform, width: viewport.width, height: viewport.height});
        if (runs.length) stats.pagesWithText++;
      } else {
        const natural = page.getViewport({scale: 1});
        if (![natural.width, natural.height].every(value => Number.isFinite(value) && value > 0))
          throw failure('The PDF page has invalid dimensions.', 'PDF_PAGE_SIZE');
        const scale = Math.min(2, (PDF_LIMITS.pageSide - 1) / natural.width, (PDF_LIMITS.pageSide - 1) / natural.height,
          Math.sqrt((PDF_LIMITS.pagePixels - PDF_LIMITS.pageSide * 2) / (natural.width * natural.height)));
        const viewport = page.getViewport({scale});
        const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height);
        if (width < 1 || height < 1 || width > PDF_LIMITS.pageSide || height > PDF_LIMITS.pageSide || width * height > PDF_LIMITS.pagePixels)
          throw failure('The PDF page cannot fit the image limit.', 'PDF_PAGE_SIZE');
        if (scale < 2) stats.reducedPages++;
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        try {
          const context = canvas.getContext('2d', {alpha: false});
          if (!context) throw new Error('PDF import needs a 2D canvas.');
          render = page.render({canvas, canvasContext: context, viewport, background: '#ffffff',
            annotationMode: session.api.AnnotationMode.ENABLE});
          await step(render.promise, 'draw page ' + index);
          render = null;
          const raster = await step(new Promise((resolve, reject) => canvas.toBlob(value =>
            value ? resolve(value) : reject(new Error('The PDF page could not be encoded as an image.')), 'image/png')), 'encode page ' + index);
          if (!raster.size || raster.size > PDF_LIMITS.rasterBytes)
            throw failure('The PDF page image exceeds its memory limit.', 'PDF_RASTER_SIZE');
          canvas.width = canvas.height = 0;
          page.cleanup();
          const bytes = new Uint8Array(await step(raster.arrayBuffer(), 'prepare page ' + index));
          const name = 'page-' + index + '.png';
          const alt = 'Page ' + index + (blob.name ? ' of ' + String(blob.name).replace(/\.pdf$/i, '') : ' of imported PDF');
          const reference = await step(embedImage({bytes, name, mime: 'image/png', alt, displayWidth: width, displayHeight: height}), 'embed page ' + index);
          if (typeof reference !== 'string' || !/^[a-z0-9-]+$/i.test(reference))
            throw new Error('The PDF page did not return an image reference.');
          if (stats.images) append('<hr>');
          append('<p><img data-rapier-asset="' + reference + '" alt="' + escape(alt) + '"></p>');
          stats.images++; stats.pixels += width * height;
        } finally { canvas.width = canvas.height = 0; }
      }
      page.cleanup(); page = null;
    }
    if (mode === 'text') {
      if (!stats.pagesWithText) throw failure('This PDF has no selectable text. Import it as page images.', 'PDF_NO_TEXT');
      const removed = runningMatter(pages);
      for (const data of pages) data.runs = data.runs.filter(r => !removed.has(r));
      footnotes(pages);
      const styles = documentStyles(pages);
      for (const data of pages) {
        await checkpoint();
        let blocks;
        if (data.tree) {
          const tagged = tagBlocks(data.tree, data.runs, data.pictures);
          blocks = tagged.blocks;
          const extra = geometricBlocks(tagged.remaining, tagged.pictures, data.width, data.height);
          for (const b of extra) {
            const y = b.type === 'image' ? b.y : b.lines[0]?.y;
            let at = blocks.findIndex(c => (c.type === 'image' ? c.y : c.lines[0]?.y) > y);
            if (at < 0) at = blocks.length; blocks.splice(at, 0, b);
          }
        } else blocks = geometricBlocks(data.runs, data.pictures, data.width, data.height);
        append(renderBlocks(blocks, styles));
      }
      warnings.add('PDF structure is reconstructed from tags and page positions. Check reading order and tables; vector artwork and page styling may differ.');
      if (stats.pagesWithText < stats.pages)
        warnings.add((stats.pages - stats.pagesWithText) + ' page(s) had no selectable text and were left out.');
    } else {
      warnings.add('Each PDF page is an image; its text is not editable. Some fonts, colors and annotations can differ from the original.');
      if (stats.reducedPages) warnings.add(stats.reducedPages + ' large page(s) were reduced to fit the 4 megapixel page limit.');
    }
    check();
    return {html: html.join(''), warnings: [...warnings], stats};
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (error?.name === 'PasswordException')
      throw failure('Unlock this PDF in its original app, save an unlocked copy, then import that copy.', 'PDF_PASSWORD');
    if (/Image exceeded maximum allowed size/.test(String(error?.message)))
      throw failure('A picture in this PDF exceeds the 16 megapixel decoding limit. The import was stopped.', 'PDF_IMAGE_SIZE');
    throw error;
  } finally {
    finished = true;
    signal?.removeEventListener('abort', cancel);
    try { render?.cancel(); } catch (_) {}
    try { textReader?.cancel().catch(() => {}); } catch (_) {}
    try { page?.cleanup(); } catch (_) {}
    destroy();
    if (destroying) {
      let timer;
      try { await Promise.race([destroying, new Promise(resolve => { timer = setTimeout(resolve, 500); })]); }
      finally { clearTimeout(timer); }
    }
    session?.close();
    try { pdf?.filterFactory?.destroy(); } catch (_) {}
    for (const canvas of canvases.keys()) canvas.width = canvas.height = 0;
    canvases.clear();
  }
}
