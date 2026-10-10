// SPDX-License-Identifier: MIT
// Break only between mathematical atoms; each line keeps its complete vector ink.
const mathInkWidth = box => Math.max(box.w,box.right)-Math.min(0,box.left);

function mathFittedInk(svg, ratio, c) {
  let growth=0;
  if(c.screen)svg=svg.replace(/<path\b[^>]*\bdata-math-ink="([^"]+)"[^>]*\/>/g,(tag,original)=>{
    const scale=Number(original)*ratio,stroke=mathScreenStroke({...c,level:0,size:scale});
    const previous=Number(tag.match(/\bstroke-width="([^"]+)"/)?.[1] || 0)*scale/MATH_FONT.units;
    growth=Math.max(growth,(stroke-previous)/2);
    tag=tag.replace(/data-math-ink="[^"]+"/,'data-math-ink="'+mathNumber(scale)+'"');
    const weight='stroke-width="'+mathNumber(stroke*MATH_FONT.units/scale)+'"';
    return tag.includes('stroke-width=')?tag.replace(/stroke-width="[^"]+"/,weight):
      tag.replace('/>',' stroke="currentColor" '+weight+' stroke-linejoin="round" paint-order="stroke fill"/>');
  });
  return {svg,growth};
}

function mathFitBox(box,width,c) {
  let extent=mathInkWidth(box);
  if(extent<=width || !extent)return box;
  if(c.screen && box.refit) {
    let ratio=width/extent,next;
    for(let pass=0;pass<2;pass++) {
      next=box.refit(ratio);
      ratio=Math.min(ratio,width/mathInkWidth(next));
    }
    box=next;extent=mathInkWidth(box);
  }
  let ratio=width/extent,ink;
  // Fitting changes the final pixel size. Regrade the outlines and reserve their new ink.
  for(let pass=0;pass<3;pass++) {
    ink=mathFittedInk(box.svg,ratio,c);
    if(extent*ratio+2*ink.growth<=width)break;
    ratio=Math.max(Number.EPSILON,(width-2*ink.growth)/extent);
  }
  ink=mathFittedInk(box.svg,ratio,c);
  const scaled={...box,svg:'<g transform="scale('+mathNumber(ratio)+')">'+ink.svg+'</g>',fitted:true};
  for(const key of ['w','h','d','left','right','inkTop','inkBottom'])scaled[key]*=ratio;
  scaled.left-=ink.growth;scaled.right+=ink.growth;scaled.inkTop-=ink.growth;scaled.inkBottom+=ink.growth;
  scaled.h+=ink.growth;scaled.d+=ink.growth;
  delete scaled.rowItems;
  delete scaled.refit;
  return scaled;
}

function mathLineStack(lines,c) {
  const items=[],gap=Math.max(mathConstant('MathLeading',c,0.15),0.3*mathScale(c));
  let y=0,width=0;
  for(let i=0;i<lines.length;i++) {
    const {box,indent=0,gapBefore=0}=lines[i];
    if(i)y+=lines[i-1].box.d+gap+box.h+gapBefore;
    const x=indent-Math.min(0,box.left);
    items.push([box,x,y]);width=Math.max(width,x+Math.max(box.w,box.right));
  }
  return mathCompose(items,width,{lines:lines.reduce((sum,line)=>sum+(line.box.lines || 1),0),
    lastBaseline:y+(lines.at(-1)?.box.lastBaseline || 0),fitted:lines.some(line=>line.box.fitted)});
}

function mathPositionStack(lines,c,n) {
  const box=mathLineStack(lines,c),shift=n.position==='t'?0:n.position==='b'?-box.lastBaseline:
    (box.h-box.d)/2-mathConstant('AxisHeight',c,.25);
  return mathCompose([[box,0,shift]],box.w,{class:'inner',lines:box.lines,lastBaseline:box.lastBaseline+shift,fitted:box.fitted});
}

