// SPDX-License-Identifier: MIT
// The browser supplies the column and physical pixel grid; rendering remains synchronous and pure.
const mathBrowserStates=new WeakMap(),mathBrowserDocuments=new WeakMap(),mathRuleOriginals=new WeakMap();
const mathSvgSelector='svg[data-rapier-math]:not([data-math-error])';

function mathElements(root) {
  return [...(root?.matches?.(mathSvgSelector)?[root]:[]),...root?.querySelectorAll?.(mathSvgSelector) || []];
}

function mathColumn(svg) {
  const view=svg.ownerDocument.defaultView;
  for(let node=svg.parentElement;node;node=node.parentElement) {
    const style=view.getComputedStyle(node);
    if(style.display==='contents' || style.display==='inline' || node.matches('.math-rendered'))continue;
    return node;
  }
  return svg.ownerDocument.documentElement;
}

function mathDarkPaper(svg) {
  const view=svg.ownerDocument.defaultView;
  if(view.matchMedia('(forced-colors: active)').matches || view.matchMedia('(prefers-contrast: more)').matches)return false;
  for(let node=svg.parentElement;node;node=node.parentElement) {
    const style=view.getComputedStyle(node),color=style.backgroundColor.match(/[\d.]+/g)?.map(Number);
    if(style.backgroundImage!=='none')return false;
    if(!color || color.length<3 || (color[3] ?? 1)<1)continue;
    const rgb=color.slice(0,3).map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722<.18;
  }
  return false;
}

function mathSnapRule(original, matrix, ratio) {
  if (!original.width || !original.height || !matrix || !matrix.a || !matrix.d ||
      Math.abs(matrix.b) + Math.abs(matrix.c) > 1e-6 || !(ratio > 0)) return null;
  const snap = value => Math.round(value * ratio) / ratio;
  const x = (snap(original.x * matrix.a + matrix.e) - matrix.e) / matrix.a;
  const y = (snap(original.y * matrix.d + matrix.f) - matrix.f) / matrix.d;
  const width = Math.max(1 / ratio, snap(original.width * Math.abs(matrix.a))) / Math.abs(matrix.a);
  const height = Math.max(1 / ratio, snap(original.height * Math.abs(matrix.d))) / Math.abs(matrix.d);
  return {x, y, width, height, d: 'M' + mathNumber(x) + ' ' + mathNumber(y) + 'h' + mathNumber(width) +
    'v' + mathNumber(height) + 'h' + mathNumber(-width) + 'Z'};
}

function mathSnapRules(svg) {
  const ratio=svg.ownerDocument.defaultView.devicePixelRatio || 1;
  for(const rule of svg.querySelectorAll('[data-math-rule],[data-math-line]')) {
    let original=mathRuleOriginals.get(rule);
    if(!original) {
      const box=rule.getBBox(), axis=rule.getAttribute('data-math-line'), thickness=Number(rule.getAttribute('stroke-width'));
      original={x:box.x,y:box.y,width:box.width,height:box.height,axis};
      if(axis==='horizontal') {original.y-=thickness/2;original.height=thickness;}
      if(axis==='vertical') {original.x-=thickness/2;original.width=thickness;}
      mathRuleOriginals.set(rule,original);
    }
    const snapped=mathSnapRule(original,rule.getScreenCTM(),ratio);
    if(!snapped)continue;
    let path=snapped.d;
    if(original.axis==='horizontal') {
      path='M'+mathNumber(snapped.x)+' '+mathNumber(snapped.y+snapped.height/2)+'h'+mathNumber(snapped.width);
      rule.setAttribute('stroke-width',mathNumber(snapped.height));
    }
    if(original.axis==='vertical') {
      path='M'+mathNumber(snapped.x+snapped.width/2)+' '+mathNumber(snapped.y)+'v'+mathNumber(snapped.height);
      rule.setAttribute('stroke-width',mathNumber(snapped.width));
    }
    rule.setAttribute('d',path);
    rule.setAttribute('shape-rendering','crispEdges');
  }
}

