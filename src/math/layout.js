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

function mathScreenStroke(c, scale) {
  if (!c.screen) return 0;
  const {fontSize, pixelRatio, dark} = c.screen, size = fontSize * (scale ?? mathScale(c));
  if (!(size > 0)) return 0;
  const small = Math.max(0, Math.min(1, (32 - size) / 16));
  const hairline = MATH_FONT.constants.FractionRuleThickness / MATH_FONT.units * size;
  return small * ((dark ? .18 : .09) / Math.sqrt(pixelRatio) + Math.max(0, (dark ? 1 : .85) / pixelRatio - hairline) * .35) / fontSize;
}
const mathConstant = (name, c, fallback) => (MATH_FONT.constants[name] ?? fallback * MATH_FONT.units) / MATH_FONT.units * mathScale(c);
const mathScriptStyle = (c, cramped = c.cramped) => ({...c, level: Math.min(2, c.level + 1), display: false, cramped});
const mathScreenRelayout = (n,c,ratio) => mathLayout(n,{...c,screen:{...c.screen,fontSize:c.screen.fontSize*ratio},cache:new WeakMap()});
const mathBox = (w = 0, h = 0, d = 0, svg = '', extra = {}) => ({w, h, d, svg, left: 0, right: w, inkTop: -h, inkBottom: d, class: 'ord', ...extra});
const mathMove = (b, x, y) => !b.svg || x === 0 && y === 0 ? b.svg : '<g transform="translate(' + mathNumber(x) + ' ' + mathNumber(y) + ')">' + b.svg + '</g>';

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

function mathGlyphIndex(id, c, extra = {}) {
  if(c.dotless)id=MATH_FONT.dotless?.[id] ?? id;
  const alternates=MATH_FONT.scriptAlternates[id],scale=mathScale(c);
  const pixels=c.screen?c.screen.fontSize*scale:Infinity,
    optical=Math.max(c.level,pixels<10?2:pixels<15?1:0);
  if(optical && alternates)id=alternates[Math.min(optical,alternates.length)-1];
  const g = MATH_FONT.glyph(id), s = scale / MATH_FONT.units, stroke = mathScreenStroke(c,scale), radius = stroke / 2;
  if (!g) throw Object.assign(new Error('Unsupported mathematical glyph'), {code:'unsupported-glyph'});
  if(c.budget) {
    c.budget.outlineBytes=(c.budget.outlineBytes || 0)+g[7].length+96;
    if(c.budget.outlineBytes>4*1024*1024)throw Object.assign(new Error('Mathematical outlines exceed the rendering budget'),{code:'resource-limit'});
  }
  // A synthetic bold strokes the outline 0.03 em wide and adds 0.06 em of advance; a synthetic italic slants 14 degrees.
  const bold = extra.embolden ? 0.03 * scale : 0, slope = extra.slant ? 0.25 : 0, pen = stroke + bold;
  let svg = g[7] ? '<path d="' + g[7] + '" transform="scale(' + mathNumber(s) + ' ' + mathNumber(-s) + ')"'+
    (c.screen ? ' data-math-ink="' + mathNumber(scale) + '"' : '') +
    (pen ? ' stroke="currentColor" stroke-width="' + mathNumber(pen / s) + '" stroke-linejoin="round" paint-order="stroke fill"' : '') + '/>' : '';
  if (svg && (bold || slope)) svg = '<g transform="translate(' + mathNumber(bold) + ' 0)' + (slope ? ' skewX(-14.04)' : '') + '">' + svg + '</g>';
  const {embolden, slant, ...rest} = extra, r = pen / 2;
  return mathBox(g[0] * s + 2 * bold, Math.max(0, g[4] * s + r), Math.max(0, -g[2] * s + r), svg,
    {left: Math.min(0,g[1]*s-r+bold+slope*g[2]*s), right: Math.max(g[0]*s+2*bold,g[3]*s+r+bold+slope*g[4]*s), inkTop:-g[4]*s-r, inkBottom:-g[2]*s+r, italic: g[5]*s+slope*g[4]*s*0.5, stroke: pen || undefined,
      accent: (g[6] == null ? g[0]*s/2 : g[6]*s)+bold+slope*g[4]*s*0.5,glyph:bold || slope?undefined:id,unitScale:s,glyphX:0,glyphY:0,extended:!!MATH_FONT.extendedShapes[id],...rest});
}

function mathGlyph(value, c, extra = {}) {
  const cp = value.codePointAt(0);
  if (value.length !== (cp > 0xffff ? 2 : 1)) return mathText(value, c, extra);
  const variant = extra.variant || c.variant, mapped = mathStyledCodePoint(cp, variant);
  const styled = MATH_FONT.styledGlyphs[variant]?.[cp];
  if (styled !== undefined) return mathGlyphIndex(styled, c, extra);
  // A styled dotless i or j is the styled letter's dotless form (Unicode has italic ones only).
  const dotless = (cp === 0x1d6a4 || cp === 0x1d6a5) && !/^(normal|italic|roman)$/.test(variant) ? MATH_FONT.dotless[MATH_FONT.chars[mathStyledCodePoint(cp - 0x1d6a4 + 105, variant)]] : undefined;
  if (mapped === cp && !dotless && !/^(normal|roman)$/.test(variant)) {
    const composed = mathStyledLetter(value, c, extra, variant);
    if (composed) return composed;
  }
  const id = dotless ?? MATH_FONT.chars[mapped] ?? MATH_FONT.chars[cp];
  // A letter Unicode gives no bold or italic form (ø, ß, æ, þ) is the font's letter emboldened or slanted.
  if (id !== undefined && mapped === cp && !dotless && /bold|italic/.test(variant || '') && !/script|fraktur|double/.test(variant) && /\p{L}/u.test(value))
    return mathGlyphIndex(id, c, {...extra, embolden: /bold/.test(variant), slant: /italic/.test(variant)});
  if (id === undefined) {
    const composed = mathFallbackGlyph(value, c, extra);
    if (composed) return composed;
    if (MATH_HOST_TEXT.test(value)) return mathHostText(value, c, {...extra, host: true});
    const e = new Error('Unsupported character U+' + cp.toString(16).toUpperCase());
    e.code = 'unsupported-glyph'; e.command = value; throw e;
  }
  return mathGlyphIndex(id, c, extra);
}

// A styled accented letter (bold é) has no styled code point: draw its styled base letter with the font's
// combining marks, as an accent sits on a letter; a mark below hangs from the baseline.
function mathStyledLetter(value, c, extra, variant) {
  // The font has no combining cedilla or ogonek; their spacing forms hang from the baseline the same way.
  const [base, ...marks] = [...value.normalize('NFD')].map(m => MATH_FONT.chars[m.codePointAt(0)] === undefined ? {'\u0327': '¸', '\u0328': '˛'}[m] || m : m);
  const cp = base.codePointAt(0);
  if (!marks.length || mathStyledCodePoint(cp, variant) === cp || !marks.every(m => (/\p{M}/u.test(m) || '¸˛'.includes(m)) && MATH_FONT.chars[m.codePointAt(0)] !== undefined)) return null;
  const glyphs = marks.map(m => mathGlyph(m, c, {variant: 'roman'})), above = glyphs.some(a => a.inkBottom <= 0);
  const b = mathGlyph(base, {...c, dotless: above && /^[ij]$/.test(base)}, extra), items = [[b,0,0]];
  let top = -Math.max(0, b.h - mathConstant('AccentBaseHeight', c, 0.45));
  for (const a of glyphs) {
    const over = a.inkBottom <= 0, x = (over ? b.accent ?? b.w/2 : b.w/2) - (a.accent ?? a.w/2);
    items.push([a, x, over ? top : 0]);
    if (over) top -= a.inkBottom - a.inkTop;
  }
  return mathCompose(items, b.w, {...extra, italic: b.italic, accent: b.accent, glyph: undefined});
}

