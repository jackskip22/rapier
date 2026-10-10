// SPDX-License-Identifier: MIT
// Boxes use ems, a baseline at y=0 and a downward SVG axis. Font outlines stay in font units.
const mathNumber = n => {
  if (!Number.isFinite(n)) throw new Error('Math geometry is not finite');
  const scaled = n * 1e6;
  return String((Number.isFinite(scaled) ? Math.round(scaled) / 1e6 : n) || 0);
};
const mathEscape = s => String(s).replace(/[&<>"'\t\n\r]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','\t':'&#9;','\n':'&#10;','\r':'&#13;'}[c]));
const mathFontRatio = (MATH_FONT.textXHeight / MATH_FONT.textUnits) / (MATH_FONT.xHeight / MATH_FONT.units);
function mathScale(c) {
  if (!c.level) return c.size;
  const scale = MATH_FONT.constants[c.level === 1 ? 'ScriptPercentScaleDown' : 'ScriptScriptPercentScaleDown'] / 100;
  return c.size * (c.screen ? Math.max(scale, Math.min(1, (c.level === 1 ? 12 : 10) / c.screen.fontSize)) : scale);
}

function mathScreenStroke(c) {
  if (!c.screen) return 0;
  const {fontSize, pixelRatio, dark} = c.screen, size = fontSize * mathScale(c);
  if (!(size > 0)) return 0;
  const small = Math.max(0, Math.min(1, (32 - size) / 16));
  const hairline = MATH_FONT.constants.FractionRuleThickness / MATH_FONT.units * size;
  return small * ((dark ? .18 : .09) / Math.sqrt(pixelRatio) + Math.max(0, (dark ? 1 : .85) / pixelRatio - hairline) * .35) / fontSize;
}
const mathConstant = (name, c, fallback) => (MATH_FONT.constants[name] ?? fallback * MATH_FONT.units) / MATH_FONT.units * mathScale(c);
const mathScriptStyle = (c, cramped = c.cramped) => ({...c, level: Math.min(2, c.level + 1), display: false, cramped});
const mathScreenRelayout = (n,c,ratio) => mathLayout(n,{...c,screen:{...c.screen,fontSize:c.screen.fontSize*ratio},cache:new WeakMap()});
const mathBox = (w = 0, h = 0, d = 0, svg = '', extra = {}) => ({w, h, d, svg, left: 0, right: w, inkTop: -h, inkBottom: d, class: 'ord', ...extra});
const mathMove = (b, x, y) => b.svg ? '<g transform="translate(' + mathNumber(x) + ' ' + mathNumber(y) + ')">' + b.svg + '</g>' : '';

function mathCompose(items, width, extra = {}) {
  let h = 0, d = 0, left = 0, right = width, inkTop=Infinity, inkBottom=-Infinity, svg = '';
  for (const [b, x, y] of items) {
    if(svg.length+b.svg.length+128>8*1024*1024)throw Object.assign(new Error('Mathematical composition exceeds the SVG budget'),{code:'resource-limit'});
    h = Math.max(h, b.h - y); d = Math.max(d, b.d + y);
    left = Math.min(left, x + b.left); right = Math.max(right, x + b.right);
    if(b.svg) {inkTop=Math.min(inkTop,b.inkTop+y);inkBottom=Math.max(inkBottom,b.inkBottom+y);}
    svg += mathMove(b, x, y);
  }
  const single=items.length===1?items[0]:null,b=single?.[0];
  const glyph=b?.glyph===undefined?{}:{glyph:b.glyph,unitScale:b.unitScale,glyphX:(b.glyphX || 0)+single[1],glyphY:(b.glyphY || 0)+single[2],extended:b.extended,scriptBase:b.scriptBase,stroke:b.stroke};
  return mathBox(width, h, d, svg, {left, right, inkTop:Number.isFinite(inkTop)?inkTop:-h, inkBottom:Number.isFinite(inkBottom)?inkBottom:d,...glyph,...extra});
}

function mathStyledCodePoint(cp, variant) {
  const ranges = {
    italic: [0x1d434, 0x1d44e, null], bold: [0x1d400, 0x1d41a, 0x1d7ce],
    'bold-italic': [0x1d468, 0x1d482, null], script: [0x1d49c, 0x1d4b6, null],
    'bold-script': [0x1d4d0, 0x1d4ea, null], fraktur: [0x1d504, 0x1d51e, null],
    'bold-fraktur': [0x1d56c, 0x1d586, null], 'double-struck': [0x1d538, 0x1d552, 0x1d7d8],
    'sans-serif': [0x1d5a0, 0x1d5ba, 0x1d7e2], 'sans-serif-bold': [0x1d5d4, 0x1d5ee, 0x1d7ec],
    'sans-serif-italic': [0x1d608, 0x1d622, null], 'sans-serif-bold-italic': [0x1d63c, 0x1d656, null],
    monospace: [0x1d670, 0x1d68a, 0x1d7f6],
  };
  const legacy = {
    italic: {104: 0x210e},
    script: {66:0x212c,69:0x2130,70:0x2131,72:0x210b,73:0x2110,76:0x2112,77:0x2133,82:0x211b,101:0x212f,103:0x210a,111:0x2134},
    fraktur: {67:0x212d,72:0x210c,73:0x2111,82:0x211c,90:0x2128},
    'double-struck': {67:0x2102,72:0x210d,78:0x2115,80:0x2119,81:0x211a,82:0x211d,90:0x2124},
  };
  if (variant === 'normal') variant = 'italic';
  if (legacy[variant]?.[cp] !== undefined) return legacy[variant][cp];
  const r = ranges[variant];
  if (r) {
    if (cp >= 65 && cp <= 90) return r[0] + cp - 65;
    if (cp >= 97 && cp <= 122) return r[1] + cp - 97;
    if (r[2] && cp >= 48 && cp <= 57) return r[2] + cp - 48;
  }
  const greek = {bold:0x1d6a8, italic:0x1d6e2, 'bold-italic':0x1d71c, 'sans-serif-bold':0x1d756, 'sans-serif-bold-italic':0x1d790}[variant];
  if (greek !== undefined) {
    if (cp >= 0x391 && cp <= 0x3a9 && cp !== 0x3a2) return greek + cp - 0x391;
    if (cp >= 0x3b1 && cp <= 0x3c9) return greek + 26 + cp - 0x3b1;
    const special = [0x2207,0x2202,0x3f5,0x3d1,0x3f0,0x3d5,0x3f1,0x3d6].indexOf(cp);
    if (special === 0) return greek + 25;
    if (special > 0) return greek + 50 + special;
  }
  return cp;
}

function mathGlyphIndex(id, c, extra = {}) {
  if(c.dotless)id=MATH_FONT.dotless?.[id] ?? id;
  const alternates=MATH_FONT.scriptAlternates[id];
  const pixels=c.screen?c.screen.fontSize*mathScale(c):Infinity,
    optical=Math.max(c.level,pixels<10?2:pixels<15?1:0);
  if(optical && alternates)id=alternates[Math.min(optical,alternates.length)-1];
  if(c.flattenAccent)id=MATH_FONT.flatAccents[id] ?? id;
  const g = MATH_FONT.glyphs[id], s = mathScale(c) / MATH_FONT.units, stroke = mathScreenStroke(c), radius = stroke / 2;
  if (!g) throw Object.assign(new Error('Unsupported mathematical glyph'), {code:'unsupported-glyph'});
  if(c.budget) {
    c.budget.outlineBytes=(c.budget.outlineBytes || 0)+g[7].length+96;
    if(c.budget.outlineBytes>4*1024*1024)throw Object.assign(new Error('Mathematical outlines exceed the rendering budget'),{code:'resource-limit'});
  }
  const svg = g[7] ? '<path d="' + g[7] + '" transform="scale(' + mathNumber(s) + ' ' + mathNumber(-s) + ')"'+
    (c.screen ? ' data-math-ink="' + mathNumber(mathScale(c)) + '"' : '') +
    (stroke ? ' stroke="currentColor" stroke-width="' + mathNumber(stroke / s) + '" stroke-linejoin="round" paint-order="stroke fill"' : '') + '/>' : '';
  return mathBox(g[0] * s, Math.max(0, g[4] * s + radius), Math.max(0, -g[2] * s + radius), svg,
    {left: Math.min(0,g[1]*s-radius), right: Math.max(g[0]*s,g[3]*s+radius), inkTop:-g[4]*s-radius, inkBottom:-g[2]*s+radius, italic: g[5]*s, stroke,
      accent: g[6] == null ? g[0]*s/2 : g[6]*s,glyph:id,unitScale:s,glyphX:0,glyphY:0,extended:!!MATH_FONT.extendedShapes[id],...extra});
}

function mathGlyph(value, c, extra = {}) {
  if ([...value].length !== 1) return mathText(value, c, extra);
  const cp = value.codePointAt(0), mapped = mathStyledCodePoint(cp, extra.variant || c.variant);
  const id = MATH_FONT.chars[mapped] ?? MATH_FONT.chars[cp];
  if (id === undefined) {
    const composed = mathFallbackGlyph(value, c, extra);
    if (composed) return composed;
    const e = new Error('Unsupported character U+' + cp.toString(16).toUpperCase());
    e.code = 'unsupported-glyph'; e.command = value; throw e;
  }
  return mathGlyphIndex(id, c, extra);
}

function mathText(value, c, extra = {}) {
  const items = []; let x = 0;
  for (const ch of String(value)) {
    if (/\s/u.test(ch)) { x += mathScale(c)*0.25; continue; }
    const b = mathGlyph(ch, {...c, variant: extra.variant || 'roman'});
    items.push([b,x,0]); x += b.w;
  }
  return mathCompose(items,x,{class:extra.class || 'ord',limits:extra.limits,...extra});
}

function mathRule(w, thickness, y = 0) {
  return mathBox(w, Math.max(0, -y), Math.max(0,y+thickness),
    '<path data-math-rule="" d="M0 ' + mathNumber(y) + 'H' + mathNumber(w) + 'v' + mathNumber(thickness) + 'H0Z"/>',{inkTop:y,inkBottom:y+thickness});
}

function mathStretch(value, target, c, horizontal = false) {
  if (!value || value === '.') return mathBox();
  const cp = value.codePointAt(0), id = MATH_FONT.chars[cp];
  if (id === undefined) return mathFallbackGlyph(value,c,{variant:'roman',stretchTarget:target,
    stretchAxis:horizontal?'horizontal':'vertical'}) || mathGlyph(value,c,{variant:'roman'});
  // Combining accents have no text advance; stretching uses their actual font extent.
  const shape = (glyph, advance) => {
    const b = mathGlyphIndex(glyph,c);
    if (!horizontal || b.w !== 0) return b;
    const g = MATH_FONT.glyphs[b.glyph], unit = b.unitScale, x = -g[1] * unit;
    const width = (advance ?? g[3] - g[1]) * unit;
    return mathCompose([[b,x,0]],width,{italic:b.italic,accent:b.accent+x});
  };
  const natural = shape(id);
  let construction = (horizontal ? MATH_FONT.horizontal : MATH_FONT.vertical)[id];
  const extent = b => horizontal ? b.w : b.inkBottom-b.inkTop;
  if (extent(natural) >= target) return natural;
  // Some donor arrowheads advertise a zero connector on the joining side.
  // Keep their designed heads and extend the drawn shaft instead of joining outside those bounds.
  if(horizontal && '→↔↦'.includes(value) && construction?.assembly?.parts.some((p,i,parts)=>i && Math.min(parts[i-1][2],p[1])<MATH_FONT.minConnectorOverlap))construction=null;
  if (!construction) {
    if(!horizontal || natural.w<=0)return natural;
    // These font glyphs have straight central shafts but no MATH assembly.
    // Preserve both end shapes and widen only a narrow central strip.
    if('=⇌⇋↞↠→↔↦'.includes(value)) {
      const g=MATH_FONT.glyphs[natural.glyph],unit=natural.unitScale,added=target-natural.w,
        split=g[0]*(value==='↞'?0.75:value==='↠'?0.25:0.5),half=g[0]*0.05,
        left=split-half,right=split+half,delta=added/unit;
      // The two-headed arrows have their plain shaft opposite both heads.
      // All decoded font segments are absolute M/L/H/V/C/Z commands.
      const shift=x=>x<=left?x:x>=right?x+delta:x+(x-left)*delta/(right-left);
      let command='',coordinate=0;
      const path=g[7].replace(/[MLHVCZ]|-?\d+(?:\.\d+)?/g,token=>{
        if(/[MLHVCZ]/.test(token)){command=token;coordinate=0;return token;}
        const isX=command!=='V' && (command==='H' || coordinate%2===0);coordinate++;
        return isX?mathNumber(shift(Number(token))):token;
      });
      const svg='<path d="'+path+'" transform="scale('+mathNumber(unit)+' '+mathNumber(-unit)+')"'+
        (c.screen?' data-math-ink="'+mathNumber(mathScale(c))+'"':'')+
        (natural.stroke?' stroke="currentColor" stroke-width="'+mathNumber(natural.stroke/unit)+'" stroke-linejoin="round" paint-order="stroke fill"':'')+'/>';
      return {...natural,w:target,right:natural.right+added,accent:target/2,svg,glyph:undefined};
    }
    const ratio=target/natural.w;
    return {...natural,w:target,left:natural.left*ratio,right:natural.right*ratio,accent:(natural.accent ?? natural.w/2)*ratio,
      svg:'<g transform="scale('+mathNumber(ratio)+' 1)">'+natural.svg+'</g>',glyph:undefined};
  }
  let last = natural;
  for (const [glyph,advance] of construction.variants || []) {
    last = shape(glyph,advance);
    if (advance * mathScale(c) / MATH_FONT.units >= target) return last;
  }
  const a = construction.assembly;
  if (!a?.parts?.length || !a.parts.some(p=>p[4])) {
    // A wide accent may outgrow its final designed variant without an extender.
    // Expand only its horizontal outline; retain the font's vertical stroke shape.
    if (horizontal && last.w>0 && target>last.w) {
      const ratio=target/last.w;
      return {...last,w:target,left:last.left*ratio,right:last.right*ratio,accent:(last.accent ?? last.w/2)*ratio,
        svg:'<g transform="scale('+mathNumber(ratio)+' 1)">'+last.svg+'</g>',glyph:undefined};
    }
    return last;
  }
  const unit = mathScale(c)/MATH_FONT.units, wanted = target/unit;
  const minOverlap = MATH_FONT.minConnectorOverlap || 0;
  const extenders=a.parts.filter(p=>p[4]),fixed=a.parts.filter(p=>!p[4]),
    fixedAdvance=fixed.reduce((sum,p)=>sum+p[3],0),growth=extenders.reduce((sum,p)=>sum+p[3]-minOverlap,0);
  if(growth<=0)return last;
  const repeats=Math.max(0,Math.ceil((wanted-fixedAdvance+minOverlap*(fixed.length-1))/growth));
  if (repeats >= 2048) throw Object.assign(new Error('Mathematical delimiter is too large'),{code:'resource-limit'});
  const pieces=a.parts.flatMap(p=>p[4]?Array.from({length:repeats},()=>p):[p]),
    full=pieces.reduce((sum,p)=>sum+p[3],0),connections=pieces.slice(1).map((p,i)=>Math.min(pieces[i][2],p[1]));
  if(connections.some(overlap=>overlap<minOverlap))return last;
  const overlap=connections.length?Math.max(minOverlap,Math.min((full-wanted)/connections.length,...connections)):0,
    length=(full-overlap*connections.length)*unit;
  const items=[]; let pos=0, width=0;
  for (let i=0;i<pieces.length;i++) {
    const p=pieces[i], b=mathGlyphIndex(p[0],c), g=MATH_FONT.glyphs[b.glyph];
    if (horizontal) items.push([b,pos,0]);
    else items.push([b,0,-pos+g[2]*unit]);
    width=Math.max(width,b.w);
    pos+=(p[3]-overlap)*unit;
  }
  return mathCompose(items,horizontal?length:width,{italic:(a.italic || 0)*unit,
    ...(horizontal?{accent:length/2,stretchAxis:'horizontal'}:{h:length,d:0,extended:true})});
}

function mathDelimiter(value, target, c) {
  if(!value || value==='.')return mathBox();
  const b=mathStretch(value,target,c), axis=mathConstant('AxisHeight',c,0.25);
  return mathCompose([[b,0,-(b.inkTop+b.inkBottom)/2-axis]],b.w,{class:'inner',extended:true,italic:b.italic});
}

// The TeXbook's inter-atom spacing table (chapter 18). Rows: the left atom; columns: the right atom, in
// MATH_ATOM_CLASSES order. 0 = none, 1 = thin, a = thin, b = medium, c = thick. A letter spaces only in
// display and text styles; a digit spaces in every style. * cannot occur: a Bin beside these becomes Ord.
const MATH_ATOM_CLASSES = ['ord','op','bin','rel','open','close','punct','inner'];
const MATH_ATOM_SPACING = {
  ord: '01bc000a', op: '11*c000a', bin: 'bb**b**b', rel: 'cc*0c00c',
  open: '00000000', close: '01bc000a', punct: 'aa*aaaaa', inner: 'a1bca0aa'
};
function mathSpace(left, right, c) {
  const column=MATH_ATOM_CLASSES.indexOf(right);
  if (!left || !right || !MATH_ATOM_SPACING[left] || column<0) return 0;
  const code=MATH_ATOM_SPACING[left][column], s=mathScale(c);
  if (code==='0' || code==='*') return 0;
  if (code==='1') return s*3/18;
  if (c.level) return 0;
  return s*({a:3,b:4,c:5})[code]/18;
}

function mathRow(children,c) {
  const boxes=children.map(n=>{
    const box=mathLayout(n,c);
    if(c.screen)box.refit=ratio=>mathScreenRelayout(n,c,ratio);
    if(n.type==='frac' && n.bar!==false && n.barThickness!==0 && !n.left && !n.right)box.flowWrap=width=>mathFraction(n,c,width);
    if(n.type==='fence' && !n.size)box.flowWrap=width=>mathResponsiveLayout(n,c,width);
    return box;
  });
  const significant=boxes.map((b,i)=>b.space?null:i).filter(i=>i!==null);
  for (let k=0;k<significant.length;k++) {
    const i=significant[k], b=boxes[i];
    if (b.class!=='bin') continue;
    const before=boxes[significant[k-1]]?.class, after=boxes[significant[k+1]]?.class;
    if (!before || ['bin','op','rel','open','punct'].includes(before) || !after || ['rel','close','punct'].includes(after)) b.class='ord';
  }
  const items=[];let x=0,previous=null;
  for (const b of boxes) {
    if (!b.space) {
      if(previous?.italic && previous.class!=='op' && !(b.italic && b.class!=='op'))x+=previous.italic;
      x+=mathSpace(previous?.class,b.class,c);
    }
    items.push([b,x,0]);x+=b.w;
    if (!b.space) previous=b;
  }
  const last=boxes.at(-1);
  return mathCompose(items,x,{class:boxes.length===1?boxes[0].class:'ord',italic:boxes.length!==1 && last?.class==='op'?0:last?.italic || 0,rowItems:items,
    ...(boxes.length===1 ? {accent:last.accent,limits:last.limits,large:last.large,scriptBase:last.scriptBase} : {})});
}

function mathKern(b,corner,height) {
  const record=MATH_FONT.kern?.[b.glyph]?.[corner];
  if (!record || !b.unitScale) return 0;
  const [heights,values]=record; let i=0;
  while (i<heights.length && (height+(b.glyphY || 0))/b.unitScale>=heights[i]) i++;
  return (values[i] || 0)*b.unitScale;
}

function mathContourBands(box, dy = 0) {
  const profile = MATH_FONT.edgeProfiles[box.glyph];
  if (!profile || !box.unitScale || box.extended) return null;
  const bands = [], step = MATH_FONT.edgeStep, unit = box.unitScale;
  const x = box.glyphX || 0, y = (box.glyphY || 0) + dy, radius = (box.stroke || 0) / 2;
  for (let i = profile.length - 1; i > 0; i--) if (profile[i]) {
    bands.push({top: y - (profile[0] + i * step) * unit - radius,
      bottom: y - (profile[0] + (i - 1) * step) * unit + radius,
      left: x + profile[i][0] * unit - radius, right: x + profile[i][1] * unit + radius});
  }
  return bands;
}

function mathContourScript(base, script, dy, nominal, c) {
  const a = mathContourBands(base);
  if (!a) return nominal;
  const b = mathContourBands(script, dy) || [{top: script.inkTop + dy, bottom: script.inkBottom + dy,
    left: script.left, right: script.right}];
  const gap = c.screen ? Math.max(.035 * mathScale(c), .9 / (c.screen.fontSize * c.screen.pixelRatio)) : .025 * mathScale(c);
  let j = 0, edge = -Infinity;
  for (const left of a) {
    while (j < b.length && b[j].bottom + gap < left.top) j++;
    for (let k = j; k < b.length && b[k].top <= left.bottom + gap; k++) {
      if (b[k].bottom + gap >= left.top) edge = Math.max(edge, left.right - b[k].left);
    }
  }
  return Number.isFinite(edge) ? Math.max(base.glyphX || 0, edge + gap) : nominal;
}

function mathScripts(n,c) {
  const b=mathLayout(n.base,c), up=n.sup?mathLayout(n.sup,mathScriptStyle(c)):null,
    down=n.sub?mathLayout(n.sub,mathScriptStyle(c,true)):null;
  const limits=n.limits || b.limits, stack=limits==='always' || (limits==='display' && c.display && c.level===0);
  if (stack) {
    const w=Math.max(b.w,up?.w || 0,down?.w || 0), items=[[b,(w-b.w)/2,0]], ic=b.italic || 0;
    if (up) {
      const y=-b.h-Math.max(mathConstant('UpperLimitBaselineRiseMin',c,0.6),mathConstant('UpperLimitGapMin',c,0.15)+up.d);
      items.push([up,(w-up.w)/2+ic/2,y]);
    }
    if (down) {
      const y=b.d+Math.max(mathConstant('LowerLimitBaselineDropMin',c,0.6),mathConstant('LowerLimitGapMin',c,0.15)+down.h);
      items.push([down,(w-down.w)/2-ic/2,y]);
    }
    return mathCompose(items,w,{class:b.class});
  }
  const base=b.scriptBase || b,baseAscent=-base.inkTop,baseDescent=base.inkBottom,
    upDescent=up?.inkBottom || 0,downAscent=-(down?.inkTop || 0),boxed=base.glyph===undefined || base.extended;
  let rise=up?Math.max(mathConstant(c.cramped?'SuperscriptShiftUpCramped':'SuperscriptShiftUp',c,0.36),
    upDescent+mathConstant('SuperscriptBottomMin',c,0.1),boxed?baseAscent-mathConstant('SuperscriptBaselineDropMax',c,0.25):0):0;
  let drop=down?Math.max(mathConstant('SubscriptShiftDown',c,0.2),
    downAscent-mathConstant('SubscriptTopMax',c,0.4),boxed?baseDescent+mathConstant('SubscriptBaselineDropMin',c,0.1):0):0;
  if (up && down) {
    const missing=mathConstant('SubSuperscriptGapMin',c,0.2)-(rise+drop-upDescent-downAscent);
    if(missing>0) {
      const shift=Math.min(missing,Math.max(0,mathConstant('SuperscriptBottomMaxWithSubscript',c,0.35)-(rise-upDescent)));
      rise+=shift;drop+=missing-shift;
    }
  }
  const items=[[b,0,0]]; let w=b.w;
  if (up) {
    const kern=Math.min(mathKern(base,0,rise-upDescent)+mathKern(up,3,-upDescent),mathKern(base,0,baseAscent)+mathKern(up,3,baseAscent-rise));
    const nominal=b.w+(b.italic || 0)+kern;
    const x=MATH_FONT.kern[base.glyph]?nominal:mathContourScript(base,up,-rise,nominal,c);
    items.push([up,x,-rise]);w=Math.max(w,x+up.w);
  }
  if (down) {
    const kern=Math.min(mathKern(base,2,downAscent-drop)+mathKern(down,1,downAscent),mathKern(base,2,-baseDescent)+mathKern(down,1,drop-baseDescent));
    const nominal=b.w+kern;
    const x=MATH_FONT.kern[base.glyph]?nominal:mathContourScript(base,down,drop,nominal,c);
    items.push([down,x,drop]);w=Math.max(w,x+down.w);
  }
  return mathCompose(items,w+mathConstant('SpaceAfterScript',c,0.05),{class:b.class});
}

function mathFraction(n,c,width) {
  if (n.style) c={...c,level:({display:0,text:0,script:1,scriptscript:2})[n.style],display:n.style==='display',cramped:false};
  const display=c.display && c.level===0, child=display?{...c,display:false}:mathScriptStyle(c);
  const top=width===undefined?mathLayout(n.num,child):mathResponsiveLayout(n.num,child,Math.max(.05,width-.2*mathScale(c))),
    bottom=mathLayout(n.den,{...child,cramped:true}),axis=mathConstant('AxisHeight',c,0.25);
  const line=n.bar===false?0:n.barThickness===undefined?mathConstant('FractionRuleThickness',c,0.04):n.barThickness*mathScale(c);
  let rise=mathConstant(line?(display?'FractionNumeratorDisplayStyleShiftUp':'FractionNumeratorShiftUp'):(display?'StackTopDisplayStyleShiftUp':'StackTopShiftUp'),c,display?0.68:0.4),
    drop=mathConstant(line?(display?'FractionDenominatorDisplayStyleShiftDown':'FractionDenominatorShiftDown'):(display?'StackBottomDisplayStyleShiftDown':'StackBottomShiftDown'),c,display?0.68:0.35);
  if (line) {
    rise=Math.max(rise,top.d+axis+line/2+mathConstant(display?'FractionNumDisplayStyleGapMin':'FractionNumeratorGapMin',c,display?0.12:0.06));
    drop=Math.max(drop,bottom.h-axis+line/2+mathConstant(display?'FractionDenomDisplayStyleGapMin':'FractionDenominatorGapMin',c,display?0.12:0.06));
  } else {
    const min=mathConstant(display?'StackDisplayStyleGapMin':'StackGapMin',c,display?0.4:0.15),gap=rise+drop-top.d-bottom.h;
    if (gap<min) {rise+=(min-gap)/2;drop+=(min-gap)/2;}
  }
  const pad=mathScale(c)*0.1,w=Math.max(top.w,bottom.w)+2*pad;
  const numeratorX=n.align==='l'?pad:n.align==='r'?w-pad-top.w:(w-top.w)/2;
  const items=[[top,numeratorX,-rise],[bottom,(w-bottom.w)/2,drop]];
  if (line) items.push([mathRule(w,line,-axis-line/2),0,0]);
  const b=mathCompose(items,w,{class:'inner',innerLines:top.lines || 1,fitted:!!top.fitted});
  if(width!==undefined && c.screen)b.refit=ratio=>mathFraction(n,{...c,screen:{...c.screen,fontSize:c.screen.fontSize*ratio},cache:new WeakMap()},width);
  if (n.left || n.right) return mathFenceBoxes(n.left || '',n.right || '',b,c);
  return b;
}

function mathRoot(n,c) {
  const body=mathLayout(n.body,{...c,cramped:true}),line=mathConstant('RadicalRuleThickness',c,0.04),
    gap=mathConstant(c.display && !c.level?'RadicalDisplayStyleVerticalGap':'RadicalVerticalGap',c,0.1),extra=mathConstant('RadicalExtraAscender',c,0.05);
  const sign=mathStretch('√',body.h+body.d+gap+line,c),rise=-sign.inkTop-body.h-gap-line,
    index=n.index?mathLayout(n.index,{...c,level:2,display:false}):null;
  let before=0,idxX=0;
  if(index) {idxX=Math.max(0,mathConstant('RadicalKernBeforeDegree',c,0.2));before=idxX+index.w+Math.max(-index.w,mathConstant('RadicalKernAfterDegree',c,-0.3));}
  const bodyX=before+sign.w,w=bodyX+body.w,items=[[sign,before,rise],[body,bodyX,0]];
  items.push([mathRule(body.w,line,-body.h-gap-line),bodyX,0]);
  if(index) {const ratio=(MATH_FONT.constants.RadicalDegreeBottomRaisePercent ?? 60)/100;items.push([index,idxX,sign.inkBottom+rise-(sign.inkBottom-sign.inkTop)*ratio-index.inkBottom]);}
  const b=mathCompose(items,w);b.h+=extra;return b;
}

function mathFenceBoxes(left,right,body,c,size) {
  const axis=mathConstant('AxisHeight',c,0.25),reach=Math.max(body.h-axis,body.d+axis),target=size?size*mathScale(c):Math.max(1*mathScale(c),2*reach*0.901,2*reach-0.5*mathScale(c));
  const a=mathDelimiter(left,target,c),b=mathDelimiter(right,target,c);
  return mathCompose([[a,0,0],[body,a.w,0],[b,a.w+body.w,0]],a.w+body.w+b.w,{class:'inner'});
}

function mathAccent(n,c) {
  const position=n.position || 'over';let nucleus=n.base;
  while(nucleus?.type==='style' || (nucleus?.type==='row' && nucleus.children.length===1))nucleus=nucleus.type==='style'?nucleus.body:nucleus.children[0];
  const b=mathLayout(n.base,position==='under'?c:{...c,cramped:true,dotless:nucleus?.type==='glyph' && !n.overlay && /^[\u0300-\u036f\u20d0-\u20ff]$/u.test(n.value)}),s=mathScale(c);
  const semantics={class:n.class || b.class,limits:n.limits || b.limits,italic:b.italic,accent:b.accent,scriptBase:b.scriptBase || b};
  if(n.overlay) {
    const w=Math.max(b.w,0.2*s),line=mathConstant('FractionRuleThickness',c,0.04);
    const rising='M0 '+mathNumber(b.d)+'L'+mathNumber(w)+' '+mathNumber(-b.h),
      falling='M0 '+mathNumber(-b.h)+'L'+mathNumber(w)+' '+mathNumber(b.d);
    let path=n.value==='╲'?falling:n.value==='╳'?rising+falling:rising;
    if(n.value==='↗') {
      const tip=0.2*s;path+='M'+mathNumber(w-tip)+' '+mathNumber(-b.h)+'H'+mathNumber(w)+'v'+mathNumber(tip);
    }
    return {...b,...semantics,svg:b.svg+'<path d="'+path+'" fill="none" stroke="currentColor" stroke-width="'+mathNumber(line)+'"/>'};
  }
  if (n.value==='overline' || n.value==='underline' || n.value==='¯' || n.value==='_') {
    const over=position!=='under',line=mathConstant(over?'OverbarRuleThickness':'UnderbarRuleThickness',c,0.04),gap=mathConstant(over?'OverbarVerticalGap':'UnderbarVerticalGap',c,0.1);
    const y=over?-b.h-gap-line:b.d+gap;
    const result=mathCompose([[b,0,0],[mathRule(b.w,line,y),0,0]],b.w,semantics);
    result[over?'h':'d']+=mathConstant(over?'OverbarExtraAscender':'UnderbarExtraDescender',c,0.04);
    return result;
  }
  const names={hat:'̂',widehat:'̂',tilde:'̃',widetilde:'̃',bar:'̄',vec:'⃗',dot:'̇',ddot:'̈',dddot:'⃛',ddddot:'⃜',acute:'́',grave:'̀',breve:'̆',check:'̌',overbrace:'⏞',underbrace:'⏟',overrightarrow:'→',overleftarrow:'←',overleftrightarrow:'↔'};
  const value=names[n.value] || n.value,accentStyle={...c,flattenAccent:position!=='under' && b.h>mathConstant('FlattenedAccentBaseHeight',c,0.65)},
    a=n.stretch?mathStretch(value,Math.max(b.w,s*0.3),accentStyle,true):mathGlyph(value,accentStyle,{variant:'roman'}),
    x=(b.accent ?? b.w/2)-(a.accent ?? a.w/2),combining=/^[\u0300-\u036f\u20d0-\u20ff]$/u.test(value);
  let y;
  if(position==='under')y=b.d+mathConstant('UnderbarVerticalGap',c,0.1)-a.inkTop;
  else if(combining)y=-Math.max(0,b.h-mathConstant('AccentBaseHeight',c,0.48));
  else y=-b.h-mathConstant('OverbarVerticalGap',c,0.1)-a.inkBottom;
  return mathCompose([[b,0,0],[a,x,y]],b.w,semantics);
}

function mathTable(n,c) {
  const small=/smallmatrix$/.test(n.env) || n.env==='subarray' || n.env==='substack',
    paired=/^(align(?:ed)?(?:at)?|flalign|split)$/.test(n.env),
    display=paired || /^(gather(?:ed)?|eqnarray|multline|equation|drcases|dcases)$/.test(n.env),
    cellStyle={...c,level:small?Math.max(1,c.level):c.level,display:small?false:display};
  const rows=n.rows.map(row=>row.map((cell,i)=>{
    // The second cell in each equation pair continues the first math list.
    // An empty ordinary atom supplies the left neighbour of a leading relation.
    if(paired && i%2) return mathRow([{type:'row',children:[]},...(cell.type==='row'?cell.children:[cell])],cellStyle);
    return mathLayout(cell,cellStyle);
  }));
  const cols=Math.max(n.align?.length || 0,n.pairs?2*n.pairs:0,...rows.map(r=>r.length)),s=mathScale(c),cs=mathScale(cellStyle),
    widths=Array.from({length:cols},(_,i)=>Math.max(0,...rows.map(row=>row[i]?.w || 0))),
    align=n.env==='eqnarray'?Array.from({length:cols},(_,i)=>['r','c','l'][i%3]):n.align || Array(cols).fill('c');
  if(rows.length*(cols+(n.columnInsertions?.length || 0))+(n.columnRules?.length || 0)+(n.rowRules?.length || 0)>100000)
    throw Object.assign(new Error('Array composition exceeds the rendering budget'),{code:'resource-limit'});
  const insertions=Array.from({length:cols+1},()=>[]);
  for(const insertion of n.columnInsertions || []) {
    if(insertion.before<0 || insertion.before>cols) throw Object.assign(new Error('Array insertion exceeds its columns'),{code:'invalid-alignment'});
    insertions[insertion.before].push({...insertion,box:mathLayout(insertion.body,cellStyle)});
  }
  const gaps=Array.from({length:cols+1},(_,i)=>{
    let gap=i===0 || i===cols?0:paired?(i%2?0:/^(alignat|alignedat)$/.test(n.env)?0:2*s):small?cs/3:s;
    if(insertions[i].some(item=>item.replaceGap))gap=0;
    return gap+insertions[i].reduce((sum,item)=>sum+item.box.w,0);
  });
  const starts=[],ends=[],boundaries=[],insertionItems=[];let w=0;
  for(let i=0;i<=cols;i++) {
    const contentWidth=insertions[i].reduce((sum,item)=>sum+item.box.w,0);
    boundaries.push(w+gaps[i]/2);
    let x=w+(gaps[i]-contentWidth)/2;
    for(const item of insertions[i]) {insertionItems.push([item.box,x]);x+=item.box.w;}
    w+=gaps[i];if(i<cols) {starts.push(w);w+=widths[i];ends.push(w);}
  }
  const insertionHeight=Math.max(0,...insertionItems.map(([b])=>b.h)),insertionDepth=Math.max(0,...insertionItems.map(([b])=>b.d)),
    heights=rows.map(row=>Math.max(0.7*cs,insertionHeight,...row.map(b=>b.h))),
    depths=rows.map(row=>Math.max(0.2*cs,insertionDepth,...row.map(b=>b.d))),baselines=[];
  let total=0;
  for(let r=0;r<rows.length;r++) {
    total+=heights[r];baselines.push(total);total+=depths[r];
    if(r+1<rows.length)total+=(small?0.2:0.3)*cs+(n.rowGaps?.[r] || 0)*s;
  }
  const offset=n.position==='t'?-(baselines[0] || 0):n.position==='b'?-(baselines.at(-1) || 0):-total/2-mathConstant('AxisHeight',c,0.25),items=[];
  for(let r=0;r<rows.length;r++) {
    for(let i=0;i<cols;i++) {
      const b=rows[r][i] || mathBox(),a=n.env==='multline' && cols===1?(r===0?'l':r===rows.length-1?'r':'c'):align[i] || 'c',
        dx=a==='r'?widths[i]-b.w:a==='l'?0:(widths[i]-b.w)/2;
      items.push([b,starts[i]+dx,baselines[r]+offset]);
    }
    for(const [b,x] of insertionItems)items.push([b,x,baselines[r]+offset]);
  }
  const line=mathConstant('FractionRuleThickness',c,0.04),ruleCounts=new Map();
  for(const boundary of n.columnRules || []) {
    if(boundary<0 || boundary>cols)throw Object.assign(new Error('Array rule exceeds its columns'),{code:'invalid-rule'});
    const count=ruleCounts.get(boundary) || 0;ruleCounts.set(boundary,count+1);
    const x=boundaries[boundary]+count*0.15*s;
    items.push([mathBox(line/2,0,total,'<path data-math-line="vertical" d="M0 0v'+mathNumber(total)+'" fill="none" stroke="currentColor" stroke-width="'+mathNumber(line)+'"/>',{left:-line/2}),x,offset]);
  }
  ruleCounts.clear();
  for(const rule of n.rowRules || []) {
    const boundary=rule.before,from=rule.from ?? 0,to=rule.to ?? cols;
    if(boundary<0 || boundary>rows.length || from<0 || to>cols)throw Object.assign(new Error('Array rule exceeds its cells'),{code:'invalid-rule'});
    const count=ruleCounts.get(boundary) || 0;ruleCounts.set(boundary,count+1);
    const y=(boundary===0?0:boundary===rows.length?total:(baselines[boundary-1]+depths[boundary-1]+baselines[boundary]-heights[boundary])/2)+offset+count*0.15*s,
      left=from===0?0:boundaries[from],right=to===cols?w:boundaries[to];
    const stroke='<path data-math-line="horizontal" d="M0 0H'+mathNumber(right-left)+'" fill="none" stroke="currentColor" stroke-width="'+mathNumber(line)+'"'+(rule.dashed?' stroke-dasharray="'+mathNumber(.15*s)+' '+mathNumber(.1*s)+'"':'')+'/>';
    items.push([mathBox(right-left,line/2,line/2,stroke),left,y]);
  }
  const b=mathCompose(items,w,{class:'inner',h:Math.max(0,-offset),d:Math.max(0,total+offset)});
  const delimiters={pmatrix:['(',')'],bmatrix:['[',']'],Bmatrix:['{','}'],vmatrix:['|','|'],Vmatrix:['‖','‖'],
    psmallmatrix:['(',')'],bsmallmatrix:['[',']'],Bsmallmatrix:['{','}'],vsmallmatrix:['|','|'],Vsmallmatrix:['‖','‖'],
    cases:['{',''],dcases:['{',''],rcases:['','}'],drcases:['','}']};
  const pair=delimiters[n.env];
  return pair?mathFenceBoxes(pair[0],pair[1],b,c):b;
}

function mathLayout(n,c) {
  if(!n)return mathBox();
  if(c.budget && ++c.budget.nodes>100000)throw Object.assign(new Error('Mathematical layout exceeds the rendering budget'),{code:'resource-limit'});
  switch(n.type) {
    case 'row': return mathRow(n.children,c);
    case 'glyph': {
      if(n.delimiterSize || (n.delimiter && c.delimiterTarget))return {...mathDelimiter(n.value,n.delimiterSize?n.delimiterSize*mathScale(c):c.delimiterTarget,c),class:n.class || 'ord'};
      if(n.stretch)return {...mathStretch(n.value,c.stretchTarget || mathScale(c),c,true),class:n.class || 'rel',limits:n.limits,stretchAxis:'horizontal'};
      let b=mathGlyph(n.value,c,{class:n.class || 'ord',variant:n.variant || (c.variant==='normal'?n.defaultVariant || 'normal':c.variant),large:n.large,limits:n.limits});
      if(n.large && c.display && !c.level) {
        const target=mathConstant('DisplayOperatorMinHeight',c,1.3),a=mathStretch(n.value,target,c);
        b=mathCompose([[a,0,(a.h-a.d)/2-mathConstant('AxisHeight',c,0.25)]],a.w,{class:n.class || 'op',italic:a.italic,limits:n.limits,large:true,glyph:a.glyph,unitScale:a.unitScale});
      }
      return b;
    }
    case 'text': return mathText(n.value,c,{variant:n.variant || (c.variant==='normal'?'roman':c.variant),class:n.class,limits:n.limits});
    case 'space': return mathBox(n.width*mathScale(c),0,0,'',{space:true});
    case 'scripts': return mathScripts(n,c);
    case 'frac': return mathFraction(n,c);
    case 'root': return mathRoot(n,c);
    case 'fence': {
      // A nested fence does not inherit an outer \middle target. Its cached box
      // survives the outer fence's second pass, keeping nested layout linear.
      const cache=c.cache || (c.cache=new WeakMap()),key=[c.size,c.level,c.variant,c.display,c.cramped,c.stretchTarget].join('|');
      let entries=cache.get(n);if(entries?.has(key))return {...entries.get(key)};
      const local={...c,delimiterTarget:undefined};let b=mathLayout(n.body,local);
      if(n.body) {
        const axis=mathConstant('AxisHeight',c,0.25),reach=Math.max(b.h-axis,b.d+axis),target=Math.max(mathScale(c),2*reach*0.901,2*reach-0.5*mathScale(c));
        b=mathLayout(n.body,{...local,delimiterTarget:target});
      }
      b=mathFenceBoxes(n.left,n.right,b,local,n.size);
      if(!entries)cache.set(n,entries=new Map());entries.set(key,b);return {...b};
    }
    case 'accent': return mathAccent(n,c);
    case 'table': return mathTable(n,c);
    case 'style': {
      const style={...c};if(n.variant)style.variant=n.variant;if(n.absoluteSize!==undefined)style.size=n.absoluteSize;if(n.size!==undefined)style.size*=n.size;
      if(n.mathStyle) {style.level=({display:0,text:0,script:1,scriptscript:2})[n.mathStyle];style.display=n.mathStyle==='display';style.cramped=false;}
      const b=mathLayout(n.body,style);if(n.class)b.class=n.class;if(n.limits)b.limits=n.limits;
      if(n.width!==undefined) {
        const width=n.width*mathScale(style),shift=n.align==='right'?width-b.w:n.align==='center'?(width-b.w)/2:0;
        Object.assign(b,mathCompose([[{...b},shift,0]],width,{class:b.class}));
      }
      if(n.border || n.background) {
        const pad=(n.padding ?? 0.2)*mathScale(style),line=mathConstant('FractionRuleThickness',style,0.04),w=b.w+2*pad,h=b.h+b.d+2*pad;
        const border='<path d="M0 '+mathNumber(-b.h-pad)+'H'+mathNumber(w)+'v'+mathNumber(h)+'H0Z" fill="'+(n.background?mathEscape(n.background):'none')+'" fill-opacity="1" stroke-opacity="1"'+(n.border?' stroke="'+mathEscape(n.border)+'" stroke-width="'+mathNumber(line)+'"':'')+'/>';
        Object.assign(b,mathCompose([[{...b},pad,0]],w,{h:b.h+pad,d:b.d+pad,class:b.class}));b.svg=border+b.svg;
      }
      if(n.color)b.svg='<g fill="'+mathEscape(n.color)+'" color="'+mathEscape(n.color)+'" fill-opacity="1" stroke-opacity="1">'+b.svg+'</g>';
      return b;
    }
    case 'overunder': {
      const over=n.over?mathLayout(n.over,mathScriptStyle(c)):null,under=n.under?mathLayout(n.under,mathScriptStyle(c,true)):null,
        b=mathLayout(n.base,{...c,stretchTarget:Math.max(mathScale(c),Math.max(over?.w || 0,under?.w || 0)+0.4*mathScale(c))});
      const w=Math.max(b.w,over?.w || 0,under?.w || 0),items=[[b,(w-b.w)/2,0]],stretched=b.stretchAxis==='horizontal';
      if(over) {
        const rise=stretched?Math.max(mathConstant('StretchStackTopShiftUp',c,0.8),b.h+over.inkBottom+mathConstant('StretchStackGapAboveMin',c,0.1)):
          b.h+over.inkBottom+mathConstant('OverbarVerticalGap',c,0.1);
        items.push([over,(w-over.w)/2,-rise]);
      }
      if(under) {
        const drop=stretched?Math.max(mathConstant('StretchStackBottomShiftDown',c,0.6),b.d-under.inkTop+mathConstant('StretchStackGapBelowMin',c,0.1)):
          b.d-under.inkTop+mathConstant('UnderbarVerticalGap',c,0.1);
        items.push([under,(w-under.w)/2,drop]);
      }
      return mathCompose(items,w,{class:n.class || b.class});
    }
    case 'phantom': {const b=mathLayout(n.body,c);return mathBox(n.mode==='v'?0:b.w,n.mode==='h'?0:b.h,n.mode==='h'?0:b.d);}
    case 'smash': {const b=mathLayout(n.body,c);return {...b,h:n.mode==='b'?b.h:0,d:n.mode==='t'?b.d:0};}
    case 'raise': {const b=mathLayout(n.body,c),s=mathScale(c);return mathCompose([[b,0,-n.amount*s]],b.w,{class:b.class,...(n.height===undefined?{}:{h:n.height*s}),...(n.depth===undefined?{}:{d:n.depth*s})});}
    case 'rule': {const s=mathScale(c);return mathRule(n.width*s,(n.height+n.depth)*s,-n.height*s);}
    case 'link': {const b=mathLayout(n.body,c);const url=new URL(n.href);if(!['http:','https:'].includes(url.protocol))throw Object.assign(new Error('Unsupported equation link'),{code:'unsafe-url'});b.svg='<a href="'+mathEscape(n.href)+'" target="_blank" rel="noopener noreferrer">'+b.svg+'</a>';return b;}
    default: throw Object.assign(new Error('Unsupported maths construct: '+n.type),{code:'unsupported-construct'});
  }
}