function mathFlowAtoms(n,box,x=0,y=0) {
  if(n.type==='row' && n.children.length && box.rowItems?.length===n.children.length)
    return n.children.flatMap((child,i)=>{const [b,dx,dy]=box.rowItems[i];return mathFlowAtoms(child,b,x+dx,y+dy);});
  if(n.type==='style' && n.width===undefined && !n.border && !n.background && !n.class && !n.limits) {
    const atoms=mathFlowAtoms(n.body,box,x,y);
    if(n.color) {
      const paint=b=>({...b,svg:'<g fill="'+mathEscape(n.color)+'" color="'+mathEscape(n.color)+'" fill-opacity="1" stroke-opacity="1">'+b.svg+'</g>',
        ...(b.refit?{refit:ratio=>paint(b.refit(ratio))}:{}),...(b.flowWrap?{flowWrap:width=>paint(b.flowWrap(width))}:{})});
      return atoms.map(([b,dx,dy])=>[paint(b),dx,dy]);
    }
    return atoms;
  }
  if(n.type==='frac' && n.bar!==false && n.barThickness!==0)box={...box,flowFactor:true};
  if(n.type==='glyph' && n.value==='⋯')box={...box,flowDots:true};
  if(n.type==='glyph' && '([{⌈⌊⟨⦅⟦⟪⦃)]}⌉⌋⟩⦆⟧⟫⦄'.includes(n.value))
    box={...box,flowFence:')]}⌉⌋⟩⦆⟧⟫⦄'.includes(n.value)?'close':'open'};
  return [[box,x,y]];
}

function mathRefitRow(items,advance,ratio) {
  let delta=0;
  const fresh=items.map(([b,x,y])=>{
    const next=b.refit?b.refit(ratio):b,placed=[next,x+delta,y];
    delta+=next.w-b.w;return placed;
  });
  return mathCompose(fresh,advance+delta,{fitted:fresh.some(([b])=>b.fitted)});
}