// Letters, digits, marks and symbols outside the embedded font (CJK, Cyrillic, emoji...) use the reader's
// own serif font. Their advance is estimated, and textLength fits the drawn run to that box exactly.
const MATH_HOST_TEXT = /^[\p{L}\p{N}\p{M}\p{S}\p{P}]+$/u;
const MATH_WIDE_TEXT = /[\p{sc=Han}\p{sc=Hang}\p{sc=Hira}\p{sc=Kana}\p{Emoji_Presentation}\u3000-\u303f\uff01-\uff60]/u;
function mathHostText(value, c, extra = {}) {
  const s = mathScale(c);
  let w = 0;
  for (const ch of value) if (!/\p{M}/u.test(ch)) w += (MATH_WIDE_TEXT.test(ch) ? 1 : /\p{Lu}/u.test(ch) ? 0.72 : 0.52) * s;
  const variant = c.variant || '';
  return mathBox(w, 0.8 * s, 0.2 * s, '<text font-family="' + (/sans/.test(variant) ? 'sans-serif' : variant === 'monospace' ? 'monospace' : 'serif') + '"' +
    (/bold/.test(variant) ? ' font-weight="bold"' : '') + (/italic/.test(variant) ? ' font-style="italic"' : '') +
    ' font-size="' + mathNumber(s) + '" textLength="' + mathNumber(w) +
    '" lengthAdjust="spacingAndGlyphs">' + mathEscape(value) + '</text>', {inkTop: -0.8 * s, inkBottom: 0.2 * s, ...extra});
}

// One word of text: a run of host-font characters stays one text element, keeping its shaping and joining.
function mathTextWord(value, text) {
  const items = []; let x = 0, run = '';
  const flush = () => { if (run) { const b = mathHostText(run, text); items.push([b,x,0]); x += b.w; run = ''; } };
  for (const ch of value) {
    if (run && /\p{M}/u.test(ch)) { run += ch; continue; }
    const b = mathGlyph(ch, text);
    // LaTeX's visible verbatim space retains its TFM box around the same Mono outline.
    if(text.verbatim && ch==='␣')Object.assign(b,{h:79/360*mathScale(text),d:1/9*mathScale(text)});
    if (b.host) { run += ch; continue; }
    flush(); items.push([b,x,0]); x += b.w;
  }
  flush();
  return mathCompose(items,x);
}

// A word's direction from its first strong letter; a word without letters is a number or neutral.
const MATH_RTL = /[\p{sc=Hebrew}\p{sc=Arabic}\p{sc=Syriac}\p{sc=Thaana}\p{sc=Nko}\p{sc=Samaritan}\p{sc=Mandaic}\p{sc=Adlam}\p{sc=Hanifi_Rohingya}]/u;
const mathWordDirection = word => {
  for (const ch of word) if (/\p{L}/u.test(ch)) return MATH_RTL.test(ch) ? 'R' : 'L';
  return /\p{Nd}/u.test(word) ? 'N' : null;
};

function mathText(value, c, extra = {}) {
  // Ordinary text collapses ASCII spaces; TeX ties and verbatim spaces retain each advance.
  const text = {...c, variant: extra.variant || 'roman',verbatim:!!extra.verbatim}, space = mathScale(c)*(text.variant==='monospace'?.525:1/3), words = [];
  // Letters (with their marks and joiners), numbers and punctuation are separate pieces of a word.
  for (const part of String(value).match(/[ \t\r\n]+|\s|[\p{L}\p{M}\p{Cf}]+|\p{Nd}+(?:[.,]\p{Nd}+)*|[^\s\p{L}\p{M}\p{Cf}\p{Nd}]+/gu) || [])
    words.push(/^\s+$/u.test(part) ? {w: part === '\u2009' ? mathScale(c)/6 : space, dir: null} : {box: mathTextWord(part, text), dir: mathWordDirection(part)});
  // The Unicode bidirectional algorithm in a left-to-right line: a number after right-to-left words joins them,
  // as does a neutral between two of them; each right-to-left run reads from the right.
  let strong = 'L';
  for (const word of words) {
    if (word.dir === 'R' || word.dir === 'L') strong = word.level = word.dir;
    else if (word.dir === 'N') word.level = strong;
  }
  for (let i = 0; i < words.length; i++) if (!words[i].level) {
    let j = i; while (j < words.length && !words[j].level) j++;
    const level = words[i - 1]?.level === 'R' && words[j]?.level === 'R' ? 'R' : 'L';
    for (; i < j; i++) words[i].level = level;
    i--;
  }
  const order = [];
  for (let i = 0; i < words.length;) {
    let j = i; while (j < words.length && words[j].level === words[i].level) j++;
    const run = words.slice(i, j);
    order.push(...(words[i].level === 'R' ? run.reverse() : run)); i = j;
  }
  const items = []; let x = 0;
  for (const word of order) { if (word.box) items.push([word.box,x,0]); x += word.box ? word.box.w : word.w; }
  return mathCompose(items,x,{...extra,class:extra.class || 'ord'});
}

function mathRule(w, thickness, y = 0) {
  return mathBox(w, Math.max(0, -y), Math.max(0,y+thickness),
    '<path data-math-rule="" d="M0 ' + mathNumber(y) + 'H' + mathNumber(w) + 'v' + mathNumber(thickness) + 'H0Z"/>',{inkTop:y,inkBottom:y+thickness});
}

function mathStretch(value, target, c, horizontal = false, accent = false, exact = false) {
  if (!value || value === '.') return mathBox();
  const cp = value.codePointAt(0), id = MATH_FONT.chars[cp];
  if (id === undefined) return mathFallbackGlyph(value,c,{variant:'roman',stretchTarget:target,
    stretchAxis:horizontal?'horizontal':'vertical'}) || mathGlyph(value,c,{variant:'roman'});
  // Combining accents have no text advance; stretching uses their actual font extent.
  const shape = (glyph, advance) => {
    const b = mathGlyphIndex(glyph,c);
    if (!horizontal || b.w !== 0) return b;
    const g = MATH_FONT.glyph(b.glyph), unit = b.unitScale, x = -g[1] * unit;
    const width = (advance ?? g[3] - g[1]) * unit;
    return mathCompose([[b,x,0]],width,{italic:b.italic,accent:b.accent+x});
  };
  const natural = shape(id);
  const construction = (horizontal ? MATH_FONT.horizontal : MATH_FONT.vertical)[id];
  const extent = b => horizontal ? b.w : b.inkBottom-b.inkTop;
  if (extent(natural) >= target) return natural;
  if (!construction) {
    if(!horizontal || natural.w<=0)return natural;
    const ratio=target/natural.w;
    return {...natural,w:target,left:natural.left*ratio,right:natural.right*ratio,accent:(natural.accent ?? natural.w/2)*ratio,
      svg:'<g transform="scale('+mathNumber(ratio)+' 1)">'+natural.svg+'</g>',glyph:undefined};
  }
  let last = natural;
  // An extensible arrow over a label is built to the label's width, as TeX's arrow fill is, not to the next designed size.
  for (const [glyph,advance] of exact && construction.assembly?.parts?.some(p=>p[4]) ? [] : construction.variants || []) {
    const next = shape(glyph,advance), size = horizontal ? next.w : advance * mathScale(c) / MATH_FONT.units;
    // LuaTeX tests a horizontal variant's advance, not the variant record's ink span.
    if (accent && size > target) return last;
    last = next;
    if (size >= target) return last;
  }
  const a = construction.assembly;
  if (!a?.parts?.length || !a.parts.some(p=>p[4])) return last;
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
  for (let i=0;i<pieces.length;) {
    const p=pieces[i], b=mathGlyphIndex(p[0],c), g=MATH_FONT.glyph(b.glyph);
    let k=1; while(p[4] && pieces[i+k]===p)k++;
    // One extender drawn along its axis replaces k abutting copies, whose antialiased seams read as dashes.
    const span=(k*p[3]-(k-1)*overlap)*unit,f=span/(p[3]*unit);
    if (k===1) items.push(horizontal?[b,pos,0]:[b,0,-pos+g[2]*unit]);
    else if (horizontal) items.push([{...b,w:b.w*f,left:b.left*f,right:b.right*f,svg:'<g transform="scale('+mathNumber(f)+' 1)">'+b.svg+'</g>'},pos,0]);
    else items.push([{...b,h:pos+span,d:0,inkTop:-pos-span,inkBottom:-pos,
      svg:'<g transform="translate(0 '+mathNumber(-pos)+') scale(1 '+mathNumber(f)+') translate(0 '+mathNumber(g[2]*unit)+')">'+b.svg+'</g>'},0,0]);
    width=Math.max(width,b.w);
    pos+=k*(p[3]-overlap)*unit; i+=k;
  }
  return mathCompose(items,horizontal?length:width,{italic:(a.italic || 0)*unit,
    ...(horizontal?{accent:length/2,stretchAxis:'horizontal'}:{h:length,d:0,extended:true})});
}

