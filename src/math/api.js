// SPDX-License-Identifier: MIT
function mathSvg(box,source,error,utf16,options={}) {
  if(box.svg.length>8*1024*1024)throw Object.assign(new Error('This formula produces too much SVG to render safely.'),{code:'resource-limit'});
  const pad=0.025,left=Math.min(0,box.left)-pad,right=Math.max(box.w,box.right)+pad;
  const width=Math.max(0.05,right-left),height=Math.max(0.025,box.h+pad,-box.inkTop+pad),depth=Math.max(0.025,box.d+pad,box.inkBottom+pad);
  const viewBox=[left*1000,-height*1000,width*1000,(height+depth)*1000];
  const opacity=options.screen?.dark ? .94 : 1;
  if (![width,height,depth,left,...viewBox].every(Number.isFinite)) throw new Error('Mathematical dimensions are not finite');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+mathEscape(source)+'"'+
    ' data-rapier-math="'+(options.displayMode?'display':'inline')+'" data-math-lines="'+(box.lines || 1)+'"'+
    ' data-math-natural-width="'+mathNumber(options.naturalWidth ?? width)+'"'+
    (options.screen?' data-math-screen="'+mathNumber(options.screen.fontSize)+'|'+mathNumber(options.screen.pixelRatio)+'|'+options.screen.dark+'"':'')+
    (options.maxWidth?' data-math-max-width="'+mathNumber(options.maxWidth)+'"':'')+
    (utf16?' data-tex-utf16="'+utf16+'"':'')+
    (error?' data-math-error="'+mathEscape(error.code)+'"':'')+' width="'+mathNumber(width)+'em" height="'+mathNumber(height+depth)+'em"'+
    ' viewBox="'+viewBox.map(mathNumber).join(' ')+'"'+
    ' style="font-size:'+mathNumber(mathFontRatio)+'em;max-width:100%;height:auto;vertical-align:-'+mathNumber(depth)+'em;'+
    'fill-opacity:'+opacity+';stroke-opacity:'+opacity+'" fill="currentColor">'+
    '<title>'+mathEscape(source)+'</title>'+(error?'<desc>'+mathEscape(error.message)+'</desc>':'')+
    '<g transform="scale(1000)">'+box.svg+'</g></svg>';
  return {svg,width,height,depth,lines:box.lines || 1,fitted:!!box.fitted,errors:error?[error]:[]};
}

function mathSourceAlternative(source) {
  let alternative='',first=-1,kept=0;
  for(let i=0;i<source.length;i++) {
    const code=source.charCodeAt(i);
    if(code>=0xd800 && code<=0xdbff && i+1<source.length) {
      const next=source.charCodeAt(i+1);
      if(next>=0xdc00 && next<=0xdfff) {i++;continue;}
    }
    if((code>=0x20 && code<=0xd7ff) || (code>=0xe000 && code<=0xfffd) || code===9 || code===10 || code===13)continue;
    if(first<0)first=i;
    alternative+=source.slice(kept,i)+'\\u'+code.toString(16).toUpperCase().padStart(4,'0');kept=i+1;
  }
  if(first<0)return {alternative:source};
  alternative+=source.slice(kept);
  // Only malformed XML text needs a separate carrier; each four hex digits keep one original code unit.
  let utf16='';
  for(let i=0;i<source.length;i++)utf16+=source.charCodeAt(i).toString(16).padStart(4,'0');
  return {alternative,utf16,error:{code:'invalid-source-character',offset:first,
    message:'A source character cannot be embedded in SVG. The text alternative shows Unicode escapes; data-tex-utf16 keeps the original source.'}};
}

function renderMath(source,options={}) {
  const text=String(source ?? ''),safe=mathSourceAlternative(text),context={size:1,level:0,variant:'normal',cramped:false,display:!!options?.displayMode,cache:new WeakMap(),budget:{nodes:0,outlineBytes:0}};
  try {
    if(safe.error)throw safe.error;
    if(options?.screen!==undefined) {
      const {fontSize,pixelRatio,dark}=options.screen || {},scaled=Number.isFinite(fontSize)?fontSize*mathFontRatio:NaN;
      if(!Number.isFinite(fontSize) || fontSize<=0 || !Number.isFinite(pixelRatio) || pixelRatio<=0 ||
        typeof dark!=='boolean' || !Number.isFinite(scaled) || scaled<=0 || !Number.isFinite(scaled*pixelRatio) || scaled*pixelRatio<=0 ||
        !Number.isFinite(1/scaled) || !Number.isFinite(1/pixelRatio) || !Number.isFinite(1/(scaled*pixelRatio)))
        throw Object.assign(new Error('Screen font size, pixel ratio and device scale must be positive and finite; dark must be a boolean.'),{code:'invalid-screen'});
      context.screen={fontSize:scaled,pixelRatio,dark};
    }
    const tree=parseMathTex(text),natural=mathLayout(tree,context),limit=Number(options?.maxWidth);
    const maxWidth=Number.isFinite(limit) && limit>.1?limit:undefined;
    const box=maxWidth && mathInkWidth(natural)>maxWidth-.05?mathResponsiveLayout(tree,context,maxWidth-.05,natural):natural;
    return mathSvg(box,safe.alternative,undefined,undefined,{displayMode:context.display,maxWidth,naturalWidth:mathInkWidth(natural)+.05,screen:context.screen});
  }
  catch (cause) {
    const error={code:cause.code || 'invalid-tex',message:String(cause.message || cause),offset:Number.isFinite(cause.offset)?cause.offset:0};
    if(cause.command)error.command=cause.command;
    // A diagnostic is visible, but remains distinct from a successfully typeset formula.
    // A hostile command can have a very long name. Keep its full diagnostic in desc/errors,
    // while the visible notice stays finite and can render after the formula exhausted its budget.
    const label=error.message.length>240?'This formula could not be rendered. The complete diagnostic is in its text description.':error.message.replace(/[^\x20-\x7e]/g,'?');
    const diagnostic={...context,variant:'roman',size:0.8,budget:{nodes:0,outlineBytes:0}};
    try {
      return mathSvg(mathText(label,diagnostic),safe.alternative,error,safe.utf16,{displayMode:context.display,screen:context.screen});
    } catch {
      diagnostic.screen=undefined;
      return mathSvg(mathText(label,diagnostic),safe.alternative,error,safe.utf16,{displayMode:context.display});
    }
  }
}

globalThis.RapierMath=Object.freeze({
  version:'1.0.0',
  parse:parseMathTex,
  render:renderMath,
  fit:mathFit,
  observe:mathObserve,
  renderToString(source,options) {return renderMath(source,options).svg;},
});
