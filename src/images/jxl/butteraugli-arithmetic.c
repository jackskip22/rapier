// SPDX-License-Identifier: MIT AND BSD-3-Clause
/*!
 * Copyright (c) the JPEG XL Project Authors.
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 
 * 3. Neither the name of the copyright holder nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
// Butteraugli's model constants are from JPEG XL 0.12.0. This implementation evolves this repository's metric.
// Strict binary32 operation order matches the pinned AVX2 reference tool, including its five-tap scalar tails.
// Every plane and table belongs to the caller. No memory import is initialized when this module is instantiated.
#include <math.h>
#include <stdint.h>
#include "metric-float.h"
#define EXPORT(name) __attribute__((export_name(name)))
typedef struct {float *lf[3], *mf[3], *hf[2], *uhf[2];} Bands;
static Bands band_view(float *planes,int n){
  Bands b;
  for(int c=0;c<3;c++){b.lf[c]=planes+c*n;b.mf[c]=planes+(c+3)*n;}
  for(int c=0;c<2;c++){b.hf[c]=planes+(c+6)*n;b.uhf[c]=planes+(c+8)*n;}
  return b;
}
static int mirror(int i, int n) {while (i < 0 || i >= n) i = i < 0 ? -i - 1 : 2*n - 1 - i; return i;}

static float log_approx(float value) {
  union {float f; uint32_t u;} word = {.f=value};
  const int exponent = ((int32_t)(word.u - 0x3f2aaaab)) >> 23;
  word.u -= (uint32_t)exponent << 23;
  const float x = word.f - 1.f;
  float numerator = metric_fma(.74245873327820566f, x, 1.4287160470083755f);
  float denominator = metric_fma(.17409343003366853f, x, 1.0096718572241148f);
  numerator = metric_fma(numerator, x, -1.8503833400518310e-6f);
  denominator = metric_fma(denominator, x, .99032814277590719f);
  return numerator / denominator + exponent;
}
static float gamma_value(float value) {
  const float multiplier = 19.245013259874995f * .6931471805599453f;
  return metric_fma(multiplier, log_approx(__builtin_fmaxf(0, value) + 9.9710635769299145f), -23.16046239805755f);
}
static float mix(int c,float r,float g,float b){
  if(c==0)return metric_fma(.29956550340058319f,r,metric_fma(.63373087833825936f,g,metric_fma(.077705617820981968f,b,1.7557483643287353f)));
  if(c==1)return metric_fma(.22158691104574774f,r,metric_fma(.69391388044116142f,g,metric_fma(.0987313588422f,b,1.7557483643287353f)));
  return metric_fma(.02f,r,metric_fma(.02f,g,metric_fma(.20480129041026129f,b,12.226454707163354f)));
}

static float wide_sample(const float *input, int base, int step, int count, int x, int radius, const float *kernel, const float *scaled) {
  if (x < radius || x >= count-radius) {
    float sum=0, weight=0;
    for (int d=-radius;d<=radius;d++) if (x+d>=0 && x+d<count) {
      sum += input[base+(x+d)*step]*kernel[d+radius]; weight += kernel[d+radius];
    }
    return sum * (1.f/weight);
  }
  const int start = base+(x-radius)*step;
  float groups[4]={0,0,0,0};
  for (int d=0;d<radius;d++) {
    float pair=input[start+d*step]+input[start+(2*radius-d)*step];
    const float term=pair*scaled[d];
    if (d<4) groups[d]=term; else groups[d%4]+=term;
  }
  float out=input[base+x*step]*scaled[radius];
  for (int i=0;i<4 && i<radius;i++) out += groups[i];
  return out;
}
static float five_sample(const float *input, int base, int step, int count, int x, const float *weights) {
  float out=input[base+x*step]*weights[0];
  for (int d=1;d<=2;d++) {
    const float pair=input[base+mirror(x-d,count)*step]+input[base+mirror(x+d,count)*step];
    out=metric_fma(pair,weights[d],out);
  }
  return out;
}
// Gaussian table order: sigma 1.2, 7.15593339443, 3.22489901262, 1.56416327805 and 2.7.
// Each table is its unnormalized taps followed by its normalized left half and center.
static void blur(const float *input,int width,int height,int kind,float *out,float *temp,const float *gaussian){
  const int radius=kind==0?2:kind==1?16:kind==2?7:kind==3?3:6;
  const int offset=kind==0?0:kind==1?8:kind==2?58:kind==3?81:92;
  const float *kernel=gaussian+offset,*scaled=kernel+2*radius+1;
  if(radius==2){
    const float weights[3]={scaled[2],scaled[1],scaled[0]};
    for(int y=0;y<height;y++)for(int x=0;x<width;x++)temp[y*width+x]=five_sample(input,y*width,1,width,x,weights);
    for(int y=0;y<height;y++)for(int x=0;x<width;x++){
      if(width>=10 && x<(width/8)*8)out[y*width+x]=five_sample(temp,x,width,height,y,weights);
      else {
        // The pinned AVX2 tool uses a scalar 25-tap tail. Its narrow-image
        // path is outside the AVX2 target and does not contract the sum.
        float sum=0;
        for(int yy=-2;yy<=2;yy++)for(int xx=-2;xx<=2;xx++){
          const float term=input[mirror(y+yy,height)*width+mirror(x+xx,width)]*weights[xx<0?-xx:xx];
          const float weight=weights[yy<0?-yy:yy];
          sum=width<10?sum+term*weight:metric_fma(term,weight,sum);
        }
        out[y*width+x]=sum;
      }
    }
  } else {
    for(int y=0;y<height;y++)for(int x=0;x<width;x++)temp[y*width+x]=wide_sample(input,y*width,1,width,x,radius,kernel,scaled);
    for(int y=0;y<height;y++)for(int x=0;x<width;x++)out[y*width+x]=wide_sample(temp,x,width,height,y,radius,kernel,scaled);
  }
}
static void dynamics(const float *rgb,int width,int height,Bands output,float *temp,const float *gaussian){
  const int n=width*height;
  float **low=output.lf;
  for(int c=0;c<3;c++)blur(rgb+c*n,width,height,0,low[c],temp,gaussian);
  for(int i=0;i<n;i++){
    float adapted[3];
    for(int c=0;c<3;c++){
      float v=__builtin_fmaxf(mix(c,low[0][i]*80.f,low[1][i]*80.f,low[2][i]*80.f),(c==2?12.226454707163354f:1.7557483643287353f));
      v=__builtin_fmaxf(v,1e-4f);
      const float gain=__builtin_fmaxf(gamma_value(v)/v,1e-4f);
      adapted[c]=__builtin_fmaxf(mix(c,rgb[i]*80.f,rgb[n+i]*80.f,rgb[2*n+i]*80.f)*gain,(c==2?12.226454707163354f:1.7557483643287353f));
    }
    output.mf[0][i]=adapted[0]-adapted[1];output.mf[1][i]=adapted[0]+adapted[1];output.mf[2][i]=adapted[2];
  }
}
static float remove_range(float w,float x){return x>w?x-w:x< -w?x+w:0.f;}
static float amplify_range(float w,float x){return x>w?x+w:x< -w?x-w:x+x;}
static float clamp_range(float x,float limit){return x>=limit?metric_fma(x-limit,.724216145665f,limit):x< -limit?metric_fma(x+limit,.724216145665f,-limit):x;}
// Ten output planes and exactly two scratch planes. Output bands temporarily hold dead intermediates.
EXPORT("baMetricBands") void ba_metric_bands(int w,int h,const float *rgb,float *output,float *scratch,const float *gaussian){
  const int n=w*h;Bands b=band_view(output,n);dynamics(rgb,w,h,b,scratch,gaussian);
  for(int c=0;c<3;c++){
    blur(b.mf[c],w,h,1,b.lf[c],scratch,gaussian);
    for(int i=0;i<n;i++)b.mf[c][i]-=b.lf[c][i];
  }
  for(int i=0;i<n;i++){
    const float y=b.lf[1][i];
    b.lf[0][i]*=33.832837186260f;b.lf[1][i]*=14.458268100570f;
    b.lf[2][i]=metric_fma(-.362267051518f,y,b.lf[2][i])*49.87984651440f;
  }
  for(int c=0;c<3;c++){
    float *low=c<2?b.hf[c]:scratch+n;
    blur(b.mf[c],w,h,2,low,scratch,gaussian);
    for(int i=0;i<n;i++){
      if(c<2)b.uhf[c][i]=b.mf[c][i]-low[i];
      b.mf[c][i]=c==0?remove_range(.29f,low[i]):c==1?amplify_range(.1f,low[i]):low[i];
    }
  }
  for(int i=0;i<n;i++){
    const float y=b.uhf[1][i],scale=metric_fma(46.f/metric_fma(y,y,46.f),(float)(1.0-.653020556257),.653020556257f);
    b.uhf[0][i]*=scale;
  }
  for(int c=0;c<2;c++){
    blur(b.uhf[c],w,h,3,b.hf[c],scratch,gaussian);
    for(int i=0;i<n;i++){
      const float low=b.hf[c][i];
      if(!c){b.uhf[c][i]=remove_range(.04f,b.uhf[c][i]-low);b.hf[c][i]=remove_range(1.5f,low);}
      else {const float v=clamp_range(low,28.4691806922f);b.uhf[c][i]=clamp_range(b.uhf[c][i]-v,5.19175294647f)*2.69313763794f;b.hf[c][i]=amplify_range(.132f,v*2.155f);}
    }
  }
}
// Model line patterns from the repository Butteraugli implementation.
static inline float ba_edge(const float *p,int w,int h,int x,int y,int dx,int dy){int xx=x+dx,yy=y+dy;return xx>=0&&xx<w&&yy>=0&&yy<h?p[yy*w+xx]:0.f;}
static inline float malta_lf_inside(const float *p,int w,int h,int x,int y){
  float value=0,sum;
  sum=((p[0*w+-4]+p[0*w+-2])+(p[0*w+0]+(p[0*w+2]+p[0*w+4])));value=sum*sum;
  sum=((p[-4*w+0]+p[-2*w+0])+(p[0*w+0]+(p[2*w+0]+p[4*w+0])));value=metric_fma(sum,sum,value);
  sum=((p[-3*w+-3]+p[-2*w+-2])+(p[0*w+0]+(p[2*w+2]+p[3*w+3])));value=metric_fma(sum,sum,value);
  sum=((p[-3*w+3]+p[-2*w+2])+(p[0*w+0]+(p[2*w+-2]+p[3*w+-3])));value=metric_fma(sum,sum,value);
  sum=((p[-4*w+1]+p[-2*w+1])+(p[0*w+0]+(p[2*w+-1]+p[4*w+-1])));value=metric_fma(sum,sum,value);
  sum=((p[-4*w+-1]+p[-2*w+-1])+(p[0*w+0]+(p[2*w+1]+p[4*w+1])));value=metric_fma(sum,sum,value);
  sum=((p[-1*w+-4]+p[-1*w+-2])+(p[0*w+0]+(p[1*w+2]+p[1*w+4])));value=metric_fma(sum,sum,value);
  sum=((p[1*w+-4]+p[1*w+-2])+(p[0*w+0]+(p[-1*w+2]+p[-1*w+4])));value=metric_fma(sum,sum,value);
  sum=((p[-3*w+-2]+p[-2*w+-1])+(p[0*w+0]+(p[2*w+1]+p[3*w+2])));value=metric_fma(sum,sum,value);
  sum=((p[-3*w+2]+p[-2*w+1])+(p[0*w+0]+(p[2*w+-1]+p[3*w+-2])));value=metric_fma(sum,sum,value);
  sum=((p[-2*w+-3]+p[-1*w+-2])+(p[0*w+0]+(p[1*w+2]+p[2*w+3])));value=metric_fma(sum,sum,value);
  sum=((p[-2*w+3]+p[-1*w+2])+(p[0*w+0]+(p[1*w+-2]+p[2*w+-3])));value=metric_fma(sum,sum,value);
  sum=((p[2*w+-4]+p[1*w+-2])+(p[0*w+0]+(p[-1*w+2]+p[-2*w+4])));value=metric_fma(sum,sum,value);
  sum=((p[-2*w+-4]+p[-1*w+-2])+(p[0*w+0]+(p[1*w+2]+p[2*w+4])));value=metric_fma(sum,sum,value);
  sum=((p[-4*w+-2]+p[-2*w+-1])+(p[0*w+0]+(p[2*w+1]+p[4*w+2])));value=metric_fma(sum,sum,value);
  sum=((p[-4*w+2]+p[-2*w+1])+(p[0*w+0]+(p[2*w+-1]+p[4*w+-2])));value=metric_fma(sum,sum,value);
  return value;
}
static inline float malta_lf_edge(const float *p,int w,int h,int x,int y){
  float value=0,sum;
  sum=((ba_edge(p,w,h,x,y,-4,0)+ba_edge(p,w,h,x,y,-2,0))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,2,0)+ba_edge(p,w,h,x,y,4,0))));value=sum*sum;
  sum=((ba_edge(p,w,h,x,y,0,-4)+ba_edge(p,w,h,x,y,0,-2))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,0,2)+ba_edge(p,w,h,x,y,0,4))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,-3,-3)+ba_edge(p,w,h,x,y,-2,-2))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,2,2)+ba_edge(p,w,h,x,y,3,3))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,3,-3)+ba_edge(p,w,h,x,y,2,-2))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,-2,2)+ba_edge(p,w,h,x,y,-3,3))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,1,-4)+ba_edge(p,w,h,x,y,1,-2))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,-1,2)+ba_edge(p,w,h,x,y,-1,4))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,-1,-4)+ba_edge(p,w,h,x,y,-1,-2))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,1,2)+ba_edge(p,w,h,x,y,1,4))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,-4,-1)+ba_edge(p,w,h,x,y,-2,-1))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,2,1)+ba_edge(p,w,h,x,y,4,1))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,-4,1)+ba_edge(p,w,h,x,y,-2,1))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,2,-1)+ba_edge(p,w,h,x,y,4,-1))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,-2,-3)+ba_edge(p,w,h,x,y,-1,-2))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,1,2)+ba_edge(p,w,h,x,y,2,3))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,2,-3)+ba_edge(p,w,h,x,y,1,-2))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,-1,2)+ba_edge(p,w,h,x,y,-2,3))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,-3,-2)+ba_edge(p,w,h,x,y,-2,-1))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,2,1)+ba_edge(p,w,h,x,y,3,2))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,3,-2)+ba_edge(p,w,h,x,y,2,-1))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,-2,1)+ba_edge(p,w,h,x,y,-3,2))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,-4,2)+ba_edge(p,w,h,x,y,-2,1))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,2,-1)+ba_edge(p,w,h,x,y,4,-2))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,-4,-2)+ba_edge(p,w,h,x,y,-2,-1))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,2,1)+ba_edge(p,w,h,x,y,4,2))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,-2,-4)+ba_edge(p,w,h,x,y,-1,-2))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,1,2)+ba_edge(p,w,h,x,y,2,4))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,2,-4)+ba_edge(p,w,h,x,y,1,-2))+(ba_edge(p,w,h,x,y,0,0)+(ba_edge(p,w,h,x,y,-1,2)+ba_edge(p,w,h,x,y,-2,4))));value=metric_fma(sum,sum,value);
  return value;
}
static inline float malta_hf_inside(const float *p,int w,int h,int x,int y){
  float value=0,sum;
  sum=(((p[0*w+-4]+p[0*w+-3])+(p[0*w+-2]+p[0*w+-1]))+((p[0*w+0]+p[0*w+1])+(p[0*w+2]+p[0*w+3]))+p[0*w+4]);value=sum*sum;
  sum=(((p[-4*w+0]+p[-3*w+0])+(p[-2*w+0]+p[-1*w+0]))+((p[0*w+0]+p[1*w+0])+(p[2*w+0]+p[3*w+0]))+p[4*w+0]);value=metric_fma(sum,sum,value);
  sum=((p[-3*w+-3]+p[-2*w+-2])+(p[-1*w+-1]+((p[0*w+0]+p[1*w+1])+(p[2*w+2]+p[3*w+3]))));value=metric_fma(sum,sum,value);
  sum=((p[-3*w+3]+p[-2*w+2])+(p[-1*w+1]+((p[0*w+0]+p[1*w+-1])+(p[2*w+-2]+p[3*w+-3]))));value=metric_fma(sum,sum,value);
  sum=(((p[-4*w+1]+p[-3*w+1])+(p[-2*w+1]+p[-1*w+0]))+((p[0*w+0]+p[1*w+0])+(p[2*w+-1]+p[3*w+-1]))+p[4*w+-1]);value=metric_fma(sum,sum,value);
  sum=(((p[-4*w+-1]+p[-3*w+-1])+(p[-2*w+-1]+p[-1*w+0]))+((p[0*w+0]+p[1*w+0])+(p[2*w+1]+p[3*w+1]))+p[4*w+1]);value=metric_fma(sum,sum,value);
  sum=(((p[-1*w+-4]+p[-1*w+-3])+(p[-1*w+-2]+p[0*w+-1]))+((p[0*w+0]+p[0*w+1])+(p[1*w+2]+p[1*w+3]))+p[1*w+4]);value=metric_fma(sum,sum,value);
  sum=(((p[1*w+-4]+p[1*w+-3])+(p[1*w+-2]+p[0*w+-1]))+((p[0*w+0]+p[0*w+1])+(p[-1*w+2]+p[-1*w+3]))+p[-1*w+4]);value=metric_fma(sum,sum,value);
  sum=((p[-3*w+-2]+p[-2*w+-1])+(p[-1*w+-1]+((p[0*w+0]+p[1*w+1])+(p[2*w+1]+p[3*w+2]))));value=metric_fma(sum,sum,value);
  sum=((p[-3*w+2]+p[-2*w+1])+(p[-1*w+1]+((p[0*w+0]+p[1*w+-1])+(p[2*w+-1]+p[3*w+-2]))));value=metric_fma(sum,sum,value);
  sum=((p[-2*w+-3]+p[-1*w+-2])+(p[-1*w+-1]+((p[0*w+0]+p[1*w+1])+(p[1*w+2]+p[2*w+3]))));value=metric_fma(sum,sum,value);
  sum=((p[-2*w+3]+p[-1*w+2])+(p[-1*w+1]+((p[0*w+0]+p[1*w+-1])+(p[1*w+-2]+p[2*w+-3]))));value=metric_fma(sum,sum,value);
  sum=(((p[1*w+-4]+p[1*w+-3])+(p[1*w+-2]+p[0*w+-1]))+((p[0*w+0]+p[0*w+1])+(p[-1*w+2]+p[-1*w+3]))+p[-1*w+4]);value=metric_fma(sum,sum,value);
  sum=(((p[-1*w+-4]+p[-1*w+-3])+(p[-1*w+-2]+p[0*w+-1]))+((p[0*w+0]+p[0*w+1])+(p[1*w+2]+p[1*w+3]))+p[1*w+4]);value=metric_fma(sum,sum,value);
  sum=(((p[-4*w+-1]+p[-3*w+-1])+(p[-2*w+-1]+p[-1*w+0]))+((p[0*w+0]+p[1*w+0])+(p[2*w+1]+p[3*w+1]))+p[4*w+1]);value=metric_fma(sum,sum,value);
  sum=(((p[-4*w+1]+p[-3*w+1])+(p[-2*w+1]+p[-1*w+0]))+((p[0*w+0]+p[1*w+0])+(p[2*w+-1]+p[3*w+-1]))+p[4*w+-1]);value=metric_fma(sum,sum,value);
  return value;
}
static inline float malta_hf_edge(const float *p,int w,int h,int x,int y){
  float value=0,sum;
  sum=(((ba_edge(p,w,h,x,y,-4,0)+ba_edge(p,w,h,x,y,-3,0))+(ba_edge(p,w,h,x,y,-2,0)+ba_edge(p,w,h,x,y,-1,0)))+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,1,0))+(ba_edge(p,w,h,x,y,2,0)+ba_edge(p,w,h,x,y,3,0)))+ba_edge(p,w,h,x,y,4,0));value=sum*sum;
  sum=(((ba_edge(p,w,h,x,y,0,-4)+ba_edge(p,w,h,x,y,0,-3))+(ba_edge(p,w,h,x,y,0,-2)+ba_edge(p,w,h,x,y,0,-1)))+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,0,1))+(ba_edge(p,w,h,x,y,0,2)+ba_edge(p,w,h,x,y,0,3)))+ba_edge(p,w,h,x,y,0,4));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,-3,-3)+ba_edge(p,w,h,x,y,-2,-2))+(ba_edge(p,w,h,x,y,-1,-1)+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,1,1))+(ba_edge(p,w,h,x,y,2,2)+ba_edge(p,w,h,x,y,3,3)))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,3,-3)+ba_edge(p,w,h,x,y,2,-2))+(ba_edge(p,w,h,x,y,1,-1)+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,-1,1))+(ba_edge(p,w,h,x,y,-2,2)+ba_edge(p,w,h,x,y,-3,3)))));value=metric_fma(sum,sum,value);
  sum=(((ba_edge(p,w,h,x,y,1,-4)+ba_edge(p,w,h,x,y,1,-3))+(ba_edge(p,w,h,x,y,1,-2)+ba_edge(p,w,h,x,y,0,-1)))+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,0,1))+(ba_edge(p,w,h,x,y,-1,2)+ba_edge(p,w,h,x,y,-1,3)))+ba_edge(p,w,h,x,y,-1,4));value=metric_fma(sum,sum,value);
  sum=(((ba_edge(p,w,h,x,y,-1,-4)+ba_edge(p,w,h,x,y,-1,-3))+(ba_edge(p,w,h,x,y,-1,-2)+ba_edge(p,w,h,x,y,0,-1)))+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,0,1))+(ba_edge(p,w,h,x,y,1,2)+ba_edge(p,w,h,x,y,1,3)))+ba_edge(p,w,h,x,y,1,4));value=metric_fma(sum,sum,value);
  sum=(((ba_edge(p,w,h,x,y,-4,-1)+ba_edge(p,w,h,x,y,-3,-1))+(ba_edge(p,w,h,x,y,-2,-1)+ba_edge(p,w,h,x,y,-1,0)))+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,1,0))+(ba_edge(p,w,h,x,y,2,1)+ba_edge(p,w,h,x,y,3,1)))+ba_edge(p,w,h,x,y,4,1));value=metric_fma(sum,sum,value);
  sum=(((ba_edge(p,w,h,x,y,-4,1)+ba_edge(p,w,h,x,y,-3,1))+(ba_edge(p,w,h,x,y,-2,1)+ba_edge(p,w,h,x,y,-1,0)))+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,1,0))+(ba_edge(p,w,h,x,y,2,-1)+ba_edge(p,w,h,x,y,3,-1)))+ba_edge(p,w,h,x,y,4,-1));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,-2,-3)+ba_edge(p,w,h,x,y,-1,-2))+(ba_edge(p,w,h,x,y,-1,-1)+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,1,1))+(ba_edge(p,w,h,x,y,1,2)+ba_edge(p,w,h,x,y,2,3)))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,2,-3)+ba_edge(p,w,h,x,y,1,-2))+(ba_edge(p,w,h,x,y,1,-1)+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,-1,1))+(ba_edge(p,w,h,x,y,-1,2)+ba_edge(p,w,h,x,y,-2,3)))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,-3,-2)+ba_edge(p,w,h,x,y,-2,-1))+(ba_edge(p,w,h,x,y,-1,-1)+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,1,1))+(ba_edge(p,w,h,x,y,2,1)+ba_edge(p,w,h,x,y,3,2)))));value=metric_fma(sum,sum,value);
  sum=((ba_edge(p,w,h,x,y,3,-2)+ba_edge(p,w,h,x,y,2,-1))+(ba_edge(p,w,h,x,y,1,-1)+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,-1,1))+(ba_edge(p,w,h,x,y,-2,1)+ba_edge(p,w,h,x,y,-3,2)))));value=metric_fma(sum,sum,value);
  sum=(((ba_edge(p,w,h,x,y,-4,1)+ba_edge(p,w,h,x,y,-3,1))+(ba_edge(p,w,h,x,y,-2,1)+ba_edge(p,w,h,x,y,-1,0)))+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,1,0))+(ba_edge(p,w,h,x,y,2,-1)+ba_edge(p,w,h,x,y,3,-1)))+ba_edge(p,w,h,x,y,4,-1));value=metric_fma(sum,sum,value);
  sum=(((ba_edge(p,w,h,x,y,-4,-1)+ba_edge(p,w,h,x,y,-3,-1))+(ba_edge(p,w,h,x,y,-2,-1)+ba_edge(p,w,h,x,y,-1,0)))+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,1,0))+(ba_edge(p,w,h,x,y,2,1)+ba_edge(p,w,h,x,y,3,1)))+ba_edge(p,w,h,x,y,4,1));value=metric_fma(sum,sum,value);
  sum=(((ba_edge(p,w,h,x,y,-1,-4)+ba_edge(p,w,h,x,y,-1,-3))+(ba_edge(p,w,h,x,y,-1,-2)+ba_edge(p,w,h,x,y,0,-1)))+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,0,1))+(ba_edge(p,w,h,x,y,1,2)+ba_edge(p,w,h,x,y,1,3)))+ba_edge(p,w,h,x,y,1,4));value=metric_fma(sum,sum,value);
  sum=(((ba_edge(p,w,h,x,y,1,-4)+ba_edge(p,w,h,x,y,1,-3))+(ba_edge(p,w,h,x,y,1,-2)+ba_edge(p,w,h,x,y,0,-1)))+((ba_edge(p,w,h,x,y,0,0)+ba_edge(p,w,h,x,y,0,1))+(ba_edge(p,w,h,x,y,-1,2)+ba_edge(p,w,h,x,y,-1,3)))+ba_edge(p,w,h,x,y,-1,4));value=metric_fma(sum,sum,value);
  return value;
}
static void malta(const float *a,const float *b,int w,int h,double weight,double norm,int high,float *into,float *difference) {
  const int n=w*h;
  const double gain=high?.39905817637:.611612573796;
  const float primary=(float)(gain*__builtin_sqrt(.5*weight)/8.5*norm),secondary=(float)(gain*__builtin_sqrt((double).33f*weight)/8.5*norm);
  for(int i=0;i<n;i++){
    const float average=.5f*(__builtin_fabsf(a[i])+__builtin_fabsf(b[i]));
    const float den=(float)norm+average,scale=secondary/den;
    float d=(primary/den)*(a[i]-b[i]);
    const double lo=.55*__builtin_fabsf(a[i]),hi=1.05*__builtin_fabsf(a[i]);
    if(a[i]<0){if(b[i]>-lo)d=(float)(d-scale*(b[i]+lo));else if(b[i]<-hi)d=(float)(d+scale*(-b[i]-hi));}
    else {if(b[i]<lo)d=(float)(d+scale*(lo-b[i]));else if(b[i]>hi)d=(float)(d-scale*(b[i]-hi));}
    difference[i]=d;
  }
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
    const int inside=x>=4&&x<w-4&&y>=4&&y<h-4;
    const float *p=inside?difference+y*w+x:difference;
    const float energy=high?(inside?malta_hf_inside(p,w,h,x,y):malta_hf_edge(p,w,h,x,y))
      :(inside?malta_lf_inside(p,w,h,x,y):malta_lf_edge(p,w,h,x,y));
    into[y*w+x]+=energy;
  }
}
static void mask_input(Bands b,int w,int h,float *out,float *data,float *temp,const float *gaussian){
  const int n=w*h;const float bias=6.19424080439f*12.61050594197f,root=__builtin_sqrtf(bias);
  for(int i=0;i<n;i++){
    const float x=(b.uhf[0][i]+b.hf[0][i])*2.5f,y=metric_fma(b.uhf[1][i],.4f,b.hf[1][i]*.4f);
    const float magnitude=__builtin_sqrtf(metric_fma(x,x,y*y));data[i]=__builtin_sqrtf(metric_fma(6.19424080439f,__builtin_fabsf(magnitude),bias))-root;
  }
  blur(data,w,h,4,out,temp,gaussian);
}
static inline void erosion_visit(const float *data,int w,int h,int x,int y,float *low,float *mid,float *high){
  if(x<0||x>=w||y<0||y>=h)return;
  const float value=data[y*w+x];
  if(value<*high){if(value<*low){*high=*mid;*mid=*low;*low=value;}else if(value<*mid){*high=*mid;*mid=value;}else *high=value;}
}
static float erosion_sample(const float *data,int w,int h,int x,int y){
  float low=data[y*w+x],mid=2*low,high=mid;
  erosion_visit(data,w,h,x-3,y+0,&low,&mid,&high);
  erosion_visit(data,w,h,x-3,y-3,&low,&mid,&high);
  erosion_visit(data,w,h,x-3,y+3,&low,&mid,&high);
  erosion_visit(data,w,h,x+3,y+0,&low,&mid,&high);
  erosion_visit(data,w,h,x+3,y-3,&low,&mid,&high);
  erosion_visit(data,w,h,x+3,y+3,&low,&mid,&high);
  erosion_visit(data,w,h,x+0,y-3,&low,&mid,&high);
  erosion_visit(data,w,h,x+0,y+3,&low,&mid,&high);
  return metric_fma(.25f,high,metric_fma(.45f,low,.3f*mid));
}
static float mask_weight(float value,int dc){
  const float global=(float)(1.0/(17.83f*.79079917404f));
  const double multiplier=dc?.505054525019:2.5485944793,scale=dc?3.87449418804:.451936922203,offset=dc?.20025578522:.829591754942;
  const double v=global*(1.0+multiplier/fma(scale,value,offset));return (float)(v*v);
}
// Optional reference mask: blurred activity followed by AC and DC weights; two scratch planes.
EXPORT("baMetricMask") void ba_metric_mask(int w,int h,float *bands,float *scratch,float *out,const float *gaussian){
  const int n=w*h;mask_input(band_view(bands,n),w,h,out,scratch,scratch+n,gaussian);
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
    const int i=y*w+x;const float m=erosion_sample(out,w,h,x,y);
    out[n+i]=mask_weight(m,0);out[2*n+i]=mask_weight(m,1);
  }
}
// Exactly ten scratch planes; all scratch contents are overwritten before use.
EXPORT("baMetricDiff") void ba_metric_diff(int w,int h,float *reference,float *distorted,float *scratch,float *out,const float *gaussian,const float *cache){
  const int n=w*h;Bands a=band_view(reference,n),b=band_view(distorted,n);
  float *ac[3],*dc[3];for(int c=0;c<3;c++){ac[c]=scratch+c*n;dc[c]=scratch+(c+3)*n;}
  __builtin_memset(scratch,0,n*6*sizeof(float));
  float *difference=scratch+6*n;
  malta(a.uhf[1],b.uhf[1],w,h,1.10039032555,71.7800275169,1,ac[1],difference);
  malta(a.uhf[0],b.uhf[0],w,h,173.5,5.0,1,ac[0],difference);
  malta(a.hf[1],b.hf[1],w,h,18.7237414387,4498534.45232,0,ac[1],difference);
  malta(a.hf[0],b.hf[0],w,h,6923.99476109,8051.15833247,0,ac[0],difference);
  malta(a.mf[1],b.mf[1],w,h,37.0819870399,130262059.556,0,ac[1],difference);
  malta(a.mf[0],b.mf[0],w,h,8246.75321353,1009002.70582,0,ac[0],difference);
  for(int c=0;c<3;c++)for(int i=0;i<n;i++){
    if(c<2){
      const float x=a.hf[c][i],y=b.hf[c][i],d=x-y,lo=.4f*__builtin_fabsf(x),hi=__builtin_fabsf(x),weight=(float)((c?1.50815703118f:400.f)*.8);
      const float asymmetric=x<0?(y> -lo?y+lo:y< -hi?-y-hi:0):(y<lo?lo-y:y>hi?y-hi:0);
      ac[c][i]=metric_fma(weight,asymmetric*asymmetric,metric_fma(d*d,weight,ac[c][i]));
    }
    const float mid=a.mf[c][i]-b.mf[c][i],low=a.lf[c][i]-b.lf[c][i];
    ac[c][i]=metric_fma(mid*mid,(c==0?2150.f:c==1?10.6195433239f:16.2176043152f),ac[c][i]);dc[c][i]=(low*low)*(c==0?29.2353797994f:c==1?.844626970982f:.703646627719f);
  }
  float *m1=scratch+8*n,*temp=scratch+9*n;
  const float *m0=cache?cache:scratch+7*n;
  if(!cache)mask_input(a,w,h,(float *)m0,difference,temp,gaussian);
  mask_input(b,w,h,m1,difference,temp,gaussian);
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
    const int i=y*w+x;const float delta=m0[i]-m1[i];ac[1][i]=metric_fma(10.f*delta,delta,ac[1][i]);
    const float m=cache?0:erosion_sample(m0,w,h,x,y);
    const float wm=cache?cache[n+i]:mask_weight(m,0),wd=cache?cache[2*n+i]:mask_weight(m,1);
    const float high=metric_fma(ac[2][i],wm,metric_fma(ac[0][i],wm,ac[1][i]*wm));
    const float low=metric_fma(dc[2][i],wd,metric_fma(dc[0][i],wd,dc[1][i]*wd));
    out[i]=__builtin_sqrtf(low+high);
  }
}
EXPORT("baMetricDown") void ba_metric_down(int w,int h,const float *input,float *out){
  const int ww=(w+1)/2,hh=(h+1)/2,n=w*h,nn=ww*hh;__builtin_memset(out,0,nn*3*sizeof(float));
  for(int c=0;c<3;c++){
    for(int y=0;y<h;y++)for(int x=0;x<w;x++)out[c*nn+(y/2)*ww+x/2]+=.25f*input[c*n+y*w+x];
    if(w&1)for(int y=0;y<hh;y++)out[c*nn+y*ww+ww-1]*=2;
    if(h&1)for(int x=0;x<ww;x++)out[c*nn+(hh-1)*ww+x]*=2;
  }
}
EXPORT("baMetricMix") void ba_metric_mix(int w,int h,float *map,const float *sub){
  const int ww=(w+1)/2;
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
    const int i=y*w+x;map[i]=(float)(map[i]*.85);map[i]+=.5f*sub[(y/2)*ww+x/2];
  }
}
