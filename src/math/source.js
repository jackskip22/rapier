// SPDX-License-Identifier: MIT
// Source custody and bounded diagnostics shared by SVG and MathML.
function mathSourceUTF16(source) {
  // Four ASCII hex digits retain each original UTF-16 code unit across XML/HTML hosts.
  const encoded=[],parts=[];
  for(let i=0;i<source.length;i++) {
    parts.push(source.charCodeAt(i).toString(16).padStart(4,'0'));
    if(parts.length===1024) {encoded.push(parts.join(''));parts.length=0;}
  }
  encoded.push(parts.join(''));
  return encoded.join('');
}

function mathSourceAlternative(source) {
  const alternatives=[],parts=[];
  let first=-1,kept=0,hasCR=false;
  for(let i=0;i<source.length;i++) {
    const code=source.charCodeAt(i);
    if(code===13)hasCR=true;
    if(code>=0xd800 && code<=0xdbff && i+1<source.length) {
      const next=source.charCodeAt(i+1);
      if(next>=0xdc00 && next<=0xdfff) {i++;continue;}
    }
    if((code>=0x20 && code<=0xd7ff) || (code>=0xe000 && code<=0xfffd) || code===9 || code===10 || code===13)continue;
    if(first<0)first=i;
    if(i>kept)parts.push(source.slice(kept,i));
    parts.push('\\u'+code.toString(16).toUpperCase().padStart(4,'0'));kept=i+1;
    // Flatten small batches instead of retaining one rope node per bad code unit.
    if(parts.length>=1024) {alternatives.push(parts.join(''));parts.length=0;}
  }
  if(first<0)return {alternative:source,...(hasCR?{utf16:mathSourceUTF16(source)}:{})};
  parts.push(source.slice(kept));alternatives.push(parts.join(''));
  return {alternative:alternatives.join(''),utf16:mathSourceUTF16(source),error:{code:'invalid-source-character',offset:first,
    message:'A source character cannot be embedded in XML. The text alternative shows Unicode escapes; the UTF-16 carrier keeps the original source.'}};
}

function mathAdmitSource(text) {
  // Reject before scanning, escaping, parsing or constructing a source carrier.
  return text.length>1000000?{alternative:'Formula source omitted: source limit exceeded.',error:{
    code:'resource-limit',offset:0,sourceOmitted:true,
    message:'This formula is too long to render safely. Its source was not embedded; retain the original input.'
  }}:mathSourceAlternative(text);
}

function mathDiagnostic(cause) {
  const message=String(cause?.message ?? cause),code=cause?.code,rawCommand=cause?.command;
  const error={code:typeof code==='string'?code:'invalid-tex',message:message.length>1024?message.slice(0,1024).replace(/[\ud800-\udbff]$/,'')+'…':message,
    offset:Number.isFinite(cause?.offset)?cause.offset:0};
  if(message.length>1024 || cause?.messageTruncated)error.messageTruncated=true;
  if(cause?.sourceOmitted)error.sourceOmitted=true;
  const suggestion=cause?.suggestion ?? (cause?.code==='unsupported-command'?mathSuggest(cause.command):cause?.code==='unsupported-environment'?mathSuggest(cause.environment,true):undefined);
  if(suggestion)error.suggestion=suggestion;
  if(rawCommand!==undefined) {
    const command=String(rawCommand);
    error.command=command.slice(0,128).replace(/[\ud800-\udbff]$/,'');
    if(command.length>128 || cause.commandTruncated)error.commandTruncated=true;
  }
  return error;
}

function mathPrepare(source, options) {
  const text = String(source ?? ''), safe = mathAdmitSource(text);
  let tree, error = safe.error;
  if (!error) try { tree = parseMathTex(text); } catch (cause) {
    tree = options?.preview ? parseMathTexPreview(text, cause, options.caret ?? text.length) : null;
    if (!tree) { tree = undefined; error = mathDiagnostic(cause); }
  }
  return {text, safe, tree, error};
}

import {parseMathTex, parseMathTexPreview, mathSuggest} from './parser.js';
export {mathDiagnostic, mathPrepare, mathSourceUTF16};
