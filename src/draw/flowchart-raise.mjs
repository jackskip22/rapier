// SPDX-License-Identifier: AGPL-3.0-only
const delimiters = {rect:['[',']'],round:['(',')'],stadium:['([','])'],circle:['((','))'],diamond:['{','}'],
  cylinder:['[(',')]'],subroutine:['[[',']]'],asymmetric:['>',']'],hexagon:['{{','}}']};
const arrows = [['<-.->',true,true,true,false],['<-->',true,true,false,false],['-.->',false,true,true,false],
  ['-->',false,true,false,false],['---',false,false,false,false],['-.-',false,false,true,false],['==>',false,true,false,true]];
const idOK = id => typeof id === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/.test(id);
const quote = text => typeof text === 'string' && text.trim() && !text.includes('"') ? '"'+text.replace(/\r\n?|\n/g,'<br>')+'"' : null;
const refused = () => ({ok:false,code:'flowchart_not_representable'});

export function flowchartSourceFromRecipe(recipe, direction = 'TD') {
  if (!recipe || !Array.isArray(recipe.shapes) || !Array.isArray(recipe.strokes) || recipe.strokes.length ||
      !['TD','TB','BT','LR','RL'].includes(direction) || recipe.background || recipe.effect) return refused();
  const nodes=[],edges=[],groups=new Map(),ids=new Set();
  for(const shape of recipe.shapes) {
    if(!idOK(shape.id)||ids.has(shape.id)||shape.stroke||shape.asDrawn||shape.effect||shape.raster)return refused();
    ids.add(shape.id);
    if(shape.recognized==='text'&&shape.group) {
      const group=groups.get(shape.group)||{id:shape.group,members:[],title:null,rule:false};
      if(group.title!==null||!quote(shape.label))return refused();
      group.title=shape.label;groups.set(group.id,group);continue;
    }
    if(shape.recognized==='line'&&shape.group===shape.id&&!shape.bind) {
      const group=groups.get(shape.id)||{id:shape.id,members:[],title:null,rule:false};
      if(group.rule)return refused();group.rule=true;groups.set(group.id,group);continue;
    }
    if(['line','arrow'].includes(shape.recognized)) {
      if(!shape.bind?.start?.to||!shape.bind?.end?.to)return refused();
      const start=shape.headStart||'none',end=shape.headEnd||(shape.recognized==='arrow'?'triangle':'none');
      if(!['none','triangle'].includes(start)||!['none','triangle'].includes(end)||shape.dash&&shape.dash!=='dotted')return refused();
      const token=arrows.find(row=>row[1]===(start==='triangle')&&row[2]===(end==='triangle')&&row[3]===!!shape.dash&&row[4]===(shape.nib===18));
      if(!token||shape.label&&!quote(shape.label))return refused();
      edges.push({from:shape.bind.start.to,to:shape.bind.end.to,token:token[0],label:shape.label});continue;
    }
    const kind=shape.recognized==='rect'&&shape.corner ? shape.corner===.5?'stadium':shape.corner===.08?'round':null : shape.recognized;
    if(!delimiters[kind]||kind==='hexagon'&&!shape.flat||!quote(shape.label))return refused();
    nodes.push({id:shape.id,label:shape.label,kind,group:shape.group,style:shape.authorStyle});
  }
  const byId=new Map(nodes.map(node=>[node.id,node]));
  for(const node of nodes)if(node.group) {
    const group=groups.get(node.group);if(!group)return refused();group.members.push(node.id);
  }
  if([...groups.values()].some(group=>!group.rule||group.title===null)||edges.some(edge=>!byId.has(edge.from)||!byId.has(edge.to)))return refused();
  const line=node=>node.id+delimiters[node.kind][0]+quote(node.label)+delimiters[node.kind][1];
  const rows=['flowchart '+direction,...nodes.filter(node=>!node.group).map(line)];
  for(const group of groups.values())rows.push('subgraph '+group.id+'['+quote(group.title)+']',...group.members.map(id=>'  '+line(byId.get(id))),'end');
  for(const edge of edges)rows.push(edge.from+' '+edge.token+(edge.label?'|'+quote(edge.label)+'|':'')+' '+edge.to);
  for(const node of nodes)if(node.style)rows.push('style '+node.id+' '+Object.entries(node.style).map(([key,value])=>key+':'+value).join(','));
  return {ok:true,source:rows.join('\n')+'\n'};
}

export function sameFlowchartDrawing(left,right, placement = true) {
  const canonical=recipe=>{
    const key=shape=>shape.recognized==='text'&&shape.group?'title:'+shape.group:
      shape.bind?'edge:'+JSON.stringify([shape.bind.start?.to,shape.bind.end?.to,shape.label||'',shape.headStart||'none',shape.headEnd||(shape.recognized==='arrow'?'triangle':'none'),shape.dash]):'node:'+shape.id;
    const clean=value=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,clean(value[k])])):value;
    const shapes=recipe.shapes.map(shape=>{
      const copy={...shape};delete copy.seed;
      if(shape.bind) {copy.headStart ||= 'none';copy.headEnd ||= shape.recognized==='arrow'?'triangle':'none';}
      if(shape.bind||shape.recognized==='text'&&shape.group)delete copy.id;
      if(!placement) {
        for(const field of ['geom','route','labelPos','labelBeside','labelWidth','textWrap'])delete copy[field];
        if(copy.bind)copy.bind=Object.fromEntries(Object.entries(copy.bind).map(([end,bind])=>[end,{to:bind.to}]));
      }
      return [key(shape),clean(copy)];
    }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const copy={...recipe,shapes};
    if(!placement){delete copy.canvas;delete copy.view;}
    return JSON.stringify(clean(copy));
  };
  return canonical(left)===canonical(right);
}