function mathDelimiter(value, target, c) {
  if(!value || value==='.')return mathBox();
  const b=mathStretch(value,target,c), axis=mathConstant('AxisHeight',c,0.25);
  // TeXbook rule 19 centres a delimiter's box on the axis; a corner's box keeps it at its corner.
  const centre=b.extended || b.glyph===undefined?(b.inkTop+b.inkBottom)/2:(b.d-b.h)/2;
  return mathCompose([[b,0,-centre-axis]],b.w,{class:'inner',extended:true,italic:b.italic});
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

// A character noad: a plain symbol, with or without scripts; TeX reduces a group of one ordinary symbol to that symbol.
function mathCharacterNode(n) {
  if (n?.type==='scripts') return mathCharacterNode(n.base);
  if (n?.type==='row' && n.group && n.children.length===1 && (n.children[0].class || 'ord')==='ord') return mathCharacterNode(n.children[0]);
  // A colour or font declaration styles the symbol itself. unicode-math maps \mathbb, \mathcal, \mathfrak and \mathbfit
  // to characters; \mathrm, \mathit, \mathbf, \mathsf, \mathtt and \textcolor make a group.
  if (n?.type==='style' && !n.declaration && Object.keys(n).every(key=>['type','body','color','variant'].includes(key))) {
    if (n.body?.type!=='row') return mathCharacterNode(n.body);
    if (!n.color && n.variant && !['roman','italic','bold','sans-serif','monospace'].includes(n.variant)) return mathCharacterNode(n.body.children[0]);
  }
  return n?.type==='glyph' && !n.delimiterSize;
}

function mathRow(children,c) {
  // A chosen math list is spliced into its surroundings. Its math-style nodes govern later atoms too.
  const entries=[];let current=c;
  const append=nodes=>{for(const n of nodes) {
    if(n.type==='choice') {append(mathChoice(n,current).children);continue;}
    const declaration=n.type==='style' && n.declaration && n.mathStyle;
    if(declaration)current={...current,level:({display:0,text:0,script:1,scriptscript:2})[n.mathStyle],display:n.mathStyle==='display',cramped:false};
    entries.push({n,context:current,declaration});
  }};
  append(children);children=entries.map(entry=>entry.n);
  const boxes=entries.map(({n,context,declaration})=>{
    const box=declaration?mathBox(0,0,0,'',{space:true}):mathLayout(n,context);
    if(context.screen)box.refit=ratio=>mathScreenRelayout(n,context,ratio);
    if(n.type==='frac' && n.bar!==false && n.barThickness!==0 && !n.left && !n.right)box.flowWrap=width=>mathFraction(n,context,width);
    if(n.type==='fence' && !n.size)box.flowWrap=width=>mathResponsiveLayout(n,context,width);
    return box;
  });
  const significant=boxes.map((b,i)=>b.space?null:i).filter(i=>i!==null);
  for (let k=0;k<significant.length;k++) {
    const i=significant[k], b=boxes[i];
    if (b.class!=='bin') continue;
    const before=boxes[significant[k-1]]?.middle?'open':boxes[significant[k-1]]?.class, after=boxes[significant[k+1]]?.class;
    if (!before || ['bin','op','rel','open','punct'].includes(before) || !after || ['rel','close','punct'].includes(after)) b.class='ord';
  }
  const items=[];let x=0,previous=null,adjacent=false;
  for (const [i,b] of boxes.entries()) {
    if (!b.space) {
      // Appendix G rule 17 as LuaTeX applies it: a character's italic correction is kept only before another character.
      if(previous?.italic && previous.class!=='op' && adjacent && mathCharacterNode(children[i]))x+=previous.italic;
      x+=mathSpace(previous?.class,b.class,entries[i].context);
    }
    items.push([b,x,0]);x+=b.w;
    if (!b.space) previous=b;
    adjacent=!b.space;
  }
  const last=boxes.at(-1);
  return mathCompose(items,x,{class:boxes.length===1?boxes[0].class:'ord',italic:boxes.length!==1 && last?.class==='op'?0:last?.italic || 0,rowItems:items,
    ...(boxes.length===1 ? {accent:last.accent,limits:last.limits,large:last.large,scriptBase:last.scriptBase,accentInk:last.accentInk} : {})});
}

const mathScriptGap = c => c.screen ? Math.max(.035 * mathScale(c), .9 / (c.screen.fontSize * c.screen.pixelRatio)) : .025 * mathScale(c);
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
  const base=b.scriptBase || b,boxed=base.glyph===undefined || base.extended,baseAscent=base.h,baseDescent=base.d,
    upDescent=up?.d || 0,downAscent=down?.h || 0;
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
    // A large operator's italic correction moves its subscript left, not its superscript right.
    const nominal=b.w+(b.large?0:b.italic || 0);
    let x=nominal;
    // A superscript beside an over-accent clears the accent's ink as well as the letter's.
    const a=b.accentInk,gap=mathScriptGap(c);
    if(a && up.inkTop-rise<a.bottom+gap && up.inkBottom-rise+gap>a.top)x=Math.max(x,a.right+gap-up.left);
    items.push([up,x,-rise]);w=Math.max(w,x+up.w);
  }
  if (down) {
    const nominal=b.w-(b.large?b.italic || 0:0);
    items.push([down,nominal,drop]);w=Math.max(w,nominal+down.w);
  }
  // \prescript's scripts end together at its base.
  if (n.pre) for (const item of items.slice(1)) item[1]=w-item[0].w;
  // A subscript tucked under a slanted letter leaves the letter's top overhang for the next atom to clear.
  const advance=w+mathConstant('SpaceAfterScript',c,0.05);
  return mathCompose(items,advance,{class:b.class,italic:n.pre || b.large?0:Math.max(0,b.w+(b.italic || 0)-advance)});
}

