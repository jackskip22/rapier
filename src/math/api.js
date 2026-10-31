// SPDX-License-Identifier: MIT
function mathSvg(box,source,error,utf16,options={}) {
  if(box.svg.length>8*1024*1024)throw Object.assign(new Error('This formula produces too much SVG to render safely.'),{code:'resource-limit'});
  const pad=0.025,left=Math.min(0,box.left)-pad,right=Math.max(box.w,box.right)+pad;
  const width=Math.max(0.05,right-left),height=Math.max(0.025,box.h+pad,-box.inkTop+pad),depth=Math.max(0.025,box.d+pad,box.inkBottom+pad);
  const viewBox=[left*1000,-height*1000,width*1000,(height+depth)*1000];
  const opacity=options.screen?.dark ? .94 : 1;
  if (![width,height,depth,left,...viewBox].every(Number.isFinite)) throw new Error('Mathematical dimensions are not finite');
  const escapedSource=mathEscape(source);
  // A group exposes authored links to accessibility APIs; an image would hide them.
  const svg='<svg xmlns="http://www.w3.org/2000/svg" role="'+(box.svg.includes('<a ')?'group':'img')+'" aria-label="'+escapedSource+'"'+
    ' data-rapier-math="'+(options.displayMode?'display':'inline')+'" data-math-lines="'+(box.lines || 1)+'"'+
    ' data-math-natural-width="'+mathNumber(options.naturalWidth ?? width)+'"'+
    (options.screen?' data-math-screen="'+mathNumber(options.screen.fontSize)+'|'+mathNumber(options.screen.pixelRatio)+'|'+options.screen.dark+'"':'')+
    (options.maxWidth?' data-math-max-width="'+mathNumber(options.maxWidth)+'"':'')+
    (utf16?' data-tex-utf16="'+utf16+'"':'')+
    (error?.sourceOmitted?' data-math-source-omitted="true"':'')+
    (error?' data-math-error="'+mathEscape(error.code)+'"':'')+' width="'+mathNumber(width)+'em" height="'+mathNumber(height+depth)+'em"'+
    ' viewBox="'+viewBox.map(mathNumber).join(' ')+'"'+
    ' style="font-size:'+mathNumber(mathFontRatio)+'em;max-width:100%;height:auto;vertical-align:-'+mathNumber(depth)+'em;'+
    'fill-opacity:'+opacity+';stroke-opacity:'+opacity+'" fill="currentColor">'+
    '<title>'+escapedSource+'</title>'+(error?'<desc>'+mathEscape(error.message)+'</desc>':'')+
    '<g transform="scale(1000)">'+box.svg+'</g></svg>';
  if(svg.length>24*1024*1024)throw Object.assign(new Error('The complete formula markup exceeds its output budget.'),{code:'resource-limit'});
  return {svg,width,height,depth,lines:box.lines || 1,fitted:!!box.fitted,errors:error?[error]:[]};
}

function mathRenderPrepared(prepared,options={}) {
  const {text,safe,tree,error:parseError}=prepared;
  const context={size:1,level:0,variant:'normal',cramped:false,display:!!options?.displayMode,spans:!!options?.spans,cache:new WeakMap(),budget:{nodes:0,outlineBytes:0}};
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
    if(parseError)throw parseError;
    const natural=mathLayout(tree,context),limit=Number(options?.maxWidth);
    const maxWidth=Number.isFinite(limit) && limit>.1?limit:undefined;
    const box=maxWidth && mathInkWidth(natural)>maxWidth-.05?mathResponsiveLayout(tree,context,maxWidth-.05,natural):natural;
    return mathSvg(box,safe.alternative,undefined,safe.utf16,{displayMode:context.display,maxWidth,naturalWidth:mathInkWidth(natural)+.05,screen:context.screen});
  }
  catch (cause) {
    const error=mathDiagnostic(cause);
    // A diagnostic is visible, but remains distinct from a successfully typeset formula.
    // Diagnostics have an explicit bound. Exact input stays in the source alternative.
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

function renderMath(source,options={}) {
  return mathRenderPrepared(mathPrepare(source,options),options);
}
function mathRenderToString(source,options) { return renderMath(source,options).svg; }

import {mathDiagnostic, mathPrepare} from './source.js';
import {mathNumber, mathEscape, mathFontRatio, mathText, mathLayout} from './layout.js';
import {mathInkWidth, mathResponsiveLayout} from './responsive.js';
export {renderMath, mathRenderPrepared, mathRenderToString};