function mathWrapRow(box,c,width,{relationIndent,binaryIndent}={}) {
  if(mathInkWidth(box)<=width || !box.rowItems?.length)return mathFitBox(box,width,c);
  const atoms=box.rowItems.map(item=>[...item]),breaks=[0];let ink=false,depth=0,previous=null;
  for(let i=0;i<atoms.length;i++) {
    const b=atoms[i][0],next=atoms[i+1]?.[0],fence=b.flowFence || b.class;
    if(fence==='close')depth=Math.max(0,depth-1);
    if(ink && !depth && (b.class==='rel' || b.class==='bin' || b.flowDots && (previous?.flowFactor && next?.flowFactor || (previous?.flowFence || previous?.class)==='close' && (next?.flowFence || next?.class)==='open')))breaks.push(i);
    if(fence==='open')depth++;
    if(b.svg){ink=true;previous=b;}
  }
  breaks.push(atoms.length);
  // Reuse structural wrapping before shrinking an oversized, otherwise indivisible atom.
  const deltas=Array(atoms.length).fill(0);let changed=false;
  for(let segment=0;segment<breaks.length-1;segment++) {
    const start=breaks[segment],end=breaks[segment+1],origin=atoms[start]?.[1] || 0;
    let right=0,left=0;
    for(let i=start;i<end;i++){const [b,x]=atoms[i];left=Math.min(left,x-origin+b.left);right=Math.max(right,x-origin+b.right,x-origin+b.w);}
    let extent=right-left;
    if(extent<=width)continue;
    for(let i=start;i<end;i++) {
      const b=atoms[i][0];if(!b.flowWrap)continue;
      const allowance=width-(extent-mathInkWidth(b));
      if(allowance<=.2*mathScale(c))continue;
      const next=b.flowWrap(allowance),delta=next.w-b.w;
      if(Math.max(next.innerLines || 1,next.lines || 1)<2 || delta>=0)continue;
      atoms[i][0]=next;deltas[i]=delta;extent+=delta;changed=true;
    }
  }
  if(changed) {
    let shift=0,advance=0;
    for(let i=0;i<atoms.length;i++){atoms[i][1]+=shift;shift+=deltas[i];advance=Math.max(advance,atoms[i][1]+atoms[i][0].w);}
    box=mathCompose(atoms,advance,{rowItems:atoms,fitted:atoms.some(([b])=>b.fitted)});
    if(c.screen)box.refit=ratio=>mathRefitRow(atoms,advance,ratio);
  }
  if(breaks.length===2)return mathFitBox(box,width,c);
  const firstRelation=atoms.findIndex(([b])=>b.class==='rel');
  const anchor=relationIndent ?? (firstRelation>=0 && atoms[firstRelation][1]<width*0.35?atoms[firstRelation][1]:0);
  const continuation=binaryIndent ?? Math.min(anchor+mathScale(c),width*0.3);
  const minimum=breaks.slice(0,-1).map((start,i)=>{
    const origin=atoms[start][1];let left=0,right=0;
    for(let j=start;j<breaks[i+1];j++){const [b,x]=atoms[j];left=Math.min(left,x-origin+b.left);right=Math.max(right,x-origin+b.right,x-origin+b.w);}
    return right-left;
  });
  const inset=i=>{
    const wanted=i===0?0:atoms[breaks[i]][0].class==='rel'?anchor:continuation;
    return relationIndent===undefined?Math.min(wanted,Math.max(0,width-minimum[i])):wanted;
  };
  const costs=Array(breaks.length).fill(Infinity),next=Array(breaks.length).fill(0);
  costs[breaks.length-1]=0;
  // A bounded lookahead makes even thousands of break opportunities linear in input size.
  for(let start=breaks.length-2;start>=0;start--) {
    const first=breaks[start],origin=atoms[first][1],available=Math.max(.05,width-inset(start));
    let left=0,right=0,cursor=first;
    for(let end=start+1;end<Math.min(breaks.length,start+65);end++) {
      while(cursor<breaks[end]) {
        const [b,x]=atoms[cursor++];
        left=Math.min(left,x-origin+b.left);right=Math.max(right,x-origin+b.right,x-origin+b.w);
      }
      const extent=right-left,over=Math.max(0,extent-available)/available,slack=Math.max(0,available-extent)/available;
      const last=end===breaks.length-1,penalty=last?0:atoms[breaks[end]][0].class==='rel'?0:18;
      const cost=costs[end]+12+penalty+(last?8:60)*slack*slack+(over?100000*(1+over*over):0);
      if(cost<costs[start]) {costs[start]=cost;next[start]=end;}
      if(extent>available && end>start+1)break;
    }
  }
  const lines=[];
  for(let start=0;start<breaks.length-1;) {
    const end=next[start] || start+1,from=breaks[start],to=breaks[end],origin=atoms[from][1],items=[];
    let advance=0;
    for(let i=from;i<to;i++) {
      const [b,x,y]=atoms[i];items.push([b,x-origin,y]);advance=Math.max(advance,x-origin+b.w);
    }
    const indent=inset(start),line=mathCompose(items,advance,{fitted:items.some(([b])=>b.fitted)});
    if(c.screen)line.refit=ratio=>mathRefitRow(items,advance,ratio);
    lines.push({box:mathFitBox(line,Math.max(.05,width-indent),c),indent});start=end;
  }
  return mathLineStack(lines,c);
}

function mathWrapAligned(n,c,width,natural) {
  if(!/^(align(?:ed)?(?:at)?|flalign|split|eqnarray|gather(?:ed)?|multline)$/.test(n.env) ||
      n.columnRules?.length || n.rowRules?.length || n.columnInsertions?.length)return mathFitBox(natural,width,c);
  if(n.env==='eqnarray')n={...n,env:'aligned',rows:n.rows.map(row=>[row[0],{type:'row',children:row.slice(1).flatMap(cell=>cell.type==='row'?cell.children:[cell])}])};
  const paired=/^(align(?:ed)?(?:at)?|flalign|split)$/.test(n.env),cellStyle={...c,display:true};
  if(!paired) {
    const lines=[];
    for(let r=0;r<n.rows.length;r++) {
      const row=n.rows[r];
      const body=row.length===1?row[0]:{type:'row',children:row};
      lines.push({box:mathResponsiveLayout(body,cellStyle,width),gapBefore:(n.rowGaps?.[r-1] || 0)*mathScale(c)});
    }
    return mathPositionStack(lines,c,n);
  }
  const rows=n.rows.map(row=>row.map(cell=>mathLayout(cell,cellStyle)));
  const leftWidth=Math.max(0,...rows.flatMap(row=>row.filter((_,i)=>i%2===0).map(mathInkWidth)));
  const separate=leftWidth>width*0.4,anchor=separate?0:leftWidth;
  const lines=[],s=mathScale(c);
  for(let r=0;r<n.rows.length;r++) {
    const row=n.rows[r],start=lines.length;
    for(let pair=0;pair<row.length;pair+=2) {
      const left=rows[r][pair],rightNode=row[pair+1] || {type:'row',children:[]};
      const rightTree={type:'row',children:[{type:'row',children:[]},...(rightNode.type==='row'?rightNode.children:[rightNode])]},right=mathRow(rightTree.children,cellStyle);
      if(c.screen)right.refit=ratio=>mathScreenRelayout(rightTree,cellStyle,ratio);
      right.rowItems=mathFlowAtoms(rightTree,right);
      const relationGap=mathSpace('ord','rel',cellStyle);
      const wrapped=mathWrapRow(right,cellStyle,Math.max(.05,width-anchor),{relationIndent:relationGap,binaryIndent:Math.min(relationGap+s,width*0.2)});
      if(separate && left.svg)lines.push({box:mathResponsiveLayout(row[pair],cellStyle,width)});
      const parts=separate?[[wrapped,0,0]]:[[left,anchor-left.w,0],[wrapped,anchor,0]];
      lines.push({box:mathCompose(parts,anchor+mathInkWidth(wrapped),{lines:wrapped.lines || 1,lastBaseline:wrapped.lastBaseline || 0,fitted:wrapped.fitted})});
    }
    if(lines[start])lines[start].gapBefore=(n.rowGaps?.[r-1] || 0)*s;
  }
  return mathPositionStack(lines,c,n);
}