function mathFraction(n,c,width) {
  if (n.style) c={...c,level:({display:0,text:0,script:1,scriptscript:2})[n.style],display:n.style==='display',cramped:false};
  const display=c.display && c.level===0, child=display?{...c,display:false}:mathScriptStyle(c);
  let top=width===undefined?mathLayout(n.num,child):mathResponsiveLayout(n.num,child,Math.max(.05,width-.2*mathScale(c)));
  // amsmath's \cfrac opens its numerator with LaTeX's \strut: 0.7 and 0.3 of a 1.2 em baseline skip.
  if(n.strut)top={...top,h:Math.max(top.h,.84*mathScale(child)),d:Math.max(top.d,.36*mathScale(child))};
  const bottom=mathLayout(n.den,{...child,cramped:true}),axis=mathConstant('AxisHeight',c,0.25);
  const line=n.bar===false?0:n.barThickness===undefined?mathConstant('FractionRuleThickness',c,0.04):n.barThickness*c.size;
  let rise=mathConstant(line?(display?'FractionNumeratorDisplayStyleShiftUp':'FractionNumeratorShiftUp'):(display?'StackTopDisplayStyleShiftUp':'StackTopShiftUp'),c,display?0.68:0.4),
    drop=mathConstant(line?(display?'FractionDenominatorDisplayStyleShiftDown':'FractionDenominatorShiftDown'):(display?'StackBottomDisplayStyleShiftDown':'StackBottomShiftDown'),c,display?0.68:0.35);
  if (line) {
    const gap=name=>n.barThickness===undefined?mathConstant(name,c,display?0.12:0.06):line*(display?3:1);
    rise=Math.max(rise,top.d+axis+line/2+gap(display?'FractionNumDisplayStyleGapMin':'FractionNumeratorGapMin'));
    drop=Math.max(drop,bottom.h-axis+line/2+gap(display?'FractionDenomDisplayStyleGapMin':'FractionDenominatorGapMin'));
  } else {
    const min=mathConstant(display?'StackDisplayStyleGapMin':'StackGapMin',c,display?0.4:0.15),gap=rise+drop-top.d-bottom.h;
    if (gap<min) {rise+=(min-gap)/2;drop+=(min-gap)/2;}
  }
  // TeX's \nulldelimiterspace (1.2 pt, unscaled in scripts) flanks only an unfenced fraction, outside its rule;
  // a fence's own glyphs bound \binom, and amsmath's \cfrac kerns its right one away.
  const pad=n.left || n.right?0:c.size*0.12,inner=Math.max(top.w,bottom.w),w=inner+pad+(n.strut?0:pad);
  const numeratorX=pad+(n.align==='l'?0:n.align==='r'?inner-top.w:(inner-top.w)/2);
  const items=[[top,numeratorX,-rise],[bottom,pad+(inner-bottom.w)/2,drop]];
  if (line) items.push([mathRule(inner,line,-axis-line/2),pad,0]);
  // LaTeX's \frac, \binom and \genfrac brace their fraction: an ordinary atom, not TeX's bare inner.
  const b=mathCompose(items,w,{class:'ord',innerLines:top.lines || 1,fitted:!!top.fitted});
  if(width!==undefined && c.screen)b.refit=ratio=>mathFraction(n,{...c,screen:{...c.screen,fontSize:c.screen.fontSize*ratio},cache:new WeakMap()},width);
  // Generalized fractions use the fixed \Umathfractiondelsize, independent of the numerator and denominator.
  if (n.left || n.right) {
    const delimiters=n.textDelimiters?{...c,level:0}:c,target=(display?2.4:1.01)*mathScale(c)/mathScale(delimiters);
    return {...mathFenceBoxes(n.left || '',n.right || '',b,delimiters,target),class:'ord'};
  }
  return b;
}

function mathRoot(n,c) {
  const body=mathLayout(n.body,{...c,cramped:true}),line=mathConstant('RadicalRuleThickness',c,0.04),extra=mathConstant('RadicalExtraAscender',c,0.05);
  let gap=mathConstant(c.display && !c.level?'RadicalDisplayStyleVerticalGap':'RadicalVerticalGap',c,0.1);
  const sign=mathStretch('√',body.h+body.d+gap+line,c);
  // TeXbook Appendix G rule 11: a sign taller than needed splits its excess evenly above and below the radicand.
  gap+=Math.max(0,sign.inkBottom-sign.inkTop-(body.h+body.d+gap+line))/2;
  const rise=-sign.inkTop-body.h-gap-line,
    index=n.index?mathLayout(n.index,{...c,level:2,display:false,cramped:false}):null;
  let before=0,idxX=0;
  if(index) {idxX=Math.max(0,mathConstant('RadicalKernBeforeDegree',c,0.2));before=Math.max(0,idxX+index.w+mathConstant('RadicalKernAfterDegree',c,-0.3));}
  const bodyX=before+sign.w,w=bodyX+body.w,items=[[sign,before,rise],[body,bodyX,0]];
  items.push([mathRule(body.w,line,-body.h-gap-line),bodyX,0]);
  const b=mathCompose(items,w);b.h+=extra;
  if(!index)return b;
  const ratio=(MATH_FONT.constants.RadicalDegreeBottomRaisePercent ?? 60)/100;
  return mathCompose([[b,0,0],[index,idxX,sign.inkBottom+rise-(sign.inkBottom-sign.inkTop)*ratio]],w);
}

function mathFenceBoxes(left,right,body,c,size,least=0,measure=body) {
  const axis=mathConstant('AxisHeight',c,0.25),reach=Math.max(measure.h-axis,measure.d+axis),target=size?size*mathScale(c):Math.max(least*mathScale(c),2*reach*0.901,2*reach-0.5*mathScale(c));
  // An empty side is TeX's null delimiter: \nulldelimiterspace wide.
  const side=value=>!value || value==='.'?mathBox(c.size*0.12):mathDelimiter(value,target,c),a=side(left),b=side(right);
  return mathCompose([[a,0,0],[body,a.w,0],[b,a.w+body.w,0]],a.w+body.w+b.w,{class:'inner'});
}

// MathML's menclose notations, drawn with the rule thickness \boxed uses around a 0.2 em padding.
function mathEnclose(n,c) {
  const set=new Set(n.notation),s=mathScale(c),line=mathConstant('FractionRuleThickness',c,0.04),pad=0.2*s,
    b=set.has('radical')?mathLayout({type:'root',body:n.body},c):mathLayout(n.body,c),
    has=(...names)=>names.some(name=>set.has(name)),round=has('circle'),
    left=has('box','roundedbox','circle','left','longdiv','phasorangle'),right=has('box','roundedbox','circle','right','actuarial','madruwb'),
    top=has('box','roundedbox','circle','top','longdiv','actuarial'),bottom=has('box','roundedbox','circle','bottom','madruwb','phasorangle'),
    // A circle is the ellipse through the padded box's corners; longdiv's bracket and phasorangle's slope need room at the left.
    grow=round?(Math.SQRT2-1)/2:0,padL=(left?pad:0)+(has('longdiv')?0.3*s:has('phasorangle')?0.4*s:0)+grow*(b.w+2*pad),padR=(right?pad:0)+grow*(b.w+2*pad),
    padT=(top?pad:0)+grow*(b.h+b.d+2*pad),padB=(bottom?pad:0)+grow*(b.h+b.d+2*pad),
    w=padL+b.w+padR,y0=-b.h-padT,y1=b.d+padB,x0=has('longdiv','phasorangle')?padL-pad:0,m=mathNumber,paths=[];
  const segment=(xa,ya,xb,yb)=>paths.push('M'+m(xa)+' '+m(ya)+'L'+m(xb)+' '+m(yb));
  if(has('box'))paths.push('M0 '+m(y0)+'H'+m(w)+'V'+m(y1)+'H0Z');
  else if(has('roundedbox')) {const r=Math.min(0.25*s,(y1-y0)/2,w/2);paths.push('M'+m(r)+' '+m(y0)+'H'+m(w-r)+'A'+m(r)+' '+m(r)+' 0 0 1 '+m(w)+' '+m(y0+r)+'V'+m(y1-r)+'A'+m(r)+' '+m(r)+' 0 0 1 '+m(w-r)+' '+m(y1)+'H'+m(r)+'A'+m(r)+' '+m(r)+' 0 0 1 0 '+m(y1-r)+'V'+m(y0+r)+'A'+m(r)+' '+m(r)+' 0 0 1 '+m(r)+' '+m(y0)+'Z');}
  else if(round) {const rx=w/2,ry=(y1-y0)/2;paths.push('M0 '+m(y0+ry)+'A'+m(rx)+' '+m(ry)+' 0 1 0 '+m(w)+' '+m(y0+ry)+'A'+m(rx)+' '+m(ry)+' 0 1 0 0 '+m(y0+ry)+'Z');}
  else {
    if(set.has('left'))segment(0,y0,0,y1);
    if(has('right','actuarial','madruwb'))segment(w,y0,w,y1);
    if(has('top','longdiv','actuarial'))segment(x0,y0,w,y0);
    if(has('bottom','madruwb','phasorangle'))segment(has('phasorangle')?0:0,y1,w,y1);
  }
  if(set.has('longdiv'))paths.push('M'+m(x0)+' '+m(y0)+'Q'+m(x0+0.3*s)+' '+m((y0+y1)/2)+' '+m(x0-0.05*s)+' '+m(y1));
  if(set.has('phasorangle'))segment(0,y1,x0+0.1*s,y0);
  if(set.has('horizontalstrike'))segment(0,-mathConstant('AxisHeight',c,0.25),w,-mathConstant('AxisHeight',c,0.25));
  if(set.has('verticalstrike'))segment(w/2,y0,w/2,y1);
  if(set.has('updiagonalstrike'))segment(0,y1,w,y0);
  if(set.has('downdiagonalstrike'))segment(0,y0,w,y1);
  if(set.has('updiagonalarrow')) {const tip=0.2*s;segment(0,y1,w,y0);paths.push('M'+m(w-tip)+' '+m(y0)+'H'+m(w)+'V'+m(y0+tip));}
  const fill=n.background?'<path d="M0 '+m(y0)+'H'+m(w)+'V'+m(y1)+'H0Z" fill="'+mathEscape(n.background)+'" fill-opacity="1"/>':'',
    stroke='<path d="'+paths.join('')+'" fill="none" stroke="currentColor" stroke-opacity="1" stroke-width="'+m(line)+'"/>';
  const box=mathCompose([[b,padL,0]],w,{h:-y0,d:y1,class:b.class});
  box.svg=fill+stroke+box.svg;
  if(n.color)box.svg='<g fill="'+mathEscape(n.color)+'" color="'+mathEscape(n.color)+'" fill-opacity="1" stroke-opacity="1">'+box.svg+'</g>';
  return box;
}

