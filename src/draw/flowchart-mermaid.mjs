// SPDX-License-Identifier: MIT
const identifier = '[A-Za-z0-9_\\u0080-\\uffff][A-Za-z0-9_\\u0080-\\uffff-]*?';
const classIdentifier = '(?:`[^`]+`|' + identifier + ')(?:~[^~]+~)?';
const classKey = id => id.replace(/~[^~]*~$/, '').replace(/^`|`$/g, '');
const idPattern = new RegExp('^' + identifier + '$');
const familyPattern = /^(sequenceDiagram|classDiagram|stateDiagram(?:-v2)?)\b/;
const refuse = code => ({ok: false, code});
const eolOf = source => /\r\n|\n|\r/.exec(source)?.[0] || '\n';
const escape = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function statements(source) {
  const rows = [];
  let start = 0, quote = null, comment = false, commentAt = null, depth = 0, configDepth = 0;
  const braces = /^[ \t]*(?:classDiagram|stateDiagram(?:-v2)?)\b/m.test(source);
  const sequence = /^[ \t]*sequenceDiagram\b/m.test(source);
  const emit = end => {
    const raw = source.slice(start, commentAt ?? end), leading = /^[ \t]*/.exec(raw)[0].length, text = raw.slice(leading).trimEnd();
    if(text && !text.startsWith('%%'))rows.push({start:start+leading,end:start+leading+text.length,text});
  };
  for (let i = 0; i <= source.length; i++) {
    const c = source[i];
    if(sequence&&!quote&&!comment){if(c==='{'&&(configDepth||source[i-1]==='@'))configDepth++;else if(c==='}'&&configDepth)configDepth--;}
    if (!quote && !comment && c === '#' && /^#[A-Za-z0-9]+;/.test(source.slice(i))) { i += /^#[A-Za-z0-9]+;/.exec(source.slice(i))[0].length - 1; continue; }
    if (!quote && !comment && braces && c === '{' && /^(?:class|namespace|state)\s/.test(source.slice(start,i).trimStart())) {emit(i+1);start=i+1;depth++;continue;}
    if (!quote && !comment && braces && c === '}' && depth) {emit(i);rows.push({start:i,end:i+1,text:'}'});start=i+1;depth--;continue;}
    if (i === source.length || !quote && (c === '\r' || c === '\n' || c === ';' && !comment)) {
      emit(i);
      if (c === '\r' && source[i + 1] === '\n') i++;
      start = i + 1; comment = false; commentAt = null;
    } else if (!comment && (c === '"' || c === '`')) {
      let slashAt=i;while(source[slashAt-1]==='\\')slashAt--;
      if(sequence&&configDepth&&(i-slashAt)%2)continue;
      const prefix=source.slice(start,i).trimStart(),line=source.slice(start).split(/[\r\n]/,1)[0];
      const quotedSyntax=sequence?configDepth>0:c==='`'?!prefix.includes(':')&&!/^[+#~-]/.test(prefix):
        /^(?:class|state)\s/.test(prefix)||/^note(?:\s+for\s+.+)?\s+$/.test(prefix)||!prefix.includes(':')&&/[-.]{2}/.test(line);
      if(quote||quotedSyntax)quote=quote===c?null:quote||c;
    }
    else if (!quote && !comment && c === '%' && source[i + 1] === '%') {comment = true; commentAt = i;}
  }
  return rows;
}

export function indexMermaid(source, model = null) {
  if (typeof source !== 'string' || source.length > 65536) return refuse('diagram_source');
  const rows = statements(source), headAt = rows.findIndex(row => familyPattern.test(row.text));
  if (headAt < 0) return refuse('diagram_family');
  const header = rows[headAt], family = header.text.startsWith('sequence') ? 'sequence' : header.text.startsWith('class') ? 'class' : 'state';
  const nodes = new Map(), edges = [], groups = [], extras = [], unknown = [], counts = new Map(), scopes = [];
  const span = (row, match, group) => ({start: row.start + match.indices[group][0], end: row.start + match.indices[group][1]});
  const trim = range => {while (/\s/.test(source[range.start] || '') && range.start < range.end) range.start++;while (/\s/.test(source[range.end - 1] || '') && range.end > range.start) range.end--;return range;};
  const node = (id, range, row) => {
    if (!nodes.has(id)) nodes.set(id, {id: family + ':node:' + id, key: id, kind: 'node', span: range, references: [], declaration: null, label: null});
    const value = nodes.get(id);value.references.push({...range, statement: row});return value;
  };
  const extra = (kind, row, label = null, key = row.text) => {
    const stem = family + ':' + kind + ':' + sourceKey(key), ordinal = counts.get(stem) || 0;counts.set(stem, ordinal + 1);
    const value = {id: stem + ':' + ordinal, kind, span: {start: row.start, end: row.end}, statement: row, label, references: []};
    extras.push(value);row.kind = kind;row.item = value;return value;
  };
  const open = (item, row, key = item.id) => {
    const block = {start: row.start, end: null, declaration: row};
    (item.blocks ||= []).push(block);item.block = block;scopes.push({key, item, block, branch: 0});groups.push(item);
  };
  const close = row => {
    const context = scopes.pop();
    if (!context) {unknown.push(row);return;}
    context.block.end = row.end;context.block.endStatement = row;context.item.endStatement = row;row.kind = 'end';row.owner = context.item.id;
  };
  const reference = (id, range, row, item) => {node(id, range, row);if(item)item.references.push(id);};
  for(const row of rows.slice(0,headAt)){
    const match=/^title:\s*(.*)$/d.exec(row.text);if(match)extra('title',row,span(row,match,1),'title');
  }
  for (let rowAt = headAt + 1; rowAt < rows.length; rowAt++) {
    const row = rows[rowAt], code = row.text;row.scope = scopes.at(-1)?.key || null;row.region = scopes.map(context => context.block.start + ':' + context.branch).join('/');let match;
    if ((match = /^(title)\s+(.+)$/d.exec(code))) {extra('title',row,span(row,match,2),'title');continue;}
    if (family === 'sequence') {
      if ((match = /^(box)(?:\s+(.*))?$/d.exec(code))) {
        const item=extra('box',row,match[2]?span(row,match,2):null);item.name=(match[2]||'').replace(/^(?:transparent|#[\da-f]+|rgb\([^)]*\)|rgba\([^)]*\))\s*/i,'');open(item,row);continue;
      }
      if ((match = /^(loop|alt|opt|par(?:\s+over)?|critical|break|rect)\b\s*(.*)$/d.exec(code))) {
        const item=extra('frame',row,span(row,match,2));item.frameKind=match[1];item.messageType={loop:10,alt:12,opt:15,par:19,'par over':32,critical:27,break:30,rect:22}[match[1]];open(item,row);continue;
      }
      if ((match = /^(else|and|option)\b\s*(.*)$/d.exec(code))) {const item=extra('branch',row,span(row,match,2));item.messageType={else:13,and:20,option:28}[match[1]];if(scopes.length)scopes.at(-1).branch++;else unknown.push(row);continue;}
      if (code === 'end') {
        close(row);continue;
      }
      if ((match = new RegExp('^(activate|deactivate|destroy)\\s+(' + identifier + ')$', 'd').exec(code))) {
        const item=extra('activation',row);item.messageType=match[1]==='activate'?17:match[1]==='deactivate'?18:null;item.actor=match[2];reference(match[2],span(row,match,2),row,item);continue;
      }
      if ((match = new RegExp('^Note\\s+(?:over|left of|right of)\\s+('+identifier+')(?:\\s*,\\s*('+identifier+'))?\\s*:(.*)$','di').exec(code))) {
        const item=extra('note',row,trim(span(row,match,3)));item.messageType=2;item.from=match[1];item.to=match[2]||match[1];
        reference(match[1],span(row,match,1),row,item);if(match[2])reference(match[2],span(row,match,2),row,item);continue;
      }
    }
    if (family === 'class' && (match = new RegExp('^namespace\\s+('+identifier+')(?:\\["([^"]*)"\\])?\\s*\\{$','d').exec(code))) {
      const item=extra('namespace',row,match[2]?span(row,match,2):span(row,match,1),match[1]);item.key=match[1];open(item,row);continue;
    }
    if (family === 'class' && (match = new RegExp('^note(?:\\s+for\\s+('+classIdentifier+'))?\\s+"([\\s\\S]*)"$','d').exec(code))) {
      const item=extra('note',row,span(row,match,2));item.actor=match[1]&&classKey(match[1]);if(match[1])reference(item.actor,span(row,match,1),row,item);continue;
    }
    if (family === 'state' && (match = new RegExp('^note\\s+(?:left of|right of)\\s+('+identifier+')(?:\\s*:(.*))?$','d').exec(code))) {
      const item=extra('note',row,match[2]===undefined?null:trim(span(row,match,2)));item.actor=match[1];reference(match[1],span(row,match,1),row,item);
      if(match[2]===undefined){const first=rows[rowAt+1];let end=rowAt+1;while(end<rows.length&&!/^end\s+note$/.test(rows[end].text))end++;
        if(end===rows.length){unknown.push(row);continue;}item.block={start:row.start,end:rows[end].end};item.span.end=rows[end].end;
        item.label={start:first?.start??row.end,end:rows[end-1]?.end??row.end};item.endStatement=rows[end];rowAt=end;}
      continue;
    }
    const edgePattern = family === 'sequence'
      ? new RegExp('^(' + identifier + ')\\s*([<>x()|\\-]+?)([+-]?)\\s*(' + identifier + ')\\s*:(.*)$', 'd')
      : family === 'class'
        ? new RegExp('^(' + classIdentifier + ')(?:\\s+"([^"]*)")?\\s*((?:<\\||\\|>|\\(\\)|[<|*o>()])?[-.]{2}(?:<\\||\\|>|\\(\\)|[<|*o>()])?)(?:\\s+"([^"]*)")?\\s*(' + classIdentifier + ')(?:\\s*:(.*))?$', 'd')
        : new RegExp('^(' + identifier + '|\\[\\*\\])\\s*(-->)\\s*(' + identifier + '|\\[\\*\\])(?:\\s*:(.*))?$', 'd');
    match = edgePattern.exec(code);
    if (match) {
      const toIndex=family==='sequence'?4:family==='class'?5:3,labelIndex=family==='sequence'?5:family==='class'?6:4,opIndex=family==='class'?3:2;
      const from=family==='class'?classKey(match[1]):match[1]==='[*]'?(row.scope||'root')+'_start':match[1],to=family==='class'?classKey(match[toIndex]):match[toIndex]==='[*]'?(row.scope||'root')+'_end':match[toIndex];
      const fromNode=node(from,span(row,match,1),row),toNode=node(to,span(row,match,toIndex),row);
      if(match[1]==='[*]')fromNode.terminal=true;if(match[toIndex]==='[*]')toNode.terminal=true;
      const label=match[labelIndex]===undefined?null:trim(span(row,match,labelIndex));
      const key=from+':'+to,identity=key+':'+sourceKey(match[opIndex]+':'+(label?source.slice(label.start,label.end):''));
      const ordinal=counts.get(identity)||0;counts.set(identity,ordinal+1);
      const item={id:family+':edge:'+identity+':'+ordinal,
        kind:'edge',from,to,label,span:{start:row.start,end:row.end},statement:row,operator:match[opIndex],fromSpan:span(row,match,1),toSpan:span(row,match,toIndex),ordinal};
      if(family==='sequence'&&match[3]){item.activation=match[3];item.activationSpan=span(row,match,3);}
      if(family==='class')item.cardinalities=[2,4].map(i=>match[i]===undefined?null:span(row,match,i));
      edges.push(item);row.kind='edge';row.item=item;continue;
    }
    const declaration=family==='sequence'
      ?new RegExp('^(?:create\\s+)?(participant|actor)\\s+('+identifier+')(?:\\s*@\\{[^}]*\\})?(?:\\s+as\\s+(.+))?$','d')
      :family==='class'?new RegExp('^(class)\\s+('+classIdentifier+')(?:\\["([^"]*)"\\])?(?:\\s*(\\{))?$','d')
      :new RegExp('^(state)\\s+(?:"([^"]*)"\\s+as\\s+)?('+identifier+')(?:\\s*(\\{)|\\s*<<[^>]+>>)?$','d');
    match=declaration.exec(code);
    if(match){
      const idAt=family==='state'?3:2,labelAt=family==='state'?2:3,value=node(family==='class'?classKey(match[idAt]):match[idAt],span(row,match,idAt),row);
      (value.declarations ||= []).push(row);value.declaration=row;value.label=match[labelAt]===undefined?null:span(row,match,labelAt);row.kind='node';row.node=value.key;
      if(match[4])open(value,row,value.key);continue;
    }
    if(code==='}') {close(row);continue;}
    if(family==='state'&&(match=new RegExp('^('+identifier+')\\s*:(.*)$','d').exec(code))){
      const value=node(match[1],span(row,match,1),row);value.declaration ||= row;const label=trim(span(row,match,2));value.label ||= label;
      const item=extra('description',row,label);item.actor=value.key;continue;
    }
    if(family==='class'&&scopes.at(-1)?.item.kind==='node'){
      const annotation=/^<<([^>]+)>>$/d.exec(code),item=extra(annotation?'annotation':'member',row,annotation?span(row,annotation,1):{start:row.start,end:row.end});item.actor=row.scope;continue;
    }
    if(family==='class'&&(match=new RegExp('^('+classIdentifier+')\\s*:(.*)$','d').exec(code))){const item=extra('member',row,trim(span(row,match,2)));item.actor=classKey(match[1]);reference(item.actor,span(row,match,1),row,item);continue;}
    if(family==='class'&&(match=new RegExp('^<<([^>]+)>>\\s+('+classIdentifier+')$','d').exec(code))){const item=extra('annotation',row,span(row,match,1));item.actor=classKey(match[2]);reference(item.actor,span(row,match,2),row,item);continue;}
    if(/^(?:direction|accTitle|accDescr|autonumber|hide|classDef|style|cssClass|class|link|links|click|properties|details)\b/.test(code)){row.kind='directive';unknown.push(row);continue;}
    unknown.push(row);
  }
  for(const context of scopes)unknown.push(context.block.declaration);
  if(family==='sequence'&&model?.messages){
    let cursor = 0;
    for(const item of [...edges,...extras].sort((a,b)=>a.span.start-b.span.start)){
      const at=model.messages.findIndex((m,i)=>i>=cursor&&(item.kind==='edge'?m.from===item.from&&m.to===item.to&&![2,17,18].includes(m.type):m.type===item.messageType&&(!item.actor||m.from===item.actor)&&(!item.from||m.from===item.from&&m.to===item.to)));
      if(at>=0){cursor=at+1;item.renderId='i'+at;item.messageIndex=at;}
    }
    const boxes=extras.filter(x=>x.kind==='box');boxes.forEach((item,i)=>{item.renderId=model.boxes?.[i]?.name||item.name;});
  }else if(family==='class'){
    edges.forEach((edge,i)=>{edge.renderId='id_'+edge.from+'_'+edge.to+'_'+(i+1);});
    extras.filter(x=>x.kind==='namespace').forEach(item=>{item.renderId=item.key;});
    const notes=extras.filter(x=>x.kind==='note');notes.forEach((item,i)=>{item.renderId=[...(model?.notes?.keys?.()||[])][i]||'note'+i;item.connectorId='edgeNote'+i;});
  }else if(family==='state'){
    const available=model?.graph?.edges?.filter(e=>!e.classes?.includes('note-edge'))||[];
    const used=new Set();edges.forEach((edge,i)=>{const found=available.find((e,j)=>!used.has(j)&&e.start===edge.from&&e.end===edge.to);if(found){used.add(available.indexOf(found));edge.renderId=found.id;}else edge.renderId='edge'+i;});
    const usedNotes=new Set();
    for(const note of extras.filter(x=>x.kind==='note')){
      const found=model?.graph?.nodes?.find(n=>n.shape==='note'&&n.noteFor===note.actor&&!usedNotes.has(n.id));
      if(found){usedNotes.add(found.id);note.renderId=found.id;note.connectorId=model.graph.edges.find(e=>e.classes?.includes('note-edge')&&(e.end===found.id||e.start===found.id))?.id;}
    }
  }
  return {ok:true,family,header,nodes:[...nodes.values()],edges,groups,extras,statements:rows,unknown};
}

function sourceKey(text) {let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return (hash>>>0).toString(36);}

function removal(source, row) {
  let start = row.start, end = row.end;
  while (start && /[ \t]/.test(source[start - 1])) start--;
  while (/[ \t]/.test(source[end] || '\0')) end++;
  if ((start === 0 || /[\r\n]/.test(source[start - 1])) && (end === source.length || /[\r\n]/.test(source[end]))) {
    if (source.startsWith('\r\n', end)) end += 2; else if (end < source.length) end++;
    return {pos: start, removed: source.slice(start, end), inserted: ''};
  }
  if (source[end] === ';') end++;
  return {pos: row.start, removed: source.slice(row.start, end), inserted: ''};
}

function movement(source, row) {
  const cut = removal(source, row);
  let start = row.start;while(start && /[ \t]/.test(source[start - 1]))start--;
  let end = row.end;while(/[ \t]/.test(source[end] || '\0'))end++;
  if ((start === 0 || /[\r\n]/.test(source[start - 1])) && source.startsWith('%%',end)) {
    while(end < source.length && !/[\r\n]/.test(source[end]))end++;
    if(source.startsWith('\r\n',end))end+=2;else if(end < source.length)end++;
    return {pos:start,removed:source.slice(start,end),inserted:''};
  }
  return cut;
}

function apply(source, splices, validate) {
  const ordered = splices.slice().sort((a, b) => a.pos - b.pos);
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    if (source.slice(s.pos, s.pos + s.removed.length) !== s.removed || i && ordered[i - 1].pos + ordered[i - 1].removed.length > s.pos)
      return refuse('diagram_edit_overlap');
  }
  let next = source;
  for (const s of ordered.slice().reverse()) next = next.slice(0, s.pos) + s.inserted + next.slice(s.pos + s.removed.length);
  if (next.length > 65536) return refuse('diagram_source');
  if (validate) { try { validate(next); } catch { return refuse('diagram_edit_syntax'); } }
  return {ok: true, source: next, splices: ordered};
}

function lowerMermaidEdit(source, action, info, validate) {
  const target = [...info.nodes, ...info.edges, ...info.extras].find(item => item.id === action.id || item.key === action.id);
  const eol = eolOf(source), text = action.text;
  const validText = typeof text === 'string' && !!text.trim() && !/[\r\n;"\x00-\x1f]/.test(text) && !text.includes('%%');
  const splice = (span, inserted) => ({pos: span.start, removed: source.slice(span.start, span.end), inserted});
  const wireId = id => info.family === 'class' && !idPattern.test(id) ? '`' + id + '`' : id;
  const bareDeclaration = node => (info.family === 'sequence' ? 'participant ' : info.family === 'class' ? 'class ' : 'state ') +
    (info.family === 'class' ? source.slice(node.references[0].start,node.references[0].end) : node.key);
  const declaration = (id, label) => info.family === 'sequence' ? 'participant ' + id + ' as ' + label :
    info.family === 'class' ? 'class ' + wireId(id) + '["' + label + '"]' : 'state "' + label + '" as ' + id;
  const mentions = (row, key) => new RegExp('(?<![A-Za-z0-9_\\u0080-\\uffff-])' + escape(key) + '(?![A-Za-z0-9_\\u0080-\\uffff-])').test(row.text);
  const blockRemoval = item => {
    const blocks = item.blocks || [item.block];
    if (blocks.some(block => !block?.end || !block.endStatement) || !['keep','remove'].includes(action.contents)) return null;
    if (action.contents === 'keep') {
      if (info.family === 'class' && item.kind === 'node') return null;
      return [...blocks.flatMap(block => [block.declaration, block.endStatement]),
        ...info.extras.filter(part => part.kind === 'branch' && part.statement.scope === item.id).map(part => part.statement)].map(row => removal(source,row));
    }
    const inside = row => blocks.some(block => row.start >= block.start && row.end <= block.end);
    if (info.nodes.some(node => node !== item && !node.terminal && (node.declarations?.some(inside) || !node.declarations?.length && inside(node.declaration || node.references[0].statement)) &&
        (node.references.some(ref => !inside(ref.statement)) || info.unknown.some(row => !inside(row) && mentions(row,node.key))))) return null;
    return blocks.map(block => removal(source,block));
  };
  if (action.kind === 'add') {
    if (!idPattern.test(action.key || '') || info.nodes.some(node => node.key === action.key) || !validText) return refuse('diagram_edit_value');
    return apply(source, [{pos: source.length, removed: '', inserted: (source.endsWith(eol) ? '' : eol) + declaration(action.key, text) + eol}], validate);
  }
  if (action.kind === 'connect') {
    const from = info.nodes.find(n => n.key === action.from), to = info.nodes.find(n => n.key === action.to);
    if (!from || !to || (text !== undefined && !validText)) return refuse('diagram_edit_value');
    const op = info.family === 'sequence' ? '->>' : '-->';
    const line = wireId(from.key) + op + wireId(to.key) + (text !== undefined || info.family === 'sequence' ? ': ' + (text || '') : '');
    return apply(source, [{pos: source.length, removed: '', inserted: (source.endsWith(eol) ? '' : eol) + line + eol}], validate);
  }
  if (!target || target.terminal) return refuse('diagram_edit_target');
  if (action.kind === 'rename') {
    if (!validText) return refuse('diagram_edit_value');
    if (target.label) return apply(source, [splice(target.label, text)], validate);
    if (target.kind === 'edge') return apply(source, [{pos: target.span.end, removed: '', inserted: ': ' + text}], validate);
    if (target.declaration) {
      const at = target.references.find(ref => ref.statement === target.declaration);
      const added = info.family === 'state' ? {pos: at.start, removed: '', inserted: '"' + text + '" as '}
        : {pos: info.family === 'sequence' ? target.declaration.end : at.end, removed: '', inserted: info.family === 'class' ? '["' + text + '"]' : ' as ' + text};
      return apply(source, [added], validate);
    }
    return apply(source, [{pos: target.references[0].statement.start, removed: '', inserted: declaration(target.key, text) + eol}], validate);
  }
  if (action.kind === 'remove') {
    const remove = cuts => {
      const removed = item => item && cuts.some(cut=>cut.removed.length&&item.span.start>=cut.pos&&item.span.end<=cut.pos+cut.removed.length);
      const paired = [];
      for(const pair of sequenceActivations(info))if(pair.end&&removed(pair.item)!==removed(pair.end)){
        const kept=removed(pair.item)?pair.end:pair.item;
        paired.push(kept.activationSpan?splice(kept.activationSpan,''):removal(source,kept.statement));
      }
      return apply(source,[...cuts,...paired],validate);
    };
    if (action.part === 'activation' || target.kind === 'activation' && target.messageType !== null) {
      const pair = sequenceActivations(info).find(item => item.item === target || item.end === target);
      if (!pair) return refuse('diagram_edit_target');
      return remove([pair.item,pair.end].filter(Boolean).map(item => item.activationSpan ? splice(item.activationSpan,'') : removal(source,item.statement)));
    }
    if (!['node','edge'].includes(target.kind)) {
      if(target.block && target.kind!=='note') {
        const cuts=blockRemoval(target);return cuts?remove(cuts):refuse('diagram_edit_unsupported');
      }
      return remove([removal(source,target.block||target.statement)]);
    }
    if (target.kind === 'edge') {
      const cut = removal(source, target.statement);
      const orphaned = info.nodes.filter(node => !node.terminal && node.references.every(ref => ref.statement === target.statement));
      if (orphaned.length) cut.inserted = orphaned.map(bareDeclaration).join(eol) + eol;
      return remove([cut]);
    }
    if (info.unknown.some(row => mentions(row,target.key))) return refuse('diagram_edit_unsupported');
    const rows = new Set(target.references.map(ref => ref.statement)), removedRows = new Set(), splices = [];
    const targetBlocks = target.blocks || (target.block ? [target.block] : []);
    if (targetBlocks.length) {
      if (targetBlocks.some(block => block.end === null)) return refuse('diagram_edit_unsupported');
      if (info.family === 'state' || action.contents !== undefined) {
        const cuts=blockRemoval(target);if(!cuts)return refuse('diagram_edit_unsupported');splices.push(...cuts);
      } else splices.push(...targetBlocks.map(block => removal(source, block)));
    }
    for (const row of rows) if (!targetBlocks.some(block => row.start >= block.start && row.end <= block.end)) {
      if(row.kind==='note'&&row.item.references.length>1){
        const own=target.references.find(ref=>ref.statement===row),peer=info.nodes.filter(n=>n!==target).flatMap(n=>n.references).find(ref=>ref.statement===row);
        if(!peer)return refuse('diagram_edit_unsupported');
        const range=own.start<peer.start?{start:own.start,end:peer.start}:{start:peer.end,end:own.end};splices.push(splice(range,''));
      }else {splices.push(removal(source,row.item?.block||row));removedRows.add(row);}
    }
    const retained = info.nodes.filter(node => node.key !== target.key && !node.terminal && node.references.every(ref => removedRows.has(ref.statement)));
    if (retained.length) splices.push({pos: source.length, removed: '', inserted: (source.endsWith(eol) ? '' : eol) +
      retained.map(bareDeclaration).join(eol) + eol});
    return remove(splices);
  }
  if (action.kind === 'move' || action.kind === 'reorder') {
    const other = [...info.nodes, ...info.edges, ...info.extras].find(item => item.id === action.before || item.key === action.before);
    const row = target.kind === 'node' ? target.declaration || target.references[0]?.statement : target.statement;
    const before = other?.kind === 'node' ? other.declaration || other.references[0]?.statement : other?.statement;
    if (!row || !before || target===other || row.region !== before.region || target.kind==='branch' || target.block?.end===null) return refuse('diagram_edit_unsupported');
    let position=before.start;while(position&&/[ \t]/.test(source[position-1]))position--;
    if(position&& !/[\r\n]/.test(source[position-1]))position=before.start;
    if(target.kind==='node'&&!target.declaration) return apply(source,[{pos:position,removed:'',inserted:bareDeclaration(target)+eol}],validate);
    if(info.family==='sequence'&&target.kind!=='node'){
      const activeAt=at=>sequenceActivations(info).filter(pair=>pair.range.start<at&&(pair.range.end===null||at<pair.range.end)).map(pair=>pair.item.id).join('|');
      if(target.activation||target.kind==='activation'||activeAt(row.start)!==activeAt(before.start))return refuse('diagram_edit_unsupported');
    }
    const rows = target.kind === 'node' && target.declarations?.length ? target.declarations : [row];
    const ranges = rows.map(part => target.blocks?.find(block => block.start === part.start) || (!target.blocks && part === row && target.block) || part);
    if(rows.some(part=>part===before||part.region!==before.region)||ranges.some(range=>range.end===null||before.start>range.start&&before.start<range.end))return refuse('diagram_edit_unsupported');
    if (rows.some(part => info.unknown.some(item => item.start > Math.min(part.start, before.start) && item.start < Math.max(part.start, before.start)))) return refuse('diagram_edit_unsupported');
    const cuts = ranges.map(range=>movement(source,range));let inserted='';
    const moved = cuts.map(cut=>{const value={from:cut.pos,length:cut.removed.length,offset:inserted.length};inserted+=cut.removed+(/[\r\n]$/.test(cut.removed)?'':eol);return value;});
    return {...apply(source, [...cuts, {pos: position, removed: '', inserted}], validate), moved, moveTo:position};
  }
  return refuse('diagram_edit_action');
}

export function editMermaid(source, action, validate = null) {
  if (!action || typeof action !== 'object' || Array.isArray(action) || typeof action.kind !== 'string') return refuse('diagram_edit_action');
  const before = indexMermaid(source);
  if (!before.ok) return before;
  if (validate) {try {validate(source);} catch {return refuse('diagram_edit_syntax');}}
  const result = lowerMermaidEdit(source, action, before, validate);
  if (!result.ok) return result;
  const after = indexMermaid(result.source), oldItems = [...before.nodes, ...before.edges, ...before.extras], newItems = [...after.nodes, ...after.edges, ...after.extras];
  const target = oldItems.find(item => item.id === action.id || item.key === action.id);
  let delta = 0;
  const edits = result.splices.map(edit => {const placed = {...edit, at: edit.pos + delta};delta += edit.inserted.length - edit.removed.length;return placed;});
  const position = item => {
    const start = item.span.start;let shift = 0;
    for (const edit of edits) {
      if (start < edit.pos) break;
      if (start < edit.pos + edit.removed.length) {
        if (result.moved) {
          const moved=result.moved.find(range=>range.from===edit.pos&&range.length===edit.removed.length), placed=edits.find(other=>!other.removed&&other.pos===result.moveTo);
          if(moved&&placed)return placed.at+moved.offset+start-edit.pos;
        }
        if (action.kind === 'rename' && item === target && start === edit.pos) return edit.at;
        return null;
      }
      shift += edit.inserted.length - edit.removed.length;
    }
    return start + shift;
  };
  const idMap = Object.create(null);
  for (const item of oldItems) {
    const at = position(item), next = item.kind === 'node' ? after.nodes.find(node => node.key === item.key || item.terminal && node.terminal && node.references.some(ref => ref.start === at))
      : at === null ? null : newItems.find(node => node.kind === item.kind && node.span.start === at);
    idMap[item.id] = next?.id || null;
  }
  const {moved, moveTo, ...change} = result;
  return {...change, idMap, targetId: target ? idMap[target.id] : null};
}

function sequenceActivations(info) {
  const stacks=new Map(), activations=[];
  if(info.family!=='sequence')return activations;
  for(const item of [...info.edges,...info.extras].sort((a,b)=>a.span.start-b.span.start)){
    const start=item.activation==='+'||item.messageType===17,end=item.activation==='-'||item.messageType===18;
    if(!start&&!end)continue;
    const actor=item.actor||(start?item.to:item.from);if(!stacks.has(actor))stacks.set(actor,[]);const stack=stacks.get(actor);
    if(start)stack.push(item);else if(stack.length){const first=stack.pop();activations.push({actor,item:first,end:item,range:{start:first.span.start,end:item.span.end}});}
  }
  for(const [actor,stack]of stacks)for(const first of stack.slice().reverse())activations.push({actor,item:first,end:null,range:{start:first.span.start,end:null}});
  return activations;
}

export function annotateMermaidSVG(svg, source, runtime, model) {
  const info=indexMermaid(source,model);if(!info.ok)return svg;
  const doc=new runtime.DOMParser().parseFromString(svg,'image/svg+xml'),root=doc.documentElement;
  const items=[...info.nodes,...info.edges,...info.extras],byRender=new Map(),serial=new Map();
  for(const item of items){if(item.renderId)byRender.set(item.renderId,item);if(item.connectorId)byRender.set(item.connectorId,item);if(item.kind==='node')byRender.set(item.key,item);}
  const mark=(element,item,range=item.block||item.declaration||item.span)=>{
    if(!range||range.end===null)return;
    const tag=(element.getAttribute('class')||element.localName).split(' ').filter(Boolean).join(':'),key=item.id+':'+tag,at=serial.get(key)||0;serial.set(key,at+1);
    element.setAttribute('data-rapier-id',key+':'+at);element.setAttribute('data-rapier-target',item.id);element.setAttribute('data-rapier-kind',item.kind);
    element.setAttribute('data-rapier-source-start',String(range.start));element.setAttribute('data-rapier-source-end',String(range.end));
  };
  const markTree=(element,item)=>{mark(element,item);for(const part of element.querySelectorAll('rect,path,line,polyline,polygon,circle,ellipse,text'))mark(part,item);};
  for(const element of root.querySelectorAll('[data-id]')){const item=byRender.get(element.getAttribute('data-id'));if(item)markTree(element,item);}
  const activations=sequenceActivations(info).map(item=>({...item,range:{...item.range,end:item.range.end??source.length}}));
  const usedActivation=new Set();for(const element of root.querySelectorAll('.pele-activation')){
    const entry=activations.find(x=>!usedActivation.has(x)&&x.actor===element.getAttribute('data-id'));
    if(entry){usedActivation.add(entry);mark(element,{...entry.item,kind:'activation'},entry.range);}
  }
  const title=info.extras.find(x=>x.kind==='title');if(title)for(const element of root.querySelectorAll('.pele-title'))markTree(element,title);
  const frames=info.extras.filter(x=>x.kind==='frame').sort((a,b)=>a.block.end-b.block.end),used=new Set();
  for(const element of root.querySelectorAll('.pele-frame')){
    const type=[...element.classList].find(c=>c.startsWith('pele-frame-'))?.slice(11);
    const item=frames.find(x=>!used.has(x)&&x.frameKind.split(' ')[0]===type);if(!item)continue;used.add(item);markTree(element,item);
    const branches=info.extras.filter(x=>x.kind==='branch'&&x.statement.scope===item.id), labels=[...element.querySelectorAll('.pele-frame-label')];
    if(labels.length===branches.length+1)branches.forEach((branch,index)=>mark(labels[index],branch));
  }
  const cardinalities=info.edges.flatMap(edge=>(edge.cardinalities||[]).filter(Boolean).map(range=>({edge,range,text:source.slice(range.start,range.end)}))),usedCard=new Set();
  for(const element of root.querySelectorAll('.pele-cardinality')){
    const entry=cardinalities.find(x=>!usedCard.has(x)&&x.text===element.textContent);if(entry){usedCard.add(entry);mark(element,entry.edge,entry.range);}
  }
  const authoredText=text=>new runtime.DOMParser().parseFromString('<!doctype html><body>'+text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/#([A-Za-z][A-Za-z0-9]*|\d+);/g,(_,code)=>'&'+(/^\d+$/.test(code)?'#':'')+code+';'),'text/html').body.textContent;
  for(const element of root.querySelectorAll('.pele-class,.pele-state')){
    const actor=element.getAttribute('data-id'),members=info.extras.filter(x=>x.actor===actor&&['member','description','annotation'].includes(x.kind));
    const usedMembers=new Set(),plain=s=>s.replace(/~([^~]+)~/g,'<$1>').replace(/[«»]/g,'').replace(/[\s:]+/g,'').replace(/[$*]$/,'');
    for(const text of element.querySelectorAll('text')){
      const kind=text.classList.contains('pele-member')?'member':text.classList.contains('pele-annotation')?'annotation':element.classList.contains('pele-state')?'description':null;
      const item=members.find(x=>x.kind===kind&&!usedMembers.has(x)&&x.label&&plain(authoredText(source.slice(x.label.start,x.label.end)))===plain(text.textContent));
      if(item){usedMembers.add(item);mark(text,item);}
    }
  }
  return new runtime.XMLSerializer().serializeToString(root);
}
