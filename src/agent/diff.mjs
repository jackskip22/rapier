/*! jsdiff 9.0.0 — derivative bundle. Upstream licence, reproduced complete:
		https://github.com/kpdecker/jsdiff/blob/v9.0.0/LICENSE

BSD 3-Clause License

Copyright (c) 2009-2015, Kevin Decker <kpdecker@gmail.com>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
	 list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
	 this list of conditions and the following disclaimer in the documentation
	 and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
	 contributors may be used to endorse or promote products derived from
	 this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
/* Rapier note on this derivative bundle: the wall clock and the scheduler are injected.
   `diffWithOptionsObj` reads `options.now()` instead of `Date.now()` and `options.schedule(fn,
   ms)` instead of `setTimeout(fn, ms)`. Callers that want a real-time `timeout` or the async
   callback path pass `{ now: Date.now, schedule: setTimeout }` (the Compare Worker in
   editor/engine.js); callers that want a deterministic result bound only by `maxEditLength` pass
   neither (the kernel), and the diff then depends on nothing but its two input strings. This keeps
   one diff factory for the whole app and keeps agent/kernel.mjs inside the decision-purity gate
   (tools/purity-gate.mjs) without any per-file exemption. */
export function createDiff(){var O=Object.defineProperty;var Y=Object.getOwnPropertyDescriptor;var B=Object.getOwnPropertyNames;var Q=Object.prototype.hasOwnProperty;var X=(i,e)=>{for(var n in e)O(i,n,{get:e[n],enumerable:!0})},Z=(i,e,n,t)=>{if(e&&typeof e=="object"||typeof e=="function")for(let l of B(e))!Q.call(i,l)&&l!==n&&O(i,l,{get:()=>e[l],enumerable:!(t=Y(e,l))||t.enumerable});return i};var K=i=>Z(O({},"__esModule",{value:!0}),i);var oe={};X(oe,{diffChars:()=>diffChars,diffLines:()=>y,diffWordsWithSpace:()=>z,structuredPatch:()=>U});var C=class{diff(e,n,t={}){let l;typeof t=="function"?(l=t,t={}):"callback"in t&&(l=t.callback);let o=this.castInput(e,t),r=this.castInput(n,t),u=this.removeEmpty(this.tokenize(o,t)),a=this.removeEmpty(this.tokenize(r,t));return this.diffWithOptionsObj(u,a,t,l)}diffWithOptionsObj(e,n,t,l){var o;let r=s=>{if(s=this.postProcess(s,t),l){t.schedule(function(){l(s)},0);return}else return s},u=n.length,a=e.length,f=1,c=u+a;t.maxEditLength!=null&&(c=Math.min(c,t.maxEditLength));let w=(o=t.timeout)!==null&&o!==void 0?o:1/0,p=(t.now?t.now():0)+w,m=[{oldPos:-1,lastComponent:void 0}],x=this.extractCommon(m[0],n,e,0,t);if(m[0].oldPos+1>=a&&x+1>=u)return r(this.buildValues(m[0].lastComponent,n,e));let v=-1/0,P=1/0,E=()=>{for(let s=Math.max(v,-f);s<=Math.min(P,f);s+=2){let d,h=m[s-1],g=m[s+1];h&&(m[s-1]=void 0);let F=!1;if(g){let q=g.oldPos-s;F=g&&0<=q&&q<u}let D=h&&h.oldPos+1<a;if(!F&&!D){m[s]=void 0;continue}if(!D||F&&h.oldPos<g.oldPos?d=this.addToPath(g,!0,!1,0,t):d=this.addToPath(h,!1,!0,1,t),x=this.extractCommon(d,n,e,s,t),d.oldPos+1>=a&&x+1>=u)return r(this.buildValues(d.lastComponent,n,e))||!0;m[s]=d,d.oldPos+1>=a&&(P=Math.min(P,s-1)),x+1>=u&&(v=Math.max(v,s+1))}f++};if(l)(function s(){t.schedule(function(){if(f>c||(t.now?t.now():0)>p)return l(void 0);E()||s()},0)})();else for(;f<=c&&(t.now?t.now():0)<=p;){let s=E();if(s)return s}}addToPath(e,n,t,l,o){let r=e.lastComponent;return r&&!o.oneChangePerToken&&r.added===n&&r.removed===t?{oldPos:e.oldPos+l,lastComponent:{count:r.count+1,added:n,removed:t,previousComponent:r.previousComponent}}:{oldPos:e.oldPos+l,lastComponent:{count:1,added:n,removed:t,previousComponent:r}}}extractCommon(e,n,t,l,o){let r=n.length,u=t.length,a=e.oldPos,f=a-l,c=0;for(;f+1<r&&a+1<u&&this.equals(t[a+1],n[f+1],o);)f++,a++,c++,o.oneChangePerToken&&(e.lastComponent={count:1,previousComponent:e.lastComponent,added:!1,removed:!1});return c&&!o.oneChangePerToken&&(e.lastComponent={count:c,previousComponent:e.lastComponent,added:!1,removed:!1}),e.oldPos=a,f}equals(e,n,t){return t.comparator?t.comparator(e,n):e===n||!!t.ignoreCase&&e.toLowerCase()===n.toLowerCase()}removeEmpty(e){let n=[];for(let t=0;t<e.length;t++)e[t]&&n.push(e[t]);return n}castInput(e,n){return e}tokenize(e,n){return Array.from(e)}join(e){return e.join("")}postProcess(e,n){return e}buildValues(e,n,t){let l=[],o;for(;e;)l.push(e),o=e.previousComponent,delete e.previousComponent,e=o;l.reverse();let r=l.length,u=0,a=0,f=0;for(;u<r;u++){let c=l[u];if(c.removed)c.value=this.join(t.slice(f,f+c.count)),f+=c.count;else{c.value=this.join(n.slice(a,a+c.count));a+=c.count,c.added||(f+=c.count)}}return l}};var I="a-zA-Z0-9_\\u{AD}\\u{C0}-\\u{D6}\\u{D8}-\\u{F6}\\u{F8}-\\u{2C6}\\u{2C8}-\\u{2D7}\\u{2DE}-\\u{2FF}\\u{1E00}-\\u{1EFF}";var R=class extends C{tokenize(e){let n=new RegExp(`(\\r?\\n)|[${I}]+|[^\\S\\n\\r]+|[^${I}]`,"ug");return e.match(n)||[]}},J=new R;function z(i,e,n){return J.diff(i,e,n)}var $=class extends C{constructor(){super(...arguments),this.tokenize=ie}equals(e,n,t){return t.ignoreWhitespace?((!t.newlineIsToken||!e.includes(`
`))&&(e=e.trim()),(!t.newlineIsToken||!n.includes(`
`))&&(n=n.trim())):t.ignoreNewlineAtEof&&!t.newlineIsToken&&(e.endsWith(`
`)&&(e=e.slice(0,-1)),n.endsWith(`
`)&&(n=n.slice(0,-1))),super.equals(e,n,t)}},V=new $;function y(i,e,n){return V.diff(i,e,n)}function ie(i,e){e.stripTrailingCr&&(i=i.replace(/\r\n/g,`
`));let n=[],t=i.split(/(\n|\r\n)/);t[t.length-1]||t.pop();for(let l=0;l<t.length;l++){let o=t[l];l%2&&!e.newlineIsToken?n[n.length-1]+=o:n.push(o)}return n}function U(i,e,n,t,l,o,r){let u;r?typeof r=="function"?u={callback:r}:u=r:u={},typeof u.context>"u"&&(u.context=4);let a=u.context;if(u.newlineIsToken)throw new Error("newlineIsToken may not be used with patch-generation functions, only with diffing functions");if(u.callback){let{callback:c}=u;y(n,t,Object.assign(Object.assign({},u),{callback:w=>{let p=f(w);c(p)}}))}else return f(y(n,t,u));function f(c){if(!c)return;c.push({value:"",lines:[]});function w(s){return s.map(function(d){return" "+d})}let p=[],m=0,x=0,v=[],P=1,E=1;for(let s=0;s<c.length;s++){let d=c[s],h=d.lines||le(d.value);if(d.lines=h,d.added||d.removed){if(!m){let g=c[s-1];m=P,x=E,g&&(v=a>0?w(g.lines.slice(-a)):[],m-=v.length,x-=v.length)}for(let g of h)v.push((d.added?"+":"-")+g);d.added?E+=h.length:P+=h.length}else{if(m)if(h.length<=a*2&&s<c.length-2)for(let g of w(h))v.push(g);else{let g=Math.min(h.length,a);for(let D of w(h.slice(0,g)))v.push(D);let F={oldStart:m,oldLines:P-m+g,newStart:x,newLines:E-x+g,lines:v};p.push(F),m=0,x=0,v=[]}P+=h.length,E+=h.length}}for(let s of p)for(let d=0;d<s.lines.length;d++)s.lines[d].endsWith(`
`)?s.lines[d]=s.lines[d].slice(0,-1):(s.lines.splice(d+1,0,"\\ No newline at end of file"),d++);return{oldFileName:i,newFileName:e,oldHeader:l,newHeader:o,hunks:p}}}function le(i){let e=i.endsWith(`
`),n=i.split(`
`).map(t=>t+`
`);return e?n.pop():n.push(n.pop().slice(0,-1)),n}function diffChars(before,after,options){return new C().diff(before,after,options)}return K(oe);}
export const {diffChars, diffLines, diffWordsWithSpace, structuredPatch} = createDiff();
