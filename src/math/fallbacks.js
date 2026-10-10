// SPDX-License-Identifier: MIT
// Compose missing mathematical symbols from this font's own outlines and rules.
function mathFallbackGlyph(value,c,extra={}) {
  if(!'ϝ▴▾◇◆ⓈℲ⅁╱╲⩞⪷⪸⫅⫆⋔◂▸⪵⪶⪹⪺⫋⫌⇠⇢⨋⎰⎱'.includes(value))return null;
  const s=mathScale(c),axis=mathConstant('AxisHeight',c,.25),line=mathConstant('FractionRuleThickness',c,.04),
    draw=(ch,factor=1)=>mathGlyphIndex(MATH_FONT.chars[ch.codePointAt(0)],{...c,size:c.size*factor}),
    centered=b=>mathCompose([[b,0,-axis-(b.inkTop+b.inkBottom)/2]],b.w,extra);
  const contour=(width,low,high,path,factor=1)=>{
    const size=s*factor,unit=size/MATH_FONT.units,stroke=mathScreenStroke({...c,size:c.size*factor}),radius=stroke/2;
    return mathBox(width*unit,high*unit+radius,Math.max(0,-low*unit+radius),
      '<path d="'+path+'" transform="scale('+mathNumber(unit)+' '+mathNumber(-unit)+')"'+
      (c.screen?' data-math-ink="'+mathNumber(size)+'"':'')+
      (stroke?' stroke="currentColor" stroke-width="'+mathNumber(stroke/unit)+'" stroke-linejoin="round" paint-order="stroke fill"':'')+'/>',
      {left:-radius,right:width*unit+radius,inkTop:-high*unit-radius,inkBottom:-low*unit+radius,...extra});
  };
  if(value==='ϝ') {
    const b=draw('𝑓'),g=MATH_FONT.glyphs[b.glyph],path=g[7],bars=[...path.matchAll(/H(\d+)/g)],
      start=bars[1],end=bars[2],cut=Number(path.slice(0,start.index).match(/-?\d+/g).at(-1)),
      left=Number(start[1]),right=Number(path.slice(start.index,end.index).match(/-?\d+/g).at(-2)),
      body='M'+left+' '+cut+path.slice(start.index+start[0].length,end.index)+'Z',unit=b.unitScale,
      barEnd=g[0],top=MATH_FONT.xHeight,thickness=top-cut,
      upper=contour(g[0],cut,top,'M'+left+' '+cut+'H'+barEnd+'V'+top+'H'+left+'Z'),
      middle=contour(g[0],170,170+thickness,'M'+(left-50)+' 170H'+(barEnd-45)+'V'+(170+thickness)+'H'+(left-50)+'Z');
    const stem={...b,h:cut*unit+b.stroke/2,inkTop:-cut*unit-b.stroke/2,right:Math.max(b.w,right*unit),
      svg:b.svg.replace('d="'+path+'"','d="'+body+'"'),glyph:undefined};
    return mathCompose([[stem,0,0],[upper,0,0],[middle,0,0]],b.w,{...extra,italic:0});
  }
  if('Ⅎ⅁'.includes(value)) {
    const b=draw(value==='Ⅎ'?'F':String.fromCodePoint(mathStyledCodePoint(71,'sans-serif'))),svg='<g transform="translate('+mathNumber(b.w)+' '+mathNumber(b.inkTop+b.inkBottom)+') scale(-1 -1)">'+b.svg+'</g>';
    return {...b,svg,left:b.w-b.right,right:b.w-b.left,accent:b.w/2,italic:0,glyph:undefined,...extra};
  }
  if(value==='Ⓢ') {
    const circle=draw('○'),letter=draw('S',.62),y=(circle.inkTop+circle.inkBottom-letter.inkTop-letter.inkBottom)/2;
    return mathCompose([[circle,0,0],[letter,(circle.w-letter.w)/2,y]],circle.w,extra);
  }
  if('▴▾◂▸'.includes(value))return centered(draw({'▴':'▲','▾':'▼','◂':'◀','▸':'▶'}[value],.8));
  if(value==='◇') {
    const diamond=draw('⋄'),square=draw('□'),factor=(square.inkBottom-square.inkTop)/(diamond.inkBottom-diamond.inkTop);
    return centered(draw('⋄',factor));
  }
  if(value==='◆') {
    const b=draw('◊'),path=MATH_FONT.glyphs[b.glyph][7],contours=path.match(/M[^M]+/g);
    const range=part=>{const numbers=part.match(/-?\d+(?:\.\d+)?/g).map(Number);return Math.max(...numbers)-Math.min(...numbers);};
    const outer=contours.reduce((a,b)=>range(a)>range(b)?a:b);
    return {...b,svg:b.svg.replace('d="'+path+'"','d="'+outer+'"'),glyph:undefined,...extra};
  }
  if(value==='╱'||value==='╲') {
    const t=MATH_FONT.constants.FractionRuleThickness/Math.SQRT2;
    const points=[[75,-75],[725,575],[725+t,575-t],[75+t,-75-t]];
    if(value==='╲')for(const point of points)point[0]=800-point[0];
    return contour(800,-75-t,575,'M'+points.map(point=>point.map(mathNumber).join(' ')).join('L')+'Z');
  }
  if(value==='⋔') {
    const b=draw('∩',.86),g=MATH_FONT.glyphs[b.glyph],x=(g[1]+g[3])/2,t=MATH_FONT.constants.FractionRuleThickness,
      stem=contour(g[0],g[2],g[4]+100,'M'+mathNumber(x-t/2)+' '+g[2]+'V'+(g[4]+100)+'H'+mathNumber(x+t/2)+'V'+g[2]+'Z',.86);
    return centered(mathCompose([[b,0,0],[stem,0,0]],b.w));
  }
  const relations={'⩞':['=','∧'],'⪷':['≺','≈'],'⪸':['≻','≈'],'⫅':['⊂','='],'⫆':['⊃','='],
    '⪵':['≺','=',1],'⪶':['≻','=',1],'⪹':['≺','≈',1],'⪺':['≻','≈',1],'⫋':['⊂','=',1],'⫌':['⊃','=',1]};
  if(relations[value]) {
    const [upper,lower,negated]=relations[value],a=draw(upper,.9),b=draw(lower,.85),gap=.065*s,
      width=Math.max(draw(upper).w,draw(lower).w),extent=a.inkBottom-a.inkTop+b.inkBottom-b.inkTop+gap,
      top=-axis-extent/2,ay=top-a.inkTop,by=top+a.inkBottom-a.inkTop+gap-b.inkTop,
      items=[[a,(width-a.w)/2,ay],[b,(width-b.w)/2,by]];
    if(negated) {
      const height=b.inkBottom-b.inkTop+.12*s,half=.13*s,thickness=line*Math.SQRT2/2,
        y=by+(b.inkTop+b.inkBottom)/2,x=width/2;
      const path='M'+[x-half,y+height/2].map(mathNumber).join(' ')+'L'+[x+half,y-height/2].map(mathNumber).join(' ')+
        'l'+[thickness,thickness].map(mathNumber).join(' ')+'L'+[x-half+thickness,y+height/2+thickness].map(mathNumber).join(' ')+'Z';
      items.push([mathBox(0,0,0,'<path d="'+path+'"/>',{left:x-half,right:x+half+thickness,inkTop:y-height/2,inkBottom:y+height/2+thickness}),0,0]);
    }
    return mathCompose(items,width,extra);
  }
  if(value==='⇠'||value==='⇢') {
    const right=value==='⇢',b=draw(right?'→':'←'),g=MATH_FONT.glyphs[b.glyph],unit=b.unitScale,
      width=Math.max(b.w,extra.stretchAxis==='horizontal'?extra.stretchTarget || 0:0),added=width-b.w,
      split=g[0]*(right?.65:.35);let command='',coordinate=0;
    const path=g[7].replace(/[MLHVCZ]|-?\d+(?:\.\d+)?/g,token=>{
      if(/[MLHVCZ]/.test(token)){command=token;coordinate=0;return token;}
      const isX=command!=='V'&&(command==='H'||coordinate%2===0);coordinate++;
      return isX?mathNumber(right?Math.max(split,Number(token)):Math.min(split,Number(token))):token;
    });
    const head={...b,svg:b.svg.replace('d="'+g[7]+'"','d="'+path+'"'),glyph:undefined},
      start=right?g[1]*unit:split*unit,end=right?split*unit+added:g[3]*unit+added,
      length=end-start,count=Math.max(2,Math.ceil(length/(.19*s)));
    if(count>2048)throw Object.assign(new Error('Mathematical arrow is too large'),{code:'resource-limit'});
    const dash=length/(count*1.7-.7),items=[[head,right?added:0,0]];
    for(let i=0;i<count;i++)items.push([mathRule(dash,line,-axis-line/2),start+i*dash*1.7,0]);
    return mathCompose(items,width,{stretchAxis:'horizontal',...extra});
  }
  if(value==='⨋') {
    const target=extra.stretchAxis==='vertical'?extra.stretchTarget:0,
      sum=target?mathStretch('∑',target,c):draw('∑'),integral=target?mathStretch('∫',target,c):draw('∫'),
      x=(sum.w-integral.w)/2,sy=-axis-(sum.inkTop+sum.inkBottom)/2,iy=-axis-(integral.inkTop+integral.inkBottom)/2;
    return mathCompose([[sum,0,sy],[integral,x,iy]],Math.max(sum.w,x+integral.w),{italic:integral.italic,extended:true,...extra});
  }
  if(value==='⎰'||value==='⎱') {
    const target=Math.max(s,extra.stretchAxis==='vertical'?extra.stretchTarget || 0:s),factor=Math.min(1,target/(1.5*s)),
      top=draw(value==='⎰'?'⎧':'⎫',factor),bottom=draw(value==='⎰'?'⎭':'⎩',factor),
      total=Math.max(target,top.h+bottom.h),gap=Math.max(0,total-top.h-bottom.h),width=top.w,
      ty=-axis-total/2-top.inkTop,by=ty+top.inkBottom+gap-bottom.inkTop,items=[[top,0,ty],[bottom,0,by]];
    if(gap>0) {
      const part=MATH_FONT.glyphs[MATH_FONT.chars['⎪'.codePointAt(0)]],unit=s*factor/MATH_FONT.units,
        overlap=Math.max(MATH_FONT.minConnectorOverlap,40),height=gap/unit+2*overlap,
        stem=contour(part[0],0,height,'M'+part[1]+' 0V'+mathNumber(height)+'H'+part[3]+'V0Z',factor);
      items.push([stem,0,ty+top.inkBottom+gap+overlap*unit]);
    }
    return mathCompose(items,width,{extended:true,...extra});
  }
  return null;
}
