#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Fit Water's absorbance coordinates and display quadrature from spectral data, and write draw/water-color.mjs.

A colour becomes a 38-band reflectance through the spectral.js primaries, and its absorbance -ln R is projected onto
seven coordinates. Absorbance is linear in concentration, so the coordinates add, advect and diffuse while mixing
stays subtractive. The display samples 16 bands of the reconstructed absorbance and weights their transmittance into
linear sRGB.

The coordinates are the leading vectors of the uncentred absorbance second moment over a midpoint grid of the sRGB
gamut. The display weights are fitted to the colour of the reconstructed spectrum integrated over all 38 bands
(CIE 1931 colour matching, then XYZ to linear sRGB): a least-squares fit in CIELAB, linearised at each target, so
pale and dark washes count by how far apart they look rather than by their linear light. Training covers the gamut
and the palette's masstones, alone and mixed in pairs, from pale washes to concentrated paint, over white and over the
darkest paper tint. White stays exactly white: the weights of each channel sum to one.
"""
import json
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = json.loads((ROOT / 'tools/data/spectral-js-2.0.2.json').read_text())['tables']
PRIMARY = np.array([SOURCE['SPD_' + channel] for channel in 'CMYRGB'])
RGB_WEIGHTS = np.array([SOURCE['CIE_CMF_' + channel] for channel in 'XYZ']).T @ np.array(SOURCE['XYZ_RGB']).T
BANDS = np.arange(2, 34, 2)
BASIS_GRID = 14
DISPLAY_GRID = 16
CONCENTRATIONS = [.05, .1, .2, .35, .5, .75, 1, 1.4, 2, 2.8, 4]
PALETTE_WEIGHT = 8
DARKEST_PAPER = '#b99872'

# sRGB D65 to XYZ, for the CIELAB used by the fit.
SRGB_XYZ = np.array([[.4124564, .3575761, .1804375], [.2126729, .7151522, .0721750], [.0193339, .1191920, .9503041]])
WHITE_XYZ = SRGB_XYZ.sum(axis=1)


def linear(srgb):
    srgb = np.asarray(srgb, float)
    return np.where(srgb < .04045, srgb / 12.92, ((srgb + .055) / 1.055) ** 2.4)


def absorbance(srgb):
    rgb = linear(srgb)
    white = np.min(rgb, axis=1)
    red, green, blue = (rgb - white[:, None]).T
    weights = np.column_stack((np.minimum(green, blue), np.minimum(red, blue), np.minimum(red, green),
                               np.maximum(0, np.minimum(red - blue, red - green)),
                               np.maximum(0, np.minimum(green - blue, green - red)),
                               np.maximum(0, np.minimum(blue - red, blue - green))))
    return -np.log(np.maximum(.0001, white[:, None] + weights @ PRIMARY))


def midpoint_grid(count):
    levels = (np.arange(count) + .5) / count
    return np.array(np.meshgrid(levels, levels, levels, indexing='ij')).reshape(3, -1).T


def cielab(rgb):
    xyz = np.clip(rgb, 0, 1) @ SRGB_XYZ.T / WHITE_XYZ
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.stack((116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])), -1)


def cielab_jacobian(rgb):
    step = 1e-5
    base = cielab(rgb)
    jacobian = np.zeros((len(rgb), 3, 3))
    for channel in range(3):
        moved = rgb.copy()
        moved[:, channel] += step
        jacobian[:, :, channel] = (cielab(moved) - base) / step
    return jacobian


PIGMENTS = json.loads((ROOT / 'tools/data/water-pigments.json').read_text())


def palette():
    """The masstone of every pigment but white, as sRGB in zero to one."""
    return [[int(row['masstone'][i:i + 2], 16) / 255 for i in (1, 3, 5)] for row in PIGMENTS['pigments'] if not row.get('white')]


# Coordinates: the uncentred absorbance second moment over the gamut, largest seven directions, signed so each
# vector's largest entry is positive.
spectra = absorbance(midpoint_grid(BASIS_GRID))
_, axes = np.linalg.eigh(spectra.T @ spectra)
basis = axes[:, -7:][:, ::-1].T
for vector in basis:
    if vector[np.argmax(np.abs(vector))] < 0:
        vector *= -1

# Training spectra: the gamut, then Rapier's palette alone and in pairs at a quarter, a half and three quarters.
paint = absorbance(np.array(palette()))
mixtures = [paint[i] for i in range(len(paint))]
for i in range(len(paint)):
    for j in range(i + 1, len(paint)):
        for share in (.25, .5, .75):
            mixtures.append(share * paint[i] + (1 - share) * paint[j])
training = np.vstack([absorbance(midpoint_grid(DISPLAY_GRID))] + [np.array(mixtures)] * PALETTE_WEIGHT)
reconstructed = training @ basis.T @ basis

papers = [np.ones(3), linear([int(DARKEST_PAPER[i:i + 2], 16) / 255 for i in (1, 3, 5)])]
normal = np.zeros((48, 48))
right = np.zeros(48)
for concentration in CONCENTRATIONS:
    absorbed = np.maximum(0, reconstructed * concentration)
    sampled = np.exp(-absorbed[:, BANDS])
    target = np.exp(-absorbed) @ RGB_WEIGHTS
    for paper in papers:
        # Residual in CIELAB, linearised at the target: J (paper * (sampled @ W) - paper * target).
        jacobian = cielab_jacobian(np.clip(target * paper, 1e-6, 1)) * paper[None, None, :]
        rows = np.einsum('nkc,nb->nkcb', jacobian, sampled).reshape(-1, 48)
        values = np.einsum('nkc,nc->nk', jacobian, target).ravel()
        normal += rows.T @ rows
        right += rows.T @ values
white = np.zeros((3, 48))
for channel in range(3):
    white[channel, channel * 16:(channel + 1) * 16] = 1
system = np.block([[normal, white.T], [white, np.zeros((3, 3))]])
display = np.linalg.solve(system, np.concatenate((right, np.ones(3))))[:48].reshape(3, 16).T


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
// The coordinates and display weights are Rapier's own fit, reproducible with tools/generate-water-color.py.
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
# ---- The palette -------------------------------------------------------------------------------------------------
# A pigment is an absorbance spectrum: bands and edges where it takes light, set by what paint makers and colour writers
# publish (a Colour Index name, where it absorbs, how it looks at full strength and in a thin wash). The spectrum is fitted
# through the same projection and display weights the engine uses, so a pigment shows on the sheet exactly as it was
# fitted. Mixing then follows from the spectra: a blue that leans green and a yellow that absorbs only the shortest light
# make a clean green; ultramarine, which lets red through, makes dull ones.
WAVELENGTHS = 380 + 10 * np.arange(38)
PAPER_WHITE = np.array([.96, .955, .94])
SWATCH = .55  # a swatch shows the pigment at about a half of its full strength: a dark one still shows its hue
# The engine keeps a stored pigment coordinate within 48 and clamps each one on its own, so a pigment past that loses its
# colour where it lies thick (a neon core). The fit keeps every coordinate near this, which leaves room for about
# one and a half times the masstone before any coordinate reaches the engine's bound.
COORDINATE_NEAR = 26
# A row may name its own limit. A neutral dark (a flat spectrum, its first coordinate the whole depth) needs more than this for a
# black that is black at the default dose; the engine's clamp can only cap a depth that is already black, never bend a colour,
# so the limit stays under the engine's 48.


def part_values(part):
    """A part's free numbers: amplitude, then the wavelengths that place it (none for a flat part)."""
    kind = part['kind']
    return [part['amp']] + ([] if kind == 'flat' else [part['centre']] + ([part['upper']] if kind == 'window' else []))


