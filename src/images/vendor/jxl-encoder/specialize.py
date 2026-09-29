#!/usr/bin/env python3
"""Materialize Rapier's fixed encoder configuration from the exact upstream crate.

Only the private WASM wrapper may use this derivative. Upstream's general API and
its nondefault-mode tests are not the derivative's contract.
"""
from pathlib import Path
import hashlib
import io
import json
import re
import shutil
import tarfile

ROOT = Path(__file__).resolve().parent
CRATE_SHA = '6b35e7490e338713507f9c533189a1a8ec5e3a0812563ebc6c9d0b05a062131d'
WRAPPER_SHA = '4e43575a0c7c7e69a713b36f7e1570afd205652583cce06bea817956d1955908'

def checked(path, expected):
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise SystemExit(f'{path.name} changed: review the fixed configuration before rebuilding')
    return data

archive = checked(ROOT / 'jixel-0.2.27.crate', CRATE_SHA)
checked(ROOT / 'src/lib.rs', WRAPPER_SHA)
target = ROOT / 'target/jixel'
if target.exists():
    shutil.rmtree(target)
target.parent.mkdir(exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(archive)) as source:
    source.extractall(target.parent, filter='data')
(target.parent / 'jixel-0.2.27').rename(target)
src = target / 'src'

def replace_file(name, changes):
    path = src / name
    text = path.read_text()
    for old, new, count in changes:
        if text.count(old) != count:
            raise SystemExit(f'{name}: unexpected count for {old}')
        text = text.replace(old, new)
    path.write_text(text)

# The wrapper changes only lossless and distance. Context speed never changes
# internally; Fast keeps the existing matrices and Dark AQ, including its boost.
for name, count in [('color_correlation.rs', 1), ('group.rs', 1),
                    ('encode_image.rs', 1), ('frame.rs', 21),
                    ('ac_strategy/selection.rs', 2)]:
    replace_file(name, [('ctx.speed', 'crate::Speed::Fast', count)])
replace_file('frame.rs', [('ctx.lossy_modular', 'crate::LossyModular::Off', 2)])

fixed = {
    'speed': ('crate::Speed::Fast', 9),
    'decoding_speed': ('crate::DecodingSpeed::Slow', 7),
    'lossy_modular': ('crate::LossyModular::Off', 1),
    'progressive': ('false', 5),
    'patches': ('false', 8),
    'progressive_passes': ('(None::<u32>)', 2),
    'progressive_shifts': ('(None::<Vec<u32>>)', 2),
    'icc_profile': ('(None::<Vec<u8>>)', 17),
    'exif': ('(None::<Vec<u8>>)', 17),
    'xmp': ('(None::<Vec<u8>>)', 17),
    'brotli_compression': ('(None::<Arc<dyn BrotliCompression>>)', 17),
    'orientation': ('Orientation::Normal', 17),
    'color_encoding': ('ColorEncoding::srgb()', 35),
    'intensity_target': ('(None::<f32>)', 14),
    'bits_per_sample': ('BitsPerSample::Eight', 3),
    'grayscale': ('false', 4),
    'num_threads': ('(1usize)', 18),
}
path = src / 'encode_image.rs'
text = path.read_text()
for field, (value, expected) in fixed.items():
    text, count = re.subn(r'\bconfig\.' + field + r'\b', value, text)
    if count != expected:
        raise SystemExit(f'Unexpected configuration field: {field}')
text = text.replace('encode_gain_map(config)?', 'None')
text = text.replace('config.gain_map.as_ref()', 'None')
path.write_text(text)
replace_file('encoding_context.rs', [
    ('let quantize_dc = group::selected_quantize_dc_methods();',
     'let speed = crate::Speed::Fast;\n        let quantize_dc = group::selected_quantize_dc_methods();', 1)
])
# wasm32-unknown-unknown has no spawned threads. Preserve the original sequential
# loops and their order; let the compiler remove the unreachable pool machinery.
replace_file('thread_pool.rs', [
    ('let num_threads = num_threads.max(1);', 'let num_threads = 1usize;', 1),
    ('self.num_threads', '(1usize)', 5),
])
digest = hashlib.sha256()
for path in sorted(src.rglob('*.rs')):
    digest.update(path.relative_to(src).as_posix().encode() + b'\0' + path.read_bytes())
print(json.dumps({'upstreamSha256': CRATE_SHA, 'sourceSha256': digest.hexdigest()}))