function mathFitElement(svg, printing = false) {
  if(!svg.isConnected)return null;
  const doc=svg.ownerDocument,view=doc.defaultView,column=mathColumn(svg),style=view.getComputedStyle(column),font=parseFloat(view.getComputedStyle(svg).fontSize);
  const available=column.clientWidth-(parseFloat(style.paddingLeft) || 0)-(parseFloat(style.paddingRight) || 0);
  if(!(available>0 && font>0))return column;
  const width=Math.max(.1,(available-.25)/font),source=svg.getAttribute('aria-label'),display=svg.getAttribute('data-rapier-math')==='display';
  const dark=!printing && mathDarkPaper(svg),ratio=view.devicePixelRatio || 1;
  const screen=printing?undefined:{fontSize:font/mathFontRatio,pixelRatio:ratio,dark};
  const screenKey=printing?'':mathNumber(font)+'|'+mathNumber(ratio)+'|'+dark;
  let state=mathBrowserStates.get(svg);
  if(!state || state.source!==source) {
    state={source,natural:Number(svg.getAttribute('data-math-natural-width')) || Infinity,width:Number(svg.getAttribute('data-math-max-width')) || null,
      screen:svg.getAttribute('data-math-screen') || ''};
    mathBrowserStates.set(svg,state);
  }
  const target=state.natural>width?width:null;
  if(screenKey!==state.screen || (target===null)!==(state.width===null) || target!==null && Math.abs(target-state.width)>.005) {
    const rendered=renderMath(source,{displayMode:display,maxWidth:(screenKey!==state.screen?width:target) || undefined,screen});
    if(!rendered.errors.length) {
      const replacement=new view.DOMParser().parseFromString(rendered.svg,'image/svg+xml').documentElement;
      for(const name of ['width','height','viewBox','data-math-natural-width','data-math-max-width','data-math-lines','data-math-screen']) {
        if(replacement.hasAttribute(name))svg.setAttribute(name,replacement.getAttribute(name));else svg.removeAttribute(name);
      }
      svg.style.verticalAlign=replacement.style.verticalAlign;
      svg.replaceChildren(...Array.from(replacement.childNodes,node=>doc.importNode(node,true)));
      state.natural=Number(svg.getAttribute('data-math-natural-width'));state.screen=screenKey;
      state.width=state.natural>width?width:null;
      if(state.width===null)svg.removeAttribute('data-math-max-width');
    }
  }
  const opacity=dark?'.94':'1';
  svg.style.fillOpacity=opacity;svg.style.strokeOpacity=opacity;
  for(const node of svg.querySelectorAll('[fill],[color],[stroke]')) {
    if(['fill','color','stroke'].some(name=>node.hasAttribute(name) && !['none','currentColor','inherit'].includes(node.getAttribute(name)))) {
      node.setAttribute('fill-opacity','1');node.setAttribute('stroke-opacity','1');
    }
  }
  if(!printing)mathSnapRules(svg);
  return column;
}

function mathFit(root) {
  const nodes=mathElements(root);
  for(const svg of nodes)mathFitElement(svg,svg.ownerDocument.defaultView.matchMedia('print').matches);
  return nodes.length;
}

function mathObserve(root) {
  const doc=root?.ownerDocument || root,view=doc?.defaultView;
  if(!view)return ()=>{};
  let state=mathBrowserDocuments.get(doc);
  if(!state) {
    const nodes=new Map(),columns=new Set();let frame=0,printing=false;
    const refresh=()=> {
      frame=0;
      for(const [svg,column] of nodes) {
        if(!svg.isConnected) {nodes.delete(svg);continue;}
        const next=mathFitElement(svg,printing);if(next)nodes.set(svg,next);
      }
      const wanted=new Set(nodes.values());
      for(const column of columns)if(!wanted.has(column)) {resize.unobserve(column);columns.delete(column);}
      for(const column of wanted)if(!columns.has(column)) {resize.observe(column);columns.add(column);}
    };
    const schedule=()=>{if(!frame)frame=view.requestAnimationFrame(refresh);};
    const resize=new view.ResizeObserver(schedule),theme=new view.MutationObserver(records=>{
      if(records.some(({target})=>[...nodes.keys()].some(svg=>target!==svg && target.contains(svg))))schedule();
    });
    theme.observe(doc.documentElement,{subtree:true,attributes:true,attributeFilter:['class','style','data-rapier-theme','data-md-theme']});
    view.addEventListener('resize',schedule,{passive:true});
    view.addEventListener('beforeprint',()=>{printing=true;refresh();});view.addEventListener('afterprint',()=>{printing=false;schedule();});
    for(const query of ['(forced-colors: active)','(prefers-contrast: more)','(prefers-color-scheme: dark)'])view.matchMedia(query).addEventListener('change',schedule);
    doc.fonts?.addEventListener('loadingdone',schedule);
    state={nodes,schedule};mathBrowserDocuments.set(doc,state);
  }
  const nodes=mathElements(root);
  for(const svg of nodes)state.nodes.set(svg,mathColumn(svg));
  state.schedule();
  return ()=>{for(const svg of nodes)state.nodes.delete(svg);state.schedule();};
}
