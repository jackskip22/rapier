#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Fit the watercolor absorbance coordinates and display quadrature from spectral data."""
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = json.loads((ROOT / 'tools/data/spectral-js-2.0.2.json').read_text())['tables']
PRIMARY = np.array([SOURCE['SPD_' + channel] for channel in 'CMYRGB'])
RGB_WEIGHTS = np.array([SOURCE['CIE_CMF_' + channel] for channel in 'XYZ']).T @ np.array(SOURCE['XYZ_RGB']).T
BANDS = np.arange(2, 34, 2)

def absorbance(srgb):
    rgb = np.where(srgb < .04045, srgb / 12.92, ((srgb + .055) / 1.055) ** 2.4)
    white = np.min(rgb, axis=1)
    red, green, blue = (rgb - white[:, None]).T
    weights = np.column_stack((np.minimum(green, blue), np.minimum(red, blue), np.minimum(red, green),
                               np.maximum(0, np.minimum(red - blue, red - green)),
                               np.maximum(0, np.minimum(green - blue, green - red)),
                               np.maximum(0, np.minimum(blue - red, blue - green))))
    return -np.log(np.maximum(.0001, white[:, None] + weights @ PRIMARY))

# Midpoint cells avoid giving zero-width gamut faces disproportionate training weight.
levels = (np.arange(32) + .5) / 32
colors = np.array(np.meshgrid(levels, levels, levels, indexing='ij')).reshape(3, -1).T
spectra = absorbance(colors)
_, axes = np.linalg.eigh(spectra.T @ spectra)
basis = axes[:, -7:][:, ::-1].T
for vector in basis:
    if vector[np.argmax(np.abs(vector))] < 0:
        vector *= -1
compressed = spectra @ basis.T @ basis

# Fit samples from pale washes through concentrated paint. White is an exact constraint.
normal = np.zeros((16, 16))
right = np.zeros((16, 3))
for concentration in [.1, .25, .5, .75, 1, 1.5, 2, 3, 5]:
    transmittance = np.exp(-np.maximum(0, compressed * concentration))
    sample = transmittance[:, BANDS]
    target = transmittance @ RGB_WEIGHTS
    normal += sample.T @ sample
    right += sample.T @ target
system = np.zeros((17, 17))
system[:16, :16] = normal
system[16, :16] = system[:16, 16] = 1
display = np.linalg.solve(system, np.vstack((right, np.ones((1, 3)))))[:16]

def rounded(array):
    return np.vectorize(lambda number: float(format(number, '.9g')))(array).tolist()

def js(array):
    return json.dumps(rounded(np.asarray(array)), separators=(',', ':'))

def f32(value):
    text = format(float(value), '.9g')
    return text if '.' in text or 'e' in text else text + '.0'

reconstruction = []
for wavelength, weights in zip(BANDS, display):
    coordinate = basis[:, wavelength]
    first = ','.join(map(f32, coordinate[:4]))
    last = ','.join(map(f32, coordinate[4:]))
    weight = ','.join(map(f32, weights))
    reconstruction.append(f' rgb += exp(-max(dot(a,vec4<f32>({first}))+dot(b.xyz,vec3<f32>({last})),0.0))*vec3<f32>({weight});')

header = '''// SPDX-License-Identifier: AGPL-3.0-only
// Spectral primary data: MIT, copyright 2023 Ronald van Wijnen.
// The numerical fit is reproducible with tools/generate-water-color.py.
'''
source = header + 'const PRIMARY = ' + js(PRIMARY.T) + ';\n'
source += 'const BASIS = ' + js(basis) + ';\n'
source += 'const BANDS = ' + json.dumps(BANDS.tolist(), separators=(',', ':')) + ';\n'
source += 'const DISPLAY = ' + js(display) + ';\n'
source += '''
const linearChannel = x => x < .04045 ? x/12.92 : Math.pow((x+.055)/1.055,2.4);
export const WHITE = new Float32Array([0,0,0,0,0,0,0,1]);

export function encodeRgb(srgb) {
 if(!srgb||srgb.length!==3||!Array.from(srgb).every(x=>Number.isFinite(x)&&x>=0&&x<=1))throw new RangeError('Expected three sRGB values between zero and one');
 const rgb=Array.from(srgb,linearChannel),white=Math.min(...rgb),[r,g,b]=rgb.map(x=>x-white);
 const weight=[Math.min(g,b),Math.min(r,b),Math.min(r,g),Math.max(0,Math.min(r-b,r-g)),Math.max(0,Math.min(g-b,g-r)),Math.max(0,Math.min(b-r,b-g))];
 const absorption=PRIMARY.map(row=>-Math.log(Math.max(.0001,row.reduce((sum,value,j)=>sum+value*weight[j],white))));
 const pigment=new Float32Array(8);
 for(let coordinate=0;coordinate<7;coordinate++)pigment[coordinate]=BASIS[coordinate].reduce((sum,value,i)=>sum+value*absorption[i],0);
 return pigment;
}

export function encodeHex(hex) {
 if(typeof hex!=='string'||!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex))throw new RangeError('Expected an RGB hexadecimal color');
 const digits=hex.length===4?Array.from(hex.slice(1),x=>x+x).join(''):hex.slice(1);
 return encodeRgb([0,2,4].map(i=>parseInt(digits.slice(i,i+2),16)/255));
}

export function toLinear(pigment) {
 const rgb=[0,0,0];
 for(let sample=0;sample<BANDS.length;sample++){
  let absorption=0;
  for(let coordinate=0;coordinate<7;coordinate++)absorption+=pigment[coordinate]*BASIS[coordinate][BANDS[sample]];
  const light=Math.exp(-Math.max(0,absorption));
  for(let channel=0;channel<3;channel++)rgb[channel]+=light*DISPLAY[sample][channel];
 }
 return rgb;
}

export const COLOR_WGSL = `
fn waterColor(a:vec4<f32>,b:vec4<f32>)->vec3<f32>{
 var rgb=vec3<f32>(0.0);
'''
source += '\n'.join(reconstruction) + '\n return rgb;\n}\n`;\n'
(ROOT / 'draw/water-color.mjs').write_text(source)
print(json.dumps({'coefficients': 7, 'displayBands': 16, 'trainingColors': len(colors),
                  'trainingConcentrations': [.1, .25, .5, .75, 1, 1.5, 2, 3, 5],
                  'whiteLinear': display.sum(axis=0).tolist()}))