def shape(part, places):
    kind, width = part['kind'], part.get('width', 1)
    if kind == 'short':
        return 1 / (1 + np.exp(-(places[0] - WAVELENGTHS) / width))
    if kind == 'long':
        return 1 / (1 + np.exp(-(WAVELENGTHS - places[0]) / width))
    if kind == 'band':
        return np.exp(-.5 * ((WAVELENGTHS - places[0]) / width) ** 2)
    if kind == 'window':
        # Takes the light between two edges; what lies beyond the upper one gets through.
        return 1 / (1 + np.exp(-(WAVELENGTHS - places[0]) / width)) / (1 + np.exp((WAVELENGTHS - places[1]) / width))
    return np.ones(len(WAVELENGTHS))


def spectrum(parts, values):
    total = np.zeros(len(WAVELENGTHS))
    at = 0
    for part in parts:
        count = len(part_values(part))
        total += max(0.0, values[at]) * shape(part, values[at + 1:at + count])
        at += count
    return total


def coordinates(absorbed):
    return basis @ absorbed


def shown(coords, concentration, opacity):
    """Linear light on white paper: the engine's display of a pigment laid at this concentration."""
    absorbed = np.maximum(0, concentration * coords @ basis[:, BANDS])
    rgb = np.exp(-absorbed) @ display
    cover = 1 - np.exp(-2.2 * opacity * concentration)
    return (1 - cover) * rgb + cover * PAPER_WHITE


