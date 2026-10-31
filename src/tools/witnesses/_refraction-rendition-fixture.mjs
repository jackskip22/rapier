// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import * as paint from '../../draw/paint.mjs';
import * as drawCore from '../../draw/core.mjs';
import {_rapierDrawAdmitRecipe as admit, _rapierDrawBuildSVG as svg, RAPIER_DRAW_VERSION} from '../../draw/core.mjs';
import {encode as encodeJXL} from '../../images/jxl/v7/offline.mjs';
import {refractionRecipeKey} from '../../draw/refraction-rendition.mjs';

let renditionFixture;
export function refractionRenditionFixture() {
 return renditionFixture ||= (async () => {
  const width=4,height=3,data=new Uint8Array(width*height*4);
  for(let i=0;i<width*height;i++)data.set([(i*31)%256,(i*73)%256,(i*17)%256,64+(i%4)*63],i*4);
  const png='data:image/png;base64,'+Buffer.from(paint.encodePNG(data,width,height)).toString('base64');
  const jxl='data:image/jxl;base64,'+Buffer.from(await encodeJXL({width,height,data},{fidelity:'exact',effort:3})).toString('base64');
  const source=admit({version:RAPIER_DRAW_VERSION,canvas:{w:48,h:32},strokes:[],effect:drawCore.refractionPreset('prism'),shapes:[
   {id:'kept-paint',recognized:'paint',geom:{cx:12,cy:12,w:4,h:3},raster:png,paint:{px:[width,height],scale:1,brush:'ink'}},
   {id:'kept-vector',recognized:'rect',geom:{cx:28,cy:16,w:14,h:12},style:'solid',ink:'#123456',label:'editable source'}]});
  assert.ok(source);
  const row={scope:'canvas',key:refractionRecipeKey(source),width,height,view:{x:0,y:0,w:48,h:32},png,jxl};
  const recipe=admit({...source,renditions:[row]});assert.ok(recipe?.renditions?.length,'a valid lossless rendition must be admitted');
  return {source,recipe,row,svg:svg(recipe)};
 })();
}