function mathAccent(n,c) {
  const position=n.position || 'over';let nucleus=n.base;
  while(nucleus?.type==='style' || (nucleus?.type==='row' && nucleus.children.length===1))nucleus=nucleus.type==='style'?nucleus.body:nucleus.children[0];
  const b=mathLayout(n.base,position==='under'?c:{...c,cramped:true,dotless:nucleus?.type==='glyph' && !n.overlay && /^[\u0300-\u036f\u20d0-\u20ff]$/u.test(n.value)}),s=mathScale(c);
  // A brace is an operator: centred on its base, with no italic correction to shift its labels.
  // TeX's rules 12 and 18a: scripts on an accented character sit by the character; a bar, or an accent over more than one character, is a box.
  const brace=n.limits==='always',bar=/^(overline|underline|¯|_)$/.test(n.value) && !n.overlay,character=!bar && nucleus?.type==='glyph',
    semantics={class:n.class || (brace?'op':b.class),limits:n.limits || b.limits,italic:brace || !(character || n.overlay)?0:b.italic,accent:b.accent,scriptBase:character || n.overlay?b.scriptBase || b:undefined};
  if(n.overlay) {
    const w=Math.max(b.w,0.2*s),line=mathConstant('FractionRuleThickness',c,0.04);
    const rising='M0 '+mathNumber(b.d)+'L'+mathNumber(w)+' '+mathNumber(-b.h),
      falling='M0 '+mathNumber(-b.h)+'L'+mathNumber(w)+' '+mathNumber(b.d);
    let path=n.value==='╲'?falling:n.value==='╳'?rising+falling:n.value==='─'?'M0 '+mathNumber(-mathConstant('AxisHeight',c,0.25))+'H'+mathNumber(w):rising;
    if(n.value==='↗') {
      const tip=0.2*s;path+='M'+mathNumber(w-tip)+' '+mathNumber(-b.h)+'H'+mathNumber(w)+'v'+mathNumber(tip);
    }
    return {...b,...semantics,svg:b.svg+'<path d="'+path+'" fill="none" stroke="currentColor" stroke-width="'+mathNumber(line)+'"/>'};
  }
  if (n.value==='overline' || n.value==='underline' || n.value==='¯' || n.value==='_') {
    const over=position!=='under',line=mathConstant(over?'OverbarRuleThickness':'UnderbarRuleThickness',c,0.04),gap=mathConstant(over?'OverbarVerticalGap':'UnderbarVerticalGap',c,0.1);
    // amsmath's \varliminf underlines lim over a strut 0.2 ex@ deep.
    if(n.varlim && !over)b.d=Math.max(b.d,0.02*s);
    const y=over?-b.h-gap-line:b.d+gap;
    const result=mathCompose([[b,0,0],[mathRule(b.w,line,y),0,0]],b.w,semantics);
    result[over?'h':'d']+=mathConstant(over?'OverbarExtraAscender':'UnderbarExtraDescender',c,0.04);
    return result;
  }
  // The font's accent attachment aligns both top and bottom accents; a through stroke stays centered.
  // TeX's stretchy arrows and harpoons over or under a formula are the font's combining arrows, set as accents.
  const arrows=n.stretch && n.class!=='op' && (position==='over'?{'→':'⃗','←':'⃖','↔':'⃡','↼':'⃐','⇀':'⃑'}:position==='under'?{'→':'⃯','←':'⃮','↔':'͍'}:{}),
    value=arrows?.[n.value] && MATH_FONT.chars[arrows[n.value].codePointAt(0)]!==undefined?arrows[n.value]:n.value,
    a=n.stretch?mathStretch(value,Math.max(b.w,s*0.3),c,true,n.class!=='op'):mathGlyph(value,c,{variant:'roman'}),
    x=position==='through' || brace?(b.w-a.w)/2:(b.accent ?? b.w/2)-(a.accent ?? a.w/2),combining=/^[\u0300-\u036f\u20d0-\u20ff]$/u.test(value);
  let y;
  if(position==='through')y=0;
  // A glyph the font draws below the baseline hangs from the base's depth, as LuaTeX sets a bottom accent.
  else if(position==='under')y=a.inkTop>=0?b.d:b.d+mathConstant('UnderbarVerticalGap',c,0.1)-a.inkTop;
  // A glyph drawn above the x-height keeps its designed height, raised by the base's height above AccentBaseHeight.
  else if(combining || a.inkBottom<0)y=-Math.max(0,b.h-mathConstant('AccentBaseHeight',c,0.48));
  else y=-b.h-mathConstant('OverbarVerticalGap',c,0.1)-a.inkBottom;
  // amsmath's \varinjlim and \varprojlim stack lim, a 1.5 ex@ kern, the arrow and a kern of -1 ex@ (ex@ is 1 pt).
  if(n.varlim && position==='under')return mathCompose([[b,0,0],[a,x,b.d+0.15*s+a.h]],b.w,{...semantics,d:b.d+0.15*s+a.h+a.d-0.1*s});
  // A combining under-accent's box is its ink: its advance box rests far below the mark.
  if(position==='under')return mathCompose([[b,0,0],[{...a,h:-a.inkTop,d:a.inkBottom},x,y]],b.w,semantics);
  if(position==='over') {
    const g=a.glyph===undefined?null:MATH_FONT.glyph(a.glyph),left=g?(a.glyphX || 0)+g[1]*a.unitScale:a.left,right=g?(a.glyphX || 0)+g[3]*a.unitScale:a.right;
    semantics.accentInk={left:x+left,right:x+right,top:y+a.inkTop,bottom:y+a.inkBottom};
  }
  return mathCompose([[b,0,0],[a,x,y]],b.w,semantics);
}