def hex_linear(colour):
    return linear([int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def to_hex(rgb):
    encoded = np.where(rgb <= .0031308, 12.92 * rgb, 1.055 * np.maximum(rgb, 0) ** (1 / 2.4) - .055)
    return '#' + ''.join('%02x' % int(round(255 * min(1, max(0, v)))) for v in encoded)


def lab(rgb):
    return cielab(np.clip(np.asarray(rgb, float), 1e-6, 1.5)[None, :])[0]


def levenberg(residuals, start, steps=150):
    values = np.array(start, float)
    damping = 1e-2
    current = residuals(values)
    cost = current @ current
    for _ in range(steps):
        jacobian = np.zeros((len(current), len(values)))
        for column in range(len(values)):
            moved = values.copy()
            moved[column] += 1e-3
            jacobian[:, column] = (residuals(moved) - current) / 1e-3
        normal = jacobian.T @ jacobian
        gradient = jacobian.T @ current
        for _ in range(12):
            step = np.linalg.solve(normal + damping * np.diag(np.diag(normal) + 1e-9), -gradient)
            trial = residuals(values + step)
            trial_cost = trial @ trial
            if trial_cost < cost:
                values, current, cost, damping = values + step, trial, trial_cost, max(damping / 3, 1e-9)
                break
            damping *= 4
        else:
            break
    return values, cost


def fit_pigment(row, seed=7):
    parts = row['spectrum']
    wash = PIGMENTS['wash']
    opacity = row['opacity']
    masstone, tint = lab(hex_linear(row['masstone'])), lab(hex_linear(row['tint']))
    base = np.array([v for part in parts for v in part_values(part)], float)
    is_amp = np.array([i == 0 for part in parts for i in range(len(part_values(part)))])

    def error(values, concentration, target):
        return lab(shown(coordinates(spectrum(parts, values)), concentration, opacity)) - target

    def cost(values):
        return np.linalg.norm(error(values, 1, masstone)) + .7 * np.linalg.norm(error(values, wash, tint))

    # A search around the published shape (amplitudes a third to three times, edges within thirty nanometres), then a
    # refinement that keeps the result near the best of them.
    generator = np.random.default_rng(seed)
    best = [(cost(base), base)]
    for _ in range(900):
        trial = base.copy()
        trial[is_amp] *= np.exp(generator.uniform(np.log(.33), np.log(3), is_amp.sum()))
        trial[~is_amp] += generator.uniform(-30, 30, (~is_amp).sum())
        best.append((cost(trial), trial))
    best.sort(key=lambda item: item[0])
    refined = []
    for _, start in best[:4]:
        def residuals(values, start=start):
            prior = np.where(is_amp, (values - start) / np.maximum(np.abs(start), .4), (values - start) / 30) * .25
            return np.concatenate((error(values, 1, masstone), .8 * error(values, wash, tint), prior))
        values, _ = levenberg(residuals, start)
        refined.append((cost(values), values))
    values = min(refined, key=lambda item: item[0])[1]
    shaped = coordinates(spectrum(parts, values))

    # The spectrum above cannot take every smooth shape the seven coordinates can. Its coordinates are the prior; the two
    # published appearances are matched exactly, and the reconstructed absorbance stays non-negative at every wavelength.
    def residuals(coords):
        reconstructed = coords @ basis
        return np.concatenate((error_at(coords, 1, masstone), .8 * error_at(coords, wash, tint),
                               .12 * (coords - shaped), 6 * np.maximum(0, -reconstructed),
                               1.5 * np.maximum(0, np.abs(coords) - row.get('limit', COORDINATE_NEAR))))

    def error_at(coords, concentration, target):
        return lab(shown(coords, concentration, opacity)) - target

    coords, _ = levenberg(residuals, shaped)
    return values, coords, shown(coords, 1, opacity), shown(coords, wash, opacity)


def delta(a, b):
    return float(np.linalg.norm(lab(a) - lab(b)))


rows = []
report = []
for row in PIGMENTS['pigments']:
    if row.get('white'):
        rows.append({**row, 'coefficients': [0, 0, 0, 0, 0, 0, 0, 1], 'swatch': row['masstone']})
        continue
    values, coords, full, thin = fit_pigment(row)
    rows.append({**row, 'coefficients': [float(format(v, '.6g')) for v in coords] + [float(row['opacity'])], 'swatch': to_hex(shown(coords, SWATCH, row['opacity'])), 'values': values})
    report.append((row['id'], delta(full, hex_linear(row['masstone'])), delta(thin, hex_linear(row['tint'])), to_hex(full), to_hex(thin)))

for name, dm, dt, a, b in report:
    print('%-20s masstone dE %5.2f  wash dE %5.2f  masstone %s  wash %s' % (name, dm, dt, a, b), file=sys.stderr)


def number(value):
    text = format(float(value), '.6g')
    return text[1:] if text.startswith('0.') else text.replace('-0.', '-.')


entries = []
for row in rows:
    entries.append(" {id:%s,name:%s,ci:%s,colour:%s,coefficients:[%s],granulation:%s,staining:%s}" % (
        json.dumps(row['id']), json.dumps(row['name']), json.dumps(row['ci']), json.dumps(row['swatch']),
        ','.join(number(v) for v in row['coefficients']), number(row['granulation']), number(row['staining'])))
(ROOT / 'draw/water-pigments.mjs').write_text(
    "// SPDX-License-Identifier: AGPL-3.0-only\n// Water's palette, written by tools/generate-water-color.py from tools/data/water-pigments.json. Do not edit.\n"
    "// One row a pigment: its Colour Index name, the colour of its swatch, seven absorbance coordinates and the opacity (the eighth),\n"
    "// how much it granulates and how much it stains.\nexport const WATER_PIGMENT_DATA = [\n" + ',\n'.join(entries) + '\n];\n')

print(json.dumps({'coefficients': 7, 'displayBands': len(BANDS), 'basisGrid': BASIS_GRID, 'displayGrid': DISPLAY_GRID,
                  'paletteColours': len(paint), 'pigments': len(rows), 'trainingConcentrations': CONCENTRATIONS,
                  'whiteLinear': display.sum(axis=0).tolist()}))