function mathHasMiddle(n) {
  if(!n || typeof n!=='object' || n.type==='fence')return false;
  if(n.type==='glyph' && n.delimiter)return true;
  return Object.values(n).some(value=>Array.isArray(value)?value.some(mathHasMiddle):mathHasMiddle(value));
}

function mathResponsiveLayout(n,c,width,natural=mathLayout(n,c)) {
  if(!Number.isFinite(width) || width<=0 || mathInkWidth(natural)<=width)return natural;
  if(c.screen && !natural.refit)natural={...natural,refit:ratio=>mathScreenRelayout(n,c,ratio)};
  if(n.type==='row') {
    if(n.children.length===1)return mathResponsiveLayout(n.children[0],c,width,natural.rowItems?.[0]?.[0]);
    return mathWrapRow({...natural,rowItems:mathFlowAtoms(n,natural)},c,width);
  }
  if(n.type==='style' && n.width===undefined && !n.border && !n.background && !n.class && !n.limits) {
    const style={...c};
    if(n.variant)style.variant=n.variant;
    if(n.absoluteSize!==undefined)style.size=n.absoluteSize;
    if(n.size!==undefined)style.size*=n.size;
    if(n.mathStyle) {style.level=({display:0,text:0,script:1,scriptscript:2})[n.mathStyle];style.display=n.mathStyle==='display';style.cramped=false;}
    const box=mathResponsiveLayout(n.body,style,width);
    if(n.color)box.svg='<g fill="'+mathEscape(n.color)+'" color="'+mathEscape(n.color)+'" fill-opacity="1" stroke-opacity="1">'+box.svg+'</g>';
    return box;
  }
  if(n.type==='frac' && n.bar!==false && n.barThickness!==0 && !n.left && !n.right) {
    const wrapped=mathFraction(n,c,width);if(wrapped.innerLines>1)return mathFitBox(wrapped,width,c);
  }
  if(n.type==='table')return mathWrapAligned(n,c,width,natural);
  if(n.type==='fence' && !n.size) {
    if(mathHasMiddle(n.body))return mathFitBox(natural,width,c);
    const local={...c,delimiterTarget:undefined};
    let available=width,box=natural;
    for(let pass=0;pass<4;pass++) {
      let body=mathResponsiveLayout(n.body,local,Math.max(.05,available));
      if(body.lines>1)body=mathCompose([[body,0,(body.h-body.d)/2-mathConstant('AxisHeight',c,.25)]],body.w,{lines:body.lines,fitted:body.fitted});
      box=mathFenceBoxes(n.left,n.right,body,local);
      box.lines=body.lines;box.fitted=body.fitted;
      if(mathInkWidth(box)<=width)return box;
      available=width-(box.w-body.w)-.05;
    }
    return mathFitBox(box,width,c);
  }
  return mathFitBox(natural,width,c);
}
