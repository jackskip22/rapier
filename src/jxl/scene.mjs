// SPDX-License-Identifier: AGPL-3.0-only
// license is involved. draw(t) renders the view, whose camera turns with time (sky, sun, clouds,
const COMMON = `
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*0.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<6;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
vec3 world(vec3 d, float t){
  float lon=atan(d.x,-d.z), lat=asin(clamp(d.y,-1.0,1.0));
  vec3 sun=normalize(vec3(0.6,0.35,-0.7));
  vec3 sky=mix(vec3(0.85,0.9,1.0), vec3(0.18,0.36,0.75), clamp(lat*1.6,0.0,1.0));
  vec2 h=d.xz/max(length(d.xz),1e-4); float c=fbm(d.xz/(d.y+0.25)*1.4+vec2(t*0.02,0.0))*smoothstep(0.02,0.5,lat);
  sky=mix(sky, vec3(1.0), smoothstep(0.45,0.8,c)*0.85);
  sky+=vec3(1.0,0.9,0.6)*pow(max(dot(d,sun),0.0),400.0)*4.0;
  float ridge=0.08+0.12*fbm(h*2.0+vec2(1.7));
  if(lat<ridge && lat>-0.02){ float r=fbm(h*24.0+vec2(0.0,lat*24.0)); sky=mix(vec3(0.16,0.22,0.17),vec3(0.36,0.4,0.32),r)*(0.6+lat*3.0); }
  vec2 g=d.xz/max(-d.y,0.02), fw=max(fwidth(g),vec2(1e-5)), hw=min(vec2(0.015),fw), f=abs(fract(g+0.5)-0.5);
  if(lat<=-0.02){ vec2 l=1.0-smoothstep(hw,hw+fw,f); float line=max(l.x,l.y);
    vec3 floorc=mix(vec3(0.52,0.47,0.4),vec3(0.62,0.58,0.5),fbm(g*1.7)); sky=mix(floorc, vec3(0.1), line*0.8*clamp(-d.y*4.0,0.0,1.0)); }
  for(int i=0;i<6;i++){ vec2 q=abs(vec2(lon,lat)-vec2(-2.618+1.0472*float(i)+0.04*sin(t+float(i)),0.42))-vec2(0.16,0.07); float e=max(q.x,q.y);
    if(e<0.0) sky=mix(sky,vec3(1.0),0.85); if(abs(e)<0.004) sky=vec3(0.05); }
  return clamp(sky,0.0,1.0);
}`;
const GLSL_VIEW = `#version 300 es
precision highp float; uniform vec2 size; uniform float t; out vec4 o;
${COMMON}
void main(){ vec2 uv=(gl_FragCoord.xy/size)*2.0-1.0; uv.y=-uv.y; float a=t*0.15;
  vec3 d=normalize(vec3(uv.x, -uv.y*0.9+0.15, -1.3)); d=vec3(d.x*cos(a)-d.z*sin(a), d.y, d.x*sin(a)+d.z*cos(a));
  o=vec4(world(d,t),1.0); }`;
const GLSL_PANO = `#version 300 es
precision highp float; uniform vec2 size; uniform float t; out vec4 o;
${COMMON}
void main(){ vec2 p=gl_FragCoord.xy/size;
  float lon=(p.x-0.5)*6.2831853, lat=(0.5-(1.0-p.y))*3.1415926;
  vec3 d=vec3(cos(lat)*sin(lon), sin(lat), -cos(lat)*cos(lon)); o=vec4(world(d,t),1.0); }`;
const VERT = `#version 300 es
void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position=vec4(p*2.0-1.0,0.0,1.0); }`;


export function scene(canvas, kind = 'view') {
  const gl = canvas.getContext('webgl2', {antialias: false, preserveDrawingBuffer: true, alpha: false});
  if (!gl) return null;
  const sh = (type, text) => { const s = gl.createShader(type); gl.shaderSource(s, text); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, kind === 'view' ? GLSL_VIEW : GLSL_PANO));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) return null;
  const uSize = gl.getUniformLocation(prog, 'size'), uT = gl.getUniformLocation(prog, 't');
  return {gl,
    draw(t) {
      gl.viewport(0, 0, canvas.width, canvas.height); gl.useProgram(prog);
      gl.uniform2f(uSize, canvas.width, canvas.height); gl.uniform1f(uT, t); gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    async read() {
      const w = canvas.width, h = canvas.height, buffer = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer); gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
      try {
        while (gl.clientWaitSync(fence, 0, 0) === gl.TIMEOUT_EXPIRED) {
          if (gl.isContextLost()) return null;
          await new Promise(resolve => setTimeout(resolve, 4));
        }
        const rows = new Uint8Array(w * h * 4), out = new Uint8Array(rows.length);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rows);
        for (let y = 0; y < h; y++) out.set(rows.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
        return out;
      } finally { gl.deleteSync(fence); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.deleteBuffer(buffer); }
    },
    lost: () => gl.isContextLost(),
    release() { gl.getExtension('WEBGL_lose_context')?.loseContext(); }};
}

export async function enterPanorama(image) {
  const session = await navigator.xr.requestSession('immersive-vr'), layerCanvas = document.createElement('canvas');
  const gl = layerCanvas.getContext('webgl2', {xrCompatible: true});
  await session.updateRenderState({baseLayer: new XRWebGLLayer(session, gl)});
  const space = await session.requestReferenceSpace('local');
  const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); gl.generateMipmap(gl.TEXTURE_2D);
  image.close();
  const sh = (type, text) => { const s = gl.createShader(type); gl.shaderSource(s, text); gl.compileShader(s); return s; }, program = gl.createProgram();
  gl.attachShader(program, sh(gl.VERTEX_SHADER, '#version 300 es\nout vec2 p;void main(){vec2 v=vec2((gl_VertexID<<1)&2,gl_VertexID&2)*2.0-1.0;p=v;gl_Position=vec4(v,0,1);}'));
  gl.attachShader(program, sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;in vec2 p;uniform mat4 inv;uniform sampler2D pano;out vec4 o;void main(){vec4 d=inv*vec4(p,1,1);vec3 r=normalize(d.xyz/d.w);float lon=atan(r.x,-r.z),lat=asin(clamp(r.y,-1.0,1.0));o=texture(pano,vec2(lon/6.2831853+0.5,0.5-lat/3.1415926));}'));
  gl.linkProgram(program);
  const where = gl.getUniformLocation(program, 'inv');
  session.requestAnimationFrame(function draw(_, frame) {
    const pose = frame.getViewerPose(space), layer = session.renderState.baseLayer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer); gl.useProgram(program);
    if (pose) for (const view of pose.views) {
      const v = layer.getViewport(view); gl.viewport(v.x, v.y, v.width, v.height);
      const rotation = new DOMMatrix(Array.from(view.transform.inverse.matrix)); rotation.m41 = rotation.m42 = rotation.m43 = 0;
      const clip = new DOMMatrix(Array.from(view.projectionMatrix)).multiply(rotation);
      gl.uniformMatrix4fv(where, false, clip.inverse().toFloat32Array());
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    session.requestAnimationFrame(draw);
  });
  return session;
}