function mathTable(n,c) {
  const small=/smallmatrix$/.test(n.env) || n.env==='subarray' || n.env==='substack',
    paired=/^(align(?:ed)?(?:at)?|flalign|split)$/.test(n.env),
    display=paired || /^([lr]?gather(?:ed)?|eqnarray|multline(?:d)?|equation|drcases|dcases|darray)$/.test(n.env),
    cellStyle={...c,level:small?Math.max(1,c.level):c.level,display:small?false:display,cramped:false};
  const rows=n.rows.map(row=>row.map((cell,i)=>{
    // The second cell in each equation pair continues the first math list.
    // An empty ordinary atom supplies the left neighbour of a leading relation.
    if(paired && i%2) return mathRow([{type:'row',children:[]},...(cell.type==='row'?cell.children:[cell])],cellStyle);
    return mathLayout(cell,cellStyle);
  }));
  // A cell spanning columns (\multicolumn, \hdotsfor) and an \intertext line do not set their columns' widths.
  const own=(r,i)=>{const cell=n.rows[r][i];return !(cell?.span>1 || cell?.covered || cell?.intertext);};
  const cols=Math.max(n.align?.length || 0,n.pairs?2*n.pairs:0,...rows.map((r,k)=>n.rows[k][0]?.intertext?0:r.length)),s=mathScale(c),cs=mathScale(cellStyle),
    widths=Array.from({length:cols},(_,i)=>Math.max(0,...rows.map((row,r)=>own(r,i)?row[i]?.w || 0:0))),
    align=n.env==='eqnarray'?Array.from({length:cols},(_,i)=>['r','c','l'][i%3]):n.align || Array(cols).fill('c');
  if(rows.length*(cols+(n.columnInsertions?.length || 0))+(n.columnRules?.length || 0)+(n.rowRules?.length || 0)>100000)
    throw Object.assign(new Error('Array composition exceeds the rendering budget'),{code:'resource-limit'});
  const insertions=Array.from({length:cols+1},()=>[]);
  for(const insertion of n.columnInsertions || []) {
    if(insertion.before<0 || insertion.before>cols) throw Object.assign(new Error('Array insertion exceeds its columns'),{code:'invalid-alignment'});
    insertions[insertion.before].push({...insertion,box:mathLayout(insertion.body,cellStyle)});
  }
  // LaTeX's array keeps half its column gap (\arraycolsep) outside the edge columns. Rules take no width;
  // each further rule in a run adds \doublerulesep.
  // amsmath's smallmatrix has a thin space at each side and a thick space between its columns.
  const ruleRuns=Array(cols+1).fill(0),edge=/^d?array$/.test(n.env)?s/2:/smallmatrix$/.test(n.env)?s/6:0;
  for(const boundary of n.columnRules || [])if(boundary>=0 && boundary<=cols)ruleRuns[boundary]++;
  const ruleSep=0.2*s,ruleStarts=[];
  const gaps=Array.from({length:cols+1},(_,i)=>{
    let gap=i===0 || i===cols?edge:paired?(i%2?0:/^(alignat|alignedat)$/.test(n.env)?0:2*s):/smallmatrix$/.test(n.env)?5/18*s:small?cs/3:n.env==='CD'?0:s;
    if(insertions[i].some(item=>item.replaceGap))gap=0;
    const content=gap+insertions[i].reduce((sum,item)=>sum+item.box.w,0);
    ruleStarts.push(i===0?0:i===cols?content:content/2);
    return content+Math.max(0,ruleRuns[i]-1)*ruleSep;
  });
  // A spanning cell wider than its columns widens the last of them, as TeX's \multispan does.
  for(const [r,row] of n.rows.entries())for(const [i,cell] of row.entries())if(cell?.span>1 && !cell.dots) {
    const last=Math.min(cols,i+cell.span)-1,room=widths.slice(i,last+1).reduce((a,b)=>a+b,0)+gaps.slice(i+1,last+1).reduce((a,b)=>a+b,0);
    if(rows[r][i].w>room)widths[last]+=rows[r][i].w-room;
  }
  const starts=[],ends=[],boundaries=[],insertionItems=[];let w=0;
  for(let i=0;i<=cols;i++) {
    const contentWidth=insertions[i].reduce((sum,item)=>sum+item.box.w,0);
    boundaries.push(w+ruleStarts[i]);
    let x=w+(gaps[i]-contentWidth)/2;
    for(const item of insertions[i]) {insertionItems.push([item.box,x]);x+=item.box.w;}
    w+=gaps[i];if(i<cols) {starts.push(w);w+=widths[i];ends.push(w);}
  }
  const insertionHeight=Math.max(0,...insertionItems.map(([b])=>b.h)),insertionDepth=Math.max(0,...insertionItems.map(([b])=>b.d)),
    // LaTeX's array strut is 0.7 and 0.3 of a 1.2 em baseline skip (cases stretches it by 1.2); rows abut,
    // and only the display alignments add \jot between them.
    strut=small || n.env==='CD'?[0.7,0.2]:/cases$/.test(n.env)?[1.008,0.432]:[0.84,0.36],
    rowGap=small?0.2:n.env==='CD'?0.3:/^(align|flalign|split|[lr]?gather|eqnarray|multline)/.test(n.env)?0.3:0,
    heights=rows.map(row=>Math.max(strut[0]*cs,insertionHeight,...row.map(b=>b.h))),
    depths=rows.map(row=>Math.max(strut[1]*cs,insertionDepth,...row.map(b=>b.d))),baselines=[];
  // A full-width rule between rows takes \arrayrulewidth of height; a run of them steps by \doublerulesep.
  const line=mathConstant('FractionRuleThickness',c,0.04),hlines=Array(rows.length+1).fill(0),hlineStarts=[];
  for(const rule of n.rowRules || [])if(rule.from===undefined && rule.to===undefined && rule.before>=0 && rule.before<=rows.length)hlines[rule.before]++;
  const hlineSpace=k=>k?line+(k-1)*ruleSep:0;
  let total=0;
  // amsmath's subarray has no strut: its rows are a baseline skip apart (the script font's stack shifts), or a
  // lineskip of three rules apart where they would come closer.
  // smallmatrix's rows are 6 ex@ apart with a lineskip of 1.5 ex@ (ex@ is 1 pt).
  const skip=n.env==='subarray' || n.env==='substack'?{base:(mathConstant('StackTopShiftUp',c,0.444)+mathConstant('StackBottomShiftDown',c,0.345))*cs/s,line:3*mathConstant('FractionRuleThickness',cellStyle,0.04)}:
    /smallmatrix$/.test(n.env)?{base:0.6*s,line:0.15*s}:n.env==='CD'?{base:2*cs,line:0.3*cs}:null;
  if(skip)for(const [r,row] of rows.entries()) {heights[r]=Math.max(0,...row.map(b=>b.h));depths[r]=Math.max(0,...row.map(b=>b.d));}
  for(let r=0;r<=rows.length;r++) {
    hlineStarts.push(total);total+=hlineSpace(hlines[r]);
    if(r===rows.length)break;
    total+=heights[r];baselines.push(total);total+=depths[r];
    if(r+1<rows.length)total+=skip?Math.max(skip.base-depths[r]-heights[r+1],skip.line):rowGap*cs+(n.rowGaps?.[r] || 0)*s;
  }
  const offset=n.position==='t'?-(baselines[0] || 0):n.position==='b'?-(baselines.at(-1) || 0):-total/2-mathConstant('AxisHeight',c,0.25),items=[];
  for(let r=0;r<rows.length;r++) {
    if(n.rows[r][0]?.intertext) {items.push([rows[r][0],0,baselines[r]+offset]);continue;}
    for(let i=0;i<cols;i++) {
      const cell=n.rows[r][i];
      if(cell?.covered)continue;
      const last=cell?.span>1?Math.min(cols,i+cell.span)-1:i,width=(ends[last] ?? starts[i])-starts[i];
      // amsmath's \hdotsfor: dots 3 mu apart times its spacing, spread evenly across the columns it fills.
      if(cell?.dots) {
        const dot=mathGlyph('.',cellStyle,{variant:'roman'}),step=dot.w+cell.dots*3/18*cs,count=Math.max(1,Math.floor(width/step)),spread=width/count;
        for(let k=0;k<count;k++)items.push([dot,starts[i]+k*spread+(spread-dot.w)/2,baselines[r]+offset]);
        continue;
      }
      const b=rows[r][i] || mathBox(),a=cell?.spanAlign || (/^multlined?$/.test(n.env) && cols===1?(r===0?'l':r===rows.length-1?'r':'c'):align[i] || 'c'),
        dx=a==='r'?width-b.w:a==='l'?0:(width-b.w)/2;
      items.push([b,starts[i]+dx,baselines[r]+offset]);
    }
    for(const [b,x] of insertionItems)items.push([b,x,baselines[r]+offset]);
  }
  const ruleCounts=new Map(),band=r=>[hlineStarts[r]+hlineSpace(hlines[r]),hlineStarts[r+1]+hlineSpace(hlines[r+1])];
  const vertical=(x,from,to,dashed)=>items.push([mathBox(line/2,0,to-from,'<path data-math-line="vertical" d="M0 0v'+mathNumber(to-from)+'" fill="none" stroke="currentColor" stroke-width="'+mathNumber(line)+'"'+(dashed?' stroke-dasharray="'+mathNumber(.15*s)+' '+mathNumber(.1*s)+'"':'')+'/>',{left:-line/2}),x,offset+from]);
  // A \multicolumn replaces the rules of the columns it spans (the first column's left rule too) with its own.
  const spans=n.rows.flatMap((row,r)=>row.flatMap((cell,i)=>cell?.span>1 || cell?.spanRules?[{r,i,last:Math.min(cols,i+(cell.span || 1))-1,rules:cell.spanRules || []}]:[]));
  for(const [index,boundary] of (n.columnRules || []).entries()) {
    if(boundary<0 || boundary>cols)throw Object.assign(new Error('Array rule exceeds its columns'),{code:'invalid-rule'});
    const count=ruleCounts.get(boundary) || 0;ruleCounts.set(boundary,count+1);
    const x=boundaries[boundary]+count*ruleSep,gaps=spans.filter(span=>span.i<boundary && boundary<=span.last+1 || span.i===0 && boundary===0).map(span=>band(span.r)).sort((a,b)=>a[0]-b[0]);
    let y=0;
    for(const [top,bottom] of gaps) {if(top>y)vertical(x,y,top,n.columnDashes?.[index]);y=Math.max(y,bottom);}
    if(y<total)vertical(x,y,total,n.columnDashes?.[index]);
  }
  for(const span of spans)for(const rule of span.rules)vertical(rule===0?boundaries[span.i]:boundaries[span.last+1],...band(span.r));
  ruleCounts.clear();
  for(const rule of n.rowRules || []) {
    const boundary=rule.before,from=rule.from ?? 0,to=rule.to ?? cols;
    if(boundary<0 || boundary>rows.length || from<0 || to>cols)throw Object.assign(new Error('Array rule exceeds its cells'),{code:'invalid-rule'});
    const count=ruleCounts.get(boundary) || 0;ruleCounts.set(boundary,count+1);
    const full=rule.from===undefined && rule.to===undefined,
      y=(full?hlineStarts[boundary]+line/2+count*ruleSep:boundary===0?0:boundary===rows.length?total:(baselines[boundary-1]+depths[boundary-1]+baselines[boundary]-heights[boundary])/2+count*0.15*s)+offset,
      left=from===0?0:boundaries[from],right=to===cols?w:boundaries[to];
    const stroke='<path data-math-line="horizontal" d="M0 0H'+mathNumber(right-left)+'" fill="none" stroke="currentColor" stroke-width="'+mathNumber(line)+'"'+(rule.dashed?' stroke-dasharray="'+mathNumber(.15*s)+' '+mathNumber(.1*s)+'"':'')+'/>';
    items.push([mathBox(right-left,line/2,line/2,stroke),left,y]);
  }
  // An array is a \vcenter, an ordinary atom; a fenced one is an inner atom, as \left and \right make it.
  const b=mathCompose(items,Math.max(w,...rows.map((row,r)=>n.rows[r][0]?.intertext?row[0].w:0)),{class:'ord',h:Math.max(0,-offset),d:Math.max(0,total+offset)});
  const pair=mathTableDelimiters(n.env);
  return pair?mathFenceBoxes(pair[0],pair[1],b,c):b;
}

function mathLayout(n,c) {
  c.displayMode ??= c.display;
  if(!n)return mathBox();
  // With spans, each symbol carries its source offset for the host's tap-to-place.
  if(c.spans && n.at!==undefined && (n.type==='glyph' || n.type==='text')) {
    const b=mathLayout({...n,at:undefined},c);
    return {...b,svg:'<g data-math-at="'+n.at+'">'+b.svg+'</g>'};
  }
  // An empty argument shows the placeholder box a missing one does, as a place to tap.
  if(c.spans && n.at!==undefined && n.type==='row' && !n.children.length)
    return mathLayout({type:'glyph',value:'□',variant:'roman',at:n.at},c);
  if(c.budget && ++c.budget.nodes>100000)throw Object.assign(new Error('Mathematical layout exceeds the rendering budget'),{code:'resource-limit'});
  switch(n.type) {
    case 'row': {
      const b=mathRow(n.children,c);
      if(n.group) {
        Object.assign(b,{class:'ord',limits:undefined});
        // TeX collapses a single character before resolving choices; every other group stays a boxed nucleus.
        if(!mathCharacterNode(n))Object.assign(b,{glyph:undefined,scriptBase:undefined,italic:0});
      }
      return b;
    }
    case 'glyph': {
      // TeX spaces a \middle as a closing atom, and a binary atom after it becomes ordinary.
      const middle=n.delimiter && !n.delimiterSize?{class:'close',middle:true}:{};
      // amsmath's \big to \Bigg are \left and \right around a strut 1.2 to 3 times a parenthesis's height and depth,
      // so TeX's \delimiterfactor and \delimitershortfall choose the size, and the strut sets the box.
      if(n.delimiterSize) {
        const paren=MATH_FONT.glyph(MATH_FONT.chars[40]),s=mathScale(c),strut=n.delimiterSize*(paren[4]-paren[2])/MATH_FONT.units*s,axis=mathConstant('AxisHeight',c,0.25);
        const b=mathDelimiter(n.value,Math.max(strut*0.901,strut-0.5*s),c);
        return {...b,h:Math.max(b.h,axis+strut/2),d:Math.max(b.d,strut/2-axis),class:n.class || 'ord',...middle};
      }
      if(n.delimiter && c.delimiterTarget)return {...mathDelimiter(n.value,c.delimiterTarget,c),class:n.class || 'ord',...middle};
      if(n.stretch)return {...mathStretch(n.value,c.stretchTarget || mathScale(c),c,true,false,!!c.stretchTarget),class:n.class || 'rel',limits:n.limits,stretchAxis:'horizontal'};
      let b=mathGlyph(n.value,c,{class:n.class || 'ord',...middle,variant:n.variant || (c.variant==='normal'?n.defaultVariant || 'normal':c.variant),large:n.large,limits:n.limits});
      if(n.large) {
        let a=c.display && !c.level?mathStretch(n.value,mathConstant('DisplayOperatorMinHeight',c,1.3),c):b;
        // LuaTeX's vertical glyph boxes use CFF control bounds; the ink keeps its exact extrema.
        const bounds=MATH_FONT.verticalBounds[a.glyph];
        if(bounds)a={...a,h:Math.max(0,bounds[1]*a.unitScale),d:Math.max(0,-bounds[0]*a.unitScale)};
        b=mathCompose([[a,0,(a.h-a.d)/2-mathConstant('AxisHeight',c,0.25)]],a.w,{class:n.class || 'op',italic:a.italic,limits:n.limits,large:true,glyph:a.glyph,unitScale:a.unitScale});
      }
      return b;
    }
    case 'text': return mathText(n.value,c,{variant:n.variant || (c.variant==='normal'?'roman':c.variant),class:n.class,limits:n.limits,verbatim:n.verbatim});
    case 'choice': return mathLayout(mathChoice(n,c),c);
    case 'space': return mathBox((c.displayMode && n.displayWidth!==undefined?n.displayWidth:n.width)*mathScale(c),0,0,'',{space:true});
    case 'scripts': return mathScripts(n,c);
    case 'frac': return mathFraction(n,c);
    case 'root': return mathRoot(n,c);
    case 'enclose': return mathEnclose(n,c);
    case 'fence': {
      // A nested fence does not inherit an outer \middle target. Its cached box
      // survives the outer fence's second pass, keeping nested layout linear.
      const cache=c.cache || (c.cache=new WeakMap()),key=[c.size,c.level,c.variant,c.display,c.cramped,c.stretchTarget].join('|');
      let entries=cache.get(n);if(entries?.has(key))return {...entries.get(key)};
      const local={...c,delimiterTarget:undefined};let b=mathLayout(n.body,local);const first=b;
      // Only a \middle needs the second pass, sized to the first pass's body.
      if(n.body && mathHasMiddle(n.body)) {
        const axis=mathConstant('AxisHeight',c,0.25),reach=Math.max(b.h-axis,b.d+axis),target=Math.max(2*reach*0.901,2*reach-0.5*mathScale(c));
        b=mathLayout(n.body,{...local,delimiterTarget:target});
      }
      // LuaTeX sizes \left and \right from the body as \middle is sized, not from the grown \middle.
      b=mathFenceBoxes(n.left,n.right,b,local,n.size,0,first);if(n.class)b.class=n.class;
      if(!entries)cache.set(n,entries=new Map());entries.set(key,b);return {...b};
    }
    case 'accent': return mathAccent(n,c);
    case 'table': return mathTable(n,c);
    case 'style': {
      const style={...c};if(n.variant)style.variant=n.variant;if(n.absoluteSize!==undefined)style.size=n.absoluteSize;if(n.size!==undefined)style.size*=n.size;
      if(n.mathStyle) {style.level=({display:0,text:0,script:1,scriptscript:2})[n.mathStyle];style.display=n.mathStyle==='display';style.cramped=false;}
      const b=mathLayout(n.body,style);if(n.class)b.class=n.class;if(n.limits)b.limits=n.limits;
      if(n.smashOperator) {
        const op=mathLayout(n.body.type==='scripts'?n.body.base:n.body,style),extra=Math.max(0,(b.w-op.w)/2),left=n.smashOperator.includes('l')?extra:0;
        Object.assign(b,mathCompose([[{...b},-left,0]],b.w-left-(n.smashOperator.includes('r')?extra:0),{class:b.class}));
      }
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
      const s=mathScale(c),ss=mathScale(mathScriptStyle(c)),kind=n.arrow || '',doubled=/^(Leftarrow|Rightarrow|Leftrightarrow)$/.test(kind),
        paired=/^(rightleftharpoons|leftrightharpoons)$/.test(kind),
        label=(x,cramped)=>x && !(n.base?.stretch && !n.diagram && x.type==='row' && !x.children.length)?mathLayout(x,mathScriptStyle(c,cramped)):null;
      let over=label(n.over),under=label(n.under,true);
      // mathtools puts a text control-space beside each double-arrow label, including an empty one.
      if(doubled) {
        const left=kind!=='Rightarrow'?0.333*s:0,right=kind!=='Leftarrow'?0.333*s:0,
          padded=b=>mathCompose([[b || mathBox(),left,0]],(b?.w || 0)+left+right);
        over=padded(over);under=padded(under);
      }
      // mhchem raises its lower label to a common 1.25 ex top and smashes its height before adding limits.
      if(n.unspaced && under)under={...mathCompose([[under,0,under.h-1.25*MATH_FONT.xHeight/MATH_FONT.units*s]],under.w),h:0};
      const pad=(n.labelPad ?? (doubled?10:14))/18*ss,target=Math.max((n.minWidth || (/^hook/.test(kind)?10/9:1))*s,Math.max(over?.w || 0,under?.w || 0)+pad),
        shift=n.unspaced && n.base.value==='→'?-2/18*ss:/^(leftarrow|rightarrow|leftrightarrow|mapsto|hookleftarrow|hookrightarrow|leftharpoonup|leftharpoondown|rightharpoonup|rightharpoondown)$/.test(kind)?(/^(left|hook)/.test(kind)?1:-1)*1.5/18*ss:0;
      // These arrows, and amsmath's overset/underset/stackrel, are operators with TeX's ordinary limit gaps.
      const stack=(b,above,below,dx=shift)=>{
        const w=Math.max(b.w,above?.w || 0,below?.w || 0),items=[[b,(w-b.w)/2,0]];
        if(above) {
          const rise=n.accentGap?b.h+above.inkBottom+mathConstant('OverbarVerticalGap',c,0.1):b.h+Math.max(mathConstant('UpperLimitBaselineRiseMin',c,0.111),mathConstant('UpperLimitGapMin',c,0.2)+above.d);
          items.push([above,(w-above.w)/2+dx,-rise]);
        }
        if(below) {
          const drop=n.accentGap?b.d-below.inkTop+mathConstant('UnderbarVerticalGap',c,0.1):b.d+Math.max(mathConstant('LowerLimitBaselineDropMin',c,0.6),mathConstant('LowerLimitGapMin',c,0.167)+below.h);
          items.push([below,(w-below.w)/2+dx,drop]);
        }
        return mathCompose(items,w,{class:n.unspaced?'ord':n.class || b.class});
      };
      if(paired) {
        // Each half carries the opposite label as a phantom. Even an empty phantom retains its limit gap.
        const right=kind==='rightleftharpoons',phantom=b=>({...b || mathBox(),svg:''}),dy=0.22*MATH_FONT.xHeight/MATH_FONT.units*s,
          top=stack(mathStretch(right?'⇀':'↼',target,c,true,false,true),over,phantom(under),(right?-1:1)*1.5/18*ss),
          bottom=stack(mathStretch(right?'↽':'⇁',target,c,true,false,true),phantom(over),under,(right?1:-1)*1.5/18*ss);
        return mathCompose([[top,0,-dy],[bottom,top.w-bottom.w,dy]],top.w,{class:'rel'});
      }
      let b;
      if(/^hook/.test(kind)) {
        // The small Latin Modern hook owns five mu; joining it to the shaft removes three mu.
        const right=kind==='hookrightarrow',arrow=mathStretch(right?'→':'←',target-2/18*s,c,true,false,true),hook=mathGlyphIndex(MATH_FONT.arrowHook,c),width=arrow.w+2/18*s;
        if(right)b=mathCompose([[hook,0,0],[arrow,2/18*s,0]],width);
        else {
          const reflected=mathBox(5/18*s,hook.h,hook.d,'<g transform="translate('+mathNumber(5/18*s)+' 0) scale(-1 1)">'+hook.svg+'</g>');
          b=mathCompose([[arrow,0,0],[reflected,arrow.w-3/18*s,0]],width);
        }
      } else b=n.diagram && n.base.value==='='?mathCompose([[mathRule(target,0.04*s,-0.28*s),0,0],[mathRule(target,0.04*s,-0.04*s),0,0]],target):mathLayout(n.base,{...c,stretchTarget:target});
      return stack(b,over,under);
    }
    case 'phantom': {const b=mathLayout(n.body,c);return mathBox(n.mode==='v'?0:b.w,n.mode==='h'?0:b.h,n.mode==='h'?0:b.d);}
    case 'smash': {const b=mathLayout(n.body,c);return {...b,h:n.mode==='b'?b.h:0,d:n.mode==='t'?b.d:0,glyph:undefined,scriptBase:undefined};}
    // \vcenter centres its box on the maths axis.
    case 'raise': {const b=mathLayout(n.body,c),s=mathScale(c);return mathCompose([[b,0,n.center?(b.h-b.d)/2-mathConstant('AxisHeight',c,0.25):-n.amount*s]],b.w,{class:b.class,...(n.height===undefined?{}:{h:n.height*s}),...(n.depth===undefined?{}:{d:n.depth*s})});}
    case 'rule': {const s=mathScale(c);return mathRule(n.width*s,(n.height+n.depth)*s,-n.height*s);}
    case 'link': {const b=mathLayout(n.body,c);const url=new URL(n.href);if(!['http:','https:'].includes(url.protocol))throw Object.assign(new Error('Unsupported equation link'),{code:'unsafe-url'});b.svg='<a href="'+mathEscape(n.href)+'" aria-label="'+mathEscape(n.href)+'" tabindex="0" target="_blank" rel="noopener noreferrer">'+b.svg+'</a>';return b;}
    default: throw Object.assign(new Error('Unsupported math construct: '+n.type),{code:'unsupported-construct'});
  }
}

import {MATH_FONT} from './font.js';
import {mathChoice,mathTableDelimiters} from './parser.js';
import {mathStyledCodePoint} from './variants.js';
import {mathFallbackGlyph} from './fallbacks.js';
import {mathResponsiveLayout, mathHasMiddle} from './responsive.js';
export {mathNumber, mathScale, mathScreenStroke, mathConstant, mathBox, mathCompose, mathGlyphIndex, mathRule, mathStretch, mathEscape, mathScreenRelayout, mathSpace, mathRow, mathFraction, mathFenceBoxes, mathLayout, mathFontRatio, mathText};
